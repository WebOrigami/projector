import { app, BrowserWindow, ipcMain } from "electron";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Document from "./document.js";
import { createMenu, promptSaveChanges } from "./menu.js";
import { registerOrigamiProtocol } from "./protocol.js";
import updateWindowTitle from "./updateWindowTitle.js";

// Handle content-changed messages from renderer
ipcMain.on("content-changed", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window.document) {
    window.document.dirty = true;
    updateWindowTitle(window);
  }
});

function createWindow() {
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const preload = join(moduleDirectory, "preload.js");

  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload,
    },
  });

  // Initialize document
  window.document = new Document(window);

  // Force initial window title so it doesn't show app name
  updateWindowTitle(window);

  // Handle window close event
  window.on("close", (event) => {
    if (window.document.dirty) {
      // Prevent the window from closing immediately
      event.preventDefault();

      // Show save prompt and handle the response
      promptSaveChanges(window).then((shouldContinue) => {
        if (shouldContinue) {
          // Mark as clean to avoid infinite loop, then close
          window.document.dirty = false;
          window.close();
        }
      });
    }
  });

  window.loadFile("src/renderer/index.html");

  // Set window title after page loads
  window.webContents.on("did-finish-load", () => {
    updateWindowTitle(window);
  });

  return window;
}

app.whenReady().then(async () => {
  // Register custom protocol
  registerOrigamiProtocol();

  // Set up UI
  await createMenu();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  app.quit();
});
