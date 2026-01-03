import { loadSettings, saveSettings } from "./settings.js";

const MAX_RECENT_FILES = 10;

export async function addFile(filePath) {
  const recentFiles = await getFiles();

  // Remove if already in list
  const newFiles = recentFiles.filter((path) => path !== filePath);

  // Add to front
  newFiles.unshift(filePath);

  // Limit to MAX_RECENT_FILES
  if (newFiles.length > MAX_RECENT_FILES) {
    newFiles = newFiles.slice(0, MAX_RECENT_FILES);
  }

  // Save to disk
  await saveFiles(newFiles);
}

export async function clearFiles() {
  const recentFiles = [];
  await saveFiles(recentFiles);
}

export async function getFiles() {
  const settings = await loadSettings();
  return settings.recentFiles || [];
}

export async function removeFile(filePath) {
  const recentFiles = await getFiles();
  const newFiles = recentFiles.filter((path) => path !== filePath);
  await saveFiles(newFiles);
}

async function saveFiles(recentFiles) {
  const settings = await loadSettings();
  settings.recentFiles = recentFiles;
  await saveSettings(settings);
}
