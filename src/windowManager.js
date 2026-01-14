import { projectRootFromPath } from "@weborigami/language";
import { app, BrowserWindow, session } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createMenu } from "./menu.js";
import Project from "./project.js";
import { registerOrigamiProtocol } from "./protocol.js";
import * as recentFiles from "./recentFiles.js";
import * as settings from "./settings.js";

let windowCount = 0;
let quitting = false; // Distinguish app quit vs window close

/**
 * Main application state and window management
 */

async function createProjectWindow(rootPath) {
  // Load the preload.js script, which will expose the safe IPC API to the
  // renderer process
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const preload = path.join(moduleDirectory, "preload.js");

  // Create a unique session for the window
  windowCount++;
  const partition = `project-${windowCount}`;
  const windowSession = session.fromPartition(partition);

  // Register custom protocol
  registerOrigamiProtocol(windowSession);

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

  // Apply cascade offset after window is created
  const CASCADE_OFFSET = 22;
  const windows = BrowserWindow.getAllWindows();
  const offset = (windows.length - 1) * CASCADE_OFFSET;

  if (offset > 0) {
    const [x, y] = window.getPosition();
    window.setPosition(x + offset, y + offset);
  }

  // Disable caching via Chrome DevTools Protocol
  // window.webContents.debugger.attach("1.3");
  // window.webContents.debugger.sendCommand("Network.enable");
  // window.webContents.debugger.sendCommand("Network.setCacheDisabled", {
  //   cacheDisabled: true,
  // });

  // Create the Project instance for this window
  const project = new Project(window);
  await project.loadFolder(rootPath);

  window.project = project;
  windowSession.project = project;

  // Broadcast state after page loads
  window.webContents.on("did-finish-load", async () => {
    // Broadcast initial state
    await window.project.broadcastState();
  });

  // If the user closes the window while the open file is dirty, prompt to save.
  window.on("close", async (event) => {
    if (window.project.dirty) {
      // Show save prompt
      const shouldContinue = await promptSaveChanges(window);
      if (!shouldContinue) {
        // Prevent the window from closing
        event.preventDefault();
      }
    }
  });

  // Clean up after the window is closed
  window.on("closed", async () => {
    if (!quitting) {
      // The user is closing the window, not quitting the app. We update the
      // settings to remove this window from the open projects.
      await saveProjectWindows();
    }
    await createMenu();
  });

  // Load the renderer HTML file via our custom protocol
  await window.loadURL("origami://app/renderer/index.html");

  return window;
}

// Return the window for a given project root path, or null
function getWindowForProject(rootPath) {
  const windows = BrowserWindow.getAllWindows();
  for (const window of windows) {
    const project = window.project;
    if (project?.root?.path === rootPath) {
      return window;
    }
  }
  return null;
}

// Open/activate a file
export async function openFile(filePath) {
  // Open the project
  const folderPath = path.dirname(filePath);
  const root = await projectRootFromPath(folderPath);
  const project = await openProject(root.path);

  // Load the selected file
  await project.loadFile(filePath);

  // Add to recent files
  await recentFiles.addFile(project.filePath);

  // Rebuild menu to reflect recent files
  await createMenu();
}

// Open/activate a project, return the project
export async function openProject(rootPath) {
  // See if the project is already open
  const existingWindow = getWindowForProject(rootPath);
  if (existingWindow) {
    existingWindow.focus();
    return existingWindow.project;
  } else {
    // Create a new window for a new Project
    const window = await createProjectWindow(rootPath);
    await saveProjectWindows();
    return window.project;
  }
}

// Open/activate a project and restore its last opened file
export async function openProjectAndRestoreFile(rootPath) {
  const project = await openProject(rootPath);
  const projectSettings = project.settings;
  const mostRecentFile = projectSettings?.recentFiles?.at(-1);
  if (mostRecentFile) {
    await project.loadFile(mostRecentFile);
  }
  // TODO: Move to settings
  // Rebuild menu to reflect recent files
  await createMenu();
}

// As startup, restore project windows from settings
export async function restoreProjectWindows() {
  const appSettings = await settings.loadSettings();
  const openProjects = appSettings.openProjects || [];
  for (const rootPath of openProjects) {
    try {
      await openProjectAndRestoreFile(rootPath);
    } catch (error) {
      console.error(`Failed to restore project: ${rootPath}`, error);
    }
  }

  await createMenu();
}

// At shutdown, save project windows to settings
export async function saveProjectWindows() {
  const windows = BrowserWindow.getAllWindows();
  const openProjects = [];

  for (const window of windows) {
    const project = window.project;
    if (project?.root?.path) {
      openProjects.push(project.root.path);
    }
  }

  await settings.saveSettings({
    openProjects,
  });
}

app.on("before-quit", () => {
  quitting = true;
});
