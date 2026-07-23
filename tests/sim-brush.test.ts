import { expect, test } from "vitest";
import { paintBiome, stampCells, stampOffsets } from "../src/game/simBrush";
import { habitatsOf, placeablePlants } from "../src/game/simRoster";
import { singleBiome } from "../src/world/construct";
import { generatePlantSpecies } from "../src/life/species";
import { Tile, isWalkable } from "../src/world/types";

test("stampOffsets: 1×1 / 2×2 / 3×3 lay 1 / 4 / 9 cells", () => {
  expect(stampOffsets(1)).toEqual([{ dx: 0, dy: 0 }]);
  expect(stampOffsets(2).length).toBe(4);
  expect(stampOffsets(3).length).toBe(9);
  // 3×3 centres on the clicked tile
  expect(stampOffsets(3)).toContainEqual({ dx: -1, dy: -1 });
  expect(stampOffsets(3)).toContainEqual({ dx: 1, dy: 1 });
  // 2×2 has no fractional centre → the clicked tile anchors the block's top-left
  expect(stampOffsets(2)).toContainEqual({ dx: 0, dy: 0 });
  expect(stampOffsets(2)).toContainEqual({ dx: 1, dy: 1 });
  expect(stampOffsets(2)).not.toContainEqual({ dx: -1, dy: -1 });
});

test("stampCells fills the interior and drops out-of-bounds cells at an edge", () => {
  const m = singleBiome(1, Tile.Grass, 10);
  expect(stampCells(5, 5, 3, m).length).toBe(9); // interior: the full block
  expect(stampCells(0, 0, 3, m).length).toBe(4); // top-left corner: only the in-bounds quarter
  expect(stampCells(5, 5, 1, m)).toEqual([{ x: 5, y: 5 }]); // 1×1 == the clicked tile itself
});

test("paintBiome mutates tiles in place, real tiles only, returns the changed count", () => {
  const m = singleBiome(1, Tile.Grass, 8);
  const cells = stampCells(4, 4, 2, m);
  expect(paintBiome(m, cells, Tile.ShallowWater)).toBe(4);
  for (const { x, y } of cells) expect(m.tiles[y * m.width + x]).toBe(Tile.ShallowWater);
  expect(paintBiome(m, cells, Tile.ShallowWater)).toBe(0); // idempotent: already that tile
});

test("paintBiome keeps the spawn tile walkable even under a flood of deep water", () => {
  const m = singleBiome(1, Tile.Grass, 8);
  const all: { x: number; y: number }[] = [];
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) all.push({ x, y });
  paintBiome(m, all, Tile.DeepWater);
  expect(isWalkable(m, m.spawn.x, m.spawn.y)).toBe(true); // spawn spared
  expect(m.tiles[0]).toBe(Tile.DeepWater); // everything else flooded
});

test("painting a species' habitat unlocks exactly that species (the paint→refresh path)", () => {
  const species = generatePlantSpecies(7);
  const off = species.find((s) => s.habitat !== Tile.Grass); // a kind a grass construct excludes
  const m = singleBiome(7, Tile.Grass, 12);
  if (off) {
    expect(placeablePlants(species, habitatsOf(m)).some((s) => s.id === off.id)).toBe(false);
    paintBiome(m, stampCells(6, 6, 3, m), off.habitat); // paint its habitat in
    expect(habitatsOf(m).has(off.habitat)).toBe(true);
    expect(placeablePlants(species, habitatsOf(m)).some((s) => s.id === off.id)).toBe(true);
  }
});
