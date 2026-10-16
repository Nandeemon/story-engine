import '@story-engine/runtime/game.css';
import './editor.css';
import './frame.css';
import './content.css';
import { areaPoints, elementConds, setAreaShape, cleanPanelName, newBlock, panelFromTemplate, renamePanelInScript, factsToReach, startFacts, pathAt, simplifyPath, walkSteps, characterOf, cleanLookName, cleanMarkName, cleanSoundName, factName, renameMarkInScript, renameSoundInScript, toValue, createProject, createRoom, findLook, findRoomByName, newId, normalizeProject, parseScript, renameLookInScript, renameRoomInScript, renameSpeakerInScript, uniqueLookName, writeScript, getStep } from '@story-engine/engine-core';
import type { Condition, Panel, PanelBlock, PanelTemplate, Character, CharacterLook, FactDef, Facts, Idle, MarkDef, PathStep, Step, Project, Room, StoryElement } from '@story-engine/engine-core';
import { BACKDROPS, CHARACTERS, OBJECTS, STARTER_MARKS, findMark, backdropHTML, createPlayer, elementArt, elementStyle, areaArt, esc, fxVars, lookStyle, sayHTML } from '@story-engine/runtime';
import type { Player, PlayState } from '@story-engine/runtime';
import { addStory, deleteStory, duplicateStory, listStories, loadStory, sampleProject, saveStory, whenSaved } from './store';
import type { StoryInfo } from './store';
import { inserts, lookStage, roomLinks, scriptStatus, shareSheet, viewCheck, viewConvo, viewHome, viewLibrary, viewLook, viewMap, viewPlay, viewRoom } from './views';
import { factKind, findProblems, storyFacts } from './problems';
import type { Problem } from './problems';
import type { Adding, ConvoMode, LookTab, UI, View } from './views';
import { applyZoom, drawEdges, mapAction, mapHTML, mapInput, mapScene, mapSide, mapView, openView, setZoom, toggleFold, toggleFoldAll } from './map';
import type { LineWin, MapCtx, MapResult } from './map';
import { readProjectFile, saveToFile } from './files';
import { viewCast } from './cast';
import { addItem } from '@story-engine/engine-core';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s);

let project: Project = createProject();
/** The story being worked on, by its id in this browser; null on the home screen before one is opened. */
let storyId: string | null = null;
/** The stories listed on the home screen. */
let stories: StoryInfo[] = [];
const ui: UI = { view: 'home', roomId: project.rooms[0].id, sel: null, adding: null, confirmReset: false, back: 'room', lookEdit: null };
let player: Player | null = null;

const MODE_KEY = 'story-engine:convo-mode';
let convoMode: ConvoMode = 'map';
try { if (localStorage.getItem(MODE_KEY) === 'script') convoMode = 'script'; } catch { /* default to the map */ }
let mapSel: string | null = null;
/** Drawing a path in the scene, and the selected point of the path being edited. */
let pathPen = false;
let pathPt: number | null = null;
/** The line tool window open in the map's side panel. */
let lineWin: LineWin | null = null;
const SCENE_KEY = 'story-engine:scene-open';
let sceneOpen = true;
try { sceneOpen = localStorage.getItem(SCENE_KEY) !== 'no'; } catch { /* shown */ }

/* Test values for story facts: kept in this browser for testing only, never part of the story. */
const TEST_KEY = 'story-engine:test-facts';
const testKey = () => `${TEST_KEY}:${storyId ?? ''}`;
let test: { use: boolean; values: Record<string, string> } = { use: false, values: {} };
function loadTest(): void {
  test = { use: false, values: {} };
  try { const t = JSON.parse(localStorage.getItem(testKey()) ?? 'null'); if (t && typeof t === 'object') test = { use: !!t.use, values: t.values ?? {} }; } catch { /* none saved */ }
}
const saveTest = () => { try { localStorage.setItem(testKey(), JSON.stringify(test)); } catch { /* this session only */ } };
function testFacts(): Facts | undefined {
  if (!test.use) return undefined;
  const out: Facts = {};
  for (const [k, v] of Object.entries(test.values)) {
    if (v === '') continue;
    out[k] = v === 'yes' ? true : v === 'no' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  }
  return out;
}
let problems: Problem[] = [];
let lookTab: LookTab = 'style';
/** The character open in the Characters view; null shows the list. */
let castSel: string | null = null;
/** The interface panel, and the block in it, picked in Look. */
let panelSel: string | null = null;
let blockSel: string | null = null;
/** The Library's filter, and the mark whose animation settings are open. */
let libFilter = 'all';
let libMark: string | null = null;
const panelOf = (id: string | null) => project.panels?.find(x => x.id === id);
const blockOf = () => panelOf(panelSel)?.blocks.find(b => b.id === blockSel);
function refreshLookStage(): void {
  const host = $('#lookstage');
  if (host) host.innerHTML = lookStage(project, room(), testFacts() ?? {}, { panel: panelSel, block: blockSel }, lookTab);
}
/** Set when a conversation is opened, so the map opens on its start. */
let freshConvo = false;

