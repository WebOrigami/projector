import { app, BrowserWindow, session } from "#electron";
import { projectRootFromPath } from "@weborigami/language";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createMenu, folderOpen, promptSaveChanges } from "./menu.js";
import Project from "./Project.js";
import projector from "./projector.js";
import { registerOrigamiProtocol } from "./protocol.js";
import recent from "./recent.js";

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
  let openProjects = projector.state.openProjects;
  openProjects = openProjectsUpdater.add(openProjects, project.root.path);
  await projector.setState({
    openProjects,
  });
}

export async function addToRecentProjects(project) {
  let projects = projector.state.recentProjects;
  // Remove if already present
  const index = projects.findIndex(
    (record) => record.path === project.root.path,
  );
  if (index !== -1) {
    projects.splice(index, 1);
  }
  // Add to list
  projects = recentProjectsUpdater.add(projects, {
    name: project.name,
    path: project.root.path,
  });
  await projector.setState({
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
  const project = new Project(window, rootPath);
  await project.loadProject();

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
      // Update open projects list to move this project to the front so that we
      // can restore windows in the same order next time.
      addToOpenProjects(project);
    }
  });

  // Clean up after the window is closed
  window.on("closed", async () => {
    if (!quitting) {
      // The user is closing the window, not quitting the app. We update the
      // settings to remove this window from the open projects.
      await removeFromOpenProjects(project);

      // Tell project it's closing
      project.close();

      // Break references to project so we fail faster if accessed
      /** @type {any} */ (window).project = null;
      /** @type {any} */ (windowSession).project = null;
    }
  });

  // Load the renderer HTML file via our custom protocol
  await window.loadURL("origami://app/_renderer/index.html");

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
    await addToOpenProjects(/** @type {any} */ (window).project);
  }

  await addToRecentProjects(/** @type {any} */ (window).project);

  return /** @type {any} */ (window).project;
}

async function removeFromOpenProjects(project) {
  let openProjects = projector.state.openProjects;
  openProjects = openProjectsUpdater.remove(openProjects, project.root.path);
  await projector.setState({
    openProjects,
  });
}

// As startup, restore project windows from settings
export async function restoreProjectWindows() {
  const projectsToOpen = projector.state.openProjects.slice();
  const openProjects = [];
  while (projectsToOpen.length > 0) {
    const rootPath = projectsToOpen.shift();
    try {
      fs.accessSync(rootPath);
      await openProject(rootPath);
      openProjects.push(rootPath);
    } catch (error) {
      // Ignore and continue
    }
  }

  loading = false;

  await projector.setState({ openProjects });

  if (openProjects.length === 0) {
    // The openProject() call will refresh the menu as needed. If no projects
    // were opened, explicitly create the menu here.
    await createMenu();
    // Since no projects were opened, show Open Folder dialog
    await folderOpen();
  }
}

app.on("before-quit", () => {
  quitting = true;
});
