import type { Placement } from './types';

/** Named places on stage, by the x of a character's bottom centre in percent. */
export const SPOTS: [string, number][] = [['far left', 15], ['left', 30], ['center', 50], ['right', 70], ['far right', 85]];
const SPOT_WORDS: Record<string, number> = { 'far left': 15, left: 30, center: 50, centre: 50, middle: 50, right: 70, 'far right': 85 };

export const ENTER_EFFECTS = ['fade', 'slide from left', 'slide from right', 'pop'] as const;
export const EXIT_EFFECTS = ['fade', 'slide to left', 'slide to right'] as const;
export const LINE_EFFECTS = ['shake', 'bounce', 'jump', 'flash'] as const;

export const isLineEffect = (s: string) => (LINE_EFFECTS as readonly string[]).includes(s.trim().toLowerCase());

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
