// The shaping tools' pure core — the World-Lab's stamp + biome brush maths,
// kept out of the DOM-heavy bench so they can be tested headless (mirrors how
// simRoster.ts/flags.ts split out of worldlab.ts in slice 1). Rng-free: a
// stamp is a fixed offset set; a paint is a deterministic in-place mutation of
// WorldMap.tiles. Placement itself still runs through the seeded kernel.

import { Tile, WALKABLE, WorldMap } from "../world/types";

// The SimCity stamp sizes: one click lays an N×N block of the selected kind.
export type BrushSize = 1 | 2 | 3;
export const BRUSH_SIZES: readonly BrushSize[] = [1, 2, 3];

// The block's tile offsets relative to the clicked tile. Odd sizes centre on
// it (1×1 = just it; 3×3 = a ring around it); the even 2×2 has no exact centre,
// so the clicked tile anchors the block's TOP-LEFT — span [0 .. size-1] back
// from -floor((size-1)/2). So: 1→{0}, 2→{0,1}, 3→{-1,0,1}.
export function stampOffsets(size: BrushSize): { dx: number; dy: number }[] {
  const lo = -Math.floor((size - 1) / 2) || 0; // avoid -0 (size 1/2: normalize to +0)
  const hi = Math.floor(size / 2);
  const out: { dx: number; dy: number }[] = [];
  for (let dy = lo; dy <= hi; dy++) for (let dx = lo; dx <= hi; dx++) out.push({ dx, dy });
  return out;
}

// The stamp's offsets landed on (tx, ty), with out-of-bounds cells DROPPED (not
// clamped) — a 3×3 at a corner simply lays the in-bounds subset, never a
// doubled edge cell. Offsets are distinct, so the result needs no dedup.
export function stampCells(tx: number, ty: number, size: BrushSize, map: WorldMap): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const { dx, dy } of stampOffsets(size)) {
    const x = tx + dx;
    const y = ty + dy;
    if (x >= 0 && y >= 0 && x < map.width && y < map.height) out.push({ x, y });
  }
  return out;
}

// Repaint the ground under `cells` to `tile`, in place — the biome brush. The
// SAME map.tiles array Flora and the Renderer already hold, so the mutation is
// seen live by both with no rebuild. Keeps the WorldMap valid: `tile` is always
// a real enum value (the caller only ever passes a Tile), and the spawn TILE
// itself is never painted non-walkable (a flood of DeepWater/Snow/Cliff spares
// just that one cell) — the literal guarantee stops there: nothing here checks
// that a walkable PATH from spawn to the rest of the construct still exists
// after the paint. Returns how many cells actually changed.
export function paintBiome(map: WorldMap, cells: { x: number; y: number }[], tile: Tile): number {
  const spawnKey = map.spawn.y * map.width + map.spawn.x;
  const tileWalkable = WALKABLE.has(tile);
  let changed = 0;
  for (const { x, y } of cells) {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    const key = y * map.width + x;
    if (key === spawnKey && !tileWalkable) continue; // never strand the spawn
    if (map.tiles[key] !== tile) {
      map.tiles[key] = tile;
      changed++;
    }
  }
  return changed;
}
