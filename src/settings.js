import { app } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const settingsPath = join(app.getPath("userData"), "settings.json");

export async function loadSettings() {
  try {
    const data = await readFile(settingsPath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    // Return default settings if file doesn't exist or is invalid
    return {
      recentFiles: [],
    };
  }
}

export async function saveSettings(settings) {
  try {
    await writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf8");
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}
