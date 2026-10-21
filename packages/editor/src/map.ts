/**
 * The conversation map: the same conversation as the script, drawn as boxes.
 *
 * The map is laid out automatically, top to bottom. Lines in a row share one card,
 * a choice or an "Only if" splits into columns, and the columns meet again below
 * where the paths continue together. Edits made here rewrite the script, so the
 * script and the map always show the same conversation.
 */
import { FX_NORMAL, IDLE_MOVES, pathAt, placeText as spotText, ENTER_EFFECTS, EXIT_EFFECTS, LINE_EFFECTS, SPOTS, placeText, snapToSpot, stepsBefore, conditionText, effectText, findRoomByName, getList, getStep, parseScript, splitPath, stepPathOf, summarize, toValue, valueText, walkSteps, writeScript } from '@story-engine/engine-core';
import { characterOf, findLook, findQuest, hasLook, newQuest, stageIndex, storyFactNames } from '@story-engine/engine-core';
import { condRow, editCondition } from './conds';
import type { Character, ChoiceStep, DoorStep, Effect, Placement, Project, Room, SayStep, Step, StoryElement } from '@story-engine/engine-core';
import { EXPRESSIONS, allMarks, markArt, applyToScene, esc, nextMoment, sayHTML, sceneHTML, startScene } from '@story-engine/runtime';
import type { Scene } from '@story-engine/runtime';
import { musicSelect, soundSelect } from './widgets';
import { itemStepGive, itemStepInput, itemStepPanel, itemStepText, newItemStep } from './items';

export interface MapCtx {
  /** The line tool window that is open. */
  win?: LineWin | null;
  /** Drawing a path for the selected step, and the selected point of it. */
  pen?: boolean;
  pathPt?: number | null;
  project: Project;
  room: Room;
  el: StoryElement;
  /** What is selected: a step path, "<path>#o<k>" for an answer, or "add:<list>:<index>". */
  sel: string | null;
  /** The line being typed in place in the map, by its path. */
  edit?: string | null;
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
  if (s.t === 'mark') return s.off ? (s.mark ? `${s.who} loses the ${s.mark} mark` : `${s.who} loses all marks`) : `${s.who} gets the ${s.mark} mark`;
  if (s.t === 'path') return `${s.who} follows a drawn path (${s.secs}s${s.repeat === 'loop' ? ', loops' : s.repeat === 'pingpong' ? ', back and forth' : ''})`;
  if (s.t === 'loop') return s.move.move === 'none' ? `${s.who} stands still` : `${s.who} starts to ${s.move.move}`;
  return '';
}

/** The scene as it stands at a step: everything on the way there applied, in order. */
export function sceneAt(ctx: MapCtx, steps: Step[], path: string): Scene {
  const scene = startScene(ctx.room, ctx.el, steps);
  for (const st of stepsBefore(steps, path)) { applyToScene(scene, st, ctx.project); nextMoment(scene); }
  const here = getStep(steps, path);
  if (here) applyToScene(scene, here, ctx.project);
  for (const c of scene.chars) {
    c.fx = '';
    // A path from an earlier step: shown where it ends (or where it starts, when it repeats).
    if (c.path && c.path.step !== here) {
      const st = c.path.step;
      if (!st.repeat) { const end = pathAt(st.points, st.secs, undefined, st.ease, c.path.startSize, st.secs + 1); c.x = end.x; c.y = end.y; c.size = end.size; if (end.flip !== undefined) c.flip = end.flip; }
      c.path = undefined;
    }
  }
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
const LINE_KINDS = new Set(['say', 'change', 'quest', 'note', 'show', 'move', 'hide', 'music', 'sound', 'panel', 'mark', 'loop', 'path', 'ask', 'camera']);

/* Boxes made smaller: all of them, with single boxes switched the other way. Kept while the editor is open. */
let allSmall = false;
const flipped = new Set<string>();
export function toggleFold(key: string): void { if (flipped.has(key)) flipped.delete(key); else flipped.add(key); }
export function toggleFoldAll(): void { allSmall = !allSmall; flipped.clear(); }
/** How many rows a smaller box shows before "+ n more". */
const SMALL_ROWS = 2;

/** A sound step in plain words. */
export function soundText(s: Extract<Step, { t: 'sound' }>): string {
  if (s.stop) return s.name ? `Stop ${s.name}` : `Stop all sounds${s.music ? ' and the music' : ''}`;
  return s.name && s.name !== '...' ? `♪ ${s.name}${s.loop ? ' (loops)' : ''}` : 'No sound picked';
}
const TERMINAL = new Set(['door', 'end', 'jump', 'ending']);
/** The handle shown on a row or an answer when the pointer is over it: drag it to change the order. */
const GRIP = '<span class="mgrip" aria-hidden="true" title="Drag to change the order">⋮⋮</span>';

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
    const open = `<button ${attrs}>${readOnly ? '' : GRIP}`;
    if (s.t === 'say' && ctx.edit === path && !readOnly) {
      return `<div class="mrow k-say on editing" data-k="${esc(path)}">${s.who ? `<span class="who">${esc(s.who)}</span>` : ''}<textarea class="minline" id="m-inline" rows="1" aria-label="${s.who ? `What ${esc(s.who)} says` : 'Narration'}" placeholder="Type the line, Enter for the next one">${s.text === '...' ? '' : esc(s.text)}</textarea></div>`;
    }
    if (s.t === 'say') {
      const text = s.text === '...' ? '<em>Empty line</em>' : esc(s.text);
      return s.who
        ? `${open}<span class="who${unknownSpeaker(ctx, s.who) ? ' voice" title="A voice without a picture: no character has this name' : ''}">${esc(s.who)}</span>${s.expr ? exprTag(s.who, s.expr) : ''}${s.marks?.length ? `<span class="expr">${esc(s.marks.join(', '))}</span>` : ''}${s.fx ? `<span class="mini-tag">${esc(s.fx)}</span>` : ''}${s.sound ? `<span class="mini-tag" title="${s.soundAtEnd ? 'Sound as the player moves on' : 'Sound as the line appears'}">${s.soundAtEnd ? '→♪' : '♪'}</span>` : ''}${s.voice ? '<span class="mini-tag">🎤</span>' : ''}${s.alts?.length ? `<span class="mini-tag">${s.alts.length + 1} ways</span>` : ''}<span class="txt">${text}</span></button>`
        : `${open}<span class="txt narr">${text}</span></button>`;
    }
    if (s.t === 'ask') return `${open}<span class="tag">Ask</span><span class="txt">${esc(s.prompt)} → <code>${esc(s.fact)}</code></span></button>`;
    if (s.t === 'camera') return `${open}<span class="tag">Camera</span><span class="txt">${s.action === 'zoom' ? `zoom ×${s.scale ?? 1.5}` : esc(s.action)}</span></button>`;
    if (s.t === 'panel') return `${open}<span class="tag">Interface</span><span class="txt">${s.show ? 'Show' : 'Hide'} ${esc(s.name)}</span></button>`;
    if (s.t === 'sound') return `${open}<span class="tag">${s.stop ? 'Stop' : 'Sound'}</span><span class="txt">${esc(soundText(s))}</span></button>`;
    if (s.t === 'music') return `${open}<span class="tag">Music</span><span class="txt">${s.track ? `♫ ${esc(s.track)}${s.once ? ' (once)' : ''}` : 'Silence'}</span></button>`;
    if (itemStepText(ctx.project, s)) return `${open}<span class="tag">Item</span><span class="txt">${esc(itemStepText(ctx.project, s)!)}</span></button>`;
    if (s.t === 'change') return `${open}<span class="tag">Change</span><span class="txt">${esc(s.effects.map(effectText).join(', '))}</span></button>`;
    if (s.t === 'quest') return `${open}<span class="tag">Quest</span><span class="txt">${esc(s.quest)} → ${esc(s.stage)}</span></button>`;
    if (s.t === 'note') return `${open}<span class="tag">Note</span><span class="txt">${esc(s.text)}</span></button>`;
    if (s.t === 'mark' || s.t === 'loop' || s.t === 'path') return `${open}<span class="tag">Stage</span><span class="txt">${esc(stageText(s))}</span></button>`;
    if (s.t === 'show' || s.t === 'move' || s.t === 'hide') {
      const bad = unknownSpeaker(ctx, s.who) ? ' bad" title="No character has this name. If this is narration, write Narration: in front of it in the script.' : '';
      return `${open}<span class="tag">Stage</span><span class="txt${bad}">${esc(stageText(s))}</span></button>`;
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
        const key = `${ctx.el.id}|${path}`;
        const small = allSmall !== flipped.has(key);
        let hidden = 0;
        while (j < list.length && LINE_KINDS.has(list[j].t)) {
          const p = stepPathOf(lp, j);
          // A smaller box shows its first rows, and the selected one wherever it is.
          if (small && j - i >= SMALL_ROWS && ctx.sel !== p) hidden++;
          else rows += row(list[j], p);
          j++;
        }
        const n = j - i;
        const fold = `<button class="mfold" data-act="map-fold" data-k="${esc(key)}" title="${small ? 'Show the whole box' : 'Make this box smaller'}" aria-label="${small ? 'Show the whole box' : 'Make this box smaller'}" aria-expanded="${!small}">${small ? '▸' : '▾'}</button>`;
        const more = hidden ? `<button class="mmore" data-act="map-fold" data-k="${esc(key)}">+ ${hidden} more</button>` : '';
        html += `<div class="mnode mcard${small ? ' small' : ''}${dim}" id="${nid}" data-rows="${n}">${n > 1 || small ? fold : ''}${rows}${more}</div>`;
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
          html += `<div class="mbranch"><button class="mnode answer${dim}${on(key)}" id="${hid}"${pick(key)}${s.options.length > 1 && !readOnly ? ` data-ans="${k}"` : ''}>${s.options.length > 1 && !readOnly ? GRIP : ''}<span class="q">${o.text === '...' ? '<em>Empty answer</em>' : esc(o.text)}</span>${fx}</button><div class="mflow">${sub.html}</div></div>`;
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
        const label = s.t === 'door' ? `<span class="tag">Go to</span>${esc(s.room)}${s.fx ? ` <i>(${esc(s.fx)})</i>` : ''}${broken ? '<span class="why">There is no room with this name</span>' : ''}`
          : s.t === 'jump' ? `<span class="tag">Go to part</span>${esc(s.part)}`
          : s.t === 'ending' ? `<span class="tag">Ending</span>${esc(s.name)}`
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
    <button class="btn small quiet" data-map-view="fit" title="Fit the whole conversation in view">Fit</button>
    <button class="btn small quiet${allSmall ? ' ink' : ''}" data-act="map-fold-all" aria-pressed="${allSmall}" title="${allSmall ? 'Show every box whole' : 'Make every box smaller'}">${allSmall ? 'Whole boxes' : 'Smaller boxes'}</button></div>`;
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

/** Changes the zoom, keeping a point of the view where it was: the given one (the pointer), or the middle. */
export function setZoom(next: number, at?: { x: number; y: number }): void {
  const sc = document.getElementById('mscroll');
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(next * 1000) / 1000));
  if (!sc) { zoom = z; return; }
  const ax = at?.x ?? sc.clientWidth / 2, ay = at?.y ?? sc.clientHeight / 2;
  const sizer = document.getElementById('msizer');
  // The canvas is centred when narrower than the view, so measure from where it starts.
  const offX = () => sizer ? sizer.getBoundingClientRect().left - sc.getBoundingClientRect().left + sc.scrollLeft : 0;
  const offY = () => sizer ? sizer.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop : 0;
  const cx = (sc.scrollLeft + ax - offX()) / zoom, cy = (sc.scrollTop + ay - offY()) / zoom;
  zoom = z;
  applyZoom();
  sc.scrollLeft = cx * zoom + offX() - ax;
  sc.scrollTop = cy * zoom + offY() - ay;
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
 * First look at a conversation: at actual size, with the start in the middle at
 * the top. Fit is only ever done when asked for.
 */
export function openView(): void {
  const sc = document.getElementById('mscroll'), canvas = document.getElementById('mcanvas');
  const start = canvas?.querySelector<HTMLElement>('.mnode.start');
  if (!sc || !canvas || !start) return;
  zoom = 1;
  applyZoom();
  const centre = () => {
    const x = start.offsetLeft + start.offsetWidth / 2 + (start.offsetParent as HTMLElement).offsetLeft;
    sc.scrollLeft = x - sc.clientWidth / 2;
    sc.scrollTop = 0;
  };
  centre();
  // The page can still be widening as the view opens: keep the start centred until the author moves the map.
  if (!('ResizeObserver' in window)) return;
  let touched = false;
  const stop = () => { touched = true; ro.disconnect(); };
  const ro = new ResizeObserver(() => { if (touched || !start.isConnected) stop(); else centre(); });
  ro.observe(sc);
  sc.addEventListener('pointerdown', stop, { once: true });
  sc.addEventListener('wheel', stop, { once: true, passive: true });
  setTimeout(stop, 1000);
}

/* ---------- Moving around with the keyboard ---------- */

/** Every step and answer in reading order, as the map draws them: down the page, each answer with its own path before the next answer. */
export function readingOrder(ctx: MapCtx): string[] {
  const { steps, errors } = parseScript(ctx.el.script);
  if (errors.length) return [];
  const out: string[] = [];
  const walk = (list: Step[], lp: string): void => list.forEach((s, i) => {
    const path = stepPathOf(lp, i);
    out.push(path);
    if (s.t === 'choice') s.options.forEach((o, k) => { out.push(`${path}#o${k}`); walk(o.steps, `${path}.o${k}`); });
    if (s.t === 'if') { walk(s.then, `${path}.t`); walk(s.else, `${path}.e`); }
  });
  walk(steps, '');
  return out;
}

