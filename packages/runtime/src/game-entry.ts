/**
 * The published game. A game file is one HTML page holding the story as JSON
 * and this script, which shows a start screen and then runs the same player
 * the editor's Play button uses.
 */
import { normalizeProject } from '@story-engine/engine-core';
import type { Facts, Project } from '@story-engine/engine-core';
import gameCSS from './game.css?inline';
import { createPlayer } from './player';
import { backdropHTML, lookStyle } from './stage';
import { esc } from './art';

const PAGE_CSS = `
html, body { margin: 0; height: 100%; background: #0d0b14; }
body { display: grid; place-items: center; overflow: hidden; }
.frame { position: relative; width: min(100vw, calc(100dvh * 16 / 9)); }
.titlescreen { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.2em; font-family: var(--g-font); font-size: max(14px, calc(var(--g-size) * 1.2cqw)); color: var(--g-fg); text-align: center; }
.titlescreen .bg { position: absolute; inset: 0; filter: brightness(.45) blur(2px); transform: scale(1.03); }
.titlescreen h1 { position: relative; margin: 0 6%; font-size: 2.6em; font-weight: 600; line-height: 1.15; text-shadow: 0 2px 18px rgba(0, 0, 0, .5); }
.titlescreen button { position: relative; padding: .55em 2.2em; border: 0; border-radius: var(--g-radius); background: var(--g-accent); color: var(--g-on); font: inherit; font-weight: 600; cursor: pointer; }
.titlescreen button:hover { filter: brightness(1.1); }
.titlescreen .row { position: relative; display: flex; flex-wrap: wrap; justify-content: center; gap: .7em; }
.titlescreen button.quiet { background: transparent; color: var(--g-fg); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--g-fg) 60%, transparent); }
.titlescreen button:focus-visible { outline: 3px solid var(--g-fg); outline-offset: 3px; }
.turn { display: none; }
@media (orientation: portrait) and (max-width: 760px) {
  .turn { display: block; position: fixed; left: 0; right: 0; bottom: 8vh; color: #cfc8dc; font: 15px/1.4 system-ui, sans-serif; text-align: center; opacity: .8; }
}
`;

interface Saved { roomId: string; facts: Facts; seen?: string[] }

/** Progress is kept in this browser, so a player can close the game and continue later. */
function saveStore(p: Project) {
  // Keyed by the first room's id, which stays the same when the story is renamed.
  const key = `story-engine-save:${p.rooms[0]?.id ?? ''}`;
  return {
    load(): Saved | null {
      try {
        const v = JSON.parse(localStorage.getItem(key) ?? 'null') as Saved | null;
        return v && p.rooms.some(r => r.id === v.roomId) ? v : null;
      } catch { return null; }
    },
    save(v: Saved): void { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } },
    clear(): void { try { localStorage.removeItem(key); } catch { /* storage unavailable */ } }
  };
}

function start(): void {
  const data = document.getElementById('story');
  let project: Project | null = null;
  try { project = normalizeProject(JSON.parse(data?.textContent ?? '')); } catch { /* reported below */ }
  if (!project?.rooms.length) {
    document.body.textContent = 'This game file is damaged and cannot be played.';
    return;
  }
  const story = project;
  const title = story.title?.trim() || story.rooms[0]?.name || 'Untitled story';
  const style = document.createElement('style');
  style.textContent = gameCSS + PAGE_CSS;
  document.head.append(style);
  document.title = title;

  const frame = document.createElement('div');
  frame.className = 'frame';
  document.body.replaceChildren(frame);
  const store = saveStore(story);
  const saved = store.load();
  const buttons = saved
    ? '<button type="button" data-go="continue">Continue</button><button type="button" class="quiet" data-go="new">New game</button>'
    : '<button type="button" data-go="new">Start</button>';
  frame.innerHTML = `<div class="stage" style="${lookStyle(story.look)}"><div class="titlescreen"><div class="bg">${backdropHTML(story.rooms[0]?.bg ?? null)}</div><h1>${esc(title)}</h1><div class="row">${buttons}</div></div></div>`;
  document.body.insertAdjacentHTML('beforeend', '<p class="turn">Turn your phone sideways for a bigger picture.</p>');
  frame.querySelector<HTMLButtonElement>('[data-go]')!.focus();

  frame.addEventListener('click', function begin(e) {
    const go = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')?.dataset.go;
    if (!go) return;
    frame.removeEventListener('click', begin);
    frame.replaceChildren();
    const from = go === 'continue' ? saved : null;
    if (!from) store.clear();
    let lastRoom = '';
    createPlayer(frame, story, {
      roomId: from?.roomId,
      facts: from?.facts,
      seen: from?.seen,
      hint: from ? undefined : 'Click someone or something to begin',
      // Saved on entering a room and whenever no conversation is running.
      onChange(st) {
        if (st.roomId !== lastRoom || !st.scene) { lastRoom = st.roomId; store.save({ roomId: st.roomId, facts: st.facts, seen: st.seen }); }
      }
    });
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
