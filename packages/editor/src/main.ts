import '@story-engine/runtime/game.css';
import './editor.css';
import { createProject, createRoom, findRoomByName, newId } from '@story-engine/engine-core';
import type { Project, Room, StoryElement } from '@story-engine/engine-core';
import { BACKDROPS, CHARACTERS, OBJECTS, createPlayer, elementArt, esc, lookStyle } from '@story-engine/runtime';
import type { Player, PlayState } from '@story-engine/runtime';
import { loadProject, sampleProject, saveProject } from './store';
import { inserts, scriptStatus, viewConvo, viewLook, viewMap, viewPlay, viewRoom } from './views';
import type { Adding, UI, View } from './views';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s);

let project: Project = loadProject();
const ui: UI = { view: 'room', roomId: project.rooms[0].id, sel: null, adding: null, confirmReset: false, back: 'room' };
let player: Player | null = null;

const room = (): Room => project.rooms.find(r => r.id === ui.roomId) ?? project.rooms[0];
const selected = (): StoryElement | undefined => room().els.find(e => e.id === ui.sel);
const save = () => saveProject(project);

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
    : `<button class="btn${ui.view === 'look' ? ' ink' : ''}" data-act="look">Look</button><button class="btn play" data-act="play">Play</button>`;
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
    case 'convo': main.innerHTML = viewConvo(project, r, e!); updateStatus(); break;
    case 'look': main.innerHTML = viewLook(project, r); break;
    case 'play': main.innerHTML = viewPlay(); break;
  }
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

let pendingUpload: Exclude<Adding, null> = 'bg';

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
  sample() { project = sampleProject(); ui.roomId = project.rooms[0].id; ui.sel = null; save(); go('room'); },
  'ask-reset'() { ui.confirmReset = true; render(); },
  reset() { project = createProject(); ui.roomId = project.rooms[0].id; ui.sel = null; save(); go('room'); },
  cancel() { ui.adding = null; ui.confirmReset = false; render(); },
  adding(k) { ui.adding = k as Adding; render(); },
  'set-bg'(k) {
    const r = room();
    r.bg = { preset: k };
    if (/^Room \d+$/.test(r.name) && !findRoomByName(project, BACKDROPS[k].name)) r.name = BACKDROPS[k].name;
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
  theme(k) { project.look.theme = k; save(); render(); },
  play() { startPlay(); },
  'play-convo'() { startPlay(selected()); },
  stop() {
    const back = ui.back === 'convo' && selected() ? 'convo' : ui.back === 'map' ? 'map' : 'room';
    go(back);
  }
};

/* ---------- Images ---------- */

/** Imported images are scaled down and stored inside the project, so it stays one file. */
$('#file')!.addEventListener('change', ev => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
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
    if (isBg) { room().bg = { img: data }; ui.adding = null; save(); render(); return; }
    const isChar = pendingUpload === 'char';
    place({ id: newId(), kind: isChar ? 'char' : 'object', img: data, name, x: 50, y: isChar ? 98 : 78, size: isChar ? 76 : 20, script: '' });
  };
  img.src = url;
});

/* ---------- Events ---------- */

document.addEventListener('click', ev => {
  const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (b) actions[b.dataset.act!]?.(b.dataset.k ?? '');
});

document.addEventListener('input', ev => {
  const t = ev.target as HTMLInputElement;
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
  if ((ev.target as HTMLElement).dataset.in === 'el-name') render();
});

document.addEventListener('keydown', ev => {
  const t = ev.target as HTMLTextAreaElement;
  if (t.id === 'script' && ev.key === 'Tab') {
    ev.preventDefault();
    t.setRangeText('  ', t.selectionStart, t.selectionEnd, 'end');
    t.dispatchEvent(new Event('input', { bubbles: true }));
  }
});

/* ---------- Drag to place ----------
   Positions are stored as a share of the stage, so a layout holds at any screen size. */

interface Drag { e: StoryElement; node: HTMLElement; box: DOMRect; dx: number; dy: number; rerender: boolean }
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
    e, node, box,
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
  const again = drag.rerender;
  drag = null;
  save();
  if (again) render();
};
document.addEventListener('pointerup', drop);
document.addEventListener('pointercancel', drop);

render();
