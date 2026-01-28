import { app } from "#electron";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createMenu } from "./menu.js";
import updateState from "./renderer/updateState.js";

const settingsPath = join(app.getPath("userData"), "settings.json");

let state = null;

export async function loadProjectSettings(projectPath) {
  await loadSettings();
  const settings = state?.projects?.[projectPath];
  return settings ?? {};
}

export async function loadSettings() {
  if (state) {
    return state;
  }

  try {
    const data = await readFile(settingsPath, "utf8");
    state = JSON.parse(data);
  } catch (error) {
    // File doesn't exist or is invalid
    state = {
      recentProjects: [],
      projects: {},
    };
  }

  return state;
}

export async function saveProjectSettings(project) {
  const { root, settings } = project;
  if (!root?.path) {
    return;
  }

  const { newState: newProjects, changed } = updateState(state.projects ?? {}, {
    [root.path]: settings,
  });
  if (Object.keys(changed).length === 0) {
    // No changes
    return;
  }

  return saveSettings({
    projects: newProjects,
  });
}

export async function saveSettings(changes) {
  if (!state) {
    await loadSettings();
  }

  const { newState, changed } = updateState(state, changes);
  if (Object.keys(changed).length === 0) {
    // No changes
    return;
  }

  state = newState;

  // Save updated settings to disk
  try {
    const json = JSON.stringify(state, null, 2);
    await writeFile(settingsPath, json, "utf8");
  } catch (error) {
    console.error("Failed to save settings:", error);
  }

  if (changed.openProjects || changed.recentProjects) {
    // Refresh menu of recent projects and state of menu items that depend on a
    // project being open.
    await createMenu();
  }
}
