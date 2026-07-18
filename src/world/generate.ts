import { fbm } from "../core/noise";
import { hash2d, makeRng } from "../core/rng";
import { DEFAULT_CONFIG, WorldConfig } from "./config";
import { Crater, Pocket, River, Tile, WALKABLE, Waterfall, WorldMap } from "./types";

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
  const carved = placeCrater(elevation, tiles, genSeed, cfg);
  const rivers = carveRivers(elevation, tiles, genSeed, cfg);
  if (carved?.outflow && carved.outflow.path.length > 0) rivers.push(carved.outflow);
  const confluences = placeConfluences(elevation, tiles, rivers, cfg);

  let land = 0;
  for (const t of tiles) {
    if (t !== Tile.DeepWater && t !== Tile.ShallowWater) land++;
  }
  if (land / tiles.length < cfg.minLandFraction) return null;

  const spawn = findSpawn(tiles, elevation, cfg);
  if (!spawn) return null;

  const pockets = placePockets(tiles, spawn, genSeed, cfg);
  const springs = placeSprings(tiles, genSeed, cfg);
  const falls = placeFalls(elevation, rivers, cfg);
  return {
    width, height, seed: displaySeed, tiles, elevation, rivers, spawn,
    pockets, springs, falls, crater: carved?.crater, confluences,
  };
}

// Where two rivers meet, the water opens: steepest-descent rivers that touch
// share their whole downstream tail, so each river's first shared tile is a
// true meeting. Inland meetings widen into a pond ringed with marsh.
export function placeConfluences(
  elevation: Float32Array,
  tiles: Uint8Array,
  rivers: River[],
  cfg: WorldConfig,
): { x: number; y: number }[] {
  const MAX_POOLS = 4;
  const owner = new Map<number, number>(); // tile -> index of first river through it
  const out: { x: number; y: number }[] = [];
  for (let r = 0; r < rivers.length; r++) {
    const path = rivers[r].path;
    for (let k = 0; k < path.length; k++) {
      const t = path[k];
      const prev = owner.get(t);
      if (prev === undefined) {
        owner.set(t, r);
        continue;
      }
      if (prev === r) continue;
      // r has met an earlier river; k >= 1 keeps duplicate springs honest,
      // and the elevation floor keeps sea-delta merges from counting
      if (k >= 1 && elevation[t] >= cfg.beachLevel && out.length < MAX_POOLS) {
        const x = t % cfg.width;
        const y = (t / cfg.width) | 0;
        if (!out.some((c) => Math.hypot(c.x - x, c.y - y) < 6)) out.push({ x, y });
      }
      break; // downstream of here the paths are identical
    }
  }
  for (const c of out) carvePond(tiles, c.y * cfg.width + c.x, cfg);
  return out;
}

