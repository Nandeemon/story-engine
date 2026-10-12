import { describe, expect, it } from 'vitest';
import { createProject, createRunner, findRoomByName, normalizeProject, parseScript, summarize } from '../src';
import type { Facts, RunEvent } from '../src';

const CAFE = `Mara: You came back.
Choice
  "I missed this place."  affection + 8
    Mara (smiling): So did I.
  "Just passing through."
    Mara (sad): Of course you are.
Only if affection is at least 5
  Mara (smiling): Stay a while.
Otherwise
  Mara: The street is that way.
  Go to Street, night
The lamps flicker.`;

/** Plays a script to the end, always picking the given answer, and returns a readable trace. */
function play(src: string, pick: number, facts: Facts = {}): string[] {
  const runner = createRunner(parseScript(src).steps, facts);
  const out: string[] = [];
  for (let i = 0; i < 50; i++) {
    const ev: RunEvent = runner.next();
    if (ev.t === 'choice') { out.push(`pick ${ev.options[pick].text}`); ev.pick(pick); }
    else if (ev.t === 'say') out.push(`${ev.who || '-'}${ev.expr ? `(${ev.expr})` : ''}: ${ev.text}`);
    else { out.push(ev.t === 'door' ? `door ${ev.room}` : 'end'); break; }
  }
  return out;
}

describe('parseScript', () => {
  it('reads a conversation with a choice, a condition and a door without errors', () => {
    const { steps, errors } = parseScript(CAFE);
    expect(errors).toEqual([]);
    expect(summarize(steps)).toEqual({ lines: 6, choices: 1, conditions: 1, doors: 1, facts: ['affection'], doorTargets: ['Street, night'], parts: [] });
  });

  it('reads speaker, expression and narration', () => {
    const { steps } = parseScript('Mara (smiling): Hi.\nThe rain stops.');
    expect(steps).toEqual([
      { t: 'say', who: 'Mara', expr: 'smiling', text: 'Hi.' },
      { t: 'say', who: '', expr: '', text: 'The rain stops.' }
    ]);
  });

  it('treats tabs as indentation, keeps notes and skips blank lines', () => {
    const { steps, errors } = parseScript('# note\nChoice\n\t"Yes"\n\t\tA: ok\n\n');
    expect(errors).toEqual([]);
    expect(steps[0]).toEqual({ t: 'note', text: 'note' });
    expect(steps[1]).toMatchObject({ t: 'choice', options: [{ text: 'Yes', steps: [{ who: 'A', text: 'ok' }] }] });
  });

  it('reads word and symbol conditions', () => {
    const cond = (s: string) => (parseScript(`Only if ${s}\n  x`).steps[0] as { cond: unknown }).cond;
    expect(cond('gold is at most 3')).toEqual({ fact: 'gold', op: '<=', value: 3 });
    expect(cond('mood is not angry')).toEqual({ fact: 'mood', op: '!=', value: 'angry' });
    expect(cond('trust.jon > 2')).toEqual({ fact: 'trust.jon', op: '>', value: 2 });
    expect(cond('met_parents')).toEqual({ fact: 'met_parents', op: 'truthy', value: true });
  });

  it('reports mistakes with line numbers in plain words', () => {
    const { errors } = parseScript('Choice\nOtherwise\n  x\nChange gold + lots, mood ? 3\nChoice\n  Yes without quotes');
    expect(errors.map(e => e.n)).toEqual([1, 2, 4, 6, 5]);
    expect(errors[2].msg).toContain('affection + 5');
  });
});

describe('createRunner', () => {
  it('follows the warm answer through the condition', () => {
    const facts: Facts = {};
    expect(play(CAFE, 0, facts)).toEqual([
      'Mara: You came back.', 'pick I missed this place.', 'Mara(smiling): So did I.',
      'Mara(smiling): Stay a while.', '-: The lamps flicker.', 'end'
    ]);
    expect(facts).toEqual({ affection: 8 });
  });

  it('follows the cold answer out through the door and stops there', () => {
    expect(play(CAFE, 1)).toEqual([
      'Mara: You came back.', 'pick Just passing through.', 'Mara(sad): Of course you are.',
      'Mara: The street is that way.', 'door Street, night'
    ]);
  });

  it('shares facts between conversations in one playthrough', () => {
    const facts: Facts = {};
    play('Change gold + 10, met = yes', 0, facts);
    play('Change gold - 3', 0, facts);
    expect(facts).toEqual({ gold: 7, met: true });
    expect(play('Only if met\n  A: Hello again.\nOtherwise\n  A: Who are you?', 0, facts)).toEqual(['A: Hello again.', 'end']);
  });

  it('stops at End', () => {
    expect(play('A: one\nEnd\nA: never', 0)).toEqual(['A: one', 'end']);
  });
});

describe('project', () => {
  it('creates a project with one empty room', () => {
    const p = createProject();
    expect(p.rooms).toHaveLength(1);
    expect(p.rooms[0].els).toEqual([]);
  });

  it('finds rooms by name regardless of case and spacing', () => {
    const p = createProject();
    p.rooms[0].name = 'Street, night';
    expect(findRoomByName(p, '  street, NIGHT ')).toBe(p.rooms[0]);
  });

  it('fills in missing fields and rejects data that is not a project', () => {
    expect(normalizeProject(null)).toBeNull();
    expect(normalizeProject({ rooms: [] })).toBeNull();
    const p = normalizeProject({ rooms: [{ name: 'Café', els: [{ kind: 'char', name: 'Mara' }] }] });
    expect(p?.rooms[0].els[0]).toMatchObject({ kind: 'char', name: 'Mara', x: 50, y: 98, script: '' });
    expect(p?.look.theme).toBe('velvet');
  });
});
