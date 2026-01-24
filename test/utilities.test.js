import assert from "node:assert";
import { describe, test } from "node:test";
import { getSitePath, isSimpleObject, resolveHref } from "../src/utilities.js";

describe("utilities", () => {
  test("getSitePath returns site path from package.json start script", async () => {
    const packageData = {
      scripts: {
        start: "ori serve watch src, =debug src/site.ori/public",
      },
    };
    const sitePath = await getSitePath(packageData);
    assert.strictEqual(sitePath, "src/site.ori/public");
  });

  describe("isSimpleObject", () => {
    test("returns true for a plain object", async () => {
      const fixture = {
        key1: "value1",
        key2: "value2",
      };
      const result = await isSimpleObject(fixture);
      assert(result);
    });

    test("returns false for an object with a getter", async () => {
      const fixture = {
        get value() {
          return 42;
        },
      };
      const result = await isSimpleObject(fixture);
      assert(!result);
    });

    test("returns false for object with period in key", async () => {
      const fixture = {
        key: 1,
        "file.txt": 2,
      };
      const result = await isSimpleObject(fixture);
      assert(!result);
    });

    test("resolveHref", () => {
      assert.equal(resolveHref("https://example.com", "", ""), null);
      assert.equal(
        resolveHref("/about", "command", "src/site.ori/"),
        "src/site.ori/about",
      );
      assert.equal(resolveHref("contact", "foo/bar", ""), "foo/contact");
      assert.equal(resolveHref("../up", "a/b/c", "src/site.ori"), "a/up");
      assert.equal(resolveHref("key", "fn.js data", ""), "(fn.js data)/key");
    });
  });
});
