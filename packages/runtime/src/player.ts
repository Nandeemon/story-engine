import { characterOf, createRunner, findLook, findRoomByName, parseScript } from '@story-engine/engine-core';
import type { ChoiceEvent, Facts, Project, Room, Runner, SayStep, StoryElement } from '@story-engine/engine-core';
import { choicesHTML, sayHTML, stageHTML } from './stage';

export interface PlayState {
  roomId: string;
  facts: Facts;
  /** Looks that hold until changed, by element id. */
  expr: Record<string, string>;
  /** Pictures for the current line only (one-off pictures), by element id. */
  lineExpr: Record<string, string>;
  /** What is on screen: a line, a choice, or nothing (the room is explorable). */
  event: SayStep | ChoiceEvent | null;
  /** A problem in the story itself, such as a door to a missing room. Shown to the author only. */
  problem: string;
}

export interface PlayerOptions {
  /** Start in this room instead of the first one. */
  roomId?: string;
  /** Start by running this element's conversation. */
  elementId?: string;
  /** Called after every change, so the editor can show story facts beside the game. */
  onChange?: (state: Readonly<PlayState>) => void;
}

export interface Player {
  state(): Readonly<PlayState>;
  destroy(): void;
}

/**
 * Runs a project inside a host element. The same player runs the editor's Play
 * button and the published game, so what the author sees is what the player gets.
 */
export function createPlayer(host: HTMLElement, project: Project, opts: PlayerOptions = {}): Player {
  const first = project.rooms.find(r => r.id === opts.roomId) ?? project.rooms[0];
  const s: PlayState = { roomId: first.id, facts: {}, expr: {}, lineExpr: {}, event: null, problem: '' };
  let runner: Runner | null = null;

  const room = (): Room => project.rooms.find(r => r.id === s.roomId) ?? project.rooms[0];
  const canTalk = (el: StoryElement) => !s.event && el.script.trim() !== '';

  function render(): void {
    const ev = s.event;
    const game = !ev ? '' : ev.t === 'say' ? sayHTML(ev.who, ev.text) : choicesHTML(ev.options);
    host.innerHTML = stageHTML(room(), { mode: 'play', look: project.look, expr: { ...s.expr, ...s.lineExpr }, clickable: canTalk, game, characters: project.characters });
    opts.onChange?.(s);
  }

  function enter(r: Room): void {
    s.roomId = r.id;
    s.event = null;
    runner = null;
    const auto = r.auto ? r.els.find(el => el.script.trim()) : undefined;
    if (auto) talk(auto); else render();
  }

  function talk(el: StoryElement): void {
    // Every conversation starts with each character's "Look at the start".
    s.expr = {};
    s.lineExpr = {};
    runner = createRunner(parseScript(el.script).steps, s.facts);
    advance();
  }

  function advance(): void {
    if (!runner) return;
    const ev = runner.next();
    s.problem = '';
    s.lineExpr = {};
    if (ev.t === 'say') {
      if (ev.expr) {
        const who = room().els.find(el => el.name.trim().toLowerCase() === ev.who.toLowerCase());
        const character = who && characterOf(project, who);
        // A picture of its own belongs to its line only; other looks hold until changed.
        if (who && character && findLook(character, ev.expr)?.once) s.lineExpr[who.id] = ev.expr;
        else if (who) s.expr[who.id] = ev.expr;
      }
      s.event = ev;
    } else if (ev.t === 'choice') {
      s.event = ev;
    } else if (ev.t === 'door') {
      const target = findRoomByName(project, ev.room);
      if (target) return enter(target);
      runner = null;
      s.event = null;
      s.problem = `There is no room called "${ev.room}".`;
    } else {
      runner = null;
      s.event = null;
      s.problem = ev.problem ?? '';
    }
    render();
  }

  function onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest('[data-next]')) return advance();
    const pick = t.closest<HTMLElement>('[data-pick]');
    if (pick && s.event?.t === 'choice') {
      s.event.pick(Number(pick.dataset.pick));
      s.event = null;
      return advance();
    }
    const elNode = t.closest<HTMLElement>('[data-el]');
    if (elNode) {
      const el = room().els.find(x => x.id === elNode.dataset.el);
      if (el && canTalk(el)) talk(el);
    }
  }

  function onKey(e: KeyboardEvent): void {
    if (s.event?.t !== 'say' || (e.key !== ' ' && e.key !== 'Enter')) return;
    if ((e.target as HTMLElement).closest('button, input, textarea, select')) return;
    e.preventDefault();
    advance();
  }

  host.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);

  const startEl = opts.elementId ? first.els.find(el => el.id === opts.elementId) : undefined;
  if (startEl) { render(); talk(startEl); } else enter(first);

  return {
    state: () => s,
    destroy() {
      host.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    }
  };
}
