import assert from "node:assert";
import { describe, test } from "node:test";
import * as utilities from "../src/utilities.js";

describe("utilities", () => {
  test("getSitePath returns site path from package.json start script", () => {
    const packageData = {
      scripts: {
        start: "ori serve watch src, =debug src/site.ori/public",
      },
    };
    const sitePath = utilities.getSitePath(packageData);
    assert.strictEqual(sitePath, "src/site.ori/public");
  });

  describe("isSimpleObject", () => {
    test("returns true for a plain object", () => {
      const fixture = {
        key1: "value1",
        key2: "value2",
      };
      assert(utilities.isSimpleObject(fixture));
    });

    test("returns false for an object with a getter", () => {
      const fixture = {
        get value() {
          return 42;
        },
      };
      const result = utilities.isSimpleObject(fixture);
      assert(!result);
    });
  });

  test("resolveHref", () => {
    assert.equal(utilities.resolveHref("https://example.com", "", ""), null);
    assert.equal(
      utilities.resolveHref("/about", "command", "src/site.ori/"),
      "src/site.ori/about",
    );
    assert.equal(
      utilities.resolveHref("contact", "foo/bar", ""),
      "foo/contact",
    );
    assert.equal(
      utilities.resolveHref("../up", "a/b/c", "src/site.ori"),
      "a/up",
    );
    assert.equal(
      utilities.resolveHref("key", "fn.js data", ""),
      "(fn.js data)/key",
    );
  });

  describe("preprocessResource", () => {
    test("returns map index.html if it exists", async () => {
      const fixture = new Map([["index.html", "<h1>Hello World</h1>"]]);
      const result = await utilities.preprocessResource(fixture);
      assert.strictEqual(result, "<h1>Hello World</h1>");
    });

    test("generates default index page is map isn't simple", async () => {
      const fixture = {
        a: {
          b: Uint8Array.from("data"),
        },
      };
      const result = await utilities.preprocessResource(fixture);
      assert.match(String(result), /<h1>Index<\/h1>/);
    });
  });
});
