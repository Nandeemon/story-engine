import type { Step } from './types';

/**
 * Addresses for steps inside a conversation, so an editor can point at "the second
 * line under the first answer" and change it.
 *
 * A list path names a list of steps: "" is the top level, "3.o1" is the steps under
 * answer 1 of step 3, "3.t" and "3.e" are the steps under an "Only if" and its
 * "Otherwise". A step path is a list path plus an index: "3.o1.0", or "5" at the top.
 */
export type ListPath = string;
export type StepPath = string;

export function getList(root: Step[], path: ListPath): Step[] | null {
  if (!path) return root;
  const parts = path.split('.');
  let list: Step[] = root;
  for (let i = 0; i < parts.length; i += 2) {
    const step = list[Number(parts[i])];
    const branch = parts[i + 1];
    if (!step || branch === undefined) return null;
    if (step.t === 'choice' && branch.startsWith('o')) {
      const option = step.options[Number(branch.slice(1))];
      if (!option) return null;
      list = option.steps;
    } else if (step.t === 'if' && (branch === 't' || branch === 'e')) {
      list = branch === 't' ? step.then : step.else;
    } else {
      return null;
    }
  }
  return list;
}

/** Splits a step path into the list it sits in and its index there. */
export function splitPath(path: StepPath): { list: ListPath; index: number } {
  const parts = path.split('.');
  return { list: parts.slice(0, -1).join('.'), index: Number(parts[parts.length - 1]) };
}

export function stepPathOf(list: ListPath, index: number): StepPath {
  return list ? `${list}.${index}` : String(index);
}

export function getStep(root: Step[], path: StepPath): Step | null {
  const { list, index } = splitPath(path);
  return getList(root, list)?.[index] ?? null;
}

/**
 * The steps passed on the way to a step, in order, following its branch. Steps
 * inside answers or conditions that lie before it on other branches are not
 * included (only the choice or condition itself), since the way through them
 * depends on the player.
 */
export function stepsBefore(root: Step[], path: StepPath): Step[] {
  const parts = path.split('.');
  const out: Step[] = [];
  let list: Step[] = root;
  for (let i = 0; i < parts.length; i += 2) {
    const idx = Number(parts[i]);
    out.push(...list.slice(0, idx));
    if (i + 1 >= parts.length) break;
    const step = list[idx], branch = parts[i + 1];
    if (step?.t === 'choice') list = step.options[Number(branch.slice(1))]?.steps ?? [];
    else if (step?.t === 'if') list = branch === 't' ? step.then : step.else;
    else break;
  }
  return out;
}

/** Visits every step with its path. */
export function walkWithPaths(steps: Step[], visit: (s: Step, path: StepPath) => void, list: ListPath = ''): void {
  steps.forEach((s, i) => {
    const path = stepPathOf(list, i);
    visit(s, path);
    if (s.t === 'choice') s.options.forEach((o, k) => walkWithPaths(o.steps, visit, `${path}.o${k}`));
    if (s.t === 'if') { walkWithPaths(s.then, visit, `${path}.t`); walkWithPaths(s.else, visit, `${path}.e`); }
  });
}

const TERMINAL = new Set(['door', 'end', 'jump']);

/** True when every way through a list of steps ends it (End, Go to, Go to part). */
function alwaysEnds(list: Step[]): boolean {
  for (const s of list) {
    if (TERMINAL.has(s.t)) return true;
    if (s.t === 'choice' && s.options.length && s.options.every(o => alwaysEnds(o.steps))) return true;
    if (s.t === 'if' && alwaysEnds(s.then) && alwaysEnds(s.else)) return true;
  }
  return false;
}

/**
 * Steps no playthrough can reach, because every way to them has ended before.
 * Only the first such step of each run is listed. A part counts as reachable
 * when a "Go to part" points at it.
 */
export function unreachableSteps(root: Step[]): StepPath[] {
  const jumped = new Set<string>();
  walkWithPaths(root, s => { if (s.t === 'jump') jumped.add(s.part.trim().toLowerCase()); });
  const out: StepPath[] = [];
  const scan = (list: Step[], lp: ListPath): void => {
    let open = true;
    let reported = false;
    list.forEach((s, i) => {
      const path = stepPathOf(lp, i);
      if (s.t === 'part') { open = open || jumped.has(s.name.trim().toLowerCase()); reported = false; }
      if (!open) {
        if (!reported) { out.push(path); reported = true; }
        return;
      }
      if (s.t === 'choice') s.options.forEach((o, k) => scan(o.steps, `${path}.o${k}`));
      if (s.t === 'if') { scan(s.then, `${path}.t`); scan(s.else, `${path}.e`); }
      if (TERMINAL.has(s.t) || ((s.t === 'choice' || s.t === 'if') && alwaysEnds([s]))) open = false;
    });
  };
  scan(root, '');
  return out;
}
