/**
 * Characters: an overview of the author's main characters (those made from their
 * own pictures), with everything each one is part of, so a story with many
 * scenes stays easy to find your way around.
 */
import { conditionText, elementConds, elementScripts, parseScript, talkedFact, valueText, walkSteps } from '@story-engine/engine-core';
import type { Character, FactDef, Project, Room, Step, StoryElement } from '@story-engine/engine-core';
import { CHARACTERS, characterSVG, esc } from '@story-engine/runtime';
import { soundRow } from './widgets';
import { idleField } from './views';

const lower = (s: string) => s.trim().toLowerCase();

/** convo: one of the thing's conversations (its id in convos), or left out for its own script. */
export interface Convo { room: Room; el: StoryElement; lines: number; convo?: string; label?: string }
export interface CastInfo {
  /** Where the character is placed. */
  placed: { room: Room; el: StoryElement }[];
  /** Conversations they speak in, or are brought into. */
  convos: Convo[];
  /** Lines per look name. */
  lookUse: Map<string, number>;
  /** Story facts used in their conversations: how often changed and checked. */
  facts: Map<string, { changed: number; checked: number }>;
}

function factsOf(steps: Step[], into: CastInfo['facts']): void {
  const bump = (f: string, k: 'changed' | 'checked') => { const v = into.get(f) ?? { changed: 0, checked: 0 }; v[k]++; into.set(f, v); };
  walkSteps(steps, s => {
    if (s.t === 'change') s.effects.forEach(e => bump(e.fact, 'changed'));
    if (s.t === 'choice') s.options.forEach(o => o.effects.forEach(e => bump(e.fact, 'changed')));
    if (s.t === 'if') bump(s.cond.fact, 'checked');
  });
}

/** Everything a name takes part in: placed in rooms, lines in conversations, story facts nearby. */
export function castInfo(p: Project, name: string, characterId?: string): CastInfo {
  const key = lower(name);
  const info: CastInfo = { placed: [], convos: [], lookUse: new Map(), facts: new Map() };
  for (const room of p.rooms) for (const el of room.els) {
    if (el.kind === 'char' && (characterId ? el.characterId === characterId : !el.characterId && lower(el.name) === key)) info.placed.push({ room, el });
    for (const cv of [...(el.convos ?? []).map(c => ({ id: c.id, label: c.label || 'Conversation', script: c.script })), { id: '', label: el.convos?.length ? 'Otherwise' : '', script: el.script }]) {
    if (!cv.script.trim()) continue;
    const { steps } = parseScript(cv.script);
    let lines = 0, present = el.kind === 'char' && lower(el.name) === key;
    walkSteps(steps, s => {
      if ((s.t === 'show' || s.t === 'move' || s.t === 'hide') && lower(s.who) === key) present = true;
      if (s.t === 'say' && lower(s.who) === key) {
        lines++;
        const look = lower(s.expr) || 'default';
        info.lookUse.set(look, (info.lookUse.get(look) ?? 0) + 1);
      }
    });
    if (lines || present) {
      info.convos.push({ room, el, lines, ...(cv.id ? { convo: cv.id } : {}), ...(cv.label ? { label: cv.label } : {}) });
      factsOf(steps, info.facts);
    }
    }
  }
  return info;
}

/** Speakers that are not main characters: starter figures and voices without a picture. */
export function otherSpeakers(p: Project): { name: string; starter: boolean; lines: number }[] {
  const main = new Set(p.characters.map(c => lower(c.name)));
  const out = new Map<string, { name: string; starter: boolean; lines: number }>();
  for (const r of p.rooms) for (const el of r.els) {
    if (el.kind === 'char' && !el.characterId && !main.has(lower(el.name))) {
      const o = out.get(lower(el.name)) ?? { name: el.name, starter: true, lines: 0 };
      o.starter = true;
      out.set(lower(el.name), o);
    }
    for (const sc of elementScripts(el)) walkSteps(parseScript(sc).steps, s => {
      if (s.t !== 'say' || !s.who.trim() || main.has(lower(s.who))) return;
      const o = out.get(lower(s.who)) ?? { name: s.who.trim(), starter: false, lines: 0 };
      o.lines++;
      out.set(lower(s.who), o);
    });
  }
  return [...out.values()].sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
}

