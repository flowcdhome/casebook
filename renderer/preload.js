const { contextBridge, ipcRenderer } = require('electron');
const on = (ch, cb) => ipcRenderer.on(ch, (_, d) => cb(d));
contextBridge.exposeInMainWorld('api', {
  load: () => ipcRenderer.invoke('load'),
  save: c => ipcRenderer.invoke('save', c),
  confSave: t => ipcRenderer.invoke('conf:save', t),
  open: u => ipcRenderer.invoke('open', u),
  exportMd: (n, t) => ipcRenderer.invoke('export', n, t),
  run: (tool, v) => ipcRenderer.invoke('run', tool, v),
  runStop: (tool, v) => ipcRenderer.invoke('run:stop', tool, v),
  svcOpen: (url, leadId) => ipcRenderer.invoke('svc:open', url, leadId),
  onRun: cb => on('run:data', cb),
  onConf: cb => on('conf:changed', cb),
  onSvc: cb => on('svc:data', cb),
});
