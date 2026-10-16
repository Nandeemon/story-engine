/**
 * Items: things the player can have, such as an old key. Whether the player has
 * one is the story fact "has.<id>" (yes or no), so the script needs nothing new;
 * the story's Items list gives each one a name and an icon for the editor and
 * the inventory.
 */
import { storyFactNames } from './facts';
import type { Item, Project, Step } from './types';

export const ITEM_PREFIX = 'has.';

/** The id an item gets from its name: "Old key" is "old_key". */
export function itemIdOf(name: string): string {
  return name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'item';
}

/** The story fact that holds whether the player has an item. */
export function itemFact(id: string): string {
  return `${ITEM_PREFIX}${id}`;
}

/** The name players see for an item id, from the Items list or made from the id. */
export function itemName(p: Project, id: string): string {
  return p.items?.find(x => x.id === id)?.name ?? id.replace(/_/g, ' ');
}

/** The item a step gives or takes: a Change whose only effect is has.<item> = yes or no. */
export function itemOfStep(s: Step): { id: string; give: boolean } | null {
  if (s.t !== 'change' || s.effects.length !== 1) return null;
  const e = s.effects[0];
  if (e.op !== '=' || typeof e.value !== 'boolean' || !e.fact.startsWith(ITEM_PREFIX) || e.fact.length <= ITEM_PREFIX.length) return null;
  return { id: e.fact.slice(ITEM_PREFIX.length), give: e.value };
}

/** Every item of the story: the Items list, then any has.<item> fact used in the story but not in the list. */
export function storyItems(p: Project): Item[] {
  const out = [...(p.items ?? [])];
  for (const f of storyFactNames(p)) {
    if (!f.startsWith(ITEM_PREFIX) || f.length <= ITEM_PREFIX.length) continue;
    const id = f.slice(ITEM_PREFIX.length);
    if (!out.some(x => x.id === id)) out.push({ id, name: id.replace(/_/g, ' ') });
  }
  return out;
}

/** Adds an item by name to the story's Items list (or finds the one with that id) and returns it. */
export function addItem(p: Project, name: string, id = itemIdOf(name)): Item {
  p.items ??= [];
  const found = p.items.find(x => x.id === id);
  if (found) return found;
  const it: Item = { id, name: name.trim().slice(0, 40) || id.replace(/_/g, ' ') };
  p.items.push(it);
  return it;
}

/** Cleans the Items list read from storage: ids kept to letters, digits and _, no two alike. */
export function normalizeItems(raw: unknown): Item[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    const name = typeof r.name === 'string' && r.name.trim() ? r.name.trim().slice(0, 40) : '';
    const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim().replace(/[^\w]/g, '_').slice(0, 40) : itemIdOf(name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: name || id.replace(/_/g, ' ').trim() || id, ...(typeof r.icon === 'string' && r.icon ? { icon: r.icon } : {}) });
  }
  return out;
}
