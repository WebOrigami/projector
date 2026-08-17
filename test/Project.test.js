import assert from "node:assert";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import AppBase from "../src/app/AppBase.js";
import Project from "../src/project/Project.js";
import { BrowserWindow } from "../test/mocks/electron.js";

describe("Project", () => {
  test("loadProject", async () => {
    const project = await createProject();

    // Check state
    const expected = {
      backEnabled: false,
      command: "./",
      dirty: false,
      error: null,
      fileName: null,
      forwardEnabled: false,
      lastRunCrashed: true, // because test won't actually run command
      pageTitle: "",
      projectName: "sample",
      recentCommands: ["./"],
      sitePath: ".",
      text: null,
      textSource: "file",
    };
    assertSubset(expected, project.state);

    // Confirm client got the same state
    // @ts-ignore
    const clientState = project.window._client.state;
    assert.deepStrictEqual(clientState, project.state);
  });

  test("navigateAndRun", async () => {
    const project = await createProject();
    await project.navigateAndRun("add.ori(1, 2)");
    assertSubset(
      {
        command: "add.ori(1, 2)",
        error: null,
        lastRunCrashed: true, // because test won't actually run command
        recentCommands: ["./", "add.ori(1, 2)"],
        resultVersion: 2,
      },
      project.state,
    );
  });
});

// Assert that all properties in expected are in actual and are equal
function assertSubset(expected, actual) {
  for (const [key, value] of Object.entries(expected)) {
    const message = `Property "${key}" does not match`;
    if (value instanceof Array) {
      assert.deepStrictEqual(actual[key], value, message);
      continue;
    } else {
      assert.strictEqual(actual[key], value, message);
    }
  }
}

async function createProject() {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const rootPath = path.join(moduleDirectory, "fixtures/sample");

  const window = new BrowserWindow();
  const projector = new AppBase();

  // @ts-ignore
  const project = new Project(rootPath, window, projector);
  await project.loadProject(false);

  return project;
}
