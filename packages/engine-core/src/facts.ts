import { parseScript, summarize } from './script';
import { talkedFact } from './project';
import type { Project } from './types';

/**
 * Every story fact in a project: those used in conversations, those the author
 * keeps track of on characters, and "talked.<name>" for each character who
 * has a conversation. Sorted, for pick lists.
 */
export function storyFactNames(p: Project): string[] {
  const set = new Set<string>();
  for (const r of p.rooms) for (const e of r.els) {
    summarize(parseScript(e.script).steps).facts.forEach(f => set.add(f));
    if (e.kind === 'char' && e.script.trim()) set.add(talkedFact(e.name));
    if (e.cond) set.add(e.cond.fact);
  }
  for (const c of p.characters) for (const f of c.facts ?? []) set.add(f.fact);
  return [...set].sort();
}
