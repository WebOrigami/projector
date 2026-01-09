import assert from "node:assert";
import { describe, test } from "node:test";
import RecentSet from "../src/RecentSet.js";

describe("RecentSet", () => {
  test("constructor enforces max size on initial items", () => {
    const recentSet = new RecentSet(["a", "b", "c", "d", "e"], 3);
    assert.deepStrictEqual([...recentSet], ["c", "d", "e"]);
  });

  test("add enforces max size", () => {
    const recentSet = new RecentSet([], 3);
    recentSet.add("a");
    recentSet.add("b");
    recentSet.add("c");
    assert.deepStrictEqual([...recentSet], ["a", "b", "c"]);

    recentSet.add("d");
    assert.deepStrictEqual([...recentSet], ["b", "c", "d"]);
  });

  test("add existing items moves it to end", () => {
    const recentSet = new RecentSet(["a", "b", "c"], 3);
    recentSet.add("b");
    assert.deepStrictEqual([...recentSet], ["a", "c", "b"]);
  });

  test("clear", () => {
    const recentSet = new RecentSet(["a", "b", "c"], 3);
    recentSet.clear();
    assert.deepStrictEqual([...recentSet], []);
  });

  test("has", () => {
    const recentSet = new RecentSet(["a", "b", "c"], 3);
    assert.strictEqual(recentSet.has("b"), true);
    assert.strictEqual(recentSet.has("d"), false);
  });

  test("remove", () => {
    const recentSet = new RecentSet(["a", "b", "c"], 3);
    recentSet.remove("b");
    assert.deepStrictEqual([...recentSet], ["a", "c"]);
  });

  test("toJSON serializes as array", () => {
    const recentSet = new RecentSet(["a", "b", "c"], 3);
    const json = JSON.stringify(recentSet);
    assert.strictEqual(json, '["a","b","c"]');
  });
});
