import { describe, expect, it } from 'vitest';
import { characterOf, cleanLookName, findLook, hasLook, normalizeProject, uniqueLookName } from '../src';
import type { Character } from '../src';

const lin: Character = {
  id: 'c1', name: 'Lin', base: 'data:base',
  looks: [{ id: 'l1', name: 'Happy', img: 'data:happy', dx: 0, dy: 0, scale: 1 }, { id: 'l2', name: 'once 1', img: 'data:x', dx: 0, dy: 0, scale: 1, once: true }]
};

describe('looks', () => {
  it('finds a look by name, ignoring case, and treats default or unknown as the base picture', () => {
    expect(findLook(lin, 'happy')?.id).toBe('l1');
    expect(findLook(lin, 'default')).toBeUndefined();
    expect(findLook(lin, '')).toBeUndefined();
    expect(findLook(lin, 'furious')).toBeUndefined();
    expect(hasLook(lin, 'furious')).toBe(false);
    expect(hasLook(lin, 'Default')).toBe(true);
  });

  it('keeps look names safe for the script and unique per character', () => {
    expect(cleanLookName('angry, shaking (big)')).toBe('angry shaking big');
    expect(uniqueLookName(lin, 'happy')).toBe('happy 2');
    expect(uniqueLookName(lin, 'default')).toBe('default 2');
    expect(uniqueLookName(lin, 'sad')).toBe('sad');
  });
});

describe('normalizeProject with characters', () => {
  it('turns an old uploaded character into a character with a base picture', () => {
    const p = normalizeProject({ rooms: [{ name: 'Café', els: [{ kind: 'char', name: 'Lin', img: 'data:lin' }] }] })!;
    const el = p.rooms[0].els[0];
    expect(el.img).toBeUndefined();
    expect(characterOf(p, el)).toMatchObject({ name: 'Lin', base: 'data:lin', looks: [] });
  });

  it('keeps characters and looks, and drops links to characters that are gone', () => {
    const p = normalizeProject({
      characters: [{ id: 'c1', name: 'Lin', base: 'data:b', looks: [{ id: 'l1', name: 'sad:', img: 'data:s', dx: 0.1 }] }],
      rooms: [{ name: 'A', els: [{ kind: 'char', name: 'Lin', characterId: 'c1' }, { kind: 'char', name: 'Ghost', characterId: 'nope', preset: 'jon' }] }]
    })!;
    expect(p.characters[0].looks[0]).toEqual({ id: 'l1', name: 'sad', img: 'data:s', dx: 0.1, dy: 0, scale: 1 });
    expect(p.rooms[0].els[1].characterId).toBeUndefined();
  });
});

describe('character facts', async () => {
  const { normalizeProject, startFacts, talkedFact, storyFactNames } = await import('../src');
  it('keeps tracked facts with start values and lists them', () => {
    const p = normalizeProject({
      rooms: [{ id: 'r', name: 'Hall', els: [{ id: 'e', kind: 'char', name: 'Mara Lee', script: 'Mara Lee: Hi.' }] }],
      characters: [{ id: 'c', name: 'Mara', base: 'data:,', looks: [], facts: [{ fact: 'mara.trust', kind: 'number', start: 3 }, { fact: 'Has Key!', kind: 'item', start: false }, { fact: 'mara.trust', kind: 'word' }] }]
    })!;
    expect(p.characters[0].facts).toEqual([{ fact: 'mara.trust', kind: 'number', start: 3 }, { fact: 'has_key', kind: 'item', start: false }]);
    expect(startFacts(p)).toEqual({ 'mara.trust': 3, has_key: false });
    expect(talkedFact('Mara Lee')).toBe('talked.mara_lee');
    expect(storyFactNames(p)).toEqual(['has_key', 'mara.trust', 'talked.mara_lee']);
  });
});
