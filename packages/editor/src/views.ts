import { characterOf, findRoomByName, parseScript, summarize, walkSteps } from '@story-engine/engine-core';
import { missingLook, unknownSpeaker } from './map';
import type { Character, Project, Room, StoryElement } from '@story-engine/engine-core';
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
  /** The look being lined up, for the selected character. */
  lookEdit: string | null;
}

const thumbs = <T>(set: Record<string, T & { name: string }>, act: string, cls: string, art: (v: T) => string): string =>
  `<div class="thumbs">${Object.entries(set).map(([k, v]) =>
    `<button class="thumb" data-act="${act}" data-k="${k}"><span class="pic ${cls}">${art(v)}</span><b>${esc(v.name)}</b></button>`).join('')}</div>`;

const svgOf = (v: Preset) => v.svg;

/** True once the author has made anything worth keeping. */
export const hasContent = (p: Project) => p.rooms.length > 1 || p.rooms.some(r => r.bg || r.els.length);

export function viewMap(p: Project, ui: UI): string {
  const actions = ui.confirmReset
    ? `<span class="hint">Erase everything?</span><button class="btn small danger" data-act="reset">Yes, start over</button><button class="btn small quiet" data-act="cancel">Keep it</button>`
    : `<button class="btn small" data-act="save-file">Save to file</button><button class="btn small" data-act="open-file">Open a file</button><button class="btn small quiet" data-act="sample"${hasContent(p) ? ' data-confirm="This replaces your story. Click again"' : ''}>Load the sample scene</button><button class="btn small quiet" data-act="ask-reset">Start over</button>`;
  const cards = p.rooms.map(r => `<button class="card" data-act="open-room" data-k="${esc(r.id)}"><span class="pic">${backdropHTML(r.bg)}</span><span class="meta"><b>${esc(r.name)}</b><span>${r.els.length} ${r.els.length === 1 ? 'thing' : 'things'} placed${r.auto ? ' · starts talking right away' : ''}</span></span></button>`).join('');
  return `<div class="side"><div class="maphead"><div><h2>Story map</h2><p class="hint">Every room in your story. Click one to work in it. Your story is kept in this browser; Save to file keeps a copy you can move or back up.</p></div><div class="row">${actions}</div></div>
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

function addingPanel(p: Project, a: Exclude<Adding, null>): string {
  const title = { char: 'Add a character', object: 'Add an object', bg: 'Change the backdrop' }[a];
  const own = a === 'char' && p.characters.length
    ? `<div class="label">Your characters</div><div class="thumbs">${p.characters.map(c =>
      `<button class="thumb" data-act="add-own" data-k="${esc(c.id)}"><span class="pic tall own"><img src="${esc(c.base)}" alt=""></span><b>${esc(c.name)}</b></button>`).join('')}</div><div class="label">Starter characters</div>`
    : '';
  const grid = a === 'char' ? thumbs(CHARACTERS, 'add-char', 'tall', v => characterSVG(v))
    : a === 'object' ? thumbs(OBJECTS, 'add-object', 'obj', svgOf)
    : thumbs(BACKDROPS, 'set-bg', '', svgOf);
  const upload = a === 'char' ? 'Use your own picture' : 'Use your own image';
  return `<h2>${title}</h2>${own}${grid}
    <div class="row"><button class="btn small" data-act="upload" data-k="${a}">${upload}</button><button class="btn small quiet" data-act="cancel">Cancel</button></div>`;
}

/** The character's looks as a row of small pictures, with a way to add more. */
function looksStrip(c: Character, e: StoryElement): string {
  const start = (e.expr ?? '').toLowerCase();
  const looks = c.looks.filter(l => !l.once);
  const cell = (k: string, img: string, name: string, isStart: boolean) =>
    `<button class="lookcell" data-act="look-open" data-k="${esc(k)}" title="${k ? 'Line up or rename this look' : 'The base picture'}"><span class="pic"><img src="${esc(img)}" alt=""></span><b>${esc(name)}</b>${isStart ? '<i>at start</i>' : ''}</button>`;
  return `<div class="field"><span>Looks</span><div class="looks">
      ${cell('', c.base, 'default', !start || start === 'default')}
      ${looks.map(l => cell(l.id, l.img, l.name, start === l.name.toLowerCase())).join('')}
      <button class="lookcell add" data-act="add-looks"><span class="pic">+</span><b>Add looks</b></button>
    </div><p class="hint">A line can show any look: pick it in the conversation, or write <code>${esc(c.name)} (${esc(looks[0]?.name ?? 'happy')}): …</code> in the script.</p></div>`;
}

/** How many lines in the whole story show this look of this character. */
function linesUsingLook(p: Project, c: Character, look: string): number {
  let n = 0;
  const who = c.name.trim().toLowerCase(), key = look.toLowerCase();
  for (const r of p.rooms) for (const el of r.els) walkSteps(parseScript(el.script).steps, st => {
    if (st.t === 'say' && st.who.trim().toLowerCase() === who && st.expr.trim().toLowerCase() === key) n++;
  });
  return n;
}

function lookPanel(p: Project, c: Character, lookId: string): string {
  const l = c.looks.find(x => x.id === lookId);
  if (!l) return '';
  const used = linesUsingLook(p, c, l.name);
  const compare = document.body.classList.contains('compare-difference') ? 'difference' : 'see-through';
  return `<div class="mhead"><h2>Look: ${esc(l.name)}</h2><button class="btn small" data-act="look-done">Done</button></div>
    <p class="hint">The new look is drawn see-through over ${esc(c.name)}'s base picture. Drag it until the two line up, so ${esc(c.name)} stays still when the look changes. Arrow keys move it a little, Shift with an arrow moves it more.</p>
    <div class="field"><span>Compare with the base picture</span><div class="row">
      <button class="btn small${compare === 'see-through' ? ' ink' : ''}" data-act="look-compare" data-k="see-through" aria-pressed="${compare === 'see-through'}">See-through</button>
      <button class="btn small${compare === 'difference' ? ' ink' : ''}" data-act="look-compare" data-k="difference" aria-pressed="${compare === 'difference'}">Difference</button></div>
      <p class="hint">${compare === 'difference' ? 'Where the two pictures line up, they turn dark.' : 'The look is drawn see-through over the base picture.'}</p></div>
    ${l.once ? '<p class="hint">This picture is used by one line only.</p>' : `<label class="field"><span>Name used in lines</span><input type="text" id="look-name" data-in="look-name" value="${esc(l.name)}"></label>`}
    <label class="field"><span>Size</span><input type="range" id="look-scale" data-in="look-scale" min="0.5" max="1.6" step="0.01" value="${l.scale}"></label>
    <div class="row"><button class="btn small quiet" data-act="look-reset">Reset position</button><button class="btn small quiet" data-act="look-replace">Replace picture</button></div>
    <div class="row"><button class="btn small danger" data-act="look-delete" data-confirm="${used ? `${used} line${used === 1 ? ' uses' : 's use'} it. Click again` : 'Click again to delete the look'}">Delete this look</button></div>`;
}

function elementPanel(p: Project, e: StoryElement): string {
  const name = esc(e.name);
  const c = characterOf(p, e);
  const has = e.script.trim() !== '';
  const label = e.kind === 'char'
    ? (has ? `Edit what ${name} says` : `Make ${name} say something`)
    : (has ? 'Edit what happens on click' : 'Make it do something on click');
  const startOptions = c ? ['default', ...c.looks.filter(l => !l.once).map(l => l.name)] : [...EXPRESSIONS];
  const startNow = (e.expr || (c ? 'default' : 'neutral')).toLowerCase();
  const expr = e.kind === 'char' && (c || !e.img)
    ? `<label class="field"><span>${c ? 'Look at the start' : 'Expression at the start'}</span><select id="el-expr" data-in="el-expr">${startOptions.map(x => `<option${x.toLowerCase() === startNow ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>`
    : '';
  const builtIn = e.kind === 'char' && !c
    ? '<p class="hint">A starter figure with built-in expressions. To give a character looks of your own, add it with "Use your own picture".</p>'
    : '';
  return `<h2>${name}</h2>
    <button class="btn play block" data-act="convo">${label}</button>
    <label class="field"><span>Name</span><input type="text" id="el-name" data-in="el-name" value="${name}"></label>
    <label class="field"><span>Size</span><input type="range" id="el-size" data-in="el-size" min="6" max="110" value="${e.size}"></label>
    ${c ? looksStrip(c, e) : ''}
    <details class="more" id="el-more"><summary>More</summary><div>${expr}${builtIn}
      <div class="row"><button class="btn small quiet" data-act="front">Bring to front</button><button class="btn small danger" data-act="remove" data-confirm="Click again to remove">Remove</button></div>
    </div></details>
    <p class="hint">Drag ${name} in the picture to move. Click empty space to go back to the room.</p>`;
}

/** How the backdrop fills the stage, with the controls for that way. */
function backdropField(r: Room): string {
  const bg = r.bg!;
  const fit = bg.fit ?? 'fill';
  const modes: [string, string, string][] = [['fill', 'Fill', 'Covers the stage; you choose what shows'], ['fit', 'Fit', 'Shows the whole picture'], ['stretch', 'Stretch', 'Stretches the picture to the stage']];
  const extra = fit === 'fill'
    ? `<p class="hint">Drag the backdrop in the picture to choose which part shows.</p>
       <label class="field"><span>Zoom</span><input type="range" id="bg-zoom" data-in="bg-zoom" min="1" max="3" step="0.05" value="${bg.zoom ?? 1}"></label>
       ${bg.fx !== undefined || bg.fy !== undefined || (bg.zoom ?? 1) !== 1 ? '<button class="btn small quiet" data-act="bg-reset">Show the middle again</button>' : ''}`
    : fit === 'fit'
      ? `<div class="row"><button class="btn small${bg.edge !== 'color' ? ' ink' : ' quiet'}" data-act="bg-edge" data-k="blur" aria-pressed="${bg.edge !== 'color'}">Soft edges</button><button class="btn small${bg.edge === 'color' ? ' ink' : ' quiet'}" data-act="bg-edge" data-k="color" aria-pressed="${bg.edge === 'color'}">Colour edges</button>
         ${bg.edge === 'color' ? `<input type="color" id="bg-color" data-in="bg-color" value="${esc(bg.color ?? '#000000')}" aria-label="Edge colour">` : ''}</div>`
      : '';
  return `<div class="field"><span>Backdrop</span><div class="row">${modes.map(([k, n, d]) => `<button class="btn small${fit === k ? ' ink' : ' quiet'}" data-act="bg-fit" data-k="${k}" title="${d}" aria-pressed="${fit === k}">${n}</button>`).join('')}</div>${extra}</div>`;
}

function roomPanel(p: Project, r: Room): string {
  return `<h2>${esc(r.name)}</h2>
    <div class="row"><button class="btn ink" data-act="adding" data-k="char">Add a character</button><button class="btn" data-act="adding" data-k="object">Add an object</button></div>
    <label class="field"><span>Room name</span><input type="text" id="room-name" data-in="room-name" value="${esc(r.name)}"></label>
    ${r.bg ? backdropField(r) : ''}
    <details class="more" id="room-more"><summary>More</summary><div>
      <button class="btn small quiet" data-act="adding" data-k="bg">Change the backdrop</button>
      <label class="check"><input type="checkbox" id="room-auto" data-in="room-auto"${r.auto ? ' checked' : ''}><span>Start talking right away when the player enters, like a classic visual novel</span></label>
      ${p.rooms.length > 1 ? '<button class="btn small danger" data-act="del-room" data-confirm="Click again to delete the room">Delete this room</button>' : ''}
    </div></details>
    <p class="hint">${r.els.length ? 'Click anything in the picture to change it.' : 'The room is ready. Add someone to talk to.'}</p>`;
}

export function viewRoom(p: Project, ui: UI, r: Room, e: StoryElement | undefined): string {
  if (!r.bg && !r.els.length) return emptyRoom();
  const c = e ? characterOf(p, e) : undefined;
  const lining = e && c && ui.lookEdit && c.looks.some(l => l.id === ui.lookEdit) ? { elId: e.id, lookId: ui.lookEdit } : undefined;
  const side = ui.adding ? addingPanel(p, ui.adding) : lining && c ? lookPanel(p, c, lining.lookId) : e ? elementPanel(p, e) : roomPanel(p, r);
  return `<div class="work"><div>${stageHTML(r, { mode: 'edit', look: p.look, selected: lining ? null : ui.sel, characters: p.characters, lineup: lining })}</div><aside class="side">${side}</aside></div>`;
}

/** Text inserted by the buttons above the script. */
export function inserts(p: Project, r: Room, e: StoryElement): { label: string; text: string }[] {
  const other = p.rooms.find(x => x.id !== r.id) ?? r;
  return [
    { label: 'Line', text: e.kind === 'char' ? `${e.name}: ` : '' },
    { label: 'Choice', text: 'Choice\n  "First answer"\n    \n  "Second answer"\n    ' },
    { label: 'Only if', text: 'Only if affection is at least 5\n  ' },
    { label: 'Change something', text: 'Change affection + 1' },
    { label: 'Go to another room', text: `Go to ${other.name}` },
    { label: 'End', text: 'End' }
  ];
}

export type ConvoMode = 'map' | 'script';

const CHEAT = `Mara: Hello.
Mara (smiling): Hi again.
A line with no name is narration.
Choice
  "An answer"  affection + 5
    Mara: A reply to it.
    End
Only if affection is at least 5
  Mara: Shown when true.
Otherwise
  Mara: Shown when not.
Change gold - 10
Go to Street, night
Part: Later
Go to part Later
# A note only you see`;

function convoBar(mode: ConvoMode): string {
  const tab = (m: ConvoMode, label: string) => `<button role="tab" class="seg${mode === m ? ' on' : ''}" aria-selected="${mode === m}" data-act="convo-mode" data-k="${m}">${label}</button>`;
  return `<div class="convobar"><div class="segs" role="tablist" aria-label="How to show the conversation">${tab('map', 'Map')}${tab('script', 'Script')}</div>
    <button class="btn small play" data-act="play-convo">Play this conversation</button></div>`;
}

export function viewConvo(p: Project, r: Room, e: StoryElement, mode: ConvoMode, map: { canvas: string; side: string }): string {
  if (mode === 'map') {
    return `<div class="work"><div class="mapwrap">${convoBar(mode)}<div id="mapholder">${map.canvas}</div></div><aside class="side" id="mside">${map.side}</aside></div>`;
  }
  const who = e.kind === 'char' ? esc(e.name) : 'Narrator';
  return `<div class="work"><div class="mapwrap">${convoBar(mode)}<div class="paper">
      <div class="row">${inserts(p, r, e).map((x, i) => `<button class="btn small quiet" data-act="insert" data-k="${i}">+ ${x.label}</button>`).join('')}</div>
      <textarea id="script" data-in="script" spellcheck="false" aria-label="What ${esc(e.name)} says" placeholder="${who}: Type the first line here.">${esc(e.script)}</textarea>
      <p class="status" id="status" role="status"></p>
    </div></div>
    <aside class="side"><h2>What ${e.kind === 'char' ? `${esc(e.name)} says` : 'happens'}</h2>
      <p class="hint">Write it like a script. A name and a colon starts a line. Indent with two spaces to put lines under an answer. Lines that are not indented run after every answer.</p>
      <pre class="cheat">${esc(CHEAT)}</pre>
      <div id="facts"></div></aside></div>`;
}

/** Feedback under the script: what it reads as, or the first problem in plain words. */
export function scriptStatus(p: Project, r: Room, script: string): { text: string; error: boolean; facts: string[] } {
  const { steps, errors } = parseScript(script);
  const s = summarize(steps);
  if (errors.length) return { text: `Line ${errors[0].n}: ${errors[0].msg}`, error: true, facts: s.facts };
  const missing = s.doorTargets.find(name => !findRoomByName(p, name));
  if (missing) return { text: `There is no room called "${missing}" yet. Add it in the story map.`, error: true, facts: s.facts };
  let badLook: { who: string; expr: string } | null = null;
  walkSteps(steps, x => { if (!badLook && x.t === 'say' && missingLook(p, r, x.who, x.expr)) badLook = { who: x.who, expr: x.expr }; });
  if (badLook) {
    const b = badLook as { who: string; expr: string };
    return { text: `${b.who} has no look called "${b.expr}", so the base picture shows.`, error: true, facts: s.facts };
  }
  let stranger: { who: string; stage: boolean } | null = null;
  walkSteps(steps, x => {
    if (stranger?.stage) return;
    if ((x.t === 'show' || x.t === 'move' || x.t === 'hide') && unknownSpeaker({ project: p, room: r }, x.who)) stranger = { who: x.who, stage: true };
    else if (!stranger && x.t === 'say' && unknownSpeaker({ project: p, room: r }, x.who)) stranger = { who: x.who, stage: false };
  });
  if (stranger) {
    const st = stranger as { who: string; stage: boolean };
    if (st.stage) return { text: `There is no character called "${st.who}". If that line is narration, start it with Narration:`, error: true, facts: s.facts };
  }
  const parts = ([[s.lines, 'line'], [s.choices, 'choice'], [s.conditions, 'condition'], [s.doors, 'door']] as const)
    .filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}${n === 1 ? '' : 's'}`);
  const reads = parts.length ? `Reads as ${parts.join(', ')}.` : 'Nothing written yet.';
  // A speaker with no character is fine (a voice, "???"): only a gentle note, in case it was meant as narration.
  const note = stranger ? ` "${(stranger as { who: string }).who}" has no character, so that line is a voice without a picture. If it is narration with a colon in it, start it with Narration:` : '';
  return { text: reads + note, error: false, facts: s.facts };
}

export function viewLook(p: Project, r: Room): string {
  const L = p.look;
  const box = (L.choices ?? 'box') === 'box';
  const demo = box
    ? choicesHTML([{ text: 'Answers look like this' }, { text: 'And another one' }], false, 'box', { who: 'Mara', text: 'This is how a question and its answers look in your game.' })
    : choicesHTML([{ text: 'A choice looks like this' }, { text: 'And another one' }], false).replace('class="choices"', 'class="choices demo"')
      + sayHTML('Mara', 'This is how a line of dialogue looks in your game.', false);
  return `<div class="work"><div>${stageHTML(r, { mode: 'look', look: L, game: demo, characters: p.characters })}</div><aside class="side"><h2>The look of your game</h2>
      <div class="field"><span>Theme</span><div class="row">${Object.entries(THEMES).map(([k, t]) => `<button class="btn small${L.theme === k ? ' ink' : ''}" data-act="theme" data-k="${k}" aria-pressed="${L.theme === k}">${t.name}</button>`).join('')}</div></div>
      <label class="field"><span>Typeface</span><select id="look-font" data-in="look-font">${Object.keys(FONTS).map(f => `<option${f === L.font ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
      <label class="field"><span>Corners</span><input type="range" id="look-radius" data-in="look-radius" min="0" max="28" value="${L.radius}"></label>
      <label class="field"><span>Text size</span><input type="range" id="look-size" data-in="look-size" min="1.4" max="3" step="0.1" value="${L.size}"></label>
      <div class="field"><span>Choices</span><div class="row">
        <button class="btn small${box ? ' ink' : ''}" data-act="look-choices" data-k="box" aria-pressed="${box}">In the dialogue box</button>
        <button class="btn small${box ? '' : ' ink'}" data-act="look-choices" data-k="center" aria-pressed="${!box}">In the middle</button></div></div>
      <p class="hint">Changes show in the picture as you make them, and apply to the whole game.</p>
      <button class="btn block" data-act="crumb" data-k="room">Done</button></aside></div>`;
}

export function viewPlay(): string {
  return `<div><div id="player"></div><div class="strip" id="strip"></div></div>`;
}
