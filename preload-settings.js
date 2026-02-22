const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsAPI', {
  setTheme: (name) => ipcRenderer.invoke('set-theme', name),
  listThemes: () => ipcRenderer.invoke('list-themes'),
  getCurrentTheme: () => ipcRenderer.invoke('get-current-theme'),
  importCustomTheme: () => ipcRenderer.invoke('import-custom-theme'),

  getMemoryUsage: () => ipcRenderer.invoke('get-memory-usage'),

  setMic: (deviceId) => ipcRenderer.invoke('set-mic', deviceId),
  getCurrentMic: () => ipcRenderer.invoke('get-current-mic'),
  openMicSettings: () => ipcRenderer.invoke('open-mic-settings'),

  importDimka: () => ipcRenderer.invoke('import-dimka'),
  resetDimka: () => ipcRenderer.invoke('reset-dimka'),
  getDimkaUrl: () => ipcRenderer.invoke('get-dimka-url'),

  setVolume: (v) => ipcRenderer.invoke('set-volume', v),
  getCurrentVolume: () => ipcRenderer.invoke('get-current-volume'),

  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});