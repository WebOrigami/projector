import assert from "node:assert";
import { describe, test } from "node:test";
import recent from "../src/recent.js";

describe("recent", () => {
  test("creates function to add to an array with max size", () => {
    const { add } = recent(3);
    let items = [];
    items = add(items, "a");
    items = add(items, "b");
    items = add(items, "c");
    assert.deepStrictEqual(items, ["a", "b", "c"]);

    items = add(items, "d");
    assert.deepStrictEqual(items, ["b", "c", "d"]);

    items = add(items, "b");
    assert.deepStrictEqual(items, ["c", "d", "b"]);
  });

  test("creates remove function to remove an item", () => {
    const { remove } = recent(3);
    let items = ["a", "b", "c"];
    items = remove(items, "b");
    assert.deepStrictEqual(items, ["a", "c"]);
  });
});
