import { parseScript, summarize } from './script';
import { elementConds, talkedFact } from './project';
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
    for (const c of elementConds(e)) set.add(c.fact);
  }
  for (const c of p.characters) for (const f of c.facts ?? []) set.add(f.fact);
  // What panel buttons change or check.
  for (const pn of p.panels ?? []) for (const b of pn.blocks) if (b.kind === 'button') summarize(parseScript(b.script).steps).facts.forEach(f => set.add(f));
  return [...set].sort();
}
