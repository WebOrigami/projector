import { app, BrowserWindow, ipcMain } from "electron";
import * as windowManager from "./windowManager.js";

// Main application startup, shutdown, and interprocess communication

ipcMain.on("previous-command", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window?.project) {
    window.project.previousCommand();
  }
});

ipcMain.on("next-command", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  window.project.nextCommand();
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
});

app.on("window-all-closed", () => {
  app.quit();
});
