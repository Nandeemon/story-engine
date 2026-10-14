import type { Idle, Placement } from './types';

/** Named places on stage, by the x of a character's bottom centre in percent. */
export const SPOTS: [string, number][] = [['far left', 15], ['left', 30], ['center', 50], ['right', 70], ['far right', 85]];
const SPOT_WORDS: Record<string, number> = { 'far left': 15, left: 30, center: 50, centre: 50, middle: 50, right: 70, 'far right': 85 };

export const ENTER_EFFECTS = ['fade', 'slide from left', 'slide from right', 'pop'] as const;
export const EXIT_EFFECTS = ['fade', 'slide to left', 'slide to right'] as const;
export const LINE_EFFECTS = ['shake', 'tremble', 'pulse', 'pop', 'bounce', 'jump', 'flash'] as const;

export const isLineEffect = (s: string) => (LINE_EFFECTS as readonly string[]).includes(s.trim().toLowerCase());

/** How a line effect plays: strength and speed from 1 to 5 (3 is normal), and how many times. */
export interface FxOptions { strength?: number; speed?: number; times?: number }
export const FX_NORMAL = { strength: 3, speed: 3, times: 1 } as const;

/** Reads "shake", "shake strong", "pulse strength 4 speed 2 x3". Returns null when the words are not an effect. */
export function parseLineFx(text: string): { fx: string; opts: FxOptions } | null {
  const m = text.trim().toLowerCase().match(/^([a-z]+)((?:\s+(?:strength\s+[1-5]|speed\s+[1-5]|x[1-9]))*)$/);
  if (!m || !isLineEffect(m[1])) return null;
  const opts: FxOptions = {};
  const rest = m[2];
  const st = rest.match(/strength\s+([1-5])/), sp = rest.match(/speed\s+([1-5])/), n = rest.match(/x([1-9])/);
  if (st && Number(st[1]) !== FX_NORMAL.strength) opts.strength = Number(st[1]);
  if (sp && Number(sp[1]) !== FX_NORMAL.speed) opts.speed = Number(sp[1]);
  if (n && Number(n[1]) !== FX_NORMAL.times) opts.times = Number(n[1]);
  return { fx: m[1], opts };
}

/** Writes an effect back, leaving out what is normal. */
export function lineFxText(fx: string, opts: FxOptions = {}): string {
  return [fx,
    opts.strength && opts.strength !== FX_NORMAL.strength ? `strength ${opts.strength}` : '',
    opts.speed && opts.speed !== FX_NORMAL.speed ? `speed ${opts.speed}` : '',
    opts.times && opts.times !== FX_NORMAL.times ? `x${opts.times}` : ''].filter(Boolean).join(' ');
}

const num = (s: string) => Math.round(Number(s) * 10) / 10;

/** Reads "left", "42%" or "42% 90%". Returns null when the words are not a place. */
export function parsePlace(text: string): Placement | null {
  const t = text.trim().toLowerCase();
  if (t in SPOT_WORDS) return { x: SPOT_WORDS[t] };
  const m = t.match(/^(-?\d+(?:\.\d+)?)\s*%(?:\s+(-?\d+(?:\.\d+)?)\s*%)?$/);
  if (!m) return null;
  return m[2] !== undefined ? { x: num(m[1]), y: num(m[2]) } : { x: num(m[1]) };
}

/** Writes a place back: a spot word when x is exactly a spot and y is not set. */
export function placeText(at: Placement): string {
  if (at.x === undefined) return '';
  const spot = SPOTS.find(([, x]) => x === at.x);
  if (spot && at.y === undefined) return spot[0];
  return at.y !== undefined ? `${num(String(at.x))}% ${num(String(at.y))}%` : `${num(String(at.x))}%`;
}

/** The nearest spot within a small distance, used to snap dragging. */
export function snapToSpot(x: number, within = 3): number {
  const near = SPOTS.find(([, sx]) => Math.abs(sx - x) <= within);
  return near ? near[1] : Math.round(x * 10) / 10;
}

/** Movements a character can repeat while standing. */
export const IDLE_MOVES = ['breathe', 'sway', 'bob', 'float', 'bounce'] as const;

/** Reads "sway", "bob strength 2 speed 4" or "none". Returns null when the words are not a movement. */
export function parseIdle(text: string): Idle | null {
  const m = text.trim().toLowerCase().match(/^([a-z]+)((?:\s+(?:strength\s+[1-5]|speed\s+[1-5]))*)$/);
  if (!m) return null;
  if (/^(none|nothing|off|still)$/.test(m[1])) return { move: 'none' };
  if (!(IDLE_MOVES as readonly string[]).includes(m[1])) return null;
  const out: Idle = { move: m[1] };
  const st = m[2].match(/strength\s+([1-5])/), sp = m[2].match(/speed\s+([1-5])/);
  if (st && st[1] !== '3') out.strength = Number(st[1]);
  if (sp && sp[1] !== '3') out.speed = Number(sp[1]);
  return out;
}

export function idleText(i: Idle): string {
  return [i.move, i.strength && i.strength !== 3 ? `strength ${i.strength}` : '', i.speed && i.speed !== 3 ? `speed ${i.speed}` : ''].filter(Boolean).join(' ');
}
