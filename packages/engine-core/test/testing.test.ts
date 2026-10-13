import { describe, expect, it } from 'vitest';
import { createRunner, parseScript, unreachableSteps } from '../src';
import type { Facts } from '../src';

const SRC = `A: one
Choice
  "x"
    A: under x
    Only if gold is at least 5
      A: rich
  "y"
    End
A: after
Go to part P
A: never
Part: P
A: end`;

describe('starting partway', () => {
  it('starts at a line and carries on after the answer that holds it', () => {
    const facts: Facts = { gold: 9 };
    const r = createRunner(parseScript(SRC).steps, facts, undefined, '1.o0.1.t.0');
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) { const ev = r.next(); if (ev.t === 'say') seen.push(ev.text); else break; }
    expect(seen).toEqual(['rich', 'after', 'end']);
  });
});

describe('unreachableSteps', () => {
  it('finds lines after an ending, but not a part that is jumped to', () => {
    expect(unreachableSteps(parseScript(SRC).steps)).toEqual(['4']);
  });

  it('finds lines after a choice whose answers all end', () => {
    const steps = parseScript('Choice\n  "a"\n    End\n  "b"\n    Go to Hall\nA: lost\nA: also lost').steps;
    expect(unreachableSteps(steps)).toEqual(['1']);
  });
});
