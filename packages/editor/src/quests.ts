/**
 * Quests, situations and conversations per figure, as the editor shows them:
 * the Quests page with an overview per stage, the situation chips over the room
 * stage, and the conversation tabs of a figure.
 */
import { activeSituations, conditionText, elementConds, findQuest, parseScript, questSlug, roomSetting, startFacts, walkSteps, walkWithPaths } from '@story-engine/engine-core';
import type { Condition, Conversation, Facts, Project, Quest, Room, Situation, StoryElement } from '@story-engine/engine-core';
import { backdropHTML, esc, present } from '@story-engine/runtime';
import { condList } from './conds';
import { musicSelect } from './widgets';

/* ---------- Places a link can open ---------- */

/** Where a link goes: a room (optionally a thing, a situation, a conversation and a step), a panel in Look, or a quest. */
export interface Place { room?: string; el?: string; sit?: string; convo?: string; path?: string; panel?: string; quest?: string }
export const placeKey = (x: Place) => [x.room, x.el, x.sit, x.convo, x.path, x.panel, x.quest === undefined ? '' : `@${x.quest}`].map(v => v ?? '').join('|');
export function parsePlace(k: string): Place {
  const [room, el, sit, convo, path, panel, quest] = k.split('|');
  const out: Place = {};
  if (room) out.room = room;
  if (el) out.el = el;
  if (sit) out.sit = sit;
  if (convo) out.convo = convo;
  if (path) out.path = path;
  if (panel) out.panel = panel;
  if (quest?.startsWith('@')) out.quest = quest.slice(1);
  return out;
}
const openBtn = (x: Place, label = 'Open') => `<button class="btn small quiet" data-act="open-place" data-k="${esc(placeKey(x))}">${label}</button>`;

/** A thing's conversations, then its own script ("Otherwise"). */
export function conversationsOf(el: StoryElement): { id: string; label: string; conds: Condition[]; script: string }[] {
  return [...(el.convos ?? []).map(c => ({ id: c.id, label: convoLabel(c), conds: c.conds, script: c.script })), { id: '', label: el.convos?.length ? 'Otherwise' : '', conds: [], script: el.script }];
}

/** A conversation's name: its label, or when it runs. */
export function convoLabel(c: Conversation): string {
  return c.label.trim() || (c.conds.length ? `When ${c.conds.map(conditionText).join(' and ')}` : 'Always');
}

const condsText = (conds: Condition[]) => conds.map(conditionText).join(' and ');
const lines = (script: string) => { let n = 0; walkSteps(parseScript(script).steps, s => { if (s.t === 'say') n++; }); return n; };

/* ---------- Quests page ---------- */

interface Use { where: string; text?: string; at: Place }
interface StageUses { sets: Use[]; needs: Use[] }

