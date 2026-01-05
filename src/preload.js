// Preload scripts must use CommonJS `require`
const { contextBridge, ipcRenderer } = require("electron");

// Expose safe IPC API to renderer process
contextBridge.exposeInMainWorld("api", {
  nextCommand() {
    ipcRenderer.send("next-command");
  },

  // Subscribe to pushed snapshots
  onStateChanged(handler) {
    const listener = (_event, snapshot) => handler(snapshot);
    ipcRenderer.on("state:changed", listener);

    // Return unsubscribe
    return () => ipcRenderer.removeListener("state:changed", listener);
  },

  previousCommand() {
    ipcRenderer.send("previous-command");
  },

  runCommand() {
    ipcRenderer.send("run-command");
  },

  updateState(changes) {
    ipcRenderer.invoke("state:update", changes);
  },
});
