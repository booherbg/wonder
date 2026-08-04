import { Tile } from "./types";

export const TILE_SIZE = 16; // pixels per tile (art + collision + camera all use this)

export interface WorldConfig {
  width: number; // map size in tiles
  height: number;
  elevationScale: number; // larger = broader landforms
  elevationOctaves: number; // more = more detail
  moistureScale: number;
  moistureOctaves: number;
  falloffSharpness: number; // higher = flatter interior, steeper drop to sea
  seaLevel: number; // elevation below this: deep water
  shoreLevel: number; // below this: shallow water
  beachLevel: number; // below this: sand
  rockLevel: number; // at/above this: bare rock (impassable)
  snowLevel: number; // at/above this: snow cap (impassable)
  forestMoisture: number; // moisture at/above this turns grass to forest
  marshMoisture: number; // low wet land at/above this moisture becomes marsh
  riverCount: number; // springs attempted per island
  riverMinSpringElevation: number; // springs only above this elevation
  riverMaxSteps: number; // hard safety limit per river
  fallMinDrop: number; // river steps losing at least this much elevation become waterfalls
  fallMaxCount: number; // steepest few only; gentle islands get none
  fallMinSpacing: number; // tiles between falls
  craterChance: number; // rarely, the island's heart is water: a caldera lake
  minLandFraction: number; // reroll islands with less land than this
  minWalkableRegion: number; // reroll if the largest walkable region is smaller (tiles)
  maxGenerationAttempts: number; // deterministic rerolls (seed+1, seed+2, ...)
  /** Tiles the wanderer may start on. Omitted ⇒ [Tile.Grass], which is what
   *  every island generated before the Hollow used. */
  spawnTiles?: readonly Tile[];
}

export const DEFAULT_CONFIG: WorldConfig = {
  width: 300,
  height: 300,
  elevationScale: 90,
  elevationOctaves: 5,
  moistureScale: 70,
  moistureOctaves: 4,
  falloffSharpness: 2.5,
  seaLevel: 0.3,
  shoreLevel: 0.34,
  beachLevel: 0.38,
  rockLevel: 0.58,
  snowLevel: 0.68,
  forestMoisture: 0.55,
  marshMoisture: 0.62,
  riverCount: 7,
  riverMinSpringElevation: 0.55,
  riverMaxSteps: 4000,
  fallMinDrop: 0.013, // measured: steep islands peak ~0.02, gentle ones ~0.011
  fallMaxCount: 3,
  fallMinSpacing: 10,
  craterChance: 0.15,
  minLandFraction: 0.12,
  minWalkableRegion: 3000,
  maxGenerationAttempts: 16,
};

/** Which island the forge builds. "classic" is every island shipped before the Hollow. */
export type IslandStyle = "classic" | "hollow";

// The Hollow: small, dense, enclosed. Enclosure comes from not being able to
// see far, which is a zoom and occlusion question rather than a camera one —
// the config's part is a smaller island with most of its land under forest.
export const HOLLOW_CONFIG: WorldConfig = {
  ...DEFAULT_CONFIG,
  width: 140,
  height: 140,
  elevationScale: 44, // broader landforms would flatten a map this size
  falloffSharpness: 2.0, // a softer rim: more interior, less beach
  forestMoisture: 0.34, // most of the land is forest, not meadow
  marshMoisture: 0.58,
  riverCount: 3,
  fallMaxCount: 1,
  craterChance: 0, // the Hollow's shape is a bowl of trees, not a caldera
  // scaled from 3000 by the ~4.6x drop in tile count: 700/19600 (3.6%) tracks
  // classic's 3000/90000 (3.3%). Measured across 25 seeds (1-25): accepted
  // islands' largest walkable region was min 3853 / median 6538 / max 9142 —
  // this gate never fired. That is expected of a fragmentation floor on
  // healthy islands; do not raise it toward the observed minimum, or it
  // starts rejecting good islands for no reason.
  minWalkableRegion: 700,
  // A mostly-forested island has little grass; without this the wanderer
  // could not spawn under the Hollow's own canopy.
  spawnTiles: [Tile.Grass, Tile.Forest],
};

export function configForStyle(style: IslandStyle): WorldConfig {
  return style === "hollow" ? HOLLOW_CONFIG : DEFAULT_CONFIG;
}
