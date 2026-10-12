import { describe, expect, it } from 'vitest';
import { createRunner, getList, getStep, parseScript, splitPath, stepPathOf, summarize, writeScript } from '../src';
import type { Facts, RunEvent, Step } from '../src';

const STORY = `# Mara's first scene
Mara: You came back.
Choice
  "I missed this place."  affection + 8, met = yes
    Mara (smiling): So did I.
    Go to part Stay
  "Just passing through."
    Mara (sad): Of course you are.
    Only if affection is at least 5
      Mara: Then again, maybe not.
    Otherwise
      Go to Street, night
The lamps flicker.
Part: Stay
Mara: Sit down. I want to tell you something.
Change trust + 1
End`;

function trace(src: string, picks: number[], facts: Facts = {}): string[] {
  const runner = createRunner(parseScript(src).steps, facts);
  const out: string[] = [];
  const queue = [...picks];
  for (let i = 0; i < 50; i++) {
    const ev: RunEvent = runner.next();
    if (ev.t === 'choice') { const k = queue.shift() ?? 0; out.push(`pick ${k}`); ev.pick(k); }
    else if (ev.t === 'say') out.push(`${ev.who || '-'}: ${ev.text}`);
    else { out.push(ev.t === 'door' ? `door ${ev.room}` : ev.problem ? `end! ${ev.problem}` : 'end'); break; }
  }
  return out;
}

describe('parts and jumps', () => {
  it('reads parts, jumps and notes without errors', () => {
    const { steps, errors } = parseScript(STORY);
    expect(errors).toEqual([]);
    expect(steps[0]).toEqual({ t: 'note', text: "Mara's first scene" });
    expect(summarize(steps).parts).toEqual(['Stay']);
  });

  it('jumps forward to a part and skips what lies between', () => {
    expect(trace(STORY, [0])).toEqual(['Mara: You came back.', 'pick 0', 'Mara: So did I.', 'Mara: Sit down. I want to tell you something.', 'end']);
  });

  it('falls through into a part when no jump is taken', () => {
    expect(trace(STORY, [1], { affection: 9 })).toEqual([
      'Mara: You came back.', 'pick 1', 'Mara: Of course you are.', 'Mara: Then again, maybe not.',
      '-: The lamps flicker.', 'Mara: Sit down. I want to tell you something.', 'end'
    ]);
  });

  it('can loop back to an earlier part', () => {
    const src = 'Part: Ask\nA: Again?\nChoice\n  "Yes"\n    Go to part Ask\n  "No"\n    End';
    expect(trace(src, [0, 0, 1])).toEqual(['A: Again?', 'pick 0', 'A: Again?', 'pick 0', 'A: Again?', 'pick 1', 'end']);
  });

  it('stops an endless loop that shows nothing and says why', () => {
    expect(trace('Part: A\nGo to part A', [])[0]).toMatch(/^end! .*loop/);
  });

  it('reports missing parts, duplicates and indented parts', () => {
    const { errors } = parseScript('Part: A\nPart: a\nChoice\n  "x"\n    Part: B\nGo to part Nowhere');
    expect(errors.map(e => [e.n, e.msg.slice(0, 22)])).toEqual([
      [2, 'There is already a par'], [5, 'A part starts at the l'], [6, 'There is no part calle']
    ]);
  });

  it('reads "Change of plans" as narration, not as a broken change', () => {
    const { steps, errors } = parseScript('Change of plans.\nNarration: Go to bed, she said.');
    expect(errors).toEqual([]);
    expect(steps).toEqual([
      { t: 'say', who: '', expr: '', text: 'Change of plans.' },
      { t: 'say', who: '', expr: '', text: 'Go to bed, she said.' }
    ]);
  });
});

describe('writeScript', () => {
  it('writes a parsed script back so it reads the same', () => {
    const first = parseScript(STORY).steps;
    const text = writeScript(first);
    expect(parseScript(text)).toEqual({ steps: first, errors: [] });
    expect(writeScript(parseScript(text).steps)).toBe(text);
  });

  it('keeps narration that looks like a command as narration', () => {
    const steps: Step[] = [{ t: 'say', who: '', expr: '', text: 'Go to bed, she said.' }, { t: 'say', who: '', expr: '', text: 'End' }];
    const text = writeScript(steps);
    expect(text).toBe('Narration: Go to bed, she said.\nNarration: End');
    expect(parseScript(text).steps).toEqual(steps);
  });

  it('cleans names and answers that would break the script', () => {
    const text = writeScript([
      { t: 'say', who: 'Dr. (Who): x', expr: '', text: 'Line one\nline two' },
      { t: 'choice', options: [{ text: 'Say "hi"', effects: [], steps: [] }] }
    ]);
    expect(text).toBe(`Dr. Who x: Line one line two\nChoice\n  "Say 'hi'"`);
    expect(parseScript(text).errors).toEqual([]);
  });

  it('writes a negative amount as taking away', () => {
    expect(writeScript([{ t: 'change', effects: [{ fact: 'trust', op: '+', value: -2 }] }])).toBe('Change trust - 2');
  });

  it('writes conditions in words', () => {
    const text = writeScript([{ t: 'if', cond: { fact: 'gold', op: '<', value: 3 }, then: [{ t: 'end' }], else: [{ t: 'end' }] }]);
    expect(text).toBe('Only if gold is less than 3\n  End\nOtherwise\n  End');
  });
});

describe('paths', () => {
  const steps = parseScript(STORY).steps;

  it('finds steps under answers and conditions', () => {
    expect(getStep(steps, '2.o0.0')).toMatchObject({ t: 'say', text: 'So did I.' });
    expect(getStep(steps, '2.o1.1.e.0')).toEqual({ t: 'door', room: 'Street, night' });
    expect(getList(steps, '2.o1.1.t')).toHaveLength(1);
  });

  it('returns null for paths that do not exist', () => {
    expect(getList(steps, '1.o0')).toBeNull();
    expect(getStep(steps, '2.o9.0')).toBeNull();
  });

  it('splits and joins step paths', () => {
    expect(splitPath('2.o1.3')).toEqual({ list: '2.o1', index: 3 });
    expect(splitPath('4')).toEqual({ list: '', index: 4 });
    expect(stepPathOf('', 4)).toBe('4');
    expect(stepPathOf('2.o1', 3)).toBe('2.o1.3');
  });
});
