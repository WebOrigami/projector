import { app, BrowserWindow, ipcMain } from "electron";
import { fileOpen } from "./menu.js";
import * as windowManager from "./windowManager.js";

// Main application startup, shutdown, and interprocess communication

ipcMain.handle("file-open-dialog", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  await fileOpen(null, window);
});

ipcMain.on("next-command", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window.project.nextCommand();
});

ipcMain.on("previous-command", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window?.project) {
    window.project.previousCommand();
  }
});

ipcMain.on("run-command", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window.project.run();
});

ipcMain.handle("state:update", (_evt, changes) => {
  const window = BrowserWindow.getFocusedWindow();
  if (window?.project) {
    window.project.setState(changes);
  }
});

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
