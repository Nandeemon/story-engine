import { parseScript, summarize } from './script';
import { elementConds, talkedFact } from './project';
import { elementScripts } from './situations';
import { questFact } from './quests';
import type { Project } from './types';

/**
 * Every story fact in a project: those used in conversations, those the author
 * keeps track of on characters, and "talked.<name>" for each character who
 * has a conversation. Sorted, for pick lists.
 */
export function storyFactNames(p: Project): string[] {
  const set = new Set<string>();
  for (const r of p.rooms) for (const e of r.els) {
    for (const script of elementScripts(e)) summarize(parseScript(script).steps).facts.forEach(f => set.add(f));
    if (e.kind === 'char' && elementScripts(e).some(x => x.trim())) set.add(talkedFact(e.name));
    for (const c of elementConds(e)) set.add(c.fact);
    for (const cv of e.convos ?? []) for (const c of cv.conds) set.add(c.fact);
  }
  for (const r of p.rooms) for (const st of r.situations ?? []) for (const c of st.conds) set.add(c.fact);
  for (const q of p.quests ?? []) set.add(questFact(q.name));
  for (const c of p.characters) for (const f of c.facts ?? []) set.add(f.fact);
  // What panel buttons change or check.
  for (const pn of p.panels ?? []) for (const b of pn.blocks) if (b.kind === 'button') summarize(parseScript(b.script).steps).facts.forEach(f => set.add(f));
  return [...set].sort();
}
