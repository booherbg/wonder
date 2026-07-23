// Starter canvases for the Simulator — small REAL-tile worlds (no void tile),
// the blank-meadow replacement. The playable island reuses the true generator;
// the sampler and single-biome are hand-filled and deterministic. The biome
// brush (deferred) will repaint any of these tiles later; slice 1 places onto
// them as-is, which is why the sampler carries every headline biome at once.

import { DEFAULT_CONFIG, WorldConfig } from "./config";
import { generate } from "./generate";
import { Tile, WorldMap } from "./types";

export type StarterKind = "playable-island" | "biome-sampler" | "single-biome";

// A blank real-tile map: one biome everywhere, a flat elevation field, no
// rivers/features, spawn at the centre. Enough of a WorldMap for Flora (tiles +
// dims) and critters (isWalkable reads tiles).
function blankMap(w: number, h: number, seed: number, fill: Tile): WorldMap {
  const tiles = new Uint8Array(w * h);
  tiles.fill(fill);
  const elevation = new Float32Array(w * h);
  elevation.fill(0.5);
  return {
    width: w,
    height: h,
    seed,
    tiles,
    elevation,
    rivers: [],
    spawn: { x: Math.floor(w / 2), y: Math.floor(h / 2) },
  };
}

// One biome fills the map — the near-empty "blank" canvas for studying one
// habitat's web in isolation. Grass by default (walkable, so critters den and
// roam); a caller may pick another.
export function singleBiome(seed: number, tile: Tile = Tile.Grass, size = 48): WorldMap {
  return blankMap(size, size, seed, tile);
}

// The major biomes as clean horizontal bands + a Rock/Highland corner, so you
// can drop any kind onto legal ground and test cross-biome interactions in one
// screen. Deterministic (no rng). Spawn sits on the grass band.
export function biomeSampler(seed: number): WorldMap {
  const bands: Tile[] = [Tile.ShallowWater, Tile.Sand, Tile.Grass, Tile.Forest, Tile.Marsh];
  const bandH = 12;
  const w = 60;
  const h = bands.length * bandH;
  const m = blankMap(w, h, seed, Tile.Grass);
  for (let ty = 0; ty < h; ty++) {
    const band = bands[Math.min(bands.length - 1, Math.floor(ty / bandH))];
    for (let tx = 0; tx < w; tx++) m.tiles[ty * w + tx] = band;
  }
  // an upper-right high-ground corner: Highland turf over a Rock apron
  for (let ty = 0; ty < 10; ty++) {
    for (let tx = w - 12; tx < w; tx++) {
      m.tiles[ty * w + tx] = ty < 5 ? Tile.Highland : Tile.Rock;
    }
  }
  const grassBand = bands.indexOf(Tile.Grass);
  m.spawn = { x: Math.floor(w / 2), y: grassBand * bandH + Math.floor(bandH / 2) };
  return m;
}

// A small REAL island — the true generator at a modest size, so you begin with
// terrain, water and biomes to mess with immediately. The thresholds are
// loosened for the small map (the 300x300 defaults would reroll forever at this
// scale); tune them if generate() ever throws (the test guards a viable island).
export function playableIsland(seed: number): WorldMap {
  const config: WorldConfig = {
    ...DEFAULT_CONFIG,
    width: 80,
    height: 80,
    riverCount: 2,
    craterChance: 0,
    minLandFraction: 0.1,
    minWalkableRegion: 400,
  };
  return generate(seed, config);
}

export function buildConstruct(kind: StarterKind, seed: number): WorldMap {
  switch (kind) {
    case "playable-island":
      return playableIsland(seed);
    case "biome-sampler":
      return biomeSampler(seed);
    case "single-biome":
      return singleBiome(seed);
    default:
      // A malformed ?starter (or any future StarterKind this switch hasn't
      // caught up with) falls back to the sampler rather than returning
      // undefined and crashing new Flora(undefined, …) downstream.
      return biomeSampler(seed);
  }
}
