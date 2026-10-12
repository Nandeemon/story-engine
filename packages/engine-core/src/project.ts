import type { Look, Project, Room, StoryElement } from './types';

export const DEFAULT_LOOK: Look = { theme: 'velvet', font: 'Lora', radius: 14, size: 2 };

export function newId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function createRoom(name: string): Room {
  return { id: newId(), name, bg: null, auto: false, els: [] };
}

export function createProject(): Project {
  return { version: 1, rooms: [createRoom('Room 1')], look: { ...DEFAULT_LOOK } };
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
  const look = (r.look && typeof r.look === 'object' ? r.look : {}) as Record<string, unknown>;
  return {
    version: 1,
    rooms,
    look: {
      theme: str(look.theme, DEFAULT_LOOK.theme),
      font: str(look.font, DEFAULT_LOOK.font),
      radius: num(look.radius, DEFAULT_LOOK.radius),
      size: num(look.size, DEFAULT_LOOK.size)
    }
  };
}
