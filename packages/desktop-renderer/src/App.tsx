import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Excalidraw,
  CaptureUpdateAction,
  loadFromBlob,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { useElectronAPI } from './hooks/useElectronAPI';
import './styles/App.css';

// Autosave this long after the last change (and always when the window closes or reloads)
const AUTOSAVE_DELAY_MS = 500;

// Light/dark theme is remembered across restarts (stored in the app's profile folder)
const THEME_KEY = 'excalidraw-desktop-theme';
const loadTheme = (): 'light' | 'dark' => {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

const ExcalidrawDesktop: React.FC = () => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const currentFilePathRef = useRef<string | null>(null);
  // Scene JSON as last written or loaded, so autosave only writes real changes
  const savedJsonRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  // Autosave starts once the initial scene is restored, so it can't overwrite it with an empty one
  const autosaveEnabledRef = useRef(false);
  const initialSceneRequestedRef = useRef(false);
  const autosaveErrorRef = useRef<string | null>(null);
  const themeRef = useRef(loadTheme());
  const electronAPI = useElectronAPI();

  const serializeScene = useCallback(() => {
    if (!excalidrawAPI) return null;
    return serializeAsJSON(
      excalidrawAPI.getSceneElements(),
      excalidrawAPI.getAppState(),
      excalidrawAPI.getFiles(),
      'local',
    );
  }, [excalidrawAPI]);

  // Write the scene to the open file (or the untitled drawing) if it changed since the last write
  const flushAutosave = useCallback((sync = false) => {
    window.clearTimeout(autosaveTimerRef.current);
    if (!electronAPI || !autosaveEnabledRef.current) return;
    const json = serializeScene();
    if (!json || json === savedJsonRef.current) return;
    const filePath = currentFilePathRef.current;
    savedJsonRef.current = json;
    if (sync) {
      electronAPI.autosaveSync(filePath, json);
      return;
    }
    electronAPI.autosave(filePath, json).then(
      () => {
        autosaveErrorRef.current = null;
      },
      (err) => {
        savedJsonRef.current = null; // retry on the next change
        const message = (err instanceof Error ? err.message : String(err))
          .replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
        console.error('[ExcalidrawDesktop] Autosave failed:', err);
        if (autosaveErrorRef.current !== message) {
          autosaveErrorRef.current = message;
          alert(`Autosave failed: ${message}\nUse File > Save As to save the drawing elsewhere.`);
        }
      },
    );
  }, [electronAPI, serializeScene]);

  const scheduleAutosave = useCallback(() => {
    if (!autosaveEnabledRef.current) return;
    window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => flushAutosave(), AUTOSAVE_DELAY_MS);
  }, [flushAutosave]);

  const handleChange = useCallback((_elements: unknown, appState: { theme: 'light' | 'dark' }) => {
    if (appState.theme !== themeRef.current) {
      themeRef.current = appState.theme;
      try {
        localStorage.setItem(THEME_KEY, appState.theme);
      } catch {}
    }
    scheduleAutosave();
  }, [scheduleAutosave]);

  // Files are always autosaved; an untitled drawing is lost when New/Open replace it
  const hasUnsavedChanges = useCallback(() => {
    return !!excalidrawAPI && !currentFilePathRef.current && excalidrawAPI.getSceneElements().length > 0;
  }, [excalidrawAPI]);

  const loadScene = useCallback(async (filePath: string | null, content: string) => {
    if (!electronAPI || !excalidrawAPI) return;
    try {
      const scene = await loadFromBlob(
        new Blob([content], { type: 'application/json' }),
        excalidrawAPI.getAppState(),
        excalidrawAPI.getSceneElementsIncludingDeleted(),
      );
      excalidrawAPI.addFiles(Object.values(scene.files));
      excalidrawAPI.updateScene({
        elements: scene.elements,
        appState: scene.appState,
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      excalidrawAPI.history.clear();
      if (scene.elements.length > 0) {
        excalidrawAPI.scrollToContent(scene.elements, { fitToContent: true });
      }
      currentFilePathRef.current = filePath;
      // updateScene applies appState asynchronously, so take the loaded appState for the baseline
      savedJsonRef.current = serializeAsJSON(
        excalidrawAPI.getSceneElements(),
        { ...excalidrawAPI.getAppState(), ...scene.appState },
        excalidrawAPI.getFiles(),
        'local',
      );
      // Remember what is open for the next start
      electronAPI.autosave(filePath, null).catch((err) => {
        console.error('[ExcalidrawDesktop] Failed to record open file:', err);
      });
    } catch (err) {
      console.error('[ExcalidrawDesktop] Failed to open file:', err);
      alert('Failed to open file. It may not be a valid Excalidraw file.');
    }
  }, [electronAPI, excalidrawAPI, serializeScene]);

  // Handle file-opened event from main process
  const handleFileOpened = useCallback(async (filePath: string, content: string) => {
    if (hasUnsavedChanges() && !confirm('You have unsaved changes. Open the file anyway?')) {
      return;
    }
    flushAutosave(); // keep pending edits of the current drawing
    await loadScene(filePath, content);
  }, [hasUnsavedChanges, flushAutosave, loadScene]);

  const handleNew = useCallback(() => {
    if (!excalidrawAPI) return;
    if (hasUnsavedChanges() && !confirm('You have unsaved changes. Create a new file?')) {
      return;
    }
    flushAutosave(); // keep pending edits of the current file
    excalidrawAPI.resetScene();
    currentFilePathRef.current = null;
    // The empty canvas becomes the untitled drawing
    savedJsonRef.current = null;
    scheduleAutosave();
  }, [excalidrawAPI, hasUnsavedChanges, flushAutosave, scheduleAutosave]);

  const saveScene = useCallback(async (saveAs: boolean) => {
    if (!electronAPI || !excalidrawAPI) return;

    let filePath = currentFilePathRef.current;
    if (saveAs || !filePath) {
      // Main process appends .excalidraw and allows writing to the chosen path
      const result = await electronAPI.showSaveDialog();
      if (result.canceled || !result.filePath) return;
      filePath = result.filePath;
    }

    window.clearTimeout(autosaveTimerRef.current);
    const json = serializeScene();
    if (!json) return;
    try {
      // Main also records it as the open file for the next start
      await electronAPI.writeFile(filePath, json);
    } catch (err) {
      console.error('[ExcalidrawDesktop] Failed to save file:', err);
      alert(`Failed to save file: ${err instanceof Error ? err.message : err}`);
      return;
    }
    currentFilePathRef.current = filePath;
    savedJsonRef.current = json;
  }, [electronAPI, excalidrawAPI, serializeScene]);

  const handleSave = useCallback(() => saveScene(false), [saveScene]);
  const handleSaveAs = useCallback(() => saveScene(true), [saveScene]);

  // Register Electron menu event handlers once both APIs are available
  useEffect(() => {
    if (!electronAPI || !excalidrawAPI) return;

    electronAPI.onMenuNew(handleNew);
    electronAPI.onMenuSave(handleSave);
    electronAPI.onMenuSaveAs(handleSaveAs);
    electronAPI.onMenuImportMermaid(() => {
      excalidrawAPI.updateScene({
        appState: { openDialog: { name: 'ttd', tab: 'mermaid' } },
      });
    });
    electronAPI.onFileOpened(handleFileOpened);

    // Final save when the window closes or reloads
    const onBeforeUnload = () => flushAutosave(true);
    window.addEventListener('beforeunload', onBeforeUnload);

    // Show the file passed on the command line or the last session, then start autosaving
    if (!initialSceneRequestedRef.current) {
      initialSceneRequestedRef.current = true;
      electronAPI.getInitialScene()
        .then((scene) => scene && loadScene(scene.filePath, scene.content))
        .catch((err) => console.error('[ExcalidrawDesktop] Failed to restore last session:', err))
        .finally(() => {
          autosaveEnabledRef.current = true;
        });
    }

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      electronAPI.removeAllListeners('menu-new');
      electronAPI.removeAllListeners('menu-save');
      electronAPI.removeAllListeners('menu-save-as');
      electronAPI.removeAllListeners('menu-import-mermaid');
      electronAPI.removeAllListeners('file-opened');
    };
  }, [electronAPI, excalidrawAPI, handleNew, handleSave, handleSaveAs, handleFileOpened, flushAutosave, loadScene]);

  return (
    <div className="excalidraw-desktop">
      <div className="excalidraw-container">
        <Excalidraw
          excalidrawAPI={setExcalidrawAPI}
          onChange={handleChange}
          initialData={{
            appState: {
              viewBackgroundColor: '#ffffff',
              theme: themeRef.current,
            },
          }}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
              toggleTheme: true,
            },
          }}
        />
      </div>
    </div>
  );
};

export default ExcalidrawDesktop;
