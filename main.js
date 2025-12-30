import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { access, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Store window-specific state
const windowState = new WeakMap();

// Store recently opened files (max 10)
let recentFiles = [];
const MAX_RECENT_FILES = 10;
const RECENT_FILES_PATH = join(app.getPath("userData"), "recent-files.json");

// Handle content-changed messages from renderer
ipcMain.on("content-changed", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const state = windowState.get(window);
  if (state) {
    state.dirty = true;
    updateWindowTitle(window);
  }
});

function addToRecentFiles(filePath) {
  // Remove if already in list
  recentFiles = recentFiles.filter((path) => path !== filePath);

  // Add to front
  recentFiles.unshift(filePath);

  // Limit to MAX_RECENT_FILES
  if (recentFiles.length > MAX_RECENT_FILES) {
    recentFiles = recentFiles.slice(0, MAX_RECENT_FILES);
  }

  // Save and rebuild menu
  saveRecentFiles();
  createMenu();
}

function clearRecentFiles() {
  recentFiles = [];
  saveRecentFiles();
  createMenu();
}

async function loadRecentFiles() {
  try {
    await access(RECENT_FILES_PATH);
    const data = await readFile(RECENT_FILES_PATH, "utf8");
    recentFiles = JSON.parse(data);
  } catch (error) {
    // File doesn't exist or can't be read, start with empty list
    recentFiles = [];
  }
}

async function saveRecentFiles() {
  try {
    await writeFile(RECENT_FILES_PATH, JSON.stringify(recentFiles), "utf8");
  } catch (error) {
    console.error("Failed to save recent files:", error);
  }
}

function createMenu() {
  // Build Open Recent submenu
  const recentFilesSubmenu = [];
  if (recentFiles.length > 0) {
    recentFiles.forEach((filePath) => {
      recentFilesSubmenu.push({
        label: basename(filePath),
        click: (_menuItem, browserWindow) => fileOpenRecent(filePath, browserWindow),
      });
    });
    recentFilesSubmenu.push({ type: "separator" });
    recentFilesSubmenu.push({
      label: "Clear Menu",
      click: clearRecentFiles,
    });
  } else {
    recentFilesSubmenu.push({
      label: "No Recent Files",
      enabled: false,
    });
  }

  const template = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New",
          accelerator: "CmdOrCtrl+N",
          click: fileNew,
        },
        {
          label: "Open…",
          accelerator: "CmdOrCtrl+O",
          click: fileOpen,
        },
        {
          label: "Open Recent",
          submenu: recentFilesSubmenu,
        },
        { type: "separator" },
        { role: "close" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: fileSave,
        },
        {
          label: "Save As…",
          accelerator: "CmdOrCtrl+Shift+S",
          click: fileSaveAs,
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "Debug",
      submenu: [{ role: "toggleDevTools" }],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  const window = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, "preload.js"),
    },
  });

  // Initialize window state
  windowState.set(window, {
    filePath: null,
    dirty: false,
  });

  // Force initial window title so it doesn't show app name
  updateWindowTitle(window);

  // Handle window close event
  window.on("close", (event) => {
    const state = windowState.get(window);
    if (state.dirty) {
      // Prevent the window from closing immediately
      event.preventDefault();

      // Show save prompt and handle the response
      promptSaveChanges(window).then((shouldContinue) => {
        if (shouldContinue) {
          // Mark as clean to avoid infinite loop, then close
          state.dirty = false;
          window.close();
        }
      });
    }
  });

  window.loadFile("renderer/index.html");

  // Set window title after page loads
  window.webContents.on("did-finish-load", () => {
    updateWindowTitle(window);
  });

  return window;
}

async function fileNew(_menuItem, browserWindow) {
  const state = windowState.get(browserWindow);

  // Check if there are unsaved changes
  if (state.dirty) {
    const shouldContinue = await promptSaveChanges(browserWindow);
    if (!shouldContinue) {
      return;
    }
  }

  // Clear the editor and reset state
  browserWindow.webContents.executeJavaScript(
    `document.getElementById('editor').value = '';`
  );
  state.filePath = null;
  state.dirty = false;
  updateWindowTitle(browserWindow);
}

