import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  root: 'renderer',
  plugins: [tailwindcss()],
  clearScreen: false,
  server: {
    port: 5174,
  },
  build: {
    outDir: resolve(__dirname, '.vite/renderer/magnifier_window'),
    emptyOutDir: true,
  },
});
