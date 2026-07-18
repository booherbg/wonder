import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/world/config";
import { buildElevation, classify, classifyTiles } from "../src/world/generate";
import { Tile } from "../src/world/types";

const cfg = DEFAULT_CONFIG;

test("elevation is deterministic", () => {
  expect(buildElevation(42, cfg)).toEqual(buildElevation(42, cfg));
});

test("elevation is zero on every border (radial falloff)", () => {
  const e = buildElevation(7, cfg);
  const { width, height } = cfg;
  for (let x = 0; x < width; x++) {
    expect(e[x]).toBe(0); // top row
    expect(e[(height - 1) * width + x]).toBe(0); // bottom row
  }
  for (let y = 0; y < height; y++) {
    expect(e[y * width]).toBe(0); // left column
    expect(e[y * width + width - 1]).toBe(0); // right column
  }
});

test("classify maps elevation/moisture bands to tiles", () => {
  expect(classify(0.1, 0.5, cfg)).toBe(Tile.DeepWater);
  expect(classify(0.32, 0.5, cfg)).toBe(Tile.ShallowWater);
  expect(classify(0.36, 0.5, cfg)).toBe(Tile.Sand);
  expect(classify(0.36, 0.9, cfg)).toBe(Tile.Marsh); // wet lowland
  expect(classify(0.41, 0.9, cfg)).toBe(Tile.Marsh); // marsh creeps past the beach line
  expect(classify(0.5, 0.9, cfg)).toBe(Tile.Forest);
  expect(classify(0.5, 0.2, cfg)).toBe(Tile.Grass);
  expect(classify(0.65, 0.5, cfg)).toBe(Tile.Rock);
  expect(classify(0.9, 0.5, cfg)).toBe(Tile.Snow);
});

test("land fraction lands in a sane band across seeds", () => {
  for (const seed of [1, 2, 3]) {
    const elevation = buildElevation(seed, cfg);
    const tiles = classifyTiles(elevation, seed, cfg);
    let land = 0;
    for (const t of tiles) {
      if (t !== Tile.DeepWater && t !== Tile.ShallowWater) land++;
    }
    const fraction = land / tiles.length;
    expect(fraction).toBeGreaterThan(0.08);
    expect(fraction).toBeLessThan(0.7);
  }
});
