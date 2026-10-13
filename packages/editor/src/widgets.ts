import type { Project } from '@story-engine/engine-core';
import { esc } from '@story-engine/runtime';

/** A pick list of the story's sounds, with a way to add one. */
export function soundSelect(p: Project, id: string, attr: string, value: string | undefined, none = 'No sound'): string {
  const list = p.sounds ?? [];
  const cur = (value ?? '').toLowerCase();
  const missing = cur && !list.some(x => x.name.toLowerCase() === cur) ? `<option value="${esc(cur)}" selected>${esc(cur)} (missing)</option>` : '';
  return `<select id="${id}" ${attr}><option value="">${none}</option>${list.map(x => `<option value="${esc(x.name)}"${x.name.toLowerCase() === cur ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}${missing}<option value="__upload">Upload a sound…</option></select>`;
}