async function fileOpen(_menuItem, browserWindow) {
  const state = windowState.get(browserWindow);

  // Check if there are unsaved changes
  if (state.dirty) {
    const shouldContinue = await promptSaveChanges(browserWindow);
    if (!shouldContinue) {
      return;
    }
  }

  const result = await dialog.showOpenDialog(browserWindow, {
    properties: ["openFile"],
  });

  if (result.canceled) {
    // User canceled
    return;
  }

  // Get the selected file path
  const filePath = result.filePaths[0];
  await openFile(filePath, browserWindow);
}

async function fileOpenRecent(filePath, browserWindow) {
  const state = windowState.get(browserWindow);

  // Check if there are unsaved changes
  if (state.dirty) {
    const shouldContinue = await promptSaveChanges(browserWindow);
    if (!shouldContinue) {
      return;
    }
  }

  // Check if file still exists
  try {
    await access(filePath);
  } catch (error) {
    dialog.showMessageBox(browserWindow, {
      type: "error",
      message: "File not found",
      detail: `The file "${filePath}" could not be found.`,
    });
    // Remove from recent files
    recentFiles = recentFiles.filter((path) => path !== filePath);
    saveRecentFiles();
    createMenu();
    return;
  }

  await openFile(filePath, browserWindow);
}

async function openFile(filePath, browserWindow) {
  const state = windowState.get(browserWindow);

  // Update state
  state.filePath = filePath;
  state.dirty = false;

  // Read file, send to textarea
  const fileContents = await readFile(filePath, "utf8");
  browserWindow.webContents.executeJavaScript(
    `document.getElementById('editor').value = ${JSON.stringify(fileContents)};`
  );

  // Add to recent files and update title
  addToRecentFiles(filePath);
  updateWindowTitle(browserWindow);
}

async function fileSave(_menuItem, browserWindow) {
  const state = windowState.get(browserWindow);

  // If no file path, show Save As dialog first
  if (state.filePath === null) {
    await fileSaveAs(_menuItem, browserWindow);
    return;
  }

  // Get editor contents and write to file
  const contents = await getEditorContents(browserWindow);
  await writeFile(state.filePath, contents, "utf8");

  // Mark as clean
  state.dirty = false;
  updateWindowTitle(browserWindow);
}

async function fileSaveAs(_menuItem, browserWindow) {
  const result = await dialog.showSaveDialog(browserWindow, {});

  if (result.canceled) {
    // User canceled
    return;
  }

  // Get the selected file path
  const filePath = result.filePath;
  const state = windowState.get(browserWindow);
  state.filePath = filePath;

  // Get editor contents and write to file
  const contents = await getEditorContents(browserWindow);
  await writeFile(filePath, contents, "utf8");

  // Mark as clean and add to recent files
  state.dirty = false;
  addToRecentFiles(filePath);
  updateWindowTitle(browserWindow);
}

async function getEditorContents(browserWindow) {
  return await browserWindow.webContents.executeJavaScript(
    `document.getElementById('editor').value`
  );
}

function getFileTitle(window) {
  const state = windowState.get(window);
  return state.filePath ? basename(state.filePath) : "Untitled";
}

async function promptSaveChanges(browserWindow) {
  const result = await dialog.showMessageBox(browserWindow, {
    type: "question",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "Save changes?",
  });

  if (result.response === 0) {
    // Save
    await fileSave(null, browserWindow);
    return true;
  } else if (result.response === 1) {
    // Don't Save
    return true;
  } else {
    // Cancel
    return false;
  }
}

function updateWindowTitle(window) {
  const state = windowState.get(window);

  let title = getFileTitle(window);
  if (state.dirty) {
    title += " ⚫︎";
  }
  window.setTitle(title);

  // Set represented filename for macOS
  const representedFilename = state.filePath ? state.filePath : "";
  window.setRepresentedFilename(representedFilename);

  window.setDocumentEdited(state.dirty);
}

app.whenReady().then(async () => {
  await loadRecentFiles();
  createMenu();
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
