import { expect, test } from "vitest";
import { MURMURS } from "../src/game/murmurs";
import { DEFAULT_CONFIG } from "../src/world/config";
import { generate } from "../src/world/generate";

test("steep islands earn falls: deterministic, on the river, dropping hard", () => {
  for (const seed of [7, 777, 54321]) {
    const map = generate(seed);
    const again = generate(seed);
    expect(JSON.stringify(map.falls)).toBe(JSON.stringify(again.falls));
    expect(map.falls!.length).toBeGreaterThan(0);
    expect(map.falls!.length).toBeLessThanOrEqual(DEFAULT_CONFIG.fallMaxCount);
    const riverTiles = new Set(map.rivers.flatMap((r) => r.path));
    for (const f of map.falls!) {
      expect(Math.abs(f.dx) + Math.abs(f.dy)).toBe(1); // a single unit step
      const lip = f.y * map.width + f.x;
      const below = (f.y + f.dy) * map.width + (f.x + f.dx);
      expect(riverTiles.has(lip)).toBe(true);
      expect(f.drop).toBe(map.elevation[lip] - map.elevation[below]);
      expect(f.drop).toBeGreaterThanOrEqual(DEFAULT_CONFIG.fallMinDrop);
    }
    for (const a of map.falls!) {
      for (const b of map.falls!) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
          DEFAULT_CONFIG.fallMinSpacing,
        );
      }
    }
  }
});

test("gentle islands have no white water at all", () => {
  for (const seed of [1, 42]) {
    expect(generate(seed).falls).toEqual([]);
  }
});

test("murmurs wait in the mist", () => {
  expect(MURMURS.filter((m) => m.tag === "falls").length).toBeGreaterThanOrEqual(2);
});
