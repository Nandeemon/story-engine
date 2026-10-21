/**
 * One condition row, used everywhere a condition is edited: Only if in the map,
 * when a thing is in the room, when a panel shows, situations and conversations.
 *
 * The first field is the story fact, and it offers the story's quests too
 * ("quest: Lost cat"). Picking a quest turns the row into
 * [quest] [is / is not / is at least / is before] [stage].
 */
import { CONDITION_WORDS, QUEST_CONDITION_WORDS, resolveQuestCondition, findQuest, questCondition, stageIndex, storyFactNames, toValue, valueText } from '@story-engine/engine-core';
import type { CompareOp, Condition, Project } from '@story-engine/engine-core';
import { esc } from '@story-engine/runtime';

const FACT_OPS: [CompareOp, string][] = [...CONDITION_WORDS.map(([w, op]) => [op, w] as [CompareOp, string]), ['truthy', 'is yes']];
/** Quest words in the order they read best in a pick list. */
const QUEST_OPS: [CompareOp, string][] = (['=', '!=', '>=', '<'] as const).map(op => [op, QUEST_CONDITION_WORDS.find(([, o]) => o === op)![0]]);
const QUEST_PICK = /^\s*quest\s*:\s*(.+)$/i;

/** How a row's fields tell the page what they change: the attributes for one field. */
export type CondAttr = (field: 'fact' | 'op' | 'val' | 'quest' | 'stage') => string;

/** The suggestions for the fact field: quests first, then story facts (without the quests' own facts). */
export function condFactOptions(p: Project): string {
  const quests = (p.quests ?? []).map(q => `<option value="quest: ${esc(q.name)}">`);
  const facts = storyFactNames(p).filter(f => !f.startsWith('quest.')).map(f => `<option value="${esc(f)}">`);
  return quests.join('') + facts.join('');
}

/** One condition as a row of fields. id prefixes the field ids (so focus survives a redraw); remove is extra HTML at the end. */
export function condRow(p: Project, cond: Condition, id: string, attr: CondAttr, remove = ''): string {
  const c = resolveQuestCondition(cond, p);
  const opSel = (ops: [CompareOp, string][]) => `<select id="${id}-op" ${attr('op')} aria-label="Test">${ops.map(([op, w]) => `<option value="${op}"${op === c.op ? ' selected' : ''}>${w}</option>`).join('')}</select>`;
  if (c.quest) {
    const q = findQuest(p, c.quest);
    const quests = (p.quests ?? []).map(x => x.name);
    if (!q) quests.push(c.quest);
    const stages = q ? [...q.stages] : [];
    if (!q || stageIndex(q, String(c.value)) < 0) stages.push(String(c.value));
    const cur = q?.name ?? c.quest;
    return `<div class="condrow quest"><select id="${id}-quest" ${attr('quest')} aria-label="Quest">${quests.map(n => `<option${n === cur ? ' selected' : ''}>${esc(n)}</option>`).join('')}<option value="">A story fact instead…</option></select>
      ${opSel(QUEST_OPS)}
      <select id="${id}-stage" ${attr('stage')} aria-label="Stage">${stages.map(s => `<option${s.toLowerCase() === String(c.value).toLowerCase() ? ' selected' : ''}>${esc(s)}</option>`).join('')}</select>${remove}</div>`;
  }
  return `<div class="condrow"><input type="text" list="${id}-facts" id="${id}-fact" ${attr('fact')} value="${esc(c.fact)}" aria-label="Story fact or quest" placeholder="${p.quests?.length ? 'A story fact or a quest' : 'A story fact'}" autocomplete="off">
    <datalist id="${id}-facts">${condFactOptions(p)}</datalist>
    ${opSel(FACT_OPS)}
    ${c.op === 'truthy' ? '' : `<input type="text" id="${id}-val" ${attr('val')} value="${esc(valueText(c.value))}" aria-label="Value">`}${remove}</div>`;
}

