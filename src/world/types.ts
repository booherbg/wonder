export enum Tile {
  DeepWater = 0,
  ShallowWater = 1,
  Sand = 2,
  Grass = 3,
  Forest = 4,
  Rock = 5,
  Snow = 6,
}

export interface River {
  path: number[]; // row-major tile indices, in flow order
  reachedSea: boolean; // false = ended in a local-minimum lake
}

export interface WorldMap {
  width: number;
  height: number;
  seed: number; // the seed the user asked for (display / regeneration)
  tiles: Uint8Array; // Tile per cell, row-major
  elevation: Float32Array; // [0, 1), kept for shading/debugging/tweaks
  rivers: River[];
  spawn: { x: number; y: number }; // tile coordinates
}

export const WALKABLE: ReadonlySet<Tile> = new Set([
  Tile.ShallowWater,
  Tile.Sand,
  Tile.Grass,
  Tile.Forest,
]);

export function tileAt(map: WorldMap, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return Tile.DeepWater;
  return map.tiles[y * map.width + x] as Tile;
}

export function isWalkable(map: WorldMap, x: number, y: number): boolean {
  return WALKABLE.has(tileAt(map, x, y));
}
