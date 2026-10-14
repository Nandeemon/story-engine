import { CONDITION_WORDS, IDLE_MOVES, characterOf, findRoomByName, parseScript, summarize, valueText, walkSteps } from '@story-engine/engine-core';
import { missingLook, unknownSpeaker } from './map';
import { factKind, storyFacts } from './problems';
import { musicSelect, soundRow, soundSelect } from './widgets';
import type { Problem } from './problems';
import type { StoryInfo } from './store';
import type { Character, CompareOp, FactValue, Idle, Project, Room, Sound, StoryElement } from '@story-engine/engine-core';
import { BACKDROPS, CHARACTERS, EXPRESSIONS, FONTS, OBJECTS, THEMES, allMarks, markArt, backdropHTML, characterSVG, choicesHTML, esc, hudHTML, sayHTML, stageHTML } from '@story-engine/runtime';
import type { Preset } from '@story-engine/runtime';

export type View = 'home' | 'cast' | 'map' | 'room' | 'convo' | 'look' | 'play' | 'check';
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

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} ${d === 1 ? 'day' : 'days'} ago`;
  return new Date(t).toLocaleDateString();
}

/** The home screen: every story kept in this browser. */
export function viewHome(stories: StoryInfo[], currentId: string | null): string {
  const cover = (x: StoryInfo) => x.cover?.thumb ? `<img src="${esc(x.cover.thumb)}" alt="">` : x.cover?.preset ? backdropHTML({ preset: x.cover.preset }) : '';
  const cards = stories.map(x => `<div class="storycard${x.id === currentId ? ' current' : ''}">
      <button class="card" data-act="open-story" data-k="${esc(x.id)}"><span class="pic">${cover(x)}</span><span class="meta"><b>${esc(x.title)}</b><span>${x.rooms} ${x.rooms === 1 ? 'room' : 'rooms'} · changed ${ago(x.updated)}</span></span></button>
      <div class="cardacts"><button class="btn small quiet" data-act="duplicate-story" data-k="${esc(x.id)}">Duplicate</button><button class="btn small quiet danger" data-act="delete-story" data-k="${esc(x.id)}" data-confirm="Delete for good?">Delete</button></div>
    </div>`).join('');
  const first = stories.length ? '' : `<div class="offer"><span>First time here?</span><button class="btn small play" data-act="new-sample">Open the sample story</button></div>`;
  return `<div class="side home"><div class="maphead"><div><h2>Your stories</h2><p class="hint">Every story you make is kept in this browser. Click one to work on it.</p></div>
      <div class="row"><button class="btn play" data-act="new-story">+ New story</button><button class="btn small" data-act="import-story">Open a file</button>${stories.length ? '<button class="btn small quiet" data-act="new-sample">Add the sample story</button>' : ''}</div></div>
    ${first}
    <div class="map stories">${cards}<button class="card new" data-act="new-story">+ New story</button></div>
    <p class="hint">To keep a backup or move a story to another computer, open it and use Save to file on its Story map. Open a file adds it here as a new story.</p></div>`;
}

function soundUses(p: Project, name: string): number {
  const key = name.toLowerCase();
  let n = 0;
  for (const r of p.rooms) for (const e of r.els) {
    if ((e.sound ?? '').toLowerCase() === key) n++;
    walkSteps(parseScript(e.script).steps, st => { if ((st.t === 'say' && (st.sound ?? '').toLowerCase() === key) || (st.t === 'music' && st.track.toLowerCase() === key)) n++; });
  }
  for (const r of p.rooms) if ((r.music ?? '').toLowerCase() === key) n++;
  return n;
}

/** The story's sounds and music: listen, rename, set the volume, remove, add. */
function soundsSection(p: Project): string {
  const all = p.sounds ?? [];
  const row = (x: Sound) => {
    const n = soundUses(p, x.name);
    const who = x.owner ? `${esc(p.characters.find(c => c.id === x.owner)?.name ?? '')}'s · ` : '';
    return soundRow(x, '', `${who}${n ? `used ${n}×` : 'not used yet'}`);
  };
  const fx = all.filter(x => !x.music), music = all.filter(x => x.music);
  return `<section class="soundsec"><div class="label">Sounds</div>
    ${fx.map(row).join('') || '<p class="hint">No sounds yet. Add your own, such as a laugh, a gasp or a door.</p>'}
    <div class="row"><button class="btn small" data-act="sound-add">+ Add a sound</button></div>
    <p class="hint">A sound plays when something is clicked (under More on the thing) or with a line (in the line's Effect and sound).</p></section>
  <section class="soundsec"><div class="label">Music</div>
    ${music.map(row).join('') || '<p class="hint">No music yet. Add a track, then pick it for a room or start it in a conversation.</p>'}
    <div class="row"><button class="btn small" data-act="music-add">+ Add music</button></div>
    <p class="hint">A room can start its own music (in the room's panel), and a conversation can change it with a Music step. Music loops unless you set it to play once.</p></section>`;
}

