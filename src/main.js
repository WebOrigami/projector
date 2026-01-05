import { app, BrowserWindow, ipcMain, session } from "electron";
import { access, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMenu, fileRun, promptSaveChanges } from "./menu.js";
import Project from "./project.js";
import { registerOrigamiProtocol } from "./protocol.js";
import * as recentFiles from "./recentFiles.js";
import updateWindowTitle from "./updateWindowTitle.js";

const REFRESH_DELAY_MS = 250;
let refreshTimeout = null;

// Handle content-changed messages from renderer
ipcMain.on("content-changed", (event, ...args) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window?.project) {
    window.project.dirty = true;
    updateWindowTitle(window);
    restartRefreshTimeout(window);
  }
});

ipcMain.on("previous-command", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window?.project) {
    window.project.previousCommand();
  }
});

ipcMain.on("next-command", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window?.project) {
    window.project.nextCommand();
  }
});

ipcMain.on("run-command", async (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window) {
    if (refreshTimeout) {
      // Explicitly running command cancels pending refresh
      clearTimeout(refreshTimeout);
    }
    await fileRun(null, window);
  }
});

function createWindow(windowKey) {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const preload = join(moduleDirectory, "preload.js");

  // Register custom protocol
  const partition = `window-${windowKey}`;
  registerOrigamiProtocol(session.fromPartition(partition));

  // Create the browser window
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition,
      preload,
    },
  });

  // Initialize document
  window.project = new Project(window);

  // Force initial window title so it doesn't show app name
  updateWindowTitle(window);

  // Handle window close event
  window.on("close", (event) => {
    if (window.project.dirty) {
      // Prevent the window from closing immediately
      event.preventDefault();

      // Show save prompt and handle the response
      promptSaveChanges(window).then((shouldContinue) => {
        if (shouldContinue) {
          // Mark as clean to avoid infinite loop, then close
          window.project.dirty = false;
          window.close();
        }
      });
    }
  });

  window.loadFile("src/renderer/index.html");

  // Set window title after page loads
  window.webContents.on("did-finish-load", async () => {
    updateWindowTitle(window);

    // Open most recent file if available
    const files = await recentFiles.getFiles();
    if (files.length > 0) {
      const mostRecentFile = files[files.length - 1];

      // Check if file still exists
      try {
        await access(mostRecentFile);

        // Load the file
        const text = await readFile(mostRecentFile, "utf8");
        await window.project.setText(text);
        window.project.filePath = mostRecentFile;
        window.project.dirty = false;
        updateWindowTitle(window);
      } catch (error) {
        // File doesn't exist, remove from recent files
        await recentFiles.removeFile(mostRecentFile);
      }
    }

    await createMenu();
  });

  return window;
}

function restartRefreshTimeout(window) {
  if (refreshTimeout) {
    clearTimeout(refreshTimeout);
  }
  refreshTimeout = setTimeout(() => {
    refreshTimeout = null;
    if (window.project && window.project.dirty) {
      if (window.project.filePath) {
        fileRun(null, window);
      }
    }
  }, REFRESH_DELAY_MS);
}

app.whenReady().then(async () => {
  createWindow("main");

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow("main");
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
