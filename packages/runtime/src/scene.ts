/**
 * The scene during a conversation: who is on stage, where, how big, with which
 * look. The editor's line preview and the player both build it with the same
 * functions, so the preview shows what the player will see.
 */
import { findLook, testCondition, walkSteps } from '@story-engine/engine-core';
import type { Facts, FxOptions, Idle, Look, PathPoint, PathStep, Placement, Project, Room, Step, StoryElement } from '@story-engine/engine-core';
import { findMark, markHTML } from './marks';
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
  /** How a line effect plays. */
  fxOpts?: FxOptions;
  /** Marks that stay until taken off, and marks for the current line only. */
  marks: string[];
  lineMarks: string[];
  /** How they move while standing; the character's own setting when not set. */
  idle?: Idle;
  /** A drawn path they are moving along, and their size as it began. */
  path?: { step: PathStep; startSize: number };
  /** How visible, 0 to 100, when a path fades them. */
  fade?: number;
}

/** Where the player is in the story beyond facts: conversations had and rooms visited. */
export interface Progress { facts: Facts; seen: string[] }

/** Whether something is in the room right now: its condition holds, and a one-time conversation that hides it has not happened. */
export function present(el: StoryElement, progress?: Progress): boolean {
  if (!progress) return true;
  if (el.cond && !testCondition(progress.facts, el.cond)) return false;
  return !(el.once === 'hide' && progress.seen.includes(el.id));
}

export interface Scene { chars: StagedChar[] }

const lower = (s: string) => s.trim().toLowerCase();
const SPOT_ORDER = [50, 30, 70, 15, 85];

const ENTER: Record<string, string> = { fade: 'in-fade', 'slide from left': 'in-left', 'slide from right': 'in-right', pop: 'in-pop' };
const EXIT: Record<string, string> = { fade: 'out-fade', 'slide to left': 'out-left', 'slide to right': 'out-right' };

/**
 * Names of everyone who is part of a conversation from its start: they speak or
 * are moved before anything brings them in. Someone whose first appearance is a
 * "Show" starts off stage and enters there.
 */
function castOf(steps: Step[]): Set<string> {
  const first = new Map<string, string>();
  walkSteps(steps, s => {
    const who = s.t === 'say' || s.t === 'show' || s.t === 'move' || s.t === 'hide' || s.t === 'mark' || s.t === 'loop' ? lower(s.who) : '';
    if (who && !first.has(who)) first.set(who, s.t);
  });
  return new Set([...first].filter(([, t]) => t === 'say' || t === 'move' || t === 'mark' || t === 'loop').map(([name]) => name));
}

/**
 * The scene as a conversation opens. With "others step aside" (the default),
 * characters in the room who take no part leave the stage for a while; the
 * owner and everyone in the conversation stay where they stand in the room.
 */
export function startScene(room: Room, owner: StoryElement, steps: Step[], progress?: Progress): Scene {
  const cast = castOf(steps);
  const entering = new Set<string>();
  walkSteps(steps, s => { if (s.t === 'show') entering.add(lower(s.who)); });
  if (owner.kind === 'char' && !(entering.has(lower(owner.name)) && !cast.has(lower(owner.name)))) cast.add(lower(owner.name));
  const aside = (owner.staging ?? 'aside') === 'aside';
  return {
    chars: room.els.filter(e => e.kind === 'char' && (e === owner || present(e, progress))).map(e => ({
      key: e.id, name: e.name, elId: e.id, characterId: e.characterId, preset: e.preset, img: e.img,
      x: e.x, y: e.y, size: e.size, flip: false, look: e.expr ?? '', lineLook: '', marks: [], lineMarks: [], idle: e.idle,
      visible: aside ? cast.has(lower(e.name)) : !(entering.has(lower(e.name)) && !cast.has(lower(e.name))), fx: ''
    }))
  };
}

