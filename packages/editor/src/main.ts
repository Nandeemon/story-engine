import '@story-engine/runtime/game.css';
import './editor.css';
import { walkSteps, characterOf, cleanLookName, createProject, createRoom, findLook, findRoomByName, newId, normalizeProject, parseScript, renameLookInScript, renameRoomInScript, renameSpeakerInScript, uniqueLookName, writeScript, getStep } from '@story-engine/engine-core';
import type { Character, CharacterLook, Project, Room, StoryElement } from '@story-engine/engine-core';
import { BACKDROPS, CHARACTERS, OBJECTS, backdropHTML, createPlayer, elementArt, esc, lookStyle, sayHTML } from '@story-engine/runtime';
import type { Player, PlayState } from '@story-engine/runtime';
import { loadProject, sampleProject, saveProject } from './store';
import { inserts, scriptStatus, viewConvo, viewLook, viewMap, viewPlay, viewRoom } from './views';
import type { Adding, ConvoMode, UI, View } from './views';
import { applyZoom, drawEdges, mapAction, mapHTML, mapInput, mapSide, mapView, openView, setZoom } from './map';
import type { MapCtx, MapResult } from './map';
import { readProjectFile, saveToFile } from './files';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s);

let project: Project = createProject();
const ui: UI = { view: 'room', roomId: project.rooms[0].id, sel: null, adding: null, confirmReset: false, back: 'room', lookEdit: null };
let player: Player | null = null;

const MODE_KEY = 'story-engine:convo-mode';
let convoMode: ConvoMode = 'map';
try { if (localStorage.getItem(MODE_KEY) === 'script') convoMode = 'script'; } catch { /* default to the map */ }
let mapSel: string | null = null;
/** Set when a conversation is opened, so the map opens on its start. */
let freshConvo = false;

const room = (): Room => project.rooms.find(r => r.id === ui.roomId) ?? project.rooms[0];
const selected = (): StoryElement | undefined => room().els.find(e => e.id === ui.sel);

/* ---------- Saving ---------- */

/**
 * One-off pictures that no line uses any more are let go, so they do not linger.
 * This runs only when a project is opened or saved to a file, never while the
 * author is typing: a line can be unreadable for a moment while it is retyped.
 */
function pruneOncePictures(): void {
  for (const c of project.characters) {
    if (!c.looks.some(l => l.once)) continue;
    const used = new Set<string>();
    const who = c.name.trim().toLowerCase();
    for (const r of project.rooms) for (const el of r.els) {
      walkSteps(parseScript(el.script).steps, st => { if (st.t === 'say' && st.who.trim().toLowerCase() === who) used.add(st.expr.trim().toLowerCase()); });
    }
    c.looks = c.looks.filter(l => !l.once || used.has(l.name.toLowerCase()) || l.id === ui.lookEdit);
  }
}

function save(): void {
  void saveProject(project).then(ok => {
    const warn = $('#savewarn');
    if (warn) warn.hidden = ok;
  });
}

