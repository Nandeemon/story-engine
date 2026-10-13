import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const GAME_ENTRY = fileURLToPath(new URL('../runtime/src/game-entry.ts', import.meta.url));

/**
 * Provides "virtual:game-bundle": the published game's script as one string,
 * game styles included, so the editor can write a self-contained game file.
 */
function gameBundle(): Plugin {
  const id = 'virtual:game-bundle', resolved = '\0' + id;
  return {
    name: 'story-engine-game-bundle',
    resolveId: x => (x === id ? resolved : undefined),
    async load(x) {
      if (x !== resolved) return;
      const out = await build({
        entryPoints: [GAME_ENTRY], bundle: true, write: false, format: 'iife', minify: true,
        target: 'es2020', metafile: true, logLevel: 'silent',
        plugins: [{
          name: 'inline-css',
          setup(b) {
            b.onResolve({ filter: /\.css\?inline$/ }, a => ({ path: resolve(a.resolveDir, a.path.replace(/\?inline$/, '')), namespace: 'css-text' }));
            b.onLoad({ filter: /.*/, namespace: 'css-text' }, async a => ({ contents: (await readFile(a.path, 'utf8')).replace(/\/\*[\s\S]*?\*\//g, ''), loader: 'text', watchFiles: [a.path] }));
          }
        }]
      });
      for (const f of Object.keys(out.metafile.inputs)) this.addWatchFile(resolve(f.replace(/^css-text:/, '')));
      return `export default ${JSON.stringify(out.outputFiles[0].text)};`;
    }
  };
}

// Relative base so the built editor runs from any folder, and later inside a desktop shell.
export default defineConfig({
  base: './',
  plugins: [gameBundle()],
  build: { outDir: 'dist', emptyOutDir: true }
});
