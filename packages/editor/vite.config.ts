import { defineConfig } from 'vite';

// Relative base so the built editor runs from any folder, and later inside a desktop shell.
export default defineConfig({
  base: './',
  build: { outDir: 'dist', emptyOutDir: true }
});