/** What a list of steps belongs to: an answer ("<path>#o<k>"), an "Only if" (its path), or nothing for the top. */
function ownerOf(list: string): string | null {
  if (!list) return null;
  const parts = list.split('.');
  const branch = parts.pop()!;
  const path = parts.join('.');
  return branch.startsWith('o') ? `${path}#${branch}` : path;
}

/** The step before or after the selection in reading order (↑ and ↓). With nothing selected, the first or the last. */
export function nextInOrder(ctx: MapCtx, dir: 1 | -1): string | null {
  const order = readingOrder(ctx);
  if (!order.length) return null;
  const sel = ctx.sel;
  if (!sel) return dir > 0 ? order[0] : order[order.length - 1];
  if (sel.startsWith('add:')) {
    const [, list, at] = sel.split(':');
    const before = Number(at) > 0 ? stepPathOf(list, Number(at) - 1) : ownerOf(list);
    const after = stepPathOf(list, Number(at));
    if (dir < 0) return before ?? order[0];
    if (order.includes(after)) return after;
    return before ? order[Math.min(order.length - 1, order.indexOf(before) + 1)] : order[0];
  }
  const i = order.indexOf(sel);
  if (i < 0) return order[0];
  return order[Math.max(0, Math.min(order.length - 1, i + dir))];
}

/**
 * The neighbour to the left or right (← and →): the next answer of a choice, or
 * the same place in the next answer's or the other path's steps. On a choice or
 * an "Only if" itself, → goes into its first answer or path.
 */
export function sideways(ctx: MapCtx, dir: 1 | -1): string | null {
  const { steps, errors } = parseScript(ctx.el.script);
  const sel = ctx.sel;
  if (errors.length || !sel || sel.startsWith('add:')) return null;
  const [path0, opt] = sel.split('#o');
  const step = getStep(steps, path0);
  if (opt !== undefined) return step?.t === 'choice' && step.options[Number(opt) + dir] ? `${path0}#o${Number(opt) + dir}` : null;
  if (step?.t === 'choice' && dir > 0) return `${path0}#o0`;
  if (step?.t === 'if' && dir > 0) return step.then.length ? `${path0}.t.0` : step.else.length ? `${path0}.e.0` : null;
  // Inside a path: the same place in the neighbouring one, looking further out when there is none.
  let path = path0;
  while (path.split('.').length >= 3) {
    const parts = path.split('.');
    const index = Number(parts.pop());
    const branch = parts.pop()!;
    const owner = parts.join('.');
    const os = getStep(steps, owner);
    if (os?.t === 'choice' && branch.startsWith('o')) {
      const j = Number(branch.slice(1)) + dir;
      const o = os.options[j];
      if (o) return o.steps.length ? `${owner}.o${j}.${Math.min(index, o.steps.length - 1)}` : `${owner}#o${j}`;
    } else if (os?.t === 'if') {
      const other = branch === 't' && dir > 0 ? 'e' : branch === 'e' && dir < 0 ? 't' : '';
      const list = other === 't' ? os.then : other === 'e' ? os.else : null;
      if (list) return list.length ? `${owner}.${other}.${Math.min(index, list.length - 1)}` : owner;
    }
    path = owner;
  }
  return null;
}

