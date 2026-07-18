import { fbm } from "../core/noise";
import { makeRng } from "../core/rng";
import { DEFAULT_CONFIG, WorldConfig } from "./config";
import { River, Tile, WALKABLE, WorldMap } from "./types";

const NEIGHBORS4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// fBm elevation shaped by radial falloff: guaranteed sea at the edges,
// highlands only possible inland. The falloff center and steepness are
// jittered per seed so islands come out lopsided, stretched, or compact —
// no two silhouettes alike.
export function buildElevation(seed: number, cfg: WorldConfig): Float32Array {
  const { width, height } = cfg;
  const shapeRng = makeRng(seed ^ 0x15a4d);
  const cx = (shapeRng() - 0.5) * 0.3; // island center drifts up to ±15%
  const cy = (shapeRng() - 0.5) * 0.3;
  const scale = cfg.elevationScale * (0.8 + shapeRng() * 0.4);
  const sharpness = cfg.falloffSharpness * (0.8 + shapeRng() * 0.4);
  const BORDER_MARGIN = 12; // tiles over which land is forced down to sea at map edges
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (2 * x) / (width - 1) - 1 - cx;
      const ny = (2 * y) / (height - 1) - 1 - cy;
      const d = Math.sqrt(nx * nx + ny * ny);
      const falloff = Math.max(0, 1 - Math.pow(d, sharpness));
      const border = Math.min(x, y, width - 1 - x, height - 1 - y);
      const borderFalloff = Math.min(1, border / BORDER_MARGIN);
      const raw = fbm(x / scale, y / scale, seed, cfg.elevationOctaves);
      out[y * width + x] = raw * falloff * borderFalloff;
    }
  }
  return out;
}

export function classify(e: number, m: number, cfg: WorldConfig): Tile {
  if (e < cfg.seaLevel) return Tile.DeepWater;
  if (e < cfg.shoreLevel) return Tile.ShallowWater;
  if (e < cfg.beachLevel + 0.04 && m >= cfg.marshMoisture) return Tile.Marsh; // wet lowland
  if (e < cfg.beachLevel) return Tile.Sand;
  if (e >= cfg.snowLevel) return Tile.Snow;
  if (e >= cfg.rockLevel) return Tile.Rock;
  return m >= cfg.forestMoisture ? Tile.Forest : Tile.Grass;
}

export function classifyTiles(elevation: Float32Array, seed: number, cfg: WorldConfig): Uint8Array {
  const { width, height } = cfg;
  const tiles = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const m = fbm(x / cfg.moistureScale, y / cfg.moistureScale, seed + 7777, cfg.moistureOctaves);
      tiles[i] = classify(elevation[i], m, cfg);
    }
  }
  return tiles;
}

// Walks steepest-descent from `start`, carving ShallowWater, until it hits the
// sea or a local minimum (a lake). Strictly-decreasing elevation => no cycles.
export function traceRiver(
  elevation: Float32Array,
  tiles: Uint8Array,
  start: number,
  cfg: WorldConfig,
): River {
  const { width, height } = cfg;
  const path: number[] = [];
  let i = start;
  let reachedSea = false;
  for (let step = 0; step < cfg.riverMaxSteps; step++) {
    if (tiles[i] === Tile.DeepWater) {
      reachedSea = true;
      break;
    }
    tiles[i] = Tile.ShallowWater;
    path.push(i);
    const x = i % width;
    const y = (i / width) | 0;
    let next = -1;
    let lowest = elevation[i];
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (elevation[j] < lowest) {
        lowest = elevation[j];
        next = j;
      }
    }
    if (next === -1) {
      carvePond(tiles, i, cfg); // local minimum: open the end into a small pond
      break;
    }
    i = next;
  }
  return { path, reachedSea };
}

