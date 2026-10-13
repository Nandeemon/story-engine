/**
 * The conversation map: the same conversation as the script, drawn as boxes.
 *
 * The map is laid out automatically, top to bottom. Lines in a row share one card,
 * a choice or an "Only if" splits into columns, and the columns meet again below
 * where the paths continue together. Edits made here rewrite the script, so the
 * script and the map always show the same conversation.
 */
import { CONDITION_WORDS, FX_NORMAL, ENTER_EFFECTS, EXIT_EFFECTS, LINE_EFFECTS, SPOTS, placeText, snapToSpot, stepsBefore, conditionText, effectText, findRoomByName, getList, getStep, parseScript, splitPath, stepPathOf, summarize, toValue, valueText, walkSteps, writeScript } from '@story-engine/engine-core';
import { characterOf, findLook, hasLook, storyFactNames } from '@story-engine/engine-core';
import type { Character, ChoiceStep, CompareOp, Effect, Placement, Project, Room, SayStep, Step, StoryElement } from '@story-engine/engine-core';
import { EXPRESSIONS, applyToScene, esc, nextMoment, sayHTML, sceneHTML, startScene } from '@story-engine/runtime';
import type { Scene } from '@story-engine/runtime';
import { soundSelect } from './widgets';

export interface MapCtx {
  project: Project;
  room: Room;
  el: StoryElement;
  /** What is selected: a step path, "<path>#o<k>" for an answer, or "add:<list>:<index>". */
  sel: string | null;
}

/* ---------- Speakers and their looks ---------- */

/** Who a speaker name means: a placed element in this room, or one of the author's characters. */
export function speakerOf(project: Project, room: Room, who: string): { el?: StoryElement; character?: Character } {
  const key = who.trim().toLowerCase();
  if (!key) return {};
  const el = room.els.find(x => x.kind === 'char' && x.name.trim().toLowerCase() === key);
  const character = (el && characterOf(project, el)) ?? project.characters.find(c => c.name.trim().toLowerCase() === key);
  return { el, character };
}

/** True when a name is used for someone who is neither placed in this room nor one of the author's characters. */
export function unknownSpeaker(ctx: { project: Project; room: Room }, who: string): boolean {
  const key = who.trim().toLowerCase();
  if (!key) return false;
  return !ctx.room.els.some(e => e.kind === 'char' && e.name.trim().toLowerCase() === key)
    && !ctx.project.characters.some(c => c.name.trim().toLowerCase() === key)
    && !ctx.project.rooms.some(r => r.els.some(e => e.kind === 'char' && e.name.trim().toLowerCase() === key));
}

/** A line's look that the speaker does not have, or '' when the look is fine. */
export function missingLook(project: Project, room: Room, who: string, expr: string): string {
  if (!expr.trim()) return '';
  const { el, character } = speakerOf(project, room, who);
  if (character) return hasLook(character, expr) ? '' : expr;
  if (el && !el.img) return EXPRESSIONS.some(x => x === expr.toLowerCase()) || ['smile', 'happy'].includes(expr.toLowerCase()) ? '' : expr;
  return '';
}

/** A stage step in plain words, for the map. */
export function stageText(s: Step): string {
  const place = (at: Placement) => [at.x !== undefined ? `at ${placeText(at)}` : '', at.size !== undefined ? `size ${at.size}` : '', at.flip === true ? 'turned' : at.flip === false ? 'facing forward' : ''].filter(Boolean).join(', ');
  if (s.t === 'show') return `${s.who} comes in${s.look ? ` as ${s.look}` : ''}${place(s.at) ? `, ${place(s.at)}` : ''}${s.fx ? ` (${s.fx})` : ''}`;
  if (s.t === 'move') return `${s.who} moves${place(s.at) ? ` ${place(s.at).replace(/^at /, 'to ')}` : ''}`;
  if (s.t === 'hide') return `${s.who} leaves${s.fx ? ` (${s.fx})` : ''}`;
  return '';
}

/** The scene as it stands at a step: everything on the way there applied, in order. */
export function sceneAt(ctx: MapCtx, steps: Step[], path: string): Scene {
  const scene = startScene(ctx.room, ctx.el, steps);
  for (const st of stepsBefore(steps, path)) { applyToScene(scene, st, ctx.project); nextMoment(scene); }
  const here = getStep(steps, path);
  if (here) applyToScene(scene, here, ctx.project);
  for (const c of scene.chars) c.fx = '';
  return scene;
}

/** Everyone who can take part in a conversation here: the author's characters and figures in the room. */
function castNames(ctx: MapCtx): string[] {
  const names = new Map<string, string>();
  for (const c of ctx.project.characters) names.set(lower(c.name), c.name);
  for (const r of ctx.project.rooms) for (const e of r.els) if (e.kind === 'char') names.set(lower(e.name), e.name);
  return [...names.values()];
}

/* ---------- Drawing ---------- */

interface Model { edges: [string, string][]; jumps: [string, string][]; parts: Map<string, string> }
let model: Model = { edges: [], jumps: [], parts: new Map() };
let nextId = 0;

const lower = (s: string) => s.trim().toLowerCase();
const LINE_KINDS = new Set(['say', 'change', 'note', 'show', 'move', 'hide']);
const TERMINAL = new Set(['door', 'end', 'jump']);

export function startLabel(room: Room, el: StoryElement): string {
  const first = room.auto && (room.autoEl ? room.els.find(x => x.id === room.autoEl) : room.els.find(x => x.script.trim()));
  if (first === el) return `Starts as soon as the player enters ${room.name}${room.autoOnce ? ' for the first time' : ''}`;
  return el.kind === 'area' ? `Starts when the player clicks ${el.name} (an invisible area)` : `Starts when the player clicks ${el.name}`;
}

