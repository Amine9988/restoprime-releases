'use strict';
// جسر آمن بين Electron وصفحة التطبيق
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('restoprime', {
  platform: process.platform,
  isElectron: true,
  // أحداث التحديث: window.restoprime.onUpdate('available' | 'progress' | 'downloaded', cb)
  onUpdate(event, cb) {
    const ch = `update:${event}`;
    const h = (_e, data) => cb(data);
    ipcRenderer.on(ch, h);
    return () => ipcRenderer.removeListener(ch, h);
  },
  trial: () => ipcRenderer.invoke('trial:get'),
  // الشبكة المحلية
  net: {
    get: () => ipcRenderer.invoke('net:get'),
    set: (cfg) => ipcRenderer.invoke('net:set', cfg),
    relaunch: () => ipcRenderer.invoke('net:relaunch'),
  },
});