/** How often a fact is changed and checked anywhere in the story. */
function factUse(p: Project, fact: string): { changed: number; checked: number } {
  const out = { changed: 0, checked: 0 };
  for (const r of p.rooms) for (const e of r.els) {
    const m = new Map<string, { changed: number; checked: number }>();
    for (const sc of elementScripts(e)) factsOf(parseScript(sc).steps, m);
    const v = m.get(fact);
    if (v) { out.changed += v.changed; out.checked += v.checked; }
    out.checked += [...elementConds(e), ...(e.convos ?? []).flatMap(c => c.conds)].filter(c => c.fact === fact).length;
  }
  return out;
}

const KIND_WORDS: Record<FactDef['kind'], string> = { number: 'Number', milestone: 'Milestone', item: 'Item', word: 'Word' };
const KIND_HELP: Record<FactDef['kind'], string> = {
  number: 'goes up and down, such as affection or trust',
  milestone: 'yes once it has happened, such as "told her the truth"',
  item: 'yes while the player has it, such as a letter or a key',
  word: 'a word, such as her mood: happy, angry'
};

function useText(u: { changed: number; checked: number }): string {
  const parts = [u.changed ? `changed ${u.changed}×` : '', u.checked ? `checked ${u.checked}×` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'not used yet';
}

/** A character's story facts and milestones: the ones the author keeps track of, the automatic one, and others met in their conversations. */
function factsSection(p: Project, c: Character, info: CastInfo): string {
  const defs = c.facts ?? [];
  const talked = talkedFact(c.name);
  const startField = (d: FactDef) => d.kind === 'number'
    ? `<input type="number" id="cf-start-${esc(d.fact)}" data-in="cast-fact-start" data-k="${esc(d.fact)}" value="${typeof d.start === 'number' ? d.start : ''}" placeholder="unset" aria-label="Start value">`
    : d.kind === 'word'
      ? `<input type="text" id="cf-start-${esc(d.fact)}" data-in="cast-fact-start" data-k="${esc(d.fact)}" value="${d.start !== undefined ? esc(valueText(d.start)) : ''}" placeholder="unset" aria-label="Start value">`
      : `<select id="cf-start-${esc(d.fact)}" data-in="cast-fact-start" data-k="${esc(d.fact)}" aria-label="Start value"><option value="no"${d.start === true ? '' : ' selected'}>no</option><option value="yes"${d.start === true ? ' selected' : ''}>yes</option></select>`;
  const example = (d: FactDef) => d.kind === 'number' ? `Change ${d.fact} + 1 · Only if ${d.fact} is at least 5`
    : d.kind === 'word' ? `Change ${d.fact} = happy · Only if ${d.fact} is happy` : `Change ${d.fact} = yes · Only if ${d.fact}`;
  const rows = defs.map(d => `<div class="factrow">
      <div class="facthead"><span class="kind k-${d.kind}">${KIND_WORDS[d.kind]}</span><code>${esc(d.fact)}</code><span class="hint">${useText(factUse(p, d.fact))}</span>
        <button class="linkbtn danger" data-act="cast-fact-delete" data-k="${esc(d.fact)}" data-confirm="Stop tracking?">Remove</button></div>
      <div class="factbody"><label><span>At the start</span>${startField(d)}</label>
        <input type="text" id="cf-about-${esc(d.fact)}" data-in="cast-fact-about" data-k="${esc(d.fact)}" value="${esc(d.about ?? '')}" placeholder="What it means (only you see this)" aria-label="What it means"></div>
      <p class="hint ex">${esc(example(d))}</p></div>`).join('');
  const auto = `<div class="factrow auto"><div class="facthead"><span class="kind k-auto">Automatic</span><code>${esc(talked)}</code><span class="hint">${useText(factUse(p, talked))}</span></div>
      <p class="hint">Counts the conversations had with ${esc(c.name)}. Use it like <code>Only if ${esc(talked)}</code> or <code>Only if ${esc(talked)} is at least 2</code>.</p></div>`;
  const tracked = new Set([...defs.map(d => d.fact), talked]);
  const others = [...info.facts.keys()].filter(f => !tracked.has(f)).sort();
  return `<section><div class="label">Story facts and milestones</div>
    <p class="hint">Keep track of what matters for ${esc(c.name)}. In a conversation, change these with Change and test them with Only if; ${esc(c.name)}'s lines get one-click buttons for them.</p>
    <div class="factlist">${rows}${auto}</div>
    <div class="factadd"><select id="cast-fact-kind" aria-label="Kind">${(Object.keys(KIND_WORDS) as FactDef['kind'][]).filter(k => k !== 'item').map(k => `<option value="${k}" title="${esc(KIND_HELP[k])}">${KIND_WORDS[k]}: ${esc(KIND_HELP[k])}</option>`).join('')}</select>
      <input type="text" id="cast-fact-name" placeholder="Name, such as affection" aria-label="Name"><button class="btn small" data-act="cast-fact-add">+ Add</button></div>
    <p class="hint">Things the player can have, such as a letter or a key, are items of the whole story: see Items under Pictures &amp; sounds, and give them in a conversation with "Give or take an item".</p>
    ${others.length ? `<div class="label">Also used in ${esc(c.name)}'s conversations</div><div class="row">${others.map(f => `<button class="chip" data-act="cast-fact-track" data-k="${esc(f)}" title="Keep track of ${esc(f)} here">${esc(f)} +</button>`).join('')}</div>` : ''}
  </section>`;
}

/** The character's own small sound library: reactions such as a laugh or a gasp, optionally tied to a look. */
function soundsSection(p: Project, c: Character): string {
  const mine = (p.sounds ?? []).filter(x => x.owner === c.id && !x.music);
  const looks = c.looks.filter(l => !l.once);
  const rows = mine.map(x => {
    const linked = looks.find(l => l.sound === x.name);
    const look = looks.length ? `<select id="cs-look-${esc(x.id)}" data-in="cast-sound-look" data-k="${esc(x.id)}" aria-label="Plays with a look"><option value="">Any line</option>${looks.map(l => `<option value="${esc(l.id)}"${linked === l ? ' selected' : ''}>with the ${esc(l.name)} look</option>`).join('')}</select>` : '';
    return soundRow(x, look);
  }).join('');
  return `<section><div class="label">Sounds</div>
    ${rows || `<p class="hint">No sounds of ${esc(c.name)}'s own yet: a laugh, a sigh, a gasp.</p>`}
    <div class="row"><button class="btn small" data-act="cast-sound-add">+ Add a sound for ${esc(c.name)}</button></div>
    <p class="hint">${esc(c.name)}'s sounds come first when you pick a sound for one of ${esc(c.name)}'s lines, as one-click buttons. Tie a sound to a look and it plays whenever a line switches ${esc(c.name)} to that look.</p></section>`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function viewCast(p: Project, sel: string | null): string {
  const c = sel ? p.characters.find(x => x.id === sel) : undefined;
  return c ? castDetail(p, c) : castList(p);
}

function castList(p: Project): string {
  const cards = p.characters.map(c => {
    const info = castInfo(p, c.name, c.id);
    const looks = c.looks.filter(l => !l.once).length + 1;
    return `<button class="card castcard" data-act="cast-open" data-k="${esc(c.id)}"><span class="pic"><img src="${esc(c.base)}" alt=""></span>
      <span class="meta"><b>${esc(c.name)}</b><span>${plural(looks, 'look')} · ${plural(info.convos.length, 'conversation')}</span></span></button>`;
  }).join('');
  const others = otherSpeakers(p);
  // Starter figures speak like any character: they are listed with them, marked as starter figures.
  const starters = others.filter(o => o.starter).map(o => {
    let at: { room: Room; el: StoryElement } | undefined;
    for (const room of p.rooms) for (const el of room.els) if (!at && el.kind === 'char' && !el.characterId && lower(el.name) === lower(o.name)) at = { room, el };
    const info = castInfo(p, o.name);
    const art = characterSVG({ ...(CHARACTERS[at?.el.preset ?? ''] ?? CHARACTERS.mara), name: o.name }, at?.el.expr);
    return `<div class="card castcard starter"><button class="castopen" data-act="cast-goto-room" data-k="${at ? `${esc(at.room.id)}|${esc(at.el.id)}` : ''}" title="Open ${esc(o.name)} in ${esc(at?.room.name ?? 'the room')}"><span class="pic svg">${art}<span class="badge">Starter figure</span></span>
      <span class="meta"><b>${esc(o.name)}</b><span>${plural(o.lines, 'line')} · ${plural(info.convos.length, 'conversation')}</span></span></button>
      <button class="btn small quiet" data-act="cast-promote" data-k="${esc(o.name)}" title="Give ${esc(o.name)} your own picture and looks">Give a picture</button></div>`;
  }).join('');
  const voices = others.filter(o => !o.starter);
  const otherList = voices.length ? `<h3 class="sub">Voices without a picture</h3>
    <p class="hint">Names that speak in a conversation but have no picture, such as a voice on the phone. Give one a picture to see them on stage.</p>
    <div class="others">${voices.map(o => `<div class="other"><b>${esc(o.name)}</b><span>Voice${o.lines ? ` · ${plural(o.lines, 'line')}` : ''}</span><button class="btn small quiet" data-act="cast-promote" data-k="${esc(o.name)}">Give a picture</button></div>`).join('')}</div>` : '';
  return `<div class="side home"><div class="maphead"><div><h2>Characters</h2><p class="hint">Everyone who speaks in your story. Open one to see their looks, where they are and what they take part in.</p></div>
      <div class="row"><button class="btn" data-act="cast-new">+ New character</button></div></div>
    <div class="map stories">${cards}${starters}<button class="card new" data-act="cast-new">+ New character</button></div>
    ${otherList}</div>`;
}

/** When a placed figure is there: its situation, the situations it hides in, and its conditions, in plain words. */
function placeWhen(room: Room, el: StoryElement): string {
  const sit = (id: string) => room.situations?.find(s => s.id === id);
  const parts: string[] = [];
  if (el.situation) { const s = sit(el.situation); parts.push(`only in ${s ? `${esc(s.name)}${s.conds.length ? ` (${esc(s.conds.map(conditionText).join(' and '))})` : ''}` : 'a deleted situation'}`); }
  const hid = (el.hideIn ?? []).map(id => sit(id)?.name).filter(Boolean) as string[];
  if (hid.length) parts.push(`not in ${hid.map(esc).join(', ')}`);
  const conds = elementConds(el);
  if (conds.length) parts.push(`while ${esc(conds.map(conditionText).join(' and '))}`);
  return `<em class="when">${parts.length ? parts.join('; ') : 'always'}</em>`;
}

function castDetail(p: Project, c: Character): string {
  const info = castInfo(p, c.name, c.id);
  const looks = [{ id: '', name: 'default', img: c.base }, ...c.looks.filter(l => !l.once)];
  const lookCells = looks.map(l => {
    const used = info.lookUse.get(lower(l.name)) ?? 0;
    return `<div class="castlook"><span class="pic"><img src="${esc(l.img)}" alt=""></span>
      ${l.id ? `<input type="text" id="cast-look-${esc(l.id)}" data-in="cast-look-name" data-k="${esc(l.id)}" value="${esc(l.name)}" aria-label="Look name">` : '<b>default</b>'}
      <span class="hint">${used ? `on ${plural(used, 'line')}` : 'not used yet'}</span>
      ${l.id ? `<button class="linkbtn danger" data-act="cast-look-delete" data-k="${esc(l.id)}" data-confirm="Delete?">Delete</button>` : '<span class="hint">base picture</span>'}</div>`;
  }).join('');
  const once = c.looks.filter(l => l.once).length;
  const placed = info.placed.length
    ? info.placed.map(x => `<li><span>${esc(x.room.name)}${placeWhen(x.room, x.el)}${x.el.idle ? ` <i>${x.el.idle.move === 'none' ? 'stands still' : esc(x.el.idle.move)} here, set in the room</i>` : ''}</span><button class="btn small quiet" data-act="cast-goto-room" data-k="${esc(x.room.id)}|${esc(x.el.id)}">Open</button></li>`).join('')
    : '<li class="hint">Not placed in any room yet. A conversation can still bring them in.</li>';
  const free = p.rooms.filter(r => !info.placed.some(x => x.room === r));
  const placeIn = free.length ? `<select id="cast-place" data-in="cast-place" aria-label="Place in a room"><option value="">Place in a room…</option>${free.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select>` : '';
  const convos = info.convos.length
    ? info.convos.map(x => { const cv = x.convo ? x.el.convos?.find(c => c.id === x.convo) : undefined; return `<li><span>${esc(x.room.name)} › ${esc(x.el.name)}${x.label ? ` › ${esc(x.label)}` : ''}${x.lines ? ` <i>${plural(x.lines, 'line')}</i>` : ' <i>brought in</i>'}${cv?.conds.length ? `<em class="when">when ${esc(cv.conds.map(conditionText).join(' and '))}</em>` : x.el.convos?.length && !x.convo ? '<em class="when">when no other conversation runs</em>' : ''}</span><button class="btn small quiet" data-act="cast-goto-convo" data-k="${esc(x.room.id)}|${esc(x.el.id)}|${esc(x.convo ?? '')}">Open</button></li>`; }).join('')
    : '<li class="hint">No lines yet.</li>';
  return `<div class="castpage">
    <div class="casthead"><button class="btn small quiet" data-act="cast-back">← All characters</button><h2>${esc(c.name)}</h2></div>
    <div class="castgrid">
      <div class="castleft">
        <div class="castbase"><img src="${esc(c.base)}" alt=""></div>
        <label class="field"><span>Name</span><input type="text" id="cast-name" data-in="cast-name" value="${esc(c.name)}"></label>
        ${idleField('cast-idle', c.idle, 'Stands still')}
        <label class="field"><span>About ${esc(c.name)} (only you see this)</span><textarea id="cast-about" data-in="cast-about" rows="4" placeholder="Who they are, what they want, how they talk">${esc(c.about ?? '')}</textarea></label>
        <button class="btn small danger" data-act="cast-delete" data-confirm="${info.placed.length ? `Also removes ${c.name} from ${plural(info.placed.length, 'room')}. Click again` : 'Click again to delete'}">Delete character</button>
      </div>
      <div class="castright">
        <section><div class="label">Looks</div><div class="castlooks">${lookCells}</div>
          <div class="row"><button class="btn small" data-act="cast-add-looks">+ Add looks</button>${once ? `<span class="hint">and ${plural(once, 'picture')} used for one line only</span>` : ''}</div>
          <p class="hint">Renaming a look updates the lines that use it. To line a look up with the base picture, open ${esc(c.name)} in a room.</p></section>
        <section><div class="label">Where is ${esc(c.name)}</div><ul class="castlist">${placed}</ul>${placeIn}</section>
        <section><div class="label">Conversations</div><ul class="castlist">${convos}</ul></section>
        ${factsSection(p, c, info)}
        ${soundsSection(p, c)}
      </div>
    </div></div>`;
}