export function mapHTML(ctx: MapCtx): string {
  const { steps, errors } = parseScript(ctx.el.script);
  const readOnly = errors.length > 0;
  const jumped = new Set<string>();
  walkSteps(steps, s => { if (s.t === 'jump') jumped.add(lower(s.part)); });
  model = { edges: [], jumps: [], parts: new Map() };
  nextId = 0;
  const id = () => `mn${nextId++}`;
  const on = (key: string) => (ctx.sel === key ? ' on' : '');
  const pick = (key: string) => (readOnly ? '' : ` data-map-act="sel" data-k="${esc(key)}"`);
  const link = (from: string[], to: string) => from.forEach(f => model.edges.push([f, to]));

  const addButton = (list: string, index: number, label = '', kind: '' | 'wide' | 'join' = '') => {
    if (readOnly) return '';
    const key = `add:${list}:${index}`;
    if (kind === 'wide') return `<button class="madd wide" data-map-act="first-line" data-k="${key}">${label}</button>`;
    const title = kind === 'join' ? 'Add a step that every path reaches' : 'Add a step here';
    return `<button class="madd${kind ? ` ${kind}` : ''}${on(key)}" data-map-act="sel" data-k="${key}" aria-label="${title}" title="${title}">${label || '+'}</button>`;
  };

  const exprTag = (who: string, expr: string): string => {
    const look = speakerOf(ctx.project, ctx.room, who).character;
    const once = look && findLook(look, expr)?.once;
    if (missingLook(ctx.project, ctx.room, who, expr)) return `<span class="expr bad" title="${esc(who)} has no look called ${esc(expr)}; the base picture shows">${esc(expr)}?</span>`;
    return `<span class="expr">${once ? 'own picture' : esc(expr)}</span>`;
  };

  const row = (s: Step, path: string): string => {
    const attrs = `class="mrow k-${s.t}${on(path)}"${pick(path)}`;
    if (s.t === 'say') {
      const text = s.text === '...' ? '<em>Empty line</em>' : esc(s.text);
      return s.who
        ? `<button ${attrs}><span class="who${unknownSpeaker(ctx, s.who) ? ' voice" title="A voice without a picture: no character has this name' : ''}">${esc(s.who)}</span>${s.expr ? exprTag(s.who, s.expr) : ''}<span class="txt">${text}</span></button>`
        : `<button ${attrs}><span class="txt narr">${text}</span></button>`;
    }
    if (s.t === 'change') return `<button ${attrs}><span class="tag">Change</span><span class="txt">${esc(s.effects.map(effectText).join(', '))}</span></button>`;
    if (s.t === 'note') return `<button ${attrs}><span class="tag">Note</span><span class="txt">${esc(s.text)}</span></button>`;
    if (s.t === 'show' || s.t === 'move' || s.t === 'hide') {
      const bad = unknownSpeaker(ctx, s.who) ? ' bad" title="No character has this name. If this is narration, write Narration: in front of it in the script.' : '';
      return `<button ${attrs}><span class="tag">Stage</span><span class="txt${bad}">${esc(stageText(s))}</span></button>`;
    }
    return '';
  };

  function flow(list: Step[], lp: string, entries: string[], reachable: boolean, top: boolean): { html: string; exits: string[] } {
    let html = top && !list.length ? addButton(lp, 0, '+ Add the first line', 'wide') : addButton(lp, 0);
    let ents = entries;
    let reach = reachable;
    let i = 0;
    while (i < list.length) {
      let join = '';
      const s = list[i];
      const path = stepPathOf(lp, i);
      if (s.t === 'part') reach = ents.length > 0 || jumped.has(lower(s.name));
      else if (!ents.length && reach) {
        reach = false;
        html += '<div class="mnever">Never reached. Every path above ends before this.</div>';
      }
      const dim = reach ? '' : ' dim';
      const nid = id();

      if (LINE_KINDS.has(s.t)) {
        let j = i;
        let rows = '';
        while (j < list.length && LINE_KINDS.has(list[j].t)) { rows += row(list[j], stepPathOf(lp, j)); j++; }
        html += `<div class="mnode mcard${dim}" id="${nid}">${rows}</div>`;
        link(ents, nid);
        ents = [nid];
        i = j;
      } else if (s.t === 'choice') {
        html += `<button class="mnode ask${dim}${on(path)}" id="${nid}"${pick(path)}>The player chooses</button><div class="msplit">`;
        link(ents, nid);
        const exits: string[] = [];
        s.options.forEach((o, k) => {
          const hid = id(), key = `${path}#o${k}`;
          const fx = o.effects.length ? `<span class="fx">${esc(o.effects.map(effectText).join(', '))}</span>` : '';
          model.edges.push([nid, hid]);
          const sub = flow(o.steps, `${path}.o${k}`, [hid], reach, false);
          exits.push(...sub.exits);
          html += `<div class="mbranch"><button class="mnode answer${dim}${on(key)}" id="${hid}"${pick(key)}><span class="q">${o.text === '...' ? '<em>Empty answer</em>' : esc(o.text)}</span>${fx}</button><div class="mflow">${sub.html}</div></div>`;
        });
        if (!readOnly) html += `<div class="mbranch ghost"><button class="mnode answer add" data-map-act="add-answer" data-k="${path}">+ Answer</button></div>`;
        html += '</div>';
        ents = exits;
        if (exits.length > 1) join = '+ After every answer';
        i++;
      } else if (s.t === 'if') {
        html += `<button class="mnode cond${dim}${on(path)}" id="${nid}"${pick(path)}><span class="tag">Only if</span>${esc(conditionText(s.cond))}</button><div class="msplit">`;
        link(ents, nid);
        const exits: string[] = [];
        for (const [branch, label, cls] of [['t', 'Yes', 'yes'], ['e', 'Otherwise', 'no']] as const) {
          const hid = id();
          model.edges.push([nid, hid]);
          const sub = flow(branch === 't' ? s.then : s.else, `${path}.${branch}`, [hid], reach, false);
          exits.push(...sub.exits);
          html += `<div class="mbranch"><div class="mnode head ${cls}${dim}" id="${hid}">${label}</div><div class="mflow">${sub.html}</div></div>`;
        }
        html += '</div>';
        ents = exits;
        if (exits.length > 1) join = '+ After both paths';
        i++;
      } else if (s.t === 'part') {
        html += `<button class="mnode part${dim}${on(path)}" id="${nid}"${pick(path)}><span class="tag">Part</span>${esc(s.name)}</button>`;
        model.parts.set(lower(s.name), nid);
        link(ents, nid);
        ents = [nid];
        i++;
      } else {
        const broken = s.t === 'door' && !findRoomByName(ctx.project, s.room);
        const label = s.t === 'door' ? `<span class="tag">Go to</span>${esc(s.room)}${broken ? '<span class="why">There is no room with this name</span>' : ''}`
          : s.t === 'jump' ? `<span class="tag">Go to part</span>${esc(s.part)}`
          : 'End';
        html += `<button class="mnode cap ${s.t}${broken ? ' broken' : ''}${dim}${on(path)}" id="${nid}"${pick(path)}>${label}</button>`;
        if (s.t === 'jump') model.jumps.push([nid, lower(s.part)]);
        link(ents, nid);
        ents = [];
        i++;
      }
      if (TERMINAL.has(s.t) && !top) continue;
      html += join ? addButton(lp, i, join, 'join') : addButton(lp, i);
    }
    if (top && ents.length && list.length) {
      const nid = id();
      html += `<div class="mnode cap end ghost" id="${nid}">The conversation ends</div>`;
      link(ents, nid);
      ents = [];
    }
    return { html, exits: ents };
  }

  const startId = id();
  const body = flow(steps, '', [startId], true, true);
  const banner = readOnly
    ? `<div class="mbanner">Line ${errors[0].n} of the script needs fixing before the map can be changed: ${esc(errors[0].msg)} <button class="btn small" data-act="convo-mode" data-k="script">Open the script</button></div>`
    : '';
  const zoomBar = `<div class="mzoom" role="group" aria-label="Zoom">
    <button class="btn small quiet" data-map-view="out" aria-label="Zoom out" title="Zoom out">−</button>
    <button class="btn small quiet" data-map-view="reset" id="mzoomlabel" title="Show at actual size">${Math.round(zoom * 100)}%</button>
    <button class="btn small quiet" data-map-view="in" aria-label="Zoom in" title="Zoom in">+</button>
    <button class="btn small quiet" data-map-view="fit" title="Fit the whole conversation in view">Fit</button></div>`;
  return `${banner}<div class="mview">${zoomBar}<div class="mscroll" id="mscroll"><div class="msizer" id="msizer"><div class="mcanvas" id="mcanvas"><svg class="medges" id="medges" aria-hidden="true"></svg>
    <div class="mflow top"><div class="mnode start" id="${startId}">${esc(startLabel(ctx.room, ctx.el))}</div>${body.html}</div></div></div></div></div>`;
}

