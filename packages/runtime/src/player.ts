import { activeSituations, createRunner, fillText, pickConversation, roomSetting, scriptByKey, panelFactKey, panelVisible, findLook, findRoomByName, parseScript, pathAt, startFacts, stepsBefore, talkedFact } from '@story-engine/engine-core';
import type { AskEvent, ChoiceEvent, DoorStep, Facts, PathStep, Project, Room, RunMemory, Runner, RunnerPlace, SayStep, Step, StoryElement } from '@story-engine/engine-core';
import { applyToScene, fxVars, nextMoment, present, roomScene, staged, stagedAttrs, stagedKey, startScene } from './scene';
import type { Scene } from './scene';
import { areaArt, areaClip, backdropHTML, choicesHTML, elementArt, elementStyle, lookStyle, sayHTML } from './stage';
import { esc } from './art';
import { panelsHTML } from './panels';

export interface PlayState {
  roomId: string;
  facts: Facts;
  /** What is on screen: a line, a choice, a question, or nothing (the room is explorable). */
  event: SayStep | ChoiceEvent | AskEvent | null;
  /** A problem in the story itself, such as a door to a missing room. Shown to the author only. */
  problem: string;
  /** The scene while a conversation runs; null while the player explores the room. */
  scene: Scene | null;
  /** Conversations finished (element ids) and rooms visited ("room:<id>"), for one-time conversations and first visits. */
  seen: string[];
  /** Answers picked that were "once", and how far "in turn" lines have come. */
  memory: RunMemory;
}

/** What a saved game holds. */
export interface SavedGame { roomId: string; facts: Facts; seen: string[]; memory?: RunMemory; when?: number; label?: string }

export interface PlayerOptions {
  /** Start in this room instead of the first one. */
  roomId?: string;
  /** Start by running this element's conversation. */
  elementId?: string;
  /** Start with this one of the element's conversations (its id in convos, or '' for its own script) instead of the one its conditions pick. */
  convoId?: string;
  /** Start the element's conversation at this step instead of its first line (for testing). */
  startPath?: string;
  /** Story facts to start with (for testing, or a saved game); otherwise every fact starts at its start value or unset. */
  facts?: Facts;
  /** Conversations had and rooms visited, from a saved game. */
  seen?: string[];
  memory?: RunMemory;
  /** A short line shown over the first room until the player starts a conversation, for published games. */
  hint?: string;
  /** Where the player's settings and lines read are kept in this browser. */
  storageKey?: string;
  /** Save slots in the game menu, kept under this key; left out, the menu has no Save and Load. */
  saveKey?: string;
  /** Called when the story reaches an ending, after the player closes the ending card. */
  onEnding?: (name: string) => void;
  /** Called after every change, so the editor can show story facts beside the game. */
  onChange?: (state: Readonly<PlayState>) => void;
}

export interface Player {
  state(): Readonly<PlayState>;
  destroy(): void;
}

/** What the player can change in the game's settings. */
interface Settings { speed: 'story' | 'off' | 'slow' | 'normal' | 'fast'; music: number; sound: number; auto: boolean; skip: boolean; read: boolean }
const DEFAULT_SETTINGS: Settings = { speed: 'story', music: 80, sound: 90, auto: false, skip: false, read: false };
const SPEEDS: Record<Settings['speed'], number | null> = { story: null, off: 0, slow: 20, normal: 40, fast: 90 };

const FX_CLASSES = ['in-fade', 'in-left', 'in-right', 'in-pop', 'out-fade', 'out-left', 'out-right', 'shake', 'tremble', 'pulse', 'pop', 'bounce', 'jump', 'flash'].map(f => `fx-${f}`);

/** One moment the player can go back to: everything needed to show it again exactly. */
interface Moment {
  event: SayStep | ChoiceEvent | AskEvent;
  runner: Runner;
  place: RunnerPlace;
  facts: Facts;
  seen: string[];
  memory: RunMemory;
  scene: Scene | null;
  roomId: string;
  talking: StoryElement | null;
  lastLine: SayStep | null;
  history: number;
}

const clone = <T>(v: T): T => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

/**
 * Runs a project inside a host element. The same player runs the editor's Play
 * button and the published game, so what the author sees is what the player gets.
 * The stage is updated in place, so moves, entrances and exits animate.
 */