const ANIM_WORDS: [string, string][] = [['none', 'Still'], ['pulse', 'Pulses'], ['float', 'Floats up'], ['drift', 'Glides out'], ['bob', 'Bobs'], ['spin', 'Spins'], ['pop', 'Pops in'], ['shake', 'Shakes'], ['drip', 'Drips down'], ['fade', 'Fades in']];

/** Marks: starter marks and the author's own pictures, each with its animation, speed and size. */
function marksSection(p: Project): string {
  const cards = allMarks(p).map(m => {
    const changed = !!m.preset && !!p.marks?.some(x => x.name === m.name);
    return `<div class="markcard"><span class="markpic"><span class="mk an-${m.anim}" style="--mkd:${[1.8, 1.35, 1, 0.72, 0.5][(m.speed ?? 3) - 1]}">${markArt(m)}</span></span>
      ${m.preset ? `<b>${esc(m.name)}</b>` : `<input type="text" id="mark-name-${esc(m.id)}" data-in="mark-name" data-k="${esc(m.name)}" value="${esc(m.name)}" aria-label="Name">`}
      <select id="mark-anim-${esc(m.id)}" data-in="mark-anim" data-k="${esc(m.name)}" aria-label="Animation">${ANIM_WORDS.map(([k, w]) => `<option value="${k}"${k === m.anim ? ' selected' : ''}>${w}</option>`).join('')}</select>
      <label class="mini"><span>Speed</span><input type="range" id="mark-speed-${esc(m.id)}" data-in="mark-speed" data-k="${esc(m.name)}" min="1" max="5" value="${m.speed ?? 3}"></label>
      <label class="mini"><span>Size</span><input type="range" id="mark-size-${esc(m.id)}" data-in="mark-size" data-k="${esc(m.name)}" min="2" max="40" value="${Math.round(m.size)}"></label>
      ${m.preset ? (changed ? `<button class="linkbtn" data-act="mark-reset" data-k="${esc(m.name)}">Back to how it was</button>` : '') : `<button class="linkbtn danger" data-act="mark-delete" data-k="${esc(m.name)}" data-confirm="Delete?">Delete</button>`}</div>`;
  }).join('');
  return `<section class="soundsec marksec"><div class="label">Marks</div>
    <p class="hint">Small pictures shown on a character for a line or until taken off: pick them in a line's panel, or with "Put a mark on someone". Your own pictures can be GIFs that animate by themselves.</p>
    <div class="markgrid">${cards}</div>
    <div class="row"><button class="btn small" data-act="mark-add">+ Add your own mark</button></div></section>`;
}

