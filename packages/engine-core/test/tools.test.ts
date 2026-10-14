import { describe, expect, it } from 'vitest';
import { createRunner, factsToReach, fillText, parseScript, writeScript } from '../src';
import type { RunMemory } from '../src';

describe('story tools in the script', () => {
  it('reads and writes the new steps as written', () => {
    const src = [
      'Ask "What is your name?" as name',
      'Mara (in turn): Hi {name}. || Back again? || You again.',
      'Choice',
      '  "Tell me more"  once',
      '  "Bye"  fallback, trust + 1',
      'Camera zoom 2 at 40% 30%',
      'Camera shake',
      'Go to Kitchen with fade',
      'Ending: Good end'
    ].join('\n');
    const { steps, errors } = parseScript(src);
    expect(errors).toEqual([]);
    expect(steps[1]).toMatchObject({ text: 'Hi {name}.', alts: ['Back again?', 'You again.'], altMode: 'turn' });
    expect(steps[2]).toMatchObject({ options: [{ text: 'Tell me more', once: true }, { text: 'Bye', fallback: true, effects: [{ fact: 'trust' }] }] });
    expect(steps[3]).toEqual({ t: 'camera', action: 'zoom', scale: 2, x: 40, y: 30 });
    expect(steps[5]).toEqual({ t: 'door', room: 'Kitchen', fx: 'fade' });
    expect(writeScript(steps)).toBe(src);
  });
});

describe('running them', () => {
  it('asks, fills facts into lines and takes lines in turn', () => {
    const { steps } = parseScript('Ask "Name?" as name\nMara (in turn): Hi {name}. || Again, {name}?');
    const memory: RunMemory = { picked: [], turns: {} };
    const facts = {};
    const r1 = createRunner(steps, facts, undefined, undefined, memory, 'mara');
    const ask = r1.next();
    expect(ask.t).toBe('ask');
    if (ask.t === 'ask') ask.answer('Lin');
    expect(r1.next()).toMatchObject({ text: 'Hi Lin.' });
    const r2 = createRunner(steps.slice(1), facts, undefined, undefined, memory, 'mara');
    expect(r2.next()).toMatchObject({ text: 'Again, Lin?' });
  });
  it('hides answers picked once and shows the fallback when nothing else is left', () => {
    const { steps } = parseScript('Choice\n  "Ask about the key"  once\n  "Leave"  fallback');
    const memory: RunMemory = { picked: [], turns: {} };
    const first = createRunner(steps, {}, undefined, undefined, memory, 'el').next();
    expect(first.t === 'choice' && first.options.map(o => o.text)).toEqual(['Ask about the key']);
    if (first.t === 'choice') first.pick(0);
    const again = createRunner(steps, {}, undefined, undefined, memory, 'el').next();
    expect(again.t === 'choice' && again.options.map(o => o.text)).toEqual(['Leave']);
  });
  it('ends with an ending', () => {
    expect(createRunner(parseScript('Ending: Bittersweet').steps, {}).next()).toEqual({ t: 'end', ending: 'Bittersweet' });
  });
  it('goes back to a place', () => {
    const r = createRunner(parseScript('A: one\nA: two\nA: three').steps, {});
    r.next();
    const at = r.place();
    expect(r.next()).toMatchObject({ text: 'two' });
    r.restore(at);
    expect(r.next()).toMatchObject({ text: 'two' });
  });
  it('fills facts and finds the facts that reach a step', () => {
    expect(fillText('{gold} coins, {missing}!', { gold: 5 })).toBe('5 coins, !');
    const { steps } = parseScript('Only if trust is at least 3\n  Mara: Yes.\nOtherwise\n  Mara: No.');
    expect(factsToReach(steps, '0.t.0', {})).toEqual({ trust: 3 });
    expect(factsToReach(steps, '0.e.0', { trust: 5 })).toEqual({ trust: 2 });
    expect(factsToReach(steps, '0.t.0', { trust: 4 })).toEqual({});
  });
});
