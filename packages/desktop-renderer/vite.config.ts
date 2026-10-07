import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname, join } from 'path';
import { cpSync } from 'fs';
import { createRequire } from 'module';

const outDir = resolve(__dirname, '../../build');

// Ship Excalidraw's fonts with the app instead of loading them from a CDN (see src/assetPath.ts)
const copyExcalidrawFonts = (): Plugin => ({
  name: 'copy-excalidraw-fonts',
  apply: 'build',
  closeBundle() {
    const excalidrawDist = dirname(createRequire(import.meta.url).resolve('@excalidraw/excalidraw'));
    cpSync(join(excalidrawDist, 'fonts'), join(outDir, 'fonts'), { recursive: true });
  },
});

export default defineConfig({
  plugins: [react(), copyExcalidrawFonts()],
  root: '.',
  base: './', // This is crucial for Electron!
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    }
  },
  server: {
    port: 5173,
    host: true
  },
  define: {
    global: 'globalThis'
  }
});
