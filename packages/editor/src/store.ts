import { createProject, newId, normalizeProject } from '@story-engine/engine-core';
import type { Project } from '@story-engine/engine-core';

/*
 * Every story is kept in IndexedDB under its own key ("p:<id>"), with a small
 * index ("index") listing them for the home screen. IndexedDB holds far more
 * than localStorage, so a story with many pictures keeps saving. The single
 * story of older versions ("current", or localStorage) becomes the first story
 * in the list on first load.
 */

const DB_NAME = 'story-engine';
const STORE = 'projects';
const INDEX = 'index';
const OLD_KEY = 'current';
const LEGACY_KEY = 'story-engine:project';
const LAST_KEY = 'story-engine:last-story';

/** One story in the list on the home screen. */
export interface StoryInfo {
  id: string;
  title: string;
  /** When it was last changed, in milliseconds. */
  updated: number;
  rooms: number;
  /** A starter backdrop id, or a small picture of the first room. */
  cover?: { preset?: string; thumb?: string };
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise(resolve => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest | void): Promise<T | undefined> {
  return openDb().then(db => new Promise<T | undefined>((resolve, reject) => {
    if (!db) return reject(new Error('IndexedDB is not available'));
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req ? (req.result as T) : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

const keyOf = (id: string) => `p:${id}`;
const titleOf = (p: Project) => p.title?.trim() || p.rooms[0]?.name || 'Untitled story';

let index: StoryInfo[] = [];
/** Whether IndexedDB works here; when not, only one story is kept, in localStorage. */
let usable = true;

async function writeIndex(): Promise<void> {
  if (usable) await idb('readwrite', s => s.put(JSON.stringify(index), INDEX));
}

/** Loads the list of stories, moving an older single story into it the first time. */
export async function listStories(): Promise<StoryInfo[]> {
  try {
    const raw = await idb<string>('readonly', s => s.get(INDEX));
    index = raw ? (JSON.parse(raw) as StoryInfo[]).filter(x => x && typeof x.id === 'string') : [];
    if (!raw) {
      const old = normalizeProject(JSON.parse((await idb<string>('readonly', s => s.get(OLD_KEY))) ?? 'null'))
        ?? (() => { try { return normalizeProject(JSON.parse(localStorage.getItem(LEGACY_KEY) ?? 'null')); } catch { return null; } })();
      if (old) {
        const id = newId();
        await putStory(id, old);
        await idb('readwrite', s => s.delete(OLD_KEY));
        try { localStorage.setItem(LAST_KEY, id); } catch { /* not remembered */ }
      } else await writeIndex();
    }
  } catch {
    usable = false;
    index = [];
    try {
      const legacy = normalizeProject(JSON.parse(localStorage.getItem(LEGACY_KEY) ?? 'null'));
      if (legacy) index = [infoOf('local', legacy)];
    } catch { /* nothing kept */ }
  }
  return [...index].sort((a, b) => b.updated - a.updated);
}

export function lastStoryId(): string | null {
  try { return localStorage.getItem(LAST_KEY); } catch { return null; }
}

function infoOf(id: string, p: Project, thumb?: string): StoryInfo {
  const bg = p.rooms[0]?.bg;
  const cover = bg?.img ? (thumb ? { thumb } : index.find(x => x.id === id)?.cover) : bg?.preset ? { preset: bg.preset } : undefined;
  return { id, title: titleOf(p), updated: Date.now(), rooms: p.rooms.length, cover };
}

/** Opens a story by id. */
export async function loadStory(id: string): Promise<Project | null> {
  try {
    const raw = usable ? await idb<string>('readonly', s => s.get(keyOf(id))) : localStorage.getItem(LEGACY_KEY);
    const p = normalizeProject(JSON.parse(raw ?? 'null'));
    if (p) { try { localStorage.setItem(LAST_KEY, id); } catch { /* not remembered */ } }
    return p;
  } catch {
    return null;
  }
}

async function putStory(id: string, p: Project, thumb?: string): Promise<void> {
  const info = infoOf(id, p, thumb);
  index = [...index.filter(x => x.id !== id), info];
  if (!usable) { localStorage.setItem(LEGACY_KEY, JSON.stringify(p)); return; }
  await idb('readwrite', s => { s.put(JSON.stringify(p), keyOf(id)); s.put(JSON.stringify(index), INDEX); });
}

/** Adds a story to the list and returns its id. */
export async function addStory(p: Project): Promise<string> {
  const id = usable ? newId() : 'local';
  await putStory(id, p);
  try { localStorage.setItem(LAST_KEY, id); } catch { /* not remembered */ }
  return id;
}

export async function deleteStory(id: string): Promise<void> {
  index = index.filter(x => x.id !== id);
  if (!usable) { localStorage.removeItem(LEGACY_KEY); return; }
  await idb('readwrite', s => { s.delete(keyOf(id)); s.put(JSON.stringify(index), INDEX); });
}

/** Copies a story; the copy's name says it is a copy. */
export async function duplicateStory(id: string): Promise<string | null> {
  const p = await loadStory(id);
  if (!p) return null;
  p.title = `${titleOf(p)} (copy)`;
  const copy = await addStory(p);
  const cover = index.find(x => x.id === id)?.cover;
  const info = index.find(x => x.id === copy);
  if (info && cover) { info.cover = cover; await writeIndex(); }
  return copy;
}

/* A small picture of the first room's own backdrop, made when the backdrop changes. */
let thumbFor = '';
let thumbValue = '';
function makeThumb(src: string): Promise<string> {
  if (src === thumbFor) return Promise.resolve(thumbValue);
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = 320; c.height = 180;
      const g = c.getContext('2d');
      if (!g) return resolve('');
      const k = Math.max(320 / img.width, 180 / img.height);
      g.drawImage(img, (320 - img.width * k) / 2, (180 - img.height * k) / 2, img.width * k, img.height * k);
      thumbFor = src;
      thumbValue = c.toDataURL('image/jpeg', 0.7);
      resolve(thumbValue);
    };
    img.onerror = () => resolve('');
    img.src = src;
  });
}

/* Saves are queued so only the newest copy is written, and never two at once. */
let writing = false;
let queued: { id: string; p: Project } | null = null;
let waiters: ((ok: boolean) => void)[] = [];

async function flush(): Promise<void> {
  writing = true;
  let ok = true;
  while (queued !== null) {
    const { id, p } = queued;
    queued = null;
    try {
      const img = p.rooms[0]?.bg?.img;
      await putStory(id, p, img ? await makeThumb(img) : undefined);
      ok = true;
    } catch {
      ok = false;
    }
  }
  writing = false;
  const done = waiters;
  waiters = [];
  done.forEach(w => w(ok));
}

/** Resolves once every queued save is written; called before leaving a story. */
export function whenSaved(): Promise<void> {
  if (!writing && queued === null) return Promise.resolve();
  return new Promise(resolve => waiters.push(() => resolve()));
}

/** Saves a story. Resolves to false when the browser could not store it. */
export function saveStory(id: string, project: Project): Promise<boolean> {
  // The newest state is written when its turn comes, so the project is not copied here.
  queued = { id, p: project };
  const result = new Promise<boolean>(resolve => waiters.push(resolve));
  if (!writing) void flush();
  return result;
}

/** A small finished story that shows every feature of step 1. */
export function sampleProject(): Project {
  const p = createProject();
  p.rooms = [
    {
      id: newId(), name: 'Café, dusk', bg: { preset: 'cafe' }, auto: false, els: [
        {
          id: newId(), kind: 'char', preset: 'mara', name: 'Mara', x: 34, y: 98, size: 78, expr: 'neutral',
          script: [
            'Mara: You came back.',
            'Choice',
            '  "I missed this place."  affection + 8',
            '    Mara (smiling): So did I.',
            '    Go to part Stay',
            '  "Just passing through."',
            '    Mara (sad): Of course you are.',
            '    Mara: The street is that way.',
            '    Go to Street, night',
            'Part: Stay',
            'Mara: Sit down. I want to tell you something.',
            'Only if affection is at least 10',
            '  Mara (smiling): I was hoping you would come back for me.',
            'Otherwise',
            '  Mara: It can wait. Drink your coffee.'
          ].join('\n')
        },
        {
          id: newId(), kind: 'object', preset: 'cup', name: 'Coffee cup', x: 70, y: 74, size: 14,
          script: 'The coffee has gone cold.\nOnly if affection is at least 5\n  Somebody drew a small heart in the foam.'
        }
      ]
    },
    {
      id: newId(), name: 'Street, night', bg: { preset: 'street' }, auto: true, els: [
        {
          id: newId(), kind: 'char', preset: 'jon', name: 'Jon', x: 62, y: 98, size: 74, expr: 'neutral',
          script: [
            'Jon (surprised): Out already?',
            'Jon: She was hoping you would stay.',
            'Choice',
            '  "Then I am going back in."',
            '    Go to Café, dusk',
            '  "Not tonight."',
            '    Jon (sad): Your loss.'
          ].join('\n')
        }
      ]
    }
  ];
  return p;
}
