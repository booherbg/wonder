import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { Flock, generateFlocks, updateFlock } from "../src/life/birds";
import { TILE_SIZE } from "../src/world/config";
import { generate } from "../src/world/generate";

test("flock generation is deterministic with 1-2 flocks of 3-6 birds", () => {
  for (const seed of [1, 42, 777]) {
    const map = generate(seed);
    const a = generateFlocks(seed, map);
    expect(a).toEqual(generateFlocks(seed, map));
    expect(a.length).toBeGreaterThanOrEqual(1);
    expect(a.length).toBeLessThanOrEqual(2);
    for (const f of a) {
      expect(f.offsets.length).toBeGreaterThanOrEqual(3);
      expect(f.offsets.length).toBeLessThanOrEqual(6);
    }
  }
});

test("flocks fly, settle, perch, and stay on the map over minutes", () => {
  const map = generate(42);
  const flocks = generateFlocks(42, map);
  const rng = makeRng(8);
  const seen = new Set<string>();
  const dt = 1 / 30;
  for (let step = 0; step < 30 * 300; step++) {
    for (const f of flocks) {
      updateFlock(f, dt, map, null, 0, rng);
      seen.add(f.state);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.x).toBeLessThanOrEqual(map.width * TILE_SIZE);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeLessThanOrEqual(map.height * TILE_SIZE);
    }
  }
  expect(seen.has("flying")).toBe(true);
  expect(seen.has("perched")).toBe(true);
});

test("a wanderer walking into a perched flock flushes it", () => {
  const map = generate(42);
  const flock: Flock = generateFlocks(42, map)[0];
  const rng = makeRng(3);
  const dt = 1 / 30;
  for (let step = 0; step < 30 * 600 && flock.state !== "perched"; step++) {
    updateFlock(flock, dt, map, null, 0, rng);
  }
  expect(flock.state).toBe("perched");
  updateFlock(flock, dt, map, { x: flock.x, y: flock.y }, 0, rng);
  expect(flock.state).toBe("flying");
  expect(flock.startled).toBe(true);
});
