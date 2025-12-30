// Preload scripts must use CommonJS `require`
const { contextBridge, ipcRenderer } = require("electron");

// Expose safe IPC API to renderer process
contextBridge.exposeInMainWorld("api", {
  notifyContentChanged: () => {
    ipcRenderer.send("content-changed");
  },
});
