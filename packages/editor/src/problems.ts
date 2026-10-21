/**
 * Checking the whole story: every problem the author would otherwise only find by
 * playing, with a way to jump straight to it.
 */
import { conditionText, elementConds, elementScripts, findQuest, mapProjectScripts, questFact, stageIndex, storyFactNames, talkedFact, findRoomByName, getStep, parseScript, summarize, unreachableSteps, walkSteps, walkWithPaths, writeScript } from '@story-engine/engine-core';
import type { Condition, FactValue, Project, StoryElement } from '@story-engine/engine-core';
import { missingLook, stageText, unknownSpeaker } from './map';
import { findMark } from '@story-engine/runtime';

export interface Problem {
  /** error: the story will not play as written; warning: probably a mistake; note: worth a look. */
  level: 'error' | 'warning' | 'note';
  roomId: string;
  elId?: string;
  /** One of the thing's conversations (its id in convos); left out for its own script. */
  convo?: string;
  /** The step in the conversation, when there is one. */
  path?: string;
  /** Script line, for problems the map cannot show. */
  line?: number;
  /** Shown on the thing in its room rather than in its conversation. */
  inRoom?: boolean;
  /** An on-screen display item, shown in Look. */
  hud?: string;
  /** An interface panel in Look. */
  panel?: string;
  /** A situation of the room, shown with its chip on. */
  situation?: string;
  /** A quest the problem is about, by id; '' when the quest does not exist (Check then offers the Quests page). */
  quest?: string;
  where: string;
  text: string;
  /** A room still being built (changed in the last few minutes): shown as a grey note, not a problem. */
  unfinished?: boolean;
  /** A one-click fix the Check page can offer. door-in: make a door to this room from another room. */
  fix?: 'door-in';
}

