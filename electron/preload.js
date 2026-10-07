const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // File operations (IPC to main process)
  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),

  // Menu events (main → renderer)
  onMenuNew: (callback) => ipcRenderer.on('menu-new', () => callback()),
  onMenuSave: (callback) => ipcRenderer.on('menu-save', () => callback()),
  onMenuSaveAs: (callback) => ipcRenderer.on('menu-save-as', () => callback()),
  onMenuImportMermaid: (callback) => ipcRenderer.on('menu-import-mermaid', () => callback()),

  // File opened event (main opens dialog/reads file, sends content here)
  onFileOpened: (callback) => ipcRenderer.on('file-opened', (event, filePath, content) => {
    callback(filePath, content);
  }),

  // Renderer has registered its listeners; main may now send pending files
  rendererReady: () => ipcRenderer.send('renderer-ready'),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