/** For each stage of a quest (by lower-case name): what moves the quest there, and what depends on it. */
export function questUses(p: Project, q: Quest): Map<string, StageUses> {
  const out = new Map<string, StageUses>();
  const slug = questSlug(q.name);
  const at = (stage: string) => { const k = stage.trim().toLowerCase(); if (!out.has(k)) out.set(k, { sets: [], needs: [] }); return out.get(k)!; };
  const mine = (c: Condition | undefined): c is Condition => !!c?.quest && questSlug(c.quest) === slug;
  const need = (c: Condition, where: string, place: Place) => at(String(c.value)).needs.push({ where, text: conditionText(c), at: place });
  for (const r of p.rooms) {
    for (const st of r.situations ?? []) for (const c of st.conds) if (mine(c)) need(c, `${r.name} › situation ${st.name}`, { room: r.id, sit: st.id });
    for (const e of r.els) {
      for (const c of elementConds(e)) if (mine(c)) need(c, `${r.name} › ${e.name}${e.kind === 'area' ? ' (clickable)' : ' (in the room)'}`, { room: r.id, el: e.id, sit: e.situation });
      for (const cv of conversationsOf(e)) {
        const where = `${r.name} › ${e.name}${cv.label ? ` › ${cv.label}` : ''}`;
        for (const c of cv.conds) if (mine(c)) need(c, `${r.name} › ${e.name} › ${cv.label} (when it runs)`, { room: r.id, el: e.id, convo: cv.id || undefined });
        walkWithPaths(parseScript(cv.script).steps, (s, path) => {
          if (s.t === 'quest' && questSlug(s.quest) === slug) at(s.stage).sets.push({ where, at: { room: r.id, el: e.id, convo: cv.id || undefined, path } });
          if (s.t === 'if' && mine(s.cond)) need(s.cond, `${where} › Only if`, { room: r.id, el: e.id, convo: cv.id || undefined, path });
        });
      }
    }
  }
  for (const pn of p.panels ?? []) {
    if (mine(pn.cond)) need(pn.cond, `Look › ${pn.name}`, { panel: pn.id });
    for (const b of pn.blocks) {
      if (mine(b.cond)) need(b.cond, `Look › ${pn.name} › a block`, { panel: pn.id });
      if (b.kind === 'button') walkSteps(parseScript(b.script).steps, s => {
        if (s.t === 'quest' && questSlug(s.quest) === slug) at(s.stage).sets.push({ where: `Look › ${pn.name} › ${b.label || 'button'}`, at: { panel: pn.id } });
        if (s.t === 'if' && mine(s.cond)) need(s.cond, `Look › ${pn.name} › ${b.label || 'button'}`, { panel: pn.id });
      });
    }
  }
  return out;
}

function useList(list: Use[], empty: string): string {
  if (!list.length) return `<p class="hint">${empty}</p>`;
  return `<ul class="qlist">${list.map(u => `<li><span>${esc(u.where)}${u.text ? ` <i>${esc(u.text)}</i>` : ''}</span>${openBtn(u.at)}</li>`).join('')}</ul>`;
}

export function viewQuests(p: Project, sel: string | null): string {
  const quests = p.quests ?? [];
  const q = quests.find(x => x.id === sel) ?? quests[0];
  const list = quests.map(x => `<button class="qitem${x === q ? ' on' : ''}" data-act="quest-open" data-k="${esc(x.id)}"${x === q ? ' aria-current="true"' : ''}><b>${esc(x.name)}</b><span>${x.stages.map(esc).join(' → ')}</span></button>`).join('');
  const head = `<div class="maphead"><div><h2>Quests</h2><p class="hint">A quest moves through stages, such as Not started → Started → Done. Rooms, figures and conversations can depend on where it is, so one room serves the whole story.</p></div>
    <div class="row"><button class="btn play" data-act="quest-add">+ Quest</button></div></div>`;
  if (!q) return `<div class="side home questpage">${head}<p class="allgood">No quests yet. Add one, then move it on in a conversation with the step "Move a quest on".</p></div>`;
  const uses = questUses(p, q);
  const stages = q.stages.map((s, i) => `<div class="qstage" data-qrow="${i}"><span class="qhandle" data-qdrag="${i}" title="Drag to change the order" aria-hidden="true">⋮⋮</span><span class="qnum">${i + 1}</span>
      <input type="text" id="q-stage-${i}" data-in="q-stage" data-k="${i}" value="${esc(s)}" aria-label="Stage ${i + 1}">
      <button class="btn small quiet micon" data-act="q-stage-move" data-k="${i}|-1" aria-label="Move up" title="Move up"${i ? '' : ' disabled'}>↑</button><button class="btn small quiet micon" data-act="q-stage-move" data-k="${i}|1" aria-label="Move down" title="Move down"${i < q.stages.length - 1 ? '' : ' disabled'}>↓</button>
      <button class="btn small quiet micon danger" data-act="q-stage-del" data-k="${i}" aria-label="Remove this stage" data-confirm="Remove?"${q.stages.length > 1 ? '' : ' disabled'}>✕</button></div>`).join('');
  const known = new Set(q.stages.map(s => s.toLowerCase()));
  const overview = q.stages.map((s, i) => {
    const u = uses.get(s.toLowerCase()) ?? { sets: [], needs: [] };
    return `<section class="qover"><h3><span class="qnum">${i + 1}</span>${esc(s)}</h3>
      <div class="label">Moved here by</div>${i === 0 && !u.sets.length ? '<p class="hint">Every player starts here.</p>' : useList(u.sets, 'Nothing yet. Add "Move a quest on" to a conversation.')}
      <div class="label">Depends on it</div>${useList(u.needs, 'Nothing depends on this stage yet.')}</section>`;
  }).join('');
  const strays = [...uses].filter(([k]) => !known.has(k));
  const stray = strays.length ? `<section class="qover bad"><h3>Not a stage of ${esc(q.name)}</h3><p class="hint">These use a stage this quest does not have. Check lists them too.</p>${useList(strays.flatMap(([, u]) => [...u.sets, ...u.needs]), '')}</section>` : '';
  return `<div class="side home questpage">${head}
    <div class="qgrid"><nav class="qnav" aria-label="Quests">${list}</nav>
    <div class="qdetail">
      <label class="titlefield"><span class="sr">Quest name</span><input type="text" id="q-name" data-in="q-name" data-k="${esc(q.id)}" value="${esc(q.name)}" aria-label="Quest name"></label>
      <div class="field"><span>Stages, in order</span><div class="qstages">${stages}</div>
        <div class="row"><button class="btn small" data-act="q-stage-add">+ Stage</button></div>
        <p class="hint">The first stage is where the quest starts. Renaming a stage updates every step and condition that uses it.</p></div>
      <div class="label">Overview</div>
      ${overview}${stray}
      <div class="row"><button class="btn small danger" data-act="quest-delete" data-confirm="Steps and conditions that use it will need fixing. Click again">Delete this quest</button></div>
    </div></div></div>`;
}