let toastTimer = 0;
function toast(text: string): void {
  const t = $('#toast');
  if (!t) return;
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- Undo and redo, for the whole project ----------
   Every change is recorded as a copy of the project from before it. */

const past: string[] = [];
const future: string[] = [];
/* Images are kept once, by key, so undo copies hold only the story itself. */
const images = new Map<string, string>();
const imageKeys = new Map<string, string>();
const IMG = '\u00a7img:';
const snapshot = () => JSON.stringify(project, (_k, v) => {
  if (typeof v !== 'string' || !v.startsWith('data:')) return v;
  let key = imageKeys.get(v);
  if (!key) { key = IMG + images.size; images.set(key, v); imageKeys.set(v, key); }
  return key;
});
const fromSnapshot = (json: string) => JSON.parse(json, (_k, v) => (typeof v === 'string' && v.startsWith(IMG) ? images.get(v) ?? '' : v));

function record(before: string | null): void {
  if (before === null || before === snapshot()) return;
  past.push(before);
  if (past.length > 80) past.shift();
  future.length = 0;
  syncUndo();
}

function syncUndo(): void {
  const u = $<HTMLButtonElement>('[data-act="undo"]'), r = $<HTMLButtonElement>('[data-act="redo"]');
  if (u) u.disabled = !past.length;
  if (r) r.disabled = !future.length;
}

function restore(json: string, message: string): void {
  const p = normalizeProject(fromSnapshot(json));
  if (!p) return;
  // A field visit in progress belongs to the state being left.
  fieldSnapshot = null;
  (document.activeElement as HTMLElement | null)?.blur();
  project = p;
  if (!project.rooms.some(r => r.id === ui.roomId)) { ui.roomId = project.rooms[0].id; ui.sel = null; }
  if (ui.sel && !room().els.some(e => e.id === ui.sel)) ui.sel = null;
  if (ui.view === 'convo' && !ui.sel) ui.view = 'room';
  mapSel = null;
  save();
  render();
  toast(message);
}

function undo(): void {
  const prev = past.pop();
  if (prev === undefined) return;
  future.push(snapshot());
  restore(prev, 'Undone');
}

function redo(): void {
  const next = future.pop();
  if (next === undefined) return;
  past.push(snapshot());
  restore(next, 'Redone');
}

/* ---------- Rendering ---------- */

function crumbs(): [string, string][] {
  const r = room(), e = selected();
  if (ui.view === 'play') {
    const playing = project.rooms.find(x => x.id === player?.state().roomId) ?? r;
    return [['play', `Playing: ${playing.name}`]];
  }
  const list: [string, string][] = [['map', 'Story map']];
  if (ui.view !== 'map') list.push(['room', r.name]);
  if (ui.view === 'convo' && e) list.push(['el', e.name], ['convo', 'Conversation']);
  if (ui.view === 'look') list.push(['look', 'Look']);
  return list;
}

function renderBar(): void {
  const list = crumbs();
  $('#crumbs')!.innerHTML = list.map(([k, n], i) =>
    `${i ? '<i>›</i>' : ''}<button data-act="crumb" data-k="${k}"${i === list.length - 1 ? ' aria-current="page"' : ''}>${esc(n)}</button>`).join('');
  $('#tools')!.innerHTML = ui.view === 'play'
    ? '<button class="btn ink" data-act="stop">Stop</button>'
    : `<button class="btn small quiet" data-act="undo" title="Undo (Ctrl+Z)"${past.length ? '' : ' disabled'}>Undo</button>
       <button class="btn small quiet" data-act="redo" title="Redo (Ctrl+Shift+Z)"${future.length ? '' : ' disabled'}>Redo</button>
       <button class="btn${ui.view === 'look' ? ' ink' : ''}" data-act="look">Look</button><button class="btn play" data-act="play">Play</button>`;
}

function render(): void {
  document.body.classList.toggle('compare-difference', lookCompare === 'difference');
  if (ui.view !== 'play' && player) { player.destroy(); player = null; }
  const r = room(), e = selected();
  if (ui.view === 'convo' && !e) ui.view = 'room';
  renderBar();
  const main = $('#main')!;
  switch (ui.view) {
    case 'map': main.innerHTML = viewMap(project, ui); break;
    case 'room': main.innerHTML = viewRoom(project, ui, r, e); break;
    case 'convo': {
      const ctx = mapCtx()!;
      main.innerHTML = viewConvo(project, r, e!, convoMode, { canvas: convoMode === 'map' ? mapHTML(ctx) : '', side: convoMode === 'map' ? mapSide(ctx) : '' });
      if (convoMode === 'map') {
        if (freshConvo) openView(); else applyZoom();
        afterMap();
      } else updateStatus();
      freshConvo = false;
      break;
    }
    case 'look': main.innerHTML = viewLook(project, r); break;
    case 'play': main.innerHTML = viewPlay(); break;
  }
}

function mapCtx(): MapCtx | null {
  const e = selected();
  return e ? { project, room: room(), el: e, sel: mapSel } : null;
}

let observer: ResizeObserver | null = null;
function afterMap(): void {
  requestAnimationFrame(drawEdges);
  observer?.disconnect();
  const canvas = $('#mcanvas');
  if (canvas && 'ResizeObserver' in window) {
    observer = new ResizeObserver(() => { applyZoom(); drawEdges(); });
    observer.observe(canvas);
  }
  const sc = $('#mscroll');
  sc?.addEventListener('wheel', onWheel, { passive: false });
}

/** Ctrl or Cmd with the wheel (or a trackpad pinch) zooms the map. */
function onWheel(ev: WheelEvent): void {
  if (!ev.ctrlKey && !ev.metaKey) return;
  ev.preventDefault();
  const z = parseFloat($('#mzoomlabel')?.textContent ?? '100') / 100 || 1;
  setZoom(z * (ev.deltaY < 0 ? 1.1 : 1 / 1.1));
  drawEdges();
}

/** Redraws the map and its panel in place, keeping zoom, scroll position and the field being typed in. */
function refreshMap(): void {
  pendingRefresh = false;
  const ctx = mapCtx();
  const holder = $('#mapholder'), side = $('#mside');
  if (!ctx || !holder || !side) return render();
  const scroller = $('#mscroll');
  const scroll = scroller ? [scroller.scrollLeft, scroller.scrollTop] : [0, 0];
  const active = document.activeElement as HTMLElement | null;
  const inSide = !!active && side.contains(active);
  // Fields keep focus by id; buttons by what they do.
  const focusSel = !inSide ? '' : active!.id ? `#${CSS.escape(active!.id)}`
    : active!.dataset.mapAct ? `[data-map-act="${active!.dataset.mapAct}"]${active!.dataset.k ? `[data-k="${CSS.escape(active!.dataset.k)}"]` : ''}` : '';
  holder.innerHTML = mapHTML(ctx);
  side.innerHTML = mapSide(ctx);
  applyZoom();
  const next = $('#mscroll');
  if (next) { next.scrollLeft = scroll[0]; next.scrollTop = scroll[1]; }
  if (focusSel) side.querySelector<HTMLElement>(focusSel)?.focus();
  else holder.querySelector<HTMLElement>('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  afterMap();
}

function applyMap(res: MapResult | undefined): void {
  if (!res) return;
  mapSel = res.sel ?? null;
  save();
  refreshMap();
  // On a narrow screen the panel sits under the map: bring it into view.
  if (mapSel && window.innerWidth <= 820) $('#mside')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function updateStatus(): void {
  const e = selected(), el = $('#status'), facts = $('#facts');
  if (!e || !el || !facts) return;
  const s = scriptStatus(project, room(), e.script);
  el.className = s.error ? 'status err' : 'status';
  el.textContent = s.text;
  facts.innerHTML = s.facts.length
    ? `<div class="label">Story facts used here</div><div class="row">${s.facts.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>`
    : '';
}

/** The strip under the game is editor-only: the player never sees it. */
function updateStrip(s: Readonly<PlayState>): void {
  const strip = $('#strip');
  if (!strip) return;
  const r = project.rooms.find(x => x.id === s.roomId);
  const idle = !s.event && !r?.els.some(e => e.script.trim());
  const facts = Object.entries(s.facts);
  strip.innerHTML = `<span class="label">Only you see this</span>`
    + (s.problem ? `<span class="status err">${esc(s.problem)}</span>` : '')
    + (idle ? '<span>Nothing in this room is clickable yet. Stop, click a character, and make them say something.</span>'
      : !s.event ? '<span>Click a character or object in the picture.</span>' : '')
    + (facts.length ? facts.map(([k, v]) => `<span class="chip">${esc(k)} = ${esc(v)}</span>`).join('') : '<span>No story facts changed yet.</span>');
  renderBar();
}

function startPlay(fromElement?: StoryElement): void {
  ui.back = ui.view === 'play' ? ui.back : ui.view;
  ui.view = 'play';
  render();
  player = createPlayer($('#player')!, project, {
    roomId: fromElement ? room().id : undefined,
    elementId: fromElement?.id,
    onChange: updateStrip
  });
}

/* ---------- Actions ---------- */

function place(el: StoryElement): void {
  room().els.push(el);
  ui.sel = el.id;
  ui.adding = null;
  save();
  render();
}

function go(view: View): void {
  if (view !== 'room' && view !== 'convo') lookReturn = null;
  ui.view = view;
  ui.adding = null;
  ui.lookEdit = null;
  ui.confirmReset = false;
  render();
}

function replaceProject(p: Project): void {
  project = p;
  ui.roomId = project.rooms[0].id;
  ui.sel = null;
  save();
  go('room');
}

/** Reads an image file, scaled down so the project stays small enough to save. */
function readImage(f: File, max: number, type: 'image/jpeg' | 'image/webp'): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(f);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL(type, 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('not an image')); };
    img.src = url;
  });
}