/** Where "Add a step" goes for the selection: right after a step, at the start of an answer's path, or at the end. */
export function addKeyAfter(ctx: MapCtx): string | null {
  const { steps, errors } = parseScript(ctx.el.script);
  if (errors.length) return null;
  const sel = ctx.sel;
  if (!sel) return `add::${steps.length}`;
  if (sel.startsWith('add:')) return sel;
  const [path, opt] = sel.split('#o');
  if (opt !== undefined) return `add:${path}.o${opt}:0`;
  const { list, index } = splitPath(path);
  return `add:${list}:${index + 1}`;
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
  const isPath = step?.t === 'path';
  const where = isPath ? (ctx.pen ? 'Draw the path in the picture.' : 'Drag a dot to move it, click one to change things there.') : !step ? (sel.startsWith('add:') ? 'Pick a step to see the scene there.' : 'As the conversation starts.')
    : say ? (say.who ? `At ${esc(say.who)}'s line.` : 'At this line of narration.') : `At this step: ${esc(stepLabel(step, ctx.project))}.`;
  const on = scene.chars.filter(c => c.visible).length;
  const head = `<div class="msceneh"><b>Scene</b><span class="hint">${where}${step && on && !isPath ? ' Drag anyone to place them from here on.' : ''}</span><button class="btn small quiet" data-act="scene-toggle">${open ? 'Hide' : 'Show the scene'}</button></div>`;
  if (!open) return `<div class="mscene closed">${head}</div>`;
  return `<div class="mscene">${head}<div class="mpreview big">${sceneHTML(ctx.project, ctx.room, scene, ctx.project.look, game, { draggable: !!step && !isPath, focus: say?.who ?? (isPath ? step.who : undefined), path: isPath ? { points: step.points, sel: ctx.pathPt ?? undefined } : undefined, pen: isPath && ctx.pen })}</div>
    ${isPath ? `<div class="row"><button class="btn small" data-act="path-play">▶ Play the path</button><button class="btn small quiet" data-act="path-draw">✎ Draw again</button></div>` : ''}</div>`;
}

