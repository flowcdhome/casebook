const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('svc', {
  go: u => ipcRenderer.send('svc:go', u),
  back: () => ipcRenderer.send('svc:back'),
  forward: () => ipcRenderer.send('svc:forward'),
  reload: () => ipcRenderer.send('svc:reload'),
  external: () => ipcRenderer.send('svc:external'),
  grab: what => ipcRenderer.invoke('svc:grab', what),
  onUrl: cb => ipcRenderer.on('svc:url', (_, u) => cb(u)),
});
