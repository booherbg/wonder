import { fbm } from "../core/noise";
import { hash2d, makeRng } from "../core/rng";
import { DEFAULT_CONFIG, WorldConfig } from "./config";
import { Pocket, River, Tile, WALKABLE, WorldMap } from "./types";

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
      widenMouth(tiles, path, cfg); // rivers spread into deltas as they meet the sea
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

// The last stretch before the sea spreads sideways into an estuary.
function widenMouth(tiles: Uint8Array, path: number[], cfg: WorldConfig): void {
  const { width, height } = cfg;
  for (let k = Math.max(0, path.length - 5); k < path.length; k++) {
    const x = path[k] % width;
    const y = (path[k] / width) | 0;
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (tiles[j] !== Tile.DeepWater) tiles[j] = Tile.ShallowWater;
    }
  }
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

  const pockets = placePockets(tiles, spawn, genSeed, cfg);
  const springs = placeSprings(tiles, genSeed, cfg);
  return { width, height, seed: displaySeed, tiles, elevation, rivers, spawn, pockets, springs };
}

// Where the rock meets walkable ground, some islands keep a warm pool —
// a spring carved into the mountain's edge with a bare stone apron.
function placeSprings(tiles: Uint8Array, seed: number, cfg: WorldConfig): { x: number; y: number }[] {
  const rng = makeRng(Math.floor(hash2d(seed, 55, 0x5b1a9) * 0xffffffff));
  const roll = rng();
  const count = roll < 0.55 ? 1 : roll < 0.75 ? 2 : 0;
  if (count === 0) return [];
  const { width, height } = cfg;
  const candidates: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (tiles[y * width + x] !== Tile.Rock) continue;
      let touchesPath = false;
      for (let dy = -1; dy <= 1 && !touchesPath; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (WALKABLE.has(tiles[(y + dy) * width + (x + dx)] as Tile)) {
            touchesPath = true;
            break;
          }
        }
      }
      if (touchesPath) candidates.push(y * width + x);
    }
  }
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count * 4 && out.length < count && candidates.length > 0; i++) {
    const idx = candidates[Math.floor(rng() * candidates.length)];
    const x = idx % width;
    const y = (idx / width) | 0;
    if (out.some((s) => Math.hypot(s.x - x, s.y - y) < 12)) continue;
    tiles[idx] = Tile.ShallowWater; // the warm pool itself
    for (const [dx, dy] of NEIGHBORS4) {
      const j = (y + dy) * width + (x + dx);
      if (tiles[j] === Tile.Rock) tiles[j] = Tile.Sand; // bare warm apron
    }
    out.push({ x, y });
  }
  return out;
}

// Most islands hide one small clearing (sometimes two, sometimes none)
// where everything runs strange. Far from spawn: they must be found.
function placePockets(
  tiles: Uint8Array,
  spawn: { x: number; y: number },
  seed: number,
  cfg: WorldConfig,
): Pocket[] {
  // mulberry32's first draws correlate across related seeds; hash first so
  // the has-a-pocket decision is genuinely independent per island
  const rng = makeRng(Math.floor(hash2d(seed, 77, 0x90c4e7) * 0xffffffff));
  const roll = rng();
  // every island holds at least one strangeness: usually one pocket,
  // sometimes two — and one island in five hides a single DEEP pocket,
  // larger and stranger, instead
  const deep = roll < 0.2;
  const count = deep ? 1 : roll < 0.8 ? 1 : 2;
  const out: Pocket[] = [];
  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < 120; attempt++) {
      const x = 15 + Math.floor(rng() * (cfg.width - 30));
      const y = 15 + Math.floor(rng() * (cfg.height - 30));
      const t = tiles[y * cfg.width + x];
      if (t !== Tile.Grass && t !== Tile.Forest) continue;
      if (Math.hypot(x - spawn.x, y - spawn.y) < 25) continue;
      if (out.some((p) => Math.hypot(x - p.x, y - p.y) < 20)) continue;
      out.push({ x, y, radius: deep ? 4 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2), deep });
      break;
    }
  }
  return out;
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
