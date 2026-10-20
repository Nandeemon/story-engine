import { describe, expect, it } from 'vitest';
import {
  activeSituations, conditionText, createProject, createRunner, elementScripts, findQuest, inSituation, newQuest, normalizeProject,
  parseCondition, parseScript, pickConversation, questFact, questStage, renameQuest, renameQuestInScript, renameStage, renameStageInScript,
  roomSetting, storyFactNames, summarize, testCondition, writeScript
} from '../src';
import type { Facts, Project, Quest, Room, StoryElement } from '../src';

const CAT: Quest = { id: 'q1', name: 'Lost cat', stages: ['Not started', 'Started', 'Found', 'Done'] };
const ctx = { quests: [CAT] };

describe('quest script syntax', () => {
  it('reads a quest step and writes it back', () => {
    const src = 'Mara: Have you seen my cat?\nQuest Lost cat: Started';
    const { steps, errors } = parseScript(src);
    expect(errors).toEqual([]);
    expect(steps[1]).toEqual({ t: 'quest', quest: 'Lost cat', stage: 'Started' });
    expect(writeScript(steps)).toBe(src);
    expect(writeScript([{ t: 'quest', quest: 'Lost cat', stage: 'Done' }])).toBe('Quest Lost cat: Done');
  });

  it('reads every quest condition and writes it back exactly', () => {
    const lines = ['quest Lost cat is Started', 'quest Lost cat is not Done', 'quest Lost cat is at least Started', 'quest Lost cat is before Done'];
    const ops = ['=', '!=', '>=', '<'];
    lines.forEach((line, i) => {
      const c = parseCondition(line)!;
      expect(c).toEqual({ fact: 'quest.lost_cat', op: ops[i], value: line.split(/ (?:is at least|is before|is not|is) /)[1], quest: 'Lost cat' });
      expect(conditionText(c)).toBe(line);
      const src = `Only if ${line}\n  Mara: Yes.`;
      const parsed = parseScript(src);
      expect(parsed.errors).toEqual([]);
      expect(writeScript(parsed.steps)).toBe(src);
      expect(writeScript([{ t: 'if', cond: c, then: [{ t: 'end' }], else: [] }])).toBe(`Only if ${line}\n  End`);
    });
  });

  it('leaves plain facts and lines alone', () => {
    expect(parseCondition('quest_done is yes')).toEqual({ fact: 'quest_done', op: '=', value: true });
    expect(parseCondition('quest.lost_cat is Started')?.quest).toBeUndefined();
    expect(parseScript('Questioner: Who are you?').steps[0]).toMatchObject({ t: 'say', who: 'Questioner' });
  });

  it('counts the quest fact in summaries', () => {
    expect(summarize(parseScript('Quest Lost cat: Started').steps).facts).toEqual(['quest.lost_cat']);
  });
});

describe('quest stages and conditions', () => {
  const cond = (s: string) => parseCondition(s)!;
  it('keeps the stage name in the quest fact, with the first stage when unset', () => {
    expect(questFact('Lost cat!')).toBe('quest.lost_cat_');
    const p: Project = { ...createProject(), quests: [CAT] };
    expect(findQuest(p, 'lost CAT')).toBe(CAT);
    expect(questStage(p, {}, 'Lost cat')).toBe('Not started');
    expect(questStage(p, { 'quest.lost_cat': 'found' }, 'Lost cat')).toBe('Found');
  });

  it('compares stages in the quest order', () => {
    const at = (stage?: string): Facts => (stage ? { 'quest.lost_cat': stage } : {});
    expect(testCondition(at(), cond('quest Lost cat is Not started'), ctx)).toBe(true);
    expect(testCondition(at('Started'), cond('quest Lost cat is started'), ctx)).toBe(true);
    expect(testCondition(at('Started'), cond('quest Lost cat is not Done'), ctx)).toBe(true);
    expect(testCondition(at('Found'), cond('quest Lost cat is at least Started'), ctx)).toBe(true);
    expect(testCondition(at('Started'), cond('quest Lost cat is at least Started'), ctx)).toBe(true);
    expect(testCondition(at(), cond('quest Lost cat is at least Started'), ctx)).toBe(false);
    expect(testCondition(at('Found'), cond('quest Lost cat is before Done'), ctx)).toBe(true);
    expect(testCondition(at('Done'), cond('quest Lost cat is before Done'), ctx)).toBe(false);
    // Without the quest list, ordering cannot hold.
    expect(testCondition(at('Found'), cond('quest Lost cat is at least Started'))).toBe(false);
    // Unknown stages never order.
    expect(testCondition(at('Found'), cond('quest Lost cat is before Nowhere'), ctx)).toBe(false);
  });

  it('runs quest steps and quest conditions', () => {
    const facts: Facts = {};
    const { steps } = parseScript('Quest Lost cat: found\nOnly if quest Lost cat is at least Started\n  Mara: Thank you!\nOtherwise\n  Mara: Hm.');
    const r = createRunner(steps, facts, undefined, undefined, undefined, '', ctx);
    expect(r.next()).toMatchObject({ t: 'say', text: 'Thank you!' });
    expect(facts['quest.lost_cat']).toBe('Found');
  });

  it('makes new quests with unique names and default stages', () => {
    const p: Project = { ...createProject(), quests: [CAT] };
    const q = newQuest(p, 'Lost cat');
    expect(q.name).toBe('Lost cat 2');
    expect(q.stages).toEqual(['Not started', 'Started', 'Done']);
  });
});

