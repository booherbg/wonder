import { hash2d } from "../core/rng";
import { Tile, WALKABLE, WorldMap } from "../world/types";

// What the island offers a camp-builder: driftwood the sea leaves on its
// beaches, loose stones shed at the rock's edge, soft rushes standing in
// the marshes. Deterministic per seed; what you've taken is remembered.

export interface MaterialNode {
  x: number; // tile coords
  y: number;
  kind: "wood" | "stone" | "rush";
  idx: number; // stable index, used to remember what was taken
}

export const FIRE_COST = { wood: 4, stone: 3 };
export const BEDROLL_COST = { wood: 2, rush: 4 };

// The plain, soft ground a clod of soil lifts from — the same earth you can
// settle a home on: meadow, marsh, beach, forest floor. The sea is for wading,
// bare rock and cliff are too hard, the snow too cold. Deterministic: digging
// asks nothing of the dice.
const DIGGABLE: ReadonlySet<Tile> = new Set([Tile.Grass, Tile.Marsh, Tile.Sand, Tile.Forest]);

// Where a carried clod can be worked into the ground: anywhere you can stand
// that isn't open water — so soil can amend even the barren scree and highland,
// letting the wanderer carry earth up and garden where nothing would grow.
const LAYABLE: ReadonlySet<Tile> = new Set([
  Tile.Grass,
  Tile.Marsh,
  Tile.Sand,
  Tile.Forest,
  Tile.Scree,
  Tile.Highland,
]);

export function isDiggable(tile: Tile): boolean {
  return DIGGABLE.has(tile);
}

export function isLayable(tile: Tile): boolean {
  return LAYABLE.has(tile);
}

// A hoe works the soft lowland ground into a garden bed: meadow, marsh, beach,
// forest floor. No clod to carry now, so the barren heights (scree, highland)
// and the hard rock, sea, and snow are all off-limits — you garden where the
// ground is already soft. Deterministic: tilling asks nothing of the dice.
const TILLABLE: ReadonlySet<Tile> = new Set([Tile.Grass, Tile.Marsh, Tile.Sand, Tile.Forest]);

export function isTillable(tile: Tile): boolean {
  return TILLABLE.has(tile);
}

export function placeMaterials(map: WorldMap, seed: number): MaterialNode[] {
  const out: MaterialNode[] = [];
  const { width, height, tiles } = map;
  const at = (x: number, y: number) => tiles[y * width + x] as Tile;
  // a waterfall breaks stone loose in its spray — a small set to test against
  const nearFall = (x: number, y: number): boolean =>
    (map.falls ?? []).some((f) => Math.abs(f.x - x) <= 1 && Math.abs(f.y - y) <= 1);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const t = at(x, y);
      const sides = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)];
      const nearWater = sides.some((n) => n === Tile.ShallowWater || n === Tile.DeepWater);
      if (t === Tile.Sand) {
        // the sea leaves both at the waterline: driftwood, and loose cobbles —
        // so every island with a shore can gather enough to raise a fire
        if (nearWater && hash2d(x, y, seed ^ 0xd21f7) < 0.02) {
          out.push({ x, y, kind: "wood", idx: out.length });
        }
        if (nearWater && hash2d(x, y, seed ^ 0x51c0b) < 0.025) {
          out.push({ x, y, kind: "stone", idx: out.length });
        }
      } else if (t === Tile.Forest) {
        // fallen wood on the forest floor — a fire wants wood, not only the beach's
        if (hash2d(x, y, seed ^ 0x7a3d1) < 0.03) {
          out.push({ x, y, kind: "wood", idx: out.length });
        }
      } else if (t === Tile.Marsh) {
        if (hash2d(x, y, seed ^ 0x2d05e) < 0.03) {
          out.push({ x, y, kind: "rush", idx: out.length });
        }
      } else if (t === Tile.Scree) {
        // the mountain's apron of loose talus is made of stone
        if (hash2d(x, y, seed ^ 0x9b2e1) < 0.09) {
          out.push({ x, y, kind: "stone", idx: out.length });
        }
      } else if (WALKABLE.has(t) && t !== Tile.ShallowWater) {
        // where ground meets bare rock or cliff, or a waterfall shakes it free
        const nearRock = sides.some((n) => n === Tile.Rock || n === Tile.Cliff);
        const rate = nearFall(x, y) ? 0.3 : nearRock ? 0.06 : 0;
        if (rate > 0 && hash2d(x, y, seed ^ 0x570e5) < rate) {
          out.push({ x, y, kind: "stone", idx: out.length });
        }
      }
    }
  }
  return out;
}
