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