/** fresh: ids of rooms changed in the last few minutes, which are not flagged for having no way in or on yet. */
export function findProblems(p: Project, fresh: ReadonlySet<string> = new Set()): Problem[] {
  const out: Problem[] = [];
  const problemsOut: Problem[] = [];
  const doorsTo = new Set<string>();
  for (const room of p.rooms) {
    for (const el of room.els) for (const cv of conversationsOf(el)) {
      if (!cv.script.trim()) continue;
      const where = `${room.name} › ${el.name}${cv.label ? ` › ${cv.label}` : ''}`;
      const base = { roomId: room.id, elId: el.id, ...(cv.id ? { convo: cv.id } : {}), where };
      const { steps, errors } = parseScript(cv.script);
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
        if (s.t === 'quest') { const q = questProblem(p, s.quest, s.stage); if (q) out.push({ ...base, level: 'error', path, quest: findQuest(p, s.quest)?.id ?? '', text: `"Quest ${s.quest}: ${s.stage}": ${q}` }); }
        if (s.t === 'if' && s.cond.quest) { const q = questProblem(p, s.cond.quest, String(s.cond.value)); if (q) out.push({ ...base, level: 'error', path, quest: findQuest(p, s.cond.quest)?.id ?? '', text: `"Only if ${conditionText(s.cond)}": ${q}` }); }
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
    if (i > 0 && !doorsTo.has(room.name.trim().toLowerCase())) {
      const unfinished = fresh.has(room.id);
      out.push({ level: unfinished ? 'note' : 'warning', unfinished: unfinished || undefined, fix: 'door-in', roomId: room.id, where: room.name, text: 'Nothing leads here yet (no door, area or conversation).' });
    }
  });
  const used = new Set(storyFacts(p));
  const sounds = new Set((p.sounds ?? []).map(x => x.name.toLowerCase()));
  // Facts a conversation changes or checks, or the author keeps track of (not counting room conditions themselves).
  const scripted = new Set<string>();
  for (const r of p.rooms) for (const e of r.els) for (const sc of elementScripts(e)) summarize(parseScript(sc).steps).facts.forEach(f => scripted.add(f));
  for (const c of p.characters) for (const f of c.facts ?? []) scripted.add(f.fact);
  for (const r of p.rooms) for (const e of r.els) if (e.kind === 'char' && elementScripts(e).some(sc => sc.trim())) scripted.add(talkedFact(e.name));
  out.push(...questAndSituationProblems(p));
  for (const room of p.rooms) if (room.music && room.music !== 'off' && !sounds.has(room.music.toLowerCase())) out.push({ level: 'warning', roomId: room.id, where: room.name, text: `The room's music "${room.music}" is not among your music.` });
  for (const room of p.rooms) for (const el of room.els) {
    const base = { roomId: room.id, elId: el.id, where: `${room.name} › ${el.name}` };
    for (const c of elementConds(el)) if (!c.quest && !scripted.has(c.fact)) out.push({ ...base, inRoom: true, level: 'warning', text: `${el.name} is only ${el.kind === 'area' ? 'clickable' : 'in the room'} while "${c.fact}" says so, but no conversation changes or checks "${c.fact}", so ${el.name} may never ${el.kind === 'area' ? 'work' : 'show'}.` });
    if (el.sound && !sounds.has(el.sound.toLowerCase())) out.push({ ...base, inRoom: true, level: 'warning', text: `The sound "${el.sound}" played on click is not among your sounds.` });
    for (const cv of conversationsOf(el)) walkWithPaths(parseScript(cv.script).steps, (st, path) => {
      const base = { roomId: room.id, elId: el.id, ...(cv.id ? { convo: cv.id } : {}), where: `${room.name} › ${el.name}${cv.label ? ` › ${cv.label}` : ''}` };
      if (st.t === 'say' && st.sound && !sounds.has(st.sound.toLowerCase())) out.push({ ...base, level: 'warning', path, text: `The sound "${st.sound}" is not among your sounds. Add it under Pictures & sounds, or pick another.` });
      for (const mk of st.t === 'say' ? st.marks ?? [] : st.t === 'mark' && st.mark ? [st.mark] : []) {
        if (!findMark(p, mk)) out.push({ ...base, level: 'warning', path, text: `There is no mark called "${mk}". Add it under Pictures & sounds, or pick another.` });
      }
      if (st.t === 'panel' && !(p.panels ?? []).some(x => x.name.toLowerCase() === st.name.trim().toLowerCase())) out.push({ ...base, level: 'warning', path, text: `There is no panel called "${st.name}". Make it under Look › Interface, or pick another.` });
      if (st.t === 'sound' && st.name && !sounds.has(st.name.toLowerCase())) out.push({ ...base, level: 'warning', path, text: `The sound "${st.name}" is not among your sounds. Add it under Pictures & sounds, or pick another.` });
      if (st.t === 'music' && st.track && !sounds.has(st.track.toLowerCase())) out.push({ ...base, level: 'warning', path, text: `The music "${st.track}" is not among your music. Add it under Pictures & sounds, or pick another.` });
    });
  }
  for (const w of p.hud ?? []) {
    if (!used.has(w.fact)) out.push({ level: 'warning', roomId: p.rooms[0]?.id ?? '', hud: w.id, where: 'Look › On-screen display', text: `"${w.text || w.fact}" shows the story fact "${w.fact}", but no conversation changes or checks it.` });
  }
  for (const pn of p.panels ?? []) {
    const at = { roomId: p.rooms[0]?.id ?? '', panel: pn.id, where: `Look › Interface › ${pn.name}` };
    for (const b of pn.blocks) {
      if ((b.kind === 'number' || b.kind === 'meter') && !used.has(b.fact)) out.push({ ...at, level: 'warning', text: `"${b.label || b.fact}" shows the story fact "${b.fact}", but no conversation changes or checks it.` });
      if (b.kind === 'button') { const e = parseScript(b.script).errors[0]; if (e) out.push({ ...at, level: 'error', text: `The button "${b.label}": line ${e.n} needs fixing. ${e.msg}` }); }
    }
    if (pn.when === 'rooms' && !pn.rooms?.length) out.push({ ...at, level: 'warning', text: 'It shows only in some rooms, but no room is ticked, so it never shows.' });
    if (pn.startHidden && !pn.key && !pn.button && !p.rooms.some(r => r.els.some(e => new RegExp(`^\\s*show\\s+panel\\s+${pn.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im').test(elementScripts(e).join('\n'))))) out.push({ ...at, level: 'warning', text: 'It is hidden at the start, and neither the player nor any conversation can show it.' });
  }
  // Rooms with no way on: no Go to and no ending in anything there.
  if (p.rooms.length > 1) for (const room of p.rooms) {
    let out = false;
    for (const el of room.els) for (const sc of elementScripts(el)) walkSteps(parseScript(sc).steps, st => { if ((st.t === 'door' && findRoomByName(p, st.room) !== room) || st.t === 'ending') out = true; });
    if (!out) problemsOut.push(fresh.has(room.id)
      ? { level: 'note', unfinished: true, roomId: room.id, where: room.name, text: 'Nothing here leads on yet (no door, area or conversation goes to another room or an ending).' }
      : { level: 'warning', roomId: room.id, where: room.name, text: 'Nothing here leads to another room or to an ending, so a player who gets here is stuck.' });
  }
  // Facts that are changed but never tested or shown.
  const changed = new Set<string>(), tested = new Set<string>();
  for (const r of p.rooms) for (const el of r.els) {
    for (const c of elementConds(el)) tested.add(c.fact);
    if (el.hover) for (const m of el.hover.matchAll(/\{([\w.]+)\}/g)) tested.add(m[1]);
    for (const cv of el.convos ?? []) for (const c of cv.conds) tested.add(c.fact);
    for (const sc of elementScripts(el)) for (const m of sc.matchAll(/\{([\w.]+)\}/g)) tested.add(m[1]);
    for (const sc of elementScripts(el)) walkSteps(parseScript(sc).steps, st => {
      if (st.t === 'change') st.effects.forEach(e => changed.add(e.fact));
      if (st.t === 'choice') st.options.forEach(o => o.effects.forEach(e => changed.add(e.fact)));
      if (st.t === 'ask') changed.add(st.fact);
      if (st.t === 'if') tested.add(st.cond.fact);
    });
  }
  for (const w of p.hud ?? []) tested.add(w.fact);
  for (const r of p.rooms) for (const st of r.situations ?? []) for (const c of st.conds) tested.add(c.fact);
  for (const pn of p.panels ?? []) {
    if (pn.cond) tested.add(pn.cond.fact);
    for (const b of pn.blocks) {
      if (b.cond) tested.add(b.cond.fact);
      if (b.kind === 'number' || b.kind === 'meter') tested.add(b.fact);
      if (b.kind === 'text') for (const m of b.text.matchAll(/\{([\w.]+)\}/g)) tested.add(m[1]);
      if (b.kind === 'list') for (const f of changed) if (f.toLowerCase().startsWith(b.prefix.toLowerCase())) tested.add(f);
      if (b.kind === 'button') walkSteps(parseScript(b.script).steps, st => { if (st.t === 'change') st.effects.forEach(e => changed.add(e.fact)); if (st.t === 'if') tested.add(st.cond.fact); });
    }
  }
  for (const f of changed) if (!tested.has(f)) problemsOut.push({ level: 'note', roomId: p.rooms[0]?.id ?? '', where: 'Story facts', text: `"${f}" is changed, but nothing checks it with Only if, shows it, or puts it in a line, so it makes no difference yet.` });
  // A room that starts a conversation with something that may not be there.
  for (const room of p.rooms) {
    const auto = room.auto && room.autoEl ? room.els.find(e => e.id === room.autoEl) : undefined;
    if (auto?.cond) problemsOut.push({ level: 'warning', roomId: room.id, elId: auto.id, inRoom: true, where: `${room.name} › ${auto.name}`, text: `The room starts ${auto.name}'s conversation, but ${auto.name} is only there when "${auto.cond.fact}" says so; otherwise nothing starts.` });
  }
  out.push(...problemsOut);
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
  for (const r of p.rooms) for (const e of r.els) for (const sc of elementScripts(e)) walkSteps(parseScript(sc).steps, s => {
    if (s.t === 'change') s.effects.filter(x => x.fact === fact).forEach(x => see(x.value));
    if (s.t === 'choice') s.options.forEach(o => o.effects.filter(x => x.fact === fact).forEach(x => see(x.value)));
    if (s.t === 'if' && s.cond.fact === fact) { if (s.cond.op === 'truthy') kind = 'yesno'; else see(s.cond.value); }
  });
  return kind;
}

/** A thing's conversations, then its own script (id and label left empty). */
function conversationsOf(el: StoryElement): { id: string; label: string; script: string }[] {
  return [...(el.convos ?? []).map(c => ({ id: c.id, label: c.label || 'Conversation', script: c.script })), { id: '', label: el.convos?.length ? 'Otherwise' : '', script: el.script }];
}

/** What is wrong with a quest and stage name, in plain words; '' when both exist. */
function questProblem(p: Project, quest: string, stage: string): string {
  const q = findQuest(p, quest);
  if (!q) return `there is no quest called "${quest}". Add it under Quests, or pick another.`;
  if (stageIndex(q, stage) < 0) return `the quest "${q.name}" has no stage called "${stage}". Its stages are ${q.stages.join(', ')}.`;
  return '';
}

/**
 * Quest names in stored conditions, situations that can never be active, and
 * things that belong to a situation that is gone.
 */
function questAndSituationProblems(p: Project): Problem[] {
  const out: Problem[] = [];
  const first = p.rooms[0]?.id ?? '';
  // Stages each quest can reach: its first one, and every stage a Quest step sets.
  const reached = new Map<string, Set<number>>();
  const changed = new Set<string>();
  for (const q of p.quests ?? []) reached.set(questFact(q.name), new Set([0]));
  for (const c of p.characters) for (const f of c.facts ?? []) if (f.start !== undefined) changed.add(f.fact);
  mapProjectScripts(p, sc => {
    walkSteps(parseScript(sc).steps, st => {
      if (st.t === 'quest') { const q = findQuest(p, st.quest); if (q) reached.get(questFact(q.name))?.add(stageIndex(q, st.stage)); }
      if (st.t === 'change') st.effects.forEach(e => changed.add(e.fact));
      if (st.t === 'choice') st.options.forEach(o => o.effects.forEach(e => changed.add(e.fact)));
      if (st.t === 'ask') changed.add(st.fact);
    });
    return sc;
  });
  for (const r of p.rooms) for (const e of r.els) if (e.kind === 'char' && elementScripts(e).some(sc => sc.trim())) changed.add(talkedFact(e.name));
  /** Why a condition can never hold, or ''. */
  const never = (c: Condition): string => {
    if (c.quest) {
      const q = findQuest(p, c.quest);
      if (!q) return '';
      const can = [...(reached.get(questFact(q.name)) ?? [])].filter(i => i >= 0);
      const b = stageIndex(q, String(c.value));
      const ok = can.some(a => c.op === '=' ? a === b : c.op === '!=' ? a !== b : c.op === '>=' ? a >= b : c.op === '<' ? a < b : true);
      if (ok) return '';
      return can.length <= 1 ? `the quest "${q.name}" is never set past "${q.stages[0]}"` : `no Quest step sets "${q.name}" so that "${conditionText(c)}" holds`;
    }
    return changed.has(c.fact) || c.fact.startsWith('panel.') ? '' : `nothing changes "${c.fact}"`;
  };
  const badQuest = (conds: (Condition | undefined)[], at: Omit<Problem, 'level' | 'text'>) => {
    for (const c of conds) {
      const q = c?.quest ? questProblem(p, c.quest, String(c.value)) : '';
      if (q) out.push({ ...at, level: 'error', quest: findQuest(p, c!.quest!)?.id ?? '', text: `"${conditionText(c!)}": ${q}` });
    }
  };
  for (const pn of p.panels ?? []) badQuest([pn.cond, ...pn.blocks.map(b => b.cond)], { roomId: first, panel: pn.id, where: `Look › Interface › ${pn.name}` });
  for (const room of p.rooms) {
    for (const st of room.situations ?? []) badQuest(st.conds, { roomId: room.id, situation: st.id, where: `${room.name} › ${st.name}` });
    for (const el of room.els) {
      badQuest(elementConds(el), { roomId: room.id, elId: el.id, inRoom: true, where: `${room.name} › ${el.name}` });
      for (const cv of el.convos ?? []) badQuest(cv.conds, { roomId: room.id, elId: el.id, convo: cv.id, where: `${room.name} › ${el.name} › ${cv.label || 'Conversation'}` });
    }
    for (const st of room.situations ?? []) {
      const why = st.conds.map(never).find(Boolean);
      const qc = st.conds.find(c => c.quest && never(c));
      if (why) out.push({ level: 'warning', roomId: room.id, situation: st.id, ...(qc ? { quest: findQuest(p, qc.quest!)?.id ?? '' } : {}), where: `${room.name} › ${st.name}`, text: `The situation "${st.name}" can never happen: ${why}.` });
    }
    for (const el of room.els) {
      if (el.situation && !(room.situations ?? []).some(st => st.id === el.situation)) out.push({ level: 'warning', roomId: room.id, elId: el.id, inRoom: true, where: `${room.name} › ${el.name}`, text: `${el.name} belongs to a situation that was deleted, so it never shows.` });
    }
  }
  return out;
}
