import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import * as settings from "../src/settings.js";

describe("settings", () => {
  test("returns empty settings if settings.json doesn't exist", async () => {
    await resetSettings();

    const loadedSettings = await settings.loadSettings();
    assert.deepStrictEqual(loadedSettings, {
      openProjects: [],
      recentProjects: [],
      projects: {},
    });
  });

  test("saves and loads settings", async () => {
    await resetSettings();

    const fixture = await settings.loadSettings();
    const changes = {
      openProjects: ["/path/to/project1"],
    };
    await settings.saveSettings(changes);

    const reloaded = await settings.loadSettings();
    assert.deepStrictEqual(reloaded, {
      ...fixture,
      ...changes,
    });
  });
});

// Erase any existing settings file
export async function resetSettings() {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const settingsPath = path.join(
    moduleDirectory,
    "mocks/userData/settings.json",
  );
  await fs.rm(settingsPath, { force: true });
}
