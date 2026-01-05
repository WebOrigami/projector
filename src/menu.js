import { app, dialog, Menu } from "electron";
import { access, readFile, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import * as recentFiles from "./recentFiles.js";
import updateWindowTitle from "./updateWindowTitle.js";

export async function createMenu() {
  // Build Open Recent submenu
  let paths = await recentFiles.getFiles();

  // Reverse order to show most recent at top
  paths = paths.slice().reverse();

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
        createMenu(callbacks);
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
        { type: "separator" },
        { label: "Run", accelerator: "CmdOrCtrl+Enter", click: fileRun },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        {
          label: "Focus Command",
          visible: false,
          accelerator: "CmdOrCtrl+L",
          click: focusCommand,
        },
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

async function fileNew(_menuItem, window) {
  const document = window.project;

  // Check if there are unsaved changes
  if (document.dirty) {
    const shouldContinue = await promptSaveChanges(window);
    if (!shouldContinue) {
      return;
    }
  }

  // Clear the editor and reset state
  await window.project.setText("");
  document.filePath = null;
  document.dirty = false;
  updateWindowTitle(window);
}

async function fileOpen(_menuItem, window) {
  const document = window.project;

  // Check if there are unsaved changes
  if (document.dirty) {
    const shouldContinue = await promptSaveChanges(window);
    if (!shouldContinue) {
      return;
    }
  }

  const dialogOptions = {
    properties: ["openFile"],
  };

  // Set default directory to current document's directory if available
  if (document.filePath) {
    dialogOptions.defaultPath = dirname(document.filePath);
  }

  const result = await dialog.showOpenDialog(window, dialogOptions);

  if (result.canceled) {
    // User canceled
    return;
  }

  // Get the selected file path
  const filePath = result.filePaths[0];
  await openFile(filePath, window);
}

async function fileOpenRecent(filePath, window) {
  const document = window.project;

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
    createMenu(menuCallbacks);
    return;
  }

  await openFile(filePath, window);
}

export async function fileRun(_menuItem, window) {
  const text = await window.project.getText();
  let saved = true;
  if (text.trim().length > 0) {
    // Save before running
    saved = await fileSave(_menuItem, window);
  }
  if (saved) {
    window.project.run();
  }
}

async function fileSave(_menuItem, window) {
  // If no file path, show Save As dialog instead
  if (window.project.filePath === null) {
    await fileSaveAs(_menuItem, window);
    return;
  }
  return saveFile(window);
}

async function fileSaveAs(_menuItem, window) {
  const result = await dialog.showSaveDialog(window, {});

  if (result.canceled) {
    // User canceled
    return false;
  }

  // Update the document's path
  window.project.filePath = result.filePath;

  const saved = await saveFile(window);
  if (saved) {
    // Add to recent files
    await recentFiles.addFile(result.filePath);
    createMenu();
    updateWindowTitle(window);
  }

  return saved;
}

function focusCommand(_menuItem, window) {
  window.project.focusCommand();
}

async function openFile(filePath, window) {
  const document = window.project;

  // Update state
  document.filePath = filePath;
  document.dirty = false;

  // Read file
  const text = await readFile(filePath, "utf8");
  await window.project.setText(text);

  // Add to recent files and update title
  await recentFiles.addFile(filePath);
  createMenu();
  updateWindowTitle(window);
}

export async function promptSaveChanges(window) {
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

async function saveFile(window) {
  const document = window.project;

  // Get editor contents and write to file
  const text = await window.project.getText();
  try {
    await writeFile(document.filePath, text, "utf8");
  } catch (error) {
    dialog.showMessageBox(window, {
      type: "error",
      message: "Save Failed",
      detail: `Failed to save file "${document.filePath}": ${error.message}`,
    });
    return false;
  }

  // Mark as clean
  document.dirty = false;
  updateWindowTitle(window);

  return true;
}
