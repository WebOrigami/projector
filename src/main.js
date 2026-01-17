import { app, BrowserWindow, ipcMain } from "electron";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
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
 * Log unexpected errors to error.log in the app's user data directory
 */
async function logError(error) {
  const errorLogPath = join(app.getPath("userData"), "error.log");
  const timestamp = new Date().toISOString();
  const errorMessage = `[${timestamp}] ${
    error.stack || error.message || error
  }\n\n`;

  try {
    await appendFile(errorLogPath, errorMessage, "utf8");
  } catch (logError) {
    // If we can't write to the log file, at least log to console
    console.error("Failed to write to error log:", logError);
    console.error("Original error:", error);
  }
}

// Handle uncaught exceptions in the main process
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  logError(error);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
  logError(reason instanceof Error ? reason : new Error(String(reason)));
});

app.on("window-all-closed", () => {
  // Don't quit the app when all windows are closed
  // User must explicitly quit via Cmd+Q or menu
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
