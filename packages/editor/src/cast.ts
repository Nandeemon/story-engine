/**
 * Characters: an overview of the author's main characters (those made from their
 * own pictures), with everything each one is part of, so a story with many
 * scenes stays easy to find your way around.
 */
import { parseScript, walkSteps } from '@story-engine/engine-core';
import type { Character, Project, Room, Step, StoryElement } from '@story-engine/engine-core';
import { esc } from '@story-engine/runtime';

const lower = (s: string) => s.trim().toLowerCase();

export interface Convo { room: Room; el: StoryElement; lines: number }
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
    if (!el.script.trim()) continue;
    const { steps } = parseScript(el.script);
    let lines = 0, present = el.kind === 'char' && lower(el.name) === key;
    walkSteps(steps, s => {
      if ((s.t === 'show' || s.t === 'move' || s.t === 'hide') && lower(s.who) === key) present = true;
      if (s.t === 'say' && lower(s.who) === key) {
        lines++;
        const look = lower(s.expr) || '(no change)';
        info.lookUse.set(look, (info.lookUse.get(look) ?? 0) + 1);
      }
    });
    if (lines || present) {
      info.convos.push({ room, el, lines });
      factsOf(steps, info.facts);
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
    walkSteps(parseScript(el.script).steps, s => {
      if (s.t !== 'say' || !s.who.trim() || main.has(lower(s.who))) return;
      const o = out.get(lower(s.who)) ?? { name: s.who.trim(), starter: false, lines: 0 };
      o.lines++;
      out.set(lower(s.who), o);
    });
  }
  return [...out.values()].sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
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
  const otherList = others.length ? `<h3 class="sub">Others who speak</h3>
    <p class="hint">Starter figures and voices without a picture can speak in any conversation too. Give one your own picture to make them a main character with looks.</p>
    <div class="others">${others.map(o => `<div class="other"><b>${esc(o.name)}</b><span>${o.starter ? 'Starter figure' : 'Voice'}${o.lines ? ` · ${plural(o.lines, 'line')}` : ''}</span><button class="btn small quiet" data-act="cast-promote" data-k="${esc(o.name)}">Give a picture</button></div>`).join('')}</div>` : '';
  return `<div class="side home"><div class="maphead"><div><h2>Characters</h2><p class="hint">Your main characters, made from your own pictures. Open one to see their looks, where they are and what they take part in.</p></div>
      <div class="row"><button class="btn play" data-act="cast-new">+ New character</button></div></div>
    <div class="map stories">${cards}<button class="card new" data-act="cast-new">+ New character</button></div>
    ${otherList}</div>`;
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
    ? info.placed.map(x => `<li><span>${esc(x.room.name)}</span><button class="btn small quiet" data-act="cast-goto-room" data-k="${esc(x.room.id)}|${esc(x.el.id)}">Open</button></li>`).join('')
    : '<li class="hint">Not placed in any room yet. A conversation can still bring them in.</li>';
  const free = p.rooms.filter(r => !info.placed.some(x => x.room === r));
  const placeIn = free.length ? `<select id="cast-place" data-in="cast-place" aria-label="Place in a room"><option value="">Place in a room…</option>${free.map(r => `<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('')}</select>` : '';
  const convos = info.convos.length
    ? info.convos.map(x => `<li><span>${esc(x.room.name)} › ${esc(x.el.name)}${x.lines ? ` <i>${plural(x.lines, 'line')}</i>` : ' <i>brought in</i>'}</span><button class="btn small quiet" data-act="cast-goto-convo" data-k="${esc(x.room.id)}|${esc(x.el.id)}">Open</button></li>`).join('')
    : '<li class="hint">No lines yet.</li>';
  const facts = info.facts.size
    ? `<div class="row">${[...info.facts].sort((a, b) => a[0].localeCompare(b[0])).map(([f, v]) => `<span class="chip" title="${v.changed ? `changed ${v.changed}×` : ''}${v.changed && v.checked ? ', ' : ''}${v.checked ? `checked ${v.checked}×` : ''}">${esc(f)}</span>`).join('')}</div>`
    : '<p class="hint">None of their conversations use story facts yet.</p>';
  return `<div class="castpage">
    <div class="casthead"><button class="btn small quiet" data-act="cast-back">← All characters</button><h2>${esc(c.name)}</h2></div>
    <div class="castgrid">
      <div class="castleft">
        <div class="castbase"><img src="${esc(c.base)}" alt=""></div>
        <label class="field"><span>Name</span><input type="text" id="cast-name" data-in="cast-name" value="${esc(c.name)}"></label>
        <label class="field"><span>About ${esc(c.name)} (only you see this)</span><textarea id="cast-about" data-in="cast-about" rows="4" placeholder="Who they are, what they want, how they talk">${esc(c.about ?? '')}</textarea></label>
        <button class="btn small danger" data-act="cast-delete" data-confirm="${info.placed.length ? `Also removes ${c.name} from ${plural(info.placed.length, 'room')}. Click again` : 'Click again to delete'}">Delete character</button>
      </div>
      <div class="castright">
        <section><div class="label">Looks</div><div class="castlooks">${lookCells}</div>
          <div class="row"><button class="btn small" data-act="cast-add-looks">+ Add looks</button>${once ? `<span class="hint">and ${plural(once, 'picture')} used for one line only</span>` : ''}</div>
          <p class="hint">Renaming a look updates the lines that use it. To line a look up with the base picture, open ${esc(c.name)} in a room.</p></section>
        <section><div class="label">In rooms</div><ul class="castlist">${placed}</ul>${placeIn}</section>
        <section><div class="label">Conversations</div><ul class="castlist">${convos}</ul></section>
        <section><div class="label">Story facts in their conversations</div>${facts}</section>
      </div>
    </div></div>`;
}