const el = (over: Partial<StoryElement> = {}): StoryElement => ({ id: 'e1', kind: 'char', name: 'Mara', x: 50, y: 98, size: 50, script: 'Mara: Hello.', ...over });

describe('conversations per figure', () => {
  const mara = el({
    convos: [
      { id: 'c1', label: 'Cat found', conds: [parseCondition('quest Lost cat is at least Found')!], script: 'Mara: My cat!' },
      { id: 'c2', label: 'Asked', conds: [parseCondition('quest Lost cat is Started')!], script: 'Mara: Any luck?' },
      { id: 'c3', label: 'Empty', conds: [], script: '  ' }
    ]
  });
  it('picks the first whose conditions hold, then the fallback', () => {
    expect(pickConversation(mara, {}, ctx)).toEqual({ id: 'e1', script: 'Mara: Hello.' });
    expect(pickConversation(mara, { 'quest.lost_cat': 'Started' }, ctx)).toEqual({ id: 'e1:c2', script: 'Mara: Any luck?' });
    expect(pickConversation(mara, { 'quest.lost_cat': 'Done' }, ctx)).toEqual({ id: 'e1:c1', script: 'Mara: My cat!' });
  });
  it('skips empty conversations, and is null when nothing would run', () => {
    expect(pickConversation({ ...mara, script: '' }, {}, ctx)).toBeNull();
  });
  it('lists every script', () => {
    expect(elementScripts(mara)).toEqual(['Mara: My cat!', 'Mara: Any luck?', '  ', 'Mara: Hello.']);
  });
  it('counts facts from every conversation', () => {
    const p: Project = { ...createProject(), quests: [CAT] };
    p.rooms[0].els.push(el({ script: '', convos: [{ id: 'c', label: '', conds: [{ fact: 'trust', op: '>=', value: 2 }], script: 'Change gold + 1' }] }));
    expect(storyFactNames(p)).toEqual(expect.arrayContaining(['gold', 'trust', 'quest.lost_cat', 'talked.mara']));
  });
});

describe('situations', () => {
  const room: Room = {
    id: 'r', name: 'Cafe', bg: { preset: 'cafe' }, auto: false, music: 'day', els: [],
    situations: [
      { id: 'night', name: 'Night', conds: [{ fact: 'night', op: 'truthy', value: true }], bg: { preset: 'cafe-night' }, music: 'night' },
      { id: 'fire', name: 'After the fire', conds: [parseCondition('quest Lost cat is Done')!], bg: { preset: 'ruin' } }
    ]
  };
  it('is active while its conditions hold, several at once', () => {
    expect(activeSituations(room, {}, ctx)).toEqual([]);
    expect(activeSituations(room, { night: true }, ctx).map(s => s.id)).toEqual(['night']);
    expect(activeSituations(room, { night: true, 'quest.lost_cat': 'Done' }, ctx).map(s => s.id)).toEqual(['night', 'fire']);
  });
  it('lets the latest active situation set the backdrop and music', () => {
    expect(roomSetting(room, [])).toEqual({ bg: { preset: 'cafe' }, music: 'day' });
    expect(roomSetting(room, activeSituations(room, { night: true, 'quest.lost_cat': 'Done' }, ctx))).toEqual({ bg: { preset: 'ruin' }, music: 'night' });
  });
  it('shows things only in their situation, and hides them in others', () => {
    const owl = el({ situation: 'night' }), cup = el({ hideIn: ['fire'] }), plain = el();
    const none = activeSituations(room, {}, ctx);
    const both = activeSituations(room, { night: true, 'quest.lost_cat': 'Done' }, ctx);
    expect([owl, cup, plain].map(e => inSituation(e, none))).toEqual([false, true, true]);
    expect([owl, cup, plain].map(e => inSituation(e, both))).toEqual([true, false, true]);
    expect(inSituation(el({ situation: 'gone' }), both)).toBe(false);
  });
});

