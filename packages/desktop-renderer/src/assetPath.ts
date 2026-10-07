// Load Excalidraw fonts from the app bundle (build/fonts, copied by vite.config.ts)
// instead of the esm.sh CDN. Must be imported before @excalidraw/excalidraw.
// Absolute URL because relative paths don't resolve under file:// (opaque origin).
(window as any).EXCALIDRAW_ASSET_PATH = new URL('./', window.location.href).href;

export {};
