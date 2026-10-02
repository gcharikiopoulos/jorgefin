import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Writes dist/sw.js from src/sw.template.js with a versioned cache name and
// the list of built files to precache, so every deploy gets a fresh cache.
function serviceWorker() {
  let outDir;
  let shellFiles = [];
  return {
    name: 'finance-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    generateBundle(_, bundle) {
      shellFiles = Object.keys(bundle);
    },
    closeBundle() {
      const files = ['./', ...shellFiles, 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
      const source = readFileSync(resolve('src/sw.template.js'), 'utf8')
        .replace('__CACHE_VERSION__', Date.now().toString(36))
        .replace('__SHELL_FILES__', JSON.stringify(files.filter((f) => !f.endsWith('.map')), null, 2));
      writeFileSync(resolve(outDir, 'sw.js'), source);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), serviceWorker()],
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
