import type { Character, CharacterLook, Look, Project, Room, StoryElement } from './types';

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
    const bg = x.bg && typeof x.bg === 'object' ? (x.bg as Room['bg']) : null;
    const els: StoryElement[] = (Array.isArray(x.els) ? x.els : []).filter(e => e && typeof e === 'object').map((e: Record<string, unknown>) => ({
      id: str(e.id, newId()),
      kind: e.kind === 'char' ? 'char' : 'object',
      name: str(e.name, 'Thing'),
      preset: typeof e.preset === 'string' ? e.preset : undefined,
      characterId: typeof e.characterId === 'string' ? e.characterId : undefined,
      img: typeof e.img === 'string' ? e.img : undefined,
      x: num(e.x, 50),
      y: num(e.y, 98),
      size: num(e.size, 50),
      expr: typeof e.expr === 'string' ? e.expr : undefined,
      script: str(e.script, '')
    }));
    return { id: str(x.id, newId()), name: str(x.name, 'Room'), bg, auto: x.auto === true, els };
  });
  if (!rooms.length) return null;
  const characters: Character[] = (Array.isArray(r.characters) ? r.characters : [])
    .filter(c => c && typeof c === 'object' && typeof (c as Record<string, unknown>).base === 'string')
    .map((c: Record<string, unknown>) => ({
      id: str(c.id, newId()),
      name: str(c.name, 'Character'),
      base: c.base as string,
      looks: (Array.isArray(c.looks) ? c.looks : []).filter(l => l && typeof l === 'object' && typeof (l as Record<string, unknown>).img === 'string')
        .map((l: Record<string, unknown>): CharacterLook => ({
          id: str(l.id, newId()), name: cleanLookName(str(l.name, 'look')), img: l.img as string,
          dx: num(l.dx, 0), dy: num(l.dy, 0), scale: num(l.scale, 1), ...(l.once === true ? { once: true } : {})
        }))
    }));
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
  return {
    version: 1,
    rooms,
    characters,
    look: {
      theme: str(look.theme, DEFAULT_LOOK.theme),
      font: str(look.font, DEFAULT_LOOK.font),
      radius: num(look.radius, DEFAULT_LOOK.radius),
      size: num(look.size, DEFAULT_LOOK.size)
    }
  };
}

/* ---------- Characters and looks ---------- */

/** The name a line uses for a character's base picture. */
export const DEFAULT_LOOK_NAME = 'default';

/** Look names sit inside "Lin (happy): ..." in the script, so they cannot hold ( ) : , or quotes. */
export function cleanLookName(name: string): string {
  return name.replace(/[():,"]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30) || 'look';
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
