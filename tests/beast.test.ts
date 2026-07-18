import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { beastSegments, generateBeast, updateBeast } from "../src/life/beast";
import { TILE_SIZE } from "../src/world/config";
import { generate } from "../src/world/generate";
import { isWalkable } from "../src/world/types";

test("beast generation is deterministic and spawns on walkable ground", () => {
  for (const seed of [1, 42, 777, 12345, 555]) {
    const map = generate(seed);
    const a = generateBeast(seed, map);
    const b = generateBeast(seed, map);
    expect(a).toEqual(b);
    if (a) {
      expect(isWalkable(map, Math.floor(a.x / TILE_SIZE), Math.floor(a.y / TILE_SIZE))).toBe(true);
      expect(a.name.length).toBeGreaterThan(6);
      expect(a.segments).toBeGreaterThanOrEqual(5);
    }
  }
});

test("some islands have a beast and some do not", () => {
  const withBeast: number[] = [];
  const without: number[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const map = generate(seed);
    (generateBeast(seed, map) ? withBeast : without).push(seed);
  }
  expect(withBeast.length).toBeGreaterThan(5);
  expect(without.length).toBeGreaterThan(0);
});

test("the beast stays on walkable ground across minutes of travel", () => {
  const map = generate(42);
  const beast = generateBeast(42, map);
  expect(beast).not.toBeNull();
  const rng = makeRng(5);
  const dt = 1 / 30;
  for (let step = 0; step < 30 * 240; step++) {
    updateBeast(beast!, dt, map, null, rng);
    const tx = Math.floor(beast!.x / TILE_SIZE);
    const ty = Math.floor(beast!.y / TILE_SIZE);
    expect(isWalkable(map, tx, ty)).toBe(true);
  }
  // it has actually gone somewhere and its body trails behind
  expect(beast!.history.length).toBeGreaterThan(4);
  const segs = beastSegments(beast!);
  expect(segs).toHaveLength(beast!.segments);
  expect(segs[0].r).toBeGreaterThan(segs[segs.length - 1].r);
});