/* ---------- Zoom and pan ---------- */

let zoom = 1;
const MIN_ZOOM = 0.15, MAX_ZOOM = 1.5;

/** Sizes the scroll area to the zoomed canvas. Call after the map is in the page. */
export function applyZoom(): void {
  const canvas = document.getElementById('mcanvas'), sizer = document.getElementById('msizer');
  if (!canvas || !sizer) return;
  canvas.style.transform = zoom === 1 ? '' : `scale(${zoom})`;
  sizer.style.width = `${canvas.offsetWidth * zoom}px`;
  sizer.style.height = `${canvas.offsetHeight * zoom}px`;
  const label = document.getElementById('mzoomlabel');
  if (label) label.textContent = `${Math.round(zoom * 100)}%`;
}

/** Changes the zoom and keeps the middle of the view where it was. */
export function setZoom(next: number): void {
  const sc = document.getElementById('mscroll');
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 100) / 100));
  if (!sc) { zoom = z; return; }
  const cx = (sc.scrollLeft + sc.clientWidth / 2) / zoom, cy = (sc.scrollTop + sc.clientHeight / 2) / zoom;
  zoom = z;
  applyZoom();
  sc.scrollLeft = cx * zoom - sc.clientWidth / 2;
  sc.scrollTop = cy * zoom - sc.clientHeight / 2;
}

export function mapView(kind: string): void {
  if (kind === 'in') setZoom(zoom * 1.2);
  else if (kind === 'out') setZoom(zoom / 1.2);
  else if (kind === 'reset') setZoom(1);
  else if (kind === 'fit') {
    const sc = document.getElementById('mscroll'), canvas = document.getElementById('mcanvas');
    if (!sc || !canvas) return;
    setZoom(Math.min(1, (sc.clientWidth - 16) / canvas.offsetWidth, (sc.clientHeight - 16) / canvas.offsetHeight));
    sc.scrollLeft = Math.max(0, (sc.scrollWidth - sc.clientWidth) / 2);
    sc.scrollTop = 0;
  }
}

/**
 * First look at a conversation: everything at full size when it fits; otherwise
 * shrink it down to 60% at most and put the start in the middle of the view.
 */
export function openView(): void {
  const sc = document.getElementById('mscroll'), canvas = document.getElementById('mcanvas');
  const start = canvas?.querySelector<HTMLElement>('.mnode.start');
  if (!sc || !canvas || !start) return;
  zoom = Math.min(1, Math.max(0.6, (sc.clientWidth - 8) / canvas.offsetWidth));
  applyZoom();
  const centre = (start.offsetLeft + start.offsetWidth / 2 + (start.offsetParent as HTMLElement).offsetLeft) * zoom;
  sc.scrollLeft = centre - sc.clientWidth / 2;
  sc.scrollTop = 0;
}

/** Draws the connecting lines once the boxes are laid out. */
export function drawEdges(): void {
  const canvas = document.getElementById('mcanvas');
  const svg = document.getElementById('medges');
  if (!canvas || !svg) return;
  const base = canvas.getBoundingClientRect();
  // Measured on screen, then divided by the zoom so lines are drawn in the canvas's own units.
  const box = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const l = (r.left - base.left) / zoom, t = (r.top - base.top) / zoom, w = r.width / zoom, h = r.height / zoom;
    return { l, r: l + w, t, b: t + h, cx: l + w / 2, cy: t + h / 2 };
  };
  let paths = '';
  for (const [from, to] of model.edges) {
    const a = box(from), b = box(to);
    if (!a || !b) continue;
    const mid = b.t - 12;
    const d = Math.abs(a.cx - b.cx) < 1 ? `M${a.cx} ${a.b}V${b.t}` : `M${a.cx} ${a.b}V${mid}H${b.cx}V${b.t}`;
    paths += `<path d="${d}" marker-end="url(#m-arrow)"/>`;
  }
  let right = 0;
  canvas.querySelectorAll<HTMLElement>('.mnode').forEach(n => { right = Math.max(right, (n.getBoundingClientRect().right - base.left) / zoom); });
  model.jumps.forEach(([from, part], k) => {
    const a = box(from), target = model.parts.get(part), b = target ? box(target) : null;
    if (!a || !b) return;
    const x = right + 24 + k * 12;
    const hot = document.getElementById(from)?.classList.contains('on') || (target && document.getElementById(target)?.classList.contains('on'));
    paths += `<path class="jump${hot ? ' hot' : ''}" d="M${a.r} ${a.cy}H${x}V${b.cy}H${b.r + 2}" marker-end="url(#m-jump)"/>`;
  });
  svg.setAttribute('width', String(canvas.offsetWidth));
  svg.setAttribute('height', String(canvas.offsetHeight));
  svg.innerHTML = `<defs><marker id="m-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="head"/></marker><marker id="m-jump" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="jhead"/></marker></defs>${paths}`;
}

/* ---------- The scene above the map ---------- */

/**
 * The stage as it stands at the selected step, big enough to work in: everyone
 * on stage can be dragged, and where they are dropped holds from that step on.
 */
export function mapScene(ctx: MapCtx, open: boolean): string {
  const { steps, errors } = parseScript(ctx.el.script);
  if (errors.length) return '';
  const sel = ctx.sel ?? '';
  let path = sel.startsWith('add:') ? '' : sel.split('#o')[0];
  if (path && !getStep(steps, path)) path = '';
  const step = path ? getStep(steps, path) : undefined;
  const scene = path ? sceneAt(ctx, steps, path) : startScene(ctx.room, ctx.el, steps);
  const say = step?.t === 'say' ? step : undefined;
  const game = say ? sayHTML(say.who, say.text === '...' ? '' : say.text, false) : '';
  const where = !step ? (sel.startsWith('add:') ? 'Pick a step to see the scene there.' : 'As the conversation starts.')
    : say ? (say.who ? `At ${esc(say.who)}'s line.` : 'At this line of narration.') : `At this step: ${esc(stepLabel(step))}.`;
  const on = scene.chars.filter(c => c.visible).length;
  const head = `<div class="msceneh"><b>Scene</b><span class="hint">${where}${step && on ? ' Drag anyone to place them from here on.' : ''}</span><button class="btn small quiet" data-act="scene-toggle">${open ? 'Hide' : 'Show the scene'}</button></div>`;
  if (!open) return `<div class="mscene closed">${head}</div>`;
  return `<div class="mscene">${head}<div class="mpreview big">${sceneHTML(ctx.project, ctx.room, scene, ctx.project.look, game, { draggable: !!step, focus: say?.who })}</div></div>`;
}

