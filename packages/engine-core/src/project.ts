import type { Idle, MarkDef, MarkSpot, Backdrop, Character, CharacterLook, CompareOp, Condition, FactDef, FactValue, Facts, Look, Project, Room, Sound, StoryElement } from './types';
import { IDLE_MOVES, isLineEffect } from './staging';
import { renameLookInScript } from './refs';
import { normalizePanels } from './panels';
import { normalizeItems } from './items';

export const DEFAULT_LOOK: Look = { theme: 'velvet', font: 'Lora', radius: 14, size: 2 };

export function newId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function createRoom(name: string): Room {
  return { id: newId(), name, bg: null, auto: false, els: [] };
}

export function createProject(): Project {
  return { version: 1, rooms: [createRoom('Room 1')], look: { ...DEFAULT_LOOK }, characters: [] };
}

export function findRoomByName(project: Project, name: string): Room | undefined {
  const key = name.trim().toLowerCase();
  return project.rooms.find(r => r.name.trim().toLowerCase() === key);
}

const num = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: unknown, fallback: string): string => (typeof v === 'string' ? v : fallback);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hex = (v: unknown): boolean => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

function normalizeIdle(raw: unknown): Idle | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const i = raw as Record<string, unknown>;
  const move = str(i.move, '');
  if (move !== 'none' && !(IDLE_MOVES as readonly string[]).includes(move)) return undefined;
  const lvl = (v: unknown) => typeof v === 'number' && v >= 1 && v <= 5 && v !== 3 ? Math.round(v) : undefined;
  return { move, ...(lvl(i.strength) ? { strength: lvl(i.strength) } : {}), ...(lvl(i.speed) ? { speed: lvl(i.speed) } : {}) };
}
function normalizeSpot(raw: unknown, fallback: MarkSpot): MarkSpot {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return { x: clamp(num(o.x, fallback.x), -50, 150), y: clamp(num(o.y, fallback.y), -50, 150), size: clamp(num(o.size, fallback.size), 1, 100) };
}
const ANIMS: MarkDef['anim'][] = ['none', 'pulse', 'float', 'drift', 'bob', 'spin', 'pop', 'shake', 'drip', 'fade'];

/** A mark name: lower case, without characters that would break "(mark anger)" in a line. */
export function cleanMarkName(name: string): string {
  return name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[():,"_]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 30) || 'mark';
}

const isValue = (v: unknown): v is FactValue => typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string';
function normalizeFacts(raw: unknown): FactDef[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw.filter(f => f && typeof f === 'object').map((f: Record<string, unknown>): FactDef => ({
    fact: factName(str(f.fact, '')),
    kind: f.kind === 'milestone' || f.kind === 'item' || f.kind === 'word' ? f.kind : 'number',
    ...(isValue(f.start) ? { start: f.start } : {}),
    ...(typeof f.about === 'string' && f.about ? { about: f.about } : {})
  })).filter(f => f.fact && !seen.has(f.fact) && !!seen.add(f.fact));
}

/** A story fact name: letters, digits, underscores and dots. */
export function factName(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^\w.]/g, '').replace(/^\.+|\.+$/g, '');
}

/** The fact a character's conversations count up: "talked.lin". */
export function talkedFact(name: string): string {
  return `talked.${factName(name).replace(/\./g, '_') || 'someone'}`;
}

/** Story facts as a new game starts: the start values the author set. */
export function startFacts(p: Project): Facts {
  const out: Facts = {};
  for (const c of p.characters) for (const f of c.facts ?? []) if (f.start !== undefined) out[f.fact] = f.start;
  return out;
}

const OPS: CompareOp[] = ['>=', '<=', '>', '<', '!=', '=', 'truthy'];
function normalizeCondition(raw: unknown): Condition | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const c = raw as Record<string, unknown>;
  const fact = str(c.fact, '').replace(/[^\w.]/g, '_');
  if (!fact) return undefined;
  const op = OPS.includes(c.op as CompareOp) ? c.op as CompareOp : 'truthy';
  const value = typeof c.value === 'number' || typeof c.value === 'boolean' || typeof c.value === 'string' ? c.value : true;
  return { fact, op, value };
}

function normalizeBackdrop(raw: unknown): Backdrop | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const out: Backdrop = {};
  if (typeof b.preset === 'string') out.preset = b.preset;
  if (typeof b.img === 'string') out.img = b.img;
  if (typeof b.video === 'string' && b.video.startsWith('data:video/')) out.video = b.video;
  if (!out.preset && !out.img && !out.video) return null;
  if (b.fit === 'fit' || b.fit === 'stretch') out.fit = b.fit;
  if (typeof b.fx === 'number') out.fx = clamp(b.fx, 0, 100);
  if (typeof b.fy === 'number') out.fy = clamp(b.fy, 0, 100);
  if (typeof b.zoom === 'number') out.zoom = clamp(b.zoom, 1, 3);
  if (b.edge === 'color') out.edge = 'color';
  if (typeof b.color === 'string' && /^#[0-9a-f]{6}$/i.test(b.color)) out.color = b.color;
  return out;
}

