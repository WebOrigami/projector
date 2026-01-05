// Preload scripts must use CommonJS `require`
const { contextBridge, ipcRenderer } = require("electron");

// Expose safe IPC API to renderer process
contextBridge.exposeInMainWorld("api", {
  nextCommand() {
    ipcRenderer.send("next-command");
  },

  notifyContentChanged(...args) {
    ipcRenderer.send("content-changed", ...args);
  },

  previousCommand() {
    ipcRenderer.send("previous-command");
  },

  runCommand() {
    ipcRenderer.send("run-command");
  },
});
