import '@story-engine/runtime/game.css';
import './editor.css';
import { createProject, createRoom, findRoomByName, newId, normalizeProject, renameRoomInScript, renameSpeakerInScript } from '@story-engine/engine-core';
import type { Project, Room, StoryElement } from '@story-engine/engine-core';
import { BACKDROPS, CHARACTERS, OBJECTS, createPlayer, elementArt, esc, lookStyle, sayHTML } from '@story-engine/runtime';
import type { Player, PlayState } from '@story-engine/runtime';
import { loadProject, sampleProject, saveProject } from './store';
import { inserts, scriptStatus, viewConvo, viewLook, viewMap, viewPlay, viewRoom } from './views';
import type { Adding, ConvoMode, UI, View } from './views';
import { applyZoom, drawEdges, mapAction, mapHTML, mapInput, mapSide, mapView, openView, setZoom } from './map';
import type { MapCtx, MapResult } from './map';
import { readProjectFile, saveToFile } from './files';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s);

let project: Project = loadProject();
const ui: UI = { view: 'room', roomId: project.rooms[0].id, sel: null, adding: null, confirmReset: false, back: 'room' };
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

function save(): void {
  const ok = saveProject(project);
  const warn = $('#savewarn');
  if (warn) warn.hidden = ok;
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
  const s = scriptStatus(project, e.script);
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
  ui.view = view;
  ui.adding = null;
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

let pendingUpload: Exclude<Adding, null> = 'bg';

/** Actions that never change the project, so they are not recorded for Undo. */
const NOT_RECORDED = new Set(['undo', 'redo', 'save-file', 'open-file', 'upload', 'play', 'play-convo', 'stop', 'convo-mode', 'look', 'crumb']);

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
  'save-file'() { saveToFile(project); toast('Saved to a file in your downloads'); },
  'open-file'() { const input = $<HTMLInputElement>('#projectfile')!; input.value = ''; input.click(); },
  theme(k) { project.look.theme = k; save(); render(); },
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
    else {
      const isChar = pendingUpload === 'char';
      place({ id: newId(), kind: isChar ? 'char' : 'object', img: data, name, x: 50, y: isChar ? 98 : 78, size: isChar ? 76 : 20, script: '' });
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
  const res = mapInput(ctx, t.dataset.mapIn!, t.dataset.k ?? '', t.value);
  if (!res) return;
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
    case 'el-expr': if (e) { e.expr = t.value; if (node) node.innerHTML = elementArt(e); } break;
    case 'room-name': { room().name = t.value; const c = $('#crumbs [aria-current]'); if (c) c.textContent = t.value; break; }
    case 'room-auto': room().auto = t.checked; break;
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
  if (t.dataset.in === 'el-name') {
    const e = selected();
    if (e && !e.name.trim()) e.name = renameFrom || 'Thing';
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

/* ---------- Drag to place ----------
   Positions are stored as a share of the stage, so a layout holds at any screen size. */

interface Drag { e: StoryElement; node: HTMLElement; box: DOMRect; dx: number; dy: number; rerender: boolean; before: string }
let drag: Drag | null = null;

document.addEventListener('pointerdown', ev => {
  if (ui.view !== 'room') return;
  const target = ev.target as HTMLElement;
  const stage = target.closest<HTMLElement>('.stage.edit');
  if (!stage) return;
  const node = target.closest<HTMLElement>('.el');
  if (!node) {
    if (ui.sel || ui.adding) { ui.sel = null; ui.adding = null; render(); }
    return;
  }
  const e = room().els.find(x => x.id === node.dataset.el);
  if (!e) return;
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

render();
save();
