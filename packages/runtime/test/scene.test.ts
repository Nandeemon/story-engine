import { describe, expect, it } from 'vitest';
import { createProject, parseScript } from '@story-engine/engine-core';
import type { Room, StoryElement } from '@story-engine/engine-core';
import { applyToScene, nextMoment, startScene } from '../src/scene';

const el = (id: string, name: string, x: number, script = ''): StoryElement => ({ id, kind: 'char', name, preset: 'mara', x, y: 98, size: 70, script });

function play(owner: StoryElement, room: Room, upTo: number) {
  const project = { ...createProject(), rooms: [room] };
  const steps = parseScript(owner.script).steps;
  const scene = startScene(room, owner, steps);
  for (const s of steps.slice(0, upTo)) { nextMoment(scene); applyToScene(scene, s, project); }
  return Object.fromEntries(scene.chars.map(c => [c.name, c.visible ? `${c.x}` : 'off']));
}

describe('scene', () => {
  const mara = el('m', 'Mara', 30, 'Mara: Quiet tonight.\nMara: Very quiet.\nShow Jon at right with fade\nJon: Evening.');
  const room: Room = { id: 'r', name: 'Café', bg: null, auto: false, els: [mara, el('j', 'Jon', 60), el('i', 'Ines', 80)] };

  it('lets others step aside, and someone shown later enters only then', () => {
    expect(play(mara, room, 0)).toEqual({ Mara: '30', Jon: 'off', Ines: 'off' });
    expect(play(mara, room, 2)).toEqual({ Mara: '30', Jon: 'off', Ines: 'off' });
    expect(play(mara, room, 3)).toEqual({ Mara: '30', Jon: '70', Ines: 'off' });
  });

  it('keeps everyone when the room stays, apart from those who enter later', () => {
    const owner = { ...mara, staging: 'room' as const };
    expect(play(owner, { ...room, els: [owner, ...room.els.slice(1)] }, 0)).toEqual({ Mara: '30', Jon: 'off', Ines: '80' });
  });

  it('brings in a speaker who is not on stage', () => {
    const owner = el('m', 'Mara', 30, 'Mara: Hi.\nInes: Hello!');
    expect(play(owner, { ...room, els: [owner, room.els[2]] }, 2)).toEqual({ Mara: '30', Ines: '80' });
  });
});
