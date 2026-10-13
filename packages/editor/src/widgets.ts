import type { Character, Project } from '@story-engine/engine-core';
import { esc } from '@story-engine/runtime';

/**
 * A pick list of the story's sounds, with a way to add one. With a character,
 * that character's own sounds come first.
 */
export function soundSelect(p: Project, id: string, attr: string, value: string | undefined, none = 'No sound', who?: Character): string {
  const list = p.sounds ?? [];
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