export function viewMap(p: Project, ui: UI, errors = 0): string {
  const actions = ui.confirmReset
    ? `<span class="hint">Erase everything?</span><button class="btn small danger" data-act="reset">Yes, start over</button><button class="btn small quiet" data-act="cancel">Keep it</button>`
    : `<button class="btn small" data-act="save-file">Save to file</button><button class="btn small quiet" data-act="ask-reset">Start over</button>`;
  const cards = p.rooms.map(r => `<button class="card" data-act="open-room" data-k="${esc(r.id)}"><span class="pic">${backdropHTML(r.bg)}</span><span class="meta"><b>${esc(r.name)}</b><span>${r.els.length} ${r.els.length === 1 ? 'thing' : 'things'} placed${r.auto ? ' · starts talking right away' : ''}</span></span></button>`).join('');
  const publish = `<div class="publish">
      <label class="field"><span>Name of your story</span><input type="text" id="story-title" data-in="story-title" value="${esc(p.title ?? '')}" placeholder="${esc(p.rooms[0]?.name ?? 'Untitled story')}"></label>
      <div class="publishgo"><button class="btn play" data-act="make-game"${errors ? ` data-confirm="Check found ${errors} ${errors === 1 ? 'error' : 'errors'}. Make it anyway?"` : ''}>Make a game file</button><p class="hint">One file with your whole game. Open it in any browser, or upload it to itch.io (as an HTML game) or any website so others can play. Its typeface loads from the internet; offline a similar one shows.</p></div></div>`;
  return `<div class="side"><div class="maphead"><div><h2>Story map</h2><p class="hint">Every room in this story. Click one to work in it. Save to file keeps a copy you can move or back up.</p></div><div class="row">${actions}</div></div>
    ${publish}
    <div class="map">${cards}<button class="card new" data-act="new-room">+ New room</button></div>
    ${marksSection(p)}
    ${soundsSection(p)}</div>`;
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
  const area = a === 'object' ? `<div class="thumbs"><button class="thumb" data-act="add-area"><span class="pic obj areapic"><span class="areabox"><b>Click</b></span></span><b>Clickable area</b></button></div>
    <p class="hint">A clickable area is invisible in the game. Put it over a door, a window or a sign in the backdrop.</p><div class="label">Objects</div>` : '';
  return `<h2>${title}</h2>${own}${area}${grid}
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

/** How a character moves while standing: a pick list, with strength and speed when it moves. */
export function idleField(id: string, idle: Idle | undefined, unsetLabel: string): string {
  const v = idle?.move ?? '';
  const lvl = (key: 'strength' | 'speed', label: string) => `<label class="mini"><span>${label}</span><input type="range" id="${id}-${key}" data-in="${id}-${key}" min="1" max="5" value="${idle?.[key] ?? 3}"></label>`;
  return `<div class="field"><span>Moves while standing</span><select id="${id}" data-in="${id}"><option value=""${v ? '' : ' selected'}>${unsetLabel}</option>${['none', ...IDLE_MOVES].map(x => `<option value="${x}"${x === v ? ' selected' : ''}>${x === 'none' ? 'Stands still' : x}</option>`).join('')}</select>
    ${v && v !== 'none' ? `<div class="row">${lvl('strength', 'Strength')}${lvl('speed', 'Speed')}</div>` : ''}</div>`;
}

const OPS: [CompareOp, string][] = [...CONDITION_WORDS.map(([w, op]) => [op, w] as [CompareOp, string]), ['truthy', 'is yes']];

/** Settings every room thing shares, under More: when it is there, how often it talks, its sound. */
function moreFields(p: Project, e: StoryElement): string {
  const c = e.cond;
  const cond = `<div class="field"><span>In the room</span>
      <select id="el-cond-on" data-in="el-cond-on"><option value=""${c ? '' : ' selected'}>Always</option><option value="on"${c ? ' selected' : ''}>Only if a story fact says so</option></select>
      ${c ? `<div class="condrow"><input type="text" list="el-facts" id="el-cond-fact" data-in="el-cond-fact" value="${esc(c.fact)}" aria-label="Story fact">
        <select id="el-cond-op" data-in="el-cond-op" aria-label="Test">${OPS.map(([op, w]) => `<option value="${op}"${op === c.op ? ' selected' : ''}>${w}</option>`).join('')}</select>
        ${c.op === 'truthy' ? '' : `<input type="text" id="el-cond-val" data-in="el-cond-val" value="${esc(valueText(c.value))}" aria-label="Value">`}</div>
        <datalist id="el-facts">${storyFacts(p).map(f => `<option value="${esc(f)}">`).join('')}</datalist>
        <p class="hint">${esc(e.name)} is only in the room while this is true, so a conversation can bring ${e.kind === 'char' ? 'them' : 'it'} in with a Change.</p>` : ''}</div>`;
  const once = e.script.trim() ? `<label class="field"><span>How often it can be clicked</span><select id="el-once" data-in="el-once">
      <option value=""${e.once ? '' : ' selected'}>Every time</option>
      <option value="stay"${e.once === 'stay' ? ' selected' : ''}>Once, then it stays but cannot be clicked</option>
      <option value="hide"${e.once === 'hide' ? ' selected' : ''}>Once, then it is gone</option></select></label>` : '';
  const sound = `<label class="field"><span>Sound when clicked</span>${soundSelect(p, 'el-sound', 'data-in="el-sound"', e.sound)}</label>`;
  return cond + once + sound;
}

function areaPanel(p: Project, r: Room, e: StoryElement): string {
  const door = e.script.trim().match(/^go to\s+(.+)$/i);
  const simple = !e.script.trim() || (door && !e.script.trim().includes('\n'));
  const target = door ? door[1].trim().toLowerCase() : '';
  const rooms = p.rooms.filter(x => x.id !== r.id);
  const leads = simple
    ? `<label class="field"><span>Clicking it goes to</span><select id="area-door" data-in="area-door"><option value="">Nowhere yet</option>${rooms.map(x => `<option${x.name.toLowerCase() === target ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}<option value="__new">A new room…</option></select></label>`
    : '';
  return `<h2>${esc(e.name)}</h2>
    <button class="btn${simple ? '' : ' play'} block" data-act="convo">${e.script.trim() ? 'Edit what happens on click' : 'Make it say or do something'}</button>
    ${leads}
    <label class="field"><span>Name (only you see it)</span><input type="text" id="el-name" data-in="el-name" value="${esc(e.name)}"></label>
    <details class="more" id="el-more"><summary>More</summary><div>
      <label class="field"><span>Width</span><input type="range" id="el-w" data-in="el-w" min="2" max="100" value="${e.w ?? 20}"></label>
      <label class="field"><span>Height</span><input type="range" id="el-size" data-in="el-size" min="2" max="110" value="${e.size}"></label>
      ${moreFields(p, e)}
      <div class="row"><button class="btn small danger" data-act="remove" data-confirm="Click again to remove">Remove</button></div>
    </div></details>
    <p class="hint">Invisible in the game; players see a hand pointer over it. Drag it to move, drag its corner to change its size.</p>`;
}

function elementPanel(p: Project, e: StoryElement, r?: Room): string {
  if (e.kind === 'area' && r) return areaPanel(p, r, e);
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
      ${e.kind === 'char' ? idleField('el-idle', e.idle, c?.idle ? `As ${esc(c.name)} usually does (${esc(c.idle.move)})` : 'Stands still') : ''}
      ${moreFields(p, e)}
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
    ? `<p class="hint">When the picture is larger than the stage, or zoomed in, drag it to choose which part shows.</p>
       <label class="field"><span>Zoom</span><input type="range" id="bg-zoom" data-in="bg-zoom" min="1" max="3" step="0.05" value="${bg.zoom ?? 1}"></label>
       ${bg.fx !== undefined || bg.fy !== undefined || (bg.zoom ?? 1) !== 1 ? '<button class="btn small quiet" data-act="bg-reset">Show the middle again</button>' : ''}`
    : fit === 'fit'
      ? `<div class="row"><button class="btn small${bg.edge !== 'color' ? ' ink' : ' quiet'}" data-act="bg-edge" data-k="blur" aria-pressed="${bg.edge !== 'color'}">Soft edges</button><button class="btn small${bg.edge === 'color' ? ' ink' : ' quiet'}" data-act="bg-edge" data-k="color" aria-pressed="${bg.edge === 'color'}">Colour edges</button>
         ${bg.edge === 'color' ? `<input type="color" id="bg-color" data-in="bg-color" value="${esc(bg.color ?? '#000000')}" aria-label="Edge colour">` : ''}</div>`
      : '';
  return `<div class="field"><span>Backdrop</span><div class="row">${modes.map(([k, n, d]) => `<button class="btn small${fit === k ? ' ink' : ' quiet'}" data-act="bg-fit" data-k="${k}" title="${d}" aria-pressed="${fit === k}">${n}</button>`).join('')}</div>${extra}</div>`;
}

/** What happens when the player walks in: nothing, or a conversation, every visit or the first one. */
function enterField(r: Room): string {
  const talkers = r.els.filter(e => e.script.trim());
  if (!talkers.length) return '';
  const cur = r.auto ? (r.autoEl && talkers.some(e => e.id === r.autoEl) ? r.autoEl : talkers[0].id) : '';
  return `<div class="field"><span>When the player enters</span><select id="room-auto" data-in="room-auto">
      <option value=""${cur ? '' : ' selected'}>Nothing starts: the player looks around</option>
      ${talkers.map(e => `<option value="${esc(e.id)}"${cur === e.id ? ' selected' : ''}>${e.kind === 'char' ? `${esc(e.name)} starts talking` : `${esc(e.name)}'s conversation starts`}</option>`).join('')}</select>
    ${cur ? `<div class="row"><button class="btn small${r.autoOnce ? ' quiet' : ' ink'}" data-act="room-auto-once" data-k="" aria-pressed="${!r.autoOnce}">Every visit</button><button class="btn small${r.autoOnce ? ' ink' : ' quiet'}" data-act="room-auto-once" data-k="1" aria-pressed="${!!r.autoOnce}">First visit only</button></div>` : ''}</div>`;
}

/** The room's music: keep what plays, silence, or a track, looping or once. */
function musicField(p: Project, r: Room): string {
  const v = r.music ?? '';
  const track = v && v !== 'off';
  return `<div class="field"><span>Music</span>${musicSelect(p, 'room-music', 'data-in="room-music"', v, [['', 'Keep what is playing'], ['off', 'Silence']])}
    ${track ? `<div class="row"><button class="btn small${r.musicOnce ? ' quiet' : ' ink'}" data-act="room-music-once" data-k="" aria-pressed="${!r.musicOnce}">Loop</button><button class="btn small${r.musicOnce ? ' ink' : ' quiet'}" data-act="room-music-once" data-k="1" aria-pressed="${!!r.musicOnce}">Play once</button></div>` : ''}</div>`;
}

function roomPanel(p: Project, r: Room): string {
  return `<h2>${esc(r.name)}</h2>
    <div class="row"><button class="btn ink" data-act="adding" data-k="char">Add a character</button><button class="btn" data-act="adding" data-k="object">Add an object</button></div>
    <label class="field"><span>Room name</span><input type="text" id="room-name" data-in="room-name" value="${esc(r.name)}"></label>
    ${enterField(r)}
    ${musicField(p, r)}
    ${r.bg ? backdropField(r) : ''}
    <details class="more" id="room-more"><summary>More</summary><div>
      <button class="btn small quiet" data-act="adding" data-k="bg">Change the backdrop</button>
      ${p.rooms.length > 1 ? '<button class="btn small danger" data-act="del-room" data-confirm="Click again to delete the room">Delete this room</button>' : ''}
    </div></details>
    <p class="hint">${r.els.length ? 'Click anything in the picture to change it.' : 'The room is ready. Add someone to talk to.'}</p>`;
}

export function viewRoom(p: Project, ui: UI, r: Room, e: StoryElement | undefined): string {
  if (!r.bg && !r.els.length) return emptyRoom();
  const c = e ? characterOf(p, e) : undefined;
  const lining = e && c && ui.lookEdit && c.looks.some(l => l.id === ui.lookEdit) ? { elId: e.id, lookId: ui.lookEdit } : undefined;
  const side = ui.adding ? addingPanel(p, ui.adding) : lining && c ? lookPanel(p, c, lining.lookId) : e ? elementPanel(p, e, r) : roomPanel(p, r);
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
Mara (sad, shake): With an effect.
Mara (pulse strength 4 speed 2 x2): Settings 1-5.
Mara (happy, sound laugh): With a sound.
A line with no name is narration.
Narration: Move on, it said.
Show Lin as happy at left with fade
Move Lin to center size 70 flipped
Hide Lin with slide to right
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
    <div class="row"><button class="btn small" id="play-from" data-act="play-here" title="Play from the step marked in the map"${mode === 'map' ? '' : ' hidden'} disabled>Play from the marked step</button><button class="btn small play" data-act="play-convo">Play this conversation</button></div></div>`;
}

export function viewConvo(p: Project, r: Room, e: StoryElement, mode: ConvoMode, map: { canvas: string; side: string; scene: string; sceneOpen?: boolean }): string {
  if (mode === 'map') {
    return `<div class="work"><div class="mapwrap mapmode${map.sceneOpen === false ? ' noscene' : ''}" id="mapwrap">${convoBar(mode)}<div id="mscene">${map.scene}</div><div id="mapholder">${map.canvas}</div></div><aside class="side" id="mside">${map.side}</aside></div>`;
  }
  const who = e.kind === 'char' ? esc(e.name) : 'Narrator';
  return `<div class="work"><div class="mapwrap">${convoBar(mode)}<div class="paper">
      <div class="row">${inserts(p, r, e).map((x, i) => `<button class="btn small quiet" data-act="insert" data-k="${i}">+ ${x.label}</button>`).join('')}</div>
      <p class="status" id="status" role="status"></p>
      <div class="scriptbox"><div class="gutter" id="gutter" aria-hidden="true"></div><textarea id="script" data-in="script" spellcheck="false" aria-label="What ${esc(e.name)} says" placeholder="${who}: Type the first line here.">${esc(e.script)}</textarea></div>
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

/** The look stage, with the on-screen display drawn from test values or examples. */
export function lookStage(p: Project, r: Room, hudSel: string | null, facts: Record<string, unknown>): string {
  const L = p.look;
  const box = (L.choices ?? 'box') === 'box';
  const demo = box
    ? choicesHTML([{ text: 'Answers look like this' }, { text: 'And another one' }], false, 'box', { who: 'Mara', text: 'This is how a question and its answers look in your game.' })
    : choicesHTML([{ text: 'A choice looks like this' }, { text: 'And another one' }], false).replace('class="choices"', 'class="choices demo"')
      + sayHTML('Mara', 'This is how a line of dialogue looks in your game.', false);
  const sample: Record<string, FactValue> = {};
  for (const w of p.hud ?? []) sample[w.fact] = (facts[w.fact] as FactValue | undefined) ?? (w.kind === 'meter' ? Math.round(w.max * 0.6) : 12);
  return stageHTML(r, { mode: 'look', look: L, game: demo + hudHTML(p.hud, sample, { editable: true, selected: hudSel ?? undefined }), characters: p.characters });
}

function hudSection(p: Project, hudSel: string | null): string {
  const list = (p.hud ?? []).map(w => {
    const on = w.id === hudSel;
    const head = `<button class="hudrow${on ? ' on' : ''}" data-act="hud-sel" data-k="${esc(w.id)}"><b>${w.kind === 'meter' ? 'Meter' : 'Number or word'}</b><span>${esc(w.text || w.fact)} · ${esc(w.fact)}</span></button>`;
    if (!on) return head;
    return `${head}<div class="hudedit">
      <label class="field"><span>Story fact</span><input type="text" list="hud-facts" id="hud-fact" data-in="hud-fact" data-k="${esc(w.id)}" value="${esc(w.fact)}"></label>
      <label class="field"><span>Words shown with it</span><input type="text" id="hud-text" data-in="hud-text" data-k="${esc(w.id)}" value="${esc(w.text)}" placeholder="For example: Affection"></label>
      ${w.kind === 'meter' ? `<label class="field"><span>Full at</span><input type="number" id="hud-max" data-in="hud-max" data-k="${esc(w.id)}" value="${w.max}" min="1"></label>
      <label class="field"><span>Width</span><input type="range" id="hud-w" data-in="hud-w" data-k="${esc(w.id)}" min="8" max="60" value="${w.w}"></label>` : ''}
      <label class="check"><input type="checkbox" id="hud-hide" data-in="hud-hide" data-k="${esc(w.id)}"${w.hideUnset ? ' checked' : ''}><span>Hide until the story sets it</span></label>
      <p class="hint">Drag it in the picture to place it. The picture shows an example value, or your test value when test values are on.</p>
      <button class="btn small danger" data-act="hud-remove" data-k="${esc(w.id)}">Remove</button></div>`;
  }).join('');
  return `<div class="field">
    <p class="hint">Show a story fact over the game all the time, such as affection as a meter or money as a number.</p>
    ${storyFacts(p).length ? '' : '<p class="hint">Your story has no story facts yet. A conversation makes one with an answer like <code>"Thank you" affection + 1</code> or a line like <code>Change gold + 5</code>.</p>'}
    <div class="row"><button class="btn small" data-act="hud-add" data-k="meter">+ Meter</button><button class="btn small" data-act="hud-add" data-k="label">+ Number or word</button></div>
    <datalist id="hud-facts">${storyFacts(p).map(f => `<option value="${esc(f)}">`).join('')}</datalist>
    <div class="hudlist">${list}</div></div>`;
}

export type LookTab = 'style' | 'hud';

/** A theme colour (hex or rgba) as #rrggbb for a colour picker. */
function toHex(c: string): string {
  if (c.startsWith('#')) return c.slice(0, 7);
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (!m) return '#000000';
  return '#' + m[1].split(',').slice(0, 3).map(x => Math.round(Number(x)).toString(16).padStart(2, '0')).join('');
}

export function viewLook(p: Project, r: Room, hudSel: string | null = null, facts: Record<string, unknown> = {}, tab: LookTab = 'style'): string {
  const L = p.look;
  const box = (L.choices ?? 'box') === 'box';
  const seg = (t: LookTab, label: string) => `<button role="tab" class="seg${tab === t ? ' on' : ''}" aria-selected="${tab === t}" data-act="look-tab" data-k="${t}">${label}</button>`;
  const pick = (act: string, cur: string, opts: [string, string][]) => `<div class="row">${opts.map(([k, n]) => `<button class="btn small${cur === k ? ' ink' : ' quiet'}" data-act="${act}" data-k="${k}" aria-pressed="${cur === k}">${n}</button>`).join('')}</div>`;
  const t = THEMES[L.theme] ?? THEMES.velvet;
  const colour = (id: string, label: string, value: string | undefined, fallback: string) => `<label class="colourpick"><input type="color" id="${id}" data-in="${id}" value="${esc(value ?? toHex(fallback))}"><span>${label}${value ? '' : ' <i>theme</i>'}</span></label>`;
  const own = L.boxColor || L.textColor || L.accentColor;
  const style = `
      <div class="field"><span>Theme</span><div class="row">${Object.entries(THEMES).map(([k, th]) => `<button class="btn small${L.theme === k ? ' ink' : ''}" data-act="theme" data-k="${k}" aria-pressed="${L.theme === k}">${th.name}</button>`).join('')}</div></div>
      <div class="field"><span>Dialogue box</span>${pick('look-box', L.box ?? 'solid', [['solid', 'Solid'], ['glass', 'Glass'], ['outline', 'Outline'], ['band', 'Band']])}</div>
      <div class="field"><span>Speaker's name</span>${pick('look-names', L.names ?? 'tag', [['tag', 'Tag on the box'], ['inside', 'Inside the box'], ['plain', 'Coloured text']])}</div>
      <label class="field"><span>Typeface</span><select id="look-font" data-in="look-font">${Object.keys(FONTS).map(f => `<option${f === L.font ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
      <details class="more" id="look-more"><summary>More</summary><div>
        <div class="field"><span>Box width</span>${pick('look-width', L.width ?? 'fit', [['fit', 'Fits the text'], ['full', 'Full width']])}</div>
        <label class="field"><span>See-through</span><input type="range" id="look-opacity" data-in="look-opacity" min="20" max="100" value="${L.opacity ?? Math.round((Number((t.box.match(/,\s*([\d.]+)\)$/) ?? [])[1]) || 0.92) * 100)}"><span class="fxends"><i>clear</i><i>solid</i></span></label>
        <div class="field"><span>Text appears</span>${pick('look-typing', L.typing ? 'on' : 'off', [['off', 'All at once'], ['on', 'Letter by letter']])}
          ${L.typing ? `<input type="range" id="look-typing-speed" data-in="look-typing-speed" min="10" max="120" value="${L.typing}" aria-label="Letters per second"><span class="fxends"><i>slow</i><i>fast</i></span><p class="hint">Players can click to show the rest of a line at once.</p>` : ''}</div>
        <label class="field"><span>Corners</span><input type="range" id="look-radius" data-in="look-radius" min="0" max="28" value="${L.radius}"></label>
        <label class="field"><span>Text size</span><input type="range" id="look-size" data-in="look-size" min="1.4" max="3" step="0.1" value="${L.size}"></label>
        <div class="field"><span>Colours</span><div class="colours">${colour('look-boxcolor', 'Box', L.boxColor, t.box)}${colour('look-textcolor', 'Text', L.textColor, t.fg)}${colour('look-accentcolor', 'Names and buttons', L.accentColor, t.accent)}</div>
          ${own ? '<button class="btn small quiet" data-act="look-colours-reset">Use the theme colours</button>' : ''}</div>
        <div class="field"><span>Choices</span>${pick('look-choices', box ? 'box' : 'center', [['box', 'In the dialogue box'], ['center', 'In the middle']])}</div>
      </div></details>
      <p class="hint">Changes show in the picture as you make them, and apply to the whole game.</p>`;
  const count = p.hud?.length ? ` (${p.hud.length})` : '';
  return `<div class="work"><div id="lookstage">${lookStage(p, r, hudSel, facts)}</div><aside class="side"><h2>The look of your game</h2>
      <div class="segs" role="tablist" aria-label="What to change">${seg('style', 'Style')}${seg('hud', `On-screen display${count}`)}</div>
      ${tab === 'style' ? style : hudSection(p, hudSel)}
      <button class="btn block" data-act="crumb" data-k="room">Done</button></aside></div>`;
}

export function viewPlay(): string {
  return `<div><div id="player"></div><div class="strip" id="strip"></div></div>`;
}

/* ---------- Checking the story ---------- */

const LEVEL_WORDS = { error: 'Needs fixing', warning: 'Probably a mistake', note: 'Note' } as const;

export function viewCheck(p: Project, problems: Problem[], test: { use: boolean; values: Record<string, string> }): string {
  const list = problems.length
    ? problems.map((x, i) => `<div class="prob ${x.level}"><div class="probhead"><span class="lvl">${LEVEL_WORDS[x.level]}</span><b>${esc(x.where)}</b></div><p>${esc(x.text)}</p><button class="btn small" data-act="goto-problem" data-k="${i}">Show</button></div>`).join('')
    : '<p class="allgood">No problems found. Every door leads somewhere, every look exists, and every step can be reached.</p>';
  const facts = storyFacts(p);
  const rows = facts.map(f => {
    const kind = factKind(p, f), v = test.values[f] ?? '';
    const input = kind === 'yesno'
      ? `<select id="tf-${esc(f)}" data-in="test-fact" data-k="${esc(f)}"><option value=""${v === '' ? ' selected' : ''}>not set</option><option value="yes"${v === 'yes' ? ' selected' : ''}>yes</option><option value="no"${v === 'no' ? ' selected' : ''}>no</option></select>`
      : `<input type="${kind === 'number' ? 'number' : 'text'}" id="tf-${esc(f)}" data-in="test-fact" data-k="${esc(f)}" value="${esc(v)}" placeholder="not set">`;
    return `<label class="tfact"><span>${esc(f)}</span>${input}</label>`;
  }).join('');
  return `<div class="work"><div class="side"><div class="maphead"><div><h2>Check your story</h2><p class="hint">Everything here would otherwise only show up while playing. Click Show to go to the step.</p></div></div>
      <div class="probs">${list}</div></div>
    <aside class="side"><h2>Test values</h2>
      <p class="hint">Try the story with story facts already set, for example to test a line that needs affection 10. Players always start with every fact unset.</p>
      ${facts.length ? `<label class="check"><input type="checkbox" id="test-use" data-in="test-use"${test.use ? ' checked' : ''}><span>Use these values when I press Play</span></label>
      <div class="tfacts">${rows}</div>
      <button class="btn small quiet" data-act="test-clear">Clear test values</button>` : '<p class="hint">Your story has no story facts yet.</p>'}
    </aside></div>`;
}
