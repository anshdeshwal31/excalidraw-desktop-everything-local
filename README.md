# Excalidraw Desktop

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-28.3.3-blue.svg)](https://electronjs.org/)
[![React](https://img.shields.io/badge/React-18.2.0-blue.svg)](https://reactjs.org/)

A cross-platform desktop application wrapping [Excalidraw](https://excalidraw.com) with built-in Mermaid diagram support, packaged with Electron for Windows, macOS, and Linux.

## Download

Pre-built binaries are available on the [Releases](https://github.com/fernandopicardi/excalidraw-desktop/releases) page:

### Windows
| File | Description |
|------|-------------|
| `Excalidraw-Desktop-Setup-x.x.x.exe` | Installer — Program Files, Start Menu and desktop shortcuts |
| `Excalidraw-Desktop-x.x.x.exe` | Portable — runs directly, no installation required |

### macOS
| File | Description |
|------|-------------|
| `Excalidraw-Desktop-x.x.x.dmg` | Disk image — drag to Applications |
| `Excalidraw-Desktop-x.x.x-mac.zip` | Zipped .app bundle |

### Linux
| File | Description |
|------|-------------|
| `Excalidraw-Desktop-x.x.x.AppImage` | AppImage — runs on most distros, no install needed |
| `excalidraw-desktop_x.x.x_amd64.deb` | Debian/Ubuntu package |

> macOS and Linux builds are generated automatically via GitHub Actions. See [Building Executables](#building-executables) for details.

## Features

### Excalidraw Editor
The full Excalidraw drawing experience runs natively on your desktop:
- Infinite canvas with all drawing tools (shapes, arrows, text, freehand)
- Hand-drawn visual style
- Light and dark theme toggle
- Zoom, pan, undo/redo
- All standard Excalidraw keyboard shortcuts

### Mermaid Diagram Support
Convert Mermaid diagram code into editable Excalidraw elements using the **built-in Mermaid to Excalidraw** tool:

1. Open **More Tools** (the `...` button in the toolbar)
2. Select **Mermaid to Excalidraw**
3. Write or paste your Mermaid code in the editor
4. Preview renders automatically as you type
5. Click **Insert** to add the diagram to your canvas

Alternatively, use **Ctrl+M** (or **Cmd+M** on macOS) or **File > Import Mermaid** from the application menu.

**Supported diagram types:**

| Type | Support | Notes |
|------|---------|-------|
| Flowchart | Full | Nodes, edges, subgraphs, styling |
| Sequence Diagram | Full | Actors, messages, activations |
| Class Diagram | Full | Classes, fields, methods, relationships |
| State Diagram | Image fallback | Rendered as embedded SVG image |
| Gantt Chart | Image fallback | Rendered as embedded SVG image |
| ER Diagram | Image fallback | Rendered as embedded SVG image |
| Pie Chart | Image fallback | Rendered as embedded SVG image |
| Git Graph | Image fallback | Rendered as embedded SVG image |
| Mindmap | Image fallback | Rendered as embedded SVG image |

> **Full** support means the diagram is converted into native Excalidraw elements (rectangles, arrows, text) that you can edit individually. **Image fallback** means the diagram is embedded as an SVG image on the canvas.

### Desktop Integration
- Native application menu on all platforms (File, Edit, View, Window)
- File operations: New, Open, Save, Save As
- Unsaved changes detection with confirmation prompt
- Excalidraw logo as the application icon (window, taskbar/dock, installer)
- macOS: proper Cmd shortcuts, dock integration, dmg installer
- Linux: AppImage and .deb packages

## Keyboard Shortcuts

### Application Menu Shortcuts

> On macOS, `Ctrl` is replaced by `Cmd`.

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | New file |
| `Ctrl+O` | Open file |
| `Ctrl+S` | Save |
| `Ctrl+Shift+S` | Save As |
| `Ctrl+M` | Open Mermaid dialog |
| `Ctrl+Q` | Quit |

All standard Excalidraw shortcuts also work (selection, tools, zoom, etc.).

## Architecture

### How It Works

Excalidraw Desktop treats the `<Excalidraw>` React component as an **uncontrolled component**. This is a critical design decision:

- The Excalidraw component manages its own internal DOM state (canvas rendering, SVG manipulation)
- The app uses `ref` (imperative API) to read/write scene data — never React state
- The `onChange` callback only tracks whether there are unsaved changes — it does **not** store elements or appState in React state
- This prevents the `removeChild` DOM crash that occurs when React tries to reconcile DOM nodes that Excalidraw has already modified internally

```
Excalidraw (uncontrolled)
  ├── initialData → sets initial scene on mount only
  ├── ref → excalidrawRef.current.getSceneElements() for Save
  ├── ref → excalidrawRef.current.updateScene() for Open/New
  ├── ref → excalidrawRef.current.setOpenDialog() for Mermaid
  └── onChange → only sets hasUnsavedChanges flag (no re-render)
```

### Project Structure

```
excalidraw-desktop/
├── electron/
│   ├── main.js              # Electron main process, window, native menu
│   └── preload.js           # Context bridge (IPC to renderer)
├── packages/
│   └── desktop-renderer/    # React application
│       ├── src/
│       │   ├── App.tsx       # Main component (Excalidraw wrapper)
│       │   ├── hooks/
│       │   │   └── useElectronAPI.ts
│       │   ├── utils/
│       │   │   └── fileUtils.ts
│       │   └── styles/
│       │       └── App.css
│       ├── vite.config.ts    # Vite config (base: './' for Electron)
│       └── package.json
├── assets/
│   ├── icon.ico              # Windows app icon
│   ├── icon.icns             # macOS app icon
│   ├── icon-256.png          # Linux app icon / PNG source
│   └── icon.svg              # SVG source
├── .github/
│   └── workflows/
│       └── build.yml         # CI: builds for Win/Mac/Linux on tag push
├── build/                    # Vite build output (loaded by Electron)
├── dist/                     # Packaged executables (platform-specific)
└── package.json              # Root config with electron-builder settings
```

### Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Electron | 28.3.3 | Desktop framework |
| React | 18.2.0 | UI library |
| TypeScript | 5.0 | Type safety |
| Vite | 5.x | Build tool and dev server |
| @excalidraw/excalidraw | 0.17.1 | Drawing editor component |
| @excalidraw/mermaid-to-excalidraw | 1.1.0 | Mermaid diagram converter |
| electron-builder | 24.x | Packaging (NSIS installer + portable) |

## Development

### Prerequisites

- Node.js 18.x - 22.x
- Yarn 1.22.22
- Windows 10/11, macOS 11+, or Ubuntu 20.04+ (builds for current platform)

### Setup

```bash
git clone https://github.com/fernandopicardi/excalidraw-desktop.git
cd excalidraw-desktop
yarn install
```

### Commands

| Command | Description |
|---------|-------------|
| `yarn dev` | Build renderer + launch Electron |
| `yarn dev:hot` | Vite dev server + Electron with hot reload |
| `yarn build` | Build the renderer (output to `build/`) |
| `yarn start` | Launch Electron (requires prior `yarn build`) |
| `yarn dist` | Build renderer + create installer and portable `.exe` |
| `yarn clean` | Remove `dist/`, `build/`, and `node_modules/` |

### Building Executables

```bash
# Build for current platform
yarn dist

# Output (varies by platform):
#   Windows: dist/Excalidraw Desktop Setup 1.0.0.exe + portable
#   macOS:   dist/Excalidraw Desktop-1.0.0.dmg + .zip
#   Linux:   dist/Excalidraw Desktop-1.0.0.AppImage + .deb
```

> **Cross-platform builds:** You can only build for your current OS natively. To build for all platforms, push a version tag (`git tag v1.x.x && git push --tags`) and the GitHub Actions workflow will build for Windows, macOS (x64 + arm64), and Linux automatically.

The `electron-builder` configuration in `package.json` produces:
- **Windows**: NSIS installer + portable executable
- **macOS**: DMG disk image + zip archive (universal: Intel + Apple Silicon)
- **Linux**: AppImage + .deb package

## Differences from Excalidraw Web

| Feature | Web (excalidraw.com) | Desktop |
|---------|---------------------|---------|
| Platforms | Any browser | Windows, macOS, Linux |
| Collaboration | Real-time with others | Single user (offline) |
| File storage | Browser localStorage / cloud | Local filesystem (.excalidraw files) |
| Mermaid | Same built-in tool | Same built-in tool + Ctrl/Cmd+M shortcut |
| Menu | Excalidraw UI only | Native OS menu + Excalidraw UI |
| Installation | None (browser) | Installer, DMG, AppImage, or portable |
| AI Text-to-Diagram | Available | Not available (requires API key) |

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Make your changes and test with `yarn dev`
4. Build and verify: `yarn dist`
5. Commit and push
6. Open a Pull Request

## License

MIT License. See [LICENSE](LICENSE) for details.

## Credits

- [Excalidraw](https://excalidraw.com) — The drawing editor
- [Mermaid](https://mermaid-js.github.io) — Diagram definition language
- [Electron](https://electronjs.org) — Desktop application framework
