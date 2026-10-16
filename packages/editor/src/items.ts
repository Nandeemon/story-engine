/**
 * The map's "Give or take an item" step. It is stored as an ordinary Change of
 * has.<item> to yes or no; the map recognises such a Change when it draws, so the
 * script needs nothing new and authors never see "has.".
 */
import { addItem, itemFact, itemIdOf, itemName, itemOfStep, storyItems } from '@story-engine/engine-core';
import type { ChangeStep, Project, Step } from '@story-engine/engine-core';
import { esc } from '@story-engine/runtime';

/** "Gives: old key" or "Takes: old key", or null when the step is not about an item. */
export function itemStepText(p: Project, s: Step): string | null {
  const it = itemOfStep(s);
  return it ? `${it.give ? 'Gives' : 'Takes'}: ${itemName(p, it.id)}` : null;
}

/** A new step that gives the story's first item (or a key). */
export function newItemStep(p: Project): ChangeStep {
  const first = storyItems(p)[0] ?? addItem(p, 'key');
  return { t: 'change', effects: [{ fact: itemFact(first.id), op: '=', value: true }] };
}

/** The step's panel: give or take, and which item. */
export function itemStepPanel(p: Project, s: Step, header: (t: string) => string, del: string): string {
  const it = itemOfStep(s);
  if (!it) return '';
  const items = storyItems(p);
  if (!items.some(x => x.id === it.id)) items.push({ id: it.id, name: itemName(p, it.id) });
  return `${header('Give or take an item')}
    <div class="row"><button class="btn small${it.give ? ' ink' : ' quiet'}" data-map-act="item-give" data-k="1" aria-pressed="${it.give}">Give</button><button class="btn small${it.give ? ' quiet' : ' ink'}" data-map-act="item-give" data-k="" aria-pressed="${!it.give}">Take away</button></div>
    <label class="field"><span>Item</span><select id="m-item" data-map-in="item-pick">${items.map(x => `<option value="${esc(x.id)}"${x.id === it.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Or a new item</span><input type="text" id="m-item-new" data-map-in="item-new" placeholder="For example: old key" maxlength="40"></label>
    <p class="hint">${it.give ? 'From here on the player has it: it shows in an inventory panel, and Only if can test it.' : 'From here on the player no longer has it.'} Icons for items are under Pictures &amp; sounds › Items.</p>${del}`;
}

/** Give or take, from the step's panel. Returns false when the step is not about an item. */
export function itemStepGive(s: Step | null, give: boolean): boolean {
  if (!s || !itemOfStep(s) || s.t !== 'change') return false;
  s.effects[0].value = give;
  return true;
}

/** Picks the item, or makes a new one by name. Returns false when nothing changed. */
export function itemStepInput(p: Project, s: Step | null, field: string, value: string): boolean {
  if (!s || !itemOfStep(s) || s.t !== 'change') return false;
  const v = value.replace(/\s+/g, ' ').trim();
  if (!v) return false;
  const id = field === 'item-new' ? addItem(p, v, itemIdOf(v)).id : v;
  s.effects[0].fact = itemFact(id);
  return true;
}