/** A clickable area that leads somewhere is named after where it leads ("Door to Kitchen"), unless the author named it. */
function nameAfterDoor(e: StoryElement, to: string): void {
  if (e.kind === 'area' && /^(Clickable area( \d+)?|Door to .*)$/.test(e.name)) e.name = `Door to ${to}`;
}
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
  if (!storyId) return;
  void saveStory(storyId, project).then(ok => {
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
  toastTimer = window.setTimeout(() => { t.hidden = true; }, 3000);
}
/** Toasts belong to the view they were shown in. */
function clearToast(): void {
  clearTimeout(toastTimer);
  const t = $('#toast');
  if (t) t.hidden = true;
}

/* Rooms changed in the last few minutes are still being built: Check lists them as
   unfinished instead of flagging them for having no way in or on yet. */
const FRESH_MS = 5 * 60 * 1000;
const touched = new Map<string, number>();
let knownRooms = new Set<string>();
function noteTouched(): void {
  const now = Date.now();
  if (ui.view === 'room' || ui.view === 'convo') touched.set(ui.roomId, now);
  for (const r of project.rooms) if (!knownRooms.has(r.id)) touched.set(r.id, now);
  knownRooms = new Set(project.rooms.map(r => r.id));
}
function freshRooms(): Set<string> {
  const now = Date.now();
  return new Set([...touched].filter(([id, t]) => now - t < FRESH_MS && project.rooms.some(r => r.id === id)).map(([id]) => id));
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
  noteTouched();
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
  // The marked step stays marked when it is still there, so you can see what changed.
  const e = selected();
  if (!e || !mapSel || mapSel.startsWith('add:') || !getStep(parseScript(e.script).steps, mapSel.split('#o')[0])) mapSel = null;
  save();
  render();
  toast(message);
}

function undo(): void {
  if (ui.view === 'home') return;
  const prev = past.pop();
  if (prev === undefined) return;
  future.push(snapshot());
  restore(prev, 'Undone');
}

function redo(): void {
  if (ui.view === 'home') return;
  const next = future.pop();
  if (next === undefined) return;
  past.push(snapshot());
  restore(next, 'Redone');
}

/* ---------- Rendering ---------- */

/** Where you are: Story › Room › Conversation. Story-wide places (Look, Check,
    Characters, Pictures & sounds) sit under the story, never under a room. */
function crumbs(): [string, string][] {
  const r = room(), e = selected();
  if (ui.view === 'play') {
    const playing = project.rooms.find(x => x.id === player?.state().roomId) ?? r;
    return [['play', `Playing: ${playing.name}`]];
  }
  if (ui.view === 'home') return [['home', 'Your stories']];
  const list: [string, string][] = [['map', project.title?.trim() || 'Story map']];
  if (ui.view === 'room' || ui.view === 'convo') list.push(['room', r.name]);
  if (ui.view === 'convo' && e) list.push(['convo', `Conversation · ${e.name}`]);
  if (ui.view === 'look') list.push(['look', 'Look']);
  if (ui.view === 'library') list.push(['library', 'Pictures & sounds']);
  if (ui.view === 'cast') { list.push(['cast', 'Characters']); const c = project.characters.find(x => x.id === castSel); if (c) list.push(['cast-one', c.name]); }
  if (ui.view === 'check') list.push(['check', 'Check']);
  return list;
}

/** Errors and warnings Check found, for its badge: red only when something needs fixing. */
function checkCount(): { n: number; errors: number } {
  problems = findProblems(project, freshRooms());
  const errors = problems.filter(x => x.level === 'error').length;
  return { n: errors + problems.filter(x => x.level === 'warning').length, errors };
}
const checkBadge = (c: { n: number; errors: number }) => c.n ? ` <span class="badge${c.errors ? '' : ' warn'}" title="${c.errors ? `${c.errors} to fix` : `${c.n} to look at`}">${c.n}</span>` : '';

/** The Check button shows how many problems need a look. */
function checkButton(c = checkCount()): string {
  const t = testFacts();
  const testing = t && Object.keys(t).length ? `<button class="btn testpill" data-act="test-off" title="Play uses your test values. Click to play with every fact unset again.">Test values on <span aria-hidden="true">×</span></button>` : '';
  return `${testing}<button class="btn small quiet${ui.view === 'check' ? ' on' : ''}" data-act="check" title="Check your story for problems">Check${checkBadge(c)}</button>`;
}

const RAIL_KEY = 'story-engine:rail';
let railIcons = false;
try { railIcons = localStorage.getItem(RAIL_KEY) === 'icons'; } catch { /* labels shown */ }

const ICON: Record<string, string> = {
  map: '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><rect x="14" y="4" width="7" height="6" rx="1.5"/><path d="M10 7h4M17.5 10v4"/>',
  cast: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6"/>',
  library: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 17 5-4 4 3 3-2 4 3"/>',
  look: '<path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.8 1.8-1.7 0-1.3-1.1-1.6-1.1-2.7 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1.1"/><circle cx="10" cy="7.2" r="1.1"/><circle cx="14.5" cy="7.2" r="1.1"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.7 2.7L16 9.6"/>',
  fold: '<path d="m14 7-5 5 5 5"/>'
};
const icon = (k: string) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;

/** Story-wide places: the rail on wide screens, the ⋯ menu on phones. */
function places(c: { n: number; errors: number }): [string, string, string, string][] {
  return [['story-map', 'map', 'Story map', ''], ['cast', 'cast', 'Characters', ''], ['library', 'library', 'Pictures & sounds', ''], ['look', 'look', 'Look', ''], ['check', 'check', 'Check', checkBadge(c)]];
}
const placeView: Record<string, View> = { 'story-map': 'map', cast: 'cast', library: 'library', look: 'look', check: 'check' };

/** What "From here" plays while editing, or null where only the start makes sense. */
function playHere(): { label: string; run: () => void } | null {
  const r = room(), e = selected();
  if (ui.view === 'convo' && e) {
    if (mapSel && !mapSel.startsWith('add:') && convoMode === 'map') { const path = mapSel.split('#')[0]; return { label: `${e.name}, from the marked step`, run: () => startPlay(e, path) }; }
    return { label: `${e.name}'s conversation`, run: () => startPlay(e) };
  }
  if ((ui.view === 'room' || ui.view === 'look') && r !== project.rooms[0]) return { label: r.name, run: () => startPlay(undefined, undefined, r.id) };
  return null;
}

function playButton(): string {
  const here = playHere();
  if (!here) return `<button class="btn play" data-act="play" title="Play from the start">Play</button>`;
  return `<div class="popwrap"><button class="btn play" data-act="play-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="playmenu">Play <span class="caret" aria-hidden="true">▾</span></button>
    <div class="popmenu" id="playmenu" role="menu" hidden>
      <button role="menuitem" data-act="play-here-top"><b>From here</b><span>${esc(here.label)}</span></button>
      <button role="menuitem" data-act="play"><b>From the start</b><span>${esc(project.rooms[0].name)}</span></button>
    </div></div>`;
}

function renderBar(): void {
  const list = crumbs();
  $('#crumbs')!.innerHTML = list.map(([k, n], i) =>
    `${i ? '<i>›</i>' : ''}<button data-act="crumb" data-k="${k}"${i === list.length - 1 ? ' aria-current="page"' : ''}>${esc(n)}</button>`).join('');
  const editing = ui.view !== 'home' && ui.view !== 'play';
  $('#backbtn')!.hidden = ui.view === 'home';
  const c = editing ? checkCount() : { n: 0, errors: 0 };
  const more = editing ? `<div class="popwrap phoneonly"><button class="btn small quiet morebtn" data-act="more-menu" aria-haspopup="menu" aria-expanded="false" aria-controls="moremenu" aria-label="More" title="More">⋯${c.errors ? '<i class="dot" aria-hidden="true"></i>' : ''}</button>
      <div class="popmenu" id="moremenu" role="menu" hidden>
        ${places(c).map(([act, ic, label, badge]) => `<button role="menuitem" data-act="${act}"${placeView[act] === ui.view ? ' aria-current="page"' : ''}>${icon(ic)}<b>${label}${badge}</b></button>`).join('')}
        <hr>
        <button role="menuitem" data-act="undo"${past.length ? '' : ' disabled'}><b>Undo</b></button>
        <button role="menuitem" data-act="redo"${future.length ? '' : ' disabled'}><b>Redo</b></button>
        <button role="menuitem" data-act="share"><b>Share</b></button>
      </div></div>` : '';
  $('#tools')!.innerHTML = ui.view === 'home' ? ''
    : ui.view === 'play'
    ? '<button class="btn ink" data-act="stop">Stop</button>'
    : `<span class="widetools"><button class="btn small quiet" data-act="undo" title="Undo (Ctrl+Z)"${past.length ? '' : ' disabled'}>Undo</button>
       <button class="btn small quiet" data-act="redo" title="Redo (Ctrl+Shift+Z)"${future.length ? '' : ' disabled'}>Redo</button>
       ${checkButton(c)}<button class="btn small quiet" data-act="share" title="Name your story and make a game file">Share</button></span>${more}${playButton()}`;
  const rail = $('#rail')!;
  rail.hidden = !editing;
  document.body.classList.toggle('rail-icons', railIcons);
  if (editing) rail.innerHTML = `<ul>${places(c).map(([act, ic, label, badge]) =>
      `<li><button data-act="${act}"${placeView[act] === ui.view ? ' aria-current="page"' : ''} title="${label}">${icon(ic)}<span class="lbl">${label}</span>${badge}</button></li>`).join('')}</ul>
    <button class="railfold" data-act="rail-toggle" aria-pressed="${railIcons}" title="${railIcons ? 'Show labels' : 'Icons only'}">${icon('fold')}<span class="lbl">Icons only</span></button>`;
}

function closeMenus(except?: Element | null): void {
  document.querySelectorAll<HTMLElement>('.popmenu:not([hidden])').forEach(m => {
    if (m === except) return;
    m.hidden = true;
    m.parentElement?.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false');
  });
}
function toggleMenu(id: string): void {
  const m = document.getElementById(id);
  if (!m) return;
  closeMenus(m);
  m.hidden = !m.hidden;
  m.parentElement?.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', String(!m.hidden));
  if (!m.hidden) m.querySelector<HTMLElement>('[role=menuitem]:not(:disabled)')?.focus();
}
document.addEventListener('click', ev => {
  const t = ev.target as HTMLElement;
  if (!t.closest('.popwrap')) closeMenus();
}, true);
document.addEventListener('keydown', ev => {
  const open = document.querySelector<HTMLElement>('.popmenu:not([hidden])');
  if (!open) return;
  if (ev.key === 'Escape') { ev.stopImmediatePropagation(); closeMenus(); open.parentElement?.querySelector<HTMLElement>('[aria-haspopup]')?.focus(); return; }
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
    ev.preventDefault();
    const items = [...open.querySelectorAll<HTMLElement>('[role=menuitem]:not(:disabled)')];
    const i = items.indexOf(document.activeElement as HTMLElement);
    items[(i + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  }
}, true);

function openShare(): void {
  const d = $<HTMLDialogElement>('#sheet')!;
  d.innerHTML = `<div class="sheetbody">${shareSheet(project, problems.filter(x => x.level === 'error').length)}</div>`;
  if (!d.open) d.showModal();
}
// A click on the backdrop closes the sheet.
$('#sheet')!.addEventListener('click', ev => { if (ev.target === ev.currentTarget) ($('#sheet') as HTMLDialogElement).close(); });

/** Arrows between room cards on the Story map, for every Go to from one room to another. */
function drawRoomLinks(): void {
  const svg = document.getElementById('roomlinks') as SVGSVGElement | null;
  const host = svg?.parentElement;
  if (!svg || !host) return;
  const box = host.getBoundingClientRect();
  svg.setAttribute('width', String(host.scrollWidth));
  svg.setAttribute('height', String(host.scrollHeight));
  const rect = (id: string) => host.querySelector<HTMLElement>(`.roomcard[data-k="${CSS.escape(id)}"]`)?.getBoundingClientRect();
  const paths: string[] = [];
  for (const [from, tos] of roomLinks(project)) {
    const a = rect(from);
    if (!a) continue;
    for (const to of tos) {
      const b = rect(to);
      if (!b) continue;
      // Two-way links run side by side; each leaves from the edge facing the other card.
      const two = roomLinks(project).get(to)?.includes(from) ? (from < to ? -9 : 9) : 0;
      const acx = a.left + a.width / 2, acy = a.top + a.height / 2, bcx = b.left + b.width / 2, bcy = b.top + b.height / 2;
      let sx: number, sy: number, ex: number, ey: number;
      if (Math.abs(bcx - acx) >= Math.abs(bcy - acy)) {
        const right = bcx > acx;
        sx = (right ? a.right : a.left) - box.left; ex = (right ? b.left : b.right) - box.left;
        sy = acy - box.top + two; ey = bcy - box.top + two;
      } else {
        const down = bcy > acy;
        sy = (down ? a.bottom : a.top) - box.top; ey = (down ? b.top : b.bottom) - box.top;
        sx = acx - box.left + two; ex = bcx - box.left + two;
      }
      const cx = (sx + ex) / 2 + (ey - sy) * 0.12, cy = (sy + ey) / 2 - (ex - sx) * 0.12;
      paths.push(`<path d="M${sx},${sy} Q${cx},${cy} ${ex},${ey}" marker-end="url(#rl-arrow)"/>`);
    }
  }
  svg.innerHTML = `<defs><marker id="rl-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z"/></marker></defs>${paths.join('')}`;
}
window.addEventListener('resize', () => { if (ui.view === 'map') drawRoomLinks(); });

/** "More" sections that were open stay open when the view is drawn again. */
function keepOpenDetails(draw: () => void): void {
  const open = [...document.querySelectorAll<HTMLDetailsElement>('#main details[id]')].filter(d => d.open).map(d => d.id);
  draw();
  for (const id of open) { const d = document.getElementById(id) as HTMLDetailsElement | null; if (d) d.open = true; }
}

function render(): void { keepOpenDetails(renderView); rememberPlace(); }

let shownView: View | null = null;
function renderView(): void {
  document.body.classList.toggle('compare-difference', lookCompare === 'difference');
  // One app frame: the view is named on the body, and toasts end with the view they belong to.
  document.body.dataset.view = ui.view;
  if (shownView !== ui.view) { if (shownView !== null) clearToast(); shownView = ui.view; }
  // The conversation view stretches to the whole window; other views keep a reading width.
  document.body.classList.toggle('wide', ui.view === 'convo');
  if (ui.view !== 'play' && player) { player.destroy(); player = null; }
  const r = room(), e = selected();
  if (ui.view === 'convo' && !e) ui.view = 'room';
  renderBar();
  const main = $('#main')!;
  switch (ui.view) {
    case 'home': main.innerHTML = viewHome(stories, storyId); break;
    case 'cast': main.innerHTML = viewCast(project, castSel); break;
    case 'library': main.innerHTML = viewLibrary(project, libFilter, libMark); break;
    case 'map': main.innerHTML = viewMap(project, ui, freshRooms()); requestAnimationFrame(drawRoomLinks); break;
    case 'room':
      main.innerHTML = viewRoom(project, ui, r, e);
      if (ui.drawArea) {
        const reshape = !!shapeFor;
        $('.stage.edit')?.insertAdjacentHTML('beforeend', `<div class="pendraw areadraw" data-areadraw><span>${reshape ? 'Click around the shape, point by point' : 'Drag a box, or click point by point around a shape'}</span><i class="abox"></i><svg class="ashape" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg></div>`);
        const side = $('aside.side');
        if (side) side.innerHTML = `<h2>${reshape ? 'Draw the shape' : 'Draw a clickable area'}</h2>
          <p class="hint">${reshape ? '' : 'Hold the mouse down at one corner and drag to the other for a box. Or '}${reshape ? 'C' : 'c'}lick point by point around the part of the picture players should click, and click the first point again (or press Enter) to close it.</p>
          <div class="row"><button class="btn small ink" data-act="shape-done" id="shape-done" disabled>Done</button><button class="btn small quiet" data-act="shape-undo" id="shape-undo" disabled>Undo last point</button><button class="btn small quiet" data-act="area-cancel">Cancel</button></div>`;
        drawShapeLine();
      }
      break;
    case 'convo': {
      const ctx = mapCtx()!;
      main.innerHTML = viewConvo(project, r, e!, convoMode, { canvas: convoMode === 'map' ? mapHTML(ctx) : '', side: convoMode === 'map' ? mapSide(ctx) : '', scene: convoMode === 'map' ? mapScene(ctx, sceneOpen) : '', sceneOpen });
      if (convoMode === 'map') {
        if (freshConvo) openView(); else applyZoom();
        afterMap();
        syncPlayFrom();
      } else updateStatus();
      freshConvo = false;
      break;
    }
    case 'look': main.innerHTML = viewLook(project, r, testFacts() ?? {}, lookTab, { panel: panelSel, block: blockSel }); break;
    case 'play': main.innerHTML = viewPlay(); break;
    case 'check': main.innerHTML = viewCheck(project, problems, test); break;
  }
}

function mapCtx(): MapCtx | null {
  const e = selected();
  return e ? { project, room: room(), el: e, sel: mapSel, pen: pathPen, pathPt, win: lineWin } : null;
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

/** The wheel (or a trackpad pinch) zooms the map around the pointer; Shift with the wheel scrolls sideways. */
function onWheel(ev: WheelEvent): void {
  if (ev.shiftKey) return;
  ev.preventDefault();
  const sc = ev.currentTarget as HTMLElement;
  const box = sc.getBoundingClientRect();
  const z = parseFloat($('#mzoomlabel')?.textContent ?? '100') / 100 || 1;
  // Lines and pixels feel the same: a notch is about 10%, a trackpad moves smoothly.
  const dy = ev.deltaMode === 1 ? ev.deltaY * 33 : ev.deltaY;
  setZoom(z * Math.exp(-Math.max(-120, Math.min(120, dy)) * 0.0016), { x: ev.clientX - box.left, y: ev.clientY - box.top });
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
  const sceneHost = $('#mscene');
  if (sceneHost) sceneHost.innerHTML = mapScene(ctx, sceneOpen);
  $('#mapwrap')?.classList.toggle('noscene', !sceneOpen);
  syncPlayFrom();
  applyZoom();
  const next = $('#mscroll');
  if (next) { next.scrollLeft = scroll[0]; next.scrollTop = scroll[1]; }
  if (focusSel) side.querySelector<HTMLElement>(focusSel)?.focus();
  else holder.querySelector<HTMLElement>('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  afterMap();
}

/** "Play from the marked step" works while a step is marked in the map. */
function syncPlayFrom(): void {
  const b = $<HTMLButtonElement>('#play-from');
  if (b) b.disabled = !mapSel || mapSel.startsWith('add:');
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
  updateGutter();
  facts.innerHTML = s.facts.length
    ? `<div class="label">Story facts used here</div><div class="row">${s.facts.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>`
    : '';
}

/** Line numbers beside the script, with the line that needs fixing marked. */
/** Line numbers beside the script. Long lines wrap, so each number is as tall as its line. */
let gutterWatch: ResizeObserver | null = null;
function updateGutter(): void {
  const t = $<HTMLTextAreaElement>('#script'), g = $('#gutter');
  if (!t || !g) return;
  const bad = new Set(parseScript(t.value).errors.map(x => x.n));
  const lines = t.value.split('\n');
  const cs = getComputedStyle(t);
  let m = document.getElementById('gutter-mirror');
  if (!m) {
    m = document.createElement('div');
    m.id = 'gutter-mirror';
    m.setAttribute('aria-hidden', 'true');
    m.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;';
    document.body.append(m);
  }
  m.style.width = `${t.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)}px`;
  m.style.font = cs.font;
  m.style.tabSize = cs.tabSize;
  m.innerHTML = lines.map(l => `<div>${esc(l) || ' '}</div>`).join('');
  const heights = [...m.children].map(c => c.getBoundingClientRect().height);
  g.innerHTML = lines.map((_, i) => `<span${bad.has(i + 1) ? ' class="err"' : ''} style="height:${heights[i]}px">${i + 1}</span>`).join('');
  g.scrollTop = t.scrollTop;
  if (!gutterWatch) gutterWatch = new ResizeObserver(() => updateGutter());
  gutterWatch.disconnect();
  gutterWatch.observe(t);
}
document.addEventListener('scroll', ev => {
  if ((ev.target as HTMLElement).id === 'script') { const g = $('#gutter'); if (g) g.scrollTop = (ev.target as HTMLElement).scrollTop; }
}, true);

/** The strip under the game is editor-only: the player never sees it. */
function updateStrip(s: Readonly<PlayState>): void {
  const strip = $('#strip');
  if (!strip) return;
  const r = project.rooms.find(x => x.id === s.roomId);
  const idle = !s.event && !r?.els.some(e => e.script.trim());
  const facts = Object.entries(s.facts);
  const tf = testFacts();
  strip.innerHTML = `<span class="label">Only you see this</span>`
    + (tf && Object.keys(tf).length ? '<span class="testing">Testing with test values</span>' : '')
    + (s.problem ? `<span class="status err">${esc(s.problem)}</span>` : '')
    + (idle ? '<span>Nothing in this room is clickable yet. Stop, click a character, and make them say something.</span>'
      : !s.event ? '<span>Click a character or object in the picture.</span>' : '')
    + (facts.length ? facts.map(([k, v]) => `<span class="chip">${esc(k)} = ${esc(v === true ? 'yes' : v === false ? 'no' : String(v))}</span>`).join('') : '<span>No story facts changed yet.</span>');
  renderBar();
}

function startPlay(fromElement?: StoryElement, startPath?: string, fromRoom?: string): void {
  ui.back = ui.view === 'play' ? ui.back : ui.view;
  ui.view = 'play';
  render();
  // Starting inside an "Only if": the facts are set so the marked step is reached.
  let facts = testFacts();
  if (fromElement && startPath) {
    const need = factsToReach(parseScript(fromElement.script).steps, startPath, { ...startFacts(project), ...(facts ?? {}) });
    if (Object.keys(need).length) {
      facts = { ...(facts ?? {}), ...need };
      toast(`Playing with ${Object.entries(need).map(([k, v]) => `${k} = ${v === true ? 'yes' : v === false ? 'no' : v}`).join(', ')}, so this step is reached.`);
    }
  }
  player = createPlayer($('#player')!, project, {
    roomId: fromElement ? room().id : fromRoom,
    elementId: fromElement?.id,
    startPath,
    facts,
    storageKey: `story-engine-editor-play:${storyId ?? ''}`,
    onEnding: name => toast(`The story reached the ending "${name}".`),
    onChange: updateStrip
  });
  renderBar();
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
  ui.namingRoom = false;
  ui.drawArea = false;
  if (view !== 'room' && view !== 'convo') lookReturn = null;
  ui.view = view;
  ui.adding = null;
  ui.lookEdit = null;
  ui.confirmReset = false;
  render();
}

/* Where the author was, so a reload opens the same story and view. */
const PLACE_KEY = 'story-engine:place';
function rememberPlace(): void {
  try {
    if (!storyId || ui.view === 'home' || ui.view === 'play') { if (ui.view === 'home') localStorage.removeItem(PLACE_KEY); return; }
    localStorage.setItem(PLACE_KEY, JSON.stringify({ storyId, view: ui.view, roomId: ui.roomId, sel: ui.sel }));
  } catch { /* not remembered */ }
}

function replaceProject(p: Project): void {
  project = p;
  ui.roomId = project.rooms[0].id;
  ui.sel = null;
  save();
  go('room');
}

/* ---------- Stories ---------- */

/** Starts a fresh editing session on a project: nothing to undo, nothing selected. */
function enterProject(p: Project, id: string, view: View): void {
  project = p;
  storyId = id;
  past.length = 0; future.length = 0; images.clear(); imageKeys.clear();
  fieldSnapshot = null;
  touched.clear(); knownRooms = new Set(p.rooms.map(r => r.id));
  ui.roomId = project.rooms[0].id;
  ui.sel = null;
  mapSel = null;
  lookTab = 'style';
  loadTest();
  pruneOncePictures();
  go(view);
}

async function openStory(id: string): Promise<void> {
  await whenSaved();
  const p = await loadStory(id);
  if (!p) { toast('This story could not be opened.'); return refreshHome(); }
  enterProject(p, id, 'map');
}

async function newStory(p: Project, view: View): Promise<void> {
  await whenSaved();
  const id = await addStory(p);
  enterProject(p, id, view);
}

async function refreshHome(message?: string): Promise<void> {
  await whenSaved();
  stories = await listStories();
  if (ui.view === 'home') render();
  if (message) toast(message);
}

function goHome(): void {
  if (player) { player.destroy(); player = null; }
  go('home');
  void refreshHome();
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
let lookFileMode: { kind: 'add' } | { kind: 'replace'; lookId: string } | { kind: 'once' } | { kind: 'cast'; characterId: string } = { kind: 'add' };
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
const NOT_RECORDED = new Set(['lib-filter', 'lib-mark', 'panel-sel', 'pblock-sel', 'area-shape', 'shape-undo', 'map-fold', 'map-fold-all', 'snd-try', 'voice-play', 'voice-upload', 'voice-rec', 'upload-video', 'area-cancel', 'door-cancel', 'edit-enter', 'library', 'win', 'path-draw', 'path-play', 'mark-add', 'music-add', 'cast-sound-add', 'sound-add', 'sound-play', 'cast', 'cast-open', 'cast-back', 'cast-new', 'cast-promote', 'cast-add-looks', 'cast-goto-room', 'cast-goto-convo', 'fx-try', 'scene-toggle', 'home', 'open-story', 'new-story', 'new-sample', 'import-story', 'duplicate-story', 'delete-story', 'test-off', 'look-tab', 'make-game', 'play-here', 'check', 'goto-problem', 'test-clear', 'once-lineup', 'look-compare', 'undo', 'redo', 'save-file', 'open-file', 'upload', 'play', 'play-convo', 'stop', 'convo-mode', 'look', 'crumb', 'add-looks', 'look-replace', 'once-picture', 'look-open', 'look-done']);

for (const a of ['story-map', 'play-menu', 'play-here-top', 'more-menu', 'share', 'share-close', 'rail-toggle', 'go-back']) NOT_RECORDED.add(a);

const actions: Record<string, (k: string) => void> = {
  crumb(k) {
    if (k === 'home') return goHome();
    if (k === 'cast') { castSel = null; return go('cast'); }
    if (k === 'cast-one') return;
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
  'fx-try'() { tryEffect(); },
  library() { go('library'); },
  win(k) { lineWin = !k || lineWin === k ? null : k as LineWin; refreshMap(); },
  'path-draw'() { pathPen = true; pathPt = null; refreshMap(); },
  'path-play'() { playPathPreview(); },
  'mark-add'() { const input = $<HTMLInputElement>('#markfile')!; input.value = ''; input.click(); },
  'mark-reset'(k) { project.marks = project.marks?.filter(m => m.name !== k); if (!project.marks?.length) delete project.marks; for (const c of project.characters) if (c.markAt) delete c.markAt[k]; save(); render(); },
  'mark-delete'(k) {
    project.marks = project.marks?.filter(m => m.name !== k);
    if (!project.marks?.length) delete project.marks;
    for (const r of project.rooms) for (const e of r.els) e.script = renameMarkInScript(e.script, k, '');
    save(); render();
  },
  'sound-add'() { pickSound(() => undefined); },
  'sound-play'(k) { const x = project.sounds?.find(y => y.id === k); if (x) previewSound(x.name, true); },
  'music-add'() { pickSound(() => undefined, null, true); },
  'room-music-once'(k) { room().musicOnce = k === '1' || undefined; save(); render(); },
  'sound-delete'(k) {
    const x = project.sounds?.find(y => y.id === k);
    if (!x || !project.sounds) return;
    project.sounds = project.sounds.filter(y => y !== x);
    if (!project.sounds.length) delete project.sounds;
    for (const r of project.rooms) for (const e of r.els) {
      if ((e.sound ?? '').toLowerCase() === x.name) delete e.sound;
      e.script = renameSoundInScript(e.script, x.name, '');
    }
    for (const c of project.characters) for (const l of c.looks) if (l.sound === x.name) delete l.sound;
    for (const r of project.rooms) if (r.music === x.name) { delete r.music; delete r.musicOnce; }
    save(); render();
  },
  cast() { castSel = null; go('cast'); },
  'cast-open'(k) { castSel = k; render(); window.scrollTo(0, 0); },
  'cast-back'() { castSel = null; render(); },
  'cast-new'() { pickCharacter(c => { castSel = c.id; go('cast'); toast(`${c.name} is ready. Add looks, or place ${c.name} in a room.`); }); },
  'cast-promote'(k) {
    pickCharacter(c => {
      // The new character keeps the speaker's name, so their lines are theirs; starter figures with that name use it now.
      c.name = k;
      for (const r of project.rooms) for (const e of r.els) if (e.kind === 'char' && !e.characterId && e.name.trim().toLowerCase() === k.trim().toLowerCase()) { e.characterId = c.id; e.preset = undefined; e.expr = undefined; }
      castSel = c.id;
      go('cast');
      toast(`${k} now has your picture. Add looks for more expressions.`);
    });
  },
  'cast-add-looks'() { if (castSel) pickLookFiles({ kind: 'cast', characterId: castSel }, true); },
  'cast-look-delete'(k) {
    const c = project.characters.find(x => x.id === castSel);
    if (!c) return;
    c.looks = c.looks.filter(l => l.id !== k);
    save(); render();
  },
  'cast-goto-room'(k) { const [roomId, elId] = k.split('|'); ui.roomId = roomId; ui.sel = elId; go('room'); },
  'cast-goto-convo'(k) { const [roomId, elId] = k.split('|'); ui.roomId = roomId; ui.sel = elId; mapSel = null; freshConvo = true; go('convo'); },
  'cast-sound-add'() { const c = project.characters.find(x => x.id === castSel); if (c) pickSound(() => undefined, c); },
  'cast-fact-add'() {
    const c = project.characters.find(x => x.id === castSel);
    const kind = ($<HTMLSelectElement>('#cast-fact-kind')?.value ?? 'number') as FactDef['kind'];
    const raw = factName($<HTMLInputElement>('#cast-fact-name')?.value ?? '');
    if (!c) return;
    if (!raw) { toast('Give it a name first, such as affection.'); $<HTMLInputElement>('#cast-fact-name')?.focus(); return; }
    const own = factName(c.name).replace(/\./g, '_');
    const fact = raw.includes('.') ? raw : kind === 'item' ? `has.${raw}` : `${own}.${raw}`;
    c.facts ??= [];
    if (c.facts.some(f => f.fact === fact)) { toast(`${fact} is already tracked.`); return; }
    c.facts.push({ fact, kind, ...(kind === 'number' ? { start: 0 } : kind === 'word' ? {} : { start: false }) });
    save(); render();
    toast(`Tracking ${fact}. Use it in conversations with Change and Only if.`);
  },
  'cast-fact-delete'(k) {
    const c = project.characters.find(x => x.id === castSel);
    if (!c?.facts) return;
    c.facts = c.facts.filter(f => f.fact !== k);
    if (!c.facts.length) delete c.facts;
    save(); render();
  },
  'cast-fact-track'(k) {
    const c = project.characters.find(x => x.id === castSel);
    if (!c) return;
    const kind = factKind(project, k);
    c.facts ??= [];
    c.facts.push({ fact: k, kind: kind === 'yesno' ? 'milestone' : kind === 'word' ? 'word' : 'number' });
    save(); render();
  },
  'cast-delete'() {
    const c = project.characters.find(x => x.id === castSel);
    if (!c) return;
    project.characters = project.characters.filter(x => x !== c);
    for (const r of project.rooms) r.els = r.els.filter(e => e.characterId !== c.id);
    if (!room().els.some(e => e.id === ui.sel)) ui.sel = null;
    castSel = null;
    save(); render();
    toast(`Deleted ${c.name}. Their lines stay, as a voice without a picture. Undo brings ${c.name} back.`);
  },
  'map-fold'(k) { toggleFold(k); refreshMap(); },
  'map-fold-all'() { toggleFoldAll(); refreshMap(); },
  'snd-try'(k) { previewSound(k, true); },
  'scene-toggle'() { sceneOpen = !sceneOpen; try { localStorage.setItem(SCENE_KEY, sceneOpen ? 'yes' : 'no'); } catch { /* this session */ } refreshMap(); },
  'cond-add'() { const e = selected(); if (!e?.cond) return; e.andConds = [...(e.andConds ?? []), { fact: e.cond.fact, op: '>=', value: 1 }]; save(); render(); },
  'cond-remove'(k) {
    const e = selected();
    if (!e?.cond) return;
    const all = elementConds(e).filter((_, i) => i !== Number(k));
    e.cond = all[0];
    if (all.length > 1) e.andConds = all.slice(1); else delete e.andConds;
    if (!e.cond) delete e.cond;
    save(); render();
  },
  'area-shape'() { const e = selected(); if (e?.kind !== 'area') return; shapeFor = e.id; shapePts = []; ui.drawArea = true; render(); },
  'area-box'() { const e = selected(); if (!e) return; delete e.shape; save(); render(); },
  'shape-done'() { finishShape(); },
  'shape-undo'() { shapePts.pop(); drawShapeLine(); },
  'add-area'() { ui.adding = null; ui.sel = null; ui.drawArea = true; shapeFor = null; shapePts = []; render(); },
  'area-cancel'() { ui.drawArea = false; shapeFor = null; shapePts = []; render(); },
  'door-new'() {
    const e = selected(), input = $<HTMLInputElement>('#new-room-name');
    if (!e || !input) return;
    const name = input.value.replace(/[\n:]/g, ' ').trim();
    if (!name) { input.focus(); toast('Give the new room a name.'); return; }
    const r = createRoom(uniqueRoomName(name));
    project.rooms.push(r);
    e.script = `Go to ${r.name}`;
    nameAfterDoor(e, r.name);
    ui.namingRoom = false;
    save(); render();
    toast(`Made the room "${r.name}". Use "Go to ${r.name} now" to set it up.`);
  },
  'door-cancel'() { ui.namingRoom = false; render(); },
  'edit-enter'(k) { ui.sel = k; mapSel = null; freshConvo = true; go('convo'); },
  'room-auto-once'(k) { room().autoOnce = k === '1' || undefined; save(); render(); },
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
  look() { go('look'); },
  'convo-mode'(k) {
    convoMode = k === 'script' ? 'script' : 'map';
    try { localStorage.setItem(MODE_KEY, convoMode); } catch { /* remembered for this session only */ }
    mapSel = null;
    freshConvo = convoMode === 'map';
    render();
  },
  undo() { undo(); },
  redo() { redo(); },
  'make-game'() {
    pruneOncePictures();
    // The game's player is only loaded when a game file is made.
    void import('./publish').then(({ downloadGame }) => {
      const name = downloadGame(project);
      const serious = problems.filter(x => x.level !== 'note').length;
      toast(serious ? `${name} is in your downloads. Check found ${serious} ${serious === 1 ? 'problem' : 'problems'} players may run into.` : `${name} is in your downloads. Open it to play.`);
    });
  },
  'save-file'() { pruneOncePictures(); saveToFile(project); toast('Saved to a file in your downloads'); },
  home() { goHome(); },
  'open-story'(k) { void openStory(k); },
  'new-story'() { void newStory(createProject(), 'room'); },
  'new-sample'() { const p = sampleProject(); p.title = 'Last order (sample)'; void newStory(p, 'map'); },
  'import-story'() { const input = $<HTMLInputElement>('#projectfile')!; input.value = ''; input.click(); },
  'duplicate-story'(k) { void duplicateStory(k).then(() => refreshHome('Duplicated')); },
  'delete-story'(k) {
    if (k === storyId) storyId = null;
    void deleteStory(k).then(() => refreshHome('Deleted'));
  },
  'open-file'() { const input = $<HTMLInputElement>('#projectfile')!; input.value = ''; input.click(); },
  theme(k) { project.look.theme = k; save(); render(); },
  'look-bubbles'(k) { if (k === 'on') project.look.bubbles = true; else delete project.look.bubbles; save(); render(); },
  'look-narration'(k) { if (k === 'screen') project.look.narration = 'screen'; else delete project.look.narration; save(); render(); },
  'look-menu'(k) { if (k === 'off') project.look.gameMenu = false; else delete project.look.gameMenu; save(); render(); },
  'upload-video'() { const i = $<HTMLInputElement>('#videofile')!; i.value = ''; i.click(); },
  'voice-play'() { const ctx = mapCtx(); const st = ctx && mapSel ? getStep(parseScript(ctx.el.script).steps, mapSel) : null; if (st?.t === 'say' && st.voice) previewSound(st.voice); },
  'voice-upload'() { const at = mapSel; pickSound(name => { setLineVoice(at, name); }); },
  'voice-rec'() { void recordVoice(); },
  'look-box'(k) { const L = project.look; if (k === 'glass' || k === 'outline' || k === 'band') L.box = k; else delete L.box; save(); render(); },
  'look-names'(k) { const L = project.look; if (k === 'inside' || k === 'plain') L.names = k; else delete L.names; save(); render(); },
  'look-width'(k) { const L = project.look; if (k === 'full') L.width = 'full'; else delete L.width; save(); render(); },
  'look-typing'(k) { const L = project.look; if (k === 'on') L.typing = 40; else delete L.typing; save(); render(); },
  'look-colours-reset'() { const L = project.look; delete L.boxColor; delete L.textColor; delete L.accentColor; save(); render(); },
  'look-choices'(k) { if (k === 'center') project.look.choices = 'center'; else delete project.look.choices; save(); render(); },
  'bg-fit'(k) { const bg = room().bg; if (!bg) return; if (k === 'fit' || k === 'stretch') bg.fit = k; else delete bg.fit; save(); render(); },
  'bg-edge'(k) { const bg = room().bg; if (!bg) return; if (k === 'color') { bg.edge = 'color'; bg.color ??= '#000000'; } else delete bg.edge; save(); render(); },
  'bg-reset'() { const bg = room().bg; if (!bg) return; delete bg.fx; delete bg.fy; delete bg.zoom; save(); render(); },
  play() { startPlay(); },
  'play-convo'() { startPlay(selected()); },
  'play-here'() { const e = selected(); if (e && mapSel && !mapSel.startsWith('add:')) startPlay(e, mapSel.split('#')[0]); },
  check() { go('check'); },
  'fix-door'(k) {
    const pr = problems[Number(k)];
    const to = pr && project.rooms.find(r => r.id === pr.roomId);
    const from = project.rooms.find(r => r.id === $<HTMLSelectElement>(`#fix-from-${k}`)?.value);
    if (!to || !from) return;
    let name = `Door to ${to.name}`, n = 2;
    while (from.els.some(e => e.name === name)) name = `Door to ${to.name} ${n++}`;
    // A tall clickable area at the right edge of the picture, ready to be dragged over the real door.
    from.els.push({ id: newId(), kind: 'area', name, x: 88, y: 86, size: 56, w: 14, hover: to.name, script: `Go to ${to.name}` });
    save(); render();
    toast(`Made a door in ${from.name} that goes to ${to.name}. Open ${from.name} to move it over the right spot.`);
  },
  'goto-problem'(k) {
    const pr = problems[Number(k)];
    if (!pr) return;
    if (pr.panel) { panelSel = pr.panel; blockSel = null; lookTab = 'hud'; go('look'); return; }
    ui.roomId = pr.roomId;
    if (!pr.elId) { ui.sel = null; go('room'); return; }
    if (pr.inRoom) { ui.sel = pr.elId; go('room'); const more = $<HTMLDetailsElement>('#el-more'); if (more) more.open = true; return; }
    ui.sel = pr.elId;
    convoMode = pr.line !== undefined ? 'script' : 'map';
    mapSel = pr.path ?? null;
    freshConvo = !pr.path;
    go('convo');
    if (pr.path) requestAnimationFrame(() => $('.mnode.on, .mrow.on')?.scrollIntoView({ block: 'center', inline: 'center' }));
    if (pr.line !== undefined) { const t = $<HTMLTextAreaElement>('#script'); if (t) { const at = t.value.split('\n').slice(0, pr.line - 1).join('\n').length + (pr.line > 1 ? 1 : 0); t.focus(); t.setSelectionRange(at, at); } }
  },
  'test-off'() { test.use = false; saveTest(); render(); toast('Test values are off. Play starts with every fact unset.'); },
  'test-clear'() { test.values = {}; saveTest(); render(); },
  'panel-add'(k) {
    const pn = panelFromTemplate(k as PanelTemplate, (project.panels ?? []).map(x => x.name), project.characters[0]?.id);
    (project.panels ??= []).push(pn);
    // One value starts with a number fact the story already uses.
    const first = pn.blocks[0], fact = storyFacts(project).find(f => factKind(project, f) === 'number');
    if (k === 'value' && first?.kind === 'meter' && fact) { first.fact = fact; first.label = fact.replace(/^.*\./, '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()); }
    panelSel = pn.id; blockSel = null; lookTab = 'hud';
    save(); render();
  },
  'panel-sel'(k) { panelSel = k || null; blockSel = null; render(); },
  'panel-remove'() { project.panels = (project.panels ?? []).filter(x => x.id !== panelSel); if (!project.panels.length) delete project.panels; panelSel = null; blockSel = null; save(); render(); },
  'panel-copy'() {
    const pn = panelOf(panelSel);
    if (!pn) return;
    const copy: Panel = JSON.parse(JSON.stringify(pn));
    copy.id = newId();
    copy.blocks.forEach(b => { b.id = newId(); });
    let name = `${pn.name} copy`, i = 2;
    while ((project.panels ?? []).some(x => x.name.toLowerCase() === name.toLowerCase())) name = `${pn.name} copy ${i++}`;
    copy.name = name; copy.x = Math.min(90, pn.x + 3); copy.y = Math.min(90, pn.y + 3);
    project.panels!.push(copy);
    panelSel = copy.id; blockSel = null; save(); render();
  },
  'pblock-sel'(k) { blockSel = blockSel === k ? null : k; render(); },
  'pblock-add'(k) {
    const pn = panelOf(panelSel);
    if (!pn) return;
    if (k === 'image') { pickImageFile(img => { const b: PanelBlock = { id: newId(), kind: 'image', img }; pn.blocks.push(b); blockSel = b.id; save(); render(); }); return; }
    const b = newBlock(k as PanelBlock['kind'], project.characters[0]?.id);
    if (!b) return;
    pn.blocks.push(b); blockSel = b.id; save(); render();
  },
  'pblock-move'(k) {
    const pn = panelOf(panelSel);
    const [bid, d] = k.split('|');
    const i = pn ? pn.blocks.findIndex(b => b.id === bid) : -1, j = i + Number(d);
    if (!pn || i < 0 || j < 0 || j >= pn.blocks.length) return;
    [pn.blocks[i], pn.blocks[j]] = [pn.blocks[j], pn.blocks[i]];
    save(); render();
  },
  'pblock-remove'(k) { const pn = panelOf(panelSel); if (!pn) return; pn.blocks = pn.blocks.filter(b => b.id !== k); if (blockSel === k) blockSel = null; save(); render(); },
  'pn-layout'(k) { const pn = panelOf(panelSel); if (pn) { pn.layout = k === 'row' ? 'row' : 'column'; save(); render(); } },
  'pn-style'(k) {
    const pn = panelOf(panelSel);
    if (!pn) return;
    if (k === 'frame' && !pn.frame) { pickImageFile(img => { pn.frame = { img, slice: 30, width: 1.5 }; pn.style = 'frame'; save(); render(); }, 1024); return; }
    pn.style = k === 'none' ? 'none' : k === 'frame' ? 'frame' : 'theme'; save(); render();
  },
  'pn-frame'() { const pn = panelOf(panelSel); if (pn) pickImageFile(img => { pn.frame = { img, slice: pn.frame?.slice ?? 30, width: pn.frame?.width ?? 1.5 }; pn.style = 'frame'; save(); render(); }, 1024); },
  'pb-image'() { const b = blockOf(); if (b?.kind === 'image') pickImageFile(img => { b.img = img; save(); render(); }); },
  'item-add'() {
    const input = $<HTMLInputElement>('#item-new');
    const name = input?.value.replace(/\s+/g, ' ').trim() ?? '';
    if (!name) { input?.focus(); toast('Give the item a name first, such as old key.'); return; }
    const it = addItem(project, name);
    save(); render();
    toast(`${it.name} is an item now. Give it in a conversation with "Give or take an item".`);
  },
  'item-icon'(k) { pickImageFile(img => { addItem(project, k.replace(/_/g, ' '), k).icon = img; save(); render(); }, 160); },
  'lib-filter'(k) { libFilter = k || 'all'; libMark = null; render(); },
  'lib-mark'(k) { libMark = libMark === k ? null : k; render(); },
  'pb-icon'(k) { const b = blockOf(); if (b?.kind === 'list') pickImageFile(img => { b.icons = { ...(b.icons ?? {}), [k]: img }; save(); render(); }, 160); },
  'look-tab'(k) { lookTab = k === 'hud' ? 'hud' : 'style'; render(); },
  'story-map'() { ui.sel = null; go('map'); },
  'play-menu'() { const open = !$('#playmenu')?.hidden; renderBar(); if (!open) toggleMenu('playmenu'); },
  'play-here-top'() { closeMenus(); const here = playHere(); if (here) here.run(); else startPlay(); },
  'more-menu'() { toggleMenu('moremenu'); },
  share() { closeMenus(); openShare(); },
  'share-close'() { $<HTMLDialogElement>('#sheet')?.close(); },
  'rail-toggle'() {
    railIcons = !railIcons;
    try { localStorage.setItem(RAIL_KEY, railIcons ? 'icons' : 'labels'); } catch { /* not remembered */ }
    renderBar();
    if (ui.view === 'map') requestAnimationFrame(drawRoomLinks);
  },
  'go-back'() {
    if (ui.view === 'play') return actions.stop('');
    if (ui.view === 'convo') return go('room');
    if (ui.view === 'cast' && castSel) { castSel = null; return render(); }
    if (ui.view === 'look') return go('room');
    if (ui.view === 'map') return goHome();
    ui.sel = null;
    go('map');
  },
  stop() {
    const back = ui.back === 'convo' && selected() ? 'convo' : ui.back === 'map' ? 'map' : 'room';
    if (back === 'convo') freshConvo = false;
    go(back);
  }
};

/** Plays the selected line's effect on the speaker in the scene picture, and its sound. */
function tryEffect(): void {
  const ctx = mapCtx();
  if (!ctx || !mapSel) return;
  const step = getStep(parseScript(ctx.el.script).steps, mapSel);
  if (step?.t !== 'say') return;
  if (step.sound) previewSound(step.sound);
  if (!step.fx) return;
  const node = [...document.querySelectorAll<HTMLElement>('.mpreview .el.staged')].find(n => (n.dataset.who ?? '').toLowerCase() === step.who.trim().toLowerCase());
  if (!node) return;
  node.className = node.className.replace(/\bfx-[\w-]+/g, '').trim();
  node.style.cssText = node.style.cssText.replace(/--fx[a-z]:[^;]*;?/g, '') + `;${fxVars(step.fxOpts)}`;
  void node.offsetWidth;
  node.classList.add(`fx-${step.fx}`);
}

document.addEventListener('keydown', ev => {
  if ((ev.target as HTMLElement).id === 'new-room-name' && ev.key === 'Enter') { ev.preventDefault(); const before = snapshot(); actions['door-new'](''); record(before); return; }
  if (ev.key === 'Escape' && ui.drawArea) { ui.drawArea = false; render(); return; }
  if ((ev.target as HTMLElement).id === 'cast-fact-name' && ev.key === 'Enter') { ev.preventDefault(); const before = snapshot(); actions['cast-fact-add'](''); record(before); }
});

// Escape closes an open line window first, before it would deselect the step.
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && lineWin) { ev.stopImmediatePropagation(); lineWin = null; refreshMap(); }
}, true);

/* ---------- New characters from a picture ---------- */

let charDone: ((c: Character) => void) | null = null;
/** Asks for a picture and makes a new main character from it, without placing it anywhere. */
function pickCharacter(done: (c: Character) => void): void {
  charDone = done;
  const input = $<HTMLInputElement>('#charfile')!;
  input.value = '';
  input.click();
}
$('#charfile')!.addEventListener('change', async ev => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  const done = charDone;
  charDone = null;
  if (!f) return;
  let img: string;
  try { img = await readImage(f, 900, 'image/webp'); } catch { toast('That picture could not be opened.'); return; }
  const before = snapshot();
  let name = characterNameFromFile(f), i = 2;
  const base = name;
  while (project.characters.some(c => c.name.toLowerCase() === name.toLowerCase())) name = `${base} ${i++}`;
  const c: Character = { id: newId(), name, base: img, looks: [] };
  project.characters.push(c);
  done?.(c);
  save();
  record(before);
});

/* ---------- Marks ---------- */

/** The project's own copy of a mark, made from the starter mark the first time it is changed. */
function ownMark(name: string): MarkDef | undefined {
  const own = project.marks?.find(m => m.name === name);
  if (own) return own;
  const base = findMark(project, name);
  if (!base) return undefined;
  project.marks ??= [];
  const copy = { ...base, id: newId() };
  project.marks.push(copy);
  return copy;
}

$('#markfile')!.addEventListener('change', ev => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  if (f.size > 2 * 1024 * 1024) { toast('That picture is larger than 2 MB. Marks are small: try a smaller GIF or PNG.'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const before = snapshot();
    project.marks ??= [];
    let name = cleanMarkName(f.name), i = 2;
    const base = name;
    while (findMark(project, name)) name = `${base} ${i++}`;
    // Kept as it came, so a GIF keeps its animation.
    project.marks.push({ id: newId(), name, img: String(reader.result), anim: 'none', x: 66, y: 8, size: 10 });
    save(); record(before); render();
    toast(`Added the mark "${name}". Pick it in a line, then drag it into place in the scene.`);
  };
  reader.readAsDataURL(f);
});

/** Reads a standing movement from its pick list and sliders. */
function idleFrom(prefix: string, cur: Idle | undefined, field: string, value: string): Idle | undefined {
  if (field === prefix) return value ? (value === 'none' ? { move: 'none' } : { ...(cur ?? {}), move: value }) : undefined;
  if (!cur) return cur;
  const key = field.slice(prefix.length + 1) as 'strength' | 'speed';
  const next = { ...cur };
  if (Number(value) === 3) delete next[key]; else next[key] = Number(value);
  return next;
}

/* ---------- Voices ---------- */

function setLineVoice(at: string | null, name: string): void {
  const ctx = mapCtx();
  if (!ctx || !at) return;
  const steps = parseScript(ctx.el.script).steps, st = getStep(steps, at);
  if (st?.t !== 'say') return;
  st.voice = name;
  ctx.el.script = writeScript(steps);
  save();
  refreshMap();
}

let recorder: MediaRecorder | null = null;
/** Records the selected line's voice with the microphone: the first click starts, the second stops. */
async function recordVoice(): Promise<void> {
  if (recorder) { recorder.stop(); return; }
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { toast('This browser cannot record. Upload a file instead.'); return; }
  const at = mapSel, ctx = mapCtx();
  const st = ctx && at ? getStep(parseScript(ctx.el.script).steps, at) : null;
  if (st?.t !== 'say') return;
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch { toast('The microphone is not available. Allow it in the browser, or upload a file.'); return; }
  const chunks: Blob[] = [];
  const rec = new MediaRecorder(stream);
  recorder = rec;
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    recorder = null;
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    const reader = new FileReader();
    reader.onload = () => {
      const before = snapshot();
      const who = st.who.trim() || 'narrator';
      const name = addSound(`voice ${who} ${(project.sounds ?? []).filter(x => x.name.startsWith(`voice ${who.toLowerCase()}`)).length + 1}`, String(reader.result), project.characters.find(c => c.name.toLowerCase() === who.toLowerCase()) ?? null);
      setLineVoice(at, name);
      record(before);
      toast('Voice recorded.');
    };
    reader.readAsDataURL(blob);
  };
  rec.start();
  const b = $<HTMLButtonElement>('#voice-rec');
  if (b) { b.textContent = '■ Stop recording'; b.classList.add('rec'); }
  // Recordings stop by themselves after 30 seconds.
  setTimeout(() => { if (recorder === rec) rec.stop(); }, 30000);
}

$('#videofile')!.addEventListener('change', ev => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  if (f.size > 20 * 1024 * 1024) { toast('That video is larger than 20 MB. A short loop of a few seconds works best.'); return; }
  const reader = new FileReader();
  reader.onload = () => { const before = snapshot(); room().bg = { video: String(reader.result) }; ui.adding = null; save(); record(before); render(); };
  reader.readAsDataURL(f);
});

/* ---------- Sounds ---------- */

let soundDone: ((name: string) => void) | null = null;
let soundOwner: Character | null = null;
let soundIsMusic = false;
/** Asks for a sound file; when it is added, done gets its name. With an owner, it joins that character's sounds. */
function pickSound(done: (name: string) => void, owner: Character | null = null, music = false): void {
  soundDone = done;
  soundOwner = owner;
  soundIsMusic = music;
  const input = $<HTMLInputElement>('#soundfile')!;
  input.value = '';
  input.click();
}

const SOUND_LIMIT = 3 * 1024 * 1024, MUSIC_LIMIT = 15 * 1024 * 1024;
$('#soundfile')!.addEventListener('change', ev => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  const done = soundDone;
  soundDone = null;
  if (!f) return;
  const music = soundIsMusic;
  if (!music && f.size > SOUND_LIMIT) { toast('That sound is larger than 3 MB. Short sounds work best: trim it, or save it as MP3 or OGG.'); return; }
  if (music && f.size > MUSIC_LIMIT) { toast('That track is larger than 15 MB. Save it as MP3 or OGG at a lower quality (128 kbps is plenty).'); return; }
  const reader = new FileReader();
  reader.onload = () => {
    const before = snapshot();
    const name = addSound(f.name, String(reader.result), soundOwner, music);
    soundOwner = null;
    done?.(name);
    save(); record(before);
    if (ui.view === 'convo') refreshMap(); else render();
    toast(music ? `Added the music "${name}".` : `Added the sound "${name}".`);
  };
  reader.onerror = () => toast('That sound could not be read.');
  reader.readAsDataURL(f);
});

function addSound(fileName: string, data: string, owner: Character | null = null, music = false): string {
  project.sounds ??= [];
  let base = cleanSoundName(fileName);
  // A character's sounds carry the character's name, so "laugh" for Lin is "lin laugh".
  const who = owner ? cleanSoundName(owner.name) : '';
  if (who && !base.startsWith(`${who} `) && base !== who) base = cleanSoundName(`${who} ${base}`);
  let name = base, i = 2;
  while (project.sounds.some(x => x.name === name)) name = `${base} ${i++}`;
  project.sounds.push({ id: newId(), name, data, ...(owner ? { owner: owner.id } : {}), ...(music ? { music: true } : {}) });
  return name;
}

let previewAudio: HTMLAudioElement | null = null;
let previewing = '';
/** Plays a sound at its volume; a second click on the same one (music, say) stops it. */
function previewSound(name: string, toggle = false): void {
  const snd = project.sounds?.find(x => x.name === name.toLowerCase());
  previewAudio?.pause();
  if (!snd || (toggle && previewing === snd.id)) { previewing = ''; previewAudio = null; return; }
  previewAudio = new Audio(snd.data);
  previewAudio.volume = (snd.volume ?? 100) / 100;
  previewing = snd.id;
  previewAudio.onended = () => { if (previewing === snd.id) previewing = ''; };
  void previewAudio.play().catch(() => undefined);
}

function uniqueRoomName(base: string): string {
  let name = base, i = 2;
  while (findRoomByName(project, name)) name = `${base} ${i++}`;
  return name;
}

/* ---------- Files ---------- */

$('#projectfile')!.addEventListener('change', async ev => {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  const p = await readProjectFile(f);
  if (!p) { toast('That file is not a Story Engine project.'); return; }
  await newStory(p, 'map');
  toast(`Opened ${f.name} as a new story.`);
});

$('#lookfile')!.addEventListener('change', async ev => {
  const files = [...((ev.target as HTMLInputElement).files ?? [])];
  if (!files.length) return;
  const mode = lookFileMode;
  const c = mode.kind === 'once' ? onceSpeaker()?.character : mode.kind === 'cast' ? project.characters.find(x => x.id === mode.characterId) : selectedCharacter();
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
  if (mode.kind === 'cast') { render(); if (added.length) toast(`Added ${added.length === 1 ? 'a look' : `${added.length} looks`} to ${c.name}.`); return; }
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
    // Backdrops keep enough detail to fill the stage and be zoomed: limited by their short side.
    const k = isBg ? Math.min(1, 1440 / Math.min(img.width, img.height), 4096 / Math.max(img.width, img.height)) : Math.min(1, 900 / Math.max(img.width, img.height));
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

/* ---------- Drawing a clickable area ---------- */

let areaDrag: { box: DOMRect; x0: number; y0: number; x1: number; y1: number; el: HTMLElement } | null = null;
document.addEventListener('pointerdown', ev => {
  const host = (ev.target as HTMLElement).closest<HTMLElement>('[data-areadraw]');
  if (!host || ev.button !== 0) return;
  const box = host.getBoundingClientRect();
  const p = toStage(box, ev);
  areaDrag = { box, x0: p.x, y0: p.y, x1: p.x, y1: p.y, el: host.querySelector<HTMLElement>('.abox')! };
  try { host.setPointerCapture(ev.pointerId); } catch { /* not supported */ }
  ev.preventDefault();
  ev.stopPropagation();
}, true);
document.addEventListener('pointermove', ev => {
  const d = areaDrag;
  if (!d) return;
  const p = toStage(d.box, ev);
  d.x1 = p.x; d.y1 = p.y;
  const l = Math.min(d.x0, d.x1), t = Math.min(d.y0, d.y1);
  d.el.style.cssText = `display:block;left:${l}%;top:${t}%;width:${Math.abs(d.x1 - d.x0)}%;height:${Math.abs(d.y1 - d.y0)}%`;
});
document.addEventListener('pointerup', () => {
  const d = areaDrag;
  areaDrag = null;
  if (!d) return;
  const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
  // A click (or any press once points are started) adds a point to the outline.
  if (shapePts.length || shapeFor || (w < 1.5 && h < 1.5)) {
    d.el.style.display = 'none';
    const first = shapePts[0];
    if (first && shapePts.length >= 3 && Math.hypot((d.x0 - first.x) * 16 / 9, d.y0 - first.y) < 2.5) return finishShape();
    shapePts.push({ x: Math.round(d.x0 * 10) / 10, y: Math.round(d.y0 * 10) / 10 });
    drawShapeLine();
    return;
  }
  if (w < 2 || h < 2) { toast('Drag a little further to make the box.'); return; }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const left = Math.min(d.x0, d.x1), bottom = Math.max(d.y0, d.y1);
  const n = room().els.filter(x => x.kind === 'area' && !x.offstage).length + 1;
  ui.drawArea = false;
  const before = snapshot();
  place({ id: newId(), kind: 'area', name: n === 1 ? 'Clickable area' : `Clickable area ${n}`, x: r1(left + w / 2), y: r1(bottom), size: r1(h), w: r1(w), script: '' });
  record(before);
});

/* An outline drawn point by point: for a new area, or a new shape for the selected one. */
let shapePts: { x: number; y: number }[] = [];
let shapeFor: string | null = null;
let shapeHover: { x: number; y: number } | null = null;
function drawShapeLine(): void {
  const svg = document.querySelector<SVGElement>('.areadraw .ashape');
  if (svg) {
    const pts = shapePts.map(p => `${p.x},${p.y}`).join(' ');
    const live = shapeHover && shapePts.length ? `<polyline class="live" points="${shapePts[shapePts.length - 1].x},${shapePts[shapePts.length - 1].y} ${shapeHover.x},${shapeHover.y}"/>` : '';
    svg.innerHTML = `${shapePts.length >= 3 ? `<polygon points="${pts}"/>` : `<polyline points="${pts}"/>`}${live}`;
    const host = svg.parentElement!;
    host.querySelectorAll('.sdot').forEach(n => n.remove());
    host.insertAdjacentHTML('beforeend', shapePts.map((p, i) => `<i class="sdot${i === 0 && shapePts.length >= 3 ? ' first' : ''}" style="left:${p.x}%;top:${p.y}%"></i>`).join(''));
  }
  const done = $<HTMLButtonElement>('#shape-done'), undo = $<HTMLButtonElement>('#shape-undo');
  if (done) done.disabled = shapePts.length < 3;
  if (undo) undo.disabled = !shapePts.length;
}
document.addEventListener('pointermove', ev => {
  const host = (ev.target as HTMLElement).closest<HTMLElement>('[data-areadraw]');
  if (!host || !shapePts.length || areaDrag) return;
  shapeHover = toStage(host.getBoundingClientRect(), ev);
  drawShapeLine();
});
function finishShape(): void {
  if (shapePts.length < 3) return;
  const before = snapshot();
  const pts = shapePts;
  const target = shapeFor ? room().els.find(x => x.id === shapeFor) : undefined;
  shapePts = []; shapeFor = null; shapeHover = null; ui.drawArea = false;
  if (target) { setAreaShape(target, pts); save(); render(); }
  else {
    const n = room().els.filter(x => x.kind === 'area' && !x.offstage).length + 1;
    const e: StoryElement = { id: newId(), kind: 'area', name: n === 1 ? 'Clickable area' : `Clickable area ${n}`, x: 50, y: 50, size: 10, w: 10, script: '' };
    setAreaShape(e, pts);
    place(e);
  }
  record(before);
}
document.addEventListener('keydown', ev => {
  if (!ui.drawArea || !shapePts.length || (ev.target as HTMLElement).closest('input, textarea, select')) return;
  if (ev.key === 'Enter') { ev.preventDefault(); finishShape(); }
  if (ev.key === 'Backspace') { ev.preventDefault(); shapePts.pop(); drawShapeLine(); }
});

/* Dragging a dot of the selected area's outline. */
let shapeDotDrag: { e: StoryElement; i: number; pts: { x: number; y: number }[]; box: DOMRect; node: HTMLElement; before: string } | null = null;
document.addEventListener('pointerdown', ev => {
  const dot = (ev.target as HTMLElement).closest<HTMLElement>('.stage.edit .adot');
  const node = dot?.closest<HTMLElement>('.el');
  const stage = dot?.closest<HTMLElement>('.stage');
  const e = node && room().els.find(x => x.id === node.dataset.el);
  const pts = e && areaPoints(e);
  if (!dot || !node || !stage || !e || !pts || ev.button !== 0) return;
  shapeDotDrag = { e, i: Number(dot.dataset.adot), pts, box: stage.getBoundingClientRect(), node, before: snapshot() };
  try { dot.setPointerCapture(ev.pointerId); } catch { /* not supported */ }
  ev.preventDefault();
  ev.stopPropagation();
}, true);
document.addEventListener('pointermove', ev => {
  const d = shapeDotDrag;
  if (!d) return;
  d.pts[d.i] = toStage(d.box, ev);
  setAreaShape(d.e, d.pts);
  d.node.style.cssText = elementStyle(d.e);
  d.node.querySelector('.areabox')?.replaceWith(document.createRange().createContextualFragment(areaArt(d.e, true, true)));
});
document.addEventListener('pointerup', () => {
  const d = shapeDotDrag;
  shapeDotDrag = null;
  if (!d) return;
  save(); record(d.before); render();
});

/* ---------- Interface panels: fields, and dragging them in the Look picture ---------- */

/** Asks for a picture file and hands it over, scaled down (transparency kept). */
function pickImageFile(done: (img: string) => void, max = 512): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    const before = snapshot();
    try {
      // GIFs and SVGs are kept as they are, so animations and sharp lines survive.
      const img = /gif|svg/.test(f.type) && f.size < 600_000 ? await new Promise<string>(res => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.readAsDataURL(f); }) : await readImage(f, max, 'image/webp');
      done(img);
      record(before);
    } catch { toast('That file could not be read as a picture.'); }
  });
  input.click();
}

