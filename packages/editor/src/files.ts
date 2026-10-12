import { normalizeProject } from '@story-engine/engine-core';
import type { Project } from '@story-engine/engine-core';

/** Downloads the whole project, images included, as one file. */
export function saveToFile(project: Project): void {
  const first = project.rooms[0]?.name ?? 'story';
  const slug = first.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'story';
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(project, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}-${date}.story.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Reads a project file. Resolves to null when the file is not a Story Engine project. */
export async function readProjectFile(file: File): Promise<Project | null> {
  try {
    return normalizeProject(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}