const fileTitle = (f: File) => f.name.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();

/** A character name from a file name: "lin_base.png" gives "Lin". */
function characterNameFromFile(f: File): string {
  const words = fileTitle(f).split(' ').filter(w => !/^(base|default|neutral|main|idle|full|body|sprite|\d+)$/i.test(w));
  return words.map(w => w[0].toUpperCase() + w.slice(1)).join(' ').slice(0, 30) || 'Character';
}

/** A look name from a file name, without the character's name: "lin_happy.png" gives "happy". */
function lookNameFromFile(c: Character, f: File): string {
  const drop = new Set(c.name.toLowerCase().split(/\s+/));
  const name = fileTitle(f).split(' ').filter(w => !drop.has(w.toLowerCase())).join(' ').trim();
  return uniqueLookName(c, name || 'look');
}

const selectedCharacter = (): Character | undefined => { const e = selected(); return e ? characterOf(project, e) : undefined; };
const editedLook = (): CharacterLook | undefined => selectedCharacter()?.looks.find(l => l.id === ui.lookEdit);

/** The character speaking the selected line in the map, if it has looks of its own. */
function onceSpeaker(): { character: Character } | null {
  const ctx = mapCtx();
  if (!ctx || !mapSel) return null;
  const step = getStep(parseScript(ctx.el.script).steps, mapSel);
  if (step?.t !== 'say' || !step.who) return null;
  const key = step.who.trim().toLowerCase();
  const el = room().els.find(x => x.kind === 'char' && x.name.trim().toLowerCase() === key);
  const character = (el && characterOf(project, el)) ?? project.characters.find(c => c.name.trim().toLowerCase() === key);
  return character ? { character } : null;
}

/** What the shared look-file input is for right now. */
let lookFileMode: { kind: 'add' } | { kind: 'replace'; lookId: string } | { kind: 'once' } = { kind: 'add' };
function pickLookFiles(mode: typeof lookFileMode, multiple: boolean): void {
  lookFileMode = mode;
  const input = $<HTMLInputElement>('#lookfile')!;
  input.multiple = multiple;
  input.value = '';
  input.click();
}

let pendingUpload: Exclude<Adding, null> = 'bg';
/** Where Done goes after lining up a one-off picture from a conversation. */
let lookReturn: { elId: string | null; mapSel: string | null } | null = null;
/** How the line-up shows the look over the base picture. */
let lookCompare: 'see-through' | 'difference' = 'see-through';

/** Actions that never change the project, so they are not recorded for Undo. */
const NOT_RECORDED = new Set(['once-lineup', 'look-compare', 'undo', 'redo', 'save-file', 'open-file', 'upload', 'play', 'play-convo', 'stop', 'convo-mode', 'look', 'crumb', 'add-looks', 'look-replace', 'once-picture', 'look-open', 'look-done']);