/** A new condition: on the first quest when the story has quests, else on a story fact. */
export function freshCondition(p: Project): Condition {
  const q = p.quests?.[0];
  if (q) return questCondition(q.name, '=', q.stages[1] ?? q.stages[0]);
  return { fact: storyFactNames(p).find(f => !f.startsWith('quest.')) ?? 'met', op: '>=', value: 1 };
}

/**
 * Applies one field of a row. Returns the condition as it is now and whether
 * the row must be drawn again (it turned into a quest row, or back, or gained
 * or lost its value field).
 */
export function editCondition(p: Project, c: Condition, field: string, value: string): { cond: Condition; redraw: boolean } {
  if (field === 'fact') {
    const m = value.match(QUEST_PICK);
    const q = m ? findQuest(p, m[1]) : (p.quests ?? []).find(x => x.name.toLowerCase() === value.trim().toLowerCase() && !/^[\w.]+$/.test(value.trim()));
    if (q) return { cond: questCondition(q.name, '=', q.stages[1] ?? q.stages[0]), redraw: true };
    return { cond: { ...c, fact: value.trim().replace(/[^\w.]/g, '_') || 'fact' }, redraw: false };
  }
  if (field === 'quest') {
    if (!value) return { cond: { fact: storyFactNames(p).find(f => !f.startsWith('quest.')) ?? 'met', op: '>=', value: 1 }, redraw: true };
    const q = findQuest(p, value);
    if (!q) return { cond: c, redraw: false };
    const keep = stageIndex(q, String(c.value)) >= 0 ? q.stages[stageIndex(q, String(c.value))] : q.stages[0];
    const op = (['=', '!=', '>=', '<'] as const).find(o => o === c.op) ?? '=';
    return { cond: questCondition(q.name, op, keep), redraw: true };
  }
  if (field === 'stage') return { cond: { ...c, value }, redraw: false };
  if (field === 'op') {
    const op = value as CompareOp;
    if (c.quest) return { cond: { ...c, op }, redraw: false };
    const was = c.op === 'truthy';
    const next: Condition = { ...c, op };
    if (op === 'truthy') next.value = true; else if (typeof c.value === 'boolean') next.value = 1;
    return { cond: next, redraw: was !== (op === 'truthy') };
  }
  if (field === 'val') return { cond: { ...c, value: toValue(/^\s*-?\d+,\d+\s*$/.test(value) ? value.replace(',', '.') : value) }, redraw: false };
  return { cond: c, redraw: false };
}

/**
 * A list of conditions that must all hold, with "and" between them, a way to
 * add one, and (with label) an Always / Only if… switch in front. scope names
 * the list for the page: every field carries data-cond, data-ci and data-cf.
 */
export function condList(p: Project, scope: string, conds: Condition[], opts: { label?: string; max?: number; hint?: string } = {}): string {
  const attr = (i: number): CondAttr => f => `data-cond="${esc(scope)}" data-ci="${i}" data-cf="${f}"`;
  const id = `cond-${scope.replace(/[^\w-]/g, '_')}`;
  const rows = conds.map((c, i) => `${i ? '<span class="and">and</span>' : ''}${condRow(p, c, `${id}-${i}`, attr(i), conds.length > 1 || !opts.label ? `<button class="btn small quiet" data-act="cond-remove" data-k="${esc(scope)}|${i}" aria-label="Remove this condition">✕</button>` : '')}`).join('');
  const add = conds.length < (opts.max ?? 99) ? `<button class="btn small quiet" data-act="cond-add" data-k="${esc(scope)}">${conds.length ? '+ And another' : '+ Only if…'}</button>` : '';
  const sw = opts.label ? `<select id="${id}-on" data-cond-on="${esc(scope)}" aria-label="${esc(opts.label)}"><option value=""${conds.length ? '' : ' selected'}>Always</option><option value="on"${conds.length ? ' selected' : ''}>Only if…</option></select>` : '';
  const body = opts.label && !conds.length ? '' : `${rows}${add}${opts.hint && conds.length ? `<p class="hint">${opts.hint}</p>` : ''}`;
  return `<div class="field condfield">${opts.label ? `<span>${esc(opts.label)}</span>` : ''}${sw}${body}</div>`;
}