function stepLabel(s: Step): string {
  switch (s.t) {
    case 'show': case 'move': case 'hide': return stageText(s);
    case 'choice': return 'the player chooses';
    case 'if': return `only if ${conditionText(s.cond)}`;
    case 'change': return `change ${s.effects.map(effectText).join(', ')}`;
    case 'door': return `go to ${s.room}`;
    case 'end': return 'the end';
    case 'part': return `part ${s.name}`;
    case 'jump': return `go to part ${s.part}`;
    case 'note': return 'a note';
    default: return '';
  }
}

/* ---------- Side panel ---------- */

function allFacts(p: Project): string[] {
  return storyFactNames(p);
}

const opLabel: Record<Effect['op'], string> = { '+': 'add', '-': 'take away', '=': 'set to' };

function effectRows(effects: Effect[]): string {
  const rows = effects.map((e, i) => `<div class="mfx">
      <input type="text" list="m-facts" id="m-fact-${i}" data-map-in="eff-fact" data-k="${i}" value="${esc(e.fact)}" aria-label="Story fact">
      <select id="m-op-${i}" data-map-in="eff-op" data-k="${i}" aria-label="How it changes">${(['+', '-', '='] as const).map(op => `<option value="${op}"${op === e.op ? ' selected' : ''}>${opLabel[op]}</option>`).join('')}</select>
      <input type="text" id="m-val-${i}" data-map-in="eff-val" data-k="${i}" value="${esc(valueText(e.value))}" aria-label="Amount or value">
      <button class="btn small quiet" data-map-act="eff-remove" data-k="${i}" aria-label="Remove this change">×</button></div>`).join('');
  return `<div class="field"><span>Changes to story facts</span>${rows || '<p class="hint">None yet.</p>'}<button class="btn small quiet" data-map-act="eff-add">+ Add a change</button></div>`;
}


const spotButtons = (act: string, x: number | undefined) => `<div class="spots" role="group" aria-label="Place">${SPOTS.map(([name, sx]) =>
  `<button class="btn small${x === sx ? ' ink' : ' quiet'}" data-map-act="${act}" data-k="${sx}" title="${name}" aria-pressed="${x === sx}">${name}</button>`).join('')}</div>`;

/** Controls for the speaker's place on stage at this line, and who else is on stage. */
const FX_HELP: Record<string, string> = {
  shake: 'Shakes from side to side, for shock or anger',
  tremble: 'A light, quick vibration, for fear or cold',
  pulse: 'A quick heartbeat, for a moment that lands',
  pop: 'Pops up for an instant, for surprise or joy',
  bounce: 'Bounces, for cheer',
  jump: 'Jumps up once, for a start',
  flash: 'Lights up for an instant'
};

/** The line's effect on the speaker, with how strong, fast and often it plays, and the line's sound. */
function fxField(ctx: MapCtx, step: SayStep): string {
  const fx = step.fx ?? '';
  const o = step.fxOpts ?? {};
  const slider = (key: 'strength' | 'speed' | 'times', label: string, lo: string, hi: string, max: number) => `<label class="field fxs"><span>${label}</span>
      <input type="range" id="m-fx-${key}" data-map-in="say-fx-${key}" min="1" max="${max}" step="1" value="${o[key] ?? FX_NORMAL[key]}"><span class="fxends"><i>${lo}</i><i>${hi}</i></span></label>`;
  const effect = step.who ? `<label class="field"><span>Effect on ${esc(step.who)}</span><select id="m-sfx" data-map-in="say-fx"><option value="">None</option>${LINE_EFFECTS.map(f => `<option value="${f}"${f === fx ? ' selected' : ''}>${f} · ${FX_HELP[f] ?? ''}</option>`).join('')}</select></label>
    ${fx ? `<div class="fxgrid">${slider('strength', 'Strength', 'gentle', 'strong', 5)}${slider('speed', 'Speed', 'slow', 'fast', 5)}${slider('times', 'Times', '1', '5', 5)}</div>
      <button class="btn small quiet" data-act="fx-try">Play it again</button>` : ''}` : '';
  const who = speakerOf(ctx.project, ctx.room, step.who).character;
  const mine = who ? (ctx.project.sounds ?? []).filter(x => x.owner === who.id) : [];
  const quick = mine.length ? `<div class="quick">${mine.map(x => `<button class="chip${lower(x.name) === lower(step.sound ?? '') ? ' on' : ''}" data-map-act="quick-sound" data-k="${esc(x.name)}" title="Play ${esc(x.name)} with this line">♪ ${esc(soundLabel(x.name, who!.name))}</button>`).join('')}</div>` : '';
  return `<div class="stagebox"><div class="label">Effect and sound</div>${effect}
    <label class="field"><span>Sound with this line</span>${soundSelect(ctx.project, 'm-sound', 'data-map-in="say-sound"', step.sound, 'No sound', who)}</label>${quick}</div>`;
}

/** A character's sound without their name in front: "lin laugh" shows as "laugh". */
function soundLabel(sound: string, name: string): string {
  const pre = `${lower(name)} `;
  return sound.startsWith(pre) && sound.length > pre.length ? sound.slice(pre.length) : sound;
}

/** One-click changes to the speaker's story facts, added as a step right after the line. */
function quickFacts(ctx: MapCtx, step: SayStep): string {
  const who = speakerOf(ctx.project, ctx.room, step.who).character;
  const defs = who?.facts ?? [];
  if (!who || !defs.length) return '';
  const short = (f: string) => f.replace(/^[^.]+\./, '');
  const buttons = defs.map(d => d.kind === 'number'
    ? `<button class="chip" data-map-act="quick-change" data-k="${esc(d.fact)}|+|1">+1 ${esc(short(d.fact))}</button><button class="chip" data-map-act="quick-change" data-k="${esc(d.fact)}|-|1">−1 ${esc(short(d.fact))}</button>`
    : d.kind === 'word' ? '' : `<button class="chip" data-map-act="quick-change" data-k="${esc(d.fact)}|=|yes">✓ ${esc(short(d.fact))}</button>`).join('');
  return buttons ? `<div class="stagebox"><div class="label">After this line</div><div class="quick">${buttons}</div><p class="hint">Adds a Change for ${esc(who.name)}'s story facts right after this line.</p></div>` : '';
}

