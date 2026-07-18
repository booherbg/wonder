export enum Tile {
  DeepWater = 0,
  ShallowWater = 1,
  Sand = 2,
  Grass = 3,
  Forest = 4,
  Rock = 5,
  Snow = 6,
  Marsh = 7, // wet lowland: river endings, moist shores
}

export interface River {
  path: number[]; // row-major tile indices, in flow order
  reachedSea: boolean; // false = ended in a local-minimum lake
}

export interface Pocket {
  x: number; // tile coords of the center
  y: number;
  radius: number; // tiles
  deep: boolean; // one island in five hides a single deep pocket: larger, stranger
}

export interface Waterfall {
  x: number; // tile of the upper lip
  y: number;
  dx: number; // unit step toward the lower tile (the flow direction)
  dy: number;
  drop: number; // elevation lost over the step
}

export interface WorldMap {
  width: number;
  height: number;
  seed: number; // the seed the user asked for (display / regeneration)
  tiles: Uint8Array; // Tile per cell, row-major
  elevation: Float32Array; // [0, 1), kept for shading/debugging/tweaks
  rivers: River[];
  spawn: { x: number; y: number }; // tile coordinates
  pockets?: Pocket[]; // rare hidden clearings where everything runs strange
  springs?: { x: number; y: number }[]; // warm pools steaming at the rock's edge
  falls?: Waterfall[]; // white water where steep islands' rivers drop hardest
}

export function pocketAt(map: WorldMap, tx: number, ty: number): Pocket | null {
  if (!map.pockets) return null;
  for (const p of map.pockets) {
    if ((tx - p.x) ** 2 + (ty - p.y) ** 2 <= p.radius * p.radius) return p;
  }
  return null;
}

export const WALKABLE: ReadonlySet<Tile> = new Set([
  Tile.ShallowWater,
  Tile.Sand,
  Tile.Grass,
  Tile.Forest,
  Tile.Marsh,
]);

export function tileAt(map: WorldMap, x: number, y: number): Tile {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return Tile.DeepWater;
  return map.tiles[y * map.width + x] as Tile;
}

export function isWalkable(map: WorldMap, x: number, y: number): boolean {
  return WALKABLE.has(tileAt(map, x, y));
}
