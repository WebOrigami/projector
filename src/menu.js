import { app, dialog, Menu } from "electron";
import { access } from "node:fs/promises";
import { basename, dirname } from "node:path";
import * as recentFiles from "./recentFiles.js";
import * as windowManager from "./windowManager.js";

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
        // { type: "separator" },
        // { label: "Run", accelerator: "CmdOrCtrl+Enter", click: fileRun },
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
  const project = window.project;

  // Check if there are unsaved changes
  if (project.dirty) {
    const shouldContinue = await promptSaveChanges(window);
    if (!shouldContinue) {
      return;
    }
  }

  // Set to new document state
  project.filePath = null;
  project.text = "";
}

async function fileOpen(_menuItem, window) {
  const project = window.project;

  // Check if there are unsaved changes
  if (project.dirty) {
    const shouldContinue = await promptSaveChanges(window);
    if (!shouldContinue) {
      return;
    }
  }

  const dialogOptions = {
    properties: ["openFile"],
  };

  // Set default directory to current document's directory if available
  if (project.filePath) {
    dialogOptions.defaultPath = dirname(project.filePath);
  }

  const result = await dialog.showOpenDialog(window, dialogOptions);

  if (result.canceled) {
    // User canceled
    return;
  }

  // Open the selected file
  const selectedPath = result.filePaths[0];
  await windowManager.openFile(selectedPath);
}

async function fileOpenRecent(filePath, window) {
  const project = window.project;

  // Check if there are unsaved changes
  if (project.dirty) {
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
    await createMenu(menuCallbacks);
    return;
  }

  await windowManager.openFile(filePath);
}

export async function fileRun(_menuItem, window) {
  window.project.run();
}

async function fileSave(_menuItem, window) {
  // If no file path, show Save As dialog instead
  if (window.project.filePath === null) {
    await fileSaveAs(_menuItem, window);
    return;
  }
  return window.project.save();
}

async function fileSaveAs(_menuItem, window) {
  const result = await dialog.showSaveDialog(window, {});

  if (result.canceled) {
    // User canceled
    return false;
  }

  // Update the document's path and save
  const saved = await window.project.saveAs(result.filePath);
  if (saved) {
    // Add to recent files
    await recentFiles.addFile(result.filePath);
    createMenu();
  }

  return saved;
}

function focusCommand(_menuItem, window) {
  window.project.focusCommand();
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
    await window.project.save();
    return true;
  } else if (result.response === 1) {
    // Don't Save
    return true;
  } else {
    // Cancel
    return false;
  }
}
