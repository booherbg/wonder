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
  riverCount: number; // springs attempted per island
  riverMinSpringElevation: number; // springs only above this elevation
  riverMaxSteps: number; // hard safety limit per river
  minLandFraction: number; // reroll islands with less land than this
  minWalkableRegion: number; // reroll if the largest walkable region is smaller (tiles)
  maxGenerationAttempts: number; // deterministic rerolls (seed+1, seed+2, ...)
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
  riverCount: 7,
  riverMinSpringElevation: 0.55,
  riverMaxSteps: 4000,
  minLandFraction: 0.12,
  minWalkableRegion: 3000,
  maxGenerationAttempts: 16,
};
