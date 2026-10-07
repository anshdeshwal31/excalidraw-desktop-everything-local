import { useEffect, useState } from 'react';

interface ElectronAPI {
  getAppVersion: () => Promise<string>;
  showSaveDialog: () => Promise<{ canceled: boolean; filePath?: string }>;
  writeFile: (filePath: string, content: string) => Promise<boolean>;
  onMenuNew: (callback: () => void) => void;
  onMenuSave: (callback: () => void) => void;
  onMenuSaveAs: (callback: () => void) => void;
  onMenuImportMermaid: (callback: () => void) => void;
  onFileOpened: (callback: (filePath: string, content: string) => void) => void;
  getInitialScene: () => Promise<{ filePath: string | null; content: string } | null>;
  autosave: (filePath: string | null, content: string | null) => Promise<boolean>;
  autosaveSync: (filePath: string | null, content: string) => true | string;
  removeAllListeners: (channel: string) => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export const useElectronAPI = () => {
  const [electronAPI, setElectronAPI] = useState<ElectronAPI | null>(null);

  useEffect(() => {
    if (window.electronAPI) {
      setElectronAPI(window.electronAPI);
    }
  }, []);

  return electronAPI;
};