function panelCond(target: { cond?: Condition }, field: string, value: string): boolean {
  if (field.endsWith('-on')) { if (value) target.cond = { fact: storyFacts(project)[0] ?? 'has.key', op: 'truthy', value: true }; else delete target.cond; return true; }
  const c = target.cond;
  if (!c) return false;
  if (field.endsWith('-fact')) c.fact = value.trim().replace(/[^\w.]/g, '_') || 'fact';
  if (field.endsWith('-val')) c.value = toValue(value);
  if (field.endsWith('-op')) { c.op = value as Condition['op']; if (c.op === 'truthy') c.value = true; else if (typeof c.value === 'boolean') c.value = 1; return true; }
  return false;
}

document.addEventListener('input', ev => {
  const t = ev.target as HTMLInputElement;
  const k = t.dataset.in ?? '';
  if (!k.startsWith('pn-') && !k.startsWith('pb-')) return;
  const pn = panelOf(panelSel);
  if (!pn) return;
  const b = blockOf();
  const v = t.type === 'checkbox' ? (t.checked ? 'yes' : '') : t.value;
  let redraw = false;
  if (k.startsWith('pn-cond')) redraw = panelCond(pn, k, v);
  else if (k.startsWith('pb-cond')) { if (b) redraw = panelCond(b, k, v); }
  else switch (k) {
    case 'pn-when': pn.when = v as Panel['when']; if (pn.when === 'rooms') pn.rooms ??= [room().id]; else delete pn.rooms; redraw = true; break;
    case 'pn-room': { const set = new Set(pn.rooms ?? []); if (v) set.add(t.dataset.k!); else set.delete(t.dataset.k!); pn.rooms = [...set]; break; }
    case 'pn-slice': if (pn.frame) pn.frame.slice = Number(v); break;
    case 'pn-fwidth': if (pn.frame) pn.frame.width = Number(v); break;
    case 'pn-button': if (v) pn.button = true; else delete pn.button; break;
    case 'pn-hidden': if (v) pn.startHidden = true; else delete pn.startHidden; break;
    case 'pn-key': { const key = v.trim().toLowerCase(); if (/^[a-z0-9]$/.test(key)) pn.key = key; else delete pn.key; break; }
    case 'pb-text': if (b?.kind === 'text') b.text = v; break;
    case 'pb-fact': if (b?.kind === 'number' || b?.kind === 'meter') b.fact = v.trim().replace(/[^\w.]/g, '_') || 'fact'; break;
    case 'pb-label': if (b?.kind === 'number' || b?.kind === 'meter' || b?.kind === 'button') b.label = v; break;
    case 'pb-max': if (b?.kind === 'meter') b.max = Math.max(1, Number(v) || 1); break;
    case 'pb-script': if (b?.kind === 'button') b.script = t.value; break;
    case 'pb-empty': if (b?.kind === 'list') { if (v.trim()) b.empty = v; else delete b.empty; } break;
    case 'pb-prefix': if (b?.kind === 'list') b.prefix = v.trim().replace(/[^\w.]/g, '_') || 'has.'; break;
    case 'pb-char': if (b?.kind === 'portrait') { b.characterId = v; delete b.look; redraw = true; } break;
    case 'pb-look': if (b?.kind === 'portrait') { if (v) b.look = v; else delete b.look; } break;
  }
  save();
  if (redraw) render(); else refreshLookStage();
});
/* A panel's new name is checked when the field is left, and conversations follow it. */
document.addEventListener('change', ev => {
  const t = ev.target as HTMLInputElement;
  if (t.dataset.in !== 'pn-name') return;
  const pn = panelOf(panelSel);
  if (!pn) return;
  const old = pn.name;
  let name = cleanPanelName(t.value || old);
  if ((project.panels ?? []).some(x => x !== pn && x.name.toLowerCase() === name.toLowerCase())) { toast(`There is already a panel called "${name}".`); name = old; }
  pn.name = name;
  let n = 0;
  for (const r of project.rooms) for (const e of r.els) { const next = renamePanelInScript(e.script, old, name); if (next !== e.script) { e.script = next; n++; } }
  if (n) toast(`Updated Show panel and Hide panel in ${n} conversation${n === 1 ? '' : 's'}`);
  save(); render();
});

