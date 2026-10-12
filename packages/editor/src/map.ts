/**
 * The conversation map: the same conversation as the script, drawn as boxes.
 *
 * The map is laid out automatically, top to bottom. Lines in a row share one card,
 * a choice or an "Only if" splits into columns, and the columns meet again below
 * where the paths continue together. Edits made here rewrite the script, so the
 * script and the map always show the same conversation.
 */
import { CONDITION_WORDS, conditionText, effectText, getList, getStep, parseScript, splitPath, stepPathOf, summarize, toValue, valueText, walkSteps, writeScript } from '@story-engine/engine-core';
import type { ChoiceStep, CompareOp, Effect, Project, Room, Step, StoryElement } from '@story-engine/engine-core';
import { EXPRESSIONS, esc, sayHTML, stageHTML } from '@story-engine/runtime';

export interface MapCtx {
  project: Project;
  room: Room;
  el: StoryElement;
  /** What is selected: a step path, "<path>#o<k>" for an answer, or "add:<list>:<index>". */
  sel: string | null;
}

/* ---------- Drawing ---------- */

interface Model { edges: [string, string][]; jumps: [string, string][]; parts: Map<string, string> }
let model: Model = { edges: [], jumps: [], parts: new Map() };
let nextId = 0;

const lower = (s: string) => s.trim().toLowerCase();
const LINE_KINDS = new Set(['say', 'change', 'note']);
const TERMINAL = new Set(['door', 'end', 'jump']);

