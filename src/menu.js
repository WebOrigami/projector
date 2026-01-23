import { app, BrowserWindow, dialog, Menu } from "electron";
import fs from "node:fs/promises";
import * as path from "node:path";
import * as settings from "./settings.js";
import * as windowManager from "./windowManager.js";

export async function createMenu() {
  // Build Open Recent submenu
  const appSettings = await settings.loadSettings();
  let recentProjects = appSettings.recentProjects || [];

  // Reverse order to show most recent at top
  recentProjects = recentProjects.slice().reverse();

  const recentProjectsSubmenu = [];
  if (recentProjects.length > 0) {
    recentProjects.forEach((project) => {
      recentProjectsSubmenu.push({
        label: path.basename(project.name),
        click: (_menuItem, window) => openRecentProject(project.path),
      });
    });
    recentProjectsSubmenu.push({ type: "separator" });
    recentProjectsSubmenu.push({
      label: "Clear Menu",
      click: async () => {
        await settings.saveSettings({
          recentProjects: [],
        });
      },
    });
  } else {
    recentProjectsSubmenu.push({
      label: "No Recent Projects",
      enabled: false,
    });
  }

  // Do we have an open project?
  const isProjectOpen = BrowserWindow.getAllWindows().length > 0;

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
          label: "Open Project Folder…",
          accelerator: "CmdOrCtrl+Shift+O",
          click: folderOpen,
        },
        {
          label: "Open Recent Project",
          submenu: recentProjectsSubmenu,
        },
        {
          label: "Close Project",
          role: "close",
          enabled: isProjectOpen,
        },
        { type: "separator" },
        {
          label: "New File",
          accelerator: "CmdOrCtrl+N",
          click: fileNew,
          enabled: isProjectOpen,
        },
        {
          label: "Open File…",
          accelerator: "CmdOrCtrl+O",
          click: fileOpen,
          enabled: isProjectOpen,
        },
        // {
        //   label: "Save",
        //   accelerator: "CmdOrCtrl+S",
        //   click: fileSave,
        //   enabled: isProjectOpen,
        // },
        {
          label: "Save File As…",
          accelerator: "CmdOrCtrl+Shift+S",
          click: fileSaveAs,
          enabled: isProjectOpen,
        },
        // { type: "separator" },
        // { label: "Run", accelerator: "CmdOrCtrl+Enter", click: fileRun },
      ],
    },
    {
      label: "Edit",
      enabled: isProjectOpen,
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
      enabled: isProjectOpen,
      submenu: [{ role: "toggleDevTools" }],
    },
    {
      role: "window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
      ],
    },
  ];

  // @ts-ignore
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
  await project.loadFile(null);
}

export async function fileOpen(_menuItem, window) {
  let dialogOptions = {};

  const project = /** @type {any} */ (window).project;
  // Check if there are unsaved changes
  if (project.dirty) {
    const shouldContinue = await promptSaveChanges(window);
    if (!shouldContinue) {
      return;
    }
  }
  if (project.filePath) {
    const defaultPath = project.filePath || project.rootPath;
    dialogOptions.defaultPath = path.dirname(defaultPath);
  }

  const result = await dialog.showOpenDialog(window, {
    properties: ["openFile"],
    ...dialogOptions,
  });
  if (result.canceled) {
    // User canceled
    return;
  }

  // Open the selected file
  const filePath = result.filePaths[0];
  await windowManager.openFile(filePath);
}

export async function fileRun(_menuItem, window) {
  window.project.run();
}

async function fileSave(_menuItem, window) {
  // If no file path, show Save As dialog instead
  if (window.project.filePath === null) {
    return fileSaveAs(_menuItem, window);
  }
  return window.project.save();
}

async function fileSaveAs(_menuItem, window) {
  const project = window.project;
  const filePath = project.filePath || project.root.path;

  const result = await dialog.showSaveDialog(window, {
    defaultPath: filePath,
    properties: ["createDirectory", "showOverwriteConfirmation"],
  });

  if (result.canceled) {
    // User canceled
    return false;
  }

  // Update the document's path and save
  const saved = await project.saveAs(result.filePath);
  return saved;
}

function focusCommand(_menuItem, window) {
  window.project.focusCommand();
}

export async function folderOpen(_menuItem, window) {
  // We don't pass `window` here because we're opening a new project window
  // unrelated to any current window.
  const result = await dialog.showOpenDialog({
    buttonLabel: "Open Folder",
    message: "Select a project folder:",
    properties: ["createDirectory", "openDirectory"],
  });

  if (result.canceled) {
    // User canceled
    return;
  }

  // Open the selected folder
  const folderPath = result.filePaths[0];
  await windowManager.openProject(folderPath);
}

export async function openRecentProject(rootPath) {
  try {
    // Check if the project path still exists
    await fs.access(rootPath);
    await windowManager.openProject(rootPath);
  } catch (error) {
    // Project path no longer exists
    await dialog.showMessageBox({
      type: "error",
      title: "Project Not Found",
      message: "The project could not be opened.",
      detail: rootPath,
      buttons: ["OK"],
    });

    // Remove the project from recent projects
    const appSettings = await settings.loadSettings();
    const recentProjects = appSettings.recentProjects || [];
    const updatedProjects = recentProjects.filter(
      (project) => project.path !== rootPath,
    );
    await settings.saveSettings({
      recentProjects: updatedProjects,
    });
  }
}

export async function promptSaveChanges(window) {
  const result = await dialog.showMessageBox(window, {
    type: "question",
    buttons: ["Save", "Don't Save", "Cancel"],
    defaultId: 0,
    cancelId: 2,
    message: "Save changes?",
  });

  let shouldContinue;
  if (result.response === 0) {
    // Save
    shouldContinue = await fileSave(null, window);
  } else if (result.response === 1) {
    // Don't Save
    shouldContinue = true;
  } else {
    // Cancel
    shouldContinue = false;
  }

  return shouldContinue;
}