/* An item's new name is kept when the field is left; its story fact stays the same. */
document.addEventListener('change', ev => {
  const t = ev.target as HTMLInputElement;
  if (t.dataset.in !== 'item-name') return;
  const id = t.dataset.k ?? '';
  const name = t.value.replace(/\s+/g, ' ').trim().slice(0, 40);
  addItem(project, name || id.replace(/_/g, ' '), id).name = name || id.replace(/_/g, ' ');
  save(); render();
});
document.addEventListener('keydown', ev => {
  if ((ev.target as HTMLElement).id === 'item-new' && ev.key === 'Enter') { ev.preventDefault(); const before = snapshot(); actions['item-add'](''); record(before); }
});

/* Dragging a panel block by its handle (⋮⋮) changes the order of the blocks. */
let blockDrag: { pn: Panel; id: string; row: HTMLElement; y: number; to: number | null; before: string } | null = null;
document.addEventListener('pointerdown', ev => {
  const h = (ev.target as HTMLElement).closest<HTMLElement>('[data-pbdrag]');
  const pn = panelOf(panelSel);
  if (!h || !pn || ev.button !== 0) return;
  const row = h.closest<HTMLElement>('[data-pbrow]')!;
  blockDrag = { pn, id: h.dataset.pbdrag!, row, y: ev.clientY, to: null, before: snapshot() };
  row.classList.add('dragging');
  try { h.setPointerCapture(ev.pointerId); } catch { /* not supported */ }
  ev.preventDefault();
});
document.addEventListener('pointermove', ev => {
  const d = blockDrag;
  if (!d) return;
  d.row.style.translate = `0 ${ev.clientY - d.y}px`;
  const rows = [...document.querySelectorAll<HTMLElement>('[data-pbrow]')].filter(r => r !== d.row);
  let to = rows.findIndex(r => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
  if (to < 0) to = rows.length;
  d.to = to;
  rows.forEach((r, i) => r.classList.toggle('dropbefore', i === to));
  document.querySelector('.hudlist')?.classList.toggle('dropend', to === rows.length);
});
document.addEventListener('pointerup', () => {
  const d = blockDrag;
  blockDrag = null;
  if (!d) return;
  const from = d.pn.blocks.findIndex(b => b.id === d.id);
  if (d.to !== null && from >= 0 && d.to !== from) {
    const [b] = d.pn.blocks.splice(from, 1);
    d.pn.blocks.splice(d.to, 0, b);
    save(); record(d.before);
  }
  render();
});

let panelDrag: { pn: Panel; box: DOMRect; x: number; y: number; px: number; py: number; pw: number; ph: number; resize: boolean; moved: boolean; before: string } | null = null;
document.addEventListener('pointerdown', ev => {
  const t = ev.target as HTMLElement;
  const node = t.closest<HTMLElement>('#lookstage [data-panel]');
  const stage = node?.closest<HTMLElement>('[data-stage]');
  const pn = node ? panelOf(node.dataset.panel!) : undefined;
  if (!node || !stage || !pn || ev.button !== 0) return;
  const block = t.closest<HTMLElement>('[data-pblock]')?.dataset.pblock ?? null;
  const resize = !!t.closest('[data-presize]');
  if (panelSel !== pn.id || (block && block !== blockSel)) { panelSel = pn.id; lookTab = 'hud'; if (block) blockSel = block; else if (panelSel !== pn.id) blockSel = null; render(); }
  panelDrag = { pn, box: stage.getBoundingClientRect(), x: ev.clientX, y: ev.clientY, px: pn.x, py: pn.y, pw: pn.w, ph: pn.h, resize, moved: false, before: snapshot() };
  ev.preventDefault();
});
document.addEventListener('pointermove', ev => {
  const d = panelDrag;
  if (!d) return;
  const dx = (ev.clientX - d.x) / d.box.width * 100, dy = (ev.clientY - d.y) / d.box.height * 100;
  if (!d.moved && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 4) return;
  d.moved = true;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  if (d.resize) { d.pn.w = r1(Math.min(100, Math.max(4, d.pw + dx))); d.pn.h = r1(Math.min(100, Math.max(4, d.ph + dy))); }
  else { d.pn.x = r1(Math.min(100 - d.pn.w + 5, Math.max(-5, d.px + dx))); d.pn.y = r1(Math.min(100 - d.pn.h + 5, Math.max(-5, d.py + dy))); }
  const node = document.querySelector<HTMLElement>(`#lookstage [data-panel="${CSS.escape(d.pn.id)}"]`);
  if (node) { node.style.left = `${d.pn.x}%`; node.style.top = `${d.pn.y}%`; node.style.width = `${d.pn.w}%`; node.style.height = `${d.pn.h}%`; }
});
document.addEventListener('pointerup', () => {
  const d = panelDrag;
  panelDrag = null;
  if (d?.moved) { save(); record(d.before); }
});

/* ---------- Drawing paths ---------- */

/** The selected path step, read fresh from the script. */
function selectedPath(): { steps: Step[]; step: PathStep } | null {
  const ctx = mapCtx();
  if (!ctx || !mapSel) return null;
  const steps = parseScript(ctx.el.script).steps;
  const step = getStep(steps, mapSel);
  return step?.t === 'path' ? { steps, step } : null;
}

function writePath(change: (step: PathStep) => void): void {
  const sp = selectedPath(), ctx = mapCtx();
  if (!sp || !ctx) return;
  const before = snapshot();
  change(sp.step);
  ctx.el.script = writeScript(sp.steps);
  save(); record(before); refreshMap();
}

let pen: { box: DOMRect; pts: { x: number; y: number }[]; svg: SVGPolylineElement } | null = null;
let dotDrag: { node: HTMLElement; box: DOMRect; i: number; x: number; y: number; moved: boolean } | null = null;
const toStage = (box: DOMRect, ev: PointerEvent) => ({ x: Math.round((ev.clientX - box.left) / box.width * 1000) / 10, y: Math.round((ev.clientY - box.top) / box.height * 1000) / 10 });
document.addEventListener('pointerdown', ev => {
  const t = ev.target as HTMLElement;
  const surface = t.closest<HTMLElement>('[data-pen]');
  if (surface && ev.button === 0) {
    const stage = surface.closest<HTMLElement>('[data-stage]')!;
    const box = stage.getBoundingClientRect();
    surface.innerHTML = '<svg class="pathline live" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline vector-effect="non-scaling-stroke"/></svg>';
    pen = { box, pts: [toStage(box, ev)], svg: surface.querySelector('polyline')! };
    try { surface.setPointerCapture(ev.pointerId); } catch { /* not supported */ }
    ev.preventDefault();
    return;
  }
  const dot = t.closest<HTMLElement>('.mpreview .pdot');
  if (dot && ev.button === 0) {
    const box = dot.closest<HTMLElement>('[data-stage]')!.getBoundingClientRect();
    dotDrag = { node: dot, box, i: Number(dot.dataset.pt), x: 0, y: 0, moved: false };
    try { dot.setPointerCapture(ev.pointerId); } catch { /* not supported */ }
    ev.preventDefault();
    ev.stopPropagation();
  }
}, true);
document.addEventListener('pointermove', ev => {
  if (pen) {
    const p = toStage(pen.box, ev), last = pen.pts[pen.pts.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 0.4) return;
    pen.pts.push(p);
    pen.svg.setAttribute('points', pen.pts.map(q => `${q.x},${q.y}`).join(' '));
  } else if (dotDrag) {
    const p = toStage(dotDrag.box, ev);
    dotDrag.moved = true; dotDrag.x = p.x; dotDrag.y = p.y;
    dotDrag.node.style.left = `${p.x}%`;
    dotDrag.node.style.top = `${p.y}%`;
  }
});
document.addEventListener('pointerup', () => {
  if (pen) {
    const pts = pen.pts;
    pen = null;
    pathPen = false;
    if (pts.length < 2 || Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) < 1 && pts.length < 6) { refreshMap(); toast('Hold the mouse down and move it to draw the path.'); return; }
    const simple = simplifyPath(pts);
    writePath(step => { step.points = simple.map(p => ({ x: p.x, y: p.y })); });
    toast('Path drawn. Click a dot to change size, turn or an effect there.');
  } else if (dotDrag) {
    const d = dotDrag;
    dotDrag = null;
    if (d.moved) writePath(step => { const pt = step.points[d.i]; if (pt) { pt.x = d.x; pt.y = d.y; } });
    else { pathPt = d.i; refreshMap(); }
  }
});