export function startLabel(room: Room, el: StoryElement): string {
  const first = room.auto && room.els.find(x => x.script.trim());
  return first === el ? `Starts as soon as the player enters ${room.name}` : `Starts when the player clicks ${el.name}`;
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

  const addButton = (list: string, index: number, label = '') => readOnly ? '' :
    `<button class="madd${label ? ' wide' : ''}${on(`add:${list}:${index}`)}" data-map-act="sel" data-k="add:${list}:${index}" aria-label="Add a step here" title="Add a step here">${label || '+'}</button>`;

  const row = (s: Step, path: string): string => {
    const attrs = `class="mrow k-${s.t}${on(path)}"${pick(path)}`;
    if (s.t === 'say') {
      const text = s.text === '...' ? '<em>Empty line</em>' : esc(s.text);
      return s.who
        ? `<button ${attrs}><span class="who">${esc(s.who)}</span>${s.expr ? `<span class="expr">${esc(s.expr)}</span>` : ''}<span class="txt">${text}</span></button>`
        : `<button ${attrs}><span class="txt narr">${text}</span></button>`;
    }
    if (s.t === 'change') return `<button ${attrs}><span class="tag">Change</span><span class="txt">${esc(s.effects.map(effectText).join(', '))}</span></button>`;
    if (s.t === 'note') return `<button ${attrs}><span class="tag">Note</span><span class="txt">${esc(s.text)}</span></button>`;
    return '';
  };

  function flow(list: Step[], lp: string, entries: string[], reachable: boolean, top: boolean): { html: string; exits: string[] } {
    let html = addButton(lp, 0, top && !list.length ? '+ Add the first line' : '');
    let ents = entries;
    let reach = reachable;
    let i = 0;
    while (i < list.length) {
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
        i++;
      } else if (s.t === 'part') {
        html += `<button class="mnode part${dim}${on(path)}" id="${nid}"${pick(path)}><span class="tag">Part</span>${esc(s.name)}</button>`;
        model.parts.set(lower(s.name), nid);
        link(ents, nid);
        ents = [nid];
        i++;
      } else {
        const label = s.t === 'door' ? `<span class="tag">Go to</span>${esc(s.room)}`
          : s.t === 'jump' ? `<span class="tag">Go to part</span>${esc(s.part)}`
          : 'End';
        html += `<button class="mnode cap ${s.t}${dim}${on(path)}" id="${nid}"${pick(path)}>${label}</button>`;
        if (s.t === 'jump') model.jumps.push([nid, lower(s.part)]);
        link(ents, nid);
        ents = [];
        i++;
      }
      if (TERMINAL.has(s.t) && !top) continue;
      html += addButton(lp, i);
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
  return `${banner}<div class="mscroll"><div class="mcanvas" id="mcanvas"><svg class="medges" id="medges" aria-hidden="true"></svg>
    <div class="mflow top"><div class="mnode start" id="${startId}">${esc(startLabel(ctx.room, ctx.el))}</div>${body.html}</div></div></div>`;
}

/** Draws the connecting lines once the boxes are laid out. */
export function drawEdges(): void {
  const canvas = document.getElementById('mcanvas');
  const svg = document.getElementById('medges');
  if (!canvas || !svg) return;
  const base = canvas.getBoundingClientRect();
  const box = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { l: r.left - base.left, r: r.right - base.left, t: r.top - base.top, b: r.bottom - base.top, cx: (r.left + r.right) / 2 - base.left, cy: (r.top + r.bottom) / 2 - base.top };
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
  canvas.querySelectorAll<HTMLElement>('.mnode').forEach(n => { right = Math.max(right, n.getBoundingClientRect().right - base.left); });
  model.jumps.forEach(([from, part], k) => {
    const a = box(from), target = model.parts.get(part), b = target ? box(target) : null;
    if (!a || !b) return;
    const x = right + 24 + k * 12;
    paths += `<path class="jump" d="M${a.r} ${a.cy}H${x}V${b.cy}H${b.r + 2}" marker-end="url(#m-jump)"/>`;
  });
  svg.setAttribute('width', String(canvas.scrollWidth));
  svg.setAttribute('height', String(canvas.scrollHeight));
  svg.innerHTML = `<defs><marker id="m-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="head"/></marker><marker id="m-jump" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="jhead"/></marker></defs>${paths}`;
}

/* ---------- Side panel ---------- */

function allFacts(p: Project): string[] {
  const set = new Set<string>();
  p.rooms.forEach(r => r.els.forEach(e => summarize(parseScript(e.script).steps).facts.forEach(f => set.add(f))));
  return [...set].sort();
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

function preview(ctx: MapCtx, who: string, expr: string, text: string): string {
  const speaker = ctx.room.els.find(x => lower(x.name) === lower(who));
  const game = sayHTML(who, text === '...' ? '' : text, false);
  return `<div class="mpreview">${stageHTML(ctx.room, { mode: 'look', look: ctx.project.look, expr: speaker && expr ? { [speaker.id]: expr } : {}, game })}</div>`;
}

const kinds = (top: boolean, hasParts: boolean) => [
  ['say', 'Line', 'Someone says something, or a line of narration'],
  ['choice', 'Choice', 'The player picks one of several answers'],
  ['if', 'Only if', 'Take one path or another depending on story facts'],
  ['change', 'Change something', 'Change a story fact without saying anything'],
  ['door', 'Go to another room', 'The player moves to another room'],
  ...(hasParts ? [['jump', 'Go to a part', 'Continue from a named part of this conversation']] : []),
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
      const speakers = new Set(ctx.room.els.filter(x => x.kind === 'char').map(x => x.name));
      walkSteps(steps, x => { if (x.t === 'say' && x.who) speakers.add(x.who); });
      return `${header('Line')}${preview(ctx, step.who, step.expr, step.text)}
        <label class="field"><span>Who speaks</span><input type="text" list="m-who" id="m-who-in" data-map-in="say-who" value="${esc(step.who)}" placeholder="Leave empty for narration"></label>
        <datalist id="m-who">${[...speakers].map(n => `<option value="${esc(n)}">`).join('')}</datalist>
        ${step.who ? `<label class="field"><span>Expression</span><select id="m-expr" data-map-in="say-expr"><option value="">No change</option>${EXPRESSIONS.map(x => `<option${x === step.expr ? ' selected' : ''}>${x}</option>`).join('')}</select></label>` : ''}
        <label class="field"><span>${step.who ? 'What they say' : 'Narration'}</span><textarea id="m-text" data-map-in="say-text" rows="3" placeholder="Type the line here">${step.text === '...' ? '' : esc(step.text)}</textarea></label>
        <div class="row"><button class="btn small" data-map-act="add-after">+ Line after this</button>${del()}</div>`;
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
  } else if (step.t === 'say') {
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
