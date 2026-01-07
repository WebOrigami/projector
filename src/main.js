import { app, BrowserWindow, ipcMain, session } from "electron";
import fs from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createMenu, promptSaveChanges } from "./menu.js";
import Project from "./project.js";
import { registerOrigamiProtocol } from "./protocol.js";
import * as recentFiles from "./recentFiles.js";
import updateWindowTitle from "./updateWindowTitle.js";

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

function createWindow(windowKey) {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const preload = join(moduleDirectory, "preload.js");

  // Create a unique session for the window
  // Disable caching so resources are always reloaded afresh
  const partition = `window-${windowKey}`;
  const ses = session.fromPartition(partition);

  // Register custom protocol
  registerOrigamiProtocol(ses);

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

  // Disable caching via Chrome DevTools Protocol
  window.webContents.debugger.attach("1.3");
  window.webContents.debugger.sendCommand("Network.enable");
  window.webContents.debugger.sendCommand("Network.setCacheDisabled", {
    cacheDisabled: true,
  });

  // Initialize project and associate it with window and session
  const project = new Project(window);
  project.session = ses;
  window.project = project;
  ses.project = project;

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

  window.loadURL("origami://app/renderer/index.html");

  // Set window title after page loads
  window.webContents.on("did-finish-load", async () => {
    updateWindowTitle(window);

    // Open most recent file if available
    const files = await recentFiles.getFiles();
    while (files.length > 0) {
      const mostRecentFile = files.at(-1);

      // Check if file still exists
      try {
        await fs.access(mostRecentFile);

        // Load the file
        window.project.filePath = mostRecentFile;
        await window.project.load();
        break;
      } catch (error) {
        // File doesn't exist, remove from recent files
        files.pop();
      }
    }

    // Save any changes to recent files list
    await recentFiles.saveFiles(files);

    // Broadcast initial state
    window.project.broadcastState();

    await createMenu();
  });

  return window;
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
