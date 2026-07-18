import { expect, test } from "vitest";
import { Tile, WorldMap, isWalkable, tileAt } from "../src/world/types";

function tinyMap(): WorldMap {
  const tiles = new Uint8Array([
    Tile.DeepWater, Tile.ShallowWater,
    Tile.Grass, Tile.Rock,
  ]);
  return {
    width: 2, height: 2, seed: 0, tiles,
    elevation: new Float32Array(4), rivers: [], spawn: { x: 0, y: 1 },
  };
}

test("tileAt reads row-major and returns DeepWater out of bounds", () => {
  const map = tinyMap();
  expect(tileAt(map, 0, 0)).toBe(Tile.DeepWater);
  expect(tileAt(map, 1, 0)).toBe(Tile.ShallowWater);
  expect(tileAt(map, 0, 1)).toBe(Tile.Grass);
  expect(tileAt(map, 1, 1)).toBe(Tile.Rock);
  expect(tileAt(map, -1, 0)).toBe(Tile.DeepWater);
  expect(tileAt(map, 2, 0)).toBe(Tile.DeepWater);
  expect(tileAt(map, 0, 2)).toBe(Tile.DeepWater);
});

test("walkability: shallow water, sand, grass, forest walk; deep water, rock, snow block", () => {
  const map = tinyMap();
  expect(isWalkable(map, 0, 0)).toBe(false); // deep water
  expect(isWalkable(map, 1, 0)).toBe(true); // shallow water (wading)
  expect(isWalkable(map, 0, 1)).toBe(true); // grass
  expect(isWalkable(map, 1, 1)).toBe(false); // rock
  expect(isWalkable(map, -1, -1)).toBe(false); // out of bounds
});
