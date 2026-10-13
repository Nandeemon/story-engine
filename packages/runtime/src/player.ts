import { createRunner, findRoomByName, parseScript, stepsBefore } from '@story-engine/engine-core';
import type { ChoiceEvent, Facts, Project, Room, Runner, SayStep, StoryElement } from '@story-engine/engine-core';
import { applyToScene, nextMoment, roomScene, staged, stagedAttrs, startScene } from './scene';
import type { Scene } from './scene';
import { backdropHTML, choicesHTML, elementArt, lookStyle, sayHTML } from './stage';
import { esc } from './art';
import { hudHTML } from './hud';

export interface PlayState {
  roomId: string;
  facts: Facts;
  /** What is on screen: a line, a choice, or nothing (the room is explorable). */
  event: SayStep | ChoiceEvent | null;
  /** A problem in the story itself, such as a door to a missing room. Shown to the author only. */
  problem: string;
  /** The scene while a conversation runs; null while the player explores the room. */
  scene: Scene | null;
}

export interface PlayerOptions {
  /** Start in this room instead of the first one. */
  roomId?: string;
  /** Start by running this element's conversation. */
  elementId?: string;
  /** Start the element's conversation at this step instead of its first line (for testing). */
  startPath?: string;
  /** Story facts to start with (for testing); otherwise every fact starts unset. */
  facts?: Facts;
  /** A short line shown over the first room until the player starts a conversation, for published games. */
  hint?: string;
  /** Called after every change, so the editor can show story facts beside the game. */
  onChange?: (state: Readonly<PlayState>) => void;
}

export interface Player {
  state(): Readonly<PlayState>;
  destroy(): void;
}

const FX_CLASSES = ['in-fade', 'in-left', 'in-right', 'in-pop', 'out-fade', 'out-left', 'out-right', 'shake', 'bounce', 'jump', 'flash'].map(f => `fx-${f}`);

/**
 * Runs a project inside a host element. The same player runs the editor's Play
 * button and the published game, so what the author sees is what the player gets.
 * The stage is updated in place, so moves, entrances and exits animate.
 */
