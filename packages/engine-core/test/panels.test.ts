import { describe, expect, it } from 'vitest';
import { normalizeProject, panelFactKey, panelFromTemplate, panelItems, panelVisible, parseScript, renamePanelInScript, writeScript, createRunner } from '../src';
import type { Panel, Step } from '../src';

describe('interface panels', () => {
  const inv = panelFromTemplate('inventory', []);
  it('shows a panel by its rules', () => {
    expect(panelVisible(inv, { roomId: 'r', talking: false, facts: {} })).toBe(false);
    expect(panelVisible(inv, { roomId: 'r', talking: false, facts: { [panelFactKey('Inventory')]: true } })).toBe(true);
    const talk: Panel = { ...inv, startHidden: undefined, when: 'talk' };
    expect(panelVisible(talk, { roomId: 'r', talking: false, facts: {} })).toBe(false);
    expect(panelVisible(talk, { roomId: 'r', talking: true, facts: {} })).toBe(true);
    const rooms: Panel = { ...talk, when: 'rooms', rooms: ['a'] };
    expect(panelVisible(rooms, { roomId: 'a', talking: false, facts: {} })).toBe(true);
    expect(panelVisible(rooms, { roomId: 'b', talking: false, facts: {} })).toBe(false);
    const cond: Panel = { ...talk, when: 'always', cond: { fact: 'has.map', op: 'truthy', value: true } };
    expect(panelVisible(cond, { roomId: 'a', talking: false, facts: { 'has.map': true } })).toBe(true);
    expect(panelVisible(cond, { roomId: 'a', talking: false, facts: {} })).toBe(false);
  });

  it('lists what the player has', () => {
    expect(panelItems('has.', { 'has.old_key': true, 'has.map': false, 'has.coin': 3, gold: 4 })).toEqual([
      { fact: 'has.old_key', name: 'old key', count: 1 }, { fact: 'has.coin', name: 'coin', count: 3 }]);
  });

  it('reads, writes and runs Show panel and Hide panel', () => {
    const text = 'Show panel Inventory\nHide panel Quest log';
    const { steps, errors } = parseScript(text);
    expect(errors).toEqual([]);
    expect(steps).toEqual([{ t: 'panel', name: 'Inventory', show: true }, { t: 'panel', name: 'Quest log', show: false }]);
    expect(writeScript(JSON.parse(JSON.stringify(steps)) as Step[])).toBe(text);
    const seen: string[] = [];
    createRunner(steps, {}, s => seen.push(s.t)).next();
    expect(seen).toEqual(['panel', 'panel']);
    expect(renamePanelInScript(text, 'inventory', 'Bag')).toBe('Show panel Bag\nHide panel Quest log');
  });

  it('keeps panels through saving and loading', () => {
    const p = normalizeProject({ rooms: [{ id: 'r1', name: 'A', els: [] }], panels: [inv, { ...inv, id: 'x' }, { name: 'Bad', blocks: [{ kind: 'nope' }] }] });
    expect(p!.panels?.map(x => x.name)).toEqual(['Inventory', 'Inventory 2', 'Bad']);
    expect(p!.panels?.[0].blocks.map(b => b.kind)).toEqual(['text', 'list']);
    expect(p!.panels?.[2].blocks).toEqual([]);
  });
});