/**
 * Reads a project from untrusted JSON (a save, an import) and fills in anything
 * missing, so the editor and runtime can rely on the shape. Returns null when
 * the data is not a project at all.
 */
export function normalizeProject(raw: unknown): Project | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.rooms) || !r.rooms.length) return null;
  const rooms: Room[] = r.rooms.filter(x => x && typeof x === 'object').map((x: Record<string, unknown>) => {
    const bg = normalizeBackdrop(x.bg);
    const els: StoryElement[] = (Array.isArray(x.els) ? x.els : []).filter(e => e && typeof e === 'object').map((e: Record<string, unknown>) => ({
      id: str(e.id, newId()),
      kind: e.kind === 'char' ? 'char' : e.kind === 'area' ? 'area' : 'object',
      name: str(e.name, 'Thing'),
      preset: typeof e.preset === 'string' ? e.preset : undefined,
      characterId: typeof e.characterId === 'string' ? e.characterId : undefined,
      img: typeof e.img === 'string' ? e.img : undefined,
      x: num(e.x, 50),
      y: num(e.y, 98),
      size: num(e.size, 50),
      ...(e.kind === 'area' ? { w: clamp(num(e.w, 20), 1, 100) } : {}),
      ...(e.kind === 'char' && normalizeIdle(e.idle) ? { idle: normalizeIdle(e.idle) } : {}),
      ...(e.offstage === true ? { offstage: true } : {}),
      ...(normalizeCondition(e.cond) ? { cond: normalizeCondition(e.cond) } : {}),
      ...(normalizeCondition(e.cond) && Array.isArray(e.andConds) && e.andConds.some(normalizeCondition) ? { andConds: (e.andConds as unknown[]).map(normalizeCondition).filter((c): c is Condition => !!c) } : {}),
      ...(typeof e.hover === 'string' && e.hover.trim() ? { hover: e.hover.slice(0, 120) } : {}),
      ...(e.kind === 'area' && Array.isArray(e.shape) && e.shape.length >= 3 ? { shape: (e.shape as Record<string, unknown>[]).filter(p => p && typeof p === 'object').map(p => ({ x: clamp(num(p.x, 0), 0, 100), y: clamp(num(p.y, 0), 0, 100) })) } : {}),
      ...(e.once === 'stay' || e.once === 'hide' ? { once: e.once } : {}),
      ...(typeof e.sound === 'string' && e.sound ? { sound: e.sound } : {}),
      expr: typeof e.expr === 'string' ? e.expr : undefined,
      staging: e.staging === 'room' ? 'room' : undefined,
      script: str(e.script, '')
    }));
    return {
      id: str(x.id, newId()), name: str(x.name, 'Room'), bg, auto: x.auto === true,
      ...(typeof x.autoEl === 'string' && els.some(e => e.id === x.autoEl) ? { autoEl: x.autoEl } : {}),
      ...(x.autoOnce === true ? { autoOnce: true } : {}),
      ...(typeof x.music === 'string' && x.music ? { music: x.music } : {}),
      ...(x.musicOnce === true ? { musicOnce: true } : {}),
      els
    };
  });
  if (!rooms.length) return null;
  const characters: Character[] = (Array.isArray(r.characters) ? r.characters : [])
    .filter(c => c && typeof c === 'object' && typeof (c as Record<string, unknown>).base === 'string')
    .map((c: Record<string, unknown>) => ({
      id: str(c.id, newId()),
      name: str(c.name, 'Character'),
      ...(typeof c.about === 'string' && c.about ? { about: c.about } : {}),
      base: c.base as string,
      looks: (Array.isArray(c.looks) ? c.looks : []).filter(l => l && typeof l === 'object' && typeof (l as Record<string, unknown>).img === 'string')
        .map((l: Record<string, unknown>): CharacterLook => ({
          id: str(l.id, newId()), name: cleanLookName(str(l.name, 'look')), img: l.img as string,
          dx: num(l.dx, 0), dy: num(l.dy, 0), scale: num(l.scale, 1), ...(l.once === true ? { once: true } : {}),
          ...(typeof l.sound === 'string' && l.sound ? { sound: l.sound } : {})
        })),
      ...(normalizeFacts(c.facts).length ? { facts: normalizeFacts(c.facts) } : {}),
      ...(normalizeIdle(c.idle) ? { idle: normalizeIdle(c.idle) } : {}),
      ...(c.markAt && typeof c.markAt === 'object' && Object.keys(c.markAt).length
        ? { markAt: Object.fromEntries(Object.entries(c.markAt as Record<string, unknown>).map(([k, v]) => [cleanMarkName(k), normalizeSpot(v, { x: 50, y: 10, size: 10 })])) } : {})
    }));
  // A look whose name is now an effect word was renamed above: its lines follow.
  for (const c of characters) for (const l of c.looks) {
    if (!/ look$/.test(l.name) || !isLineEffect(l.name.replace(/ look$/, ''))) continue;
    for (const room of rooms) for (const el of room.els) el.script = renameLookInScript(el.script, c.name, l.name.replace(/ look$/, ''), l.name);
  }
  // Characters made from one uploaded picture, from before characters had looks.
  for (const room of rooms) for (const el of room.els) {
    if (el.characterId && !characters.some(c => c.id === el.characterId)) el.characterId = undefined;
    if (el.kind === 'char' && el.img && !el.characterId) {
      const c: Character = { id: newId(), name: el.name, base: el.img, looks: [] };
      characters.push(c);
      el.characterId = c.id;
      el.img = undefined;
    }
  }
  const look = (r.look && typeof r.look === 'object' ? r.look : {}) as Record<string, unknown>;
  // The old on-screen display: each widget becomes a panel of one block with no background.
  const oldHud = (Array.isArray(r.hud) ? r.hud : []).filter(w => w && typeof w === 'object').map((w: Record<string, unknown>) => {
    const fact = str(w.fact, 'fact').replace(/[^\w.]/g, '_') || 'fact';
    const meter = w.kind === 'meter';
    const text = str(w.text, '');
    return {
      id: str(w.id, newId()), name: text || fact.replace(/[_.]/g, ' '),
      x: clamp(num(w.x, 2), 0, 95), y: clamp(num(w.y, 3), 0, 95), w: meter ? clamp(num(w.w, 24), 5, 90) : 16, h: meter ? 8 : 7,
      layout: 'row', style: 'none', when: 'always',
      blocks: [{
        id: newId(), kind: meter ? 'meter' : 'number', fact, label: text, ...(meter ? { max: Math.max(1, num(w.max, 100)) } : {}),
        ...(w.hideUnset === true ? { cond: { fact, op: 'truthy', value: true } } : {})
      }]
    };
  });
  const panels = normalizePanels([...(Array.isArray(r.panels) ? r.panels : []), ...oldHud], rooms.map(x => x.id), characters.map(c => c.id));
  const items = normalizeItems(r.items);
  const sounds: Sound[] = (Array.isArray(r.sounds) ? r.sounds : []).filter(x => x && typeof x === 'object' && typeof (x as Record<string, unknown>).data === 'string')
    .map((x: Record<string, unknown>) => ({ id: str(x.id, newId()), name: cleanSoundName(str(x.name, 'sound')), data: x.data as string, ...(typeof x.owner === 'string' && characters.some(c => c.id === x.owner) ? { owner: x.owner } : {}),
      ...(typeof x.volume === 'number' && x.volume !== 100 ? { volume: clamp(Math.round(x.volume), 0, 100) } : {}),
      ...(x.music === true ? { music: true } : {}) }));
  const marks: MarkDef[] = (Array.isArray(r.marks) ? r.marks : []).filter(x => x && typeof x === 'object').map((x: Record<string, unknown>) => ({
    id: str(x.id, newId()), name: cleanMarkName(str(x.name, 'mark')),
    ...(typeof x.preset === 'string' ? { preset: x.preset } : {}), ...(typeof x.img === 'string' ? { img: x.img } : {}),
    anim: ANIMS.includes(x.anim as MarkDef['anim']) ? x.anim as MarkDef['anim'] : 'none',
    ...(typeof x.speed === 'number' && x.speed >= 1 && x.speed <= 5 && x.speed !== 3 ? { speed: Math.round(x.speed) } : {}),
    ...normalizeSpot(x, { x: 50, y: 10, size: 10 })
  })).filter(m => m.preset || m.img);
  return {
    version: 1,
    ...(typeof r.title === 'string' && r.title.trim() ? { title: r.title.trim().slice(0, 80) } : {}),
    rooms,
    characters,
    ...(items.length ? { items } : {}),
    ...(panels.length ? { panels } : {}),
    ...(sounds.length ? { sounds } : {}),
    ...(marks.length ? { marks } : {}),
    look: {
      theme: str(look.theme, DEFAULT_LOOK.theme),
      font: str(look.font, DEFAULT_LOOK.font),
      radius: num(look.radius, DEFAULT_LOOK.radius),
      size: num(look.size, DEFAULT_LOOK.size),
      ...(look.choices === 'center' ? { choices: 'center' as const } : {}),
      ...(look.box === 'glass' || look.box === 'outline' || look.box === 'band' ? { box: look.box } : {}),
      ...(look.names === 'inside' || look.names === 'plain' ? { names: look.names } : {}),
      ...(typeof look.opacity === 'number' ? { opacity: clamp(Math.round(look.opacity), 20, 100) } : {}),
      ...(look.width === 'full' ? { width: 'full' as const } : {}),
      ...(hex(look.boxColor) ? { boxColor: look.boxColor as string } : {}),
      ...(hex(look.textColor) ? { textColor: look.textColor as string } : {}),
      ...(hex(look.accentColor) ? { accentColor: look.accentColor as string } : {}),
      ...(typeof look.typing === 'number' && look.typing > 0 ? { typing: clamp(Math.round(look.typing), 5, 200) } : {}),
      ...(look.bubbles === true ? { bubbles: true } : {}),
      ...(look.narration === 'screen' ? { narration: 'screen' as const } : {}),
      ...(look.gameMenu === false ? { gameMenu: false as const } : {})
    }
  };
}

