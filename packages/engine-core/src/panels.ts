/**
 * Interface panels: boxes the author places on the stage, built from a few
 * blocks tied to story facts. This file holds the rules (cleaning stored panels,
 * when one shows, what an inventory holds) and the ready-made templates.
 */
import { testCondition } from './runner';
import type { Condition, Facts, Panel, PanelBlock } from './types';

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const factOf = (v: unknown, fallback: string) => str(v, fallback).replace(/[^\w.]/g, '_') || fallback;
let counter = 0;
const id = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

/** The story fact that holds whether a panel was shown or hidden by a conversation or the player. */
export function panelFactKey(name: string): string {
  return `panel.${name.trim().toLowerCase().replace(/[^\w]+/g, '_')}`;
}

/** Panel names sit in "Show panel <name>", so they keep to letters, digits and spaces. */
export function cleanPanelName(name: string): string {
  return name.replace(/[^\p{L}\p{N} '-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 30) || 'Panel';
}

export interface PanelContext { roomId: string; talking: boolean; facts: Facts }

/** Whether a panel shows right now. */
export function panelVisible(p: Panel, ctx: PanelContext): boolean {
  if (p.when === 'rooms' && !(p.rooms ?? []).includes(ctx.roomId)) return false;
  if (p.when === 'talk' && !ctx.talking) return false;
  if (p.when === 'explore' && ctx.talking) return false;
  if (p.cond && !testCondition(ctx.facts, p.cond)) return false;
  const set = ctx.facts[panelFactKey(p.name)];
  return typeof set === 'boolean' ? set : !p.startHidden;
}

/** Why a panel may not show at a moment, in plain words for the editor; '' when it always shows. */
export function panelRule(p: Panel, roomName: (id: string) => string): string {
  const parts: string[] = [];
  if (p.when === 'rooms') parts.push(`only in ${(p.rooms ?? []).map(roomName).join(', ') || 'no room yet'}`);
  if (p.when === 'talk') parts.push('only during conversations');
  if (p.when === 'explore') parts.push('only while looking around');
  if (p.cond) parts.push(`only if ${p.cond.fact}`);
  if (p.startHidden) parts.push(p.key || p.button ? 'until the player opens it' : 'until a conversation shows it');
  return parts.join(', ');
}

/** The items a list shows: each fact starting with the prefix that is yes (or above 0), in the order they came. */
export function panelItems(prefix: string, facts: Facts): { fact: string; name: string; count: number }[] {
  const pre = prefix.toLowerCase();
  return Object.keys(facts).filter(k => k.toLowerCase().startsWith(pre) && k.length > pre.length && (facts[k] === true || (typeof facts[k] === 'number' && (facts[k] as number) > 0)))
    .map(k => ({ fact: k, name: k.slice(pre.length).replace(/_/g, ' '), count: typeof facts[k] === 'number' ? facts[k] as number : 1 }));
}

function normalizeCond(raw: unknown): Condition | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const ops = ['>=', '<=', '>', '<', '!=', '=', 'truthy'];
  if (typeof c.fact !== 'string' || !ops.includes(c.op as string)) return undefined;
  const v = c.value;
  return { fact: factOf(c.fact, 'fact'), op: c.op as Condition['op'], value: typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string' ? v : true };
}

function normalizeBlock(raw: unknown, characters: string[]): PanelBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const base = { id: str(b.id, id()), ...(normalizeCond(b.cond) ? { cond: normalizeCond(b.cond) } : {}) };
  switch (b.kind) {
    case 'text': return { ...base, kind: 'text', text: str(b.text, '') };
    case 'number': return { ...base, kind: 'number', fact: factOf(b.fact, 'gold'), label: str(b.label, '') };
    case 'meter': return { ...base, kind: 'meter', fact: factOf(b.fact, 'hp'), label: str(b.label, ''), max: Math.max(1, num(b.max, 10)) };
    case 'image': return typeof b.img === 'string' ? { ...base, kind: 'image', img: b.img } : null;
    case 'button': return { ...base, kind: 'button', label: str(b.label, 'Button'), script: str(b.script, '') };
    case 'list': {
      const icons = b.icons && typeof b.icons === 'object' ? Object.fromEntries(Object.entries(b.icons as Record<string, unknown>).filter(([, v]) => typeof v === 'string')) as Record<string, string> : {};
      return { ...base, kind: 'list', prefix: str(b.prefix, 'has.') || 'has.', ...(Object.keys(icons).length ? { icons } : {}), ...(typeof b.empty === 'string' ? { empty: b.empty } : {}) };
    }
    case 'portrait': return typeof b.characterId === 'string' && characters.includes(b.characterId) ? { ...base, kind: 'portrait', characterId: b.characterId, ...(typeof b.look === 'string' && b.look ? { look: b.look } : {}) } : null;
  }
  return null;
}

/** Cleans panels read from storage: anything broken is dropped, numbers are kept on the stage. */
export function normalizePanels(raw: unknown, rooms: string[], characters: string[]): Panel[] {
  if (!Array.isArray(raw)) return [];
  const names = new Set<string>();
  return raw.filter(x => x && typeof x === 'object').map((x: Record<string, unknown>) => {
    let name = cleanPanelName(str(x.name, 'Panel'));
    for (let n = 2; names.has(name.toLowerCase()); n++) name = `${cleanPanelName(str(x.name, 'Panel'))} ${n}`;
    names.add(name.toLowerCase());
    const frame = x.frame && typeof x.frame === 'object' && typeof (x.frame as Record<string, unknown>).img === 'string'
      ? { img: (x.frame as Record<string, unknown>).img as string, slice: clamp(num((x.frame as Record<string, unknown>).slice, 30), 1, 49), width: clamp(num((x.frame as Record<string, unknown>).width, 1.5), 0.2, 6) } : undefined;
    const when = (['always', 'rooms', 'talk', 'explore'] as const).find(w => w === x.when) ?? 'always';
    const p: Panel = {
      id: str(x.id, id()), name,
      x: clamp(num(x.x, 2), -10, 100), y: clamp(num(x.y, 2), -10, 100), w: clamp(num(x.w, 30), 3, 100), h: clamp(num(x.h, 12), 3, 100),
      layout: x.layout === 'row' ? 'row' : 'column',
      style: x.style === 'none' ? 'none' : x.style === 'frame' && frame ? 'frame' : 'theme',
      ...(frame ? { frame } : {}),
      when,
      ...(when === 'rooms' ? { rooms: (Array.isArray(x.rooms) ? x.rooms : []).filter((r): r is string => typeof r === 'string' && rooms.includes(r)) } : {}),
      ...(normalizeCond(x.cond) ? { cond: normalizeCond(x.cond) } : {}),
      ...(x.startHidden === true ? { startHidden: true } : {}),
      ...(typeof x.key === 'string' && /^[a-z0-9]$/i.test(x.key) ? { key: x.key.toLowerCase() } : {}),
      ...(x.button === true ? { button: true } : {}),
      blocks: (Array.isArray(x.blocks) ? x.blocks : []).map(b => normalizeBlock(b, characters)).filter((b): b is PanelBlock => !!b)
    };
    return p;
  });
}

/** A new block of a kind, ready to change. */
export function newBlock(kind: PanelBlock['kind'], characterId?: string): PanelBlock | null {
  switch (kind) {
    case 'text': return { id: id(), kind, text: 'Some words, or {gold} gold' };
    case 'number': return { id: id(), kind, fact: 'gold', label: 'Gold' };
    case 'meter': return { id: id(), kind, fact: 'hp', label: 'Health', max: 10 };
    case 'button': return { id: id(), kind, label: 'Rest', script: 'Change hp = 10\nNarration: You feel rested.' };
    case 'list': return { id: id(), kind, prefix: 'has.' };
    case 'portrait': return characterId ? { id: id(), kind, characterId } : null;
    case 'image': return null;
  }
}

export const PANEL_TEMPLATES = [
  ['status', 'Status bar', 'Health as a bar and gold as a number, along the top'],
  ['inventory', 'Inventory', 'What the player has; the I key opens it'],
  ['card', 'Character card', 'A portrait, a name and how they feel about you'],
  ['quests', 'Quest log', 'The current quest, from a story fact'],
  ['buttons', 'Button row', 'Buttons that change story facts or run a few lines'],
  ['blank', 'Empty panel', 'Start from nothing and add blocks']
] as const;
export type PanelTemplate = typeof PANEL_TEMPLATES[number][0];

/** A panel from a template, named so it does not clash with the others. */
export function panelFromTemplate(t: PanelTemplate, taken: string[], characterId?: string): Panel {
  const named = (base: string) => { let n = base, i = 2; while (taken.some(x => x.toLowerCase() === n.toLowerCase())) n = `${base} ${i++}`; return n; };
  const P = (name: string, rest: Omit<Panel, 'id' | 'name' | 'layout' | 'style' | 'when'> & Partial<Panel>): Panel => ({ id: id(), name: named(name), layout: 'column', style: 'theme', when: 'always', ...rest });
  switch (t) {
    case 'status': return P('Status', { x: 2, y: 3, w: 40, h: 9, layout: 'row', blocks: [
      { id: id(), kind: 'meter', fact: 'hp', label: 'Health', max: 10 },
      { id: id(), kind: 'number', fact: 'gold', label: 'Gold' }] });
    case 'inventory': return P('Inventory', { x: 66, y: 13, w: 30, h: 34, startHidden: true, key: 'i', button: true, blocks: [
      { id: id(), kind: 'text', text: 'Inventory' },
      { id: id(), kind: 'list', prefix: 'has.', empty: 'Nothing yet' }] });
    case 'card': return P('Character card', { x: 2, y: 3, w: 22, h: 34, when: 'explore', blocks: [
      ...(characterId ? [{ id: id(), kind: 'portrait' as const, characterId }] : []),
      { id: id(), kind: 'text', text: 'Name' },
      { id: id(), kind: 'meter', fact: 'affection', label: 'Affection', max: 10 }] });
    case 'quests': return P('Quests', { x: 66, y: 13, w: 28, h: 14, blocks: [
      { id: id(), kind: 'text', text: 'Quest' },
      { id: id(), kind: 'text', text: '{quest}', cond: { fact: 'quest', op: 'truthy', value: true } },
      { id: id(), kind: 'text', text: 'Nothing to do yet', cond: { fact: 'quest', op: '=', value: 0 } }] });
    case 'buttons': return P('Buttons', { x: 30, y: 3, w: 40, h: 8, layout: 'row', style: 'none', when: 'explore', blocks: [
      { id: id(), kind: 'button', label: 'Rest', script: 'Change hp = 10\nNarration: You feel rested.' },
      { id: id(), kind: 'button', label: 'Look around', script: 'Narration: Nothing out of place.' }] });
    case 'blank': return P('Panel', { x: 30, y: 30, w: 30, h: 20, blocks: [{ id: id(), kind: 'text', text: 'Some words, or {gold} gold' }] });
  }
}
