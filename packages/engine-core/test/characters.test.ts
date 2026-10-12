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