const actions: Record<string, (k: string) => void> = {
  crumb(k) {
    if (k === 'map' || k === 'room') ui.sel = null;
    if (k === 'map') go('map');
    else if (k === 'room' || k === 'el') go('room');
  },
  'open-room'(k) { ui.roomId = k; ui.sel = null; go('room'); },
  'new-room'() {
    const r = createRoom(`Room ${project.rooms.length + 1}`);
    project.rooms.push(r);
    ui.roomId = r.id; ui.sel = null; save(); go('room');
  },
  'del-room'() {
    project.rooms = project.rooms.filter(r => r.id !== ui.roomId);
    ui.roomId = project.rooms[0].id; ui.sel = null; save(); go('map');
  },
  sample() { replaceProject(sampleProject()); },
  'ask-reset'() { ui.confirmReset = true; render(); },
  reset() { replaceProject(createProject()); },
  cancel() { ui.adding = null; ui.confirmReset = false; render(); },
  adding(k) { ui.adding = k as Adding; render(); },
  'set-bg'(k) {
    const r = room();
    r.bg = { preset: k };
    if (/^Room \d+$/.test(r.name) && !findRoomByName(project, BACKDROPS[k].name)) {
      const old = r.name;
      r.name = BACKDROPS[k].name;
      renameEverywhere('room', old, r.name);
    }
    ui.adding = null; save(); render();
  },
  'add-char'(k) {
    place({ id: newId(), kind: 'char', preset: k, name: CHARACTERS[k].name, x: 30 + (room().els.length * 14) % 50, y: 98, size: 76, expr: 'neutral', script: '' });
  },
  'add-own'(k) {
    const c = project.characters.find(x => x.id === k);
    if (!c) return;
    place({ id: newId(), kind: 'char', characterId: c.id, name: c.name, x: 30 + (room().els.length * 14) % 50, y: 98, size: 76, script: '' });
  },
  'look-open'(k) {
    if (!k) { toast('This is the base picture. Add looks to give the character more expressions.'); return; }
    ui.lookEdit = k;
    render();
  },
  'look-done'() {
    ui.lookEdit = null;
    // Lining up a picture from a line in a conversation: go back to that line.
    if (lookReturn) {
      const back = lookReturn;
      lookReturn = null;
      ui.sel = back.elId;
      mapSel = back.mapSel;
      go('convo');
      return;
    }
    render();
  },
  'look-reset'() { const l = editedLook(); if (!l) return; l.dx = 0; l.dy = 0; l.scale = 1; save(); render(); },
  'look-replace'() { if (ui.lookEdit) pickLookFiles({ kind: 'replace', lookId: ui.lookEdit }, false); },
  'look-delete'() {
    const c = selectedCharacter();
    if (!c) return;
    c.looks = c.looks.filter(l => l.id !== ui.lookEdit);
    ui.lookEdit = null;
    save();
    render();
  },
  'add-looks'() { pickLookFiles({ kind: 'add' }, true); },
  'once-lineup'() {
    const sp = onceSpeaker(), ctx = mapCtx();
    if (!sp || !ctx || !mapSel) return;
    const step = getStep(parseScript(ctx.el.script).steps, mapSel);
    const look = step?.t === 'say' ? findLook(sp.character, step.expr) : undefined;
    const el = room().els.find(x => x.characterId === sp.character.id);
    if (!look || !el) { toast(`Place ${sp.character.name} in this room to line the picture up.`); return; }
    lookReturn = { elId: ui.sel, mapSel };
    ui.sel = el.id;
    go('room');
    ui.lookEdit = look.id;
    render();
  },
  'look-compare'(k) { lookCompare = k === 'difference' ? 'difference' : 'see-through'; render(); },
  'once-picture'() { pickLookFiles({ kind: 'once' }, false); },
  'once-remove'() {
    const ctx = mapCtx(), c = onceSpeaker();
    if (!ctx || !c || !mapSel) return;
    const steps = parseScript(ctx.el.script).steps, step = getStep(steps, mapSel);
    if (step?.t !== 'say') return;
    step.expr = '';
    ctx.el.script = writeScript(steps);
    save();
    refreshMap();
  },
  'add-object'(k) {
    place({ id: newId(), kind: 'object', preset: k, name: OBJECTS[k].name, x: 60, y: 78, size: 16, script: '' });
  },
  upload(k) {
    pendingUpload = k as Exclude<Adding, null>;
    const input = $<HTMLInputElement>('#file')!;
    input.value = '';
    input.click();
  },
  convo() {
    mapSel = null;
    freshConvo = true;
    go('convo');
    const t = $<HTMLTextAreaElement>('#script');
    if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  },
  insert(k) {
    const e = selected(), t = $<HTMLTextAreaElement>('#script');
    if (!e || !t) return;
    const text = inserts(project, room(), e)[Number(k)].text;
    const before = t.value.slice(0, t.selectionStart), after = t.value.slice(t.selectionEnd);
    const lead = before && !before.endsWith('\n') ? '\n' : '';
    t.value = before + lead + text + after;
    const at = (before + lead + text).length;
    e.script = t.value;
    save(); updateStatus();
    t.focus(); t.setSelectionRange(at, at);
  },
  front() { const r = room(), e = selected(); if (!e) return; r.els = r.els.filter(x => x !== e).concat(e); save(); render(); },
  remove() { const r = room(); r.els = r.els.filter(x => x.id !== ui.sel); ui.sel = null; save(); render(); },
  look() { go(ui.view === 'look' ? 'room' : 'look'); },
  'convo-mode'(k) {
    convoMode = k === 'script' ? 'script' : 'map';
    try { localStorage.setItem(MODE_KEY, convoMode); } catch { /* remembered for this session only */ }
    mapSel = null;
    freshConvo = convoMode === 'map';
    render();
  },
  undo() { undo(); },
  redo() { redo(); },
  'save-file'() { pruneOncePictures(); saveToFile(project); toast('Saved to a file in your downloads'); },
  'open-file'() { const input = $<HTMLInputElement>('#projectfile')!; input.value = ''; input.click(); },
  theme(k) { project.look.theme = k; save(); render(); },
  'look-choices'(k) { if (k === 'center') project.look.choices = 'center'; else delete project.look.choices; save(); render(); },
  'bg-fit'(k) { const bg = room().bg; if (!bg) return; if (k === 'fit' || k === 'stretch') bg.fit = k; else delete bg.fit; save(); render(); },
  'bg-edge'(k) { const bg = room().bg; if (!bg) return; if (k === 'color') { bg.edge = 'color'; bg.color ??= '#000000'; } else delete bg.edge; save(); render(); },
  'bg-reset'() { const bg = room().bg; if (!bg) return; delete bg.fx; delete bg.fy; delete bg.zoom; save(); render(); },
  play() { startPlay(); },
  'play-convo'() { startPlay(selected()); },
  stop() {
    const back = ui.back === 'convo' && selected() ? 'convo' : ui.back === 'map' ? 'map' : 'room';
    if (back === 'convo') freshConvo = false;
    go(back);
  }
};

/* ---------- Files ---------- */

$('#projectfile')!.addEventListener('change', async ev => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const p = await readProjectFile(f);
  if (!p) { toast('That file is not a Story Engine project.'); return; }
  const before = snapshot();
  replaceProject(p);
  record(before);
  toast(`Opened ${f.name}. Undo brings back what you had.`);
});

