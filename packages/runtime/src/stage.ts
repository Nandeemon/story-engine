import type { Backdrop, Look, Room, StoryElement } from '@story-engine/engine-core';
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
}

export function backdropHTML(bg: Backdrop | null): string {
  if (!bg) return '';
  if (bg.img) return `<img src="${esc(bg.img)}" alt="">`;
  return (BACKDROPS[bg.preset ?? ''] ?? BACKDROPS.cafe).svg;
}

export function elementArt(el: StoryElement, expr?: string): string {
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
    return `<button class="${cls}" data-el="${esc(el.id)}" style="left:${el.x}%;top:${el.y}%;height:${el.size}%" aria-label="${esc(el.name)}"${focus}>${elementArt(el, o.expr?.[el.id])}</button>`;
  }).join('');
  return `<div class="stage ${o.mode}" data-stage style="${lookStyle(o.look)}"><div class="bg">${backdropHTML(room.bg)}</div>${els}<div class="game">${o.game ?? ''}</div></div>`;
}

export function sayHTML(who: string, text: string, interactive = true): string {
  const attr = interactive ? 'data-next' : 'tabindex="-1"';
  return `<button class="say" ${attr}>${who ? `<span class="who">${esc(who)}</span>` : ''}${esc(text)}<span class="go">tap to continue</span></button>`;
}

export function choicesHTML(options: { text: string }[], interactive = true): string {
  return `<div class="choices">${options.map((o, i) => `<button ${interactive ? `data-pick="${i}"` : 'tabindex="-1"'}>${esc(o.text)}</button>`).join('')}</div>`;
}
