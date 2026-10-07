const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;
let fileToOpenOnReady = null;
let rendererReady = false;
// Only files the user opened or picked in the save dialog may be written by the renderer
const allowedWritePaths = new Set();


// Check if launched with a file argument (double-click on .excalidraw file)
const fileArg = process.argv.find(arg =>
  arg.endsWith('.excalidraw') && !arg.startsWith('-')
);
if (fileArg && fs.existsSync(fileArg)) {
  fileToOpenOnReady = path.resolve(fileArg);
}

function openFileInRenderer(filePath) {
  if (!filePath) return;
  if (!mainWindow || !rendererReady) {
    // Sent when the renderer reports it is listening (see 'renderer-ready')
    fileToOpenOnReady = filePath;
    return;
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    allowedWritePaths.add(path.resolve(filePath));
    mainWindow.webContents.send('file-opened', filePath, content);
  } catch (err) {
    console.error('[Main] Failed to read file:', err);
    dialog.showErrorBox('Failed to open file', err.message);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, process.platform === 'darwin'
      ? '../assets/icon.icns'
      : '../assets/icon.ico'),
    titleBarStyle: 'default',
    show: false
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173').catch(err => {
      console.error('Failed to load dev URL:', err);
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../build/index.html')).catch(err => {
      console.error('Failed to load app:', err);
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // A reload replaces the page and its listeners; queue files until it reports ready again
  mainWindow.webContents.on('did-navigate', () => {
    rendererReady = false;
  });

  // Never open new windows or navigate away from the app; web links go to the default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalLink(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    openExternalLink(url);
  });

  // Excalidraw treats Shift+S as "pick stroke colour" even with Ctrl held,
  // so handle Ctrl+Shift+S here and keep it away from the page
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && (input.control || input.meta) && input.shift &&
        input.key.toLowerCase() === 's') {
      event.preventDefault();
      if (!input.isAutoRepeat) mainWindow.webContents.send('menu-save-as');
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function openExternalLink(url) {
  if (/^(https?|mailto):/i.test(url)) {
    shell.openExternal(url);
  }
}

// macOS: handle file open via Finder / double-click
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openFileInRenderer(filePath);
});

// Windows: handle second instance with file argument
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, argv) => {
    const file = argv.find(arg =>
      arg.endsWith('.excalidraw') && !arg.startsWith('-')
    );
    if (file && fs.existsSync(file)) {
      openFileInRenderer(path.resolve(file));
    }
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New',
          accelerator: 'CmdOrCtrl+N',
          click: () => mainWindow.webContents.send('menu-new')
        },
        {
          label: 'Open...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'Excalidraw Files', extensions: ['excalidraw'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            if (!result.canceled && result.filePaths[0]) {
              openFileInRenderer(result.filePaths[0]);
            }
          }
        },
        {
          label: 'Save',
          accelerator: 'CmdOrCtrl+S',
          click: () => mainWindow.webContents.send('menu-save')
        },
        {
          label: 'Save As...',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => mainWindow.webContents.send('menu-save-as')
        },
        { type: 'separator' },
        {
          label: 'Import Mermaid',
          accelerator: 'CmdOrCtrl+M',
          click: () => mainWindow.webContents.send('menu-import-mermaid')
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => app.quit()
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectall' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        // The minimize role defaults to Ctrl+M, which would shadow Import Mermaid
        { role: 'minimize', accelerator: '' },
        { role: 'close' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// IPC handlers
ipcMain.handle('get-app-version', () => app.getVersion());

ipcMain.on('renderer-ready', (event) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  rendererReady = true;
  if (fileToOpenOnReady) {
    const filePath = fileToOpenOnReady;
    fileToOpenOnReady = null;
    openFileInRenderer(filePath);
  }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  const target = path.resolve(String(filePath));
  if (!allowedWritePaths.has(target)) {
    throw new Error('Refusing to write a file that was not opened or chosen in the save dialog');
  }
  let data = null;
  try {
    data = typeof content === 'string' ? JSON.parse(content) : null;
  } catch {}
  if (!data || data.type !== 'excalidraw') {
    throw new Error('Refusing to write content that is not an Excalidraw scene');
  }
  fs.writeFileSync(target, content, 'utf-8');
  return true;
});

ipcMain.handle('show-save-dialog', async () => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Excalidraw Files', extensions: ['excalidraw'] }
    ]
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  let filePath = result.filePath;
  if (!filePath.toLowerCase().endsWith('.excalidraw')) {
    filePath += '.excalidraw';
  }
  allowedWritePaths.add(path.resolve(filePath));
  return { canceled: false, filePath };
});