/* ---------- Situations in the room editor ---------- */

/** Test values as story facts, on top of the start values. */
export function testState(p: Project, values: Record<string, string>): Facts {
  const out: Facts = { ...startFacts(p) };
  for (const [k, v] of Object.entries(values)) {
    if (v === '') continue;
    out[k] = v === 'yes' ? true : v === 'no' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  }
  return out;
}

export interface RoomShow {
  /** The room as the stage draws it: the backdrop and things of the situation shown. */
  room: Room;
  /** Things drawn faint: not there with the test values. */
  faint: Set<string>;
  /** Situations active with the test values. */
  active: Set<string>;
}

/**
 * What the stage shows. With test values: everything, with what the player
 * would not see drawn faint. In a situation: the room's own things minus those
 * hidden in it, plus its own. Otherwise ("Always"): the room's own things.
 */
export function roomShow(p: Project, r: Room, sit: Situation | undefined, test: Facts | null): RoomShow {
  if (test) {
    const active = activeSituations(r, test, p);
    const progress = { facts: test, seen: [], quests: p.quests };
    return { room: { ...r, bg: roomSetting(r, active).bg }, faint: new Set(r.els.filter(e => !present(e, progress, r)).map(e => e.id)), active: new Set(active.map(s => s.id)) };
  }
  const els = sit ? r.els.filter(e => e.situation === sit.id || (!e.situation && !(e.hideIn ?? []).includes(sit.id))) : r.els.filter(e => !e.situation);
  return { room: { ...r, bg: sit ? roomSetting(r, [sit]).bg : r.bg, els }, faint: new Set(), active: new Set() };
}

