import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Excalidraw,
  CaptureUpdateAction,
  loadFromBlob,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type { AppState, ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { useElectronAPI } from './hooks/useElectronAPI';
import { ProjectBar, getProjectName } from './components/ProjectBar';
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

  // Project tabs: the list is owned by the main process; openFilePath marks the active tab
  const [projects, setProjects] = useState<string[]>([]);
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [theme, setTheme] = useState(themeRef.current);
  // Where each project was scrolled/zoomed, so switching back lands on the same spot
  const projectViewsRef = useRef(new Map<string, Pick<AppState, 'scrollX' | 'scrollY' | 'zoom'>>());
  const switchingRef = useRef(false);

  const setOpenFile = useCallback((filePath: string | null) => {
    currentFilePathRef.current = filePath;
    setOpenFilePath(filePath);
  }, []);

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
      setTheme(appState.theme);
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
      setOpenFile(filePath);
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
  }, [electronAPI, excalidrawAPI, serializeScene, setOpenFile]);

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
    setOpenFile(null);
    // The empty canvas becomes the untitled drawing
    savedJsonRef.current = null;
    scheduleAutosave();
  }, [excalidrawAPI, hasUnsavedChanges, flushAutosave, scheduleAutosave, setOpenFile]);

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
    setOpenFile(filePath);
    savedJsonRef.current = json;
  }, [electronAPI, excalidrawAPI, serializeScene, setOpenFile]);

  const handleSave = useCallback(() => saveScene(false), [saveScene]);
  const handleSaveAs = useCallback(() => saveScene(true), [saveScene]);

  useEffect(() => {
    if (!electronAPI) return;
    electronAPI.getProjects().then(setProjects);
    electronAPI.onProjectsChanged(setProjects);
    return () => electronAPI.removeAllListeners('projects-changed');
  }, [electronAPI]);

  // Switch to another project in one step; the project being left is autosaved, not discarded
  const switchProject = useCallback(async (filePath: string) => {
    if (!electronAPI || !excalidrawAPI || switchingRef.current) return false;
    if (filePath === currentFilePathRef.current) return true;
    switchingRef.current = true;
    try {
      // Finish any text being typed so it's part of the autosave
      (document.activeElement as HTMLElement | null)?.blur();

      let content: string;
      try {
        content = await electronAPI.openProject(filePath);
      } catch {
        if (confirm(`Couldn't open "${getProjectName(filePath)}". It may have been moved or deleted.\n\nRemove it from projects?`)) {
          electronAPI.removeProject(filePath);
        }
        return false;
      }

      const leaving = currentFilePathRef.current;
      if (leaving) {
        const { scrollX, scrollY, zoom } = excalidrawAPI.getAppState();
        projectViewsRef.current.set(leaving, { scrollX, scrollY, zoom });
      }

      await handleFileOpened(filePath, content);
      if (currentFilePathRef.current !== filePath) return false;

      const view = projectViewsRef.current.get(filePath);
      if (view) {
        excalidrawAPI.updateScene({ appState: view, captureUpdate: CaptureUpdateAction.NEVER });
      }
      return true;
    } finally {
      switchingRef.current = false;
    }
  }, [electronAPI, excalidrawAPI, handleFileOpened]);

  // Removes the tab, not the file; closing the open project moves to its neighbour
  const removeProject = useCallback(async (filePath: string) => {
    if (!electronAPI || switchingRef.current) return;
    if (filePath === currentFilePathRef.current) {
      const index = projects.indexOf(filePath);
      const neighbor = projects[index + 1] ?? projects[index - 1];
      if (!neighbor || !(await switchProject(neighbor))) {
        handleNew();
      }
    }
    projectViewsRef.current.delete(filePath);
    electronAPI.removeProject(filePath);
  }, [electronAPI, projects, switchProject, handleNew]);

  const handleAddProjects = useCallback(async () => {
    if (!electronAPI) return;
    const added = await electronAPI.addProjects();
    if (added.length > 0) switchProject(added[0]);
  }, [electronAPI, switchProject]);

  // Ctrl/Cmd+Tab cycles through projects, Ctrl/Cmd+1..9 jumps straight to one
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || projects.length === 0) return;

      let target: string | undefined;
      if (event.key === 'Tab') {
        const index = projects.indexOf(currentFilePathRef.current ?? '');
        const step = event.shiftKey ? -1 : 1;
        target = index === -1
          ? projects[step > 0 ? 0 : projects.length - 1]
          : projects[(index + step + projects.length) % projects.length];
      } else if (!event.shiftKey && /^(Digit|Numpad)[1-9]$/.test(event.code)) {
        target = projects[Number(event.code.slice(-1)) - 1];
      }
      if (!target) return;

      event.preventDefault();
      event.stopPropagation();
      switchProject(target);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [projects, switchProject]);

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
      <ProjectBar
        projects={projects}
        activePath={openFilePath}
        theme={theme}
        onSwitch={switchProject}
        onRemove={removeProject}
        onAdd={handleAddProjects}
      />
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
