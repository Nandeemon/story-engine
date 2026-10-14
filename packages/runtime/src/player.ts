import { createRunner, findLook, findRoomByName, parseScript, pathAt, startFacts, stepsBefore, talkedFact } from '@story-engine/engine-core';
import type { PathStep } from '@story-engine/engine-core';
import type { ChoiceEvent, Facts, Project, Room, Runner, SayStep, StoryElement } from '@story-engine/engine-core';
import { applyToScene, fxVars, nextMoment, present, roomScene, staged, stagedAttrs, stagedKey, startScene } from './scene';
import type { Scene } from './scene';
import { areaArt, backdropHTML, choicesHTML, elementArt, elementStyle, lookStyle, sayHTML } from './stage';
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
  /** Conversations finished (element ids) and rooms visited ("room:<id>"), for one-time conversations and first visits. */
  seen: string[];
}

export interface PlayerOptions {
  /** Start in this room instead of the first one. */
  roomId?: string;
  /** Start by running this element's conversation. */
  elementId?: string;
  /** Start the element's conversation at this step instead of its first line (for testing). */
  startPath?: string;
  /** Story facts to start with (for testing, or a saved game); otherwise every fact starts unset. */
  facts?: Facts;
  /** Conversations had and rooms visited, from a saved game. */
  seen?: string[];
  /** A short line shown over the first room until the player starts a conversation, for published games. */
  hint?: string;
  /** Called after every change, so the editor can show story facts beside the game. */
  onChange?: (state: Readonly<PlayState>) => void;
}

export interface Player {
  state(): Readonly<PlayState>;
  destroy(): void;
}

const FX_CLASSES = ['in-fade', 'in-left', 'in-right', 'in-pop', 'out-fade', 'out-left', 'out-right', 'shake', 'tremble', 'pulse', 'pop', 'bounce', 'jump', 'flash'].map(f => `fx-${f}`);

/**
 * Runs a project inside a host element. The same player runs the editor's Play
 * button and the published game, so what the author sees is what the player gets.
 * The stage is updated in place, so moves, entrances and exits animate.
 */