$('#lookfile')!.addEventListener('change', async ev => {
  const files = [...((ev.target as HTMLInputElement).files ?? [])];
  if (!files.length) return;
  const mode = lookFileMode;
  const c = mode.kind === 'once' ? onceSpeaker()?.character : selectedCharacter();
  if (!c) return;
  const before = snapshot();
  const added: CharacterLook[] = [];
  for (const f of files) {
    let img: string;
    try { img = await readImage(f, 900, 'image/webp'); } catch { toast(`${f.name} could not be opened as a picture.`); continue; }
    if (mode.kind === 'replace') {
      const l = c.looks.find(x => x.id === mode.lookId);
      if (l) l.img = img;
      continue;
    }
    const look: CharacterLook = { id: newId(), name: mode.kind === 'once' ? uniqueLookName(c, 'own picture') : lookNameFromFile(c, f), img, dx: 0, dy: 0, scale: 1, ...(mode.kind === 'once' ? { once: true } : {}) };
    c.looks.push(look);
    added.push(look);
  }
  if (mode.kind === 'once' && added[0]) {
    // The selected line now shows the new picture; an older picture of its own is let go.
    const ctx = mapCtx()!;
    const steps = parseScript(ctx.el.script).steps, step = mapSel ? getStep(steps, mapSel) : null;
    if (step?.t === 'say') {
      step.expr = added[0].name;
      ctx.el.script = writeScript(steps);
    }
    save();
    record(before);
    refreshMap();
    return;
  }
  save();
  record(before);
  if (added.length === 1) { ui.lookEdit = added[0].id; render(); toast('Drag the new look until it lines up with the base picture underneath.'); }
  else { render(); if (added.length) toast(`Added ${added.length} looks to ${c.name}. Click one to line it up.`); }
});

/** Imported images are scaled down and stored inside the project, so it stays one file. */
$('#file')!.addEventListener('change', ev => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const before = snapshot();
  const img = new Image();
  const url = URL.createObjectURL(f);
  img.onload = () => {
    const isBg = pendingUpload === 'bg';
    const k = Math.min(1, (isBg ? 1600 : 900) / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k);
    c.height = Math.round(img.height * k);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const data = c.toDataURL(isBg ? 'image/jpeg' : 'image/webp', 0.85);
    const name = f.name.replace(/\.[^.]+$/, '').slice(0, 30) || 'Image';
    if (isBg) { room().bg = { img: data }; ui.adding = null; save(); render(); }
    else if (pendingUpload === 'char') {
      const c: Character = { id: newId(), name: characterNameFromFile(f), base: data, looks: [] };
      project.characters.push(c);
      place({ id: newId(), kind: 'char', characterId: c.id, name: c.name, x: 50, y: 98, size: 76, script: '' });
      toast(`${c.name} is ready. Add looks to give ${c.name} more expressions.`);
    } else {
      place({ id: newId(), kind: 'object', img: data, name, x: 50, y: 78, size: 20, script: '' });
    }
    record(before);
  };
  img.onerror = () => { URL.revokeObjectURL(url); toast('That image could not be opened.'); };
  img.src = url;
});

/* ---------- Events ---------- */

/* Pointer state, so a map field committed on blur does not redraw the map under a click in progress. */
let pointerDown = false;
let pendingRefresh = false;
document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
document.addEventListener('pointerup', () => {
  pointerDown = false;
  setTimeout(() => { if (pendingRefresh) refreshMap(); }, 0);
}, true);

/* Dragging someone in the line preview places them for that line. */
let previewDrag: { node: HTMLElement; box: DOMRect; who: string; dx: number; dy: number; x: number; y: number; moved: boolean } | null = null;
document.addEventListener('pointerdown', ev => {
  const node = (ev.target as HTMLElement).closest<HTMLElement>('.mpreview .el.drag');
  if (!node || ev.button !== 0) return;
  const stage = node.closest<HTMLElement>('[data-stage]')!;
  const box = stage.getBoundingClientRect();
  const x = parseFloat(node.style.left), y = parseFloat(node.style.top);
  previewDrag = { node, box, who: node.dataset.who ?? '', x, y, moved: false, dx: ev.clientX - (box.left + box.width * x / 100), dy: ev.clientY - (box.top + box.height * y / 100) };
  try { node.setPointerCapture(ev.pointerId); } catch { /* not supported */ }
  ev.preventDefault();
});
document.addEventListener('pointermove', ev => {
  const d = previewDrag;
  if (!d) return;
  d.moved = true;
  d.x = Math.max(2, Math.min(98, (ev.clientX - d.dx - d.box.left) / d.box.width * 100));
  d.y = Math.max(20, Math.min(118, (ev.clientY - d.dy - d.box.top) / d.box.height * 100));
  d.node.style.left = `${d.x}%`;
  d.node.style.top = `${d.y}%`;
});
document.addEventListener('pointerup', () => {
  const d = previewDrag;
  previewDrag = null;
  const ctx = mapCtx();
  if (!d || !d.moved || !ctx) return;
  const before = snapshot();
  const step = mapSel ? getStep(parseScript(ctx.el.script).steps, mapSel) : null;
  if (!step) return;
  const act = step.t === 'say' ? 'stage-place' : 'stg-place';
  applyMap(mapAction(ctx, act, `${d.who}|${d.x}|${Math.abs(d.y - 98) < 2 ? '' : d.y}`));
  record(before);
});

/* Dragging the map's background pans it. */
let pan: { x: number; y: number; left: number; top: number; moved: boolean } | null = null;
let justPanned = false;
document.addEventListener('pointerdown', ev => {
  const t = ev.target as HTMLElement;
  const sc = t.closest<HTMLElement>('#mscroll');
  if (!sc || ev.button !== 0 || t.closest('button, input, select, textarea')) return;
  pan = { x: ev.clientX, y: ev.clientY, left: sc.scrollLeft, top: sc.scrollTop, moved: false };
});
document.addEventListener('pointermove', ev => {
  const sc = $('#mscroll');
  if (!pan || !sc) return;
  const dx = ev.clientX - pan.x, dy = ev.clientY - pan.y;
  if (!pan.moved && Math.hypot(dx, dy) < 5) return;
  pan.moved = true;
  sc.classList.add('panning');
  sc.scrollLeft = pan.left - dx;
  sc.scrollTop = pan.top - dy;
});
document.addEventListener('pointerup', () => {
  if (pan?.moved) { justPanned = true; setTimeout(() => { justPanned = false; }, 0); }
  pan = null;
  $('#mscroll')?.classList.remove('panning');
});

