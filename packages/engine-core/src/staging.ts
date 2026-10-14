import type { Idle, PathPoint, Placement } from './types';

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

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Reads "30 98, 50 90 size 60 shake, 70 98 flip fade 40 as happy". Returns null when it is not a list of points. */
export function parsePathPoints(text: string): PathPoint[] | null {
  const out: PathPoint[] = [];
  for (const raw of text.split(',')) {
    const m = raw.trim().match(/^(-?\d+(?:\.\d+)?)%?\s+(-?\d+(?:\.\d+)?)%?(.*)$/);
    if (!m) return null;
    const p: PathPoint = { x: r1(Number(m[1])), y: r1(Number(m[2])) };
    let rest = m[3].trim();
    const look = rest.match(/\s*\bas\s+(.+)$/i);
    if (look) { p.look = look[1].trim(); rest = rest.slice(0, look.index).trim(); }
    const words = rest.toLowerCase().split(/\s+/).filter(Boolean);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w === 'size' && words[i + 1]) p.size = r1(Number(words[++i]) || 0);
      else if (w === 'fade' && words[i + 1]) p.fade = Math.max(0, Math.min(100, Math.round(Number(words[++i]) || 0)));
      else if (w === 'flip' || w === 'flipped') p.flip = true;
      else if (w === 'unflip' || w === 'unflipped') p.flip = false;
      else if (isLineEffect(w)) p.fx = w;
      else return null;
    }
    out.push(p);
  }
  return out.length >= 2 ? out : null;
}

export function pathPointsText(points: PathPoint[]): string {
  return points.map(p => [`${r1(p.x)} ${r1(p.y)}`, p.size !== undefined ? `size ${r1(p.size)}` : '', p.flip === true ? 'flip' : p.flip === false ? 'unflip' : '', p.fx ?? '', p.fade !== undefined ? `fade ${p.fade}` : '', p.look ? `as ${p.look.replace(/,/g, ' ')}` : ''].filter(Boolean).join(' ')).join(', ');
}

/** Where someone is on a path after some time: position, size, how visible, which way they face, and how many points they have passed. */
export interface PathState { x: number; y: number; size: number; fade: number; flip: boolean | undefined; passed: number; lap: number; done: boolean }

/** The stage is 16:9, so distances along a path count x as wider than y. */
const ASPECT = 16 / 9;

export function pathAt(points: PathPoint[], secs: number, repeat: 'loop' | 'pingpong' | undefined, ease: 'steady' | undefined, startSize: number, elapsed: number): PathState {
  const lens = [0];
  for (let i = 1; i < points.length; i++) lens.push(lens[i - 1] + Math.hypot((points[i].x - points[i - 1].x) * ASPECT, points[i].y - points[i - 1].y));
  const total = lens[lens.length - 1] || 1;
  const dur = Math.max(0.1, secs);
  let lap = Math.floor(elapsed / dur);
  let t = (elapsed % dur) / dur;
  let done = false;
  if (!repeat && elapsed >= dur) { t = 1; lap = 0; done = true; }
  if (repeat === 'pingpong' && lap % 2 === 1) t = 1 - t;
  const k = ease === 'steady' ? t : t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  const d = k * total;
  let i = 1;
  while (i < points.length - 1 && lens[i] < d) i++;
  const seg = lens[i] - lens[i - 1] || 1;
  const f = Math.max(0, Math.min(1, (d - lens[i - 1]) / seg));
  const a = points[i - 1], b = points[i];
  // Size and fade ease between the points that set them.
  const level = (key: 'size' | 'fade', start: number): number => {
    let pi = -1, pv = start, ni = -1, nv = start;
    for (let j = 0; j < points.length; j++) {
      const v = points[j][key];
      if (v === undefined) continue;
      if (lens[j] <= d) { pi = j; pv = v; } else { ni = j; nv = v; break; }
    }
    if (ni < 0) return pv;
    const from = pi < 0 ? 0 : lens[pi];
    return pv + (nv - pv) * ((d - from) / ((lens[ni] - from) || 1));
  };
  let flip: boolean | undefined;
  let passed = 0;
  for (let j = 0; j < points.length; j++) if (lens[j] <= d + 1e-6) { passed = j + 1; if (points[j].flip !== undefined) flip = points[j].flip; }
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, size: level('size', startSize), fade: level('fade', 100), flip, passed, lap, done };
}

/** Fewer points along a drawn line, keeping its shape (Ramer–Douglas–Peucker), at most max points. */
export function simplifyPath(points: { x: number; y: number }[], tolerance = 1.2, max = 24): { x: number; y: number }[] {
  if (points.length <= 2) return points;
  const rdp = (pts: { x: number; y: number }[], eps: number): { x: number; y: number }[] => {
    let worst = 0, at = 0;
    const [a, b] = [pts[0], pts[pts.length - 1]];
    const dx = (b.x - a.x) * ASPECT, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    for (let i = 1; i < pts.length - 1; i++) {
      const d = Math.abs(dy * (pts[i].x - a.x) * ASPECT - dx * (pts[i].y - a.y)) / len;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst <= eps) return [a, b];
    return [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)];
  };
  let eps = tolerance, out = rdp(points, eps);
  while (out.length > max) { eps *= 1.4; out = rdp(points, eps); }
  return out.map(p => ({ x: r1(p.x), y: r1(p.y) }));
}
