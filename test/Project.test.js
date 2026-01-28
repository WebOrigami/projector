import assert from "node:assert";
import path from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import Project from "../src/Project.js";
import { BrowserWindow } from "../test/mocks/electron.js";

describe("Project", () => {
  test("loadProject", async () => {
    const window = new BrowserWindow();
    const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
    const rootPath = path.join(moduleDirectory, "fixtures/sample");

    // @ts-ignore
    const project = new Project(window, rootPath);
    await project.loadProject();

    // Check state
    const expected = {
      backEnabled: false,
      command: "./",
      dirty: false,
      error: null,
      fileName: "Untitled",
      forwardEnabled: false,
      lastRunCrashed: false,
      pageTitle: "",
      projectName: "sample",
      recentCommands: ["./"],
      sitePath: ".",
      text: "",
      textSource: "file",
    };
    assertSubset(expected, project.state);

    // Check initial result
    const { result } = project;
    const text = String(result);
    assert(/<h1>sample\/<\/h1>/.test(text));
  });
});

// Assert that all properties in expected are in actual and are equal
function assertSubset(expected, actual) {
  for (const [key, value] of Object.entries(expected)) {
    const message = `Property ${key} does not match`;
    if (value instanceof Array) {
      assert.deepStrictEqual(actual[key], value, message);
      continue;
    } else {
      assert.strictEqual(actual[key], value, message);
    }
  }
}