function stageField(ctx: MapCtx, scene: Scene, who: string): string {
  const me = scene.chars.find(c => c.visible && lower(c.name) === lower(who));
  const others = scene.chars.filter(c => c.visible && c !== me);
  const out = castNames(ctx).filter(n => !scene.chars.some(c => c.visible && lower(c.name) === lower(n)));
  const mine = me ? `
    <p class="hint">Drag ${esc(me.name)} in the scene above the map to place ${esc(me.name)} for this line. The place holds until it changes.</p>
    ${spotButtons('stage-spot', me.x)}
    <label class="field"><span>Size on stage</span><input type="range" id="m-ssize" data-map-in="stage-size" min="20" max="130" value="${me.size}"></label>
    <div class="row"><label class="check"><input type="checkbox" id="m-sflip" data-map-in="stage-flip"${me.flip ? ' checked' : ''}><span>Turn around</span></label></div>` : '';
  const people = others.length ? `<div class="label">Also on stage</div><div class="cast">${others.map(c =>
    `<span class="chip">${esc(c.name)} <button class="linkbtn" data-map-act="stage-hide" data-k="${esc(c.name)}">take out</button></span>`).join('')}</div>` : '';
  const bring = who.trim() || out.length ? `<label class="field"><span>Bring someone in for this line</span><select id="m-sshow" data-map-in="stage-show"><option value="">Choose…</option>${out.map(n => `<option>${esc(n)}</option>`).join('')}<option value="__new">+ New character from a picture…</option></select></label>` : '';
  return mine || people || bring ? `<div class="stagebox"><div class="label">On stage</div>${mine}${people}${bring}</div>` : '';
}

/** The look picker for a line: the speaker's own looks, or the starter figure's expressions. */
function lookField(ctx: MapCtx, who: string, expr: string): string {
  if (!who.trim()) return '';
  const { el, character } = speakerOf(ctx.project, ctx.room, who);
  const missing = missingLook(ctx.project, ctx.room, who, expr);
  const warn = missing ? `<p class="hint err">${esc(who)} has no look called "${esc(missing)}", so the base picture shows. Pick one of ${esc(who)}'s looks.</p>` : '';
  if (character) {
    const current = findLook(character, expr);
    if (current?.once) {
      return `<div class="field"><span>Look</span><div class="oncepic"><img src="${esc(current.img)}" alt=""><span>This line shows a picture of its own.</span></div>
        <div class="row"><button class="btn small quiet" data-act="once-lineup">Line it up</button><button class="btn small quiet" data-act="once-picture">Replace picture</button><button class="btn small quiet" data-act="once-remove">Use a regular look</button></div>
        <p class="hint">After this line, ${esc(who)} goes back to the look shown before it.</p></div>`;
    }
    const names = ['default', ...character.looks.filter(l => !l.once).map(l => l.name)];
    return `<label class="field"><span>Look</span><select id="m-expr" data-map-in="say-expr"><option value="">Keep the look from before</option>${names.map(n => `<option${lower(n) === lower(expr) ? ' selected' : ''}>${esc(n)}</option>`).join('')}${missing ? `<option selected>${esc(missing)}</option>` : ''}</select></label>${warn}
      <button class="btn small quiet" data-act="once-picture">Use a different picture here</button>`;
  }
  if (el && !el.img) {
    return `<label class="field"><span>Expression</span><select id="m-expr" data-map-in="say-expr"><option value="">No change</option>${EXPRESSIONS.map(x => `<option${x === expr ? ' selected' : ''}>${x}</option>`).join('')}${missing ? `<option selected>${esc(missing)}</option>` : ''}</select></label>${warn}`;
  }
  return `<p class="hint">${esc(who)} is not placed in this room, so there are no looks to pick here yet.</p>`;
}

const kinds = (top: boolean, hasParts: boolean) => [
  ['say', 'Line', 'Someone says something, or a line of narration'],
  ['choice', 'Choice', 'The player picks one of several answers'],
  ['if', 'Only if', 'Take one path or another depending on story facts'],
  ['change', 'Change something', 'Change a story fact without saying anything'],
  ['door', 'Go to another room', 'The player moves to another room'],
  ...(hasParts ? [['jump', 'Go to a part', 'Continue from a named part of this conversation']] : []),
  ['show', 'Bring someone in', 'A character comes on stage, with an effect'],
  ['move', 'Move someone', 'Change where someone stands, their size, or turn them'],
  ['hide', 'Take someone out', 'A character leaves the stage'],
  ['end', 'End', 'The conversation closes here'],
  ...(top ? [['part', 'Part', 'A named point that "Go to a part" can jump to']] : [])
];

