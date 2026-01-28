import assert from "node:assert";
import { describe, test } from "node:test";
import * as protocol from "../src/protocol.js";

describe("protocol", () => {
  // This test is mostly just proving we can mock the electron package
  test("register protocol", async () => {
    let called = false;
    protocol.registerOrigamiProtocol({
      protocol: {
        handle(scheme, handler) {
          assert.strictEqual(scheme, "origami");
          called = true;
        },
      },
      project: {
        result: {},
      },
    });
    assert(called);
  });
});
