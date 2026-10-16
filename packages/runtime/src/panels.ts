/**
 * Interface panels drawn over the game: status bars, an inventory, buttons.
 * The same drawing serves the game and the editor's Look view, where every panel
 * shows (the hidden ones see-through) and can be picked and dragged.
 */
import { fillText, findLook, panelItems, panelVisible, testCondition } from '@story-engine/engine-core';
import type { Facts, Panel, PanelBlock, Project } from '@story-engine/engine-core';
import { esc } from './art';

const shown = (v: unknown) => (v === true ? 'yes' : v === false ? 'no' : v === undefined ? '0' : String(v));

export interface PanelDraw {
  roomId: string;
  talking: boolean;
  /** In the editor: every panel shows, and the selected panel and block are marked. */
  edit?: { panel?: string | null; block?: string | null };
}

function blockHTML(p: Project, b: PanelBlock, facts: Facts, edit: boolean, selected: boolean): string {
  const off = b.cond && !testCondition(facts, b.cond);
  if (off && !edit) return '';
  const attrs = `${edit ? ` data-pblock="${esc(b.id)}"` : ''} class="pb pb-${b.kind}${off ? ' off' : ''}${selected ? ' on' : ''}"`;
  switch (b.kind) {
    case 'text': return `<div${attrs}>${esc(fillText(b.text, facts))}</div>`;
    case 'number': return `<div${attrs}>${b.label ? `<span class="t">${esc(b.label)}</span>` : ''}<b>${esc(shown(facts[b.fact]))}</b></div>`;
    case 'meter': {
      const v = Number(facts[b.fact]) || 0;
      const pct = Math.max(0, Math.min(100, v / b.max * 100));
      return `<div${attrs} role="meter" aria-valuemin="0" aria-valuemax="${b.max}" aria-valuenow="${v}" aria-label="${esc(b.label || b.fact)}">${b.label ? `<span class="t">${esc(b.label)}</span>` : ''}<span class="pbar"><i style="width:${pct}%"></i></span></div>`;
    }
    case 'image': return `<div${attrs}><img src="${esc(b.img)}" alt=""></div>`;
    case 'button': return `<button type="button"${attrs}${edit ? ' tabindex="-1"' : ` data-pbtn="${esc(b.id)}"`}>${esc(fillText(b.label, facts))}</button>`;
    case 'list': {
      const items = panelItems(b.prefix, facts);
      const tile = (it: { fact: string; name: string; count: number }) => {
        const icon = b.icons?.[it.name] ?? b.icons?.[it.fact.slice(b.prefix.length)];
        return `<span class="it" title="${esc(it.name)}">${icon ? `<img src="${esc(icon)}" alt="">` : `<i>${esc(it.name.charAt(0).toUpperCase())}</i>`}<span>${esc(it.name)}${it.count > 1 ? ` ×${it.count}` : ''}</span></span>`;
      };
      return `<div${attrs}>${items.length ? items.map(tile).join('') : `<span class="none">${esc(b.empty ?? 'Nothing yet')}</span>`}</div>`;
    }
    case 'portrait': {
      const c = p.characters.find(x => x.id === b.characterId);
      const img = c ? (b.look ? findLook(c, b.look)?.img : undefined) ?? c.base : '';
      return `<div${attrs}>${img ? `<img src="${esc(img)}" alt="${esc(c?.name ?? '')}">` : ''}</div>`;
    }
  }
}

function frameStyle(pn: Panel): string {
  if (pn.style !== 'frame' || !pn.frame) return '';
  const f = pn.frame;
  return `;border-style:solid;border-width:${f.width}cqw;border-image:url('${f.img.replace(/['"]/g, encodeURIComponent)}') ${f.slice}% fill / ${f.width}cqw stretch`;
}

/** The panels for this moment, and the player's buttons for the panels they can open. */
export function panelsHTML(p: Project, facts: Facts, d: PanelDraw): string {
  const list = p.panels ?? [];
  if (!list.length) return '';
  const edit = !!d.edit;
  const out = list.map(pn => {
    const vis = panelVisible(pn, { roomId: d.roomId, talking: d.talking, facts });
    if (!vis && !edit) return '';
    const sel = d.edit?.panel === pn.id;
    const cls = `panel ps-${pn.style} pl-${pn.layout}${vis ? '' : ' hiddennow'}${sel ? ' on' : ''}`;
    const style = `left:${pn.x}%;top:${pn.y}%;width:${pn.w}%;height:${pn.h}%${frameStyle(pn)}`;
    const blocks = pn.blocks.map(b => blockHTML(p, b, facts, edit, sel && d.edit?.block === b.id)).join('');
    return `<div class="${cls}" style="${style}"${edit ? ` data-panel="${esc(pn.id)}"` : ''} role="group" aria-label="${esc(pn.name)}">${blocks}${sel ? '<span class="prz" data-presize aria-hidden="true"></span>' : ''}</div>`;
  }).join('');
  const toggles = edit ? '' : list.filter(pn => pn.button).map(pn => {
    const on = panelVisible(pn, { roomId: d.roomId, talking: d.talking, facts });
    return `<button type="button" class="ptoggle${on ? ' on' : ''}" data-ptoggle="${esc(pn.id)}" aria-pressed="${on}" title="${esc(pn.name)}${pn.key ? ` (${pn.key.toUpperCase()})` : ''}">${esc(pn.name.charAt(0).toUpperCase())}</button>`;
  }).join('');
  return `<div class="panels">${out}${toggles ? `<div class="ptoggles">${toggles}</div>` : ''}</div>`;
}