export function mapSide(ctx: MapCtx): string {
  const { steps, errors } = parseScript(ctx.el.script);
  const s = summarize(steps);
  const facts = `<datalist id="m-facts">${allFacts(ctx.project).map(f => `<option value="${esc(f)}">`).join('')}</datalist>`;
  const sel = ctx.sel;

  if (!sel || errors.length) {
    return `<h2>What ${ctx.el.kind === 'char' ? `${esc(ctx.el.name)} says` : 'happens'}</h2>
      <p class="hint">Click any box to change it. Click + to add a step there.</p>
      <label class="field"><span>When this conversation starts</span><select id="m-staging" data-in="conv-staging">
        <option value="aside"${(ctx.el.staging ?? 'aside') === 'aside' ? ' selected' : ''}>Others step aside</option>
        <option value="room"${ctx.el.staging === 'room' ? ' selected' : ''}>The room stays as it is</option></select></label>
      <p class="hint">${(ctx.el.staging ?? 'aside') === 'aside' ? 'Characters who take no part leave the stage until the conversation ends. Objects stay.' : 'Everyone stays where they stand in the room.'}</p>
      <label class="field"><span>How often it can happen</span><select id="m-once" data-in="el-once">
        <option value=""${ctx.el.once ? '' : ' selected'}>Every time ${esc(ctx.el.name)} is clicked</option>
        <option value="stay"${ctx.el.once === 'stay' ? ' selected' : ''}>Once; afterwards ${esc(ctx.el.name)} cannot be clicked</option>
        <option value="hide"${ctx.el.once === 'hide' ? ' selected' : ''}>Once; afterwards ${esc(ctx.el.name)} is gone</option></select></label>
      ${s.facts.length ? `<div class="label">Story facts used here</div><div class="row">${s.facts.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}`;
  }

  if (sel.startsWith('add:')) {
    const [, list] = sel.split(':');
    return `<h2>Add a step here</h2><div class="mkinds">${kinds(list === '', s.parts.length > 0).map(([k, n, d]) =>
      `<button class="mkind" data-map-act="insert" data-k="${k}"><b>${n}</b><span>${d}</span></button>`).join('')}</div>
      <button class="btn small quiet" data-map-act="deselect">Cancel</button>`;
  }

  const [path, opt] = sel.split('#o');
  const step = getStep(steps, path);
  if (!step) return '<p class="hint">That step is gone. Click another box.</p>';
  const del = (label = 'Delete this step') => `<button class="btn small danger" data-map-act="delete">${label}</button>`;
  const header = (t: string) => `<div class="mhead"><h2>${t}</h2><button class="btn small quiet" data-map-act="deselect">Done</button></div>`;

  if (opt !== undefined && step.t === 'choice') {
    const k = Number(opt), o = step.options[k];
    if (!o) return '';
    return `${header('Answer')}${facts}
      <label class="field"><span>What the player can answer</span><input type="text" id="m-opt" data-map-in="opt-text" value="${o.text === '...' ? '' : esc(o.text)}" placeholder="An answer"></label>
      ${effectRows(o.effects)}
      <div class="row"><button class="btn small quiet" data-map-act="opt-move" data-k="-1"${k === 0 ? ' disabled' : ''}>Move left</button><button class="btn small quiet" data-map-act="opt-move" data-k="1"${k === step.options.length - 1 ? ' disabled' : ''}>Move right</button></div>
      <button class="btn small danger" data-map-act="opt-remove"${step.options.length < 2 ? ' disabled title="A choice needs at least one answer"' : ''}>Remove this answer</button>`;
  }

  switch (step.t) {
    case 'say': {
      const speakers = new Set([...ctx.room.els.filter(x => x.kind === 'char').map(x => x.name), ...ctx.project.characters.map(c => c.name)]);
      walkSteps(steps, x => { if (x.t === 'say' && x.who) speakers.add(x.who); });
      const scene = sceneAt(ctx, steps, path);
      return `${header('Line')}
        <label class="field"><span>Who speaks</span><input type="text" list="m-who" id="m-who-in" data-map-in="say-who" value="${esc(step.who)}" placeholder="Leave empty for narration"></label>
        <datalist id="m-who">${[...speakers].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        ${unknownSpeaker(ctx, step.who) ? `<p class="hint">No character is called "${esc(step.who)}", so this line is a voice without a picture. If it is narration, clear Who speaks.</p>` : ''}
        <label class="field"><span>${step.who ? 'What they say' : 'Narration'}</span><textarea id="m-text" data-map-in="say-text" rows="3" placeholder="Type the line here">${step.text === '...' ? '' : esc(step.text)}</textarea></label>
        ${lookField(ctx, step.who, step.expr)}
        ${fxField(ctx, step)}
        ${quickFacts(ctx, step)}
        ${stageField(ctx, scene, step.who)}
        <div class="row"><button class="btn small" data-map-act="add-after">+ Line after this</button><button class="btn small play" data-act="play-here" title="Play the conversation from this line, with the scene as it stands here">Play from here</button>${del()}</div>`;
    }
    case 'show':
    case 'move':
    case 'hide': {
      const scene = sceneAt(ctx, steps, path);
      const title = step.t === 'show' ? 'Bring someone in' : step.t === 'move' ? 'Move someone' : 'Take someone out';
      const names = castNames(ctx);
      if (!names.some(n => lower(n) === lower(step.who))) names.push(step.who);
      const who = `<label class="field"><span>Who</span><select id="m-stwho" data-map-in="stg-who">${names.map(n => `<option${lower(n) === lower(step.who) ? ' selected' : ''}>${esc(n)}</option>`).join('')}${step.t === 'show' ? '<option value="__new">+ New character from a picture…</option>' : ''}</select></label>`;
      const effects: readonly string[] = step.t === 'hide' ? EXIT_EFFECTS : ENTER_EFFECTS;
      const fx = step.t === 'move' ? '' : `<label class="field"><span>${step.t === 'show' ? 'How they come in' : 'How they leave'}</span><select id="m-stfx" data-map-in="stg-fx">${effects.map(f => `<option${f === (step.fx || 'fade') ? ' selected' : ''}>${f}</option>`).join('')}</select></label>`;
      const character = speakerOf(ctx.project, ctx.room, step.who).character;
      const look = step.t === 'show' && character ? `<label class="field"><span>Look</span><select id="m-stlook" data-map-in="stg-look"><option value="">As before</option>${['default', ...character.looks.filter(l => !l.once).map(l => l.name)].map(n => `<option${lower(n) === lower(step.look) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : '';
      const at = step.t === 'hide' ? '' : `
        ${spotButtons('stg-spot', step.at.x)}
        <label class="field"><span>Size on stage</span><input type="range" id="m-stsize" data-map-in="stg-size" min="20" max="130" value="${step.at.size ?? scene.chars.find(c => lower(c.name) === lower(step.who))?.size ?? 76}"></label>
        <div class="row"><label class="check"><input type="checkbox" id="m-stflip" data-map-in="stg-flip"${step.at.flip ? ' checked' : ''}><span>Turn around</span></label></div>
        <p class="hint">Or drag ${esc(step.who)} in the scene above the map.</p>`;
      return `${header(title)}${who}${look}${at}${fx}${del()}`;
    }
    case 'choice':
      return `${header('Choice')}
        <p class="hint">The player picks one answer. Each answer can lead its own way, and paths that do not end meet again below.</p>
        <div class="field"><span>Answers</span>${step.options.map((o, k) => `<button class="mkind" data-map-act="sel" data-k="${path}#o${k}"><b>${o.text === '...' ? 'Empty answer' : esc(o.text)}</b>${o.effects.length ? `<span>${esc(o.effects.map(effectText).join(', '))}</span>` : ''}</button>`).join('')}</div>
        <div class="row"><button class="btn small" data-map-act="add-answer" data-k="${path}">+ Answer</button>${del('Delete the whole choice')}</div>`;
    case 'if': {
      const c = step.cond;
      const ops: [CompareOp, string][] = [...CONDITION_WORDS.map(([w, op]) => [op, w] as [CompareOp, string]), ['truthy', 'is yes']];
      return `${header('Only if')}${facts}
        <p class="hint">The Yes path runs when this is true, and the Otherwise path runs when it is not.</p>
        <label class="field"><span>Story fact</span><input type="text" list="m-facts" id="m-cfact" data-map-in="cond-fact" value="${esc(c.fact)}"></label>
        <label class="field"><span>Test</span><select id="m-cop" data-map-in="cond-op">${ops.map(([op, w]) => `<option value="${op}"${op === c.op ? ' selected' : ''}>${w}</option>`).join('')}</select></label>
        ${c.op === 'truthy' ? '' : `<label class="field"><span>Value</span><input type="text" id="m-cval" data-map-in="cond-val" value="${esc(valueText(c.value))}"></label>`}
        ${del('Delete this condition and both paths')}`;
    }
    case 'change':
      return `${header('Change something')}${facts}${effectRows(step.effects)}${del()}`;
    case 'door':
      return `${header('Go to another room')}
        <label class="field"><span>Room</span><select id="m-room" data-map-in="door-room">${ctx.project.rooms.map(r => `<option${lower(r.name) === lower(step.room) ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}${ctx.project.rooms.some(r => lower(r.name) === lower(step.room)) ? '' : `<option selected>${esc(step.room)}</option>`}</select></label>
        <p class="hint">The conversation stops and the player moves there.</p>${del()}`;
    case 'jump':
      return `${header('Go to a part')}
        <label class="field"><span>Part</span><select id="m-part" data-map-in="jump-part">${s.parts.map(n => `<option${lower(n) === lower(step.part) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <p class="hint">The conversation continues from that part. The arrow on the right shows where.</p>${del()}`;
    case 'part':
      return `${header('Part')}
        <label class="field"><span>Name</span><input type="text" id="m-pname" data-map-in="part-name" value="${esc(step.name)}"></label>
        <p class="hint">A named point in this conversation. "Go to a part" can jump here, also from further down to loop back.</p>${del()}`;
    case 'end':
      return `${header('End')}<p class="hint">The conversation closes here, and the player can explore the room again.</p>${del()}`;
    case 'note':
      return `${header('Note')}<label class="field"><span>Only you see notes</span><textarea id="m-note" data-map-in="note-text" rows="3">${esc(step.text)}</textarea></label>${del()}`;
  }
  return '';
}

/* ---------- Editing ---------- */

export interface MapResult {
  sel?: string | null;
  /** True when the side panel needs drawing again, not only the map. */
  panel?: boolean;
}

const factName = (v: string) => v.trim().replace(/[^\w.]/g, '_');
/** A typed amount: "2,5" means 2.5, and commas never split a value into two changes. */
const amount = (v: string) => toValue((/^\s*-?\d+,\d+\s*$/.test(v) ? v.replace(',', '.') : v.replace(/,/g, ' ')).trim() || '0');

function newStep(kind: string, ctx: MapCtx, parts: string[]): Step {
  const other = ctx.project.rooms.find(r => r.id !== ctx.room.id) ?? ctx.room;
  switch (kind) {
    case 'choice': return { t: 'choice', options: [{ text: 'First answer', effects: [], steps: [] }, { text: 'Second answer', effects: [], steps: [] }] };
    case 'if': return { t: 'if', cond: { fact: 'affection', op: '>=', value: 5 }, then: [], else: [] };
    case 'change': return { t: 'change', effects: [{ fact: 'affection', op: '+', value: 1 }] };
    case 'door': return { t: 'door', room: other.name };
    case 'jump': return { t: 'jump', part: parts[0] ?? 'Start' };
    case 'end': return { t: 'end' };
    case 'part': {
      let n = parts.length + 1;
      while (parts.some(p => lower(p) === `part ${n}`)) n++;
      return { t: 'part', name: `Part ${n}` };
    }
    case 'show': return { t: 'show', who: castNames(ctx).find(n => lower(n) !== lower(ctx.el.name)) ?? ctx.el.name, look: '', at: { x: 70 }, fx: 'fade' };
    case 'move': return { t: 'move', who: ctx.el.kind === 'char' ? ctx.el.name : castNames(ctx)[0] ?? 'Someone', at: { x: 50 } };
    case 'hide': return { t: 'hide', who: ctx.el.kind === 'char' ? ctx.el.name : castNames(ctx)[0] ?? 'Someone', fx: 'fade' };
    default: return { t: 'say', who: ctx.el.kind === 'char' ? ctx.el.name : '', expr: '', text: '...' };
  }
}

/** Runs an action from the map or its panel. Returns what to select next, or undefined if nothing changed. */
export function mapAction(ctx: MapCtx, act: string, k: string): MapResult | undefined {
  const { steps, errors } = parseScript(ctx.el.script);
  if (errors.length && act !== 'sel' && act !== 'deselect') return undefined;
  const commit = (sel: string | null): MapResult => { ctx.el.script = writeScript(steps); return { sel, panel: true }; };
  const [path, opt] = (ctx.sel ?? '').split('#o');

  switch (act) {
    case 'sel': return { sel: k, panel: true };
    case 'first-line': {
      const [, list, at] = k.split(':');
      const target = getList(steps, list);
      if (!target) return undefined;
      target.splice(Number(at), 0, newStep('say', ctx, []));
      return commit(stepPathOf(list, Number(at)));
    }
    case 'deselect': return { sel: null, panel: true };
    case 'insert': {
      const [, list, at] = (ctx.sel ?? '').split(':');
      const target = getList(steps, list);
      if (!target) return undefined;
      const index = Number(at);
      target.splice(index, 0, newStep(k, ctx, summarize(steps).parts));
      return commit(stepPathOf(list, index));
    }
    case 'add-after': {
      const { list, index } = splitPath(path);
      const target = getList(steps, list), cur = getStep(steps, path);
      if (!target || !cur) return undefined;
      target.splice(index + 1, 0, { t: 'say', who: cur.t === 'say' ? cur.who : '', expr: '', text: '...' });
      return commit(stepPathOf(list, index + 1));
    }
    case 'delete': {
      const { list, index } = splitPath(path);
      const target = getList(steps, list);
      if (!target) return undefined;
      target.splice(index, 1);
      return commit(null);
    }
    case 'add-answer': {
      const step = getStep(steps, k) as ChoiceStep | null;
      if (step?.t !== 'choice') return undefined;
      step.options.push({ text: '...', effects: [], steps: [] });
      return commit(`${k}#o${step.options.length - 1}`);
    }
    case 'opt-remove':
    case 'opt-move': {
      const step = getStep(steps, path) as ChoiceStep | null;
      const i = Number(opt);
      if (step?.t !== 'choice' || !step.options[i]) return undefined;
      if (act === 'opt-remove') {
        if (step.options.length < 2) return undefined;
        step.options.splice(i, 1);
        return commit(path);
      }
      const j = i + Number(k);
      if (j < 0 || j >= step.options.length) return undefined;
      [step.options[i], step.options[j]] = [step.options[j], step.options[i]];
      return commit(`${path}#o${j}`);
    }
    case 'stage-spot':
    case 'stage-place': {
      const step = getStep(steps, path);
      if (step?.t !== 'say' || !step.who) return undefined;
      const [who, x, y] = act === 'stage-place' ? k.split('|') : [step.who, k, ''];
      const at: Placement = { x: snapToSpot(Number(x)) };
      if (y) at.y = Math.round(Number(y) * 10) / 10;
      return commit(placeBefore(steps, path, who, at));
    }
    case 'stage-hide': {
      const { list, index } = splitPath(path);
      const target = getList(steps, list);
      if (!target) return undefined;
      target.splice(index, 0, { t: 'hide', who: k, fx: 'fade' });
      return commit(stepPathOf(list, index + 1));
    }
    case 'quick-sound': {
      const step = getStep(steps, path);
      if (step?.t !== 'say') return undefined;
      step.sound = lower(step.sound ?? '') === lower(k) ? undefined : k;
      return commit(ctx.sel);
    }
    case 'quick-change': {
      const [fact, op, value] = k.split('|');
      const { list, index } = splitPath(path);
      const target = getList(steps, list);
      if (!target) return undefined;
      const next = target[index + 1];
      const effect: Effect = { fact, op: op as Effect['op'], value: toValue(value) };
      // A Change right after the line takes the new effect too.
      if (next?.t === 'change') {
        const same = next.effects.find(e => e.fact === fact && e.op === effect.op && typeof e.value === 'number' && typeof effect.value === 'number');
        if (same) same.value = (same.value as number) + (effect.value as number);
        else next.effects.push(effect);
      } else target.splice(index + 1, 0, { t: 'change', effects: [effect] });
      return commit(ctx.sel);
    }
    case 'scene-place': {
      // Dragging someone in the scene: a stage step for that person takes the place; anything else gets a Move just before it.
      const step = getStep(steps, path);
      if (!step) return undefined;
      const [who, x, y] = k.split('|');
      const at: Placement = { x: snapToSpot(Number(x)) };
      if (y) at.y = Math.round(Number(y) * 10) / 10;
      if ((step.t === 'show' || step.t === 'move') && lower(step.who) === lower(who)) { Object.assign(step.at, at); if (!y) delete step.at.y; return commit(ctx.sel); }
      return commit(placeBefore(steps, path, who, at));
    }
    case 'stg-spot':
    case 'stg-place': {
      const step = getStep(steps, path);
      if (step?.t !== 'show' && step?.t !== 'move') return undefined;
      const [, x, y] = act === 'stg-place' ? k.split('|') : ['', k, ''];
      step.at.x = snapToSpot(Number(x));
      if (y) step.at.y = Math.round(Number(y) * 10) / 10;
      return commit(ctx.sel);
    }
    case 'eff-add':
    case 'eff-remove': {
      const effects = effectsAt(steps, path, opt);
      if (!effects) return undefined;
      if (act === 'eff-add') effects.push({ fact: effects[0]?.fact ?? 'affection', op: '+', value: 1 });
      else effects.splice(Number(k), 1);
      return commit(ctx.sel);
    }
  }
  return undefined;
}

function effectsAt(steps: Step[], path: string, opt: string | undefined): Effect[] | null {
  const step = getStep(steps, path);
  if (step?.t === 'choice' && opt !== undefined) return step.options[Number(opt)]?.effects ?? null;
  if (step?.t === 'change') return step.effects;
  return null;
}

/**
 * Sets where someone stands from a line on: changes the stage step right before
 * the line when it is about the same person, or adds a "Move" there. Returns the
 * line's path, which moves down by one when a step was added above it.
 */
function placeBefore(steps: Step[], path: string, who: string, at: Placement): string {
  const { list, index } = splitPath(path);
  const target = getList(steps, list);
  if (!target) return path;
  const prev = target[index - 1];
  if (prev && (prev.t === 'move' || prev.t === 'show') && lower(prev.who) === lower(who)) {
    Object.assign(prev.at, at);
    return path;
  }
  target.splice(index, 0, { t: 'move', who, at });
  return stepPathOf(list, index + 1);
}

/** Applies a typed or picked value from the panel. */
export function mapInput(ctx: MapCtx, field: string, k: string, value: string): MapResult | undefined {
  const { steps, errors } = parseScript(ctx.el.script);
  if (errors.length || !ctx.sel) return undefined;
  const [path, opt] = ctx.sel.split('#o');
  const step = getStep(steps, path);
  if (!step) return undefined;
  let panel = false;
  const text = value.replace(/\s*\n\s*/g, ' ');

  if (field.startsWith('eff-')) {
    const e = effectsAt(steps, path, opt)?.[Number(k)];
    if (!e) return undefined;
    if (field === 'eff-fact') e.fact = factName(value) || 'fact';
    if (field === 'eff-op') e.op = value as Effect['op'];
    if (field === 'eff-val') e.value = amount(value);
  } else if (step.t === 'say' && field.startsWith('stage-')) {
    if (field === 'stage-show') {
      if (!value) return undefined;
      const { list, index } = splitPath(path);
      getList(steps, list)?.splice(index, 0, { t: 'show', who: value, look: '', at: {}, fx: 'fade' });
      ctx.el.script = writeScript(steps);
      return { sel: stepPathOf(list, index + 1), panel: true };
    }
    const who = step.who;
    const at: Placement = field === 'stage-size' ? { size: Number(value) } : { flip: value === 'true' };
    const sel = placeBefore(steps, path, who, at);
    ctx.el.script = writeScript(steps);
    return { sel, panel: true };
  } else if ((step.t === 'show' || step.t === 'move' || step.t === 'hide') && field.startsWith('stg-')) {
    if (field === 'stg-who') step.who = value;
    if (field === 'stg-fx' && step.t !== 'move') step.fx = value === 'fade' ? 'fade' : value;
    if (field === 'stg-look' && step.t === 'show') step.look = value;
    if (field === 'stg-size' && step.t !== 'hide') step.at.size = Number(value);
    if (field === 'stg-flip' && step.t !== 'hide') step.at.flip = value === 'true' ? true : step.t === 'move' ? false : undefined;
  } else if (step.t === 'say') {
    if (field === 'say-fx') { panel = !step.fx !== !value; step.fx = value || undefined; if (!value) delete step.fxOpts; }
    if (field.startsWith('say-fx-')) {
      const key = field.slice(7) as 'strength' | 'speed' | 'times';
      const n = Number(value);
      step.fxOpts = { ...(step.fxOpts ?? {}), [key]: n };
      if (n === FX_NORMAL[key]) delete step.fxOpts[key];
      if (!Object.keys(step.fxOpts).length) delete step.fxOpts;
    }
    if (field === 'say-sound') step.sound = value || undefined;
    if (field === 'say-who') { panel = !step.who !== !value.trim(); step.who = value; if (!value.trim()) step.expr = ''; }
    if (field === 'say-expr') step.expr = value;
    if (field === 'say-text') step.text = text.trim() ? text : '...';
  } else if (step.t === 'choice' && field === 'opt-text') {
    const o = step.options[Number(opt)];
    if (o) o.text = text.trim() ? text : '...';
  } else if (step.t === 'if') {
    if (field === 'cond-fact') step.cond.fact = factName(value) || 'fact';
    if (field === 'cond-op') { panel = (step.cond.op === 'truthy') !== (value === 'truthy'); step.cond.op = value as CompareOp; if (value === 'truthy') step.cond.value = true; else if (panel) step.cond.value = 5; }
    if (field === 'cond-val') step.cond.value = amount(value);
  } else if (step.t === 'door' && field === 'door-room') {
    step.room = value;
  } else if (step.t === 'jump' && field === 'jump-part') {
    step.part = value;
  } else if (step.t === 'part' && field === 'part-name') {
    const name = text.trim().replace(/:/g, '') || 'Unnamed part';
    const old = lower(step.name);
    walkSteps(steps, x => { if (x.t === 'jump' && lower(x.part) === old) x.part = name; });
    step.name = name;
  } else if (step.t === 'note' && field === 'note-text') {
    step.text = text;
  } else {
    return undefined;
  }
  ctx.el.script = writeScript(steps);
  return { sel: ctx.sel, panel };
}
