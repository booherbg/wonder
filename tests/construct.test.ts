import { expect, test } from "vitest";
import { biomeSampler, buildConstruct, playableIsland, singleBiome } from "../src/world/construct";
import { Tile, WorldMap, isWalkable } from "../src/world/types";

const REAL_TILES = new Set(Object.values(Tile).filter((v) => typeof v === "number") as number[]);

// the "no void tile" guarantee: every cell is a real biome enum value
function everyTileReal(map: WorldMap): boolean {
  for (const t of map.tiles) if (!REAL_TILES.has(t)) return false;
  return true;
}

test("single-biome fills one real tile everywhere, spawn walkable", () => {
  const m = singleBiome(123, Tile.Grass, 32);
  expect(m.width).toBe(32);
  expect(m.height).toBe(32);
  expect(m.tiles.every((t) => t === Tile.Grass)).toBe(true);
  expect(everyTileReal(m)).toBe(true);
  expect(isWalkable(m, m.spawn.x, m.spawn.y)).toBe(true);
});

test("biome-sampler carries every headline biome, all real tiles, spawn on grass", () => {
  const m = biomeSampler(7);
  const present = new Set(m.tiles);
  for (const t of [Tile.ShallowWater, Tile.Sand, Tile.Grass, Tile.Forest, Tile.Marsh, Tile.Rock, Tile.Highland]) {
    expect(present.has(t)).toBe(true);
  }
  expect(everyTileReal(m)).toBe(true);
  expect(m.tiles[m.spawn.y * m.width + m.spawn.x]).toBe(Tile.Grass);
});

test("hand-built constructs are deterministic (same seed → identical tiles)", () => {
  expect([...biomeSampler(7).tiles]).toEqual([...biomeSampler(7).tiles]);
  expect([...singleBiome(7).tiles]).toEqual([...singleBiome(7).tiles]);
});

test("playable-island is a real island: valid map, some land, walkable spawn, no void", () => {
  const m = playableIsland(20260722);
  expect(m.width).toBeGreaterThan(0);
  let land = 0;
  for (const t of m.tiles) if (t !== Tile.DeepWater && t !== Tile.ShallowWater) land++;
  expect(land).toBeGreaterThan(0);
  expect(everyTileReal(m)).toBe(true);
  expect(isWalkable(m, m.spawn.x, m.spawn.y)).toBe(true);
});

test("buildConstruct dispatches each starter kind", () => {
  expect(buildConstruct("single-biome", 1).tiles.every((t) => t === Tile.Grass)).toBe(true);
  expect(new Set(buildConstruct("biome-sampler", 1).tiles).size).toBeGreaterThan(3);
  expect(buildConstruct("playable-island", 1).width).toBeGreaterThan(0);
});