// A river that dies inland pools into a little pond ringed with marsh.
function carvePond(tiles: Uint8Array, center: number, cfg: WorldConfig): void {
  const { width, height } = cfg;
  const x = center % width;
  const y = (center / width) | 0;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (tiles[j] === Tile.DeepWater) continue;
      const ring = Math.max(Math.abs(dx), Math.abs(dy)) === 2;
      if (ring) {
        if (tiles[j] !== Tile.ShallowWater) tiles[j] = Tile.Marsh;
      } else {
        tiles[j] = Tile.ShallowWater;
      }
    }
  }
}

export function carveRivers(
  elevation: Float32Array,
  tiles: Uint8Array,
  seed: number,
  cfg: WorldConfig,
): River[] {
  const springs: number[] = [];
  for (let i = 0; i < elevation.length; i++) {
    if (elevation[i] >= cfg.riverMinSpringElevation) springs.push(i);
  }
  const rivers: River[] = [];
  if (springs.length === 0) return rivers;
  const rng = makeRng(seed ^ 0x51ab7e);
  for (let r = 0; r < cfg.riverCount; r++) {
    const start = springs[Math.floor(rng() * springs.length)];
    const river = traceRiver(elevation, tiles, start, cfg);
    if (river.path.length > 0) rivers.push(river);
  }
  return rivers;
}

export function generate(seed: number, config: WorldConfig = DEFAULT_CONFIG): WorldMap {
  for (let attempt = 0; attempt < config.maxGenerationAttempts; attempt++) {
    const map = tryGenerate(seed, seed + attempt, config);
    if (map) return map;
  }
  throw new Error(
    `no viable island within ${config.maxGenerationAttempts} attempts of seed ${seed}`,
  );
}

function tryGenerate(displaySeed: number, genSeed: number, cfg: WorldConfig): WorldMap | null {
  const { width, height } = cfg;
  const elevation = buildElevation(genSeed, cfg);
  const tiles = classifyTiles(elevation, genSeed, cfg);
  const rivers = carveRivers(elevation, tiles, genSeed, cfg);

  let land = 0;
  for (const t of tiles) {
    if (t !== Tile.DeepWater && t !== Tile.ShallowWater) land++;
  }
  if (land / tiles.length < cfg.minLandFraction) return null;

  const spawn = findSpawn(tiles, elevation, cfg);
  if (!spawn) return null;

  return { width, height, seed: displaySeed, tiles, elevation, rivers, spawn };
}

// Largest connected walkable region, then its lowest-elevation grass tile —
// low ground on the big landmass means "a meadow near the coast".
function findSpawn(
  tiles: Uint8Array,
  elevation: Float32Array,
  cfg: WorldConfig,
): { x: number; y: number } | null {
  const { width, height } = cfg;
  const labels = new Int32Array(tiles.length).fill(-1);
  let bestLabel = -1;
  let bestSize = 0;
  let label = 0;
  const stack: number[] = [];
  for (let i = 0; i < tiles.length; i++) {
    if (labels[i] !== -1 || !WALKABLE.has(tiles[i] as Tile)) continue;
    let size = 0;
    labels[i] = label;
    stack.push(i);
    while (stack.length > 0) {
      const j = stack.pop()!;
      size++;
      const x = j % width;
      const y = (j / width) | 0;
      for (const [dx, dy] of NEIGHBORS4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const k = ny * width + nx;
        if (labels[k] === -1 && WALKABLE.has(tiles[k] as Tile)) {
          labels[k] = label;
          stack.push(k);
        }
      }
    }
    if (size > bestSize) {
      bestSize = size;
      bestLabel = label;
    }
    label++;
  }
  if (bestLabel === -1 || bestSize < cfg.minWalkableRegion) return null;

  let best = -1;
  for (let i = 0; i < tiles.length; i++) {
    if (labels[i] === bestLabel && tiles[i] === Tile.Grass) {
      if (best === -1 || elevation[i] < elevation[best]) best = i;
    }
  }
  if (best === -1) return null;
  return { x: best % width, y: (best / width) | 0 };
}
