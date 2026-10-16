/**
 * Look › Interface: the panels of the game (status bars, an inventory, buttons),
 * placed and changed in the picture, with their settings in the side panel.
 */
import { CONDITION_WORDS, PANEL_TEMPLATES, panelRule, storyFactNames, valueText } from '@story-engine/engine-core';
import type { CompareOp, Condition, FactValue, Panel, PanelBlock, Project } from '@story-engine/engine-core';
import { esc } from '@story-engine/runtime';

const BLOCK_NAMES: Record<PanelBlock['kind'], string> = { text: 'Text', number: 'Number', meter: 'Meter', image: 'Picture', button: 'Button', list: 'Inventory list', portrait: 'Portrait' };
const OPS: [CompareOp, string][] = [...CONDITION_WORDS.map(([w, op]) => [op, w] as [CompareOp, string]), ['truthy', 'is yes']];

/** Example values so every block shows something in the editor; test values win. */
export function panelSampleFacts(p: Project, test: Record<string, unknown>): Record<string, FactValue> {
  const out: Record<string, FactValue> = {};
  for (const pn of p.panels ?? []) for (const b of pn.blocks) {
    if (b.kind === 'meter') out[b.fact] = Math.round(b.max * 0.6);
    if (b.kind === 'number') out[b.fact] = 12;
    if (b.kind === 'text' || b.kind === 'button') for (const m of (b.kind === 'text' ? b.text : b.label).matchAll(/\{([\w.]+)\}/g)) out[m[1]] = m[1].replace(/^.*\./, '');
    if (b.kind === 'list') {
      const known = storyFactNames(p).filter(f => f.toLowerCase().startsWith(b.prefix.toLowerCase()));
      for (const f of known.length ? known.slice(0, 6) : [`${b.prefix}key`, `${b.prefix}map`]) out[f] = true;
    }
  }
  for (const [k, v] of Object.entries(test)) if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') out[k] = v;
  return out;
}

function condRow(prefix: string, c: Condition | undefined, label: string): string {
  return `<div class="field"><span>${label}</span>
    <select id="${prefix}-on" data-in="${prefix}-on"><option value=""${c ? '' : ' selected'}>Always</option><option value="on"${c ? ' selected' : ''}>Only if…</option></select>
    ${c ? `<div class="condrow"><input type="text" list="pn-facts" id="${prefix}-fact" data-in="${prefix}-fact" value="${esc(c.fact)}" aria-label="Story fact">
      <select id="${prefix}-op" data-in="${prefix}-op" aria-label="Test">${OPS.map(([op, w]) => `<option value="${op}"${op === c.op ? ' selected' : ''}>${w}</option>`).join('')}</select>
      ${c.op === 'truthy' ? '' : `<input type="text" id="${prefix}-val" data-in="${prefix}-val" value="${esc(valueText(c.value))}" aria-label="Value">`}</div>` : ''}</div>`;
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
      const items = storyFactNames(p).filter(x => x.toLowerCase().startsWith(b.prefix.toLowerCase()) && x.length > b.prefix.length).map(x => x.slice(b.prefix.length));
      main = `<p class="hint">Shows every story fact starting with <code>${esc(b.prefix)}</code> that is yes, such as <code>${esc(b.prefix)}key</code> after <code>Change ${esc(b.prefix)}key = yes</code>.</p>${f('Text when empty', 'empty', b.empty ?? 'Nothing yet')}`;
      more = `${f('Facts starting with', 'prefix', b.prefix)}
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
  return `<div class="hudedit">${main}<details class="more" id="pb-more"><summary>More</summary><div>${more}${condRow('pb-cond', b.cond, 'Shows')}</div></details></div>`;
}

export function panelSection(p: Project, panelSel: string | null, blockSel: string | null): string {
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
  const rule = panelRule(pn, roomName);
  const blocks = pn.blocks.map((b, i) => {
    const on = b.id === blockSel;
    const what = b.kind === 'text' ? b.text : b.kind === 'number' || b.kind === 'meter' ? `${b.label || b.fact} · ${b.fact}` : b.kind === 'button' ? b.label : b.kind === 'list' ? `${b.prefix}…` : b.kind === 'portrait' ? p.characters.find(c => c.id === b.characterId)?.name ?? '' : '';
    return `<div class="pbrow${on ? ' on' : ''}"><button class="hudrow${on ? ' on' : ''}" data-act="pblock-sel" data-k="${esc(b.id)}"><b>${BLOCK_NAMES[b.kind]}</b><span>${esc(what)}${b.cond ? ' · only if' : ''}</span></button>
      <span class="pbtools"><button class="btn small quiet" data-act="pblock-move" data-k="${esc(b.id)}|-1"${i === 0 ? ' disabled' : ''} aria-label="Move up">↑</button><button class="btn small quiet" data-act="pblock-move" data-k="${esc(b.id)}|1"${i === pn.blocks.length - 1 ? ' disabled' : ''} aria-label="Move down">↓</button><button class="btn small quiet" data-act="pblock-remove" data-k="${esc(b.id)}" aria-label="Remove">✕</button></span></div>
      ${on ? blockFields(p, b) : ''}`;
  }).join('');
  const kinds = (Object.keys(BLOCK_NAMES) as PanelBlock['kind'][]).filter(k => k !== 'portrait' || p.characters.length);
  const when = `<label class="field"><span>When it shows</span><select id="pn-when" data-in="pn-when">${([['always', 'Always'], ['rooms', 'Only in some rooms'], ['talk', 'Only during conversations'], ['explore', 'Only while looking around']] as const).map(([k, n]) => `<option value="${k}"${pn.when === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
    ${pn.when === 'rooms' ? `<div class="roomchecks">${p.rooms.map(r => `<label class="check"><input type="checkbox" data-in="pn-room" data-k="${esc(r.id)}"${(pn.rooms ?? []).includes(r.id) ? ' checked' : ''}><span>${esc(r.name)}</span></label>`).join('')}</div>` : ''}`;
  const pick = (act: string, cur: string, opts: [string, string][]) => `<div class="row">${opts.map(([k, n]) => `<button class="btn small${cur === k ? ' ink' : ' quiet'}" data-act="${act}" data-k="${k}" aria-pressed="${cur === k}">${n}</button>`).join('')}</div>`;
  return `${facts}<div class="mhead"><h3>${esc(pn.name)}</h3><button class="btn small quiet" data-act="panel-sel" data-k="">Done</button></div>
    ${when}
    <div class="field"><span>Blocks</span><div class="hudlist">${blocks || '<p class="hint">Empty. Add a block below.</p>'}</div>
      <div class="addblocks">${kinds.map(k => `<button class="btn small" data-act="pblock-add" data-k="${k}">+ ${BLOCK_NAMES[k]}</button>`).join('')}</div></div>
    <p class="hint">Drag the panel in the picture to move it, and its corner to change its size. Click a block in the picture to change it.</p>
    ${rule ? `<p class="hint only-you"><b>Only you see this:</b> it shows ${esc(rule)}. Here every panel shows; hidden ones are see-through.</p>` : ''}
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
      ${condRow('pn-cond', pn.cond, 'And only')}
      <div class="row"><button class="btn small quiet" data-act="panel-copy">Duplicate</button><button class="btn small danger" data-act="panel-remove" data-confirm="Click again to remove">Remove the panel</button></div>
    </div></details>`;
}

export type { Panel };
