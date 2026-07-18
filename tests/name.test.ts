import { expect, test } from "vitest";
import { islandName } from "../src/world/name";

test("island names are deterministic, capitalized, two words", () => {
  expect(islandName(42)).toBe(islandName(42));
  for (const seed of [1, 42, 777, 12345]) {
    const name = islandName(seed);
    const words = name.split(" ");
    expect(words).toHaveLength(2);
    expect(name[0]).toBe(name[0].toUpperCase());
    expect(words[0].length).toBeGreaterThan(2);
  }
});

test("different seeds usually get different names", () => {
  const names = new Set<string>();
  for (let seed = 0; seed < 50; seed++) names.add(islandName(seed));
  expect(names.size).toBeGreaterThan(40);
});