document.addEventListener('click', ev => {
  const target = ev.target as HTMLElement;
  const b = target.closest<HTMLElement>('[data-act]');
  if (b) {
    if ((b as HTMLButtonElement).disabled) return;
    // Destructive buttons ask once more in place: the first click arms them.
    if (b.dataset.confirm && !b.dataset.armed) {
      const label = b.textContent ?? '';
      b.dataset.armed = '1';
      b.classList.add('armed');
      b.textContent = b.dataset.confirm;
      setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.classList.remove('armed'); b.textContent = label; } }, 4000);
      return;
    }
    const act = b.dataset.act!;
    const before = NOT_RECORDED.has(act) ? null : snapshot();
    actions[act]?.(b.dataset.k ?? '');
    record(before);
    return;
  }
  const v = target.closest<HTMLElement>('[data-map-view]');
  if (v) { mapView(v.dataset.mapView!); drawEdges(); return; }
  const m = target.closest<HTMLElement>('[data-map-act]');
  const ctx = mapCtx();
  if (m && ctx) {
    if ((m as HTMLButtonElement).disabled) return;
    const before = snapshot();
    applyMap(mapAction(ctx, m.dataset.mapAct!, m.dataset.k ?? ''));
    record(before);
    return;
  }
  if (ctx && mapSel && !justPanned && target.closest('.mscroll') && !target.closest('.mnode, .madd')) { mapSel = null; refreshMap(); }
});

/* One Undo step per visit to a field. Renames are carried through to the steps
   that point at the old name when the field is left. */
let fieldSnapshot: string | null = null;
let renameFrom = '';
const isField = (el: HTMLElement) => !!el.closest?.('#main') && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
document.addEventListener('focusin', ev => {
  const t = ev.target as HTMLInputElement;
  if (!isField(t)) return;
  if (fieldSnapshot === null) fieldSnapshot = snapshot();
  if (t.dataset.in === 'room-name') renameFrom = room().name;
  if (t.dataset.in === 'el-name') renameFrom = selected()?.name ?? '';
});
document.addEventListener('focusout', ev => {
  const lost = ev.target as HTMLElement;
  if (!isField(lost) || fieldSnapshot === null) return;
  setTimeout(() => {
    const now = document.activeElement as HTMLElement | null;
    // The same field drawn again (the map redraws its panel) is still the same visit.
    if (now && lost.id && now.id === lost.id) return;
    record(fieldSnapshot);
    fieldSnapshot = now && isField(now) ? snapshot() : null;
  }, 0);
});

function renameEverywhere(kind: 'room' | 'speaker', from: string, to: string): number {
  const key = from.trim().toLowerCase();
  const stillUsed = kind === 'room'
    ? project.rooms.some(r => r.name.trim().toLowerCase() === key)
    : project.rooms.some(r => r.els.some(e => e.kind === 'char' && e.name.trim().toLowerCase() === key));
  if (stillUsed) return 0;
  let changed = 0;
  for (const r of project.rooms) for (const e of r.els) {
    const next = kind === 'room' ? renameRoomInScript(e.script, from, to) : renameSpeakerInScript(e.script, from, to);
    if (next !== e.script) { e.script = next; changed++; }
  }
  return changed;
}

/**
 * Map panel fields write to the conversation when the field is left (or Enter is
 * pressed), not on every key, so half-typed text never changes what a step is.
 * Picks from a list apply at once.
 */
function commitMapField(t: HTMLInputElement): void {
  const ctx = mapCtx();
  if (!ctx) return;
  const before = fieldSnapshot ?? snapshot();
  const value = t.type === 'checkbox' ? String(t.checked) : t.value;
  const res = mapInput(ctx, t.dataset.mapIn!, t.dataset.k ?? '', value);
  if (!res) return;
  mapSel = res.sel ?? mapSel;
  save();
  // The change is recorded now, and the field starts a fresh visit if it keeps focus.
  record(before);
  fieldSnapshot = snapshot();
  // Redraw once focus has moved on (Tab), so the newly focused field is the one kept.
  if (pointerDown) pendingRefresh = true;
  else { pendingRefresh = true; setTimeout(() => { if (pendingRefresh) refreshMap(); }, 0); }
}

document.addEventListener('input', ev => {
  const t = ev.target as HTMLInputElement;
  if (t.dataset.mapIn) {
    if (t.tagName === 'SELECT') commitMapField(t);
    else if (t.dataset.mapIn === 'say-text' || t.dataset.mapIn === 'say-who') {
      const game = $('.mpreview .game');
      const who = $<HTMLInputElement>('#m-who-in')?.value ?? '', text = $<HTMLTextAreaElement>('#m-text')?.value ?? '';
      if (game) game.innerHTML = sayHTML(who.trim(), text, false);
    }
    return;
  }
  const k = t.dataset.in;
  if (!k) return;
  const e = selected();
  const node = e ? document.querySelector<HTMLElement>(`.el[data-el="${CSS.escape(e.id)}"]`) : null;
  switch (k) {
    case 'script': if (e) { e.script = t.value; updateStatus(); } break;
    case 'el-name': if (e) e.name = t.value; break;
    case 'el-size': if (e) { e.size = Number(t.value); if (node) node.style.height = `${e.size}%`; } break;
    case 'el-expr': if (e) { e.expr = t.value; if (node) node.innerHTML = elementArt(e, undefined, project.characters); } break;
    case 'look-scale': { const l = editedLook(); if (l && e) { l.scale = Number(t.value); if (node) node.innerHTML = elementArt(e, undefined, project.characters, l.id); } break; }
    case 'room-name': { room().name = t.value; const c = $('#crumbs [aria-current]'); if (c) c.textContent = t.value; break; }
    case 'room-auto': room().auto = t.checked; break;
    case 'bg-zoom': { const bg = room().bg; if (bg) { bg.zoom = Number(t.value); refreshBackdrop(); } break; }
    case 'bg-color': { const bg = room().bg; if (bg) { bg.color = t.value; refreshBackdrop(); } break; }
    case 'conv-staging': if (e) { e.staging = t.value === 'room' ? 'room' : undefined; refreshMap(); } break;
    case 'look-font': project.look.font = t.value; break;
    case 'look-radius': project.look.radius = Number(t.value); break;
    case 'look-size': project.look.size = Number(t.value); break;
  }
  if (k.startsWith('look-')) { const st = $('[data-stage]'); if (st) st.style.cssText = lookStyle(project.look); }
  save();
});