/** The chips above the stage: Always · each situation · + Situation, and the test values switch. Only the author sees it. */
export function situationBar(r: Room, sit: Situation | undefined, show: RoomShow, testOn: boolean): string {
  const sits = r.situations ?? [];
  const chip = (id: string, name: string, on: boolean, active = false) => `<button class="sitchip${on ? ' on' : ''}${active ? ' live' : ''}" data-act="sit-pick" data-k="${esc(id)}" aria-pressed="${on}"${active ? ' title="Active with the test values"' : ''}>${esc(name)}</button>`;
  const hidden = show.faint.size;
  return `<div class="sitbar"><div class="sitchips" role="toolbar" aria-label="Situation shown">${chip('', 'Always', !sit && !testOn)}${sits.map(s => chip(s.id, s.name, sit?.id === s.id && !testOn, testOn && show.active.has(s.id))).join('')}<button class="sitchip add" data-act="sit-add" title="The same room at another moment of the story: night, after the fire…">+ Situation</button></div>
    <div class="sittest"><label class="check"><input type="checkbox" id="stage-test" data-in="stage-test"${testOn ? ' checked' : ''}><span>Test values</span></label>
      ${testOn ? `<span class="hint">${hidden ? `${hidden} faint: not there now.` : 'Everyone is there.'} <button class="linkbtn" data-act="test-edit">Change values</button></span>` : ''}
      <span class="onlyyou">Only you see this</span></div></div>`;
}