/** Plays the selected path in the scene picture: one lap, or two for a repeating path. */
function playPathPreview(): void {
  const sp = selectedPath();
  if (!sp) return;
  const { step } = sp;
  const node = [...document.querySelectorAll<HTMLElement>('.mscene .el.staged')].find(n => (n.dataset.who ?? '').toLowerCase() === step.who.trim().toLowerCase());
  if (!node) { toast(`${step.who} is not on stage here.`); return; }
  const startSize = parseFloat(node.style.height) || 76;
  const start = performance.now(), until = step.secs * (step.repeat ? 2 : 1);
  let passed = 0, lap = 0;
  const tick = () => {
    const el = (performance.now() - start) / 1000;
    const st = pathAt(step.points, step.secs, step.repeat, step.ease, startSize, Math.min(el, until));
    if (st.lap !== lap) { lap = st.lap; passed = 0; }
    node.style.left = `${st.x}%`; node.style.top = `${st.y}%`; node.style.height = `${st.size}%`;
    node.style.opacity = String(st.fade / 100);
    if (st.flip !== undefined) node.classList.toggle('flip', st.flip);
    for (let i = passed; i < st.passed; i++) {
      const fx = step.points[i].fx;
      if (fx) { node.className = node.className.replace(/\bfx-[\w-]+/g, '').trim(); void node.offsetWidth; node.classList.add(`fx-${fx}`); }
    }
    passed = st.passed;
    if (el < until) requestAnimationFrame(tick); else setTimeout(refreshMap, 600);
  };
  node.style.transition = 'none';
  requestAnimationFrame(tick);
}