function stepLabel(s: Step, project: Project): string {
  switch (s.t) {
    case 'show': case 'move': case 'hide': case 'mark': case 'loop': case 'path': return stageText(s);
    case 'choice': return 'the player chooses';
    case 'if': return `only if ${conditionText(s.cond)}`;
    case 'change': return itemStepText(project, s)?.toLowerCase() ?? `change ${s.effects.map(effectText).join(', ')}`;
    case 'music': return s.track ? `music ${s.track}` : 'the music stops';
    case 'sound': return soundText(s).replace(/^♪ /, 'sound ');
    case 'panel': return `${s.show ? 'show' : 'hide'} the ${s.name} panel`;
    case 'door': return `go to ${s.room}`;
    case 'ask': return `ask "${s.prompt}"`;
    case 'ending': return `ending: ${s.name}`;
    case 'quest': return `Quest: ${s.quest} → ${s.stage}`;
    case 'camera': return `camera ${s.action}`;
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
/** The effect on the speaker, with how strong, fast and often it plays. */
function effectPart(step: SayStep): string {
  const fx = step.fx ?? '';
  const o = step.fxOpts ?? {};
  const slider = (key: 'strength' | 'speed' | 'times', label: string, lo: string, hi: string) => `<label class="field fxs"><span>${label}</span>
      <input type="range" id="m-fx-${key}" data-map-in="say-fx-${key}" min="1" max="5" step="1" value="${o[key] ?? FX_NORMAL[key]}"><span class="fxends"><i>${lo}</i><i>${hi}</i></span></label>`;
  return `<div class="fxpick">${['', ...LINE_EFFECTS].map(f => `<button class="fxopt${f === fx ? ' on' : ''}" data-map-act="say-fx-pick" data-k="${f}" aria-pressed="${f === fx}"><b>${f || 'None'}</b>${f ? `<span>${FX_HELP[f] ?? ''}</span>` : ''}</button>`).join('')}</div>
    ${fx ? `<div class="fxgrid">${slider('strength', 'Strength', 'gentle', 'strong')}${slider('speed', 'Speed', 'slow', 'fast')}${slider('times', 'Times', '1', '5')}</div>
      <button class="btn small quiet" data-act="fx-try">▶ Play it again</button>` : ''}`;
}

function marksPart(ctx: MapCtx, step: SayStep): string {
  const on = new Set((step.marks ?? []).map(lower));
  return `<div class="quick markpick">${allMarks(ctx.project).map(m =>
    `<button class="chip mchip${on.has(m.name) ? ' on' : ''}" data-map-act="line-mark" data-k="${esc(m.name)}" title="${esc(m.name)}" aria-pressed="${on.has(m.name)}"><span class="mthumb">${markArt(m)}</span>${esc(m.name)}</button>`).join('')}</div>
    <p class="hint">${on.size ? 'Drag a mark in the scene to move it on this character; the wheel over it changes its size.' : 'Marks show on the speaker for this line only. To keep one on, add the step "Put a mark on someone".'}</p>`;
}

function soundPart(ctx: MapCtx, step: SayStep): string {
  const who = speakerOf(ctx.project, ctx.room, step.who).character;
  const mine = who ? (ctx.project.sounds ?? []).filter(x => x.owner === who.id) : [];
  const quick = mine.length ? `<div class="quick">${mine.map(x => `<button class="chip${lower(x.name) === lower(step.sound ?? '') ? ' on' : ''}" data-map-act="quick-sound" data-k="${esc(x.name)}" title="Play ${esc(x.name)} with this line">♪ ${esc(soundLabel(x.name, who!.name))}</button>`).join('')}</div>` : '';
  const when = step.sound ? `<div class="field"><span>When it plays</span><div class="row">
      <button class="btn small${step.soundAtEnd ? ' quiet' : ' ink'}" data-map-act="snd-when" data-k="start" aria-pressed="${!step.soundAtEnd}">As the line appears</button>
      <button class="btn small${step.soundAtEnd ? ' ink' : ' quiet'}" data-map-act="snd-when" data-k="end" aria-pressed="${!!step.soundAtEnd}">When the player moves on</button></div></div>` : '';
  const listen = step.sound ? `<button class="btn small quiet" data-act="snd-try" data-k="${esc(step.sound)}">▶ Listen</button>` : '';
  return `<label class="field"><span>Sound with this line</span>${soundSelect(ctx.project, 'm-sound', 'data-map-in="say-sound"', step.sound, 'No sound', who)}</label>${listen}${quick}${when}`;
}

/** A recorded or uploaded voice for the line. */
function voicePart(ctx: MapCtx, step: SayStep): string {
  const has = step.voice && ctx.project.sounds?.some(x => x.name === step.voice);
  return `<div class="field"><span>Voice</span>${has
    ? `<div class="row"><button class="btn small" data-act="voice-play">▶ Play the voice</button><button class="btn small quiet" data-map-act="voice-off">Remove</button></div>`
    : `<div class="row"><button class="btn small" data-act="voice-rec" id="voice-rec">🎤 Record</button><button class="btn small quiet" data-act="voice-upload">Upload a file</button></div><p class="hint">Record the line with your microphone. It plays as the line appears.</p>`}</div>`;
}

/** Other ways to say a line: picked at random, or in turn each time the line comes up. */
function altsPart(step: SayStep): string {
  const alts = step.alts ?? [];
  return `<p class="hint">Each time this line comes up, one of these is said. Good for things the player can click again.</p>
    <div class="altlist"><div class="altrow"><span>1</span><input type="text" value="${esc(step.text === '...' ? '' : step.text)}" disabled title="The line itself; change it in the panel"></div>
    ${alts.map((a, i) => `<div class="altrow"><span>${i + 2}</span><input type="text" id="m-alt-${i}" data-map-in="alt-text" data-k="${i}" value="${esc(a)}" placeholder="Another way to say it"><button class="btn small quiet" data-map-act="alt-remove" data-k="${i}" aria-label="Remove">✕</button></div>`).join('')}</div>
    <button class="btn small" data-map-act="alt-add">+ Another way to say it</button>
    ${alts.length ? `<div class="field"><span>Which one</span><div class="row"><button class="btn small${step.altMode === 'turn' ? ' quiet' : ' ink'}" data-map-act="alt-mode" data-k="random">At random</button><button class="btn small${step.altMode === 'turn' ? ' ink' : ' quiet'}" data-map-act="alt-mode" data-k="turn">In turn, the last one stays</button></div></div>` : ''}`;
}

export type LineWin = 'fx' | 'marks' | 'sound' | 'stage' | 'facts' | 'alts';

/**
 * The line's extras as one row of small pills that say what is set. Each opens
 * its own page inside the panel, so the panel itself stays short.
 */
function lineTools(ctx: MapCtx, step: SayStep, scene: Scene): string {
  const who = speakerOf(ctx.project, ctx.room, step.who).character;
  const facts = !!who?.facts?.some(d => d.kind !== 'word');
  const me = scene.chars.find(c => c.visible && lower(c.name) === lower(step.who));
  const pill = (k: LineWin, label: string, value: string, show = true) => show
    ? `<button class="pill${value ? ' set' : ''}" data-act="win" data-k="${k}" title="${esc(value ? `${label}: ${value}` : label)}"><b>${label}</b>${value ? `<span>${esc(value)}</span>` : ''}</button>` : '';
  return `<div class="pills" role="group" aria-label="More for this line">
    ${pill('fx', 'Effect', step.fx ?? '', !!step.who)}
    ${pill('marks', 'Marks', (step.marks ?? []).join(', '), !!step.who)}
    ${pill('sound', 'Sound', [step.sound ? `${step.sound}${step.soundAtEnd ? ' (end)' : ''}` : '', step.voice ? 'voice' : ''].filter(Boolean).join(' + '))}
    ${pill('alts', 'Variations', step.alts?.length ? `${step.alts.length + 1} ways` : '')}
    ${pill('stage', 'Stage', me ? `${spotText({ x: Math.round(me.x) }) || `${Math.round(me.x)}%`}${me.flip ? ', turned' : ''}` : step.who ? 'off' : '')}
    ${pill('facts', 'Story facts', '', facts)}
  </div>`;
}

/** A line tool's page, shown in the panel in place of the line, with a way back. */
function linePage(ctx: MapCtx, step: SayStep, scene: Scene): string {
  const titles: Record<LineWin, string> = { fx: `Effect on ${step.who}`, marks: `Marks on ${step.who}`, sound: 'Sound and voice', stage: 'On stage', facts: 'After this line', alts: 'Other ways to say it' };
  const w = ctx.win!;
  const body = w === 'fx' ? effectPart(step) : w === 'marks' ? marksPart(ctx, step) : w === 'sound' ? soundPart(ctx, step) + voicePart(ctx, step) : w === 'alts' ? altsPart(step)
    : w === 'stage' ? stageField(ctx, scene, step.who) : quickFacts(ctx, step);
  const said = step.text === '...' ? '' : step.text;
  return `<div class="drillh"><button class="mback" data-act="win" data-k="" aria-label="Back to the line">‹ Line</button><span class="drillof">${esc(step.who ? `${step.who}: ${said}` : said)}</span></div>
    <h2>${esc(titles[w])}</h2><div class="drillb">${body || '<p class="hint">Nothing to set here.</p>'}</div>`;
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
  return buttons ? `<div class="quick">${buttons}</div><p class="hint">Adds a Change for ${esc(who.name)}'s story facts right after this line.</p>` : '';
}

function stageField(ctx: MapCtx, scene: Scene, who: string): string {
  const me = scene.chars.find(c => c.visible && lower(c.name) === lower(who));
  const others = scene.chars.filter(c => c.visible && c !== me);
  const out = castNames(ctx).filter(n => !scene.chars.some(c => c.visible && lower(c.name) === lower(n)));
  const mine = me ? `
    <p class="hint">Drag ${esc(me.name)} in the scene to place ${esc(me.name)} for this line. The place holds until it changes.</p>
    ${spotButtons('stage-spot', me.x)}
    <button class="btn small" data-map-act="stage-path">✎ Draw a path for ${esc(me.name)}</button>
    <label class="field"><span>Size on stage</span><input type="range" id="m-ssize" data-map-in="stage-size" min="20" max="130" value="${me.size}"></label>
    <div class="row"><label class="check"><input type="checkbox" id="m-sflip" data-map-in="stage-flip"${me.flip ? ' checked' : ''}><span>Turn around</span></label></div>` : '';
  const people = others.length ? `<div class="label">Also on stage</div><div class="cast">${others.map(c =>
    `<span class="chip">${esc(c.name)} <button class="linkbtn" data-map-act="stage-hide" data-k="${esc(c.name)}">take out</button></span>`).join('')}</div>` : '';
  const bring = who.trim() || out.length ? `<label class="field"><span>Bring someone in for this line</span><select id="m-sshow" data-map-in="stage-show"><option value="">Choose…</option>${out.map(n => `<option>${esc(n)}</option>`).join('')}<option value="__new">+ New character from a picture…</option></select></label>` : '';
  return mine || people || bring ? `${mine}${people}${bring}` : '';
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

/* "Add a step": the four used most, then the rest in groups. One entry per line: kind, name, what it does, group. */
export type KindGroup = 'top' | 'talk' | 'stage' | 'sound' | 'flow';
export const KIND_GROUPS: [KindGroup, string][] = [['talk', 'Talk and logic'], ['stage', 'Stage and camera'], ['sound', 'Sound and interface'], ['flow', 'Flow']];
const kinds = (top: boolean, hasParts: boolean): [string, string, string, KindGroup][] => [
  ['say', 'Line', 'Someone says something, or a line of narration', 'top'],
  ['choice', 'Choice', 'The player picks one of several answers', 'top'],
  ['if', 'Only if', 'Take one path or another depending on story facts', 'top'],
  ['change', 'Change something', 'Change a story fact without saying anything', 'top'],
  ['item', 'Give or take an item', 'The player gets something, such as a key, or loses it', 'talk'],
  ['ask', 'Ask the player', 'The player types an answer, such as their name, kept as a story fact', 'talk'],
  ['quest', 'Move a quest on', 'Set a quest to one of its stages, such as Lost cat → Started', 'talk'],
  ['show', 'Bring someone in', 'A character comes on stage, with an effect', 'stage'],
  ['move', 'Move someone', 'Change where someone stands, their size, or turn them', 'stage'],
  ['hide', 'Take someone out', 'A character leaves the stage', 'stage'],
  ['mark', 'Put a mark on someone', 'An anger sign, a sweat drop or a puff that stays until taken off', 'stage'],
  ['path', 'Draw a path', 'Someone moves along a line you draw, while the lines go on', 'stage'],
  ['loop', 'Change how someone moves', 'Sway, bob, breathe or float while standing', 'stage'],
  ['camera', 'Camera', 'Zoom in on a spot, shake, flash, or back to the whole picture', 'stage'],
  ['music', 'Music', 'Start, change or stop the background music', 'sound'],
  ['sound', 'Sound', 'Play a sound, or stop one sound or all of them', 'sound'],
  ['panel', 'Show or hide a panel', 'An inventory, a status bar or another panel from Look › Interface', 'sound'],
  ['door', 'Go to another room', 'The player moves to another room', 'flow'],
  ...(top ? [['part', 'Part', 'A named point that "Go to a part" can jump to', 'flow'] as [string, string, string, KindGroup]] : []),
  ...(hasParts ? [['jump', 'Go to a part', 'Continue from a named part of this conversation', 'flow'] as [string, string, string, KindGroup]] : []),
  ['ending', 'Ending', 'One of the story\'s endings: shown to the player and counted on the title screen', 'flow'],
  ['end', 'End', 'The conversation closes here', 'flow']
];

/** The "Add a step" panel: a box to find a step by name, the four used most, then the groups. */
function addPanel(top: boolean, hasParts: boolean): string {
  const list = kinds(top, hasParts);
  const item = ([k, n, d]: [string, string, string, KindGroup]) =>
    `<button class="mk" data-map-act="insert" data-k="${k}" title="${esc(d)}" data-find="${esc(lower(`${n} ${d}`))}"><b>${esc(n)}</b><span>${esc(d)}</span></button>`;
  const groups = KIND_GROUPS.map(([g, title]) => {
    const items = list.filter(x => x[3] === g);
    return items.length ? `<div class="mgroup"><div class="label">${title}</div>${items.map(item).join('')}</div>` : '';
  }).join('');
  return `<div class="mhead"><h2>Add a step</h2><button class="btn small quiet" data-map-act="deselect">Cancel</button></div>
    <input type="search" id="m-kind-find" class="mfind" placeholder="Find a step" aria-label="Find a step" autocomplete="off" spellcheck="false">
    <div class="mkadd"><div class="mgroup mtop">${list.filter(x => x[3] === 'top').map(item).join('')}</div>${groups}
    <p class="hint mnone" hidden>No step has that name. Try another word.</p></div>`;
}

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
    return addPanel(list === '', s.parts.length > 0);
  }

  const [path, opt] = sel.split('#o');
  const step = getStep(steps, path);
  if (!step) return '<p class="hint">That step is gone. Click another box.</p>';
  const del = (label = 'Delete this step') => `<button class="btn small quiet danger mdel" data-map-act="delete" title="Delete (or press Delete)">${label}</button>`;
  const header = (t: string) => `<div class="mhead"><h2>${t}</h2><button class="btn small quiet" data-map-act="deselect">Done</button></div>`;

  if (opt !== undefined && step.t === 'choice') {
    const k = Number(opt), o = step.options[k];
    if (!o) return '';
    return `${header('Answer')}${facts}
      <label class="field"><span>What the player can answer</span><input type="text" id="m-opt" data-map-in="opt-text" value="${o.text === '...' ? '' : esc(o.text)}" placeholder="An answer"></label>
      ${effectRows(o.effects)}
      <div class="row"><label class="check"><input type="checkbox" data-map-act="opt-flag" data-k="once"${o.once ? ' checked' : ''}><span>Gone once it is picked</span></label></div>
      <div class="row"><label class="check"><input type="checkbox" data-map-act="opt-flag" data-k="fallback"${o.fallback ? ' checked' : ''}><span>Only when no other answer is left</span></label></div>
      <div class="row mmove"><span class="hint">Drag the answer in the map to change the order.</span><button class="btn small quiet micon" data-map-act="opt-move" data-k="-1" aria-label="Move left" title="Move left"${k === 0 ? ' disabled' : ''}>←</button><button class="btn small quiet micon" data-map-act="opt-move" data-k="1" aria-label="Move right" title="Move right"${k === step.options.length - 1 ? ' disabled' : ''}>→</button></div>
      <button class="btn small quiet danger mdel" data-map-act="opt-remove"${step.options.length < 2 ? ' disabled title="A choice needs at least one answer"' : ''}>Remove this answer</button>`;
  }

  switch (step.t) {
    case 'say': {
      const speakers = new Set([...ctx.room.els.filter(x => x.kind === 'char').map(x => x.name), ...ctx.project.characters.map(c => c.name)]);
      walkSteps(steps, x => { if (x.t === 'say' && x.who) speakers.add(x.who); });
      const scene = sceneAt(ctx, steps, path);
      if (ctx.win) return linePage(ctx, step, scene);
      return `${header('Line')}
        <label class="field"><span>Who speaks</span><input type="text" list="m-who" id="m-who-in" data-map-in="say-who" value="${esc(step.who)}" placeholder="Leave empty for narration"></label>
        <datalist id="m-who">${[...speakers].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        ${unknownSpeaker(ctx, step.who) ? `<p class="hint">No character is called "${esc(step.who)}", so this line is a voice without a picture. If it is narration, clear Who speaks.</p>` : ''}
        <label class="field"><span>${step.who ? 'What they say' : 'Narration'}</span><textarea id="m-text" data-map-in="say-text" rows="3" placeholder="Type the line here">${step.text === '...' ? '' : esc(step.text)}</textarea></label>
        ${lookField(ctx, step.who, step.expr)}
        ${lineTools(ctx, step, scene)}
        <div class="row mfoot"><button class="btn small" data-map-act="add-after">+ Line after this</button><button class="btn small quiet" data-act="play-here" title="Play the conversation from this line, with the scene as it stands here">▶ Play from here</button>${del('Delete')}</div>`;
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
        <p class="hint">Or drag ${esc(step.who)} in the scene.</p>`;
      return `${header(title)}${who}${look}${at}${fx}${del()}`;
    }
    case 'path': {
      const names = castNames(ctx);
      if (!names.some(n => lower(n) === lower(step.who))) names.push(step.who);
      const who = `<label class="field"><span>Who</span><select id="m-pwho" data-map-in="mk-who">${names.map(n => `<option${lower(n) === lower(step.who) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
      const pick = (act: string, cur: string, opts: [string, string][]) => `<div class="row">${opts.map(([k, n]) => `<button class="btn small${cur === k ? ' ink' : ' quiet'}" data-map-act="${act}" data-k="${k}" aria-pressed="${cur === k}">${n}</button>`).join('')}</div>`;
      const i = ctx.pathPt ?? -1, pt = step.points[i];
      const character = speakerOf(ctx.project, ctx.room, step.who).character;
      const point = pt ? `<div class="stagebox"><div class="mhead"><div class="label">Point ${i + 1} of ${step.points.length}</div><button class="btn small quiet" data-map-act="pt-done">Done</button></div>
        <label class="check"><input type="checkbox" id="m-pt-sizeon" data-map-in="pt-sizeon"${pt.size !== undefined ? ' checked' : ''}><span>Change size here</span></label>
        ${pt.size !== undefined ? `<input type="range" id="m-pt-size" data-map-in="pt-size" min="10" max="130" value="${pt.size}" aria-label="Size here">` : ''}
        <label class="check"><input type="checkbox" id="m-pt-fadeon" data-map-in="pt-fadeon"${pt.fade !== undefined ? ' checked' : ''}><span>Change how visible here</span></label>
        ${pt.fade !== undefined ? `<input type="range" id="m-pt-fade" data-map-in="pt-fade" min="0" max="100" value="${pt.fade}" aria-label="How visible here">` : ''}
        <label class="field"><span>Turn</span><select id="m-pt-flip" data-map-in="pt-flip"><option value=""${pt.flip === undefined ? ' selected' : ''}>No change</option><option value="true"${pt.flip === true ? ' selected' : ''}>Turn around</option><option value="false"${pt.flip === false ? ' selected' : ''}>Face forward</option></select></label>
        <label class="field"><span>Effect here</span><select id="m-pt-fx" data-map-in="pt-fx"><option value="">None</option>${LINE_EFFECTS.map(f => `<option${f === pt.fx ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
        ${character ? `<label class="field"><span>Look from here</span><select id="m-pt-look" data-map-in="pt-look"><option value="">No change</option>${['default', ...character.looks.filter(l => !l.once).map(l => l.name)].map(n => `<option${lower(n) === lower(pt.look ?? '') ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>` : ''}
        ${step.points.length > 2 ? '<button class="btn small danger" data-map-act="pt-remove">Remove this point</button>' : ''}</div>` : '<p class="hint">Click a dot on the path to change size, turn, an effect, how visible, or the look there.</p>';
      return `${header('Draw a path')}${who}
        <p class="hint">${esc(step.who)} moves along the line while the conversation goes on, until a step moves ${esc(step.who)} again.</p>
        <label class="field"><span>Takes ${step.secs} seconds</span><input type="range" id="m-psecs" data-map-in="path-secs" min="0.5" max="20" step="0.5" value="${step.secs}"></label>
        <div class="field"><span>Repeat</span>${pick('path-repeat', step.repeat ?? 'once', [['once', 'Once'], ['loop', 'Loop'], ['pingpong', 'Back and forth']])}</div>
        <div class="field"><span>Tempo</span>${pick('path-ease', step.ease ?? 'smooth', [['smooth', 'Smooth start and stop'], ['steady', 'Steady']])}</div>
        ${point}${del()}`;
    }
    case 'mark':
    case 'loop': {
      const names = castNames(ctx);
      if (!names.some(n => lower(n) === lower(step.who))) names.push(step.who);
      const who = `<label class="field"><span>Who</span><select id="m-mkwho" data-map-in="mk-who">${names.map(n => `<option${lower(n) === lower(step.who) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`;
      if (step.t === 'mark') {
        const what = `<div class="field"><span>${step.off ? 'Take off' : 'Mark'}</span><div class="quick markpick">${step.off ? `<button class="chip mchip${!step.mark ? ' on' : ''}" data-map-act="mk-pick" data-k="">All marks</button>` : ''}${allMarks(ctx.project).map(m =>
          `<button class="chip mchip${m.name === step.mark ? ' on' : ''}" data-map-act="mk-pick" data-k="${esc(m.name)}"><span class="mthumb">${markArt(m)}</span>${esc(m.name)}</button>`).join('')}</div></div>`;
        return `${header(step.off ? 'Take a mark off' : 'Put a mark on someone')}${who}${what}
          <div class="row"><button class="btn small${step.off ? ' quiet' : ' ink'}" data-map-act="mk-off" data-k="">Put it on</button><button class="btn small${step.off ? ' ink' : ' quiet'}" data-map-act="mk-off" data-k="1">Take it off</button></div>
          <p class="hint">${step.off ? 'From here on the mark is gone.' : 'The mark stays from here on, until a step takes it off or the conversation ends. For one line only, pick marks in that line instead.'}</p>${del()}`;
      }
      const m = step.move;
      const lvl = (key: 'strength' | 'speed', label: string, lo: string, hi: string) => `<label class="field fxs"><span>${label}</span><input type="range" id="m-lp-${key}" data-map-in="lp-${key}" min="1" max="5" value="${m[key] ?? 3}"><span class="fxends"><i>${lo}</i><i>${hi}</i></span></label>`;
      return `${header('Change how someone moves')}${who}
        <label class="field"><span>While standing</span><select id="m-lpmove" data-map-in="lp-move">${['none', ...IDLE_MOVES].map(x => `<option value="${x}"${x === m.move ? ' selected' : ''}>${x === 'none' ? 'Stands still' : x}</option>`).join('')}</select></label>
        ${m.move !== 'none' ? `<div class="fxgrid two">${lvl('strength', 'Strength', 'gentle', 'strong')}${lvl('speed', 'Speed', 'slow', 'fast')}</div>` : ''}
        <p class="hint">From here on; the scene above shows it.</p>${del()}`;
    }
    case 'choice':
      return `${header('Choice')}
        <p class="hint">The player picks one answer. Each answer can lead its own way, and paths that do not end meet again below.</p>
        <div class="field"><span>Answers</span>${step.options.map((o, k) => `<button class="mkind" data-map-act="sel" data-k="${path}#o${k}"><b>${o.text === '...' ? 'Empty answer' : esc(o.text)}</b>${o.effects.length ? `<span>${esc(o.effects.map(effectText).join(', '))}</span>` : ''}</button>`).join('')}</div>
        <div class="row"><button class="btn small" data-map-act="add-answer" data-k="${path}">+ Answer</button>${del('Delete the whole choice')}</div>`;
    case 'if':
      return `${header('Only if')}
        <p class="hint">The Yes path runs when this is true, and the Otherwise path runs when it is not.</p>
        <div class="field"><span>${step.cond.quest ? 'Quest' : 'Story fact or quest'}</span>${condRow(ctx.project, step.cond, 'm-cond', f => `data-map-in="cond-${f}"`)}</div>
        ${del('Delete this condition and both paths')}`;
    case 'quest': {
      const q = findQuest(ctx.project, step.quest);
      const names = (ctx.project.quests ?? []).map(x => x.name);
      if (!q) names.push(step.quest);
      const stages = q ? [...q.stages] : [];
      if (!q || stageIndex(q, step.stage) < 0) stages.push(step.stage);
      return `${header('Move a quest on')}
        <label class="field"><span>Quest</span><select id="m-quest" data-map-in="quest-name">${names.map(n => `<option${lower(n) === lower(q?.name ?? step.quest) ? ' selected' : ''}>${esc(n)}</option>`).join('')}<option value="__new">+ New quest…</option></select></label>
        <label class="field"><span>Is now at</span><select id="m-qstage" data-map-in="quest-stage">${stages.map(n => `<option${lower(n) === lower(step.stage) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <p class="hint">From here on the quest is at this stage. Rooms, figures and conversations can depend on it.${q ? ` <button class="linkbtn" data-act="quest-open" data-k="${esc(q.id)}">See ${esc(q.name)} in Quests</button>` : ''}</p>${del()}`;
    }
    case 'change':
      if (itemStepText(ctx.project, step)) return itemStepPanel(ctx.project, step, header, del());
      return `${header('Change something')}${facts}${effectRows(step.effects)}${del()}`;
    case 'music':
      return `${header('Music')}
        <p class="hint">The background music from this step on. It keeps playing after the conversation, until a room or another Music step changes it.</p>
        <label class="field"><span>Track</span>${musicSelect(ctx.project, 'm-music', 'data-map-in="music-track"', step.track, [['', 'Silence']])}</label>
        ${step.track ? `<div class="row"><label class="check"><input type="checkbox" id="m-music-once" data-map-in="music-once"${step.once ? ' checked' : ''}><span>Play once instead of looping</span></label></div>` : ''}
        ${del()}`;
    case 'panel': {
      const names = (ctx.project.panels ?? []).map(x => x.name);
      if (!names.some(n => lower(n) === lower(step.name))) names.push(step.name);
      return `${header(step.show ? 'Show a panel' : 'Hide a panel')}
        <div class="row"><button class="btn small${step.show ? ' ink' : ' quiet'}" data-map-act="pnl-show" data-k="1" aria-pressed="${step.show}">Show</button><button class="btn small${step.show ? ' quiet' : ' ink'}" data-map-act="pnl-show" data-k="" aria-pressed="${!step.show}">Hide</button></div>
        <label class="field"><span>Panel</span><select id="m-pnl" data-map-in="pnl-name">${names.map(n => `<option${lower(n) === lower(step.name) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <p class="hint">${ctx.project.panels?.length ? 'It stays that way until another step, or the player, changes it.' : 'Your game has no panels yet. Make them under Look › Interface.'}</p>${del()}`;
    }
    case 'sound': {
      const mode = !step.stop ? 'play' : step.name ? 'stop' : 'all';
      const pick = `<div class="row">${([['play', 'Play a sound'], ['stop', 'Stop a sound'], ['all', 'Stop all sounds']] as const).map(([k, n]) => `<button class="btn small${mode === k ? ' ink' : ' quiet'}" data-map-act="snd-mode" data-k="${k}" aria-pressed="${mode === k}">${n}</button>`).join('')}</div>`;
      const has = (ctx.project.sounds ?? []).some(x => !x.music);
      const which = mode === 'all' ? '' : `<label class="field"><span>${mode === 'play' ? 'Sound' : 'Which sound to stop'}</span>${soundSelect(ctx.project, 'm-snd', 'data-map-in="snd-name"', step.name === '...' ? '' : step.name, 'Choose…')}</label>
        ${step.name && step.name !== '...' && mode === 'play' ? `<button class="btn small quiet" data-act="snd-try" data-k="${esc(step.name)}">▶ Listen</button>` : ''}`;
      const opts = mode === 'play' ? `<div class="row"><label class="check"><input type="checkbox" id="m-snd-loop" data-map-in="snd-loop"${step.loop ? ' checked' : ''}><span>Keep playing until it is stopped</span></label></div>`
        : mode === 'all' ? `<div class="row"><label class="check"><input type="checkbox" id="m-snd-music" data-map-in="snd-music"${step.music ? ' checked' : ''}><span>Stop the music too</span></label></div>` : '';
      const hint = mode === 'play' ? (step.loop ? 'It loops until a Stop step or until the player leaves the room.' : 'It plays once, while the conversation goes on.')
        : mode === 'stop' ? 'Stops that sound if it is playing, for example one that loops.' : 'Stops every sound and voice that is playing.';
      return `${header(mode === 'play' ? 'Sound' : 'Stop sound')}${pick}${which}${opts}<p class="hint">${hint}${has ? '' : ' Add sounds under Pictures &amp; sounds first.'}</p>${del()}`;
    }
    case 'door':
      return `${header('Go to another room')}
        <label class="field"><span>Room</span><select id="m-room" data-map-in="door-room">${ctx.project.rooms.map(r => `<option${lower(r.name) === lower(step.room) ? ' selected' : ''}>${esc(r.name)}</option>`).join('')}${ctx.project.rooms.some(r => lower(r.name) === lower(step.room)) ? '' : `<option selected>${esc(step.room)}</option>`}</select></label>
        <label class="field"><span>How the picture changes</span><select id="m-doorfx" data-map-in="door-fx">${[['', 'Straight away'], ['fade', 'Fade'], ['black', 'Fade through black'], ['slide left', 'Slide to the left'], ['slide right', 'Slide to the right']].map(([v, l]) => `<option value="${v}"${(step.fx ?? '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
        <p class="hint">The conversation stops and the player moves there.</p>${del()}`;
    case 'ask':
      return `${header('Ask the player')}
        <label class="field"><span>Question</span><input type="text" id="m-askq" data-map-in="ask-prompt" value="${esc(step.prompt)}"></label>
        <label class="field"><span>Keep the answer as</span><input type="text" id="m-askf" data-map-in="ask-fact" value="${esc(step.fact)}" placeholder="name"></label>
        <p class="hint">Use the answer in any line as {${esc(step.fact)}}, for example "Nice to meet you, {${esc(step.fact)}}."</p>${del()}`;
    case 'ending':
      return `${header('Ending')}
        <label class="field"><span>Name of this ending</span><input type="text" id="m-ending" data-map-in="ending-name" value="${esc(step.name)}"></label>
        <p class="hint">The story stops here and shows the ending. The title screen of the game counts the endings a player has found.</p>${del()}`;
    case 'camera': {
      const pick = (cur: string, opts: [string, string][]) => `<div class="row">${opts.map(([k, n]) => `<button class="btn small${cur === k ? ' ink' : ' quiet'}" data-map-act="cam-action" data-k="${k}">${n}</button>`).join('')}</div>`;
      return `${header('Camera')}${pick(step.action, [['zoom', 'Zoom in'], ['shake', 'Shake'], ['flash', 'Flash'], ['reset', 'Whole picture']])}
        ${step.action === 'zoom' ? `<label class="field"><span>How close: ×${step.scale ?? 1.5}</span><input type="range" id="m-camz" data-map-in="cam-scale" min="1.1" max="3" step="0.1" value="${step.scale ?? 1.5}"></label>
        <label class="field"><span>Toward, from left to right</span><input type="range" id="m-camx" data-map-in="cam-x" min="0" max="100" value="${step.x ?? 50}"></label>
        <label class="field"><span>Toward, from top to bottom</span><input type="range" id="m-camy" data-map-in="cam-y" min="0" max="100" value="${step.y ?? 50}"></label>
        <p class="hint">The zoom holds until a "Whole picture" step or the end of the conversation.</p>` : ''}${del()}`;
    }
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
    case 'item': return newItemStep(ctx.project);
    case 'quest': {
      const q = ctx.project.quests?.[0] ?? (ctx.project.quests ??= [], ctx.project.quests[ctx.project.quests.push(newQuest(ctx.project)) - 1]);
      return { t: 'quest', quest: q.name, stage: q.stages[1] ?? q.stages[0] };
    }
    case 'music': return { t: 'music', track: (ctx.project.sounds ?? []).find(x => x.music)?.name ?? '' };
    case 'panel': return { t: 'panel', name: ctx.project.panels?.[0]?.name ?? 'Inventory', show: true };
    case 'sound': return { t: 'sound', name: (ctx.project.sounds ?? []).find(x => !x.music)?.name ?? '...' };
    case 'door': return { t: 'door', room: other.name };
    case 'ask': return { t: 'ask', prompt: 'What is your name?', fact: 'name' };
    case 'ending': return { t: 'ending', name: 'The end' };
    case 'camera': return { t: 'camera', action: 'zoom', scale: 1.5, x: 50, y: 40 };
    case 'jump': return { t: 'jump', part: parts[0] ?? 'Start' };
    case 'end': return { t: 'end' };
    case 'part': {
      let n = parts.length + 1;
      while (parts.some(p => lower(p) === `part ${n}`)) n++;
      return { t: 'part', name: `Part ${n}` };
    }
    case 'show': return { t: 'show', who: castNames(ctx).find(n => lower(n) !== lower(ctx.el.name)) ?? ctx.el.name, look: '', at: { x: 70 }, fx: 'fade' };
    case 'move': return { t: 'move', who: ctx.el.kind === 'char' ? ctx.el.name : castNames(ctx)[0] ?? 'Someone', at: { x: 50 } };
    case 'mark': return { t: 'mark', who: ctx.el.kind === 'char' ? ctx.el.name : castNames(ctx)[0] ?? 'Someone', mark: 'anger' };
    case 'path': {
      const who = ctx.el.kind === 'char' ? ctx.el.name : castNames(ctx)[0] ?? 'Someone';
      return { t: 'path', who, secs: 3, points: [{ x: 30, y: 98 }, { x: 70, y: 98 }] };
    }
    case 'loop': return { t: 'loop', who: ctx.el.kind === 'char' ? ctx.el.name : castNames(ctx)[0] ?? 'Someone', move: { move: 'sway' } };
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
      // The step that took its place stays selected, or the one before, so Delete can be pressed again.
      return commit(target[index] ? path : index > 0 ? stepPathOf(list, index - 1) : null);
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
    case 'opt-reorder': {
      // Dragging an answer sideways: k is "<choice path>|<from>|<index to put it before>".
      const [cp, from, to] = k.split('|');
      const step = getStep(steps, cp) as ChoiceStep | null;
      const i = Number(from);
      let at = Number(to);
      if (step?.t !== 'choice' || !step.options[i] || !Number.isInteger(at) || at < 0 || at > step.options.length) return undefined;
      if (at > i) at--;
      if (at === i) return undefined;
      const [moved] = step.options.splice(i, 1);
      step.options.splice(at, 0, moved);
      return commit(`${cp}#o${at}`);
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
    case 'stage-path': {
      const { list, index } = splitPath(path);
      const target = getList(steps, list), cur = getStep(steps, path);
      if (!target || cur?.t !== 'say' || !cur.who) return undefined;
      const me = sceneAt(ctx, steps, path).chars.find(c => lower(c.name) === lower(cur.who));
      const x = me?.x ?? 50, y = me?.y ?? 98;
      target.splice(index, 0, { t: 'path', who: cur.who, secs: 3, points: [{ x, y }, { x: Math.min(95, x + 20), y }] });
      return commit(stepPathOf(list, index));
    }
    case 'alt-add': case 'alt-remove': case 'alt-mode': case 'voice-off': {
      const step = getStep(steps, path);
      if (step?.t !== 'say') return undefined;
      if (act === 'alt-add') { step.alts = [...(step.alts ?? []), '...']; step.altMode ??= 'random'; }
      if (act === 'alt-remove') { step.alts = (step.alts ?? []).filter((_, i) => i !== Number(k)); if (!step.alts.length) { delete step.alts; delete step.altMode; } }
      if (act === 'alt-mode') step.altMode = k === 'turn' ? 'turn' : 'random';
      if (act === 'voice-off') delete step.voice;
      return commit(ctx.sel);
    }
    case 'reorder': {
      // Dragging a row in a box: k is "<from path>|<index to put it before>", in the same list.
      const [from, to] = k.split('|');
      const { list, index } = splitPath(from);
      const target = getList(steps, list);
      let at = Number(to);
      if (!target || !target[index] || !Number.isInteger(at) || at < 0 || at > target.length) return undefined;
      if (at > index) at--;
      if (at === index) return undefined;
      const [moved] = target.splice(index, 1);
      target.splice(at, 0, moved);
      const wasSel = ctx.sel === from;
      return commit(wasSel || !ctx.sel ? stepPathOf(list, at) : ctx.sel);
    }
    case 'item-give': return itemStepGive(getStep(steps, path), !!k) ? commit(ctx.sel) : undefined;
    case 'pnl-show': {
      const step = getStep(steps, path);
      if (step?.t !== 'panel') return undefined;
      step.show = !!k;
      return commit(ctx.sel);
    }
    case 'snd-when': {
      const step = getStep(steps, path);
      if (step?.t !== 'say') return undefined;
      if (k === 'end') step.soundAtEnd = true; else delete step.soundAtEnd;
      return commit(ctx.sel);
    }
    case 'snd-mode': {
      const step = getStep(steps, path);
      if (step?.t !== 'sound') return undefined;
      if (k === 'play') { delete step.stop; delete step.music; if (!step.name) step.name = (ctx.project.sounds ?? []).find(x => !x.music)?.name ?? '...'; }
      if (k === 'stop') { step.stop = true; delete step.loop; delete step.music; if (!step.name) step.name = (ctx.project.sounds ?? []).find(x => !x.music)?.name ?? '...'; }
      if (k === 'all') { step.stop = true; step.name = ''; delete step.loop; }
      return commit(ctx.sel);
    }
    case 'cam-action': {
      const step = getStep(steps, path);
      if (step?.t !== 'camera') return undefined;
      step.action = k as 'zoom';
      if (k === 'zoom') { step.scale ??= 1.5; step.x ??= 50; step.y ??= 40; } else { delete step.scale; delete step.x; delete step.y; }
      return commit(ctx.sel);
    }
    case 'opt-flag': {
      const step = getStep(steps, path) as ChoiceStep | null;
      const o = step?.t === 'choice' ? step.options[Number(opt)] : undefined;
      if (!o) return undefined;
      if (k === 'once') { if (o.once) delete o.once; else o.once = true; }
      if (k === 'fallback') { if (o.fallback) delete o.fallback; else o.fallback = true; }
      return commit(ctx.sel);
    }
    case 'path-repeat': case 'path-ease': {
      const step = getStep(steps, path);
      if (step?.t !== 'path') return undefined;
      if (act === 'path-repeat') { if (k === 'loop' || k === 'pingpong') step.repeat = k; else delete step.repeat; }
      else { if (k === 'steady') step.ease = 'steady'; else delete step.ease; }
      return commit(ctx.sel);
    }
    case 'pt-remove': {
      const step = getStep(steps, path);
      if (step?.t !== 'path' || ctx.pathPt == null || step.points.length <= 2) return undefined;
      step.points.splice(ctx.pathPt, 1);
      return commit(ctx.sel);
    }
    case 'mk-pick': {
      const step = getStep(steps, path);
      if (step?.t !== 'mark') return undefined;
      step.mark = k;
      return commit(ctx.sel);
    }
    case 'mk-off': {
      const step = getStep(steps, path);
      if (step?.t !== 'mark') return undefined;
      if (k) step.off = true; else { delete step.off; if (!step.mark) step.mark = 'anger'; }
      return commit(ctx.sel);
    }
    case 'line-mark': {
      const step = getStep(steps, path);
      if (step?.t !== 'say') return undefined;
      const list = (step.marks ?? []).filter(x => lower(x) !== lower(k));
      if (list.length === (step.marks ?? []).length) list.push(lower(k));
      step.marks = list.length ? list : undefined;
      return commit(ctx.sel);
    }
    case 'say-fx-pick': {
      const step = getStep(steps, path);
      if (step?.t !== 'say') return undefined;
      step.fx = k || undefined;
      if (!k) delete step.fxOpts;
      return commit(ctx.sel);
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
  if (field.startsWith('item-')) { if (!itemStepInput(ctx.project, step, field, value)) return undefined; ctx.el.script = writeScript(steps); return { sel: ctx.sel, panel: true }; }

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
    if (field === 'say-sound') { panel = !step.sound !== !value; step.sound = value || undefined; if (!value) delete step.soundAtEnd; }
    if (field === 'alt-text' && step.alts) step.alts[Number(k)] = text.trim() || '...';
    if (field === 'say-who') { panel = !step.who !== !value.trim(); step.who = value; if (!value.trim()) step.expr = ''; }
    if (field === 'say-expr') step.expr = value;
    if (field === 'say-text') step.text = text.trim() ? text : '...';
  } else if (step.t === 'choice' && field === 'opt-text') {
    const o = step.options[Number(opt)];
    if (o) o.text = text.trim() ? text : '...';
  } else if (step.t === 'if' && field.startsWith('cond-')) {
    const res = editCondition(ctx.project, step.cond, field.slice(5), value);
    step.cond = res.cond;
    panel = res.redraw;
  } else if (step.t === 'quest' && field.startsWith('quest-')) {
    if (field === 'quest-name') {
      const q = value === '__new' ? ctx.project.quests![ctx.project.quests!.push(newQuest(ctx.project)) - 1] : findQuest(ctx.project, value);
      if (!q) return undefined;
      step.quest = q.name;
      if (stageIndex(q, step.stage) < 0) step.stage = q.stages[1] ?? q.stages[0];
      panel = true;
    }
    if (field === 'quest-stage') step.stage = value;
  } else if (step.t === 'path' && (field === 'path-secs' || field.startsWith('pt-'))) {
    if (field === 'path-secs') step.secs = Math.max(0.5, Number(value) || 3);
    const pt = step.points[ctx.pathPt ?? -1];
    if (pt) {
      if (field === 'pt-sizeon') { if (value === 'true') pt.size = Math.round(sceneAt(ctx, steps, path).chars.find(c => lower(c.name) === lower(step.who))?.size ?? 76); else delete pt.size; panel = true; }
      if (field === 'pt-size') pt.size = Number(value);
      if (field === 'pt-fadeon') { if (value === 'true') pt.fade = 50; else delete pt.fade; panel = true; }
      if (field === 'pt-fade') pt.fade = Number(value);
      if (field === 'pt-flip') { if (value) pt.flip = value === 'true'; else delete pt.flip; }
      if (field === 'pt-fx') { if (value) pt.fx = value; else delete pt.fx; }
      if (field === 'pt-look') { if (value) pt.look = value; else delete pt.look; }
    }
  } else if ((step.t === 'mark' || step.t === 'loop' || step.t === 'path') && field === 'mk-who') {
    step.who = value;
  } else if (step.t === 'loop' && field.startsWith('lp-')) {
    if (field === 'lp-move') { panel = (step.move.move === 'none') !== (value === 'none'); step.move = value === 'none' ? { move: 'none' } : { ...step.move, move: value }; }
    else {
      const key = field.slice(3) as 'strength' | 'speed';
      const n = Number(value);
      if (n === 3) delete step.move[key]; else step.move[key] = n;
    }
  } else if (step.t === 'panel' && field === 'pnl-name') {
    step.name = value;
  } else if (step.t === 'sound') {
    if (field === 'snd-name') { panel = true; step.name = value || '...'; }
    if (field === 'snd-loop') { if (value === 'true') step.loop = true; else delete step.loop; panel = true; }
    if (field === 'snd-music') { if (value === 'true') step.music = true; else delete step.music; }
  } else if (step.t === 'music') {
    if (field === 'music-track') { panel = !step.track !== !value; step.track = value; if (!value) delete step.once; }
    if (field === 'music-once') { if (value === 'true') step.once = true; else delete step.once; }
  } else if (step.t === 'door' && field === 'door-room') {
    step.room = value;
  } else if (step.t === 'door' && field === 'door-fx') {
    if (value) step.fx = value as DoorStep['fx']; else delete step.fx;
  } else if (step.t === 'ask') {
    if (field === 'ask-prompt') step.prompt = text.trim() || 'What is your name?';
    if (field === 'ask-fact') step.fact = factName(value) || 'answer';
  } else if (step.t === 'ending' && field === 'ending-name') {
    step.name = text.trim() || 'The end';
  } else if (step.t === 'camera') {
    if (field === 'cam-scale') step.scale = Number(value);
    if (field === 'cam-x') step.x = Number(value);
    if (field === 'cam-y') step.y = Number(value);
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
