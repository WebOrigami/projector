import { app, BrowserWindow, ipcMain } from "electron";
import * as windowManager from "./windowManager.js";

/**
 * Main application startup, shutdown, and interprocess communication
 */

/**
 * Forward requests from the renderer to the project associated with the window.
 */
ipcMain.handle("invoke-project", async (event, ...args) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const project = /** @type {any} */ (window).project;
  const fnName = args.shift();
  const fn = project[fnName];
  if (fn instanceof Function) {
    await fn.apply(project, args);
  } else {
    throw new Error(
      `Renderer tried to invoke non-existent project method: ${fnName}`
    );
  }
});

/**
 * At startup, restore previously open project windows.
 */
app.whenReady().then(async () => {
  await windowManager.restoreProjectWindows();

  // Bring the app to the foreground; only works if we have windows open
  app.show();
  app.focus();
});

app.on("window-all-closed", () => {
  // Don't quit the app when all windows are closed
  // User must explicitly quit via Cmd+Q or menu
});
