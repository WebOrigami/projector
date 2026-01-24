import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import * as windowManager from "./windowManager.js";

let appReadyToOpenFiles = false;
const openFileQueue = [];

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
      `Renderer tried to invoke non-existent project method: ${fnName}`,
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

/**
 * Show error in a native dialog
 */
async function showErrorDialog(error) {
  const windows = BrowserWindow.getAllWindows();
  const focusedWindow = windows.find((w) => w.isFocused()) || windows[0];

  if (focusedWindow) {
    await dialog.showMessageBox(focusedWindow, {
      type: "error",
      title: "Error",
      message: error.message || String(error),
      detail: error.stack,
      buttons: ["OK"],
    });
  }
}

// Handle uncaught exceptions in the main process
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  logError(error);
  showErrorDialog(error);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logError(error);
  showErrorDialog(error);
});

// Register to handle files open from outside app (e.g., macOS Finder)
app.on("open-file", async (event, filePath) => {
  event.preventDefault();

  if (!filePath) {
    return;
  } else if (appReadyToOpenFiles) {
    await windowManager.openFile(filePath);
  } else {
    openFileQueue.push(filePath);
  }
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

  appReadyToOpenFiles = true;

  // Open any files that were queued before the app was ready
  while (openFileQueue.length > 0) {
    const filePath = openFileQueue.shift();
    await windowManager.openFile(filePath);
  }

  // Bring the app to the foreground; only works if we have windows open
  app.show();
  app.focus();
});
