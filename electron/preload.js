// Preload — contextIsolation bridge
// Currently just exposes the Electron version for debugging.
// Add IPC bridges here if needed in the future.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isElectron: true,
});