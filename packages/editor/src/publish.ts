import type { Project } from '@story-engine/engine-core';
import gameScript from 'virtual:game-bundle';

const FONT_URLS: Record<string, string> = {
  Lora: 'Lora:wght@400;600',
  Figtree: 'Figtree:wght@400;500;600',
  'Courier Prime': 'Courier+Prime:wght@400;700',
  'Bricolage Grotesque': 'Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700'
};

/** Script text that cannot end its <script> element early. */
const scriptSafe = (s: string) => s.replace(/<\/(script)/gi, '<\\/$1');
/** JSON that can sit inside a <script> element: every < is escaped, which JSON allows inside strings. */
const jsonSafe = (v: unknown) => JSON.stringify(v).replace(/</g, '\\u003c');
const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function storyTitle(p: Project): string {
  return p.title?.trim() || p.rooms[0]?.name || 'Untitled story';
}

export function slug(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'story';
}

/**
 * The game as one HTML page: the story, the player and its styles in a single
 * file that opens in any browser and can be uploaded to itch.io or any web host.
 * Nothing of the editor is in it.
 */
export function gameFileHTML(p: Project): string {
  const font = FONT_URLS[p.look.font];
  const fontLink = font ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=${font}&display=swap">` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${attr(storyTitle(p))}</title>
${fontLink}
</head>
<body>
<script type="application/json" id="story">${jsonSafe(p)}</script>
<script>${scriptSafe(gameScript)}</script>
</body>
</html>
`;
}

/** Downloads the game file. */
export function downloadGame(p: Project): string {
  const name = `${slug(storyTitle(p))}.html`;
  const url = URL.createObjectURL(new Blob([gameFileHTML(p)], { type: 'text/html' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}
