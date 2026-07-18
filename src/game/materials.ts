import { hash2d } from "../core/rng";
import { Tile, WALKABLE, WorldMap } from "../world/types";

// What the island offers a camp-builder: driftwood the sea leaves on its
// beaches, loose stones shed at the rock's edge. Deterministic per seed;
// what you've taken is remembered in the save.

export interface MaterialNode {
  x: number; // tile coords
  y: number;
  kind: "wood" | "stone";
  idx: number; // stable index, used to remember what was taken
}

export const FIRE_COST = { wood: 4, stone: 3 };

export function placeMaterials(map: WorldMap, seed: number): MaterialNode[] {
  const out: MaterialNode[] = [];
  const { width, height, tiles } = map;
  const at = (x: number, y: number) => tiles[y * width + x] as Tile;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const t = at(x, y);
      const sides = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
      if (t === Tile.Sand) {
        const nearWater = sides.some(
          (n) => n === Tile.ShallowWater || n === Tile.DeepWater,
        );
        if (nearWater && hash2d(x, y, seed ^ 0xd21f7) < 0.02) {
          out.push({ x, y, kind: "wood", idx: out.length });
        }
      } else if (WALKABLE.has(t)) {
        const nearRock = sides.some((n) => n === Tile.Rock);
        if (nearRock && hash2d(x, y, seed ^ 0x570e5) < 0.045) {
          out.push({ x, y, kind: "stone", idx: out.length });
        }
      }
    }
  }
  return out;
}
