/**
 * The scene during a conversation: who is on stage, where, how big, with which
 * look. The editor's line preview and the player both build it with the same
 * functions, so the preview shows what the player will see.
 */
import { findLook, walkSteps } from '@story-engine/engine-core';
import type { Character, Look, Placement, Project, Room, Step, StoryElement } from '@story-engine/engine-core';
import { backdropHTML, elementArt, lookStyle } from './stage';
import { esc } from './art';

export interface StagedChar {
  /** The element id for characters placed in the room, or "c:<character id>" for those brought in. */
  key: string;
  name: string;
  elId?: string;
  characterId?: string;
  preset?: string;
  img?: string;
  x: number;
  y: number;
  size: number;
  flip: boolean;
  /** The look that holds until changed. */
  look: string;
  /** A picture for the current line only. */
  lineLook: string;
  visible: boolean;
  /** A one-shot effect for this moment: in-fade, out-left, shake... */
  fx: string;
}

export interface Scene { chars: StagedChar[] }

const lower = (s: string) => s.trim().toLowerCase();
const SPOT_ORDER = [50, 30, 70, 15, 85];

const ENTER: Record<string, string> = { fade: 'in-fade', 'slide from left': 'in-left', 'slide from right': 'in-right', pop: 'in-pop' };
const EXIT: Record<string, string> = { fade: 'out-fade', 'slide to left': 'out-left', 'slide to right': 'out-right' };

/** Names of everyone who speaks or is staged in a conversation. */
function castOf(steps: Step[]): Set<string> {
  const names = new Set<string>();
  walkSteps(steps, s => {
    if ((s.t === 'say' && s.who) || s.t === 'show' || s.t === 'move') names.add(lower(s.who));
  });
  return names;
}

/**
 * The scene as a conversation opens. With "others step aside" (the default),
 * characters in the room who take no part leave the stage for a while; the
 * owner and everyone in the conversation stay where they stand in the room.
 */
export function startScene(room: Room, owner: StoryElement, steps: Step[]): Scene {
  const cast = castOf(steps);
  if (owner.kind === 'char') cast.add(lower(owner.name));
  const aside = (owner.staging ?? 'aside') === 'aside';
  return {
    chars: room.els.filter(e => e.kind === 'char').map(e => ({
      key: e.id, name: e.name, elId: e.id, characterId: e.characterId, preset: e.preset, img: e.img,
      x: e.x, y: e.y, size: e.size, flip: false, look: e.expr ?? '', lineLook: '',
      visible: !aside || cast.has(lower(e.name)), fx: ''
    }))
  };
}

/** The scene outside conversations: everyone where they stand in the room. */
export function roomScene(room: Room): Scene {
  return {
    chars: room.els.filter(e => e.kind === 'char').map(e => ({
      key: e.id, name: e.name, elId: e.id, characterId: e.characterId, preset: e.preset, img: e.img,
      x: e.x, y: e.y, size: e.size, flip: false, look: e.expr ?? '', lineLook: '', visible: true, fx: ''
    }))
  };
}

function freeSpot(scene: Scene): number {
  const taken = scene.chars.filter(c => c.visible).map(c => c.x);
  return SPOT_ORDER.find(x => taken.every(t => Math.abs(t - x) > 10)) ?? 50;
}

/** Finds someone on the scene by name, or brings in one of the author's characters who is not placed in the room. */
function cast(scene: Scene, project: Project, who: string): StagedChar | undefined {
  const key = lower(who);
  if (!key) return undefined;
  const found = scene.chars.find(c => lower(c.name) === key);
  if (found) return found;
  const character = project.characters.find(c => lower(c.name) === key);
  if (!character) return undefined;
  const size = scene.chars.find(c => c.visible)?.size ?? 76;
  const c: StagedChar = { key: `c:${character.id}`, name: character.name, characterId: character.id, x: freeSpot(scene), y: 98, size, flip: false, look: '', lineLook: '', visible: false, fx: '' };
  scene.chars.push(c);
  return c;
}

