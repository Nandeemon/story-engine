import type { Facts, HudWidget } from '@story-engine/engine-core';
import { esc } from './art';

const shown = (v: unknown) => (v === true ? 'yes' : v === false ? 'no' : String(v));

/** The on-screen display: labels and meters for story facts, drawn over the game. */
export function hudHTML(widgets: HudWidget[] | undefined, facts: Facts, opts: { editable?: boolean; selected?: string } = {}): string {
  if (!widgets?.length) return '';
  const items = widgets.map(w => {
    const set = w.fact in facts;
    if (w.hideUnset && !set && !opts.editable) return '';
    const value = set ? facts[w.fact] : 0;
    const pos = `left:${w.x}%;top:${w.y}%`;
    const attrs = opts.editable ? ` data-hud="${esc(w.id)}"${opts.selected === w.id ? ' data-on' : ''}` : '';
    if (w.kind === 'meter') {
      const pct = Math.max(0, Math.min(100, (Number(value) || 0) / w.max * 100));
      return `<div class="hw hw-meter"${attrs} style="${pos};width:${w.w}%" role="meter" aria-valuemin="0" aria-valuemax="${w.max}" aria-valuenow="${Number(value) || 0}" aria-label="${esc(w.text || w.fact)}">${w.text ? `<span class="t">${esc(w.text)}</span>` : ''}<span class="hwbar"><i style="width:${pct}%"></i></span></div>`;
    }
    return `<div class="hw hw-label"${attrs} style="${pos}">${w.text ? `<span class="t">${esc(w.text)}</span> ` : ''}<b>${esc(shown(value))}</b></div>`;
  }).join('');
  return `<div class="hud">${items}</div>`;
}
