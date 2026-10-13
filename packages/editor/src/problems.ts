/**
 * Checking the whole story: every problem the author would otherwise only find by
 * playing, with a way to jump straight to it.
 */
import { findRoomByName, parseScript, summarize, unreachableSteps, walkSteps, walkWithPaths } from '@story-engine/engine-core';
import type { FactValue, Project } from '@story-engine/engine-core';
import { missingLook, stageText, unknownSpeaker } from './map';

export interface Problem {
  /** error: the story will not play as written; warning: probably a mistake; note: worth a look. */
  level: 'error' | 'warning' | 'note';
  roomId: string;
  elId?: string;
  /** The step in the conversation, when there is one. */
  path?: string;
  /** Script line, for problems the map cannot show. */
  line?: number;
  where: string;
  text: string;
}

export function findProblems(p: Project): Problem[] {
  const out: Problem[] = [];
  const doorsTo = new Set<string>();
  for (const room of p.rooms) {
    for (const el of room.els) {
      if (!el.script.trim()) continue;
      const where = `${room.name} › ${el.name}`;
      const base = { roomId: room.id, elId: el.id, where };
      const { steps, errors } = parseScript(el.script);
      for (const e of errors) out.push({ ...base, level: 'error', line: e.n, text: `Line ${e.n}: ${e.msg}` });
      if (errors.length) continue;
      const ctx = { project: p, room };
      walkWithPaths(steps, (s, path) => {
        if (s.t === 'door') {
          doorsTo.add(s.room.trim().toLowerCase());
          if (!findRoomByName(p, s.room)) out.push({ ...base, level: 'error', path, text: `"Go to ${s.room}": there is no room with that name.` });
        }
        if (s.t === 'say' && s.expr && missingLook(p, room, s.who, s.expr)) out.push({ ...base, level: 'warning', path, text: `${s.who} has no look called "${s.expr}", so the base picture shows.` });
        if ((s.t === 'show' || s.t === 'move' || s.t === 'hide') && unknownSpeaker(ctx, s.who)) out.push({ ...base, level: 'error', path, text: `"${stageText(s)}": there is no character called ${s.who}.` });
        if (s.t === 'say' && unknownSpeaker(ctx, s.who)) out.push({ ...base, level: 'note', path, text: `"${s.who}" has no character, so this line is a voice without a picture.` });
      });
      for (const path of unreachableSteps(steps)) out.push({ ...base, level: 'warning', path, text: 'Never reached: every way to this step has ended before it.' });
    }
  }
  p.rooms.forEach((room, i) => {
    if (i > 0 && !doorsTo.has(room.name.trim().toLowerCase())) out.push({ level: 'warning', roomId: room.id, where: room.name, text: 'No conversation leads here, so the player cannot reach this room.' });
  });
  const order = { error: 0, warning: 1, note: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** Every story fact used anywhere, for the test values. */
export function storyFacts(p: Project): string[] {
  const set = new Set<string>();
  for (const r of p.rooms) for (const e of r.els) summarize(parseScript(e.script).steps).facts.forEach(f => set.add(f));
  return [...set].sort();
}

/** What kind of value a fact holds, guessed from how the story uses it. */
export function factKind(p: Project, fact: string): 'number' | 'yesno' | 'word' {
  let kind: 'number' | 'yesno' | 'word' = 'number';
  const see = (v: FactValue) => { if (typeof v === 'boolean') kind = 'yesno'; else if (typeof v === 'string' && kind === 'number') kind = 'word'; };
  for (const r of p.rooms) for (const e of r.els) walkSteps(parseScript(e.script).steps, s => {
    if (s.t === 'change') s.effects.filter(x => x.fact === fact).forEach(x => see(x.value));
    if (s.t === 'choice') s.options.forEach(o => o.effects.filter(x => x.fact === fact).forEach(x => see(x.value)));
    if (s.t === 'if' && s.cond.fact === fact) { if (s.cond.op === 'truthy') kind = 'yesno'; else see(s.cond.value); }
  });
  return kind;
}
