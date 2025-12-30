import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { access, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Document from "./document.js";
import * as recentFiles from "./recentFiles.js";

// Handle content-changed messages from renderer
ipcMain.on("content-changed", (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (window.document) {
    window.document.dirty = true;
    updateWindowTitle(window);
  }
});

function createMenu() {
  // Build Open Recent submenu
  const paths = recentFiles.getFiles();
  const recentFilesSubmenu = [];
  if (paths.length > 0) {
    paths.forEach((filePath) => {
      recentFilesSubmenu.push({
        label: basename(filePath),
        click: (_menuItem, window) => fileOpenRecent(filePath, window),
      });
    });
    recentFilesSubmenu.push({ type: "separator" });
    recentFilesSubmenu.push({
      label: "Clear Menu",
      click: async () => {
        await recentFiles.clearFiles();
        createMenu();
      },
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
  const moduleDirectory = dirname(fileURLToPath(import.meta.url));
  const preload = join(moduleDirectory, "preload.js");

  const window = new BrowserWindow({
    width: 800,
    height: 600,
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

async function fileNew(_menuItem, window) {
  const document = window.document;

  // Check if there are unsaved changes
  if (document.dirty) {
    const shouldContinue = await promptSaveChanges(window);
    if (!shouldContinue) {
      return;
    }
  }

  // Clear the editor and reset state
  await window.document.setText("");
  document.filePath = null;
  document.dirty = false;
  updateWindowTitle(window);
}

async function fileOpen(_menuItem, window) {
  const document = window.document;

  // Check if there are unsaved changes
  if (document.dirty) {
    const shouldContinue = await promptSaveChanges(window);
    if (!shouldContinue) {
      return;
    }
  }

  const result = await dialog.showOpenDialog(window, {
    properties: ["openFile"],
  });

  if (result.canceled) {
    // User canceled
    return;
  }

  // Get the selected file path
  const filePath = result.filePaths[0];
  await openFile(filePath, window);
}

async function fileOpenRecent(filePath, window) {
  const document = window.document;

  // Check if there are unsaved changes
  if (document.dirty) {
    const shouldContinue = await promptSaveChanges(window);
    if (!shouldContinue) {
      return;
    }
  }

  // Check if file still exists
  try {
    await access(filePath);
  } catch (error) {
    dialog.showMessageBox(window, {
      type: "error",
      message: "File not found",
      detail: `The file "${filePath}" could not be found.`,
    });
    // Remove from recent files
    await recentFiles.removeFile(filePath);
    createMenu();
    return;
  }

  await openFile(filePath, window);
}

async function openFile(filePath, window) {
  const document = window.document;

  // Update state
  document.filePath = filePath;
  document.dirty = false;

  // Read file
  const text = await readFile(filePath, "utf8");
  await window.document.setText(text);

  // Add to recent files and update title
  await recentFiles.addFile(filePath);
  createMenu();
  updateWindowTitle(window);
}

async function fileSave(_menuItem, window) {
  const document = window.document;

  // If no file path, show Save As dialog first
  if (document.filePath === null) {
    await fileSaveAs(_menuItem, window);
    return;
  }

  // Get editor contents and write to file
  const contents = await getEditorContents(window);
  await writeFile(document.filePath, contents, "utf8");

  // Mark as clean
  document.dirty = false;
  updateWindowTitle(window);
}

async function fileSaveAs(_menuItem, window) {
  const result = await dialog.showSaveDialog(window, {});

  if (result.canceled) {
    // User canceled
    return;
  }

  // Get the selected file path
  const filePath = result.filePath;
  const document = window.document;
  document.filePath = filePath;

  // Get editor contents and write to file
  const contents = await getEditorContents(window);
  await writeFile(filePath, contents, "utf8");

  // Mark as clean and add to recent files
  document.dirty = false;
  await recentFiles.addFile(filePath);
  createMenu();
  updateWindowTitle(window);
}

async function getEditorContents(window) {
  return await window.webContents.executeJavaScript(
    `document.getElementById('editor').value`
  );
}

async function promptSaveChanges(window) {
  const result = await dialog.showMessageBox(window, {
    type: "question",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "Save changes?",
  });

  if (result.response === 0) {
    // Save
    await fileSave(null, window);
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
  const document = window.document;

  let title = document.title;
  if (document.dirty) {
    title += " ⚫︎";
  }
  window.setTitle(title);

  // Set represented filename for macOS
  const representedFilename = document.filePath ? document.filePath : "";
  window.setRepresentedFilename(representedFilename);

  window.setDocumentEdited(document.dirty);
}

app.whenReady().then(async () => {
  await recentFiles.loadFiles();
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