/** The scene outside conversations: everyone where they stand in the room. */
export function roomScene(room: Room, progress?: Progress): Scene {
  return {
    chars: room.els.filter(e => e.kind === 'char' && present(e, progress)).map(e => ({
      key: e.id, name: e.name, elId: e.id, characterId: e.characterId, preset: e.preset, img: e.img,
      x: e.x, y: e.y, size: e.size, flip: false, look: e.expr ?? '', lineLook: '', marks: [], lineMarks: [], idle: e.idle, visible: true, fx: ''
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
  const size = scene.chars.find(c => c.visible)?.size ?? 76;
  const character = project.characters.find(c => lower(c.name) === key);
  // Someone placed in another room (such as a starter figure) can be brought in too.
  const elsewhere = character ? undefined : project.rooms.flatMap(r => r.els).find(e => e.kind === 'char' && lower(e.name) === key);
  if (!character && !elsewhere) return undefined;
  const c: StagedChar = character
    ? { key: `c:${character.id}`, name: character.name, characterId: character.id, x: freeSpot(scene), y: 98, size, flip: false, look: '', lineLook: '', marks: [], lineMarks: [], visible: false, fx: '' }
    : { key: `e:${elsewhere!.id}`, name: elsewhere!.name, preset: elsewhere!.preset, characterId: elsewhere!.characterId, img: elsewhere!.img, x: freeSpot(scene), y: 98, size: elsewhere!.size || size, flip: false, look: elsewhere!.expr ?? '', lineLook: '', marks: [], lineMarks: [], idle: elsewhere!.idle, visible: false, fx: '' };
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
  for (const c of scene.chars) { c.fx = ''; c.fxOpts = undefined; c.lineLook = ''; c.lineMarks = []; }
}

/** Applies one step to the scene. Lines bring their speaker on stage if needed. */
export function applyToScene(scene: Scene, step: Step, project: Project): void {
  switch (step.t) {
    case 'show': {
      const c = cast(scene, project, step.who);
      if (!c) return;
      c.path = undefined;
      if (step.look) c.look = step.look;
      place(c, step.at);
      if (c.visible) c.fx = ENTER[step.fx] ?? 'in-fade';
      else enter(c, ENTER[step.fx] ?? 'in-fade');
      return;
    }
    case 'move': {
      const c = cast(scene, project, step.who);
      if (!c) return;
      c.path = undefined;
      place(c, step.at);
      enter(c);
      return;
    }
    case 'path': {
      const c = cast(scene, project, step.who);
      if (!c || step.points.length < 2) return;
      c.x = step.points[0].x;
      c.y = step.points[0].y;
      c.path = { step, startSize: c.size };
      enter(c);
      return;
    }
    case 'mark': {
      const c = cast(scene, project, step.who);
      if (!c) return;
      const key = lower(step.mark);
      if (step.off) c.marks = key ? c.marks.filter(m => m !== key) : [];
      else if (key && !c.marks.includes(key)) c.marks.push(key);
      return;
    }
    case 'loop': {
      const c = cast(scene, project, step.who);
      if (c) c.idle = step.move;
      return;
    }
    case 'hide': {
      const c = scene.chars.find(x => lower(x.name) === lower(step.who));
      if (!c || !c.visible) return;
      c.path = undefined;
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
      if (step.fx) { c.fx = step.fx; c.fxOpts = step.fxOpts; }
      if (step.marks?.length) c.lineMarks = step.marks.map(lower);
      return;
    }
  }
}

/** An element-like view of a staged character, for drawing. */
function asElement(c: StagedChar): StoryElement {
  return { id: c.key, kind: 'char', name: c.name, preset: c.preset, characterId: c.characterId, img: c.img, x: c.x, y: c.y, size: c.size, expr: c.look, script: '' };
}

/**
 * A staged character's picture: the art, its marks on top, wrapped so a standing
 * movement (sway, bob) can play without getting in the way of line effects.
 */
export function staged(c: StagedChar, project: Project, opts: { editable?: boolean } = {}): string {
  const character = c.characterId ? project.characters.find(x => x.id === c.characterId) : undefined;
  const idle = c.idle ?? character?.idle;
  const names = [...new Set([...c.marks, ...c.lineMarks])];
  const marks = names.map(n => findMark(project, n)).filter(Boolean).map(d => markHTML(d!, character, opts.editable ? { who: c.name } : {})).join('');
  const move = idle && idle.move !== 'none' ? ` idle-${idle.move}` : '';
  const vars = move ? ` style="--idk:${((idle!.strength ?? 3) / 3).toFixed(2)};--idd:${[1.8, 1.35, 1, 0.72, 0.5][(idle!.speed ?? 3) - 1]}"` : '';
  return `<span class="mv${move}"${vars}>${elementArt(asElement(c), c.lineLook || c.look || undefined, project.characters)}${marks}</span>`;
}

/** What a staged character looks like right now, so the player redraws only when it changes. */
export function stagedKey(c: StagedChar): string {
  return [c.characterId ?? c.preset ?? '', c.lineLook || c.look, c.marks.join(','), c.lineMarks.join(','), c.idle ? `${c.idle.move}${c.idle.strength ?? ''}${c.idle.speed ?? ''}` : ''].join('|');
}

/** CSS settings for a line effect: strength, speed and repeats. */
export function fxVars(o: FxOptions = {}): string {
  const k = (o.strength ?? 3) / 3;
  const d = [1.8, 1.35, 1, 0.7, 0.5][(o.speed ?? 3) - 1] ?? 1;
  return `--fxk:${k.toFixed(2)};--fxd:${d};--fxn:${o.times ?? 1}`;
}

/** Classes and style for one staged character. */
export function stagedAttrs(c: StagedChar): { cls: string; style: string } {
  const cls = ['el', 'staged', c.flip ? 'flip' : '', c.visible ? '' : 'gone', c.path ? 'onpath' : ''].filter(Boolean).join(' ');
  return { cls, style: `left:${c.x}%;top:${c.y}%;height:${c.size}%${c.fade !== undefined && c.fade < 100 ? `;opacity:${c.fade / 100}` : ''}${c.fx ? `;${fxVars(c.fxOpts)}` : ''}` };
}

/** Draws the room with a scene, for still pictures such as the editor's line preview. */
export function sceneHTML(project: Project, room: Room, scene: Scene, look: Look, game = '', opts: { draggable?: boolean; focus?: string; path?: { points: PathPoint[]; sel?: number }; pen?: boolean } = {}): string {
  const objects = room.els.filter(e => e.kind === 'object').map(e =>
    `<span class="el" style="left:${e.x}%;top:${e.y}%;height:${e.size}%">${elementArt(e, undefined, project.characters)}</span>`).join('');
  const chars = scene.chars.filter(c => c.visible).map(c => {
    const a = stagedAttrs(c);
    const focus = opts.focus && lower(opts.focus) === lower(c.name) ? ' focus' : '';
    return `<span class="${a.cls}${focus}${opts.draggable ? ' drag' : ''}" data-who="${esc(c.name)}" style="${a.style}"><span class="art">${staged(c, project, { editable: opts.draggable })}</span></span>`;
  }).join('');
  // A drawn path, with its points as handles: only in the editor.
  const path = opts.path ? `<svg class="pathline" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${opts.path.points.map(p => `${p.x},${p.y}`).join(' ')}" vector-effect="non-scaling-stroke"/></svg>${opts.path.points.map((p, i) =>
    `<span class="pdot${i === opts.path!.sel ? ' on' : ''}${p.size !== undefined || p.flip !== undefined || p.fx || p.fade !== undefined || p.look ? ' has' : ''}" data-pt="${i}" style="left:${p.x}%;top:${p.y}%" title="Point ${i + 1}"></span>`).join('')}` : '';
  const pen = opts.pen ? '<div class="pendraw" data-pen><span>Draw the path: hold the mouse down and move</span></div>' : '';
  return `<div class="stage look" data-stage style="${lookStyle(look)}"><div class="bg">${backdropHTML(room.bg)}</div>${objects}${chars}<div class="game">${game}</div>${path}${pen}</div>`;
}