/** The situation's own panel, when nothing in the room is selected. */
export function situationPanel(p: Project, r: Room, s: Situation): string {
  const own = r.els.filter(e => e.situation === s.id).length;
  const hid = r.els.filter(e => e.hideIn?.includes(s.id)).length;
  return `<label class="titlefield"><span class="sr">Situation name</span><input type="text" id="sit-name" data-in="sit-name" value="${esc(s.name)}" aria-label="Situation name"></label>
    <div class="field"><span>Happens while</span>${condList(p, 'sit', s.conds)}<p class="hint">${s.conds.length ? 'The room looks like this while all of these hold.' : 'With no condition, it is always on.'}</p></div>
    <div class="addrow" role="group" aria-label="Add to this situation"><span>Add</span>
      <button class="btn small" data-act="adding" data-k="char">+ Character</button><button class="btn small" data-act="adding" data-k="object">+ Object</button><button class="btn small" data-act="add-area">+ Clickable area</button></div>
    <p class="hint">${own ? `${own} ${own === 1 ? 'thing is' : 'things are'} only here. ` : ''}${hid ? `${hid} of the room's things ${hid === 1 ? 'is' : 'are'} hidden here. ` : ''}What you add now shows only in ${esc(s.name)}. Click one of the room's things to hide it here.</p>
    <details class="more" id="sit-more"><summary>More</summary><div>
      <div class="field"><span>Backdrop</span><div class="bgpick">
        <button class="bgthumb" data-act="sit-bg" title="Another backdrop in this situation">${s.bg ? backdropHTML(s.bg) : r.bg ? backdropHTML(r.bg) : '<i>None</i>'}</button>
        <button class="btn small" data-act="sit-bg">${s.bg ? 'Change' : 'Use another'}</button>${s.bg ? '<button class="btn small quiet" data-act="sit-bg-clear">Use the room\'s</button>' : ''}</div></div>
      <div class="field"><span>Music</span>${musicSelect(p, 'sit-music', 'data-in="sit-music"', s.music ?? '', [['', 'As in the room'], ['off', 'Silence']])}</div>
      <p class="hint">When several situations are on at once, the one furthest right decides the backdrop and music.</p>
      <button class="btn small danger" data-act="sit-delete" data-confirm="${own ? `Also removes ${own} ${own === 1 ? 'thing' : 'things'} only in it. Click again` : 'Click again to delete'}">Delete this situation</button>
    </div></details>`;
}

/** On a selected thing: hide it in the situation shown, or let it out of its own situation. */
export function situationField(r: Room, e: StoryElement, sit: Situation | undefined): string {
  if (e.situation) {
    const s = (r.situations ?? []).find(x => x.id === e.situation);
    return `<p class="hint sitnote">Only in the situation <b>${esc(s?.name ?? 'that was deleted')}</b>. <button class="linkbtn" data-act="el-unsit">Show it always</button></p>`;
  }
  if (!sit) {
    const hidden = (e.hideIn ?? []).map(id => r.situations?.find(s => s.id === id)?.name).filter(Boolean);
    return hidden.length ? `<p class="hint sitnote">Hidden in ${hidden.map(n => `<b>${esc(n!)}</b>`).join(', ')}.</p>` : '';
  }
  const on = !!e.hideIn?.includes(sit.id);
  return `<label class="check sitnote"><input type="checkbox" id="el-hidein" data-in="el-hidein"${on ? ' checked' : ''}><span>Hide in ${esc(sit.name)}</span></label>`;
}

/* ---------- Conversations per figure ---------- */

/** The tabs over a conversation: one per conversation, Otherwise, and + Conversation when…. */
export function convoTabs(e: StoryElement, cur: string | null): string {
  const add = `<button class="cvtab add" data-act="convo-add" title="Another conversation, used while its conditions hold">+ Conversation when…</button>`;
  if (!e.convos?.length) return `<div class="cvtabs">${add}</div>`;
  const tab = (id: string, label: string, title: string) => {
    const on = (cur ?? '') === id;
    return `<button role="tab" class="cvtab${on ? ' on' : ''}" aria-selected="${on}" data-act="convo-tab" data-k="${esc(id)}" title="${esc(title)}">${esc(label.length > 30 ? `${label.slice(0, 28)}…` : label)}</button>`;
  };
  return `<div class="cvtabs" role="tablist" aria-label="Conversations of ${esc(e.name)}">${e.convos.map(c => tab(c.id, convoLabel(c), condsText(c.conds) || 'Always')).join('')}${tab('', 'Otherwise', 'When none of the others can run')}${add}</div>`;
}

/** Settings of the conversation shown, for the panel beside it when nothing is selected. */
export function convoPanel(p: Project, e: StoryElement, cur: string | null): string {
  const list = e.convos ?? [];
  const i = list.findIndex(c => c.id === cur);
  if (i < 0) return list.length ? `<div class="cvpanel"><div class="label">Otherwise</div><p class="hint">Runs when none of the other ${list.length === 1 ? 'conversation' : `${list.length} conversations`} can.</p></div>` : '';
  const c = list[i];
  return `<div class="cvpanel"><div class="label">This conversation</div>
    <label class="field"><span>Name (only you see it)</span><input type="text" id="cv-label" data-in="cv-label" value="${esc(c.label)}" placeholder="For example: After the fire"></label>
    <div class="field"><span>Runs when</span>${condList(p, 'cv', c.conds)}</div>
    <div class="row cvorder"><span class="hint">Tried ${i + 1} of ${list.length + 1}</span><button class="btn small quiet micon" data-act="cv-move" data-k="-1" aria-label="Try earlier" title="Try earlier"${i ? '' : ' disabled'}>←</button><button class="btn small quiet micon" data-act="cv-move" data-k="1" aria-label="Try later" title="Try later"${i < list.length - 1 ? '' : ' disabled'}>→</button>
      <button class="btn small quiet danger" data-act="cv-delete" data-confirm="Click again to delete it">Delete</button></div>
    <p class="hint">Conversations are tried from left to right. The first whose conditions all hold runs; Otherwise runs when none does.</p></div>`;
}

/** The figure's conversations in brief, for its panel in the room. */
export function convoList(e: StoryElement): string {
  if (!e.convos?.length) return '';
  const row = (id: string, label: string, script: string) => {
    const n = lines(script);
    return `<button class="cvline" data-act="open-convo" data-k="${esc(id)}"><b>${esc(label)}</b><span>${script.trim() ? `${n} ${n === 1 ? 'line' : 'lines'}` : 'empty'}</span></button>`;
  };
  return `<div class="field"><span>Conversations</span>${e.convos.map(c => row(c.id, convoLabel(c), c.script)).join('')}${row('', 'Otherwise', e.script)}</div>`;
}

/** Whether a quest by this name exists (for Check links). */
export const questId = (p: Project, name: string) => findQuest(p, name)?.id ?? '';
