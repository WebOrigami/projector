import { app, dialog } from "#electron";
import * as path from "node:path";
import projector from "./projector.js";
import * as windowManager from "./windowManager.js";

/**
 * Return a template for the application menu
 */
export function createMenuTemplate(state, isFileOpen) {
  // Build Open Recent submenu
  let recentProjects = state.recentProjects;

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
        await projector.setState({
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
  const isProjectOpen = state.openProjects.length > 0;

  return [
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
          enabled: isFileOpen,
        },
        // { type: "separator" },
        // { label: "Run", accelerator: "CmdOrCtrl+Enter", click: fileRun },
      ],
    },
    {
      label: "Edit",
      submenu: [
        {
          role: "undo",
          enabled: isProjectOpen,
        },
        {
          role: "redo",
          enabled: isProjectOpen,
        },
        { type: "separator" },
        {
          role: "cut",
          enabled: isProjectOpen,
        },
        {
          role: "copy",
          enabled: isProjectOpen,
        },
        {
          role: "paste",
          enabled: isProjectOpen,
        },
        {
          role: "selectAll",
          enabled: isProjectOpen,
        },
        {
          label: "Focus Command",
          accelerator: "CmdOrCtrl+L",
          click: focusCommand,
          enabled: isProjectOpen,
          visible: false,
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Home",
          accelerator: "Shift+CmdOrCtrl+H",
          click: viewHome,
          enabled: isProjectOpen,
        },
        {
          label: "Back",
          accelerator: "CmdOrCtrl+[",
          click: viewGoBack,
          enabled: isProjectOpen,
        },
        {
          label: "Back",
          accelerator: "CmdOrCtrl+Left",
          click: viewGoBack,
          enabled: isProjectOpen,
          visible: false,
        },
        {
          label: "Forward",
          accelerator: "CmdOrCtrl+]",
          click: viewGoForward,
          enabled: isProjectOpen,
        },
        {
          label: "Forward",
          accelerator: "CmdOrCtrl+Right",
          click: viewGoForward,
          enabled: isProjectOpen,
          visible: false,
        },
        { type: "separator" },
        {
          role: "toggleDevTools",
          enabled: isProjectOpen,
        },
      ],
    },
    {
      label: "Tools",
      visible: false,
      submenu: [
        {
          label: "Audit",
          enabled: isProjectOpen,
          click: (_, window) => toolRun("audit", window),
        },
      ],
    },
    {
      label: "Options",
      submenu: [
        {
          label: "Auto-Close Brackets",
          type: "checkbox",
          checked: state.editor?.autoClosingBrackets === "languageDefined",
          click: toggleAutoClosingBrackets,
        },
        {
          label: "Indentation",
          submenu: [
            ...[2, 4, 8].map((size) => ({
              label: `${size} Spaces`,
              type: "radio",
              checked: state.editor?.indentSize === size,
              click: () => setIndentSize(size),
            })),
            { type: "separator" },
            {
              label: "Use Spaces",
              type: "checkbox",
              checked: state.editor?.insertSpaces === true,
              click: () => insertSpaces(true),
            },
            {
              label: "Use Tabs",
              type: "checkbox",
              checked: state.editor?.insertSpaces === false,
              click: () => insertSpaces(false),
            },
          ],
        },
        {
          label: "Show Line Numbers",
          type: "checkbox",
          checked: state.editor?.lineNumbers !== "off",
          click: toggleLineNumbers,
        },
      ],
    },
    {
      role: "windowMenu",
    },
  ];
}

async function fileNew(_menuItem, window) {
  // Have project load a new untitled file
  await window.project.newFile();
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
    await windowManager.openProject(rootPath);
  } catch (error) {
    // Project no longer exists or couldn't be opened
    await dialog.showMessageBox({
      type: "error",
      title: "Project Not Found",
      message: "The project could not be opened.",
      detail: rootPath,
      buttons: ["OK"],
    });

    // Remove the project from recent projects
    const recentProjects = projector.state.recentProjects;
    const updatedProjects = recentProjects.filter(
      (project) => project.path !== rootPath,
    );
    await projector.setState({
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

function toggleAutoClosingBrackets() {
  const editorSettings = projector.state.editor || {};
  const current = editorSettings.autoClosingBrackets === "languageDefined";
  projector.setState({
    editor: {
      ...editorSettings,
      autoClosingBrackets: current ? "never" : "languageDefined",
    },
  });
}

function setIndentSize(size) {
  const editorSettings = projector.state.editor || {};
  // Also set tabSize to same value
  projector.setState({
    editor: {
      ...editorSettings,
      indentSize: size,
      tabSize: size,
    },
  });
}

function insertSpaces(useSpaces) {
  const editorSettings = projector.state.editor || {};
  projector.setState({
    editor: {
      ...editorSettings,
      insertSpaces: useSpaces,
    },
  });
}

function toggleLineNumbers() {
  const editorSettings = projector.state.editor || {};
  const current = editorSettings.lineNumbers !== "off";
  projector.setState({
    editor: {
      ...editorSettings,
      lineNumbers: current ? "off" : "on",
    },
  });
}

async function toolRun(toolName, window) {
  await window.project.runTool(toolName);
}

async function viewGoBack(_menuItem, window) {
  await window.project.goBack();
}

async function viewGoForward(_menuItem, window) {
  await window.project.goForward();
}

async function viewHome(_menuItem, window) {
  await window.project.goHome();
}
