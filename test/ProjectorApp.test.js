import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import ProjectorApp from "../src/ProjectorApp.js";

describe("ProjectorApp", () => {
  test("returns empty settings if settings.json doesn't exist", async () => {
    await resetSettings();

    const projector = new ProjectorApp();
    const { state } = projector;
    assert.deepStrictEqual(state, {
      openProjects: [],
      recentProjects: [],
      projects: {},
    });
  });

  test("saves and loads settings", async () => {
    await resetSettings();

    const projector = new ProjectorApp();
    const oldState = projector.state;
    const changes = {
      openProjects: ["/path/to/project1"],
    };
    await projector.setState(changes);

    const { state } = projector;
    assert.deepStrictEqual(state, {
      ...oldState,
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
