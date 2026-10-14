/**
 * Marks: small pictures on a character, such as an anger sign or a puff of air.
 * Starter marks are drawn here as SVG so they stay sharp at any size; authors can
 * add their own pictures (a GIF animates by itself) and change any mark's
 * animation and spot.
 */
import type { Character, MarkDef, MarkSpot, Project } from '@story-engine/engine-core';
import { esc } from './art';

interface Starter extends MarkSpot { name: string; anim: MarkDef['anim']; svg: string }

const V = (w: number, h: number, body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`;

/** Starter marks. x and y are the centre in percent of the character's picture; size is height in percent of it. */
export const STARTER_MARKS: Record<string, Starter> = {
  anger: { name: 'Anger', anim: 'pulse', x: 66, y: 7, size: 9, svg: V(100, 100,
    `<g fill="none" stroke="#e0263a" stroke-width="11" stroke-linecap="round">
      <path d="M40 14 Q44 36 22 40"/><path d="M60 14 Q56 36 78 40"/><path d="M40 86 Q44 64 22 60"/><path d="M60 86 Q56 64 78 60"/></g>
     <g fill="none" stroke="#ff8a96" stroke-width="3.5" stroke-linecap="round" opacity=".8">
      <path d="M40 16 Q43 34 25 38"/><path d="M60 16 Q57 34 75 38"/></g>`) },
  sweat: { name: 'Sweat', anim: 'drip', x: 64, y: 12, size: 7, svg: V(60, 90,
    `<path d="M30 4 C30 4 6 44 6 60 A24 24 0 0 0 54 60 C54 44 30 4 30 4Z" fill="#8fd3ff" stroke="#2c7fb8" stroke-width="4"/>
     <path d="M18 58 Q18 70 28 76" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/>`) },
  puff: { name: 'Puff', anim: 'drift', x: 74, y: 20, size: 9, svg: V(120, 80,
    `<g fill="#fff" stroke="#9aa3b5" stroke-width="4"><circle cx="30" cy="46" r="22"/><circle cx="62" cy="34" r="26"/><circle cx="92" cy="48" r="20"/></g>
     <path d="M20 54 Q60 70 100 54" fill="#fff"/>`) },
  hearts: { name: 'Hearts', anim: 'float', x: 70, y: 4, size: 11, svg: V(100, 100,
    `<path d="M50 88 C10 60 6 34 26 24 C38 18 48 26 50 34 C52 26 62 18 74 24 C94 34 90 60 50 88Z" fill="#ff5c8a" stroke="#c2185b" stroke-width="4"/>
     <path d="M30 34 Q30 28 36 27" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`) },
  sparkle: { name: 'Sparkle', anim: 'pulse', x: 30, y: 5, size: 8, svg: V(100, 100,
    `<path d="M50 2 C54 38 62 46 98 50 C62 54 54 62 50 98 C46 62 38 54 2 50 C38 46 46 38 50 2Z" fill="#ffe066" stroke="#e0a800" stroke-width="3"/>
     <path d="M82 10 C83 18 85 20 92 21 C85 22 83 24 82 32 C81 24 79 22 72 21 C79 20 81 18 82 10Z" fill="#fff6bf"/>`) },
  shock: { name: 'Shock', anim: 'pop', x: 50, y: -5, size: 12, svg: V(100, 100,
    `<g stroke="#222" stroke-width="7" stroke-linecap="round"><path d="M50 8 V30"/><path d="M22 18 L34 36"/><path d="M78 18 L66 36"/><path d="M8 44 L28 50"/><path d="M92 44 L72 50"/></g>
     <path d="M44 50 H56 L54 78 H46Z" fill="#e0263a"/><circle cx="50" cy="90" r="6" fill="#e0263a"/>`) },
  question: { name: 'Question', anim: 'bob', x: 66, y: -3, size: 11, svg: V(70, 100,
    `<path d="M14 30 C14 6 56 4 56 28 C56 44 36 46 36 62 V68" fill="none" stroke="#3d6bff" stroke-width="12" stroke-linecap="round"/>
     <circle cx="36" cy="88" r="8" fill="#3d6bff"/>`) },
  note: { name: 'Music note', anim: 'float', x: 70, y: 8, size: 8, svg: V(80, 100,
    `<path d="M30 78 V14 L70 6 V66" fill="none" stroke="#7a4dd8" stroke-width="8" stroke-linejoin="round"/>
     <ellipse cx="20" cy="80" rx="14" ry="10" fill="#7a4dd8"/><ellipse cx="60" cy="68" rx="14" ry="10" fill="#7a4dd8"/>`) },
  zzz: { name: 'Sleepy', anim: 'float', x: 70, y: 0, size: 11, svg: V(100, 100,
    `<g fill="none" stroke="#5a6bd8" stroke-width="7" stroke-linejoin="round" stroke-linecap="round">
      <path d="M50 10 H78 L50 38 H78"/><path d="M28 46 H48 L28 66 H48"/><path d="M12 76 H26 L12 90 H26"/></g>`) },
  gloom: { name: 'Gloom', anim: 'fade', x: 50, y: 8, size: 14, svg: V(100, 100,
    `<g stroke="#3b3f8f" stroke-width="5" opacity=".75"><path d="M14 0 V70"/><path d="M28 0 V86"/><path d="M42 0 V62"/><path d="M58 0 V80"/><path d="M72 0 V66"/><path d="M86 0 V84"/></g>`) },
  blush: { name: 'Blush', anim: 'none', x: 50, y: 13, size: 4, svg: V(200, 50,
    `<g fill="#ff7a9a" opacity=".55"><ellipse cx="38" cy="25" rx="34" ry="18"/><ellipse cx="162" cy="25" rx="34" ry="18"/></g>
     <g stroke="#e0456b" stroke-width="4" stroke-linecap="round" opacity=".8"><path d="M22 34 L32 16"/><path d="M36 34 L46 16"/><path d="M146 34 L156 16"/><path d="M160 34 L170 16"/></g>`) },
  tears: { name: 'Tears', anim: 'drip', x: 44, y: 16, size: 7, svg: V(60, 100,
    `<path d="M30 6 C30 6 10 48 10 62 A20 20 0 0 0 50 62 C50 48 30 6 30 6Z" fill="#a9ddff" stroke="#3a8fd0" stroke-width="4" opacity=".95"/>`) }
};

const lower = (s: string) => s.trim().toLowerCase();

/** A mark by name: the author's own (or their change to a starter mark) first, then the starter mark. */
export function findMark(project: Project, name: string): MarkDef | undefined {
  const key = lower(name);
  const own = project.marks?.find(m => m.name === key);
  if (own) return own;
  const s = STARTER_MARKS[key];
  return s ? { id: key, name: key, preset: key, anim: s.anim, x: s.x, y: s.y, size: s.size } : undefined;
}

/** Every mark the author can pick: starter marks (as changed) and their own. */
export function allMarks(project: Project): MarkDef[] {
  const starters = Object.keys(STARTER_MARKS).map(k => findMark(project, k)!);
  const own = (project.marks ?? []).filter(m => !m.preset || !STARTER_MARKS[m.preset]);
  return [...starters, ...own];
}

/** The picture of a mark, without its animation or spot. */
export function markArt(def: MarkDef): string {
  if (def.img) return `<img src="${esc(def.img)}" alt="">`;
  return STARTER_MARKS[def.preset ?? '']?.svg ?? '';
}

/** Where a mark sits on a character: the character's own spot for it, or the mark's. */
export function markSpot(def: MarkDef, character?: Character): MarkSpot {
  return character?.markAt?.[def.name] ?? { x: def.x, y: def.y, size: def.size };
}

const SPEED = [1.8, 1.35, 1, 0.72, 0.5];

/** A mark drawn on a character, inside the character's picture box. */
export function markHTML(def: MarkDef, character?: Character, opts: { who?: string } = {}): string {
  const at = markSpot(def, character);
  const d = SPEED[(def.speed ?? 3) - 1] ?? 1;
  const data = opts.who !== undefined ? ` data-mark="${esc(def.name)}" data-who="${esc(opts.who)}"` : '';
  return `<span class="mark"${data} style="left:${at.x}%;top:${at.y}%;height:${at.size}%;--mkd:${d}"><span class="mk an-${def.anim}">${markArt(def)}</span></span>`;
}