/* ---------- Characters and looks ---------- */

/** The name a line uses for a character's base picture. */
export const DEFAULT_LOOK_NAME = 'default';

/** All the conditions on a room thing: it is there (or clickable) only while every one holds. */
export function elementConds(e: StoryElement): Condition[] {
  return e.cond ? [e.cond, ...(e.andConds ?? [])] : [];
}

/** An area's outline in percent of the stage, or null for a plain box. */
export function areaPoints(e: StoryElement): { x: number; y: number }[] | null {
  if (e.kind !== 'area' || !e.shape || e.shape.length < 3) return null;
  const w = e.w ?? 20, left = e.x - w / 2, top = e.y - e.size;
  return e.shape.map(p => ({ x: left + p.x / 100 * w, y: top + p.y / 100 * e.size }));
}

/** Gives an area an outline from points on the stage: its box becomes the box around them. */
export function setAreaShape(e: StoryElement, pts: { x: number; y: number }[]): void {
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const xs = pts.map(p => Math.min(100, Math.max(0, p.x))), ys = pts.map(p => Math.min(100, Math.max(0, p.y)));
  const l = Math.min(...xs), r = Math.max(...xs), t = Math.min(...ys), b = Math.max(...ys);
  const w = Math.max(1, r - l), h = Math.max(1, b - t);
  e.x = r1(l + w / 2); e.y = r1(b); e.w = r1(w); e.size = r1(h);
  e.shape = xs.map((x, i) => ({ x: r1((x - l) / w * 100), y: r1((ys[i] - t) / h * 100) }));
}

