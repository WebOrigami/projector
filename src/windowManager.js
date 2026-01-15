import { projectRootFromPath } from "@weborigami/language";
import { app, BrowserWindow, session } from "electron";
import fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createMenu, promptSaveChanges } from "./menu.js";
import Project from "./project.js";
import { registerOrigamiProtocol } from "./protocol.js";
import recent from "./recent.js";
import * as settings from "./settings.js";

let windowCount = 0;
let loading = true;
let quitting = false; // Distinguish app quit vs window close

const MAX_RECENT_PROJECTS = 10;
const recentProjectsUpdater = recent(MAX_RECENT_PROJECTS);

// Behaves like a recent list with no maximum size
const openProjectsUpdater = recent(Infinity);

/**
 * Main application state and window management
 */

async function addToOpenProjects(project) {
  const appSettings = await settings.loadSettings();
  let openProjects = appSettings.openProjects || [];
  openProjects = openProjectsUpdater.add(openProjects, project.root.path);
  await settings.saveSettings({
    openProjects,
  });
}

async function addToRecentProjects(project) {
  const appSettings = await settings.loadSettings();
  let projects = appSettings.recentProjects || [];
  // Remove if already present
  const index = projects.findIndex(
    (record) => record.path === project.root.path
  );
  if (index !== -1) {
    projects.splice(index, 1);
  }
  // Add to list
  projects = recentProjectsUpdater.add(projects, {
    name: project.name,
    path: project.root.path,
  });
  await settings.saveSettings({
    recentProjects: projects,
  });
}

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

  // Create the Project instance for this window
  const project = new Project(window);
  await project.loadFolder(rootPath);

  /** @type {any} */ (window).project = project;
  /** @type {any} */ (windowSession).project = project;

  // Broadcast state after page loads
  window.webContents.on("did-finish-load", async () => {
    // Broadcast initial state
    await project.broadcastState();
  });

  // If the user closes the window while the open file is dirty, prompt to save.
  window.on("close", async (event) => {
    if (/** @type {any} */ (window).project.dirty) {
      // Show save prompt
      const shouldContinue = await promptSaveChanges(window);
      if (!shouldContinue) {
        // Prevent the window from closing
        event.preventDefault();
      }
    }
  });

  // Track when window becomes active
  window.on("focus", async () => {
    if (!loading) {
      addToOpenProjects(/** @type {any} */ (window).project);
    }
  });

  // Clean up after the window is closed
  window.on("closed", async () => {
    if (!quitting) {
      // The user is closing the window, not quitting the app. We update the
      // settings to remove this window from the open projects.
      await removeFromOpenProjects(/** @type {any} */ (window).project);
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
    const project = /** @type {any} */ (window).project;
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

  // Rebuild menu to reflect recent files
  await createMenu();
}

// Open/activate a project, return the project
export async function openProject(rootPath) {
  // See if the project is already open
  let window = getWindowForProject(rootPath);
  if (window) {
    // Switch to open window
    window.focus();
  } else {
    // Create a new window for the project
    window = await createProjectWindow(rootPath);
  }

  await addToRecentProjects(/** @type {any} */ (window).project);
  await createMenu();

  return /** @type {any} */ (window).project;
}

// Open/activate a project and restore its state
export async function openProjectAndRestoreFile(rootPath) {
  const project = await openProject(rootPath);

  // Restore most recently open file that still exists
  const recentFiles = project.recentFiles || [];
  let updateRecentFiles = false;
  while (recentFiles.length > 0) {
    const mostRecentFile = recentFiles.at(-1);
    try {
      await fs.access(mostRecentFile);
      // File exists, load it
      await project.loadFile(mostRecentFile);
      break;
    } catch (error) {
      // File doesn't exist, remove from recent files
      recentFiles.pop();
      updateRecentFiles = true;
    }
  }

  if (updateRecentFiles) {
    project.recentFiles = recentFiles;
    await settings.saveProjectSettings(project);
  }

  // TODO: Move to settings
  // Rebuild menu to reflect recent files
  await createMenu();
}

async function removeFromOpenProjects(project) {
  const appSettings = await settings.loadSettings();
  let openProjects = appSettings.openProjects || [];
  openProjects = openProjectsUpdater.remove(openProjects, project.root.path);
  await settings.saveSettings({
    openProjects,
  });
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

  loading = false;
}

app.on("before-quit", () => {
  quitting = true;
});
