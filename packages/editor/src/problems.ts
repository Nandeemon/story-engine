/**
 * Checking the whole story: every problem the author would otherwise only find by
 * playing, with a way to jump straight to it.
 */
import { storyFactNames, talkedFact, findRoomByName, getStep, parseScript, summarize, unreachableSteps, walkSteps, walkWithPaths, writeScript } from '@story-engine/engine-core';
import type { FactValue, Project } from '@story-engine/engine-core';
import { missingLook, stageText, unknownSpeaker } from './map';
import { findMark } from '@story-engine/runtime';

export interface Problem {
  /** error: the story will not play as written; warning: probably a mistake; note: worth a look. */
  level: 'error' | 'warning' | 'note';
  roomId: string;
  elId?: string;
  /** The step in the conversation, when there is one. */
  path?: string;
  /** Script line, for problems the map cannot show. */
  line?: number;
  /** Shown on the thing in its room rather than in its conversation. */
  inRoom?: boolean;
  /** An on-screen display item, shown in Look. */
  hud?: string;
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
        if ((s.t === 'show' || s.t === 'move' || s.t === 'hide' || s.t === 'mark' || s.t === 'loop') && unknownSpeaker(ctx, s.who)) out.push({ ...base, level: 'error', path, text: `"${stageText(s)}": there is no character called ${s.who}.` });
        if (s.t === 'say' && unknownSpeaker(ctx, s.who)) out.push({ ...base, level: 'note', path, text: `"${s.who}" has no character, so this line is a voice without a picture.` });
      });
      for (const path of unreachableSteps(steps)) {
        const st = getStep(steps, path);
        const line = st ? (writeScript([st]).split('\n')[0] ?? '').trim() : '';
        const quote = line.length > 60 ? `${line.slice(0, 57)}…` : line;
        out.push({ ...base, level: 'warning', path, text: `${quote ? `"${quote}" is never reached` : 'Never reached'}: every way to this step has ended before it.` });
      }
    }
  }
  p.rooms.forEach((room, i) => {
    if (i > 0 && !doorsTo.has(room.name.trim().toLowerCase())) out.push({ level: 'warning', roomId: room.id, where: room.name, text: 'No conversation leads here, so the player cannot reach this room.' });
  });
  const used = new Set(storyFacts(p));
  const sounds = new Set((p.sounds ?? []).map(x => x.name.toLowerCase()));
  // Facts a conversation changes or checks, or the author keeps track of (not counting room conditions themselves).
  const scripted = new Set<string>();
  for (const r of p.rooms) for (const e of r.els) summarize(parseScript(e.script).steps).facts.forEach(f => scripted.add(f));
  for (const c of p.characters) for (const f of c.facts ?? []) scripted.add(f.fact);
  for (const r of p.rooms) for (const e of r.els) if (e.kind === 'char' && e.script.trim()) scripted.add(talkedFact(e.name));
  for (const room of p.rooms) if (room.music && room.music !== 'off' && !sounds.has(room.music.toLowerCase())) out.push({ level: 'warning', roomId: room.id, where: room.name, text: `The room's music "${room.music}" is not among your music.` });
  for (const room of p.rooms) for (const el of room.els) {
    const base = { roomId: room.id, elId: el.id, where: `${room.name} › ${el.name}` };
    if (el.cond && !scripted.has(el.cond.fact)) out.push({ ...base, inRoom: true, level: 'warning', text: `${el.name} is only in the room while "${el.cond.fact}" says so, but no conversation changes or checks "${el.cond.fact}", so ${el.name} may never show.` });
    if (el.sound && !sounds.has(el.sound.toLowerCase())) out.push({ ...base, inRoom: true, level: 'warning', text: `The sound "${el.sound}" played on click is not among your sounds.` });
    walkWithPaths(parseScript(el.script).steps, (st, path) => {
      if (st.t === 'say' && st.sound && !sounds.has(st.sound.toLowerCase())) out.push({ ...base, level: 'warning', path, text: `The sound "${st.sound}" is not among your sounds. Add it on the Story map, or pick another.` });
      for (const mk of st.t === 'say' ? st.marks ?? [] : st.t === 'mark' && st.mark ? [st.mark] : []) {
        if (!findMark(p, mk)) out.push({ ...base, level: 'warning', path, text: `There is no mark called "${mk}". Add it under Marks on the Story map, or pick another.` });
      }
      if (st.t === 'music' && st.track && !sounds.has(st.track.toLowerCase())) out.push({ ...base, level: 'warning', path, text: `The music "${st.track}" is not among your music. Add it on the Story map, or pick another.` });
    });
  }
  for (const w of p.hud ?? []) {
    if (!used.has(w.fact)) out.push({ level: 'warning', roomId: p.rooms[0]?.id ?? '', hud: w.id, where: 'Look › On-screen display', text: `"${w.text || w.fact}" shows the story fact "${w.fact}", but no conversation changes or checks it.` });
  }
  const order = { error: 0, warning: 1, note: 2 };
  return out.sort((a, b) => order[a.level] - order[b.level]);
}

/** Every story fact used anywhere, for the test values. */
export function storyFacts(p: Project): string[] {
  return storyFactNames(p);
}

/** What kind of value a fact holds, guessed from how the story uses it. */
export function factKind(p: Project, fact: string): 'number' | 'yesno' | 'word' {
  const def = p.characters.flatMap(c => c.facts ?? []).find(d => d.fact === fact);
  if (def) return def.kind === 'number' ? 'number' : def.kind === 'word' ? 'word' : 'yesno';
  let kind: 'number' | 'yesno' | 'word' = 'number';
  const see = (v: FactValue) => { if (typeof v === 'boolean') kind = 'yesno'; else if (typeof v === 'string' && kind === 'number') kind = 'word'; };
  for (const r of p.rooms) for (const e of r.els) walkSteps(parseScript(e.script).steps, s => {
    if (s.t === 'change') s.effects.filter(x => x.fact === fact).forEach(x => see(x.value));
    if (s.t === 'choice') s.options.forEach(o => o.effects.filter(x => x.fact === fact).forEach(x => see(x.value)));
    if (s.t === 'if' && s.cond.fact === fact) { if (s.cond.op === 'truthy') kind = 'yesno'; else see(s.cond.value); }
  });
  return kind;
}