/* Dragging a mark in the scene moves it on that character (or for everyone, on a starter figure); the wheel resizes it. */
let markDrag: { node: HTMLElement; box: DOMRect; name: string; who: string; before: string; x: number; y: number } | null = null;
function markTarget(who: string, name: string): { set(at: { x?: number; y?: number; size?: number }): void; size: number } | null {
  const def = findMark(project, name);
  if (!def) return null;
  const c = project.characters.find(x => x.name.trim().toLowerCase() === who.trim().toLowerCase());
  const cur = c?.markAt?.[name] ?? { x: def.x, y: def.y, size: def.size };
  return {
    size: cur.size,
    set(at) {
      const next = { ...cur, ...at };
      if (c) { c.markAt ??= {}; c.markAt[name] = next; } else { const m = ownMark(name); if (m) Object.assign(m, next); }
    }
  };
}
document.addEventListener('pointerdown', ev => {
  const node = (ev.target as HTMLElement).closest<HTMLElement>('.mpreview [data-mark]');
  if (!node || ev.button !== 0) return;
  const art = node.closest<HTMLElement>('.mv');
  if (!art) return;
  markDrag = { node, box: art.getBoundingClientRect(), name: node.dataset.mark ?? '', who: node.dataset.who ?? '', before: snapshot(), x: 0, y: 0 };
  try { node.setPointerCapture(ev.pointerId); } catch { /* not supported */ }
  ev.preventDefault();
  ev.stopPropagation();
}, true);
document.addEventListener('pointermove', ev => {
  const d = markDrag;
  if (!d) return;
  const flipped = !!d.node.closest('.el.flip');
  const fx = (ev.clientX - d.box.left) / d.box.width * 100;
  d.x = Math.round((flipped ? 100 - fx : fx) * 10) / 10;
  d.y = Math.round((ev.clientY - d.box.top) / d.box.height * 1000) / 10;
  d.node.style.left = `${d.x}%`;
  d.node.style.top = `${d.y}%`;
});
document.addEventListener('pointerup', () => {
  const d = markDrag;
  markDrag = null;
  if (!d || (!d.x && !d.y)) return;
  markTarget(d.who, d.name)?.set({ x: d.x, y: d.y });
  save(); record(d.before); refreshMap();
});
let wheelBefore: string | null = null, wheelTimer = 0;
document.addEventListener('wheel', ev => {
  const node = (ev.target as HTMLElement).closest<HTMLElement>('.mpreview [data-mark]');
  if (!node) return;
  ev.preventDefault();
  const t = markTarget(node.dataset.who ?? '', node.dataset.mark ?? '');
  if (!t) return;
  wheelBefore ??= snapshot();
  const size = Math.round(Math.max(1, Math.min(100, t.size * (ev.deltaY < 0 ? 1.15 : 1 / 1.15))) * 10) / 10;
  t.set({ size });
  node.style.height = `${size}%`;
  clearTimeout(wheelTimer);
  wheelTimer = window.setTimeout(() => { save(); if (wheelBefore) record(wheelBefore); wheelBefore = null; }, 400);
}, { passive: false });

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
  applyMap(mapAction(ctx, 'scene-place', `${d.who}|${d.x}|${Math.abs(d.y - 98) < 2 ? '' : d.y}`));
  record(before);
});

