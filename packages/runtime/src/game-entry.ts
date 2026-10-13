/**
 * The published game. A game file is one HTML page holding the story as JSON
 * and this script, which shows a start screen and then runs the same player
 * the editor's Play button uses.
 */
import { normalizeProject } from '@story-engine/engine-core';
import type { Project } from '@story-engine/engine-core';
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
.titlescreen button:focus-visible { outline: 3px solid var(--g-fg); outline-offset: 3px; }
`;

function start(): void {
  const data = document.getElementById('story');
  let project: Project | null = null;
  try { project = normalizeProject(JSON.parse(data?.textContent ?? '')); } catch { /* reported below */ }
  if (!project?.rooms.length) {
    document.body.textContent = 'This game file is damaged and cannot be played.';
    return;
  }
  const story = project;
  const style = document.createElement('style');
  style.textContent = gameCSS + PAGE_CSS;
  document.head.append(style);
  const title = project.title?.trim() || project.rooms[0]?.name || 'Untitled story';
  document.title = title;

  const frame = document.createElement('div');
  frame.className = 'frame';
  document.body.replaceChildren(frame);
  frame.innerHTML = `<div class="stage" style="${lookStyle(project.look)}"><div class="titlescreen"><div class="bg">${backdropHTML(project.rooms[0]?.bg ?? null)}</div><h1>${esc(title)}</h1><button type="button" data-start>Start</button></div></div>`;
  const button = frame.querySelector<HTMLButtonElement>('[data-start]')!;
  button.focus();
  button.addEventListener('click', () => {
    frame.replaceChildren();
    createPlayer(frame, story);
  }, { once: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
