import { createProject, newId, normalizeProject } from '@story-engine/engine-core';
import type { Project } from '@story-engine/engine-core';

const KEY = 'story-engine:project';

/** Loads the project saved in this browser, or a new one. */
export function loadProject(): Project {
  try {
    const saved = normalizeProject(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    if (saved) return saved;
  } catch {
    /* blocked or corrupt storage: start fresh */
  }
  return createProject();
}

export function saveProject(project: Project): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(project));
    return true;
  } catch {
    return false; // storage full or blocked; the session keeps working
  }
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
