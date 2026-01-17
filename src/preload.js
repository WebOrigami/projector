// Preload scripts must use CommonJS `require`
const { contextBridge, ipcRenderer } = require("electron");

//
/**
 * Expose safe IPC API to renderer process.
 *
 * Note: the "main world" here is a *Chromium* concept, not an Electron one. In
 * Chromium, the main world is the default JavaScript context of the web page.
 * It's completely separate from the Electron main process.
 */
contextBridge.exposeInMainWorld("api", {
  /**
   * Let the renderer invoke methods on the project associated with the window.
   */
  async invokeProjectMethod(...args) {
    return ipcRenderer.invoke("invoke-project", ...args);
  },

  /**
   * Subscription method used by the renderer to listen for method invocation
   * requests from the main process.
   */
  onInvokePageMethod(handler) {
    const listener = async (_event, ...args) => {
      await handler(...args);
    };
    ipcRenderer.on("invoke-page", listener);

    // Return unsubscribe
    return () => ipcRenderer.removeListener("invoke-page", listener);
  },
});
