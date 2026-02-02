import assert from "node:assert";
import fs from "node:fs/promises";
import { before, describe, test } from "node:test";
import { eraseSettings, settingsPath } from "./eraseSettings.js";

// To test the loading and saving of settings, we need to control the loading
// of the projector singleton by using a dynamic import.
let projector;

describe("ProjectorApp", () => {
  before(async () => {
    await eraseSettings();
    ({ default: projector } = await import("../src/app/projector.js"));
  });

  test("returns empty settings if settings.json doesn't exist", async () => {
    const { state } = projector;
    assert.deepStrictEqual(state, {
      editor: {
        autoClosingBrackets: "languageDefined",
        indentSize: 2,
        insertSpaces: true,
        lineNumbers: "off",
        tabSize: 2,
      },
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
