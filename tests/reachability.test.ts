import { expect, test } from "vitest";
import { SHAPES, generate, IslandShape } from "../src/world/generate";
import { Tile, WALKABLE, WorldMap } from "../src/world/types";

const N4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

// Count sizable walkable lobes (≥60 tiles) that are NOT the main landmass yet
// front open deep water — i.e. an island you could wade to but that was left
// stranded across the sea. connectLobes should leave none of these. (Basins
// walled off by cliffs/rock are a different matter and not counted here.)
function waterStrandedLobes(map: WorldMap): number {
  const { tiles, width, height } = map;
  const label = new Int32Array(tiles.length).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < tiles.length; i++) {
    if (label[i] !== -1 || !WALKABLE.has(tiles[i] as Tile)) continue;
    const id = sizes.length;
    let size = 0;
    label[i] = id;
    const stack = [i];
    while (stack.length) {
      const j = stack.pop()!;
      size++;
      const x = j % width;
      const y = (j / width) | 0;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const k = ny * width + nx;
        if (label[k] === -1 && WALKABLE.has(tiles[k] as Tile)) {
          label[k] = id;
          stack.push(k);
        }
      }
    }
    sizes.push(size);
  }
  let main = 0;
  for (let r = 1; r < sizes.length; r++) if (sizes[r] > sizes[main]) main = r;
  const frontsWater = new Set<number>();
  for (let i = 0; i < label.length; i++) {
    if (label[i] < 0 || label[i] === main) continue;
    const x = i % width;
    const y = (i / width) | 0;
    for (const [dx, dy] of N4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      if (tiles[ny * width + nx] === Tile.DeepWater) frontsWater.add(label[i]);
    }
  }
  let n = 0;
  for (const r of frontsWater) if (sizes[r] >= 60) n++;
  return n;
}

test(
  "no sizable island is left stranded across the sea (every shape, a spread of seeds)",
  () => {
    for (const shape of SHAPES) {
      for (let seed = 1; seed <= 20; seed++) {
        const map = generate(seed, undefined, shape as IslandShape);
        expect(waterStrandedLobes(map)).toBe(0);
      }
    }
  },
  60_000,
);
