import { findRoomByName, parseScript, summarize } from '@story-engine/engine-core';
import type { Project, Room, StoryElement } from '@story-engine/engine-core';
import { BACKDROPS, CHARACTERS, EXPRESSIONS, FONTS, OBJECTS, THEMES, backdropHTML, characterSVG, choicesHTML, esc, sayHTML, stageHTML } from '@story-engine/runtime';
import type { Preset } from '@story-engine/runtime';

export type View = 'map' | 'room' | 'convo' | 'look' | 'play';
export type Adding = 'char' | 'object' | 'bg' | null;

export interface UI {
  view: View;
  roomId: string;
  sel: string | null;
  adding: Adding;
  confirmReset: boolean;
  /** Where Stop returns to. */
  back: View;
}

const thumbs = <T>(set: Record<string, T & { name: string }>, act: string, cls: string, art: (v: T) => string): string =>
  `<div class="thumbs">${Object.entries(set).map(([k, v]) =>
    `<button class="thumb" data-act="${act}" data-k="${k}"><span class="pic ${cls}">${art(v)}</span><b>${esc(v.name)}</b></button>`).join('')}</div>`;

const svgOf = (v: Preset) => v.svg;

export function viewMap(p: Project, ui: UI): string {
  const actions = ui.confirmReset
    ? `<span class="hint">Erase everything?</span><button class="btn small danger" data-act="reset">Yes, start over</button><button class="btn small quiet" data-act="cancel">Keep it</button>`
    : `<button class="btn small quiet" data-act="sample">Load the sample scene</button><button class="btn small quiet" data-act="ask-reset">Start over</button>`;
  const cards = p.rooms.map(r => `<button class="card" data-act="open-room" data-k="${esc(r.id)}"><span class="pic">${backdropHTML(r.bg)}</span><span class="meta"><b>${esc(r.name)}</b><span>${r.els.length} ${r.els.length === 1 ? 'thing' : 'things'} placed${r.auto ? ' · starts talking right away' : ''}</span></span></button>`).join('');
  return `<div class="side"><div class="maphead"><div><h2>Story map</h2><p class="hint">Every room in your story. Click one to work in it.</p></div><div class="row">${actions}</div></div>
    <div class="map">${cards}<button class="card new" data-act="new-room">+ New room</button></div></div>`;
}

function emptyRoom(): string {
  return `<div class="stage empty"><div class="blank">
    <h1>An empty room.</h1><p>Pick a backdrop and it becomes a place. Then add someone to talk to.</p>
    ${thumbs(BACKDROPS, 'set-bg', '', svgOf)}
    <div class="row"><button class="btn small" data-act="upload" data-k="bg">Use your own image</button></div>
    <div class="offer"><span>First time here?</span><button class="btn small play" data-act="sample">Load the sample scene</button></div>
  </div></div>`;
}

function addingPanel(a: Exclude<Adding, null>): string {
  const title = { char: 'Add a character', object: 'Add an object', bg: 'Change the backdrop' }[a];
  const grid = a === 'char' ? thumbs(CHARACTERS, 'add-char', 'tall', v => characterSVG(v))
    : a === 'object' ? thumbs(OBJECTS, 'add-object', 'obj', svgOf)
    : thumbs(BACKDROPS, 'set-bg', '', svgOf);
  return `<h2>${title}</h2>${grid}
    <div class="row"><button class="btn small" data-act="upload" data-k="${a}">Use your own image</button><button class="btn small quiet" data-act="cancel">Cancel</button></div>`;
}

function elementPanel(e: StoryElement): string {
  const name = esc(e.name);
  const has = e.script.trim() !== '';
  const label = e.kind === 'char'
    ? (has ? `Edit what ${name} says` : `Make ${name} say something`)
    : (has ? 'Edit what happens on click' : 'Make it do something on click');
  const expr = e.kind === 'char' && !e.img
    ? `<label class="field"><span>Expression at the start</span><select id="el-expr" data-in="el-expr">${EXPRESSIONS.map(x => `<option${x === (e.expr ?? 'neutral') ? ' selected' : ''}>${x}</option>`).join('')}</select></label>`
    : '';
  return `<h2>${name}</h2>
    <button class="btn play block" data-act="convo">${label}</button>
    <label class="field"><span>Name</span><input type="text" id="el-name" data-in="el-name" value="${name}"></label>
    <label class="field"><span>Size</span><input type="range" id="el-size" data-in="el-size" min="6" max="110" value="${e.size}"></label>
    <details class="more" id="el-more"><summary>More</summary><div>${expr}
      <div class="row"><button class="btn small quiet" data-act="front">Bring to front</button><button class="btn small danger" data-act="remove">Remove</button></div>
    </div></details>
    <p class="hint">Drag ${name} in the picture to move. Click empty space to go back to the room.</p>`;
}

function roomPanel(p: Project, r: Room): string {
  return `<h2>${esc(r.name)}</h2>
    <div class="row"><button class="btn ink" data-act="adding" data-k="char">Add a character</button><button class="btn" data-act="adding" data-k="object">Add an object</button></div>
    <label class="field"><span>Room name</span><input type="text" id="room-name" data-in="room-name" value="${esc(r.name)}"></label>
    <details class="more" id="room-more"><summary>More</summary><div>
      <button class="btn small quiet" data-act="adding" data-k="bg">Change the backdrop</button>
      <label class="check"><input type="checkbox" id="room-auto" data-in="room-auto"${r.auto ? ' checked' : ''}><span>Start talking right away when the player enters, like a classic visual novel</span></label>
      ${p.rooms.length > 1 ? '<button class="btn small danger" data-act="del-room">Delete this room</button>' : ''}
    </div></details>
    <p class="hint">${r.els.length ? 'Click anything in the picture to change it.' : 'The room is ready. Add someone to talk to.'}</p>`;
}

