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
@media (orientation: portrait) and (max-width: 640px) {
  body { place-items: start center; overflow-y: auto; padding-top: 6vh; }
  .frame { width: 100vw; }
}
.titlescreen .found { position: relative; margin: 0; opacity: .75; font-size: .8em; letter-spacing: .05em; }
`;

interface Saved { roomId: string; facts: Facts; seen?: string[]; memory?: { picked: string[]; turns: Record<string, number> } }

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
  const buttons = store.load()
    ? '<button type="button" data-go="continue">Continue</button><button type="button" class="quiet" data-go="new">New game</button>'
    : '<button type="button" data-go="new">Start</button>';
  const key = `story-engine-save:${story.rooms[0]?.id ?? ''}`;
  // Endings: how many there are in the story, and which this player has found.
  const all = new Set<string>();
  for (const r of story.rooms) for (const e of r.els) for (const m of e.script.matchAll(/^\s*ending\s*:\s*(.+?)\s*$/gim)) all.add(m[1].toLowerCase());
  const found = (): string[] => { try { return JSON.parse(localStorage.getItem(`${key}:endings`) ?? '[]'); } catch { return []; } };
  const title_ = () => {
    const f = found().filter(x => all.has(x.toLowerCase()));
    const saved2 = store.load();
    const btns = saved2
      ? '<button type="button" data-go="continue">Continue</button><button type="button" class="quiet" data-go="new">New game</button>'
      : '<button type="button" data-go="new">Start</button>';
    frame.innerHTML = `<div class="stage" style="${lookStyle(story.look)}"><div class="titlescreen"><div class="bg">${backdropHTML(story.rooms[0]?.bg ?? null)}</div><h1>${esc(title)}</h1><div class="row">${btns}</div>${all.size ? `<p class="found">Endings found: ${f.length} of ${all.size}</p>` : ''}</div></div>`;
    frame.querySelector<HTMLButtonElement>('[data-go]')!.focus();
  };
  void buttons;
  title_();

  frame.addEventListener('click', function begin(e) {
    const go = (e.target as HTMLElement).closest<HTMLElement>('[data-go]')?.dataset.go;
    if (!go) return;
    if (!frame.querySelector('.titlescreen')) return;
    frame.replaceChildren();
    const from = go === 'continue' ? store.load() : null;
    if (!from) store.clear();
    let lastRoom = '';
    const player = createPlayer(frame, story, {
      roomId: from?.roomId,
      facts: from?.facts,
      seen: from?.seen,
      memory: from?.memory,
      storageKey: key,
      saveKey: key,
      hint: from ? undefined : 'Click someone or something to begin',
      onEnding(name) {
        const f = found();
        if (!f.some(x => x.toLowerCase() === name.toLowerCase())) { f.push(name); try { localStorage.setItem(`${key}:endings`, JSON.stringify(f)); } catch { /* not kept */ } }
        store.clear();
        player.destroy();
        title_();
      },
      // Saved on entering a room and whenever no conversation is running.
      onChange(st) {
        if (st.roomId !== lastRoom || !st.scene) { lastRoom = st.roomId; store.save({ roomId: st.roomId, facts: st.facts, seen: st.seen, memory: st.memory }); }
      }
    });
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
