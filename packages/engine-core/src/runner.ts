import type { AskStep, ChoiceOption, Condition, DoorStep, Effect, Facts, FactValue, MusicStep, SayStep, SoundStep, StageStep, Step } from './types';

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
  /** Set when the story reached one of its endings. */
  ending?: string;
}
/** The player is asked to type an answer. */
export interface AskEvent {
  t: 'ask';
  prompt: string;
  fact: string;
  answer(value: string): void;
}

/** What the player sees next. */
export type RunEvent = SayStep | ChoiceEvent | DoorStep | EndEvent | AskEvent;

/**
 * What the runner remembers across conversations: answers picked that are "once",
 * and how far "in turn" lines have come. Keys are prefixed by the caller (the element).
 */
export interface RunMemory { picked: string[]; turns: Record<string, number> }

/** Where a runner is, so the player can go back a line. */
export type RunnerPlace = { steps: Step[]; i: number }[];

export interface Runner {
  next(): RunEvent;
  /** Where the runner is now, to come back to with restore. */
  place(): RunnerPlace;
  restore(place: RunnerPlace): void;
}

/** Puts story facts into a line: "You have {gold} coins". An unset fact shows as nothing. */
export function fillText(text: string, facts: Facts): string {
  return text.replace(/\{([\w.]+)\}/g, (_, f: string) => (f in facts ? (facts[f] === true ? 'yes' : facts[f] === false ? 'no' : String(facts[f])) : ''));
}

/** The text of a line this time: its own, or one of its other ways to say it. */
export function lineText(s: SayStep, memory: RunMemory | undefined, key: string): string {
  if (!s.alts?.length) return s.text;
  const all = [s.text, ...s.alts];
  if (s.altMode === 'turn') {
    const turns = memory?.turns ?? {};
    const n = turns[key] ?? 0;
    turns[key] = n + 1;
    return all[Math.min(n, all.length - 1)];
  }
  return all[Math.floor(Math.random() * all.length)];
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
export function createRunner(steps: Step[], facts: Facts, onStage?: (step: StageStep | MusicStep | SoundStep) => void, startAt?: string, memory?: RunMemory, prefix = ''): Runner {
  const stack: { steps: Step[]; i: number }[] = startAt ? framesFor(steps, startAt) : [{ steps, i: 0 }];
  const optKey = (o: ChoiceOption) => `${prefix}|${o.text}`;
  return {
    place: () => stack.map(f => ({ ...f })),
    restore(place) { stack.length = 0; place.forEach(f => stack.push({ ...f })); },
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
          case 'say': {
            if (!s.alts?.length && !/\{[\w.]+\}/.test(s.text)) return s;
            const text = fillText(lineText(s, memory, `${prefix}|${s.text}`), facts);
            return { ...s, text };
          }
          case 'choice': {
            // Answers picked before that were "once" are gone; fallbacks show only when nothing else is left.
            const open = s.options.filter(o => !(o.once && memory?.picked.includes(optKey(o))));
            const main = open.filter(o => !o.fallback);
            const shown = main.length ? main : open;
            if (!shown.length) continue;
            return {
              t: 'choice',
              options: shown.map(o => ({ ...o, text: fillText(o.text, facts) })),
              pick(k: number) {
                const o = shown[k];
                if (!o) return;
                if (o.once && memory && !memory.picked.includes(optKey(o))) memory.picked.push(optKey(o));
                applyEffects(facts, o.effects);
                stack.push({ steps: o.steps, i: 0 });
              }
            };
          }
          case 'ask': {
            const step: AskStep = s;
            return { t: 'ask', prompt: fillText(step.prompt, facts), fact: step.fact, answer(v: string) { const t = v.trim(); facts[step.fact] = /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : t; } };
          }
          case 'ending': stack.length = 0; return { t: 'end', ending: s.name };
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
          case 'path':
          case 'camera':
          case 'music': case 'sound': onStage?.(s); continue;
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
