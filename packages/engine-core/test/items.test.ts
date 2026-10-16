import { describe, expect, it } from 'vitest';
import { addItem, itemIdOf, itemName, itemOfStep, normalizeProject, parseScript, storyItems, writeScript } from '../src';
import type { Project } from '../src';

const room = { id: 'r1', name: 'A', els: [] as unknown[] };

describe('items', () => {
  it('keeps the story Items list through saving and loading, cleaned', () => {
    const p = normalizeProject({ rooms: [room], items: [{ id: 'old_key', name: 'old key', icon: 'data:x' }, { name: 'Silver Coin' }, { id: 'old_key', name: 'twin' }, 'junk', { id: 'bad id!', name: '' }] })!;
    expect(p.items).toEqual([{ id: 'old_key', name: 'old key', icon: 'data:x' }, { id: 'silver_coin', name: 'Silver Coin' }, { id: 'bad_id_', name: 'bad id' }]);
    expect(normalizeProject({ rooms: [room] })!.items).toBeUndefined();
  });

  it('reads a Change of has.<item> to yes or no as giving or taking it', () => {
    const { steps } = parseScript('Change has.old_key = yes\nChange has.old_key = no\nChange has.old_key = yes, gold + 1\nChange gold = yes');
    expect(steps.map(itemOfStep)).toEqual([{ id: 'old_key', give: true }, { id: 'old_key', give: false }, null, null]);
    expect(writeScript(steps.slice(0, 1))).toBe('Change has.old_key = yes');
  });

  it('names items and finds the ones only used in conversations', () => {
    const p = normalizeProject({ rooms: [{ ...room, els: [{ id: 'e', kind: 'object', name: 'Box', x: 1, y: 1, size: 5, script: 'Change has.map = yes' }] }] }) as Project;
    expect(itemIdOf('Old Key')).toBe('old_key');
    const key = addItem(p, 'Old key');
    expect(addItem(p, 'old key')).toBe(key);
    expect(itemName(p, 'old_key')).toBe('Old key');
    expect(itemName(p, 'rope_ladder')).toBe('rope ladder');
    expect(storyItems(p).map(x => x.id)).toEqual(['old_key', 'map']);
  });
});

describe('old on-screen display', () => {
  it('turns each widget into a one-block panel with no background', () => {
    const p = normalizeProject({ rooms: [room], panels: [{ name: 'Status', blocks: [] }], hud: [
      { id: 'h1', kind: 'meter', fact: 'affection', text: 'Affection', max: 10, x: 2, y: 3, w: 30 },
      { id: 'h2', kind: 'label', fact: 'gold', text: '', max: 100, x: 70, y: 5, w: 24, hideUnset: true }] })!;
    expect(p.hud).toBeUndefined();
    expect(p.panels!.map(x => x.name)).toEqual(['Status', 'Affection', 'gold']);
    const [, meter, label] = p.panels!;
    expect(meter).toMatchObject({ id: 'h1', x: 2, y: 3, w: 30, style: 'none', when: 'always' });
    expect(meter.blocks).toMatchObject([{ kind: 'meter', fact: 'affection', label: 'Affection', max: 10 }]);
    expect(label).toMatchObject({ x: 70, y: 5, style: 'none' });
    expect(label.blocks).toMatchObject([{ kind: 'number', fact: 'gold', label: '', cond: { fact: 'gold', op: 'truthy' } }]);
    // Loading again changes nothing.
    expect(normalizeProject(JSON.parse(JSON.stringify(p)))!.panels).toEqual(p.panels);
  });
});
