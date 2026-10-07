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

// Mermaid >= 11.16 (needed for its security fixes) prefixes rendered element ids with the
// render id. @excalidraw/mermaid-to-excalidraw 2.2.2 looks elements up by unprefixed id, so
// class/state/ER diagrams silently fall back to images. Strip the prefix before it parses.
const fixMermaidElementIds = (): Plugin => ({
  name: 'fix-mermaid-element-ids',
  transform(code, id) {
    if (!id.replace(/\\/g, '/').endsWith('/@excalidraw/mermaid-to-excalidraw/dist/parseMermaid.js')) return;
    const anchor = 'svgContainer.innerHTML = svg;';
    if (!code.includes(anchor)) {
      throw new Error('mermaid-to-excalidraw changed: revisit fixMermaidElementIds in vite.config.ts');
    }
    return code.replace(
      anchor,
      anchor + ' svgContainer.querySelectorAll(`[id^="${renderId}-"]`).forEach((el) => { el.id = el.id.slice(renderId.length + 1); });',
    );
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
  plugins: [react(), copyExcalidrawFonts(), fixMermaidElementIds(), contentSecurityPolicy()],
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
