import { hash2d } from "../core/rng";
import { Tile, WorldMap } from "../world/types";

// The sea breathes on its own clock, deliberately out of step with the sun
// (610s against the 440s day) so low water pairs with a different hour each
// day. tideAt runs 0 (full sea) .. 1 (the sea drawn all the way back).

export const TIDE_CYCLE_MS = 610_000;
export const TIDE_LOW = 0.7; // beyond this the flats stand exposed, pools and all

export function tideAt(nowMs: number): number {
  const t = ((nowMs % TIDE_CYCLE_MS) + TIDE_CYCLE_MS) % TIDE_CYCLE_MS;
  return 0.5 - 0.5 * Math.cos((t / TIDE_CYCLE_MS) * Math.PI * 2);
}

// How much of the flat shows: 0 under full sea, 1 at dead low water.
export function exposureAt(tide: number): number {
  return Math.min(1, Math.max(0, (tide - 0.55) / 0.35));
}

export type PoolDweller = "star" | "anemone" | "urchin";

export interface TidePool {
  x: number; // tile coords: shallow water beside sand, bared at low tide
  y: number;
  dweller: PoolDweller;
  hue: number; // 0..1, the dweller's own tint
}

const DWELLERS: PoolDweller[] = ["star", "anemone", "urchin"];

// What the sea forgets when it leaves: deterministic per seed, seated in
// the shallow band where water touches sand.
export function placeTidePools(map: WorldMap, seed: number): TidePool[] {
  const out: TidePool[] = [];
  for (let y = 1; y < map.height - 1; y++) {
    for (let x = 1; x < map.width - 1; x++) {
      if (map.tiles[y * map.width + x] !== Tile.ShallowWater) continue;
      const sides = [
        map.tiles[y * map.width + x + 1],
        map.tiles[y * map.width + x - 1],
        map.tiles[(y + 1) * map.width + x],
        map.tiles[(y - 1) * map.width + x],
      ];
      if (!sides.some((t) => t === Tile.Sand)) continue;
      if (hash2d(x, y, seed ^ 0x71de5) >= 0.06) continue;
      const roll = hash2d(y, x, seed ^ 0x5ea1);
      out.push({
        x,
        y,
        dweller: DWELLERS[Math.floor(roll * DWELLERS.length) % DWELLERS.length],
        hue: hash2d(x * 3 + 1, y * 5 + 2, seed ^ 0x0cea),
      });
    }
  }
  return out;
}