export function createPlayer(host: HTMLElement, project: Project, opts: PlayerOptions = {}): Player {
  const first = project.rooms.find(r => r.id === opts.roomId) ?? project.rooms[0];
  const s: PlayState = {
    roomId: first.id, facts: { ...startFacts(project), ...(opts.facts ?? {}) }, event: null, problem: '', scene: null,
    seen: [...(opts.seen ?? [])], memory: opts.memory ? clone(opts.memory) : { picked: [], turns: {} }
  };
  const storeKey = opts.storageKey ?? 'story-engine-game';
  const load = <T>(key: string, fallback: T): T => { try { const v = localStorage.getItem(key); return v ? { ...fallback, ...JSON.parse(v) } : fallback; } catch { return fallback; } };
  const keep = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } };
  const settings: Settings = load(`${storeKey}:settings`, { ...DEFAULT_SETTINGS });
  /** Lines the player has read before, for skipping. */
  const read = new Set<string>((() => { try { return JSON.parse(localStorage.getItem(`${storeKey}:read`) ?? '[]') as string[]; } catch { return []; } })());
  const markRead = (key: string) => { if (read.has(key)) return; read.add(key); if (read.size % 10 === 0) keep(`${storeKey}:read`, [...read]); };

  /** The element whose conversation is running. */
  let talking: StoryElement | null = null;
  /** Conversations are read once, so going back can return to the very same steps. */
  const parsed = new Map<string, Step[]>();
  const stepsOf = (key: string, script: string) => { let st = parsed.get(key); if (!st) { st = parseScript(script).steps; parsed.set(key, st); } return st; };
  /** What quest conditions need. */
  const ctx = { quests: project.quests };

  /* ---------- Sound, voices and music ---------- */
  const sounds = new Map<string, HTMLAudioElement>();
  const findSound = (name: string | undefined) => { const key = (name ?? '').trim().toLowerCase(); return key ? project.sounds?.find(x => x.name.toLowerCase() === key) : undefined; };
  function playSound(name: string | undefined, loop = false): void {
    const snd = findSound(name);
    if (!snd) return;
    let a = sounds.get(snd.id);
    if (!a) { a = new Audio(snd.data); sounds.set(snd.id, a); }
    a.volume = (snd.volume ?? 100) / 100 * settings.sound / 100;
    a.loop = loop;
    a.currentTime = 0;
    void a.play().catch(() => { /* the browser may block sound until the player interacts */ });
  }
  /** Stops one sound by name, or every sound (and the voice) when no name is given. */
  function stopSound(name?: string): void {
    if (name) { const snd = findSound(name); const a = snd && sounds.get(snd.id); if (a) { a.pause(); a.loop = false; } return; }
    sounds.forEach(a => { a.pause(); a.loop = false; });
    voice?.pause();
  }
  /** Sounds that loop are tied to the room they started in. */
  const stopLoops = () => sounds.forEach(a => { if (a.loop) { a.pause(); a.loop = false; } });
  let voice: HTMLAudioElement | null = null;
  function playVoice(name: string | undefined): void {
    voice?.pause();
    voice = null;
    const snd = findSound(name);
    if (!snd) return;
    voice = new Audio(snd.data);
    voice.volume = (snd.volume ?? 100) / 100 * settings.sound / 100;
    void voice.play().catch(() => undefined);
  }
  let music: { key: string; el: HTMLAudioElement; base: number } | null = null;
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
    const base = (snd.volume ?? 100) / 100;
    music = { key, el, base };
    void el.play().then(() => fade(el, base * settings.music / 100, 800)).catch(() => { /* blocked until the player interacts */ });
  }
  function speak(ev: SayStep): void {
    if (!settings.read || !('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(ev.who ? `${ev.who}. ${ev.text}` : ev.text));
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
  /** Lines read and answers picked, for the history. */
  const history: { who: string; text: string; answer?: boolean }[] = [];
  /** Moments to go back to. */
  const moments: Moment[] = [];
  /** An overlay the player opened: history, settings, saves, an ending card. */
  let overlay: 'history' | 'settings' | 'saves' | null = null;
  let ending: string | null = null;

  const room = (): Room => project.rooms.find(r => r.id === s.roomId) ?? project.rooms[0];
  const progress = () => ({ facts: s.facts, seen: s.seen, quests: project.quests });
  const here = (el: StoryElement) => present(el, progress(), room());
  const canTalk = (el: StoryElement) => !s.event && !s.scene && !ending && !!pickConversation(el, s.facts, ctx) && here(el) && !(el.once && s.seen.includes(el.id));
  /** The room's backdrop and music now, after its active situations. */
  const setting = (r: Room) => roomSetting(r, activeSituations(r, s.facts, ctx));
  /** The backdrop drawn, and the music the room last asked for. */
  let builtBg: Room['bg'] | undefined;
  let roomMusic: string | undefined;
  const menuOn = project.look.gameMenu !== false;

  /** Draws the room's backdrop and objects once per room; characters are kept up to date by render. */
  function build(): void {
    const r = room();
    builtBg = setting(r).bg;
    const objects = r.els.filter(e => e.kind !== 'char' && !e.offstage).map(e =>
      `<button class="el${e.kind === 'area' ? ' area' : ''}" data-el="${esc(e.id)}" style="${elementStyle(e)}${areaClip(e)}" aria-label="${esc(e.name)}">${e.kind === 'area' ? areaArt(e, false) : elementArt(e, undefined, project.characters)}</button>`).join('');
    const menu = menuOn ? `<div class="gamemenu" role="toolbar" aria-label="Game menu">
        <button data-menu="back" title="Back a line" aria-label="Back a line">↶</button><button data-menu="history" title="History" aria-label="History"><svg class="gm-ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg></button>${opts.saveKey ? '<button data-menu="saves" title="Save and load" aria-label="Save and load">⤓</button>' : ''}<button data-menu="settings" title="Settings" aria-label="Settings">⚙</button></div>` : '';
    host.innerHTML = `<div class="stage play" data-stage style="${lookStyle(project.look)}"><div class="cam"><div class="bg">${backdropHTML(builtBg)}</div>${objects}</div><div class="hudlayer"></div><div class="game"></div><div class="hoverlabel" hidden></div>${menu}<div class="gameover"></div></div>`;
    builtRoom = r.id;
  }

  function render(): void {
    if (builtRoom !== s.roomId) build();
    else if (!s.scene && !s.event && setting(room()).bg !== builtBg) {
      // A situation changed the backdrop: swap the picture only.
      builtBg = setting(room()).bg;
      const bg = host.querySelector<HTMLElement>('.cam > .bg');
      if (bg) bg.innerHTML = backdropHTML(builtBg);
    }
    const stage = host.querySelector<HTMLElement>('[data-stage]')!;
    const cam = stage.querySelector<HTMLElement>('.cam')!;
    const game = stage.querySelector<HTMLElement>('.game')!;
    const r = room();
    const scene = s.scene ?? roomScene(r, progress());
    const kept = new Set<string>();

    for (const c of scene.chars) {
      kept.add(c.key);
      let node = stage.querySelector<HTMLElement>(`[data-el="${CSS.escape(c.key)}"]`);
      if (!node) {
        node = document.createElement('button');
        node.dataset.el = c.key;
        cam.append(node);
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
    if (s.event || s.scene) onLeave();
    // Characters brought in for a conversation leave when it ends.
    stage.querySelectorAll<HTMLElement>('.el.staged').forEach(n => {
      if (kept.has(n.dataset.el ?? '')) return;
      n.classList.add('gone');
      setTimeout(() => n.remove(), 450);
    });
    stage.querySelectorAll<HTMLElement>('.el:not(.staged)').forEach(n => {
      const el = r.els.find(e => e.id === n.dataset.el);
      n.hidden = !el || !here(el);
      n.classList.toggle('can', !!el && canTalk(el));
      n.tabIndex = el && canTalk(el) ? 0 : -1;
    });

    // The camera: zoomed on a point, and a shake or flash for this moment.
    const cv = s.scene?.cam;
    cam.style.transformOrigin = cv ? `${cv.x}% ${cv.y}%` : '';
    cam.style.transform = cv ? `scale(${cv.scale})` : '';
    if (s.scene?.camFx) {
      const k = `camfx-${s.scene.camFx}`;
      stage.classList.remove('camfx-shake', 'camfx-flash');
      void stage.offsetWidth;
      stage.classList.add(k);
    }

    const hud = stage.querySelector<HTMLElement>('.hudlayer');
    if (hud) hud.innerHTML = panelsHTML(project, s.facts, { roomId: s.roomId, talking: !!(s.scene || s.event) });
    const ev = s.event;
    const showHint = !ev && !s.scene && !talked && !ending && !!opts.hint && r.els.some(canTalk);
    game.innerHTML = !ev ? (showHint ? `<div class="gamehint">${esc(opts.hint!)}</div>` : '')
      : ev.t === 'say' ? sayHTML(ev.who, ev.text, true, boxPlace(ev, scene))
      : ev.t === 'ask' ? askHTML(ev)
      : choicesHTML(ev.options, true, project.look.choices ?? 'box', lastLine ?? undefined);
    if (ev?.t === 'choice') choiceShownAt = performance.now();
    if (ev?.t === 'ask') requestAnimationFrame(() => game.querySelector<HTMLInputElement>('input')?.focus());
    if (ev?.t === 'say') startTyping(game); else stopTyping();
    const back = stage.querySelector<HTMLButtonElement>('[data-menu="back"]');
    if (back) back.disabled = moments.length < 2;
    drawOverlay(stage);
    opts.onChange?.(s);
    if (ev?.t === 'say') afterLine(ev);
  }

  /** Bubbles sit over the speaker; narration can cover the picture. */
  function boxPlace(ev: SayStep, scene: Scene): { bubble?: { x: number; y: number }; screen?: boolean } | undefined {
    if (!ev.who) return project.look.narration === 'screen' ? { screen: true } : undefined;
    if (!project.look.bubbles) return undefined;
    const c = scene.chars.find(x => x.visible && x.name.trim().toLowerCase() === ev.who.trim().toLowerCase());
    return c ? { bubble: { x: c.x, y: c.y - c.size * 0.92 } } : undefined;
  }

  function askHTML(ev: AskEvent): string {
    return `<form class="say choicebox ask" data-ask><p class="q">${esc(ev.prompt)}</p><div class="askrow"><input type="text" maxlength="40" aria-label="${esc(ev.prompt)}" autocomplete="off"><button type="submit">OK</button></div></form>`;
  }

  /* ---------- Letter by letter, auto and skip ---------- */
  let typing: { timer: number; done: () => void } | null = null;
  let autoTimer = 0;
  function stopTyping(): void {
    if (typing) { clearInterval(typing.timer); typing = null; }
  }
  function startTyping(game: HTMLElement): void {
    stopTyping();
    const cps = SPEEDS[settings.speed] ?? project.look.typing ?? 0;
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
  /** After a line shows: read aloud, then go on by itself when Auto is on, or quickly past lines read before when Skip is on. */
  function afterLine(ev: SayStep): void {
    clearTimeout(autoTimer);
    const key = `${talking?.id ?? ''}|${ev.text}`;
    const seenBefore = read.has(key);
    markRead(key);
    if (overlay || ending) return;
    if (settings.skip && seenBefore) { autoTimer = window.setTimeout(() => { if (s.event === ev) { skipTyping(); advance(); } }, 90); return; }
    if (settings.auto) {
      const wait = () => { if (s.event !== ev || overlay) return; if (typing || (voice && !voice.ended)) { autoTimer = window.setTimeout(wait, 250); return; } advance(); };
      autoTimer = window.setTimeout(wait, 1100 + ev.text.length * 45);
    }
  }

  /** A look's own sound, when a line switches the speaker to it. */
  function lookSound(ev: SayStep): string | undefined {
    if (!ev.expr || !ev.who) return undefined;
    const key = ev.who.trim().toLowerCase();
    const c = project.characters.find(x => x.name.trim().toLowerCase() === key);
    return c ? findLook(c, ev.expr)?.sound : undefined;
  }

  /* ---------- Drawn paths: they run on their own clock, so characters keep moving while lines are read ---------- */
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

  /* ---------- Rooms and conversations ---------- */
  function enter(r: Room): void {
    if (s.roomId !== r.id) stopLoops();
    s.roomId = r.id;
    s.event = null;
    s.scene = null;
    runner = null;
    roomMusic = undefined;
    applyRoomMusic(r);
    const visit = `room:${r.id}`;
    const firstVisit = !s.seen.includes(visit);
    if (firstVisit) s.seen.push(visit);
    const chosen = r.autoEl ? r.els.find(el => el.id === r.autoEl) : r.els.find(el => canTalk(el));
    const auto = r.auto && (firstVisit || !r.autoOnce) && chosen && canTalk(chosen) ? chosen : undefined;
    if (auto) talk(auto); else render();
  }

  /** Plays the music the room (or its latest active situation) sets, when it is not what the room asked for already. */
  function applyRoomMusic(r: Room): void {
    const track = setting(r).music;
    if (track === roomMusic) return;
    roomMusic = track;
    if (track === 'off') stopMusic(); else if (track) playMusic(track, track === r.music && r.musicOnce);
  }

  /** Changes room with the door's transition: a fade, a moment of black, or a slide. */
  function goThrough(target: Room, fx: DoorStep['fx']): void {
    const stage = host.querySelector<HTMLElement>('[data-stage]');
    if (!fx || !stage || matchMedia('(prefers-reduced-motion: reduce)').matches) return enter(target);
    if (fx === 'slide left' || fx === 'slide right') {
      enter(target);
      const cam = host.querySelector<HTMLElement>('.cam');
      cam?.classList.add(fx === 'slide left' ? 'cam-in-right' : 'cam-in-left');
      return;
    }
    const wipe = document.createElement('div');
    wipe.className = 'wipe';
    stage.append(wipe);
    requestAnimationFrame(() => wipe.classList.add('on'));
    setTimeout(() => {
      enter(target);
      const st = host.querySelector<HTMLElement>('[data-stage]')!;
      const w2 = document.createElement('div');
      w2.className = 'wipe on';
      st.append(w2);
      requestAnimationFrame(() => { w2.classList.remove('on'); setTimeout(() => w2.remove(), 500); });
    }, fx === 'black' ? 900 : 420);
  }

  /** A conversation has run to its end (or out through a door): one-time conversations are now used up. */
  function done(): void {
    if (talking && !s.seen.includes(talking.id)) s.seen.push(talking.id);
    // "talked.lin" counts the conversations had with Lin, for Only if.
    if (talking?.kind === 'char') { const f = talkedFact(talking.name); s.facts[f] = (Number(s.facts[f]) || 0) + 1; }
    talking = null;
  }

  function talk(el: StoryElement, startAt?: string, convoId?: string): void {
    lastLine = null;
    talked = true;
    talking = el;
    playSound(el.sound);
    // The clicked character keeps focus otherwise, and keys on a button would not reach the dialogue.
    const focused = document.activeElement as HTMLElement | null;
    if (focused && host.contains(focused)) focused.blur();
    // The conversation its conditions pick now, or the one asked for; saves and memory know it by its key.
    const key = convoId ? `${el.id}:${convoId}` : el.id;
    const asked = convoId !== undefined ? scriptByKey(el, key) : undefined;
    const convo = asked !== undefined ? { id: key, script: asked } : pickConversation(el, s.facts, ctx) ?? { id: el.id, script: el.script };
    const steps = stepsOf(convo.id, convo.script);
    const scene = startScene(room(), el, steps, progress());
    // Starting partway: the scene is set as it would stand by then.
    if (startAt) {
      let track: { track: string; once?: boolean } | null = null;
      for (const st of stepsBefore(steps, startAt)) { if (st.t === 'music') track = st; applyToScene(scene, st, project); nextMoment(scene); }
      if (track) playMusic(track.track, track.once);
    }
    s.scene = scene;
    runner = createRunner(steps, s.facts, step => {
      if (step.t === 'music') playMusic(step.track, step.once);
      else if (step.t === 'sound') { if (!step.stop) playSound(step.name, step.loop); else { stopSound(step.name); if (step.music) stopMusic(); } }
      else if (step.t === 'panel') s.facts[panelFactKey(step.name)] = step.show;
      else if (s.scene) applyToScene(s.scene, step, project); }, startAt, s.memory, convo.id, ctx);
    advance();
  }

  function finish(problem = ''): void {
    done();
    runner = null;
    s.event = null;
    s.scene = null;
    s.problem = problem;
    // The conversation may have changed the room: its situations, backdrop and music.
    applyRoomMusic(room());
    render();
  }

  /** Keeps the moment just shown, so the player can come back to it. */
  function remember(): void {
    if (!runner || !s.event) return;
    moments.push({ event: s.event, runner, place: runner.place(), facts: clone(s.facts), seen: [...s.seen], memory: clone(s.memory), scene: s.scene ? clone(s.scene) : null, roomId: s.roomId, talking, lastLine, history: history.length });
    if (moments.length > 150) moments.shift();
  }

  /** Back to the moment before this one. */
  function goBack(): void {
    if (moments.length < 2) return;
    moments.pop();
    const m = moments[moments.length - 1];
    clearTimeout(autoTimer);
    voice?.pause();
    // The runner holds the very same facts object, so it is changed in place.
    for (const k of Object.keys(s.facts)) delete s.facts[k];
    Object.assign(s.facts, clone(m.facts));
    s.seen = [...m.seen];
    s.memory.picked = [...m.memory.picked];
    s.memory.turns = { ...m.memory.turns };
    s.roomId = m.roomId;
    s.scene = m.scene ? clone(m.scene) : null;
    talking = m.talking;
    lastLine = m.lastLine;
    runner = m.runner;
    runner.restore(m.place);
    history.length = m.history;
    s.event = m.event;
    s.problem = '';
    render();
  }

  function advance(): void {
    if (!runner) return;
    clearTimeout(autoTimer);
    voice?.pause();
    // A line's sound can be set to play as the player moves on from it.
    if (s.event?.t === 'say' && s.event.soundAtEnd) playSound(s.event.sound);
    if (s.scene) nextMoment(s.scene);
    const ev = runner.next();
    s.problem = '';
    if (ev.t === 'say') {
      if (s.scene) applyToScene(s.scene, ev, project);
      s.event = ev;
      lastLine = ev;
      history.push({ who: ev.who, text: ev.text });
      if (!ev.soundAtEnd) playSound(ev.sound || lookSound(ev));
      playVoice(ev.voice);
      speak(ev);
    } else if (ev.t === 'choice' || ev.t === 'ask') {
      s.event = ev;
    } else if (ev.t === 'door') {
      const target = findRoomByName(project, ev.room);
      done();
      if (target) return goThrough(target, ev.fx);
      return finish(`There is no room called "${ev.room}".`);
    } else {
      if (ev.ending) { ending = ev.ending; }
      return finish(ev.problem ?? '');
    }
    remember();
    render();
  }

  function pick(k: number): void {
    if (s.event?.t !== 'choice') return;
    const o = s.event.options[k];
    if (!o) return;
    history.push({ who: '', text: o.text, answer: true });
    s.event.pick(k);
    s.event = null;
    advance();
  }

  /* ---------- Overlays: history, settings, saves, endings ---------- */
  function drawOverlay(stage: HTMLElement): void {
    const box = stage.querySelector<HTMLElement>('.gameover')!;
    if (ending) {
      box.innerHTML = `<div class="ovl endcard"><p>The end</p><h2>${esc(ending)}</h2><button data-ov="ending-ok">Continue</button></div>`;
      box.classList.add('on');
      return;
    }
    if (!overlay) { box.innerHTML = ''; box.classList.remove('on'); return; }
    box.classList.add('on');
    const close = '<button class="ovx" data-ov="close" aria-label="Close">✕</button>';
    if (overlay === 'history') {
      box.innerHTML = `<div class="ovl" role="dialog" aria-label="History"><div class="ovh"><b>History</b>${close}</div><div class="ovb hist">${history.length ? history.map(h => h.answer ? `<p class="ans">→ ${esc(h.text)}</p>` : `<p>${h.who ? `<b>${esc(h.who)}</b> ` : ''}${esc(h.text)}</p>`).join('') : '<p class="dim">Nothing yet.</p>'}</div></div>`;
      requestAnimationFrame(() => { const b = box.querySelector('.hist'); if (b) b.scrollTop = b.scrollHeight; });
    } else if (overlay === 'settings') {
      const speed = (['story', 'off', 'slow', 'normal', 'fast'] as const).map(k => `<option value="${k}"${settings.speed === k ? ' selected' : ''}>${({ story: 'As the story sets it', off: 'All at once', slow: 'Slow', normal: 'Normal', fast: 'Fast' })[k]}</option>`).join('');
      box.innerHTML = `<div class="ovl" role="dialog" aria-label="Settings"><div class="ovh"><b>Settings</b>${close}</div><div class="ovb">
        <label><span>Text speed</span><select data-set="speed">${speed}</select></label>
        <label><span>Music</span><input type="range" min="0" max="100" value="${settings.music}" data-set="music"></label>
        <label><span>Sounds and voices</span><input type="range" min="0" max="100" value="${settings.sound}" data-set="sound"></label>
        <label class="tick"><input type="checkbox" data-set="auto"${settings.auto ? ' checked' : ''}><span>Go on by itself (auto)</span></label>
        <label class="tick"><input type="checkbox" data-set="skip"${settings.skip ? ' checked' : ''}><span>Skip lines I have read</span></label>
        ${'speechSynthesis' in window ? `<label class="tick"><input type="checkbox" data-set="read"${settings.read ? ' checked' : ''}><span>Read lines aloud</span></label>` : ''}
      </div></div>`;
    } else if (overlay === 'saves') {
      const slots = [0, 1, 2].map(i => load<SavedGame | null>(`${opts.saveKey}:slot${i}`, null as unknown as SavedGame));
      box.innerHTML = `<div class="ovl" role="dialog" aria-label="Save and load"><div class="ovh"><b>Save and load</b>${close}</div><div class="ovb">${slots.map((sl, i) => `<div class="slot"><div><b>Slot ${i + 1}</b><span>${sl && sl.roomId ? `${esc(sl.label ?? '')} · ${new Date(sl.when ?? 0).toLocaleString()}` : 'Empty'}</span></div>
        <button data-ov="save" data-k="${i}">Save</button><button data-ov="load" data-k="${i}"${sl && sl.roomId ? '' : ' disabled'}>Load</button></div>`).join('')}
        <p class="dim">A game is saved in this browser. Loading starts in the room you saved in.</p></div></div>`;
    }
  }
  function openOverlay(o: typeof overlay): void { overlay = overlay === o ? null : o; clearTimeout(autoTimer); render(); }

  function onOverlay(t: HTMLElement): boolean {
    const m = t.closest<HTMLElement>('[data-menu]');
    if (m) {
      const k = m.dataset.menu!;
      if (k === 'back') { overlay = null; goBack(); } else openOverlay(k as typeof overlay);
      return true;
    }
    const b = t.closest<HTMLElement>('[data-ov]');
    if (!b) return !!t.closest('.gameover.on');
    const k = b.dataset.ov!;
    if (k === 'close') { overlay = null; render(); }
    if (k === 'ending-ok') { const e = ending!; ending = null; render(); opts.onEnding?.(e); }
    if (k === 'save' && opts.saveKey) {
      keep(`${opts.saveKey}:slot${b.dataset.k}`, { roomId: s.roomId, facts: s.facts, seen: s.seen, memory: s.memory, when: Date.now(), label: room().name } satisfies SavedGame);
      render();
    }
    if (k === 'load' && opts.saveKey) {
      const sl = load<SavedGame | null>(`${opts.saveKey}:slot${b.dataset.k}`, null as unknown as SavedGame);
      const r = sl && project.rooms.find(x => x.id === sl.roomId);
      if (sl && r) {
        for (const f of Object.keys(s.facts)) delete s.facts[f];
        Object.assign(s.facts, sl.facts);
        s.seen = [...(sl.seen ?? [])];
        s.memory = sl.memory ? clone(sl.memory) : { picked: [], turns: {} };
        moments.length = 0; history.length = 0; overlay = null; talking = null;
        enter(r);
      }
    }
    return true;
  }

  function onInput(e: Event): void {
    const t = e.target as HTMLInputElement;
    const k = t.dataset.set as keyof Settings | undefined;
    if (!k) return;
    if (k === 'speed') settings.speed = t.value as Settings['speed'];
    else if (k === 'music' || k === 'sound') { settings[k] = Number(t.value); if (k === 'music' && music) music.el.volume = music.base * settings.music / 100; }
    else settings[k] = t.checked;
    if (k === 'read' && !t.checked && 'speechSynthesis' in window) speechSynthesis.cancel();
    keep(`${storeKey}:settings`, settings);
  }

  function onSubmit(e: Event): void {
    const form = (e.target as HTMLElement).closest<HTMLFormElement>('[data-ask]');
    if (!form || s.event?.t !== 'ask') return;
    e.preventDefault();
    const v = form.querySelector('input')?.value ?? '';
    if (!v.trim()) { form.querySelector('input')?.focus(); return; }
    history.push({ who: '', text: v, answer: true });
    s.event.answer(v);
    s.event = null;
    advance();
  }

  function onClick(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    if (onOverlay(t)) return;
    if (t.closest('[data-next]')) { if (skipTyping()) return; return advance(); }
    const p = t.closest<HTMLElement>('[data-pick]');
    if (p && s.event?.t === 'choice') { if (tooSoon()) return; return pick(Number(p.dataset.pick)); }
    const toggle = t.closest<HTMLElement>('[data-ptoggle]');
    if (toggle) return togglePanel(toggle.dataset.ptoggle!);
    const btn = t.closest<HTMLElement>('[data-pbtn]');
    if (btn) return pressPanelButton(btn.dataset.pbtn!);
    const elNode = t.closest<HTMLElement>('[data-el]');
    if (elNode) {
      const el = room().els.find(x => x.id === elNode.dataset.el);
      if (el && canTalk(el)) talk(el);
    }
  }

  function onWheel(e: WheelEvent): void {
    // Wheel up over the game opens the history, as in classic visual novels.
    if (e.deltaY < 0 && !overlay && history.length && menuOn) { e.preventDefault(); openOverlay('history'); }
  }

  /* ---------- Interface panels the player opens, and their buttons ---------- */
  function togglePanel(id: string): void {
    const pn = project.panels?.find(x => x.id === id);
    if (!pn) return;
    const on = panelVisible(pn, { roomId: s.roomId, talking: !!(s.scene || s.event), facts: s.facts, quests: project.quests });
    s.facts[panelFactKey(pn.name)] = !on;
    render();
  }
  /** A panel button runs its few lines like a conversation of its own, while the room stays as it is. */
  function pressPanelButton(id: string): void {
    if (s.event || s.scene || ending) return;
    for (const pn of project.panels ?? []) {
      const b = pn.blocks.find(x => x.id === id);
      if (b?.kind !== 'button' || !b.script.trim()) continue;
      talk({ id: `panel:${b.id}`, kind: 'object', name: b.label, x: 0, y: 0, size: 0, staging: 'room', script: b.script });
      return;
    }
  }

  function onKey(e: KeyboardEvent): void {
    const inField = !!(e.target as HTMLElement).closest('input, textarea, select');
    if (e.key === 'Escape' && (overlay || ending)) { if (ending) return; overlay = null; render(); return; }
    if (overlay || ending || inField) return;
    if (!host.isConnected) return;
    const keyed = !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1 ? project.panels?.find(pn => pn.key === e.key.toLowerCase()) : undefined;
    if (keyed) { e.preventDefault(); togglePanel(keyed.id); return; }
    // Number keys pick an answer.
    if (s.event?.t === 'choice' && /^[1-9]$/.test(e.key)) {
      const k = Number(e.key) - 1;
      if (k < s.event.options.length && !tooSoon()) { e.preventDefault(); pick(k); }
      return;
    }
    if (menuOn && e.key === 'ArrowLeft' && moments.length > 1) { e.preventDefault(); goBack(); return; }
    // Space or Enter left over from reading must not choose an answer.
    if (s.event?.t === 'choice' && (e.key === ' ' || e.key === 'Enter') && tooSoon()) { e.preventDefault(); return; }
    if (s.event?.t !== 'say' || (e.key !== ' ' && e.key !== 'Enter')) return;
    const t = e.target as HTMLElement;
    if (t.closest('button') && !t.closest('[data-el]')) return;
    e.preventDefault();
    if (skipTyping()) return;
    advance();
  }

  /* The text by the pointer: what the player is holding the mouse over. */
  function hoverText(node: HTMLElement | null): string {
    const el = node && room().els.find(e => e.id === node.dataset.el);
    return el?.hover && canTalk(el) ? fillText(el.hover, s.facts) : '';
  }
  function onMove(e: PointerEvent): void {
    const stage = host.querySelector<HTMLElement>('[data-stage]');
    const label = stage?.querySelector<HTMLElement>('.hoverlabel');
    if (!stage || !label) return;
    const text = e.pointerType === 'touch' ? '' : hoverText((e.target as HTMLElement).closest<HTMLElement>('.el.can'));
    if (!text) { label.hidden = true; return; }
    const box = stage.getBoundingClientRect();
    const x = (e.clientX - box.left) / box.width * 100, y = (e.clientY - box.top) / box.height * 100;
    label.textContent = text;
    label.hidden = false;
    // Kept inside the picture: flipped to the left of the pointer near the right edge, below it near the top.
    label.style.left = `${x}%`;
    label.style.top = `${y}%`;
    label.classList.toggle('left', x > 70);
    label.classList.toggle('below', y < 12);
  }
  function onLeave(): void { const l = host.querySelector<HTMLElement>('.hoverlabel'); if (l) l.hidden = true; }
  host.addEventListener('pointermove', onMove);
  host.addEventListener('pointerleave', onLeave);
  host.addEventListener('click', onClick);
  host.addEventListener('input', onInput);
  host.addEventListener('change', onInput);
  host.addEventListener('submit', onSubmit);
  host.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('keydown', onKey);

  const startEl = opts.elementId ? first.els.find(el => el.id === opts.elementId) : undefined;
  if (startEl) { render(); talk(startEl, opts.startPath, opts.convoId); } else enter(first);

  return {
    state: () => s,
    destroy() {
      stopTyping();
      clearTimeout(autoTimer);
      cancelAnimationFrame(pathFrame);
      paths.clear();
      stopMusic(true);
      voice?.pause();
      sounds.forEach(a => a.pause());
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      keep(`${storeKey}:read`, [...read]);
      host.removeEventListener('click', onClick);
      host.removeEventListener('pointermove', onMove);
      host.removeEventListener('pointerleave', onLeave);
      host.removeEventListener('input', onInput);
      host.removeEventListener('change', onInput);
      host.removeEventListener('submit', onSubmit);
      host.removeEventListener('wheel', onWheel);
      document.removeEventListener('keydown', onKey);
    }
  };
}
