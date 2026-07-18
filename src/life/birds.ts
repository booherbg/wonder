import { Rng, hash2d, makeRng } from "../core/rng";
import { TILE_SIZE } from "../world/config";
import { WorldMap, isWalkable } from "../world/types";

// Small flocks that wheel over the island, settle to feed, and flush into
// the air when the wanderer walks in among them. They roost after dark.
export interface BirdSpecies {
  id: number;
  hue: number;
  flockSize: number;
  wingRate: number; // wingbeats per second
}

export type FlockState = "flying" | "settling" | "perched";

export interface Flock {
  species: BirdSpecies;
  state: FlockState;
  x: number; // anchor, world px
  y: number;
  targetX: number;
  targetY: number;
  alt: number; // 0 grounded .. 1 cruising
  stateTime: number;
  startled: boolean; // set on player-caused takeoff; main reads and clears
  offsets: { a: number; r: number; px: number; py: number }[]; // orbit + perch spread
}

const FLY_SPEED = 55;
const STARTLE_RADIUS = 2.5 * TILE_SIZE;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi));
}

function randomLandTile(rng: Rng, map: WorldMap): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 120; attempt++) {
    const x = Math.floor(rng() * map.width);
    const y = Math.floor(rng() * map.height);
    if (isWalkable(map, x, y)) return { x, y };
  }
  return null;
}

export function generateFlocks(seed: number, map: WorldMap): Flock[] {
  const rng = makeRng(Math.floor(hash2d(seed, 91, 0xb12d5) * 0xffffffff));
  const count = 1 + (rng() < 0.5 ? 1 : 0);
  const flocks: Flock[] = [];
  for (let i = 0; i < count; i++) {
    const size = 3 + Math.floor(rng() * 4);
    const home = randomLandTile(rng, map) ?? map.spawn;
    const away = randomLandTile(rng, map) ?? home;
    flocks.push({
      species: { id: i, hue: rng(), flockSize: size, wingRate: 9 + rng() * 5 },
      state: "flying",
      x: (home.x + 0.5) * TILE_SIZE,
      y: (home.y + 0.5) * TILE_SIZE,
      targetX: (away.x + 0.5) * TILE_SIZE,
      targetY: (away.y + 0.5) * TILE_SIZE,
      alt: 1,
      stateTime: 0,
      startled: false,
      offsets: Array.from({ length: size }, () => ({
        a: rng() * 6.28,
        r: 8 + rng() * 14,
        px: (rng() - 0.5) * 24,
        py: (rng() - 0.5) * 12,
      })),
    });
  }
  return flocks;
}

export function updateFlock(
  f: Flock,
  dt: number,
  map: WorldMap,
  player: { x: number; y: number } | null,
  darkness: number,
  rng: Rng,
): void {
  f.stateTime += dt;

  if (f.state === "perched") {
    if (player && Math.hypot(player.x - f.x, player.y - f.y) < STARTLE_RADIUS) {
      f.state = "flying";
      f.startled = true;
      f.stateTime = 0;
      const ang = Math.atan2(f.y - player.y, f.x - player.x) + (rng() - 0.5);
      f.targetX = clamp(f.x + Math.cos(ang) * 180, 16, map.width * TILE_SIZE - 16);
      f.targetY = clamp(f.y + Math.sin(ang) * 180, 16, map.height * TILE_SIZE - 16);
      return;
    }
    // roost through the night; by day, move on after a while
    if (darkness < 0.4 && f.stateTime > 8 + rng() * 12) {
      f.state = "flying";
      f.stateTime = 0;
      const next = randomLandTile(rng, map);
      if (next) {
        f.targetX = (next.x + 0.5) * TILE_SIZE;
        f.targetY = (next.y + 0.5) * TILE_SIZE;
      }
    }
    return;
  }

  if (f.state === "flying") {
    f.alt = Math.min(1, f.alt + dt * 1.5);
    const dx = f.targetX - f.x;
    const dy = f.targetY - f.y;
    const d = Math.hypot(dx, dy);
    if (d < 8) {
      if (darkness > 0.4 || rng() < 0.5) {
        f.state = "settling";
        f.stateTime = 0;
      } else {
        const next = randomLandTile(rng, map);
        if (next) {
          f.targetX = (next.x + 0.5) * TILE_SIZE;
          f.targetY = (next.y + 0.5) * TILE_SIZE;
        }
      }
    } else {
      f.x += (dx / d) * FLY_SPEED * dt;
      f.y += (dy / d) * FLY_SPEED * dt;
    }
    return;
  }

  // settling
  f.alt = Math.max(0, f.alt - dt * 0.8);
  if (f.alt === 0) {
    f.state = "perched";
    f.stateTime = 0;
  }
}
