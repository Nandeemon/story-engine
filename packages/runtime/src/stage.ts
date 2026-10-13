import { findLook } from '@story-engine/engine-core';
import type { Backdrop, Character, Look, Room, StoryElement } from '@story-engine/engine-core';
import { BACKDROPS, CHARACTERS, FONTS, OBJECTS, THEMES, characterSVG, esc } from './art';

export type StageMode = 'edit' | 'look' | 'play';

export interface StageOptions {
  mode: StageMode;
  look: Look;
  /** Selected element id, drawn with selection marks in the editor. */
  selected?: string | null;
  /** Expression overrides by element id, set during play. */
  expr?: Record<string, string>;
  /** Which elements the player can click right now. */
  clickable?: (el: StoryElement) => boolean;
  /** HTML for the game layer: dialogue box, choices. */
  game?: string;
  /** Characters made from the author's pictures (project.characters). */
  characters?: Character[];
  /** Lining up a look: that look is drawn see-through over the base picture of that element. */
  lineup?: { elId: string; lookId: string };
}

/** A backdrop as an image source: the author's picture, or a starter backdrop drawn as SVG. */
export function backdropSrc(bg: Backdrop): string {
  if (bg.img) return bg.img;
  const svg = (BACKDROPS[bg.preset ?? ''] ?? BACKDROPS.cafe).svg.replace(/ preserveAspectRatio="[^"]*"/, '').replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" ');
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/**
 * Draws a backdrop the way the author set it: filling the stage with a chosen part
 * in view, showing the whole picture with soft or coloured edges, or stretched.
 */
export function backdropHTML(bg: Backdrop | null): string {
  if (!bg) return '';
  const src = esc(backdropSrc(bg));
  const fit = bg.fit ?? 'fill';
  if (fit === 'stretch') return `<img class="bgimg" src="${src}" alt="" style="object-fit:fill">`;
  if (fit === 'fit') {
    const edge = bg.edge === 'color'
      ? `<span class="bgedge" style="background:${esc(bg.color ?? '#000000')}"></span>`
      : `<img class="bgedge blur" src="${src}" alt="">`;
    return `${edge}<img class="bgimg" src="${src}" alt="" style="object-fit:contain">`;
  }
  const fx = bg.fx ?? 50, fy = bg.fy ?? 50, zoom = bg.zoom ?? 1;
  const z = zoom !== 1 ? `;transform:scale(${zoom});transform-origin:${fx}% ${fy}%` : '';
  return `<img class="bgimg" src="${src}" alt="" style="object-fit:cover;object-position:${fx}% ${fy}%${z}">`;
}

/**
 * Draws a look over the character's base picture. The base stays in place (hidden)
 * so every look of a character takes up the same box on the stage.
 */
function characterArt(el: StoryElement, c: Character, expr: string | undefined, lineupLook?: string): string {
  const look = lineupLook ? c.looks.find(l => l.id === lineupLook) : findLook(c, expr ?? el.expr);
  if (!look) return `<img class="base" src="${esc(c.base)}" alt="${esc(el.name)}">`;
  const t = `translate(${((look.dx - 0.5) * 100).toFixed(2)}%, ${(look.dy * 100).toFixed(2)}%) scale(${look.scale})`;
  return `<img class="base${lineupLook ? '' : ' off'}" src="${esc(c.base)}" alt="${lineupLook ? '' : esc(el.name)}"><img class="look${lineupLook ? ' ghost' : ''}" src="${esc(look.img)}" alt="${esc(`${el.name}, ${look.name}`)}" style="transform:${t}">`;
}

export function elementArt(el: StoryElement, expr?: string, characters: Character[] = [], lineupLook?: string): string {
  const c = el.characterId ? characters.find(x => x.id === el.characterId) : undefined;
  if (c) return characterArt(el, c, expr, lineupLook);
  if (el.img) return `<img src="${esc(el.img)}" alt="${esc(el.name)}">`;
  if (el.kind === 'char') return characterSVG({ ...(CHARACTERS[el.preset ?? ''] ?? CHARACTERS.mara), name: el.name }, expr ?? el.expr);
  return (OBJECTS[el.preset ?? ''] ?? OBJECTS.cup).svg;
}

/** CSS custom properties that carry the game's look into the stage. */
export function lookStyle(look: Look): string {
  const t = THEMES[look.theme] ?? THEMES.velvet;
  return `--g-font:${FONTS[look.font] ?? FONTS.Lora};--g-box:${t.box};--g-fg:${t.fg};--g-accent:${t.accent};--g-on:${t.on};--g-radius:${look.radius}px;--g-size:${look.size}`;
}

export function stageHTML(room: Room, o: StageOptions): string {
  const els = room.els.map(el => {
    const can = o.mode === 'play' && !!o.clickable?.(el);
    const cls = ['el', o.mode === 'edit' && el.id === o.selected ? 'sel' : '', can ? 'can' : ''].filter(Boolean).join(' ');
    const focus = o.mode === 'play' && !can ? ' tabindex="-1"' : '';
    const lineup = o.lineup?.elId === el.id ? o.lineup.lookId : undefined;
    return `<button class="${cls}${lineup ? ' lining' : ''}" data-el="${esc(el.id)}" style="left:${el.x}%;top:${el.y}%;height:${el.size}%" aria-label="${esc(el.name)}"${focus}>${elementArt(el, o.expr?.[el.id], o.characters, lineup)}</button>`;
  }).join('');
  return `<div class="stage ${o.mode}" data-stage style="${lookStyle(o.look)}"><div class="bg">${backdropHTML(room.bg)}</div>${els}<div class="game">${o.game ?? ''}</div></div>`;
}

export function sayHTML(who: string, text: string, interactive = true): string {
  const attr = interactive ? 'data-next' : 'tabindex="-1"';
  return `<button class="say" ${attr}>${who ? `<span class="who">${esc(who)}</span>` : ''}${esc(text)}<span class="go">tap to continue</span></button>`;
}

/**
 * The answers to a choice. By default they sit in the dialogue box under the
 * question that was just asked, so the picture stays clear; "center" lays them
 * over the middle of the screen instead.
 */
export function choicesHTML(options: { text: string }[], interactive = true, layout: 'box' | 'center' = 'center', question?: { who: string; text: string }): string {
  const buttons = options.map((o, i) => `<button ${interactive ? `data-pick="${i}"` : 'tabindex="-1"'}><span class="n">${i + 1}</span>${esc(o.text)}</button>`).join('');
  if (layout === 'center') return `<div class="choices">${buttons}</div>`;
  const q = question?.text ? `${question.who ? `<span class="who">${esc(question.who)}</span>` : ''}<p class="q">${esc(question.text)}</p>` : '';
  return `<div class="say choicebox" role="group" aria-label="Choose an answer">${q}<div class="answers">${buttons}</div></div>`;
}
