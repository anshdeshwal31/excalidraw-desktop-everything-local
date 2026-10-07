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

// CSP for the built app only; the dev server needs inline scripts and websockets for HMR
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "frame-src https:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

const contentSecurityPolicy = (): Plugin => ({
  name: 'content-security-policy',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP },
      injectTo: 'head-prepend',
    },
  ],
});

export default defineConfig({
  plugins: [react(), copyExcalidrawFonts(), contentSecurityPolicy()],
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