export function createPlayer(host: HTMLElement, project: Project, opts: PlayerOptions = {}): Player {
  const first = project.rooms.find(r => r.id === opts.roomId) ?? project.rooms[0];
  const s: PlayState = { roomId: first.id, facts: { ...(opts.facts ?? {}) }, event: null, problem: '', scene: null };
  let runner: Runner | null = null;
  let builtRoom = '';
  /** The last line shown, so a choice can keep the question in the dialogue box. */
  let lastLine: SayStep | null = null;
  /** When the current choice appeared: picks in the first moment are ignored, so a quick double tap on "continue" cannot choose. */
  let choiceShownAt = 0;
  /** Whether the player has started a conversation yet; the hint shows until then. */
  let talked = false;
  const tooSoon = () => performance.now() - choiceShownAt < 400;

  const room = (): Room => project.rooms.find(r => r.id === s.roomId) ?? project.rooms[0];
  const canTalk = (el: StoryElement) => !s.event && !s.scene && el.script.trim() !== '';

  /** Draws the room's backdrop and objects once per room; characters are kept up to date by render. */
  function build(): void {
    const r = room();
    const objects = r.els.filter(e => e.kind !== 'char').map(e =>
      `<button class="el" data-el="${esc(e.id)}" style="left:${e.x}%;top:${e.y}%;height:${e.size}%" aria-label="${esc(e.name)}">${elementArt(e, undefined, project.characters)}</button>`).join('');
    host.innerHTML = `<div class="stage play" data-stage style="${lookStyle(project.look)}"><div class="bg">${backdropHTML(r.bg)}</div>${objects}<div class="hudlayer"></div><div class="game"></div></div>`;
    builtRoom = r.id;
  }

  function render(): void {
    if (builtRoom !== s.roomId) build();
    const stage = host.querySelector<HTMLElement>('[data-stage]')!;
    const game = stage.querySelector<HTMLElement>('.game')!;
    const r = room();
    const scene = s.scene ?? roomScene(r);
    const keep = new Set<string>();

    for (const c of scene.chars) {
      keep.add(c.key);
      let node = stage.querySelector<HTMLElement>(`[data-el="${CSS.escape(c.key)}"]`);
      if (!node) {
        node = document.createElement('button');
        node.dataset.el = c.key;
        stage.insertBefore(node, stage.querySelector('.hudlayer') ?? game);
      }
      const el = r.els.find(e => e.id === c.elId);
      const clickable = !!el && canTalk(el) && c.visible;
      const a = stagedAttrs(c);
      const fx = [...node.classList].filter(x => FX_CLASSES.includes(x));
      node.className = `${a.cls}${clickable ? ' can' : ''}`;
      fx.forEach(x => node!.classList.add(x));
      node.style.cssText = a.style;
      node.setAttribute('aria-label', c.name);
      node.tabIndex = clickable ? 0 : -1;
      const artKey = `${c.characterId ?? c.preset ?? ''}|${c.lineLook || c.look}`;
      if (node.dataset.art !== artKey) {
        node.innerHTML = `<span class="art">${staged(c, project.characters)}</span>`;
        node.dataset.art = artKey;
      }
      if (c.fx) {
        FX_CLASSES.forEach(x => node!.classList.remove(x));
        void node.offsetWidth; // restart the animation
        node.classList.add(`fx-${c.fx}`);
      }
    }
    // Characters brought in for a conversation leave when it ends.
    stage.querySelectorAll<HTMLElement>('.el.staged').forEach(n => {
      if (keep.has(n.dataset.el ?? '')) return;
      n.classList.add('gone');
      setTimeout(() => n.remove(), 450);
    });
    stage.querySelectorAll<HTMLElement>('.el:not(.staged)').forEach(n => {
      const el = r.els.find(e => e.id === n.dataset.el);
      n.classList.toggle('can', !!el && canTalk(el));
      n.tabIndex = el && canTalk(el) ? 0 : -1;
    });

    const hud = stage.querySelector<HTMLElement>('.hudlayer');
    if (hud) hud.innerHTML = hudHTML(project.hud, s.facts);
    const ev = s.event;
    const showHint = !ev && !s.scene && !talked && !!opts.hint && r.els.some(canTalk);
    game.innerHTML = !ev ? (showHint ? `<div class="gamehint">${esc(opts.hint!)}</div>` : '') : ev.t === 'say' ? sayHTML(ev.who, ev.text)
      : choicesHTML(ev.options, true, project.look.choices ?? 'box', lastLine ?? undefined);
    if (ev?.t === 'choice') choiceShownAt = performance.now();
    opts.onChange?.(s);
  }

  function enter(r: Room): void {
    s.roomId = r.id;
    s.event = null;
    s.scene = null;
    runner = null;
    const auto = r.auto ? r.els.find(el => el.script.trim()) : undefined;
    if (auto) talk(auto); else render();
  }

  function talk(el: StoryElement, startAt?: string): void {
    lastLine = null;
    talked = true;
    // The clicked character keeps focus otherwise, and keys on a button would not reach the dialogue.
    const focused = document.activeElement as HTMLElement | null;
    if (focused && host.contains(focused)) focused.blur();
    const steps = parseScript(el.script).steps;
    const scene = startScene(room(), el, steps);
    // Starting partway: the scene is set as it would stand by then.
    if (startAt) for (const st of stepsBefore(steps, startAt)) { applyToScene(scene, st, project); nextMoment(scene); }
    s.scene = scene;
    runner = createRunner(steps, s.facts, step => applyToScene(scene, step, project), startAt);
    advance();
  }

  function finish(problem = ''): void {
    runner = null;
    s.event = null;
    s.scene = null;
    s.problem = problem;
    render();
  }

  function advance(): void {
    if (!runner) return;
    if (s.scene) nextMoment(s.scene);
    const ev = runner.next();
    s.problem = '';
    if (ev.t === 'say') {
      if (s.scene) applyToScene(s.scene, ev, project);
      s.event = ev;
      lastLine = ev;
    } else if (ev.t === 'choice') {
      s.event = ev;
    } else if (ev.t === 'door') {
      const target = findRoomByName(project, ev.room);
      if (target) return enter(target);
      return finish(`There is no room called "${ev.room}".`);
    } else {
      return finish(ev.problem ?? '');
    }
    render();
  }

  function onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest('[data-next]')) return advance();
    const pick = t.closest<HTMLElement>('[data-pick]');
    if (pick && s.event?.t === 'choice') {
      if (tooSoon()) return;
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
    // Number keys pick an answer.
    if (s.event?.t === 'choice' && /^[1-9]$/.test(e.key) && !(e.target as HTMLElement).closest('input, textarea, select')) {
      const k = Number(e.key) - 1;
      if (k < s.event.options.length && !tooSoon()) { e.preventDefault(); s.event.pick(k); s.event = null; advance(); }
      return;
    }
    // Space or Enter left over from reading must not choose an answer.
    if (s.event?.t === 'choice' && (e.key === ' ' || e.key === 'Enter') && tooSoon()) { e.preventDefault(); return; }
    if (s.event?.t !== 'say' || (e.key !== ' ' && e.key !== 'Enter')) return;
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select') || (t.closest('button') && !t.closest('[data-el]'))) return;
    e.preventDefault();
    advance();
  }

  host.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);

  const startEl = opts.elementId ? first.els.find(el => el.id === opts.elementId) : undefined;
  if (startEl) { render(); talk(startEl, opts.startPath); } else enter(first);

  return {
    state: () => s,
    destroy() {
      host.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    }
  };
}