/** Sound names sit inside "(sound laugh)" in the script, so they cannot hold ( ) : , or quotes. */
export function cleanSoundName(name: string): string {
  return name.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[():,"_]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 30) || 'sound';
}

/** Look names sit inside "Lin (happy): ..." in the script, so they cannot hold ( ) : , or quotes, or be an effect word. */
export function cleanLookName(name: string): string {
  const n = name.replace(/[():,"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30) || 'look';
  return isLineEffect(n) || /^(sound|mark)\s/i.test(n) ? `${n} look` : n;
}

export function characterOf(project: Project, el: StoryElement): Character | undefined {
  return el.characterId ? project.characters.find(c => c.id === el.characterId) : undefined;
}

/**
 * Finds the look a line asks for. "default" or an empty name is the base picture
 * (returned as undefined); an unknown name also falls back to the base picture.
 */
export function findLook(character: Character, name: string | undefined): CharacterLook | undefined {
  const key = (name ?? '').trim().toLowerCase();
  if (!key || key === DEFAULT_LOOK_NAME) return undefined;
  return character.looks.find(l => l.name.toLowerCase() === key);
}

/** True when a line's look name means something for this character. */
export function hasLook(character: Character, name: string): boolean {
  const key = name.trim().toLowerCase();
  return !key || key === DEFAULT_LOOK_NAME || character.looks.some(l => l.name.toLowerCase() === key);
}

/** A look name not yet used by this character, based on the wanted name. */
export function uniqueLookName(character: Character, wanted: string): string {
  const base = cleanLookName(wanted);
  const taken = (n: string) => n.toLowerCase() === DEFAULT_LOOK_NAME || character.looks.some(l => l.name.toLowerCase() === n.toLowerCase());
  if (!taken(base)) return base;
  let i = 2;
  while (taken(`${base} ${i}`)) i++;
  return `${base} ${i}`;
}
