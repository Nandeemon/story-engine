import type { ChoiceOption, Condition, DoorStep, Effect, Facts, FactValue, SayStep, Step } from './types';

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

export function testCondition(facts: Facts, c: Condition): boolean {
  const a = getFact(facts, c.fact);
  const b = c.value;
  switch (c.op) {
    case '>=': return a >= b;
    case '<=': return a <= b;
    case '>': return a > b;
    case '<': return a < b;
    case '!=': return String(a) !== String(b);
    case '=': return String(a) === String(b);
    case 'truthy': return Boolean(a);
  }
}

/** Steps a conversation may take without showing anything before it counts as an endless loop. */
const LOOP_LIMIT = 10_000;

/**
 * Runs a conversation step by step. Facts are changed in place, so every
 * conversation in a playthrough shares the same story facts.
 */
export function createRunner(steps: Step[], facts: Facts): Runner {
  const stack: { steps: Step[]; i: number }[] = [{ steps, i: 0 }];
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
