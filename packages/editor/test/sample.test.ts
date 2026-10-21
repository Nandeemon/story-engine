import { describe, expect, it } from 'vitest';
import { normalizeProject, parseScript, elementScripts } from '@story-engine/engine-core';
import { sampleProject } from '../src/sample';
import { findProblems } from '../src/problems';

describe('the sample story', () => {
  it('loads unchanged through normalizeProject', () => {
    const p = sampleProject();
    const n = normalizeProject(JSON.parse(JSON.stringify(p)));
    expect(n).not.toBeNull();
    expect(n!.rooms.map(r => r.name)).toEqual(p.rooms.map(r => r.name));
    expect(n!.quests).toEqual(p.quests);
    for (const [i, r] of p.rooms.entries()) {
      expect(n!.rooms[i].situations ?? []).toEqual(r.situations ?? []);
      expect(n!.rooms[i].els.map(e => [e.id, e.situation, e.hideIn, e.convos?.length])).toEqual(r.els.map(e => [e.id, e.situation, e.hideIn, e.convos?.length]));
    }
    expect(n!.panels?.length).toBe(p.panels?.length);
    expect(n!.items).toEqual(p.items);
  });

  it('has scripts that all parse', () => {
    for (const r of sampleProject().rooms) for (const e of r.els) for (const sc of elementScripts(e)) {
      expect(parseScript(sc).errors, `${r.name} › ${e.name}`).toEqual([]);
    }
  });

  it('passes Check with no errors or warnings', () => {
    const p = normalizeProject(JSON.parse(JSON.stringify(sampleProject())))!;
    const problems = findProblems(p);
    expect(problems.filter(x => x.level === 'error')).toEqual([]);
    expect(problems.filter(x => x.level === 'warning')).toEqual([]);
  });
});
