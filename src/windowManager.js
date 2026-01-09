import { BrowserWindow } from "electron";
import fs from "node:fs/promises";
import { createMenu } from "./menu.js";
import Project from "./project.js";
import * as recentFiles from "./recentFiles.js";

// Main application state and window management

export async function closeProject(window) {}

// Open/activate a file
export async function openFile(filePath) {
  // Open the project
  const root = await Project.getRoot(filePath);
  const project = await openProject(root.path);

  // Load the selected file
  await project.load(filePath);

  // Add to recent files
  await recentFiles.addFile(project.filePath);

  // Rebuild menu to reflect recent files
  await createMenu();
}

// Open/activate a project, return the project
export async function openProject(rootPath) {
  const window = BrowserWindow.getAllWindows()[0];
  if (!window) {
    throw "No window available to open project";
  }

  const project = window.project;
  if (project.root !== rootPath) {
    // TODO: load the project
  }

  return project;
}

export async function restoreProjectWindows() {
  // TODO: Restore windows from settings
  // For now, load most recent file

  let files = await recentFiles.getFiles();
  while (files.length > 0) {
    const mostRecentFile = files.at(-1);

    // Check if file still exists
    try {
      await fs.access(mostRecentFile);

      // Load the file
      await openFile(mostRecentFile);
      break;
    } catch (error) {
      // File doesn't exist or couldn't be opened; remove from list
      await recentFiles.removeFile(mostRecentFile);
      files = await recentFiles.getFiles();
    }
  }
}
