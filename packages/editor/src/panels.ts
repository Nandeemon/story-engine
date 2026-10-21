/**
 * Look › Interface: the panels of the game (status bars, an inventory, buttons),
 * placed and changed in the picture, with their settings in the side panel.
 */
import { condList } from './conds';
import { ITEM_PREFIX, PANEL_TEMPLATES, conditionText, panelRule, panelVisible, storyFactNames, storyItems } from '@story-engine/engine-core';
import type { Condition, FactValue, Panel, PanelBlock, Project } from '@story-engine/engine-core';
import { esc } from '@story-engine/runtime';

const BLOCK_NAMES: Record<PanelBlock['kind'], string> = { text: 'Text', number: 'Number', meter: 'Meter', image: 'Picture', button: 'Button', list: 'Items the player has', portrait: 'Portrait' };

/** Example values so every block shows something in the editor; test values win. */
export function panelSampleFacts(p: Project, test: Record<string, unknown>): Record<string, FactValue> {
  const out: Record<string, FactValue> = {};
  for (const pn of p.panels ?? []) for (const b of pn.blocks) {
    if (b.kind === 'meter') out[b.fact] = Math.round(b.max * 0.6);
    if (b.kind === 'number') out[b.fact] = 12;
    if (b.kind === 'text' || b.kind === 'button') for (const m of (b.kind === 'text' ? b.text : b.label).matchAll(/\{([\w.]+)\}/g)) out[m[1]] = m[1].replace(/^.*\./, '');
    if (b.kind === 'list') {
      const known = b.prefix.toLowerCase() === ITEM_PREFIX ? storyItems(p).map(x => `${ITEM_PREFIX}${x.id}`) : storyFactNames(p).filter(f => f.toLowerCase().startsWith(b.prefix.toLowerCase()));
      for (const f of known.length ? known.slice(0, 6) : [`${b.prefix}key`, `${b.prefix}map`]) out[f] = true;
    }
  }
  for (const [k, v] of Object.entries(test)) if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') out[k] = v;
  return out;
}

/** When a panel or block shows: always, or only while a condition holds (one condition, with the shared row). */
function condRow(p: Project, scope: 'pn' | 'pb', c: Condition | undefined, label: string): string {
  return condList(p, scope, c ? [c] : [], { label, max: 1 });
}

/** The story's items, each with its icon and name, and a way to add one. Shared by the inventory block and the Library. */
export function itemsField(p: Project): string {
  const items = storyItems(p);
  const rows = items.map(it => `<div class="iconrow">${it.icon ? `<img src="${esc(it.icon)}" alt="">` : `<i>${esc(it.name.charAt(0).toUpperCase())}</i>`}
      <input type="text" id="item-name-${esc(it.id)}" data-in="item-name" data-k="${esc(it.id)}" value="${esc(it.name)}" aria-label="Item name">
      <button class="btn small quiet" data-act="item-icon" data-k="${esc(it.id)}" aria-label="${it.icon ? 'Replace the icon of' : 'Add an icon for'} ${esc(it.name)}">${it.icon ? 'Replace' : '+ Icon'}</button></div>`).join('');
  return `<div class="field"><span>Items</span>
    ${rows || '<p class="hint">No items yet.</p>'}
    <div class="row nowrap"><input type="text" id="item-new" placeholder="A new item, such as old key" aria-label="New item"><button class="btn small" data-act="item-add">+ Add</button></div>
    <p class="hint">A conversation gives or takes an item with the step "Give or take an item".</p></div>`;
}