// Rarely, the island's heart is water: a caldera at the highest peak — a
// deep dark pupil, a shallow iris, a sand inner shore, a rock rim — pierced
// once where the land outside falls away, the cut flowing on as a river.
export function placeCrater(
  elevation: Float32Array,
  tiles: Uint8Array,
  seed: number,
  cfg: WorldConfig,
): { crater: Crater; outflow: River } | null {
  const rng = makeRng(Math.floor(hash2d(seed, 33, 0xc7a7e7) * 0xffffffff));
  if (rng() >= cfg.craterChance) return null;
  const { width, height } = cfg;
  const MARGIN = 24;
  let peak = -1;
  for (let y = MARGIN; y < height - MARGIN; y++) {
    for (let x = MARGIN; x < width - MARGIN; x++) {
      const i = y * width + x;
      if (peak === -1 || elevation[i] > elevation[peak]) peak = i;
    }
  }
  if (peak === -1 || elevation[peak] < cfg.rockLevel) return null; // no true mountain heart
  const cx = peak % width;
  const cy = (peak / width) | 0;
  const lakeR = 4 + Math.floor(rng() * 3); // 4-6
  const rimR = lakeR + 2;
  for (let dy = -rimR; dy <= rimR; dy++) {
    for (let dx = -rimR; dx <= rimR; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > rimR) continue;
      const j = (cy + dy) * width + (cx + dx);
      if (d <= lakeR - 3) tiles[j] = Tile.DeepWater; // the pupil
      else if (d <= lakeR - 1) tiles[j] = Tile.ShallowWater; // the iris
      else if (d <= lakeR) tiles[j] = Tile.Sand; // the inner shore
      else tiles[j] = Tile.Rock; // the rim
    }
  }
  // the one cut: prefer the angle whose water provably runs to the sea,
  // trying the lowest land outside the rim first
  const mouthAt = (a: number) =>
    Math.round(cy + Math.sin(a) * (rimR + 2)) * width +
    Math.round(cx + Math.cos(a) * (rimR + 2));
  const angles: { a: number; e: number }[] = [];
  for (let k = 0; k < 32; k++) {
    const a = (k / 32) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * (rimR + 2));
    const y = Math.round(cy + Math.sin(a) * (rimR + 2));
    if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
    angles.push({ a, e: elevation[y * width + x] });
  }
  angles.sort((p, q) => p.e - q.e);
  let bestA = angles[0]?.a ?? 0;
  for (const cand of angles) {
    if (descentReachesSea(elevation, tiles, mouthAt(cand.a), cfg)) {
      bestA = cand.a;
      break;
    }
  }
  // supercover carve: half-steps plus elbow cells keep the channel
  // 4-connected the whole way from the iris to the river mouth
  let prevX = -1;
  let prevY = -1;
  for (let r = lakeR - 1; r <= rimR + 2; r += 0.5) {
    const x = Math.round(cx + Math.cos(bestA) * r);
    const y = Math.round(cy + Math.sin(bestA) * r);
    if (x === prevX && y === prevY) continue;
    if (prevX !== -1 && x !== prevX && y !== prevY) {
      tiles[prevY * width + x] = Tile.ShallowWater; // the elbow of a diagonal step
    }
    tiles[y * width + x] = Tile.ShallowWater;
    prevX = x;
    prevY = y;
  }
  const outflow = traceRiver(elevation, tiles, mouthAt(bestA), cfg);
  return { crater: { x: cx, y: cy, lakeRadius: lakeR, rimRadius: rimR }, outflow };
}

// A dry run of traceRiver's steepest-descent walk: would water released
// here reach the sea? No tiles are touched.
function descentReachesSea(
  elevation: Float32Array,
  tiles: Uint8Array,
  start: number,
  cfg: WorldConfig,
): boolean {
  const { width, height } = cfg;
  let i = start;
  for (let step = 0; step < cfg.riverMaxSteps; step++) {
    if (tiles[i] === Tile.DeepWater) return true;
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
    if (next === -1) return false;
    i = next;
  }
  return false;
}

// Where a river loses the most height in a single step, the water shows it:
// a waterfall. Only steep islands clear the bar — gentle ones have none,
// so white water is a thing an island can be known for.
export function placeFalls(
  elevation: Float32Array,
  rivers: River[],
  cfg: WorldConfig,
): Waterfall[] {
  const { width } = cfg;
  const seen = new Set<number>();
  const candidates: Waterfall[] = [];
  for (const r of rivers) {
    for (let k = 0; k + 1 < r.path.length; k++) {
      const i = r.path[k];
      const j = r.path[k + 1];
      const drop = elevation[i] - elevation[j];
      if (drop < cfg.fallMinDrop || seen.has(i)) continue;
      seen.add(i);
      candidates.push({
        x: i % width,
        y: (i / width) | 0,
        dx: (j % width) - (i % width),
        dy: ((j / width) | 0) - ((i / width) | 0),
        drop,
      });
    }
  }
  candidates.sort((a, b) => b.drop - a.drop);
  const out: Waterfall[] = [];
  for (const c of candidates) {
    if (out.length >= cfg.fallMaxCount) break;
    if (out.some((f) => Math.hypot(f.x - c.x, f.y - c.y) < cfg.fallMinSpacing)) continue;
    out.push(c);
  }
  return out;
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
