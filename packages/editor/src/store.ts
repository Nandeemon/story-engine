import { createProject, newId, normalizeProject } from '@story-engine/engine-core';
import type { Project } from '@story-engine/engine-core';

/*
 * Projects are kept in IndexedDB, which holds far more than localStorage, so a
 * story with many pictures keeps saving. Older projects in localStorage are
 * moved over on first load.
 */

const DB_NAME = 'story-engine';
const STORE = 'projects';
const KEY = 'current';
const LEGACY_KEY = 'story-engine:project';

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

function idb<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return openDb().then(db => new Promise<T | undefined>((resolve, reject) => {
    if (!db) return reject(new Error('IndexedDB is not available'));
    const tx = db.transaction(STORE, mode);
    const req = run(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  }));
}

/** Loads the project saved in this browser, or a new one. */
export async function loadProject(): Promise<Project> {
  try {
    const saved = normalizeProject(JSON.parse((await idb<string>('readonly', s => s.get(KEY))) ?? 'null'));
    if (saved) return saved;
  } catch {
    /* fall through to the older storage */
  }
  try {
    const legacy = normalizeProject(JSON.parse(localStorage.getItem(LEGACY_KEY) ?? 'null'));
    if (legacy) return legacy;
  } catch {
    /* blocked or corrupt storage: start fresh */
  }
  return createProject();
}

/* Saves are queued so only the newest copy is written, and never two at once. */
let writing = false;
let queued: string | null = null;
let waiters: ((ok: boolean) => void)[] = [];

async function flush(): Promise<void> {
  writing = true;
  let ok = true;
  while (queued !== null) {
    const json = queued;
    queued = null;
    try {
      await idb('readwrite', s => s.put(json, KEY));
      ok = true;
    } catch {
      try { localStorage.setItem(LEGACY_KEY, json); ok = true; } catch { ok = false; }
    }
  }
  writing = false;
  const done = waiters;
  waiters = [];
  done.forEach(w => w(ok));
}

/** Saves the project. Resolves to false when the browser could not store it. */
export function saveProject(project: Project): Promise<boolean> {
  queued = JSON.stringify(project);
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