describe('normalizing quests, conversations and situations', () => {
  it('keeps good data and repairs bad data', () => {
    const p = normalizeProject({
      quests: [
        { id: 'q1', name: 'Lost: cat', stages: ['Start', 'start', '', 3, 'End'] },
        { name: 'Lost cat', stages: [] },
        { name: '', stages: ['x'] },
        { name: 'Empty', stages: 'nope' },
        null
      ],
      rooms: [{
        id: 'r', name: 'Cafe',
        situations: [
          { id: 's1', name: 'Night', conds: [{ fact: 'night', op: 'truthy', value: true }, null, { quest: 'Lost cat', fact: 'x', op: '>=', value: 'Start' }], bg: { preset: 'cafe' }, music: 'night' },
          { id: 's1', name: 'Duplicate' },
          'bad'
        ],
        els: [
          { id: 'e1', kind: 'char', name: 'Mara', script: 'Hi', convos: [{ id: 'c1', label: 'A', conds: [{ fact: 'a', op: 'truthy', value: true }], script: 'X' }, { id: 'c1', script: 'dup' }, { id: 'a:b' }, 5], situation: 'gone', hideIn: ['s1', 'nope', 's1'] },
          { id: 'e2', kind: 'object', name: 'Cup', convos: 'nope', situation: 4, hideIn: 'x' }
        ]
      }]
    })!;
    expect(p.quests!.map(q => [q.name, q.stages])).toEqual([['Lost cat', ['Start', 'End']], ['Empty', ['Not started', 'Started', 'Done']]]);
    expect(p.quests![0].id).toBe('q1');
    const r = p.rooms[0];
    expect(r.situations).toEqual([{ id: 's1', name: 'Night', conds: [{ fact: 'night', op: 'truthy', value: true }, { fact: 'quest.lost_cat', op: '>=', value: 'Start', quest: 'Lost cat' }], bg: { preset: 'cafe' }, music: 'night' }]);
    expect(r.els[0].convos).toEqual([{ id: 'c1', label: 'A', conds: [{ fact: 'a', op: 'truthy', value: true }], script: 'X' }]);
    expect(r.els[0].situation).toBe('gone');
    expect(r.els[0].hideIn).toEqual(['s1']);
    expect(r.els[1].convos).toBeUndefined();
    expect(r.els[1].situation).toBeUndefined();
    expect(r.els[1].hideIn).toBeUndefined();
  });
  it('loads old projects unchanged', () => {
    const p = normalizeProject({ rooms: [{ id: 'r', name: 'A', els: [{ id: 'e', kind: 'char', name: 'M', script: 'M: Hi' }] }] })!;
    expect(p.quests).toBeUndefined();
    expect(p.rooms[0].situations).toBeUndefined();
    expect(Object.keys(p.rooms[0].els[0])).not.toContain('convos');
  });
});

describe('renaming quests and stages', () => {
  const src = 'Quest Lost cat: Started\nOnly if quest lost cat is at least Started\n  Mara: Found it?\nOnly if quest Lost cat is not Done\n  Quest Lost cat: Done\nQuestioner: Lost cat: Started';
  it('renames a quest in steps and conditions', () => {
    expect(renameQuestInScript(src, 'Lost cat', 'Missing cat')).toBe(
      'Quest Missing cat: Started\nOnly if quest Missing cat is at least Started\n  Mara: Found it?\nOnly if quest Missing cat is not Done\n  Quest Missing cat: Done\nQuestioner: Lost cat: Started');
  });
  it('renames a stage of that quest only', () => {
    expect(renameStageInScript(src, 'Lost cat', 'Started', 'Begun')).toBe(
      'Quest Lost cat: Begun\nOnly if quest lost cat is at least Begun\n  Mara: Found it?\nOnly if quest Lost cat is not Done\n  Quest Lost cat: Done\nQuestioner: Lost cat: Started');
    expect(renameStageInScript(src, 'Other', 'Started', 'Begun')).toBe(src);
  });
  it('renames across the whole project, stored conditions too', () => {
    const p: Project = { ...createProject(), quests: [{ ...CAT, stages: [...CAT.stages] }] };
    const room = p.rooms[0];
    room.situations = [{ id: 's', name: 'S', conds: [parseCondition('quest Lost cat is Found')!] }];
    room.els.push(el({ script: 'Quest Lost cat: Found', cond: parseCondition('quest Lost cat is at least Started')!, convos: [{ id: 'c', label: '', conds: [parseCondition('quest Lost cat is Found')!], script: 'Only if quest Lost cat is Found\n  End' }] }));
    renameQuest(p, 'Lost cat', 'Missing cat');
    renameStage(p, 'Missing cat', 'Found', 'Rescued');
    expect(p.quests![0]).toMatchObject({ name: 'Missing cat', stages: ['Not started', 'Started', 'Rescued', 'Done'] });
    expect(room.situations[0].conds[0]).toEqual({ fact: 'quest.missing_cat', op: '=', value: 'Rescued', quest: 'Missing cat' });
    const e = room.els[0];
    expect(e.script).toBe('Quest Missing cat: Rescued');
    expect(e.cond).toEqual({ fact: 'quest.missing_cat', op: '>=', value: 'Started', quest: 'Missing cat' });
    expect(e.convos![0].conds[0].value).toBe('Rescued');
    expect(e.convos![0].script).toBe('Only if quest Missing cat is Rescued\n  End');
  });
});