document.addEventListener('change', ev => {
  const t = ev.target as HTMLInputElement;
  if (t.dataset.mapIn && t.tagName !== 'SELECT') commitMapField(t);
  if (t.dataset.in === 'room-name') {
    const clash = project.rooms.find(r => r !== room() && r.name.trim().toLowerCase() === t.value.trim().toLowerCase());
    if (clash) toast(`There is already a room called "${clash.name}". Pick another name.`);
    if (!t.value.trim() || clash) { room().name = renameFrom || 'Room'; t.value = room().name; const c = $('#crumbs [aria-current]'); if (c) c.textContent = room().name; }
    const n = renameEverywhere('room', renameFrom, room().name);
    if (n) toast(`Updated "Go to" in ${n} conversation${n === 1 ? '' : 's'}`);
    renameFrom = room().name;
    save();
  }
  if (t.dataset.in === 'look-name') {
    const c = selectedCharacter(), l = editedLook();
    if (c && l) {
      const old = l.name;
      const others = { ...c, looks: c.looks.filter(x => x !== l) };
      l.name = uniqueLookName(others, cleanLookName(t.value || old));
      t.value = l.name;
      let n = 0;
      for (const r of project.rooms) for (const el of r.els) {
        const next = renameLookInScript(el.script, c.name, old, l.name);
        if (next !== el.script) { el.script = next; n++; }
      }
      for (const r of project.rooms) for (const el of r.els) {
        if (el.characterId === c.id && (el.expr ?? '').toLowerCase() === old.toLowerCase()) el.expr = l.name;
      }
      if (n) toast(`Updated the look on ${c.name}'s lines in ${n} conversation${n === 1 ? '' : 's'}`);
      save();
      render();
    }
  }
  if (t.dataset.in === 'el-name') {
    const e = selected();
    if (e && !e.name.trim()) e.name = renameFrom || 'Thing';
    // A character made from the author's pictures has one name everywhere it is placed.
    const c = e ? characterOf(project, e) : undefined;
    if (e && c) {
      c.name = e.name;
      for (const r of project.rooms) for (const x of r.els) if (x.characterId === c.id) x.name = c.name;
    }
    if (e?.kind === 'char') {
      const n = renameEverywhere('speaker', renameFrom, e.name);
      if (n) toast(`Updated ${e.name}'s lines in ${n} conversation${n === 1 ? '' : 's'}`);
    }
    renameFrom = e?.name ?? '';
    save();
    render();
  }
});

document.addEventListener('keydown', ev => {
  const t = ev.target as HTMLTextAreaElement;
  const typing = t.closest?.('input, textarea, select');
  if (!typing && ui.view !== 'play' && (ev.metaKey || ev.ctrlKey)) {
    const key = ev.key.toLowerCase();
    if (key === 'z' && !ev.shiftKey) { ev.preventDefault(); undo(); return; }
    if ((key === 'z' && ev.shiftKey) || key === 'y') { ev.preventDefault(); redo(); return; }
  }
  if (ui.view === 'convo' && !typing && ev.key === 'Escape' && mapSel) { mapSel = null; refreshMap(); return; }
  const nudging = !typing && ui.view === 'room' ? editedLook() : undefined;
  if (nudging && ev.key.startsWith('Arrow')) {
    ev.preventDefault();
    const before = snapshot(), step = ev.shiftKey ? 0.02 : 0.004;
    if (ev.key === 'ArrowLeft') nudging.dx -= step;
    if (ev.key === 'ArrowRight') nudging.dx += step;
    if (ev.key === 'ArrowUp') nudging.dy -= step;
    if (ev.key === 'ArrowDown') nudging.dy += step;
    const e = selected(), node = e ? document.querySelector<HTMLElement>(`.el[data-el="${CSS.escape(e.id)}"]`) : null;
    if (e && node) node.innerHTML = elementArt(e, undefined, project.characters, nudging.id);
    save();
    record(before);
    return;
  }
  if ((t as HTMLElement).dataset?.mapIn && t.tagName === 'TEXTAREA' && ev.key === 'Enter' && !ev.shiftKey) {
    ev.preventDefault();
    commitMapField(t as unknown as HTMLInputElement);
    return;
  }
  if (t.id === 'script' && ev.key === 'Tab') {
    ev.preventDefault();
    t.setRangeText('  ', t.selectionStart, t.selectionEnd, 'end');
    t.dispatchEvent(new Event('input', { bubbles: true }));
  }
});

/** Redraws only the backdrop of the room stage, so sliders and dragging stay smooth. */
function refreshBackdrop(): void {
  const host = document.querySelector<HTMLElement>('.stage.edit .bg');
  const bg = room().bg;
  if (host && bg) host.innerHTML = backdropHTML(bg);
}

