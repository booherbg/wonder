import { expect, test } from "vitest";
import { lruEvictOldest, lruTouch, pruneMapKeys } from "../src/core/lru";

test("lruTouch moves a key to newest without growing size", () => {
  const m = new Map<string, number>([
    ["a", 1],
    ["b", 2],
  ]);
  lruTouch(m, "a", 1);
  expect([...m.keys()]).toEqual(["b", "a"]);
  expect(m.size).toBe(2);
});

test("lruEvictOldest drops the oldest until under cap", () => {
  const m = new Map([
    ["a", 1],
    ["b", 2],
    ["c", 3],
  ]);
  // Cap 2 → leave room for one insert ⇒ size becomes 1
  lruEvictOldest(m, 2);
  expect([...m.keys()]).toEqual(["c"]);
});

test("pruneMapKeys removes stale ids", () => {
  const m = new Map([
    [1, [1]],
    [2, [2]],
    [3, [3]],
  ]);
  pruneMapKeys(m, new Set([2]));
  expect([...m.keys()]).toEqual([2]);
});
