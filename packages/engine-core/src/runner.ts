import type { ChoiceOption, Condition, DoorStep, Effect, Facts, FactValue, MusicStep, SayStep, StageStep, Step } from './types';

export interface ChoiceEvent {
  t: 'choice';
  options: ChoiceOption[];
  /** Pick an answer by index. Applies its changes and continues under it. */
  pick(index: number): void;
}
export interface EndEvent {
  t: 'end';
  /** Set when the conversation stopped because of a mistake in the story, for the author to see. */
  problem?: string;
}

/** What the player sees next. */
export type RunEvent = SayStep | ChoiceEvent | DoorStep | EndEvent;

export interface Runner {
  next(): RunEvent;
}

export function getFact(facts: Facts, fact: string): FactValue {
  return fact in facts ? facts[fact] : 0;
}

export function applyEffects(facts: Facts, effects: Effect[]): void {
  for (const e of effects) {
    if (e.op === '=') facts[e.fact] = e.value;
    else facts[e.fact] = (Number(getFact(facts, e.fact)) || 0) + (e.op === '+' ? 1 : -1) * (Number(e.value) || 0);
  }
}

/** Equality that treats yes/no sensibly: an unset fact (0) is "no", and yes equals 1. */
function same(a: FactValue, b: FactValue): boolean {
  if (typeof b === 'boolean') return Boolean(a) === b;
  if (typeof a === 'boolean') return typeof b === 'number' ? Number(a) === b : String(a) === String(b);
  return String(a) === String(b);
}

export function testCondition(facts: Facts, c: Condition): boolean {
  const a = getFact(facts, c.fact);
  const b = c.value;
  switch (c.op) {
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '<': return a < b;
    case '!=': return !same(a, b);
    case '=': return same(a, b);
    case 'truthy': return Boolean(a);
  }
}

/** Steps a conversation may take without showing anything before it counts as an endless loop. */
const LOOP_LIMIT = 10_000;

/**
 * Runs a conversation step by step. Facts are changed in place, so every
 * conversation in a playthrough shares the same story facts.
 */
export function createRunner(steps: Step[], facts: Facts, onStage?: (step: StageStep | MusicStep) => void, startAt?: string): Runner {
  const stack: { steps: Step[]; i: number }[] = startAt ? framesFor(steps, startAt) : [{ steps, i: 0 }];
  return {
    next(): RunEvent {
      let quiet = 0;
      while (stack.length) {
        if (++quiet > LOOP_LIMIT) {
          stack.length = 0;
          return { t: 'end', problem: 'This conversation goes round in a loop without showing a line. Check its "Go to part" steps.' };
        }
        const frame = stack[stack.length - 1];
        if (frame.i >= frame.steps.length) { stack.pop(); continue; }
        const s = frame.steps[frame.i++];
        switch (s.t) {
          case 'say': return s;
          case 'choice':
            return {
              t: 'choice',
              options: s.options,
              pick(k: number) {
                const o = s.options[k];
                if (!o) return;
                applyEffects(facts, o.effects);
                stack.push({ steps: o.steps, i: 0 });
              }
            };
          case 'if': stack.push({ steps: testCondition(facts, s.cond) ? s.then : s.else, i: 0 }); continue;
          case 'change': applyEffects(facts, s.effects); continue;
          case 'jump': {
            const key = s.part.trim().toLowerCase();
            const at = steps.findIndex(x => x.t === 'part' && x.name.trim().toLowerCase() === key);
            stack.length = 0;
            if (at < 0) return { t: 'end', problem: `There is no part called "${s.part}" in this conversation.` };
            stack.push({ steps, i: at + 1 });
            continue;
          }
          case 'show':
          case 'move':
          case 'hide':
          case 'mark':
          case 'loop':
          case 'music': onStage?.(s); continue;
          case 'part':
          case 'note': continue;
          case 'door': stack.length = 0; return s;
          case 'end': stack.length = 0; return { t: 'end' };
        }
      }
      return { t: 'end' };
    }
  };
}

/**
 * The runner's position at a step, as if the conversation had just arrived there:
 * every list on the way continues after the answer or condition that holds it.
 */
function framesFor(root: Step[], path: string): { steps: Step[]; i: number }[] {
  const parts = path.split('.');
  const frames: { steps: Step[]; i: number }[] = [];
  let list: Step[] = root;
  for (let k = 0; k < parts.length; k += 2) {
    const idx = Number(parts[k]);
    if (k + 1 >= parts.length) { frames.push({ steps: list, i: idx }); break; }
    frames.push({ steps: list, i: idx + 1 });
    const step = list[idx], branch = parts[k + 1];
    if (step?.t === 'choice') list = step.options[Number(branch.slice(1))]?.steps ?? [];
    else if (step?.t === 'if') list = branch === 't' ? step.then : step.else;
    else break;
  }
  return frames;
}