export function createPlayer(host: HTMLElement, project: Project, opts: PlayerOptions = {}): Player {
  const first = project.rooms.find(r => r.id === opts.roomId) ?? project.rooms[0];
  const s: PlayState = { roomId: first.id, facts: { ...startFacts(project), ...(opts.facts ?? {}) }, event: null, problem: '', scene: null, seen: [...(opts.seen ?? [])] };
  /** The element whose conversation is running. */
  let talking: StoryElement | null = null;
  const sounds = new Map<string, HTMLAudioElement>();
  function playSound(name: string | undefined): void {
    const key = (name ?? '').trim().toLowerCase();
    const snd = key ? project.sounds?.find(x => x.name.toLowerCase() === key) : undefined;
    if (!snd) return;
    let a = sounds.get(snd.id);
    if (!a) { a = new Audio(snd.data); sounds.set(snd.id, a); }
    a.volume = (snd.volume ?? 100) / 100;
    a.currentTime = 0;
    void a.play().catch(() => { /* the browser may block sound until the player interacts */ });
  }

  /* Background music: one track at a time, faded in and out. */
  let music: { key: string; el: HTMLAudioElement; target: number } | null = null;
  function fade(el: HTMLAudioElement, to: number, ms: number, then?: () => void): void {
    const from = el.volume, start = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / ms);
      el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
      if (k < 1) requestAnimationFrame(tick); else then?.();
    };
    requestAnimationFrame(tick);
  }
  function stopMusic(now = false): void {
    if (!music) return;
    const el = music.el;
    music = null;
    if (now) el.pause(); else fade(el, 0, 600, () => el.pause());
  }
  function playMusic(track: string, once = false): void {
    const key = track.trim().toLowerCase();
    if (!key) return stopMusic();
    if (music?.key === key) { music.el.loop = !once; return; }
    const snd = project.sounds?.find(x => x.name.toLowerCase() === key);
    if (!snd) return;
    stopMusic();
    const el = new Audio(snd.data);
    el.loop = !once;
    el.volume = 0;
    const target = (snd.volume ?? 100) / 100;
    music = { key, el, target };
    void el.play().then(() => fade(el, target, 800)).catch(() => { /* blocked until the player interacts */ });
  }
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
  const here = (el: StoryElement) => present(el, s);
  const canTalk = (el: StoryElement) => !s.event && !s.scene && el.script.trim() !== '' && here(el) && !(el.once && s.seen.includes(el.id));

  /** Draws the room's backdrop and objects once per room; characters are kept up to date by render. */
  function build(): void {
    const r = room();
    const objects = r.els.filter(e => e.kind !== 'char').map(e =>
      `<button class="el${e.kind === 'area' ? ' area' : ''}" data-el="${esc(e.id)}" style="${elementStyle(e)}" aria-label="${esc(e.name)}">${e.kind === 'area' ? areaArt(e, false) : elementArt(e, undefined, project.characters)}</button>`).join('');
    host.innerHTML = `<div class="stage play" data-stage style="${lookStyle(project.look)}"><div class="bg">${backdropHTML(r.bg)}</div>${objects}<div class="hudlayer"></div><div class="game"></div></div>`;
    builtRoom = r.id;
  }

  function render(): void {
    if (builtRoom !== s.roomId) build();
    const stage = host.querySelector<HTMLElement>('[data-stage]')!;
    const game = stage.querySelector<HTMLElement>('.game')!;
    const r = room();
    const scene = s.scene ?? roomScene(r, s);
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
      if (c.fx) node.style.cssText += `;${fxVars(c.fxOpts)}`;
      node.setAttribute('aria-label', c.name);
      node.tabIndex = clickable ? 0 : -1;
      const artKey = stagedKey(c);
      if (node.dataset.art !== artKey) {
        node.innerHTML = `<span class="art">${staged(c, project)}</span>`;
        node.dataset.art = artKey;
      }
      if (c.fx) {
        FX_CLASSES.forEach(x => node!.classList.remove(x));
        void node.offsetWidth; // restart the animation
        node.classList.add(`fx-${c.fx}`);
      }
    }
    startPaths(stage);
    // Characters brought in for a conversation leave when it ends.
    stage.querySelectorAll<HTMLElement>('.el.staged').forEach(n => {
      if (keep.has(n.dataset.el ?? '')) return;
      n.classList.add('gone');
      setTimeout(() => n.remove(), 450);
    });
    stage.querySelectorAll<HTMLElement>('.el:not(.staged)').forEach(n => {
      const el = r.els.find(e => e.id === n.dataset.el);
      n.hidden = !el || !here(el);
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
    if (ev?.t === 'say') startTyping(game); else stopTyping();
    opts.onChange?.(s);
  }

  /* Letter by letter: the whole line is laid out at once (the rest hidden), so the box keeps its size while it fills. */
  let typing: { timer: number; done: () => void } | null = null;
  function stopTyping(): void {
    if (typing) { clearInterval(typing.timer); typing = null; }
  }
  function startTyping(game: HTMLElement): void {
    stopTyping();
    const cps = project.look.typing ?? 0;
    const span = game.querySelector<HTMLElement>('.say .txt');
    if (!cps || !span || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const text = span.textContent ?? '';
    span.innerHTML = '<span class="now"></span><span class="later"></span>';
    const now = span.firstElementChild as HTMLElement, later = span.lastElementChild as HTMLElement;
    let i = 0;
    const show = () => { now.textContent = text.slice(0, i); later.textContent = text.slice(i); };
    show();
    const step = Math.max(1, Math.round(cps / 40));
    const done = () => { i = text.length; show(); stopTyping(); };
    const timer = window.setInterval(() => { i = Math.min(text.length, i + step); show(); if (i >= text.length) stopTyping(); }, 1000 * step / cps);
    typing = { timer, done };
  }
  /** A click or key while a line is still appearing shows the rest of it; the next one goes on. */
  function skipTyping(): boolean {
    if (!typing) return false;
    typing.done();
    return true;
  }

  /** A look's own sound, when a line switches the speaker to it. */
  function lookSound(ev: SayStep): string | undefined {
    if (!ev.expr || !ev.who) return undefined;
    const key = ev.who.trim().toLowerCase();
    const c = project.characters.find(x => x.name.trim().toLowerCase() === key);
    return c ? findLook(c, ev.expr)?.sound : undefined;
  }

  /* Drawn paths run on their own clock, so characters keep moving while lines are read. */
  const paths = new Map<string, { step: PathStep; start: number; startSize: number; passed: number; lap: number }>();
  let pathFrame = 0;
  function startPaths(stage: HTMLElement): void {
    const scene = s.scene;
    for (const key of [...paths.keys()]) if (!scene?.chars.some(c => c.key === key && c.path?.step === paths.get(key)!.step)) paths.delete(key);
    for (const c of scene?.chars ?? []) {
      if (!c.path || paths.get(c.key)?.step === c.path.step) continue;
      paths.set(c.key, { step: c.path.step, start: performance.now(), startSize: c.path.startSize, passed: 0, lap: 0 });
    }
    if (paths.size && !pathFrame) pathFrame = requestAnimationFrame(() => tickPaths(stage));
  }
  function tickPaths(stage: HTMLElement): void {
    pathFrame = 0;
    const scene = s.scene;
    if (!scene) { paths.clear(); return; }
    const now = performance.now();
    for (const [key, run] of paths) {
      const c = scene.chars.find(x => x.key === key);
      const node = stage.querySelector<HTMLElement>(`[data-el="${CSS.escape(key)}"]`);
      if (!c || !node || c.path?.step !== run.step) { paths.delete(key); continue; }
      const st = pathAt(run.step.points, run.step.secs, run.step.repeat, run.step.ease, run.startSize, (now - run.start) / 1000);
      if (st.lap !== run.lap) { run.lap = st.lap; run.passed = 0; }
      c.x = st.x; c.y = st.y; c.size = st.size; c.fade = st.fade;
      if (st.flip !== undefined) c.flip = st.flip;
      node.style.left = `${st.x}%`;
      node.style.top = `${st.y}%`;
      node.style.height = `${st.size}%`;
      node.style.opacity = st.fade < 100 ? String(st.fade / 100) : '';
      node.classList.toggle('flip', c.flip);
      // Points passed since the last frame play their effect and switch the look.
      for (let i = run.passed; i < st.passed; i++) {
        const pt = run.step.points[i];
        if (pt.look) { c.look = pt.look; node.innerHTML = `<span class="art">${staged(c, project)}</span>`; node.dataset.art = stagedKey(c); }
        if (pt.fx) { FX_CLASSES.forEach(x => node.classList.remove(x)); void node.offsetWidth; node.classList.add(`fx-${pt.fx}`); }
      }
      run.passed = st.passed;
      if (st.done) { c.path = undefined; node.classList.remove('onpath'); paths.delete(key); }
    }
    if (paths.size) pathFrame = requestAnimationFrame(() => tickPaths(stage));
  }

  function enter(r: Room): void {
    s.roomId = r.id;
    s.event = null;
    s.scene = null;
    runner = null;
    if (r.music === 'off') stopMusic(); else if (r.music) playMusic(r.music, r.musicOnce);
    const visit = `room:${r.id}`;
    const firstVisit = !s.seen.includes(visit);
    if (firstVisit) s.seen.push(visit);
    const chosen = r.autoEl ? r.els.find(el => el.id === r.autoEl) : r.els.find(el => el.script.trim() && canTalk(el));
    const auto = r.auto && (firstVisit || !r.autoOnce) && chosen && canTalk(chosen) ? chosen : undefined;
    if (auto) talk(auto); else render();
  }

  /** A conversation has run to its end (or out through a door): one-time conversations are now used up. */
  function done(): void {
    if (talking && !s.seen.includes(talking.id)) s.seen.push(talking.id);
    // "talked.lin" counts the conversations had with Lin, for Only if.
    if (talking?.kind === 'char') { const f = talkedFact(talking.name); s.facts[f] = (Number(s.facts[f]) || 0) + 1; }
    talking = null;
  }

  function talk(el: StoryElement, startAt?: string): void {
    lastLine = null;
    talked = true;
    talking = el;
    playSound(el.sound);
    // The clicked character keeps focus otherwise, and keys on a button would not reach the dialogue.
    const focused = document.activeElement as HTMLElement | null;
    if (focused && host.contains(focused)) focused.blur();
    const steps = parseScript(el.script).steps;
    const scene = startScene(room(), el, steps, s);
    // Starting partway: the scene is set as it would stand by then.
    if (startAt) {
      let track: { track: string; once?: boolean } | null = null;
      for (const st of stepsBefore(steps, startAt)) { if (st.t === 'music') track = st; applyToScene(scene, st, project); nextMoment(scene); }
      if (track) playMusic(track.track, track.once);
    }
    s.scene = scene;
    runner = createRunner(steps, s.facts, step => { if (step.t === 'music') playMusic(step.track, step.once); else applyToScene(scene, step, project); }, startAt);
    advance();
  }

  function finish(problem = ''): void {
    done();
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
      playSound(ev.sound || lookSound(ev));
    } else if (ev.t === 'choice') {
      s.event = ev;
    } else if (ev.t === 'door') {
      const target = findRoomByName(project, ev.room);
      done();
      if (target) return enter(target);
      return finish(`There is no room called "${ev.room}".`);
    } else {
      return finish(ev.problem ?? '');
    }
    render();
  }

  function onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (t.closest('[data-next]')) { if (skipTyping()) return; return advance(); }
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
    if (skipTyping()) return;
    advance();
  }

  host.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);

  const startEl = opts.elementId ? first.els.find(el => el.id === opts.elementId) : undefined;
  if (startEl) { render(); talk(startEl, opts.startPath); } else enter(first);

  return {
    state: () => s,
    destroy() {
      stopTyping();
      cancelAnimationFrame(pathFrame);
      paths.clear();
      stopMusic(true);
      sounds.forEach(a => a.pause());
      host.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    }
  };
}