/* Holding a row in a box and dragging it up or down changes the order of the steps in that box. */
let rowDrag: { row: HTMLElement; card: HTMLElement; from: string; y: number; moved: boolean; to: number | null; before: string } | null = null;
let justDragged = false;
document.addEventListener('pointerdown', ev => {
  const row = (ev.target as HTMLElement).closest<HTMLElement>('.mcard .mrow[data-k]');
  const card = row?.closest<HTMLElement>('.mcard');
  if (!row || !card || ev.button !== 0 || card.querySelectorAll('.mrow').length < 2) return;
  rowDrag = { row, card, from: row.dataset.k!, y: ev.clientY, moved: false, to: null, before: snapshot() };
});
document.addEventListener('pointermove', ev => {
  if (!rowDrag) return;
  const { row, card } = rowDrag;
  const dy = ev.clientY - rowDrag.y;
  if (!rowDrag.moved && Math.abs(dy) < 6) return;
  if (!rowDrag.moved) { rowDrag.moved = true; row.classList.add('dragging'); card.classList.add('sorting'); try { row.setPointerCapture(ev.pointerId); } catch { /* not supported */ } }
  const z = parseFloat($('#mzoomlabel')?.textContent ?? '100') / 100 || 1;
  row.style.transform = `translateY(${dy / z}px)`;
  // Where it would go: before the first row whose middle is below the pointer.
  const rows = [...card.querySelectorAll<HTMLElement>('.mrow')].filter(r => r !== row);
  card.querySelectorAll('.drop-before, .drop-after').forEach(r => r.classList.remove('drop-before', 'drop-after'));
  const below = rows.find(r => { const b = r.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
  const indexOf = (r: HTMLElement) => Number(r.dataset.k!.split('.').pop());
  if (below) { below.classList.add('drop-before'); rowDrag.to = indexOf(below); }
  else { const last = rows[rows.length - 1]; last.classList.add('drop-after'); rowDrag.to = indexOf(last) + 1; }
});
const rowDrop = () => {
  if (!rowDrag) return;
  const d = rowDrag;
  rowDrag = null;
  if (!d.moved) return;
  justDragged = true;
  setTimeout(() => { justDragged = false; }, 0);
  d.row.style.transform = '';
  d.row.classList.remove('dragging');
  d.card.classList.remove('sorting');
  const ctx = mapCtx();
  const res = ctx && d.to !== null ? mapAction(ctx, 'reorder', `${d.from}|${d.to}`) : undefined;
  if (res) { applyMap(res); record(d.before); } else refreshMap();
};
document.addEventListener('pointerup', rowDrop);
document.addEventListener('pointercancel', rowDrop);

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
  if (justDragged && m?.closest('.mcard')) return;
  if (m && ctx) {
    if ((m as HTMLButtonElement).disabled) return;
    const act = m.dataset.mapAct!;
    if (act === 'pt-done') { pathPt = null; refreshMap(); return; }
    const before = snapshot();
    const prevSel = mapSel;
    const res = mapAction(ctx, act, m.dataset.k ?? '');
    const drawNow = act === 'stage-path' || (act === 'insert' && m.dataset.k === 'path');
    if (res && ((res.sel ?? null) !== prevSel || drawNow)) { pathPt = null; pathPen = drawNow; if (act !== 'stage-path') lineWin = null; }
    if (act === 'stage-path') lineWin = null;
    if (act === 'say-fx-pick') setTimeout(tryEffect, 60);
    applyMap(res);
    record(before);
    if (m.dataset.mapAct === 'quick-sound') previewSound(m.dataset.k ?? '');
    // A new line is ready to type in.
    if (['first-line', 'add-after'].includes(m.dataset.mapAct!) || (m.dataset.mapAct === 'insert' && m.dataset.k === 'say')) {
      const t = $<HTMLTextAreaElement>('#m-text');
      if (t) { t.focus(); t.select(); }
    }
    return;
  }
  if (ctx && mapSel && !justPanned && target.closest('.mscroll') && !target.closest('.mnode, .madd')) { mapSel = null; refreshMap(); }
});

/* One Undo step per visit to a field. Renames are carried through to the steps
   that point at the old name when the field is left. */
