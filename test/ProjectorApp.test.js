import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { before, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

// To test the loading and saving of settings, we need to control the loading
// of the projector singleton by using a dynamic import.
let projector;

// Tests load settings from a different location
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const settingsPath = path.join(moduleDirectory, "mocks/userData/settings.json");

describe("ProjectorApp", () => {
  before(async () => {
    // Erase any existing settings file
    await fs.rm(settingsPath, { force: true });

    ({ default: projector } = await import("../src/projector.js"));
  });

  test("returns empty settings if settings.json doesn't exist", async () => {
    const { state } = projector;
    assert.deepStrictEqual(state, {
      openProjects: [],
      recentProjects: [],
      projects: {},
    });
  });

  test("saves settings", async () => {
    const openProjects = ["/path/to/project1"];
    await projector.setState({ openProjects });

    const json = await fs.readFile(settingsPath, "utf8");
    const data = JSON.parse(json);
    assert.deepStrictEqual(data.openProjects, openProjects);
  });
});
