import { expect, test } from "vitest";
import { CHAINS_KEY, resolveChains } from "../src/game/flags";

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
