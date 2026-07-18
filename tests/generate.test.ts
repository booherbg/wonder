import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/world/config";
import { generate } from "../src/world/generate";
import { Tile, WALKABLE, WorldMap, isWalkable, tileAt } from "../src/world/types";

const cfg = DEFAULT_CONFIG;

function walkableRegionSize(map: WorldMap, startX: number, startY: number): number {
  const seen = new Set<number>([startY * map.width + startX]);
  const stack = [startY * map.width + startX];
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % map.width;
    const y = (i / map.width) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const j = (y + dy) * map.width + (x + dx);
      if (!seen.has(j) && isWalkable(map, x + dx, y + dy)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size;
}

test("same seed generates an identical world", () => {
  const a = generate(12345, cfg);
  const b = generate(12345, cfg);
  expect(a.tiles).toEqual(b.tiles);
  expect(a.spawn).toEqual(b.spawn);
  expect(a.rivers).toEqual(b.rivers);
  expect(a.seed).toBe(12345);
});

test("different seeds generate different worlds", () => {
  expect(generate(111, cfg).tiles).not.toEqual(generate(999, cfg).tiles);
});

test("spawn is a walkable grass tile in a large connected region", () => {
  for (const seed of [1, 42, 777]) {
    const map = generate(seed, cfg);
    expect(tileAt(map, map.spawn.x, map.spawn.y)).toBe(Tile.Grass);
    expect(walkableRegionSize(map, map.spawn.x, map.spawn.y)).toBeGreaterThanOrEqual(
      cfg.minWalkableRegion,
    );
  }
});

test("map borders are deep water", () => {
  const map = generate(42, cfg);
  for (let x = 0; x < map.width; x++) {
    expect(tileAt(map, x, 0)).toBe(Tile.DeepWater);
    expect(tileAt(map, x, map.height - 1)).toBe(Tile.DeepWater);
  }
  for (let y = 0; y < map.height; y++) {
    expect(tileAt(map, 0, y)).toBe(Tile.DeepWater);
    expect(tileAt(map, map.width - 1, y)).toBe(Tile.DeepWater);
  }
});

test("every river descends and ends at the sea or a local minimum", () => {
  const map = generate(42, cfg);
  expect(map.rivers.length).toBeGreaterThan(0);
  for (const river of map.rivers) {
    for (let k = 1; k < river.path.length; k++) {
      expect(map.elevation[river.path[k]]).toBeLessThan(map.elevation[river.path[k - 1]]);
    }
    if (river.path.length === cfg.riverMaxSteps) continue; // truncated by safety cap
    const last = river.path[river.path.length - 1];
    const x = last % map.width;
    const y = (last / map.width) | 0;
    if (river.reachedSea) {
      const touchesSea = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
        ([dx, dy]) => tileAt(map, x + dx, y + dy) === Tile.DeepWater,
      );
      expect(touchesSea).toBe(true);
    } else {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        expect(map.elevation[ny * map.width + nx]).toBeGreaterThanOrEqual(
          map.elevation[last],
        );
      }
    }
  }
});

test("all tiles are valid Tile values and every biome band can occur", () => {
  const map = generate(12345, cfg);
  const present = new Set<number>();
  for (const t of map.tiles) {
    expect(t).toBeGreaterThanOrEqual(Tile.DeepWater);
    expect(t).toBeLessThanOrEqual(Tile.Snow);
    present.add(t);
  }
  // a healthy island has water, shore, and living land
  for (const t of [Tile.DeepWater, Tile.ShallowWater, Tile.Sand, Tile.Grass, Tile.Forest]) {
    expect(present.has(t)).toBe(true);
  }
  expect(WALKABLE.has(Tile.Grass)).toBe(true);
});
