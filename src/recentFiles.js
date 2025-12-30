import { app } from "electron";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MAX_RECENT_FILES = 10;
const RECENT_FILES_PATH = join(app.getPath("userData"), "recent-files.json");

let recentFiles = [];

export async function addFile(filePath) {
  // Remove if already in list
  recentFiles = recentFiles.filter((path) => path !== filePath);

  // Add to front
  recentFiles.unshift(filePath);

  // Limit to MAX_RECENT_FILES
  if (recentFiles.length > MAX_RECENT_FILES) {
    recentFiles = recentFiles.slice(0, MAX_RECENT_FILES);
  }

  // Save to disk
  await saveFiles();
}

export async function clearFiles() {
  recentFiles = [];
  await saveFiles();
}

export function getFiles() {
  return recentFiles.slice(); // Return copy
}

export async function loadFiles() {
  try {
    await access(RECENT_FILES_PATH);
    const data = await readFile(RECENT_FILES_PATH, "utf8");
    recentFiles = JSON.parse(data);
  } catch (error) {
    // File doesn't exist or can't be read, start with empty list
    recentFiles = [];
  }
}

export async function removeFile(filePath) {
  recentFiles = recentFiles.filter((path) => path !== filePath);
  await saveFiles();
}

async function saveFiles() {
  try {
    await writeFile(RECENT_FILES_PATH, JSON.stringify(recentFiles), "utf8");
  } catch (error) {
    console.error("Failed to save recent files:", error);
  }
}
