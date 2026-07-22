import { expect, test } from "vitest";
import { CHAINS_KEY, resolveChains, LAST_SEED_KEY, parseLastSeed } from "../src/game/flags";

test("chains default on when nothing is set", () => {
  expect(resolveChains(null, null)).toBe(true);
});
test("a stored choice is honored", () => {
  expect(resolveChains(null, "0")).toBe(false);
  expect(resolveChains(null, "1")).toBe(true);
});
test("a URL param overrides the stored choice", () => {
  expect(resolveChains("0", "1")).toBe(false);
  expect(resolveChains("1", "0")).toBe(true);
  expect(resolveChains("false", null)).toBe(false);
});
test("the storage key is stable", () => {
  expect(CHAINS_KEY).toBe("wander.chains");
});

test("LAST_SEED_KEY is the wander-namespaced key", () => {
  expect(LAST_SEED_KEY).toBe("wander.lastSeed");
});

test("parseLastSeed reads a stored non-negative integer", () => {
  expect(parseLastSeed("42")).toBe(42);
  expect(parseLastSeed("0")).toBe(0);
});

test("parseLastSeed rejects absent / non-integer / negative values", () => {
  expect(parseLastSeed(null)).toBeNull();
  expect(parseLastSeed("")).toBeNull();
  expect(parseLastSeed("abc")).toBeNull();
  expect(parseLastSeed("3.5")).toBeNull();
  expect(parseLastSeed("-1")).toBeNull();
});