/* Dragging the backdrop (in Fill, with nothing selected) chooses which part of it shows. */
let bgPan: { x: number; y: number; fx: number; fy: number; w: number; h: number; before: string; moved: boolean } | null = null;
document.addEventListener('pointerdown', ev => {
  if (ui.view !== 'room' || ui.sel || ui.adding || ui.lookEdit) return;
  const target = ev.target as HTMLElement;
  const stage = target.closest<HTMLElement>('.stage.edit');
  const bg = room().bg;
  if (!stage || target.closest('.el') || !bg || (bg.fit ?? 'fill') !== 'fill') return;
  const box = stage.getBoundingClientRect();
  bgPan = { x: ev.clientX, y: ev.clientY, fx: bg.fx ?? 50, fy: bg.fy ?? 50, w: box.width, h: box.height, before: snapshot(), moved: false };
  stage.classList.add('panning-bg');
  ev.preventDefault();
});
document.addEventListener('pointermove', ev => {
  const bg = room().bg;
  if (!bgPan || !bg) return;
  bgPan.moved = true;
  // Moving the picture right shows more of its left side; zoomed in, each pixel moves less of it.
  const k = 160 / (bg.zoom ?? 1);
  bg.fx = Math.round(Math.min(100, Math.max(0, bgPan.fx - (ev.clientX - bgPan.x) / bgPan.w * k)) * 10) / 10;
  bg.fy = Math.round(Math.min(100, Math.max(0, bgPan.fy - (ev.clientY - bgPan.y) / bgPan.h * k)) * 10) / 10;
  refreshBackdrop();
});
document.addEventListener('pointerup', () => {
  if (!bgPan) return;
  const { before, moved } = bgPan;
  bgPan = null;
  document.querySelector('.stage.edit')?.classList.remove('panning-bg');
  if (moved) { save(); record(before); render(); }
});

/* ---------- Drag to place ----------
   Positions are stored as a share of the stage, so a layout holds at any screen size. */

interface Drag { e: StoryElement; node: HTMLElement; box: DOMRect; dx: number; dy: number; rerender: boolean; before: string }
let drag: Drag | null = null;

/* Lining up a look: dragging moves the look by a share of its own size. */
interface LookDrag { look: CharacterLook; img: HTMLElement; node: HTMLElement; e: StoryElement; x: number; y: number; dx: number; dy: number; before: string }
let lookDrag: LookDrag | null = null;
document.addEventListener('pointermove', ev => {
  if (!lookDrag) return;
  const { look, img, node, e } = lookDrag;
  look.dx = Math.round((lookDrag.dx + (ev.clientX - lookDrag.x) / img.offsetWidth) * 1000) / 1000;
  look.dy = Math.round((lookDrag.dy + (ev.clientY - lookDrag.y) / img.offsetHeight) * 1000) / 1000;
  node.innerHTML = elementArt(e, undefined, project.characters, look.id);
  lookDrag.img = node.querySelector<HTMLElement>('.look') ?? img;
});
const lookDrop = () => {
  if (!lookDrag) return;
  const before = lookDrag.before;
  lookDrag = null;
  save();
  record(before);
};
document.addEventListener('pointerup', lookDrop);
document.addEventListener('pointercancel', lookDrop);

document.addEventListener('pointerdown', ev => {
  if (ui.view !== 'room') return;
  const target = ev.target as HTMLElement;
  const stage = target.closest<HTMLElement>('.stage.edit');
  if (!stage) return;
  const node = target.closest<HTMLElement>('.el');
  if (!node) {
    if (ui.lookEdit) return; // lining up: clicks beside the picture do nothing
    if (ui.sel || ui.adding) { ui.sel = null; ui.adding = null; render(); }
    return;
  }
  const e = room().els.find(x => x.id === node.dataset.el);
  if (!e) return;
  const lining = editedLook();
  if (lining && e.id === ui.sel) {
    // Take focus off the panel, so arrow keys move the picture and not the Size slider.
    (document.activeElement as HTMLElement | null)?.blur();
    const img = node.querySelector<HTMLElement>('.look');
    if (!img) return;
    lookDrag = { look: lining, img, node, e, x: ev.clientX, y: ev.clientY, dx: lining.dx, dy: lining.dy, before: snapshot() };
    try { node.setPointerCapture(ev.pointerId); } catch { /* not supported */ }
    ev.preventDefault();
    return;
  }
  if (ui.lookEdit) return;
  const box = stage.getBoundingClientRect();
  stage.querySelectorAll('.el.sel').forEach(x => x.classList.remove('sel'));
  node.classList.add('sel');
  drag = {
    e, node, box, before: snapshot(),
    dx: ev.clientX - (box.left + box.width * e.x / 100),
    dy: ev.clientY - (box.top + box.height * e.y / 100),
    rerender: ui.sel !== e.id || ui.adding !== null
  };
  ui.sel = e.id;
  ui.adding = null;
  try { node.setPointerCapture(ev.pointerId); } catch { /* not supported */ }
  ev.preventDefault();
});

document.addEventListener('pointermove', ev => {
  if (!drag) return;
  const { e, node, box } = drag;
  const clamp = (v: number, lo: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, v)) * 10) / 10;
  e.x = clamp((ev.clientX - drag.dx - box.left) / box.width * 100, 2, 98);
  e.y = clamp((ev.clientY - drag.dy - box.top) / box.height * 100, 12, 118);
  node.style.left = `${e.x}%`;
  node.style.top = `${e.y}%`;
});

const drop = () => {
  if (!drag) return;
  const { rerender, before } = drag;
  drag = null;
  save();
  record(before);
  if (rerender) render();
};
document.addEventListener('pointerup', drop);
document.addEventListener('pointercancel', drop);

/* ---------- Start ---------- */

void loadProject().then(p => {
  project = p;
  pruneOncePictures();
  ui.roomId = project.rooms[0].id;
  render();
  save();
});
