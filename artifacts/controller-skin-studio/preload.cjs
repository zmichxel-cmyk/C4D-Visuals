const { contextBridge, ipcRenderer } = require('electron');

// Exposed to the renderer as window.electronAPI. Kept deliberately narrow —
// since contextIsolation is on and we don't want to hand the renderer
// anything more powerful than it needs.
contextBridge.exposeInMainWorld('electronAPI', {
  libraryLoad:   (section) => ipcRenderer.invoke('library:load', section),
  libraryAdd:    (section, name, dataUrl, extra) => ipcRenderer.invoke('library:add', section, name, dataUrl, extra),
  libraryRemove: (section, id) => ipcRenderer.invoke('library:remove', section, id),
  presetsLoad:   (kind) => ipcRenderer.invoke('presets:load', kind),
  presetsSave:   (kind, presets) => ipcRenderer.invoke('presets:save', kind, presets),
});