function place(c: StagedChar, at: Placement): void {
  if (at.x !== undefined) c.x = at.x;
  if (at.y !== undefined) c.y = at.y;
  if (at.size !== undefined) c.size = at.size;
  if (at.flip !== undefined) c.flip = at.flip;
}

function enter(c: StagedChar, fx = 'in-fade'): void {
  if (c.visible) return;
  c.visible = true;
  c.fx = fx;
}

/** Clears what belongs to one moment only: effects and pictures for a single line. */
export function nextMoment(scene: Scene): void {
  for (const c of scene.chars) { c.fx = ''; c.lineLook = ''; }
}

/** Applies one step to the scene. Lines bring their speaker on stage if needed. */
export function applyToScene(scene: Scene, step: Step, project: Project): void {
  switch (step.t) {
    case 'show': {
      const c = cast(scene, project, step.who);
      if (!c) return;
      if (step.look) c.look = step.look;
      place(c, step.at);
      if (c.visible) c.fx = ENTER[step.fx] ?? 'in-fade';
      else enter(c, ENTER[step.fx] ?? 'in-fade');
      return;
    }
    case 'move': {
      const c = cast(scene, project, step.who);
      if (!c) return;
      place(c, step.at);
      enter(c);
      return;
    }
    case 'hide': {
      const c = scene.chars.find(x => lower(x.name) === lower(step.who));
      if (!c || !c.visible) return;
      c.visible = false;
      c.fx = EXIT[step.fx] ?? 'out-fade';
      return;
    }
    case 'say': {
      const c = cast(scene, project, step.who);
      if (!c) return;
      enter(c);
      if (step.expr) {
        const character = c.characterId ? project.characters.find(x => x.id === c.characterId) : undefined;
        if (character && findLook(character, step.expr)?.once) c.lineLook = step.expr;
        else c.look = step.expr;
      }
      if (step.fx) c.fx = step.fx;
      return;
    }
  }
}

/** An element-like view of a staged character, for drawing. */
function asElement(c: StagedChar): StoryElement {
  return { id: c.key, kind: 'char', name: c.name, preset: c.preset, characterId: c.characterId, img: c.img, x: c.x, y: c.y, size: c.size, expr: c.look, script: '' };
}

export function staged(c: StagedChar, characters: Character[]): string {
  return elementArt(asElement(c), c.lineLook || c.look || undefined, characters);
}

/** Classes and style for one staged character. */
export function stagedAttrs(c: StagedChar): { cls: string; style: string } {
  const cls = ['el', 'staged', c.flip ? 'flip' : '', c.visible ? '' : 'gone'].filter(Boolean).join(' ');
  return { cls, style: `left:${c.x}%;top:${c.y}%;height:${c.size}%` };
}

/** Draws the room with a scene, for still pictures such as the editor's line preview. */
export function sceneHTML(project: Project, room: Room, scene: Scene, look: Look, game = '', opts: { draggable?: boolean; focus?: string } = {}): string {
  const objects = room.els.filter(e => e.kind !== 'char').map(e =>
    `<span class="el" style="left:${e.x}%;top:${e.y}%;height:${e.size}%">${elementArt(e, undefined, project.characters)}</span>`).join('');
  const chars = scene.chars.filter(c => c.visible).map(c => {
    const a = stagedAttrs(c);
    const focus = opts.focus && lower(opts.focus) === lower(c.name) ? ' focus' : '';
    return `<span class="${a.cls}${focus}${opts.draggable ? ' drag' : ''}" data-who="${esc(c.name)}" style="${a.style}"><span class="art">${staged(c, project.characters)}</span></span>`;
  }).join('');
  return `<div class="stage look" data-stage style="${lookStyle(look)}"><div class="bg">${backdropHTML(room.bg)}</div>${objects}${chars}<div class="game">${game}</div></div>`;
}

