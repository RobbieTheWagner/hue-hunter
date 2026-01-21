import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  root: 'renderer',
  base: './',
  plugins: [tailwindcss()],
  clearScreen: false,
  server: {
    port: 5174,
  },
  build: {
    outDir: resolve(__dirname, '.vite/renderer'),
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'renderer/index.html'),
        preload: resolve(__dirname, 'renderer/magnifier-preload.ts'),
      },
      external: ['electron'],
      output: {
        format: 'es',
        entryFileNames: (chunkInfo) => {
          return chunkInfo.name === 'preload' ? 'preload.mjs' : 'assets/[name]-[hash].js';
        },
      },
    },
  },
});
