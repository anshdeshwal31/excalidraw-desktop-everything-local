# Continuation: Fix File Open in Excalidraw Desktop

## Current Problem

**File > Open does not work.** The main process reads the file correctly and sends it to the renderer, but the Excalidraw API ref (`excalidrawRef.current`) is **always null** — even after the component visually renders on screen.

### Error log (consistent across all attempts):
```
[ExcalidrawDesktop] file-opened received, path: ...excalidraw length: 24154
[ExcalidrawDesktop] API not ready, queuing file and polling...
```

The polling runs for 10 seconds checking `excalidrawRef.current` every 200ms — it never becomes non-null.

## Root Cause (not yet confirmed)

The `<Excalidraw>` component in `@excalidraw/excalidraw@0.17.1` likely does **not** expose its API via `React.forwardRef`/`ref`. Instead, it may use a different pattern:

### Possible API exposure patterns to investigate:

1. **`excalidrawAPI` callback prop** — Many Excalidraw versions use:
   ```jsx
   <Excalidraw excalidrawAPI={(api) => setExcalidrawAPI(api)} />
   ```
   Check: `grep -r "excalidrawAPI" packages/excalidraw/index.tsx`

2. **`ref` returns a wrapper, not the API** — The ref might return a DOM element or wrapper, not the imperative API. The actual API might be on a different property.

3. **`onMount` or similar callback** — Some versions emit the API via a callback.

### How to investigate:
```bash
# Check how the Excalidraw component exposes its API
grep -n "excalidrawAPI\|forwardRef\|useImperativeHandle" \
  excalidraw-desktop/node_modules/@excalidraw/excalidraw/dist/excalidraw.development.js | head -20

# Check the web app (excalidraw-app) for how it gets the API
grep -rn "excalidrawAPI\|excalidrawRef" excalidraw-app/App.tsx

# Check the main Excalidraw component's props interface
grep -n "excalidrawAPI\|ExcalidrawProps" packages/excalidraw/index.tsx | head -20
```

## What Works

- Drawing on canvas works perfectly
- Built-in Mermaid (More Tools > Mermaid to Excalidraw) works
- Drag-and-drop of .excalidraw files works (Excalidraw handles this internally)
- The main process correctly reads files and sends content to renderer
- Save dialog appears correctly

## What Doesn't Work

- File > Open: file is read but never applied to scene (ref is null)
- Double-click .excalidraw file: same issue (file arrives before API is ready)
- Ctrl+S Save: likely fails too since it uses the same ref

## Files to Modify

- `packages/desktop-renderer/src/App.tsx` — Main fix needed here
- `electron/main.js` — Working correctly, no changes needed
- `electron/preload.js` — Working correctly, no changes needed

## Fix Strategy

Once you find how the API is exposed (likely `excalidrawAPI` prop), change App.tsx:

```tsx
// Instead of:
<Excalidraw ref={excalidrawRefCallback} ... />

// Use:
const [excalidrawAPI, setExcalidrawAPI] = useState(null);
<Excalidraw excalidrawAPI={(api) => setExcalidrawAPI(api)} ... />
```

Then use `excalidrawAPI` (state) instead of `excalidrawRef.current` everywhere.
When `excalidrawAPI` becomes non-null (via useEffect), apply any pending file.

## After Fixing

1. Remove debug `console.log` statements from App.tsx
2. `yarn build && npx electron-builder --win --publish=never`
3. Test: File > Open, Save, Save As, double-click .excalidraw
4. Commit, push, update release
