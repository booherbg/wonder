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
  expect(classify(0.5, 0.9, cfg)).toBe(Tile.Forest); // moist woods climb past the treeline
  expect(classify(0.48, 0.2, cfg)).toBe(Tile.Grass);
  expect(classify(0.65, 0.5, cfg)).toBe(Tile.Rock);
  expect(classify(0.9, 0.5, cfg)).toBe(Tile.Snow);
});

test("the climb reads in bands: treeline turf, scree apron, cliff faces", () => {
  expect(classify(0.5, 0.2, cfg)).toBe(Tile.Highland); // above the treeline, dry: open turf
  expect(classify(0.56, 0.3, cfg)).toBe(Tile.Scree); // the talus apron under the rock
  expect(classify(0.56, 0.8, cfg)).toBe(Tile.Highland); // moist slopes keep their turf
  expect(classify(0.65, 0.5, cfg, 0.05)).toBe(Tile.Cliff); // steep high ground breaks sheer
  expect(classify(0.45, 0.4, cfg, 0.05)).toBe(Tile.Cliff); // even a green hillside can wall up
  expect(classify(0.39, 0.4, cfg, 0.05)).toBe(Tile.Grass); // but never down on the flats
  expect(classify(0.9, 0.5, cfg, 0.05)).toBe(Tile.Snow); // and the snow stays snow
  // a treeline belongs to mountains: gentle isles keep their meadows high up
  expect(classify(0.5, 0.2, cfg, 0, false)).toBe(Tile.Grass);
  expect(classify(0.56, 0.3, cfg, 0, false)).toBe(Tile.Grass);
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
