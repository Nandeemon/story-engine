import type { Condition, Facts, FactValue, Project, Quest } from './types';

/**
 * Quests: a name and an ordered list of stages. A quest's stage is kept in the
 * story fact "quest.<slug>" as the stage's name; an unset fact means the first stage.
 */

export const DEFAULT_STAGES = ['Not started', 'Started', 'Done'];

/** What conditions need to know beyond the facts: the story's quests. */
export interface CondContext { quests?: Quest[] }

const lower = (s: string) => s.trim().toLowerCase();

/** The quest's part of its story fact: "Lost cat" is "lost_cat". */
export function questSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\W/g, '_');
}

/** The story fact a quest's stage is kept in: "quest.lost_cat". */
export function questFact(name: string): string {
  return `quest.${questSlug(name)}`;
}

type QuestSource = Project | Quest[] | CondContext | undefined;
const questsOf = (src: QuestSource): Quest[] => (Array.isArray(src) ? src : src?.quests ?? []);

/** The quest with this name (case and punctuation as in its story fact do not matter). */
export function findQuest(src: QuestSource, name: string): Quest | undefined {
  const slug = questSlug(name);
  return questsOf(src).find(q => questSlug(q.name) === slug);
}

/** The index of a stage in a quest, by name in any case; -1 when it has no such stage. */
export function stageIndex(q: Quest, stage: string): number {
  const key = lower(stage);
  return q.stages.findIndex(s => lower(s) === key);
}

/** The quest's stage right now: the fact's value, or the first stage when it is unset. */
export function questStage(src: QuestSource, facts: Facts, name: string): string {
  const q = findQuest(src, name);
  const v = facts[questFact(name)];
  if (typeof v === 'string' && v) return q ? q.stages[stageIndex(q, v)] ?? v : v;
  return q?.stages[0] ?? '';
}

/** A new quest with a name no other quest has, and the default stages. */
export function newQuest(project: Project, name = 'New quest'): Quest {
  let n = name.trim() || 'New quest', k = 2;
  const base = n;
  while (findQuest(project, n)) n = `${base} ${k++}`;
  return { id: Math.random().toString(36).slice(2, 9), name: n, stages: [...DEFAULT_STAGES] };
}

/** A quest condition from its parts. */
export function questCondition(quest: string, op: '=' | '!=' | '>=' | '<', stage: string): Condition {
  return { fact: questFact(quest), op, value: stage, quest };
}

/** Whether a quest condition holds. Ordering follows the quest's stages; without the quest only is / is not can hold. */
export function testQuestCondition(facts: Facts, c: Condition, ctx?: CondContext): boolean {
  const q = findQuest(ctx, c.quest ?? '');
  const raw: FactValue | undefined = facts[c.fact];
  const now = typeof raw === 'string' && raw ? raw : q?.stages[0] ?? '';
  const want = String(c.value);
  if (c.op === '=' || c.op === '!=') return (lower(now) === lower(want)) === (c.op === '=');
  if (!q) return false;
  const a = stageIndex(q, now), b = stageIndex(q, want);
  if (a < 0 || b < 0) return false;
  switch (c.op) {
    case '>=': return a >= b;
    case '>': return a > b;
    case '<': return a < b;
    case '<=': return a <= b;
    default: return false;
  }
}

/* ---------- Renames in script text ---------- */

const QUEST_STEP = /^(\s*quest\s+)([^:"()]+?)(\s*:\s*)(.+?)\s*$/i;
/** "Only if quest <name> is <words> <stage>", the condition at the end of the line. */
const QUEST_COND = /^(\s*only if\s+quest\s+)(.+?)(\s+is\s+(?:not\s+|at least\s+|before\s+)?)(.+?)\s*$/i;

/** Points "Quest <old>: …" steps and "Only if quest <old> is …" conditions at the quest's new name. */
export function renameQuestInScript(script: string, oldName: string, newName: string): string {
  const from = questSlug(oldName), to = newName.trim();
  if (!from || !to || oldName.trim() === to) return script;
  return script.split('\n').map(line => {
    const m = line.match(QUEST_STEP) ?? line.match(QUEST_COND);
    return m && questSlug(m[2]) === from ? `${m[1]}${to}${m[3]}${m[4]}` : line;
  }).join('\n');
}

/** Renames one stage of a quest in its "Quest …: <stage>" steps and "Only if quest … is <stage>" conditions. */
export function renameStageInScript(script: string, quest: string, oldStage: string, newStage: string): string {
  const q = questSlug(quest), from = lower(oldStage), to = newStage.trim();
  if (!q || !from || !to || oldStage.trim() === to) return script;
  return script.split('\n').map(line => {
    const m = line.match(QUEST_STEP) ?? line.match(QUEST_COND);
    return m && questSlug(m[2]) === q && lower(m[4]) === from ? `${m[1]}${m[2]}${m[3]}${to}` : line;
  }).join('\n');
}

/** Renames a quest in a stored condition. */
export function renameQuestInCondition(c: Condition, oldName: string, newName: string): Condition {
  if (!c.quest || questSlug(c.quest) !== questSlug(oldName)) return c;
  return { ...c, quest: newName.trim(), fact: questFact(newName) };
}

/** Renames a stage in a stored condition on that quest. */
export function renameStageInCondition(c: Condition, quest: string, oldStage: string, newStage: string): Condition {
  if (!c.quest || questSlug(c.quest) !== questSlug(quest) || lower(String(c.value)) !== lower(oldStage)) return c;
  return { ...c, value: newStage.trim() };
}