export function viewRoom(p: Project, ui: UI, r: Room, e: StoryElement | undefined): string {
  if (!r.bg && !r.els.length) return emptyRoom();
  const side = ui.adding ? addingPanel(ui.adding) : e ? elementPanel(e) : roomPanel(p, r);
  return `<div class="work"><div>${stageHTML(r, { mode: 'edit', look: p.look, selected: ui.sel })}</div><aside class="side">${side}</aside></div>`;
}

/** Text inserted by the buttons above the script. */
export function inserts(p: Project, r: Room, e: StoryElement): { label: string; text: string }[] {
  const other = p.rooms.find(x => x.id !== r.id) ?? r;
  return [
    { label: 'Line', text: `${e.kind === 'char' ? e.name : 'Narrator'}: ` },
    { label: 'Choice', text: 'Choice\n  "First answer"\n    \n  "Second answer"\n    ' },
    { label: 'Only if', text: 'Only if affection is at least 5\n  ' },
    { label: 'Change something', text: 'Change affection + 1' },
    { label: 'Go to another room', text: `Go to ${other.name}` },
    { label: 'End', text: 'End' }
  ];
}

export function viewConvo(p: Project, r: Room, e: StoryElement): string {
  const who = e.kind === 'char' ? esc(e.name) : 'Narrator';
  return `<div class="work"><div class="paper">
      <div class="row">${inserts(p, r, e).map((x, i) => `<button class="btn small quiet" data-act="insert" data-k="${i}">+ ${x.label}</button>`).join('')}</div>
      <textarea id="script" data-in="script" spellcheck="false" aria-label="What ${esc(e.name)} says" placeholder="${who}: Type the first line here.">${esc(e.script)}</textarea>
      <p class="status" id="status" role="status"></p>
    </div>
    <aside class="side"><h2>What ${e.kind === 'char' ? `${esc(e.name)} says` : 'happens'}</h2>
      <button class="btn play block" data-act="play-convo">Play this conversation</button>
      <p class="hint">Write it like a script. A name and a colon starts a line. Indent with two spaces to put lines under an answer.</p>
      <pre class="cheat">Mara: Hello.
Mara (smiling): Hi again.
A line with no name is narration.
Choice
  "An answer"  affection + 5
    Mara: A reply to it.
Only if affection is at least 5
  Mara: Shown when true.
Otherwise
  Mara: Shown when not.
Change gold - 10
Go to Street, night
End</pre>
      <div id="facts"></div></aside></div>`;
}

/** Feedback under the script: what it reads as, or the first problem in plain words. */
export function scriptStatus(p: Project, script: string): { text: string; error: boolean; facts: string[] } {
  const { steps, errors } = parseScript(script);
  const s = summarize(steps);
  if (errors.length) return { text: `Line ${errors[0].n}: ${errors[0].msg}`, error: true, facts: s.facts };
  const missing = s.doorTargets.find(name => !findRoomByName(p, name));
  if (missing) return { text: `There is no room called "${missing}" yet. Add it in the story map.`, error: true, facts: s.facts };
  const parts = ([[s.lines, 'line'], [s.choices, 'choice'], [s.conditions, 'condition'], [s.doors, 'door']] as const)
    .filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`);
  return { text: parts.length ? `Reads as ${parts.join(', ')}.` : 'Nothing written yet.', error: false, facts: s.facts };
}

export function viewLook(p: Project, r: Room): string {
  const L = p.look;
  const demo = choicesHTML([{ text: 'A choice looks like this' }, { text: 'And another one' }], false).replace('class="choices"', 'class="choices demo"')
    + sayHTML('Mara', 'This is how a line of dialogue looks in your game.', false);
  return `<div class="work"><div>${stageHTML(r, { mode: 'look', look: L, game: demo })}</div><aside class="side"><h2>The look of your game</h2>
      <div class="field"><span>Theme</span><div class="row">${Object.entries(THEMES).map(([k, t]) => `<button class="btn small${L.theme === k ? ' ink' : ''}" data-act="theme" data-k="${k}" aria-pressed="${L.theme === k}">${t.name}</button>`).join('')}</div></div>
      <label class="field"><span>Typeface</span><select id="look-font" data-in="look-font">${Object.keys(FONTS).map(f => `<option${f === L.font ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
      <label class="field"><span>Corners</span><input type="range" id="look-radius" data-in="look-radius" min="0" max="28" value="${L.radius}"></label>
      <label class="field"><span>Text size</span><input type="range" id="look-size" data-in="look-size" min="1.4" max="3" step="0.1" value="${L.size}"></label>
      <p class="hint">Changes show in the picture as you make them, and apply to the whole game.</p>
      <button class="btn block" data-act="crumb" data-k="room">Done</button></aside></div>`;
}

export function viewPlay(): string {
  return `<div><div id="player"></div><div class="strip" id="strip"></div></div>`;
}
