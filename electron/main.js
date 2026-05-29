const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');
const fs   = require('fs');
const http = require('http');
const net  = require('net');

const isDev = !app.isPackaged;
const PORT  = 19284;

// ── Always use AppData in production, local ./data in dev ─────────────────────
function getDataPath() {
  if (isDev) {
    return path.join(__dirname, '..', 'data');
  }
  return path.join(app.getPath('userData'), 'data');
}

// ── On first packaged launch, copy bundled data into AppData ──────────────────
function migrateData() {
  if (isDev) return;

  const dest = getDataPath();

  // Where electron-builder puts extraResources
  const src = path.join(process.resourcesPath, 'data');

  // Make sure destination exists
  fs.mkdirSync(dest, { recursive: true });

  // If bundled data exists, copy any .db file that doesn't exist in dest yet
  // This preserves data the user has created after first install
  if (fs.existsSync(src)) {
    const files = fs.readdirSync(src);
    files.forEach(file => {
      const destFile = path.join(dest, file);
      const srcFile  = path.join(src, file);
      // Only copy if destination file doesn't exist yet
      // This means existing user data is never overwritten
      if (!fs.existsSync(destFile)) {
        try {
          fs.copyFileSync(srcFile, destFile);
          console.log(`Migrated: ${file}`);
        } catch (e) {
          console.error(`Failed to migrate ${file}:`, e.message);
        }
      }
    });
  }

  process.env.DEVDOCS_DATA_PATH = dest;
}

// Set data path immediately so db.js picks it up when server.js is required
if (isDev) {
  process.env.DEVDOCS_DATA_PATH = path.join(__dirname, '..', 'data');
} else {
  // Set early — migrateData() will also set it but server starts after
  process.env.DEVDOCS_DATA_PATH = path.join(app.getPath('userData'), 'data');
  // Ensure the folder exists immediately
  fs.mkdirSync(process.env.DEVDOCS_DATA_PATH, { recursive: true });
}

// ── Check if port is already in use ──────────────────────────────────────────
function isPortInUse() {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(true))
      .once('listening', () => { tester.close(); resolve(false); })
      .listen(PORT, '127.0.0.1');
  });
}

// ── Start Express server ──────────────────────────────────────────────────────
let expressServer = null;

async function startServer() {
  const inUse = await isPortInUse();
  if (inUse) {
    console.log(`Port ${PORT} already in use — reusing existing server`);
    return;
  }

  const serverApp = require('../src/server.js');
  await new Promise((resolve, reject) => {
    expressServer = serverApp.listen(PORT, '127.0.0.1', () => {
      console.log(`Express running on http://127.0.0.1:${PORT}`);
      resolve();
    });
    expressServer.on('error', reject);
  });
}

// ── Poll until server is ready ────────────────────────────────────────────────
function waitForServer(attempts = 40) {
  return new Promise((resolve, reject) => {
    let tries = 0;
    const check = () => {
      const req = http.get(`http://127.0.0.1:${PORT}/`, (res) => {
        res.resume();
        resolve();
      });
      req.setTimeout(500);
      req.on('error', () => {
        tries++;
        if (tries >= attempts) return reject(new Error(`Server not ready after ${attempts} attempts`));
        setTimeout(check, 300);
      });
      req.on('timeout', () => {
        req.destroy();
        tries++;
        if (tries >= attempts) return reject(new Error('Server timed out'));
        setTimeout(check, 300);
      });
    };
    check();
  });
}

// ── Main window ───────────────────────────────────────────────────────────────
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    title: 'DevDocs',
    backgroundColor: '#1e2227',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    show: false,
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc) => {
    console.error('Page failed to load:', errorCode, errorDesc);
    // Retry after a short delay
    setTimeout(() => {
      if (mainWindow) mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
    }, 1000);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${PORT}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Simple menu ───────────────────────────────────────────────────────────────
function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    { label: 'File', submenu: [isMac ? { role: 'close' } : { role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }])] },
  ]));
}

// ── Single instance lock ──────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // ── Boot sequence ───────────────────────────────────────────────────────────
  app.whenReady().then(async () => {
    console.log('App ready, isDev:', isDev);
    console.log('Data path:', process.env.DEVDOCS_DATA_PATH);

    migrateData();
    buildMenu();

    try {
      await startServer();
      console.log('Waiting for server...');
      await waitForServer();
      console.log('Server ready, opening window');
      createWindow();
    } catch (err) {
      console.error('Startup error:', err.message);
      // Show error in a dialog so it's not invisible
      const { dialog } = require('electron');
      dialog.showErrorBox('DevDocs failed to start', err.message + '\n\n' + err.stack);
      app.quit();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('before-quit', () => {
    if (expressServer) { expressServer.close(); expressServer = null; }
  });
}