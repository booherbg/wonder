import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, HOLLOW_CONFIG, configForStyle } from "../src/world/config";
import { generate } from "../src/world/generate";
import { Tile } from "../src/world/types";

describe("the Hollow's island style", () => {
  it("leaves the classic config untouched", () => {
    expect(configForStyle("classic")).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG.width).toBe(300);
    expect(DEFAULT_CONFIG.height).toBe(300);
  });

  it("is smaller and denser than the classic island", () => {
    expect(HOLLOW_CONFIG.width).toBeLessThan(DEFAULT_CONFIG.width);
    expect(HOLLOW_CONFIG.forestMoisture).toBeLessThan(DEFAULT_CONFIG.forestMoisture);
  });

  it("generates a walkable island", () => {
    const map = generate(1, HOLLOW_CONFIG);
    expect(map.width).toBe(HOLLOW_CONFIG.width);
    expect(map.spawn.x).toBeGreaterThanOrEqual(0);
  });

  it("generates walkable islands across many seeds", () => {
    for (let s = 1; s <= 12; s++) {
      const map = generate(s, HOLLOW_CONFIG);
      expect(map.spawn.x).toBeGreaterThanOrEqual(0);
      expect(map.spawn.y).toBeGreaterThanOrEqual(0);
    }
  });

  it("allows the wanderer to spawn under the canopy, not just on grass", () => {
    // Forest first: it is the primary spawn ground. Grass is the fallback,
    // kept because it matters on grassier seeds, but the Hollow carries only
    // 0-109 grass tiles out of 19,600 across seeds 1-12 (0 on five of them).
    expect(HOLLOW_CONFIG.spawnTiles).toEqual([Tile.Forest, Tile.Grass]);
    for (let s = 1; s <= 12; s++) {
      const map = generate(s, HOLLOW_CONFIG);
      const spawnTile = map.tiles[map.spawn.y * map.width + map.spawn.x] as Tile;
      expect([Tile.Grass, Tile.Forest]).toContain(spawnTile);
    }
  });

  it("leaves the classic island's spawn tile as grass-only (no spawnTiles set)", () => {
    expect(DEFAULT_CONFIG.spawnTiles).toBeUndefined();
    const map = generate(1, DEFAULT_CONFIG);
    const spawnTile = map.tiles[map.spawn.y * map.width + map.spawn.x] as Tile;
    expect(spawnTile).toBe(Tile.Grass);
  });
});
