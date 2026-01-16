import assert from "node:assert";
import { describe, test } from "node:test";
import { getSitePath } from "../src/utilities.js";

describe("utilities", () => {
  test("parses site path from package.json start script", async () => {
    const packageData = {
      scripts: {
        start: "ori serve watch src, =debug src/site.ori/public",
      },
    };
    const sitePath = await getSitePath(packageData);
    assert.strictEqual(sitePath, "src/site.ori/public");
  });
});