function blockFields(p: Project, b: PanelBlock): string {
  const f = (label: string, id: string, value: string, extra = '') => `<label class="field"><span>${label}</span><input type="text" id="pb-${id}" data-in="pb-${id}" value="${esc(value)}"${extra}></label>`;
  let main = '';
  let more = '';
  switch (b.kind) {
    case 'text': main = `${f('Text', 'text', b.text)}<p class="hint">Put a story fact in braces to show its value: <code>{gold} gold</code>.</p>`; break;
    case 'number': main = f('Story fact', 'fact', b.fact, ' list="pn-facts"') + f('Label', 'label', b.label); break;
    case 'meter': main = f('Story fact', 'fact', b.fact, ' list="pn-facts"') + f('Label', 'label', b.label) + `<label class="field"><span>Full at</span><input type="number" id="pb-max" data-in="pb-max" min="1" value="${b.max}"></label>`; break;
    case 'image': main = '<button class="btn small" data-act="pb-image">Replace the picture</button>'; break;
    case 'button': main = `${f('Label', 'label', b.label)}<label class="field"><span>What happens on click</span><textarea id="pb-script" data-in="pb-script" rows="4" spellcheck="false">${esc(b.script)}</textarea></label>
      <p class="hint">A few lines of script, as in a conversation: <code>Change gold - 5</code>, <code>Narration: …</code>, <code>Go to Kitchen</code>, <code>Show panel Inventory</code>. Buttons work while the player looks around.</p>`; break;
    case 'list': {
      if (b.prefix.toLowerCase() === ITEM_PREFIX) {
        main = `${itemsField(p)}${f('Text when nothing is there', 'empty', b.empty ?? 'Nothing yet')}`;
        more = f('Story facts starting with', 'prefix', b.prefix);
        break;
      }
      const items = storyFactNames(p).filter(x => x.toLowerCase().startsWith(b.prefix.toLowerCase()) && x.length > b.prefix.length).map(x => x.slice(b.prefix.length));
      main = `<p class="hint">Shows every story fact starting with <code>${esc(b.prefix)}</code> that is yes.</p>${f('Text when nothing is there', 'empty', b.empty ?? 'Nothing yet')}`;
      more = `${f('Story facts starting with', 'prefix', b.prefix)}
        <div class="field"><span>Icons</span>${items.length ? items.map(it => `<div class="iconrow">${b.icons?.[it] ? `<img src="${esc(b.icons[it])}" alt="">` : '<i></i>'}<span>${esc(it.replace(/_/g, ' '))}</span><button class="btn small quiet" data-act="pb-icon" data-k="${esc(it)}">${b.icons?.[it] ? 'Replace' : 'Add icon'}</button></div>`).join('') : `<p class="hint">No story fact starts with ${esc(b.prefix)} yet.</p>`}</div>`;
      break;
    }
    case 'portrait': {
      const c = p.characters.find(x => x.id === b.characterId);
      main = `<label class="field"><span>Character</span><select id="pb-char" data-in="pb-char">${p.characters.map(x => `<option value="${esc(x.id)}"${x.id === b.characterId ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
        ${c ? `<label class="field"><span>Look</span><select id="pb-look" data-in="pb-look"><option value="">Base picture</option>${c.looks.filter(l => !l.once).map(l => `<option${l.name === b.look ? ' selected' : ''}>${esc(l.name)}</option>`).join('')}</select></label>` : ''}`;
      break;
    }
  }
  return `<div class="hudedit">${main}<details class="more" id="pb-more"><summary>More</summary><div>${more}${condRow(p, 'pb', b.cond, 'Shows')}</div></details></div>`;
}

/** In plain words, when the panel shows in the game, matching "When it shows", and why it may look see-through here. */
function onlyYou(pn: Panel, roomName: (id: string) => string, shownNow: boolean): string {
  const when = pn.when === 'rooms' ? `only in ${(pn.rooms ?? []).map(roomName).join(', ') || 'no room yet: pick one above'}`
    : pn.when === 'talk' ? 'only during conversations'
    : pn.when === 'explore' ? 'only while the player looks around, not during conversations' : 'all the time';
  const extra = [pn.cond ? `while ${conditionText(pn.cond)}` : '', pn.startHidden ? (pn.key || pn.button ? 'once the player opens it' : 'once a conversation shows it') : ''].filter(Boolean).join(', ');
  const here = shownNow ? '' : ' It is see-through in this picture because it would be hidden right now.';
  return `<p class="hint only-you"><b>Only you see this:</b> in the game it shows ${esc(when)}${extra ? `, ${esc(extra)}` : ''}.${here}</p>`;
}

export function panelSection(p: Project, panelSel: string | null, blockSel: string | null, sample: Record<string, FactValue> = {}, roomId = ''): string {
  const facts = `<datalist id="pn-facts">${storyFactNames(p).map(f => `<option value="${esc(f)}">`).join('')}</datalist>`;
  const roomName = (id: string) => p.rooms.find(r => r.id === id)?.name ?? 'a removed room';
  const pn = (p.panels ?? []).find(x => x.id === panelSel);
  if (!pn) {
    const list = (p.panels ?? []).map(x => `<button class="hudrow" data-act="panel-sel" data-k="${esc(x.id)}"><b>${esc(x.name)}</b><span>${esc(panelRule(x, roomName) || 'always shows')}</span></button>`).join('');
    return `<div class="field"><span>Panels</span>
      <p class="hint">Boxes over the game built from story facts: a status bar, an inventory, buttons. Pick one to start from; it lands in the picture, where you click it to change it.</p>
      <div class="mkinds two">${PANEL_TEMPLATES.map(([k, n, d]) => `<button class="mkind" data-act="panel-add" data-k="${k}"><b>${n}</b><span>${d}</span></button>`).join('')}</div>
      ${list ? `<div class="hudlist">${list}</div>` : ''}</div>`;
  }
  const blocks = pn.blocks.map((b, i) => {
    const on = b.id === blockSel;
    const what = b.kind === 'text' ? b.text : b.kind === 'number' || b.kind === 'meter' ? `${b.label || b.fact} · ${b.fact}` : b.kind === 'button' ? b.label : b.kind === 'list' ? (b.prefix.toLowerCase() === ITEM_PREFIX ? '' : `${b.prefix}…`) : b.kind === 'portrait' ? p.characters.find(c => c.id === b.characterId)?.name ?? '' : '';
    return `<div class="pbrow${on ? ' on' : ''}" data-pbrow="${esc(b.id)}"><span class="pbhandle" data-pbdrag="${esc(b.id)}" title="Drag to change the order" aria-hidden="true">⋮⋮</span><button class="hudrow${on ? ' on' : ''}" data-act="pblock-sel" data-k="${esc(b.id)}"><b>${BLOCK_NAMES[b.kind]}</b><span>${esc(what)}${b.cond ? ' · only if' : ''}</span></button>
      <span class="pbtools"><button class="iconbtn kbonly" data-act="pblock-move" data-k="${esc(b.id)}|-1"${i === 0 ? ' disabled' : ''} aria-label="Move up">↑</button><button class="iconbtn kbonly" data-act="pblock-move" data-k="${esc(b.id)}|1"${i === pn.blocks.length - 1 ? ' disabled' : ''} aria-label="Move down">↓</button><button class="iconbtn" data-act="pblock-remove" data-k="${esc(b.id)}" aria-label="Remove">✕</button></span></div>
      ${on ? blockFields(p, b) : ''}`;
  }).join('');
  const kinds = (Object.keys(BLOCK_NAMES) as PanelBlock['kind'][]).filter(k => k !== 'portrait' || p.characters.length);
  const when = `<label class="field"><span>When it shows</span><select id="pn-when" data-in="pn-when">${([['always', 'Always'], ['rooms', 'Only in some rooms'], ['talk', 'Only during conversations'], ['explore', 'Only while looking around']] as const).map(([k, n]) => `<option value="${k}"${pn.when === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    ${pn.when === 'rooms' ? `<div class="roomchecks">${p.rooms.map(r => `<label class="check"><input type="checkbox" data-in="pn-room" data-k="${esc(r.id)}"${(pn.rooms ?? []).includes(r.id) ? ' checked' : ''}><span>${esc(r.name)}</span></label>`).join('')}</div>` : ''}`;
  const pick = (act: string, cur: string, opts: [string, string][]) => `<div class="row">${opts.map(([k, n]) => `<button class="btn small${cur === k ? ' ink' : ' quiet'}" data-act="${act}" data-k="${k}" aria-pressed="${cur === k}">${n}</button>`).join('')}</div>`;
  const shownNow = panelVisible(pn, { roomId, talking: false, facts: sample });
  return `${facts}<div class="drillhead"><button class="linkbtn back" data-act="panel-sel" data-k="">‹ All panels</button><h3>${esc(pn.name)}</h3></div>
    ${when}
    ${onlyYou(pn, roomName, shownNow)}
    <div class="field"><span>Blocks</span><div class="hudlist">${blocks || '<p class="hint">Empty. Add a block below.</p>'}</div>
      <div class="addblocks">${kinds.map(k => `<button class="btn small" data-act="pblock-add" data-k="${k}">+ ${BLOCK_NAMES[k]}</button>`).join('')}</div></div>
    <p class="hint">Drag the panel in the picture to move it, and its corner to change its size. Click a block in the picture to change it.</p>
    <details class="more" id="pn-more"><summary>More</summary><div>
      <label class="field"><span>Name (used by Show panel and Hide panel)</span><input type="text" id="pn-name" data-in="pn-name" value="${esc(pn.name)}"></label>
      <div class="field"><span>Blocks are</span>${pick('pn-layout', pn.layout, [['column', 'Stacked'], ['row', 'Side by side']])}</div>
      <div class="field"><span>Background</span>${pick('pn-style', pn.style, [['theme', 'Like the dialogue box'], ['none', 'None'], ['frame', 'Your own frame']])}
        ${pn.style === 'frame' ? `<button class="btn small" data-act="pn-frame">${pn.frame ? 'Replace the frame picture' : 'Upload a frame picture'}</button>
          ${pn.frame ? `<label class="field"><span>Corner size in the picture</span><input type="range" id="pn-slice" data-in="pn-slice" min="2" max="48" value="${pn.frame.slice}"></label>
          <label class="field"><span>Frame thickness</span><input type="range" id="pn-fwidth" data-in="pn-fwidth" min="0.2" max="5" step="0.1" value="${pn.frame.width}"></label>` : ''}
          <p class="hint">A frame picture's corners stay as they are and its edges stretch, so any size looks right. Set the corner size to where the corners end.</p>` : ''}</div>
      <div class="field"><span>The player can open and close it</span>
        <div class="row"><label class="check"><input type="checkbox" id="pn-button" data-in="pn-button"${pn.button ? ' checked' : ''}><span>With a button</span></label>
        <label class="check keybox"><span>Key</span><input type="text" id="pn-key" data-in="pn-key" maxlength="1" value="${esc(pn.key ?? '')}" placeholder="I"></label></div>
        <label class="check"><input type="checkbox" id="pn-hidden" data-in="pn-hidden"${pn.startHidden ? ' checked' : ''}><span>Hidden until opened or shown</span></label>
        <p class="hint">Conversations can show and hide it too: <code>Show panel ${esc(pn.name)}</code>, <code>Hide panel ${esc(pn.name)}</code>.</p></div>
      ${condRow(p, 'pn', pn.cond, 'And only')}
      <div class="row"><button class="btn small quiet" data-act="panel-copy">Duplicate</button><button class="btn small danger" data-act="panel-remove" data-confirm="Click again to remove">Remove the panel</button></div>
    </div></details>`;
}

export type { Panel };
