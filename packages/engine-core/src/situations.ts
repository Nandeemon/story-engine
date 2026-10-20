import { testCondition } from './runner';
import { renameQuestInCondition, renameQuestInScript, renameStageInCondition, renameStageInScript, type CondContext } from './quests';
import type { Backdrop, Condition, Facts, Project, Room, Situation, StoryElement } from './types';

/**
 * Conversations per room thing, and situations per room: one room and one thing
 * can serve many moments of the story without copies.
 */

const allHold = (conds: Condition[] | undefined, facts: Facts, ctx?: CondContext) => (conds ?? []).every(c => testCondition(facts, c, ctx));

/** Every script on a room thing: its conversations in order, then its own script (the fallback). */
export function elementScripts(e: StoryElement): string[] {
  return [...(e.convos ?? []).map(c => c.script), e.script];
}

/** Changes every script on a room thing in place. */
export function mapElementScripts(e: StoryElement, change: (script: string) => string): void {
  for (const c of e.convos ?? []) c.script = change(c.script);
  e.script = change(e.script);
}

/** How saves and memory name a conversation: "<elementId>" for the fallback, "<elementId>:<convoId>" for the others. */
export function conversationKey(e: StoryElement, convoId?: string): string {
  return convoId ? `${e.id}:${convoId}` : e.id;
}

/** The script a conversation key names, or undefined when it is gone. */
export function scriptByKey(e: StoryElement, key: string): string | undefined {
  if (key === e.id) return e.script;
  const id = key.startsWith(`${e.id}:`) ? key.slice(e.id.length + 1) : '';
  return e.convos?.find(c => c.id === id)?.script;
}

/**
 * The conversation that runs when the thing is clicked now: the first of its
 * conversations whose conditions all hold, else its own script. Conversations
 * not written yet are skipped. Null when nothing would run.
 */
export function pickConversation(e: StoryElement, facts: Facts, ctx?: CondContext): { id: string; script: string } | null {
  for (const c of e.convos ?? []) if (c.script.trim() && allHold(c.conds, facts, ctx)) return { id: conversationKey(e, c.id), script: c.script };
  return e.script.trim() ? { id: e.id, script: e.script } : null;
}

/** The room's situations whose conditions all hold now, in list order. */
export function activeSituations(room: Room, facts: Facts, ctx?: CondContext): Situation[] {
  return (room.situations ?? []).filter(s => allHold(s.conds, facts, ctx));
}

/** Whether the thing belongs in the room given the situations: its own situation is active, and none it hides in is. */
export function inSituation(e: StoryElement, active: Situation[]): boolean {
  if (e.situation && !active.some(s => s.id === e.situation)) return false;
  return !(e.hideIn ?? []).some(id => active.some(s => s.id === id));
}

/** The backdrop and music a room has now: those of the latest active situation that sets them, else the room's own. */
export function roomSetting(room: Room, active: Situation[]): { bg: Backdrop | null; music?: string } {
  let bg = room.bg, music = room.music;
  for (const s of active) {
    if (s.bg) bg = s.bg;
    if (s.music) music = s.music;
  }
  return { bg, ...(music ? { music } : {}) };
}

/** Every stored condition in a project (thing, conversation, situation and panel conditions), for renames and Check. */
export function forEachStoredCondition(p: Project, visit: (c: Condition, set: (c: Condition) => void) => void): void {
  const list = (arr: Condition[] | undefined) => arr?.forEach((c, i) => visit(c, n => { arr[i] = n; }));
  for (const r of p.rooms) {
    for (const s of r.situations ?? []) list(s.conds);
    for (const e of r.els) {
      if (e.cond) visit(e.cond, n => { e.cond = n; });
      list(e.andConds);
      for (const c of e.convos ?? []) list(c.conds);
    }
  }
  for (const pn of p.panels ?? []) {
    if (pn.cond) visit(pn.cond, n => { pn.cond = n; });
    for (const b of pn.blocks) if (b.cond) visit(b.cond, n => { b.cond = n; });
  }
}

/** Every script in a project: room things' conversations and panel buttons. */
export function mapProjectScripts(p: Project, change: (script: string) => string): void {
  for (const r of p.rooms) for (const e of r.els) mapElementScripts(e, change);
  for (const pn of p.panels ?? []) for (const b of pn.blocks) if (b.kind === 'button') b.script = change(b.script);
}

/** Renames a quest and keeps every script and condition pointing at it. */
export function renameQuest(p: Project, oldName: string, newName: string): void {
  const q = (p.quests ?? []).find(x => x.name === oldName);
  if (!q || !newName.trim()) return;
  q.name = newName.trim();
  mapProjectScripts(p, s => renameQuestInScript(s, oldName, q.name));
  forEachStoredCondition(p, (c, set) => set(renameQuestInCondition(c, oldName, q.name)));
}

/** Renames one stage of a quest and keeps every script and condition pointing at it. */
export function renameStage(p: Project, quest: string, oldStage: string, newStage: string): void {
  const q = (p.quests ?? []).find(x => x.name === quest);
  const i = q ? q.stages.indexOf(oldStage) : -1;
  if (!q || i < 0 || !newStage.trim()) return;
  q.stages[i] = newStage.trim();
  mapProjectScripts(p, s => renameStageInScript(s, quest, oldStage, q.stages[i]));
  forEachStoredCondition(p, (c, set) => set(renameStageInCondition(c, quest, oldStage, q.stages[i])));
}
