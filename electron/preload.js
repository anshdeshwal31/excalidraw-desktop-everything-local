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

  // Scene to show after (re)load: a file passed on the command line or the last session.
  // Call once listeners are registered; main sends later files via 'file-opened'.
  getInitialScene: () => ipcRenderer.invoke('get-initial-scene'),

  // Autosave to the open file (filePath) or the untitled drawing (null);
  // content null only records which file is open
  autosave: (filePath, content) => ipcRenderer.invoke('autosave', filePath, content),
  autosaveSync: (filePath, content) => ipcRenderer.sendSync('autosave-sync', filePath, content),

  // Projects: the files shown as tabs for one-click switching
  getProjects: () => ipcRenderer.invoke('get-projects'),
  openProject: (filePath) => ipcRenderer.invoke('open-project', filePath),
  addProjects: () => ipcRenderer.invoke('add-projects'),
  removeProject: (filePath) => ipcRenderer.invoke('remove-project', filePath),
  onProjectsChanged: (callback) => ipcRenderer.on('projects-changed', (event, projects) => {
    callback(projects);
  }),

  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
