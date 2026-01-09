import { projectRoot } from "@weborigami/language";
import { BrowserWindow, session } from "electron";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createMenu } from "./menu.js";
import Project from "./project.js";
import { registerOrigamiProtocol } from "./protocol.js";
import * as recentFiles from "./recentFiles.js";
import * as settings from "./settings.js";

let windowCount = 0;

// Main application state and window management

export async function closeProject(window) {}

async function createProjectWindow(rootPath) {
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

  // Disable caching via Chrome DevTools Protocol
  // window.webContents.debugger.attach("1.3");
  // window.webContents.debugger.sendCommand("Network.enable");
  // window.webContents.debugger.sendCommand("Network.setCacheDisabled", {
  //   cacheDisabled: true,
  // });

  const project = new Project(window);
  await project.loadFolder(rootPath);

  window.project = project;
  windowSession.project = project;

  window.loadURL("origami://app/renderer/index.html");

  // Set window title after page loads
  window.webContents.on("did-finish-load", async () => {
    await restoreProjectWindows();

    // Broadcast initial state
    window.project.broadcastState();

    await createMenu();
  });

  // Handle window close event
  window.on("close", async (event) => {
    if (window.project.dirty) {
      // Prevent the window from closing immediately
      event.preventDefault();

      // Show save prompt and handle the response
      const shouldContinue = await promptSaveChanges(window);
      if (shouldContinue) {
        // Mark as clean to avoid infinite loop, then close
        window.project.dirty = false;
        window.close();
      }
    } else {
      // Window is about to close - save remaining windows after this one closes
      setImmediate(() => {
        saveProjectWindows();
      });
    }
  });

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
  const root = await projectRoot(folderPath);
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
    return window.project;
  }
}

// As startup, restore project windows from settings
export async function restoreProjectWindows() {
  const appSettings = await settings.loadSettings();
  const openProjects = appSettings.openProjects || [];
  for (const rootPath of openProjects) {
    try {
      await openProject(rootPath);
    } catch (error) {
      console.error(`Failed to restore project: ${rootPath}`, error);
    }
  }
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
