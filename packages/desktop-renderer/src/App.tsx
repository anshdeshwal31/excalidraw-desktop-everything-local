import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  Excalidraw,
  CaptureUpdateAction,
  hashElementsVersion,
  loadFromBlob,
  serializeAsJSON,
} from '@excalidraw/excalidraw';
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types';
import '@excalidraw/excalidraw/index.css';
import { useElectronAPI } from './hooks/useElectronAPI';
import './styles/App.css';

const ExcalidrawDesktop: React.FC = () => {
  const [excalidrawAPI, setExcalidrawAPI] = useState<ExcalidrawImperativeAPI | null>(null);
  const currentFilePathRef = useRef<string | null>(null);
  // Elements version hash at the last open/save/new, used to detect unsaved changes
  const savedVersionRef = useRef(0);
  const electronAPI = useElectronAPI();

  const hasUnsavedChanges = useCallback(() => {
    if (!excalidrawAPI) return false;
    return hashElementsVersion(excalidrawAPI.getSceneElementsIncludingDeleted()) !== savedVersionRef.current;
  }, [excalidrawAPI]);

  // Handle file-opened event from main process
  const handleFileOpened = useCallback(async (filePath: string, content: string) => {
    if (!excalidrawAPI) return;
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
      savedVersionRef.current = hashElementsVersion(excalidrawAPI.getSceneElementsIncludingDeleted());
    } catch (err) {
      console.error('[ExcalidrawDesktop] Failed to open file:', err);
      alert('Failed to open file. It may not be a valid Excalidraw file.');
    }
  }, [excalidrawAPI]);

  const handleNew = useCallback(() => {
    if (!excalidrawAPI) return;
    if (hasUnsavedChanges() && !confirm('You have unsaved changes. Create a new file?')) {
      return;
    }
    excalidrawAPI.resetScene();
    currentFilePathRef.current = null;
    savedVersionRef.current = hashElementsVersion(excalidrawAPI.getSceneElementsIncludingDeleted());
  }, [excalidrawAPI, hasUnsavedChanges]);

  const saveScene = useCallback(async (saveAs: boolean) => {
    if (!electronAPI || !excalidrawAPI) return;

    let filePath = currentFilePathRef.current;
    if (saveAs || !filePath) {
      // Main process appends .excalidraw and allows writing to the chosen path
      const result = await electronAPI.showSaveDialog();
      if (result.canceled || !result.filePath) return;
      filePath = result.filePath;
    }

    const version = hashElementsVersion(excalidrawAPI.getSceneElementsIncludingDeleted());
    const json = serializeAsJSON(
      excalidrawAPI.getSceneElements(),
      excalidrawAPI.getAppState(),
      excalidrawAPI.getFiles(),
      'local',
    );
    try {
      await electronAPI.writeFile(filePath, json);
    } catch (err) {
      console.error('[ExcalidrawDesktop] Failed to save file:', err);
      alert(`Failed to save file: ${err instanceof Error ? err.message : err}`);
      return;
    }
    currentFilePathRef.current = filePath;
    savedVersionRef.current = version;
  }, [electronAPI, excalidrawAPI]);

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
    // Tell main it can now send files (e.g. from double-click launch)
    electronAPI.rendererReady();

    return () => {
      electronAPI.removeAllListeners('menu-new');
      electronAPI.removeAllListeners('menu-save');
      electronAPI.removeAllListeners('menu-save-as');
      electronAPI.removeAllListeners('menu-import-mermaid');
      electronAPI.removeAllListeners('file-opened');
    };
  }, [electronAPI, excalidrawAPI, handleNew, handleSave, handleSaveAs, handleFileOpened]);

  return (
    <div className="excalidraw-desktop">
      <div className="excalidraw-container">
        <Excalidraw
          excalidrawAPI={setExcalidrawAPI}
          initialData={{
            appState: {
              viewBackgroundColor: '#ffffff',
              theme: 'light',
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
