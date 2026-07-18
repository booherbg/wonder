import { expect, test } from "vitest";
import { DEFAULT_CONFIG, WorldConfig } from "../src/world/config";
import { buildElevation, carveRivers, classifyTiles, traceRiver } from "../src/world/generate";
import { Tile } from "../src/world/types";

// 5x5 test world: elevation decreases left to right, right column is sea.
function slopeWorld(): { elevation: Float32Array; tiles: Uint8Array; cfg: WorldConfig } {
  const cfg = { ...DEFAULT_CONFIG, width: 5, height: 5 };
  const elevation = new Float32Array(25);
  const tiles = new Uint8Array(25);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      elevation[y * 5 + x] = (4 - x) / 5; // 0.8 .. 0.0
      tiles[y * 5 + x] = x === 4 ? Tile.DeepWater : Tile.Grass;
    }
  }
  return { elevation, tiles, cfg };
}

test("river flows downhill and reaches the sea", () => {
  const { elevation, tiles, cfg } = slopeWorld();
  const river = traceRiver(elevation, tiles, 2 * 5 + 0, cfg); // start at (0, 2)
  expect(river.reachedSea).toBe(true);
  expect(river.path).toEqual([10, 11, 12, 13]); // straight east along row 2
  for (const i of river.path) expect(tiles[i]).toBe(Tile.ShallowWater);
  // elevation strictly decreases along the path
  for (let k = 1; k < river.path.length; k++) {
    expect(elevation[river.path[k]]).toBeLessThan(elevation[river.path[k - 1]]);
  }
});

test("river trapped in a bowl becomes a lake terminus", () => {
  const cfg = { ...DEFAULT_CONFIG, width: 5, height: 5 };
  const elevation = new Float32Array(25);
  const tiles = new Uint8Array(25).fill(Tile.Grass);
  // bowl centered at (2,2): elevation rises with distance from center
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      elevation[y * 5 + x] = 0.4 + 0.1 * (Math.abs(x - 2) + Math.abs(y - 2));
    }
  }
  const river = traceRiver(elevation, tiles, 0, cfg); // start at corner (0,0)
  expect(river.reachedSea).toBe(false);
  const last = river.path[river.path.length - 1];
  expect(last).toBe(2 * 5 + 2); // settles at the bowl's bottom
  expect(tiles[last]).toBe(Tile.ShallowWater); // the lake
});

test("carveRivers is deterministic on a real island", () => {
  const cfg = DEFAULT_CONFIG;
  const e1 = buildElevation(3, cfg);
  const t1 = classifyTiles(e1, 3, cfg);
  const r1 = carveRivers(e1, t1, 3, cfg);
  const e2 = buildElevation(3, cfg);
  const t2 = classifyTiles(e2, 3, cfg);
  const r2 = carveRivers(e2, t2, 3, cfg);
  expect(r1).toEqual(r2);
  expect(t1).toEqual(t2);
});
