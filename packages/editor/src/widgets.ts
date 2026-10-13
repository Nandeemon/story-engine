import type { Character, Project } from '@story-engine/engine-core';
import { esc } from '@story-engine/runtime';

/**
 * A pick list of the story's sounds, with a way to add one. With a character,
 * that character's own sounds come first.
 */
export function soundSelect(p: Project, id: string, attr: string, value: string | undefined, none = 'No sound', who?: Character): string {
  const list = (p.sounds ?? []).filter(x => !x.music);
  const cur = (value ?? '').toLowerCase();
  const opt = (name: string) => `<option value="${esc(name)}"${name.toLowerCase() === cur ? ' selected' : ''}>${esc(name)}</option>`;
  const missing = cur && !list.some(x => x.name.toLowerCase() === cur) ? `<option value="${esc(cur)}" selected>${esc(cur)} (missing)</option>` : '';
  const mine = who ? list.filter(x => x.owner === who.id) : [];
  const rest = list.filter(x => !mine.includes(x));
  const groups = mine.length
    ? `<optgroup label="${esc(who!.name)}'s sounds">${mine.map(x => opt(x.name)).join('')}</optgroup>${rest.length ? `<optgroup label="Other sounds">${rest.map(x => opt(x.name)).join('')}</optgroup>` : ''}`
    : rest.map(x => opt(x.name)).join('');
  return `<select id="${id}" ${attr}><option value="">${none}</option>${groups}${missing}<option value="__upload">Upload a sound…</option></select>`;
}

/** A pick list of the story's music tracks. `extra` options come first (such as "Keep what is playing"). */
export function musicSelect(p: Project, id: string, attr: string, value: string | undefined, extra: [string, string][]): string {
  const list = (p.sounds ?? []).filter(x => x.music);
  const cur = (value ?? '').toLowerCase();
  const missing = cur && !extra.some(([v]) => v === cur) && !list.some(x => x.name === cur) ? `<option value="${esc(cur)}" selected>${esc(cur)} (missing)</option>` : '';
  return `<select id="${id}" ${attr}>${extra.map(([v, label]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(label)}</option>`).join('')}${list.map(x => `<option value="${esc(x.name)}"${x.name === cur ? ' selected' : ''}>♫ ${esc(x.name)}</option>`).join('')}${missing}<option value="__upload">Upload music…</option></select>`;
}

/** One sound in a list: listen, rename, volume, remove. */
export function soundRow(x: { id: string; name: string; volume?: number }, extra = '', uses = ''): string {
  return `<div class="soundrow"><button class="btn small quiet" data-act="sound-play" data-k="${esc(x.id)}" aria-label="Play ${esc(x.name)}">▶</button>
      <input type="text" id="sound-${esc(x.id)}" data-in="sound-name" data-k="${esc(x.id)}" value="${esc(x.name)}" aria-label="Name">
      <label class="vol" title="Volume"><span aria-hidden="true">🔊</span><input type="range" id="vol-${esc(x.id)}" data-in="sound-volume" data-k="${esc(x.id)}" min="0" max="100" value="${x.volume ?? 100}" aria-label="Volume of ${esc(x.name)}"></label>
      ${extra}${uses ? `<span class="hint">${uses}</span>` : ''}
      <button class="btn small quiet danger" data-act="sound-delete" data-k="${esc(x.id)}" data-confirm="Delete?">Delete</button></div>`;
}