let fieldSnapshot: string | null = null;
let renameFrom = '';
const isField = (el: HTMLElement) => !!el.closest?.('#main, #sheet') && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
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
  const next = (ev as FocusEvent).relatedTarget as HTMLElement | null;
  // Removed while focused (the map redraws its panel): the same field comes back, so the visit goes on.
  if (!next && !lost.isConnected) return;
  // Recorded now, before a click on a button records its own change.
  record(fieldSnapshot);
  fieldSnapshot = next && isField(next) ? snapshot() : null;
});
document.addEventListener('pointerdown', () => {
  // Buttons that do not take focus (Safari): close the field visit before their change.
  const a = document.activeElement as HTMLElement | null;
  if (fieldSnapshot !== null && !(a && isField(a))) { record(fieldSnapshot); fieldSnapshot = null; }
}, true);

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
  if ((t.dataset.mapIn === 'say-sound' || t.dataset.mapIn === 'snd-name') && t.value === '__upload') {
    const at = mapSel, field = t.dataset.mapIn;
    pickSound(name => { const c = mapCtx(); if (c && at) { mapSel = at; mapInput({ ...c, sel: at }, field, '', name); } });
    refreshMap();
    return;
  }
  if ((t.dataset.mapIn === 'say-sound' || t.dataset.mapIn === 'snd-name') && t.value) previewSound(t.value);
  if (t.dataset.mapIn === 'music-track' && t.value === '__upload') {
    const at = mapSel;
    pickSound(name => { const c = mapCtx(); if (c && at) { mapSel = at; mapInput({ ...c, sel: at }, 'music-track', '', name); } }, null, true);
    refreshMap();
    return;
  }
  if ((t.dataset.mapIn === 'stage-show' || t.dataset.mapIn === 'stg-who') && t.value === '__new') {
    const at = mapSel, field = t.dataset.mapIn;
    pickCharacter(c => {
      const cx = mapCtx();
      if (!cx || !at) return;
      const res = mapInput({ ...cx, sel: at }, field, '', c.name);
      mapSel = res?.sel ?? at;
      refreshMap();
      toast(`${c.name} is a new character. Open Characters to add looks.`);
    });
    refreshMap();
    return;
  }
  if (t.dataset.mapIn?.startsWith('say-fx')) setTimeout(tryEffect, 60);
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
    case 'room-auto': {
      const r = room();
      if (t.value === '__write') {
        const el: StoryElement = { id: newId(), kind: 'area', offstage: true, name: `Entering ${r.name}`, x: 0, y: 0, size: 1, w: 1, script: '' };
        r.els.push(el);
        r.auto = true; r.autoEl = el.id;
        save();
        ui.sel = el.id; mapSel = null; freshConvo = true; go('convo');
        return;
      }
      r.auto = !!t.value; if (t.value) r.autoEl = t.value; else { delete r.autoEl; delete r.autoOnce; }
      save(); render(); return;
    }
    case 'mark-anim': { const m = ownMark(t.dataset.k ?? ''); if (m) { m.anim = t.value as MarkDef['anim']; save(); render(); } return; }
    case 'mark-speed': { const m = ownMark(t.dataset.k ?? ''); if (m) { const n = Number(t.value); if (n === 3) delete m.speed; else m.speed = n; } break; }
    case 'mark-size': { const m = ownMark(t.dataset.k ?? ''); if (m) m.size = Number(t.value); break; }
    case 'el-idle': case 'el-idle-strength': case 'el-idle-speed': {
      if (!e) break;
      const next = idleFrom('el-idle', e.idle ?? characterOf(project, e)?.idle, k, t.value);
      if (next) e.idle = next; else delete e.idle;
      if (k === 'el-idle') { save(); render(); return; }
      break;
    }
    case 'cast-idle': case 'cast-idle-strength': case 'cast-idle-speed': {
      const c = project.characters.find(x => x.id === castSel);
      if (!c) break;
      const next = idleFrom('cast-idle', c.idle, k, t.value);
      if (next) c.idle = next; else delete c.idle;
      if (k === 'cast-idle') { save(); render(); return; }
      break;
    }
    case 'sound-volume': {
      const x = project.sounds?.find(y => y.id === t.dataset.k);
      if (x) { x.volume = Number(t.value); if (x.volume === 100) delete x.volume; if (previewAudio && previewing === x.id) previewAudio.volume = Number(t.value) / 100; }
      break;
    }
    case 'room-music': {
      const r = room();
      if (t.value === '__upload') { pickSound(name => { r.music = name; }, null, true); t.value = r.music ?? ''; return; }
      if (t.value) r.music = t.value; else delete r.music;
      if (r.music === 'off' || !r.music) delete r.musicOnce;
      save(); render(); return;
    }
    case 'cast-fact-start': {
      const d = project.characters.find(x => x.id === castSel)?.facts?.find(f => f.fact === t.dataset.k);
      if (!d) break;
      const v = t.value.trim();
      if (!v) delete d.start;
      else d.start = d.kind === 'number' ? Number(v) || 0 : d.kind === 'word' ? v : v === 'yes';
      break;
    }
    case 'cast-fact-about': {
      const d = project.characters.find(x => x.id === castSel)?.facts?.find(f => f.fact === t.dataset.k);
      if (d) { if (t.value.trim()) d.about = t.value; else delete d.about; }
      break;
    }
    case 'cast-sound-look': {
      const c = project.characters.find(x => x.id === castSel), snd = project.sounds?.find(x => x.id === t.dataset.k);
      if (!c || !snd) break;
      for (const l of c.looks) if (l.sound === snd.name) delete l.sound;
      const l = c.looks.find(x => x.id === t.value);
      if (l) l.sound = snd.name;
      break;
    }
    case 'cast-about': { const c = project.characters.find(x => x.id === castSel); if (c) { if (t.value.trim()) c.about = t.value; else delete c.about; } break; }
    case 'cast-place': {
      const c = project.characters.find(x => x.id === castSel), r = project.rooms.find(x => x.id === t.value);
      if (!c || !r) return;
      r.els.push({ id: newId(), kind: 'char', characterId: c.id, name: c.name, x: 30 + (r.els.length * 14) % 50, y: 98, size: 76, script: '' });
      save(); render(); toast(`${c.name} is now in ${r.name}.`); return;
    }
    case 'el-w': if (e) { e.w = Number(t.value); if (node) node.style.width = `${e.w}%`; } break;
    case 'el-cond-on': if (e) { if (t.value) e.cond = { fact: storyFacts(project)[0] ?? 'met', op: '>=', value: 1 }; else { delete e.cond; delete e.andConds; } save(); render(); } return;
    case 'el-cond-fact': case 'el-cond-op': case 'el-cond-val': {
      const c = e ? elementConds(e)[Number(t.dataset.k ?? 0)] : undefined;
      if (!c) break;
      if (t.dataset.in === 'el-cond-fact') c.fact = t.value.trim().replace(/[^\w.]/g, '_') || 'fact';
      if (t.dataset.in === 'el-cond-val') c.value = toValue(t.value);
      if (t.dataset.in === 'el-cond-op') { c.op = t.value as typeof c.op; if (c.op === 'truthy') c.value = true; else if (typeof c.value === 'boolean') c.value = 1; save(); render(); return; }
      break;
    }
    case 'el-hover': if (e) { if (t.value.trim()) e.hover = t.value.slice(0, 120); else delete e.hover; } break;
    case 'el-once': if (e) { if (t.value === 'stay' || t.value === 'hide') e.once = t.value; else delete e.once; } break;
    case 'el-sound': {
      if (!e) break;
      if (t.value === '__upload') { pickSound(name => { e.sound = name; }); t.value = e.sound ?? ''; return; }
      if (t.value) { e.sound = t.value; previewSound(t.value); } else delete e.sound;
      break;
    }
    case 'area-door': {
      if (!e) break;
      if (t.value === '__new') { ui.namingRoom = true; render(); $<HTMLInputElement>('#new-room-name')?.focus(); return; }
      e.script = t.value ? `Go to ${t.value}` : '';
      if (t.value) nameAfterDoor(e, t.value);
      save(); render(); return;
    }
    case 'story-title': { const v = t.value.replace(/\s+/g, ' '); if (v.trim()) project.title = v; else delete project.title; const c = $('#crumbs [data-k="map"]'); if (c) c.textContent = project.title?.trim() || 'Story map'; break; }
    case 'test-use': test.use = t.checked; saveTest(); renderBar(); return;
    case 'test-fact': test.values[t.dataset.k ?? ''] = t.value.trim(); saveTest(); renderBar(); return;
    case 'bg-zoom': { const bg = room().bg; if (bg) { bg.zoom = Number(t.value); refreshBackdrop(); } break; }
    case 'bg-color': { const bg = room().bg; if (bg) { bg.color = t.value; refreshBackdrop(); } break; }
    case 'conv-staging': if (e) { e.staging = t.value === 'room' ? 'room' : undefined; refreshMap(); } break;
    case 'look-font': project.look.font = t.value; break;
    case 'look-opacity': project.look.opacity = Number(t.value); break;
    case 'look-typing-speed': project.look.typing = Number(t.value); break;
    case 'look-boxcolor': project.look.boxColor = t.value; break;
    case 'look-textcolor': project.look.textColor = t.value; break;
    case 'look-accentcolor': project.look.accentColor = t.value; break;
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
  if (t.dataset.in === 'mark-speed' || t.dataset.in === 'mark-size') { save(); render(); }
  if (t.dataset.in === 'mark-name') {
    const m = project.marks?.find(x => x.name === t.dataset.k);
    if (m) {
      let name = cleanMarkName(t.value || m.name);
      if (name !== m.name && (findMark(project, name) || STARTER_MARKS[name])) name = m.name;
      const old = m.name;
      m.name = name;
      for (const r of project.rooms) for (const e of r.els) e.script = renameMarkInScript(e.script, old, name);
      for (const c of project.characters) if (c.markAt?.[old]) { c.markAt[name] = c.markAt[old]; delete c.markAt[old]; }
      save(); render();
    }
  }
  if (t.dataset.in === 'sound-volume') {
    const x = project.sounds?.find(y => y.id === t.dataset.k);
    if (x && !x.music) previewSound(x.name);
    save();
  }
  if (t.dataset.in === 'sound-name') {
    const x = project.sounds?.find(y => y.id === t.dataset.k);
    if (x) {
      let name = cleanSoundName(t.value || x.name);
      if (project.sounds!.some(y => y !== x && y.name === name)) name = x.name;
      const old = x.name;
      x.name = name;
      for (const r of project.rooms) for (const e of r.els) {
        if ((e.sound ?? '').toLowerCase() === old) e.sound = name;
        e.script = renameSoundInScript(e.script, old, name);
      }
      for (const c of project.characters) for (const l of c.looks) if (l.sound === old) l.sound = name;
      for (const r of project.rooms) if (r.music === old) r.music = name;
      save(); render();
    }
  }
  if (t.dataset.in === 'cast-name') {
    const c = project.characters.find(x => x.id === castSel);
    const name = t.value.replace(/[:"()]/g, '').trim();
    if (c && name && name !== c.name) {
      const old = c.name;
      c.name = name;
      for (const r of project.rooms) for (const x of r.els) if (x.characterId === c.id) x.name = name;
      const n = renameEverywhere('speaker', old, name);
      if (n) toast(`Updated ${name}'s lines in ${n} conversation${n === 1 ? '' : 's'}`);
      save(); render();
    } else if (c) t.value = c.name;
  }
  if (t.dataset.in === 'cast-look-name') {
    const c = project.characters.find(x => x.id === castSel), l = c?.looks.find(x => x.id === t.dataset.k);
    if (c && l) {
      const old = l.name;
      l.name = uniqueLookName({ ...c, looks: c.looks.filter(x => x !== l) }, cleanLookName(t.value || old));
      for (const r of project.rooms) for (const el of r.els) {
        el.script = renameLookInScript(el.script, c.name, old, l.name);
        if (el.characterId === c.id && (el.expr ?? '').toLowerCase() === old.toLowerCase()) el.expr = l.name;
      }
      save(); render();
    }
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
    const start = t.value.lastIndexOf('\n', t.selectionStart - 1) + 1;
    if (ev.shiftKey) {
      // Shift+Tab takes up to two spaces off the start of the line.
      const cut = t.value.slice(start, start + 2).match(/^ {1,2}/)?.[0].length ?? 0;
      if (cut) { const at = t.selectionStart; t.setRangeText('', start, start + cut, 'preserve'); t.setSelectionRange(Math.max(start, at - cut), Math.max(start, at - cut)); }
    } else t.setRangeText('  ', t.selectionStart, t.selectionEnd, 'end');
    t.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (t.id === 'script' && ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
    // Enter keeps the indentation, and goes one step in after Choice, an answer, Only if or Otherwise.
    ev.preventDefault();
    const start = t.value.lastIndexOf('\n', t.selectionStart - 1) + 1;
    const line = t.value.slice(start, t.selectionStart);
    const indent = (line.match(/^ */) ?? [''])[0];
    const deeper = /^\s*(choice|otherwise|only if .+|["\u201c].+)\s*$/i.test(line) ? '  ' : '';
    t.setRangeText(`\n${indent}${deeper}`, t.selectionStart, t.selectionEnd, 'end');
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
  const img = stage.querySelector<HTMLImageElement>('.bg img.bgimg');
  if (!img?.naturalWidth) return;
  // How far the picture reaches past the stage, so it follows the pointer exactly.
  const zoom = bg.zoom ?? 1;
  const cover = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight) * zoom;
  const ow = img.naturalWidth * cover - box.width, oh = img.naturalHeight * cover - box.height;
  if (ow < 1 && oh < 1) return;
  bgPan = { x: ev.clientX, y: ev.clientY, fx: bg.fx ?? 50, fy: bg.fy ?? 50, w: ow, h: oh, before: snapshot(), moved: false };
  stage.classList.add('panning-bg');
  ev.preventDefault();
});
document.addEventListener('pointermove', ev => {
  const bg = room().bg;
  if (!bgPan || !bg) return;
  bgPan.moved = true;
  // Moving the picture right shows more of its left side. w and h are how far it reaches past the stage.
  if (bgPan.w >= 1) bg.fx = Math.round(Math.min(100, Math.max(0, bgPan.fx - (ev.clientX - bgPan.x) / bgPan.w * 100)) * 10) / 10;
  if (bgPan.h >= 1) bg.fy = Math.round(Math.min(100, Math.max(0, bgPan.fy - (ev.clientY - bgPan.y) / bgPan.h * 100)) * 10) / 10;
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
  const handle = target.closest<HTMLElement>('[data-resize]');
  const areaNode = handle?.closest<HTMLElement>('.el');
  const area = areaNode ? room().els.find(x => x.id === areaNode.dataset.el) : undefined;
  if (handle && areaNode && area) {
    const box = stage.getBoundingClientRect();
    resize = { e: area, node: areaNode, box, left: area.x - (area.w ?? 20) / 2, top: area.y - area.size, before: snapshot() };
    try { handle.setPointerCapture(ev.pointerId); } catch { /* not supported */ }
    ev.preventDefault();
    return;
  }
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

/* Resizing a clickable area by its corner: the top left corner stays put. */
let resize: { e: StoryElement; node: HTMLElement; box: DOMRect; left: number; top: number; before: string } | null = null;
document.addEventListener('pointermove', ev => {
  if (!resize) return;
  const { e, node, box, left, top } = resize;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const w = r1(Math.max(2, Math.min(100 - left, (ev.clientX - box.left) / box.width * 100 - left)));
  const h = r1(Math.max(2, Math.min(118 - top, (ev.clientY - box.top) / box.height * 100 - top)));
  e.w = w; e.size = h; e.x = r1(left + w / 2); e.y = r1(top + h);
  node.style.cssText = `left:${e.x}%;top:${e.y}%;height:${e.size}%;width:${e.w}%`;
});
document.addEventListener('pointerup', () => {
  if (!resize) return;
  const before = resize.before;
  resize = null;
  save(); record(before); render();
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

void listStories().then(async list => {
  stories = list;
  let place: { storyId: string; view: View; roomId: string; sel: string | null } | null = null;
  try { place = JSON.parse(localStorage.getItem(PLACE_KEY) ?? 'null'); } catch { /* none */ }
  if (place && list.some(x => x.id === place!.storyId)) {
    const p = await loadStory(place.storyId);
    if (p) {
      enterProject(p, place.storyId, 'map');
      if (project.rooms.some(r => r.id === place.roomId)) ui.roomId = place.roomId;
      ui.sel = place.sel && room().els.some(e => e.id === place!.sel) ? place.sel : null;
      const view = place.view === 'convo' && !ui.sel ? 'room' : place.view;
      if (view !== 'map') { freshConvo = true; go(view); }
      return;
    }
  }
  render();
});
