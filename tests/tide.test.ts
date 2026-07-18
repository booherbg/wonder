import { expect, test } from "vitest";
import { CYCLE_MS } from "../src/game/daynight";
import {
  TIDE_CYCLE_MS,
  TIDE_LOW,
  exposureAt,
  placeTidePools,
  tideAt,
} from "../src/game/tide";
import { generate } from "../src/world/generate";
import { Tile } from "../src/world/types";

test("the tide breathes: periodic, bounded, reaching both ends", () => {
  let lo = Infinity;
  let hi = -Infinity;
  for (let t = 0; t < TIDE_CYCLE_MS; t += 1000) {
    const v = tideAt(t);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
    expect(tideAt(t + TIDE_CYCLE_MS)).toBeCloseTo(v, 10);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  expect(lo).toBeLessThan(0.01);
  expect(hi).toBeGreaterThan(0.99);
});

test("low water is a real window, not a blink", () => {
  let low = 0;
  let n = 0;
  for (let t = 0; t < TIDE_CYCLE_MS; t += 500) {
    n++;
    if (tideAt(t) > TIDE_LOW) low++;
  }
  expect(low / n).toBeGreaterThan(0.25);
  expect(low / n).toBeLessThan(0.5);
});

test("the tide drifts against the sun", () => {
  expect(TIDE_CYCLE_MS % CYCLE_MS).not.toBe(0);
});

test("exposure ramps from hidden to bare", () => {
  expect(exposureAt(0)).toBe(0);
  expect(exposureAt(0.55)).toBe(0);
  expect(exposureAt(0.9)).toBe(1);
  expect(exposureAt(0.75)).toBeGreaterThan(0);
  expect(exposureAt(0.75)).toBeLessThan(1);
});

test("pools sit where the sea meets the sand, deterministic per seed", () => {
  for (const seed of [1, 20, 42]) {
    const map = generate(seed);
    const pools = placeTidePools(map, seed);
    expect(JSON.stringify(pools)).toBe(JSON.stringify(placeTidePools(map, seed)));
    expect(pools.length).toBeGreaterThan(3); // every shore keeps a few
    for (const p of pools) {
      expect(map.tiles[p.y * map.width + p.x]).toBe(Tile.ShallowWater);
      const sides = [
        map.tiles[p.y * map.width + p.x + 1],
        map.tiles[p.y * map.width + p.x - 1],
        map.tiles[(p.y + 1) * map.width + p.x],
        map.tiles[(p.y - 1) * map.width + p.x],
      ];
      expect(sides.some((t) => t === Tile.Sand)).toBe(true);
      expect(p.hue).toBeGreaterThanOrEqual(0);
      expect(p.hue).toBeLessThan(1);
    }
  }
});

test("every dweller kind turns up somewhere", () => {
  const kinds = new Set<string>();
  for (const seed of [1, 7, 20, 42]) {
    for (const p of placeTidePools(generate(seed), seed)) kinds.add(p.dweller);
  }
  expect(kinds.size).toBe(3);
});
