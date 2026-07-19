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

// Island shapes: the falloff mask that decides an island's whole silhouette.
// Rolled per seed so no run of islands feels like the same mountain again.
export type IslandShape = "highland" | "twin" | "ridge" | "lowland" | "crescent" | "skerries";

export const SHAPES: readonly IslandShape[] = [
  "highland", "twin", "ridge", "lowland", "crescent", "skerries",
];

export const SHAPE_PHRASE: Record<IslandShape, string> = {
  highland: "a highland isle",
  twin: "a twin-peaked isle",
  ridge: "a long ridge of an isle",
  lowland: "a lowland weald",
  crescent: "a crescent isle",
  skerries: "a scatter of skerries",
};

export function rollShape(seed: number): IslandShape {
  const r = hash2d(seed, 21, 0x54a9e);
  if (r < 0.28) return "highland";
  if (r < 0.44) return "twin";
  if (r < 0.58) return "ridge";
  if (r < 0.78) return "lowland";
  if (r < 0.88) return "crescent";
  return "skerries";
}

// Island relief: the geology under the silhouette. Where shape decides the
// coastline, relief decides what the climb feels like — smooth shoulders,
// stepped terraces, a flat-crowned mesa, gorge-cut country, serried crags.
export type IslandRelief = "rolling" | "terraced" | "mesa" | "gorges" | "crags";

export const RELIEFS: readonly IslandRelief[] = [
  "rolling", "terraced", "mesa", "gorges", "crags",
];

export const RELIEF_PHRASE: Record<IslandRelief, string> = {
  rolling: "rolling open country",
  terraced: "ground stepped in old terraces",
  mesa: "a flat-crowned tableland",
  gorges: "country cut by gorges",
  crags: "a serried crag-land",
};

export function rollRelief(seed: number): IslandRelief {
  const r = hash2d(seed, 13, 0xbbca);
  if (r < 0.4) return "rolling";
  if (r < 0.56) return "terraced";
  if (r < 0.7) return "mesa";
  if (r < 0.85) return "gorges";
  return "crags";
}

// How steep a tile face must be (elevation lost to a 4-neighbor) before the
// ground breaks into a sheer cliff. Above the steepest natural slopes, so
// cliffs mark sculpted country: terrace risers, mesa rims, gorge walls.
const CLIFF_SLOPE = 0.038;
const CLIFF_FLOOR_ABOVE_BEACH = 0.02; // no cliffs down on the flats
const SCREE_BAND = 0.035; // talus apron thickness beneath the bare rock
const HIGHLAND_BAND = 0.05; // open turf band beneath the scree — the treeline

// fBm elevation shaped by the island's rolled silhouette: guaranteed sea at
// the edges, highlands only possible inland. Center, steepness, orientation,
// and separation all jitter per seed — no two silhouettes alike. The rolled
// relief then sculpts the field: every transform keeps the sea at the sea
// and leaves the borders at zero, so the worldgen promises all still hold.
export function buildElevation(
  seed: number,
  cfg: WorldConfig,
  shape: IslandShape = rollShape(seed),
  relief: IslandRelief = rollRelief(seed),
): Float32Array {
  const { width, height } = cfg;
  const shapeRng = makeRng(seed ^ 0x15a4d);
  const cx = (shapeRng() - 0.5) * 0.3; // island center drifts up to ±15%
  const cy = (shapeRng() - 0.5) * 0.3;
  const scale = cfg.elevationScale * (0.8 + shapeRng() * 0.4);
  const sharpness = cfg.falloffSharpness * (0.8 + shapeRng() * 0.4);
  const theta = shapeRng() * Math.PI; // orientation for twin / ridge / crescent
  const off = 0.24 + shapeRng() * 0.14; // twin separation, crescent bite reach
  const stretch = 1.9 + shapeRng() * 0.8; // ridge elongation
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);
  const BORDER_MARGIN = 12; // tiles over which land is forced down to sea at map edges
  const radial = (dx: number, dy: number, sh: number) => {
    const d = Math.sqrt(dx * dx + dy * dy);
    return Math.max(0, 1 - Math.pow(d, sh));
  };
  // pass one: the base field, kept in doubles so the relief pass introduces
  // no extra rounding on islands whose relief leaves them untouched
  const base = new Float64Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (2 * x) / (width - 1) - 1 - cx;
      const ny = (2 * y) / (height - 1) - 1 - cy;
      let falloff: number;
      switch (shape) {
        case "twin":
          falloff = Math.max(
            radial(nx - ux * off, ny - uy * off, sharpness),
            radial(nx + ux * off, ny + uy * off, sharpness),
          );
          break;
        case "ridge": {
          const rx = nx * ux + ny * uy;
          const ry = -nx * uy + ny * ux;
          falloff = radial(rx / stretch, ry, sharpness);
          break;
        }
        case "crescent": {
          // a broad base with a compact lens bitten from one flank: the bay
          const bite = radial((nx - ux * 0.5) / 0.55, (ny - uy * 0.5) / 0.55, sharpness);
          falloff = Math.max(0, radial(nx, ny, sharpness * 1.2) - 0.7 * bite);
          break;
        }
        case "skerries": {
          const broken = fbm(x / 20, y / 20, seed + 4242, 3);
          falloff = radial(nx, ny, Math.max(1, sharpness * 0.85)) * (0.35 + 0.75 * broken);
          break;
        }
        case "lowland":
          falloff = radial(nx, ny, sharpness * 0.75); // broad and gentle
          break;
        default:
          falloff = radial(nx, ny, sharpness);
      }
      const border = Math.min(x, y, width - 1 - x, height - 1 - y);
      const borderFalloff = Math.min(1, border / BORDER_MARGIN);
      const raw = fbm(x / scale, y / scale, seed, cfg.elevationOctaves);
      base[y * width + x] = raw * falloff * borderFalloff;
    }
  }
  // pass two: the relief sculpts the base, and the lowland promise lands last
  const sculpt = makeRelief(seed, relief, cfg, base);
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      let e = sculpt(base[i], x, y);
      if (shape === "lowland") {
        // the weald's promise outranks any geology: applied last, so even a
        // craggy or terraced weald stays a low and gentle place
        const knee = cfg.rockLevel - 0.1;
        if (e > knee) e = knee + (e - knee) * 0.22; // the hills never become mountains
      }
      out[i] = e;
    }
  }
  return out;
}

// The relief transforms. Terraces and mesas are strictly monotonic remaps of
// elevation (order-preserving: rivers still descend, minima stay minima, the
// sea line never moves). Gorges only ever lower ground, and never below the
// shore; crags multiply, so zero stays zero and the borders stay sea.
function makeRelief(
  seed: number,
  relief: IslandRelief,
  cfg: WorldConfig,
  base: Float64Array,
): (e: number, x: number, y: number) => number {
  switch (relief) {
    case "terraced": {
      // stepped ground between beach and rock: long treads, sharp risers.
      // Piecewise-linear, continuous, strictly increasing — invariant-safe.
      const lo = cfg.beachLevel;
      const hi = cfg.rockLevel;
      const steps = 4 + Math.floor(hash2d(seed, 61, 0x7a11) * 3); // 4-6
      const TREAD = 0.74; // fraction of each step spent nearly flat
      const RISE = 0.14; // height gained crossing the tread
      return (e) => {
        if (e <= lo || e >= hi) return e;
        const s = ((e - lo) / (hi - lo)) * steps;
        const k = Math.floor(s);
        const f = s - k;
        const g = f < TREAD ? (f / TREAD) * RISE : RISE + ((f - TREAD) / (1 - TREAD)) * (1 - RISE);
        return lo + ((k + g) / steps) * (hi - lo);
      };
    }
    case "mesa": {
      // piedmont — escarpment — tableland: the summit pressed flat, the last
      // climb pressed steep. Monotonic remap; the mesa never reaches snow.
      // The knee sits a little under the island's own summit, so even a low
      // isle gets a true flat crown — but never so low the sea line moves.
      let maxBase = 0;
      for (const b of base) maxBase = Math.max(maxBase, b);
      const jitter = hash2d(seed, 62, 0x7a12) * 0.05;
      const knee = Math.min(cfg.rockLevel - 0.02 - jitter, Math.max(0.51, maxBase - 0.1));
      const W = 0.028; // escarpment source band (input elevation)
      const D = 0.12; // escarpment output drop — slope multiplied ~4x
      const B = 0.16; // piedmont band below, gently flattened to reconnect
      return (e) => {
        if (e >= knee) return knee + (e - knee) * 0.22; // the tableland
        if (e >= knee - W) return knee - ((knee - e) / W) * D; // the wall
        if (e >= knee - B) {
          const u = (e - (knee - B)) / (B - W);
          return knee - B + u * (B - D); // the piedmont shoulder
        }
        return e;
      };
    }
    case "gorges":
      // winding canyons sunk along the crests of a ridged noise field. The
      // floor keeps ~18% of its height above the shore, so gorge bottoms
      // stay dry land (sand, marsh, grass) that still drains to the sea.
      return (e, x, y) => {
        if (e <= cfg.shoreLevel + 0.015) return e;
        const g = 1 - Math.abs(2 * fbm(x / 26, y / 26, seed + 9713, 4) - 1);
        if (g <= 0.86) return e;
        const m = Math.min(1, (g - 0.86) / 0.06);
        const mm = m * m * (3 - 2 * m); // smooth wall
        const floor = cfg.shoreLevel + 0.012 + (e - cfg.shoreLevel) * 0.18;
        return e - (e - floor) * 0.92 * mm;
      };
    case "crags":
      // ridged noise serrates the country: sharp crests, sunken vales, the
      // occasional skerry tooth where a crest crosses the shallows.
      return (e, x, y) => {
        const r = 1 - Math.abs(2 * fbm(x / 15, y / 15, seed + 5527, 4) - 1);
        return e * (0.8 + 0.42 * r * r);
      };
    default:
      return (e) => e;
  }
}

// Elevation + moisture (+ how sharply the ground falls away) become ground.
// On mountain isles the climb reads in bands: grass, then open highland turf
// at the treeline, then a scree apron, then bare rock, then snow. Gentle
// isles whose summits never reach the rock keep their meadows all the way
// up — a treeline belongs to mountains. And anywhere the land drops hard
// enough, whatever the country, the face breaks into sheer cliff.
export function classify(e: number, m: number, cfg: WorldConfig, slope = 0, alpine = true): Tile {
  if (e < cfg.seaLevel) return Tile.DeepWater;
  if (e < cfg.shoreLevel) return Tile.ShallowWater;
  if (e < cfg.beachLevel + 0.04 && m >= cfg.marshMoisture) return Tile.Marsh; // wet lowland
  if (e < cfg.beachLevel) return Tile.Sand;
  if (e >= cfg.snowLevel) return Tile.Snow;
  if (e >= cfg.rockLevel) return slope >= CLIFF_SLOPE ? Tile.Cliff : Tile.Rock;
  if (slope >= CLIFF_SLOPE && e >= cfg.beachLevel + CLIFF_FLOOR_ABOVE_BEACH) return Tile.Cliff;
  if (alpine) {
    if (e >= cfg.rockLevel - SCREE_BAND) return m >= 0.66 ? Tile.Highland : Tile.Scree;
    if (e >= cfg.rockLevel - SCREE_BAND - HIGHLAND_BAND) {
      return m >= cfg.forestMoisture + 0.06 ? Tile.Forest : Tile.Highland; // the treeline
    }
  }
  return m >= cfg.forestMoisture ? Tile.Forest : Tile.Grass;
}

export function classifyTiles(elevation: Float32Array, seed: number, cfg: WorldConfig): Uint8Array {
  const { width, height } = cfg;
  const tiles = new Uint8Array(width * height);
  let summit = 0;
  for (const v of elevation) summit = Math.max(summit, v);
  const alpine = summit >= cfg.rockLevel; // only true mountains wear a treeline
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const m = fbm(x / cfg.moistureScale, y / cfg.moistureScale, seed + 7777, cfg.moistureOctaves);
      // the steepest drop to a 4-neighbor: cliffs face downhill
      let slope = 0;
      for (const [dx, dy] of NEIGHBORS4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const d = elevation[i] - elevation[ny * width + nx];
        if (d > slope) slope = d;
      }
      tiles[i] = classify(elevation[i], m, cfg, slope, alpine);
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
  let springs: number[] = [];
  for (let i = 0; i < elevation.length; i++) {
    if (elevation[i] >= cfg.riverMinSpringElevation) springs.push(i);
  }
  if (springs.length === 0) {
    // a gentle island still gathers water on its highest ground: springs
    // rise from the top slice of whatever elevation it actually has
    const sorted = Array.from(elevation).sort((a, b) => b - a);
    const threshold = Math.max(sorted[Math.floor(sorted.length * 0.015)], cfg.beachLevel + 0.02);
    for (let i = 0; i < elevation.length; i++) {
      if (elevation[i] >= threshold) springs.push(i);
    }
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

export function generate(
  seed: number,
  config: WorldConfig = DEFAULT_CONFIG,
  shape?: IslandShape,
  relief?: IslandRelief,
): WorldMap {
  for (let attempt = 0; attempt < config.maxGenerationAttempts; attempt++) {
    const map = tryGenerate(seed, seed + attempt, config, shape, relief);
    if (map) return map;
  }
  throw new Error(
    `no viable island within ${config.maxGenerationAttempts} attempts of seed ${seed}`,
  );
}

function tryGenerate(
  displaySeed: number,
  genSeed: number,
  cfg: WorldConfig,
  forcedShape?: IslandShape,
  forcedRelief?: IslandRelief,
): WorldMap | null {
  const { width, height } = cfg;
  const shape = forcedShape ?? rollShape(genSeed);
  const relief = forcedRelief ?? rollRelief(genSeed);
  const elevation = buildElevation(genSeed, cfg, shape, relief);
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
  // the caldera's promise is structural: if its inner shore can't be waded
  // to from spawn, this island never existed — reroll
  if (carved && !craterReachable(tiles, spawn, carved.crater, cfg)) return null;

  const pockets = placePockets(tiles, spawn, genSeed, cfg);
  const springs = placeSprings(tiles, genSeed, cfg);
  const stacks = placeStacks(tiles, rivers, springs, genSeed, cfg);
  const falls = placeFalls(elevation, rivers, cfg);
  return {
    width, height, seed: displaySeed, tiles, elevation, rivers, spawn,
    pockets, springs, falls, crater: carved?.crater, confluences, shape,
    relief, stacks,
  };
}

// Sea stacks: teeth of stone standing off the coast, the coastline the sea
// has already taken back. Sheer faces (Cliff), so nothing roots or springs
// on them; placed only in open water — never on a river's mouth, never
// crowding a spring — so every worldgen promise stands.
export function placeStacks(
  tiles: Uint8Array,
  rivers: River[],
  springs: { x: number; y: number }[],
  seed: number,
  cfg: WorldConfig,
): { x: number; y: number }[] {
  const rng = makeRng(Math.floor(hash2d(seed, 91, 0x6) * 0xffffffff));
  const roll = rng();
  // roughly half of islands keep a bare coast; the rest stand a few teeth
  const count = roll < 0.48 ? 0 : roll < 0.82 ? 2 + Math.floor(rng() * 2) : 4 + Math.floor(rng() * 3);
  if (count === 0) return [];
  const { width, height } = cfg;
  const riverTiles = new Set<number>();
  for (const r of rivers) for (const t of r.path) riverTiles.add(t);
  const water = (t: number) => t === Tile.DeepWater || t === Tile.ShallowWater;
  const candidates: number[] = [];
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const i = y * width + x;
      if (tiles[i] !== Tile.ShallowWater || riverTiles.has(i)) continue;
      let open = true;
      let deepNear = false;
      for (let dy = -1; dy <= 1 && open; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const j = (y + dy) * width + (x + dx);
          if (!water(tiles[j]) || riverTiles.has(j)) {
            open = false; // the surf around a stack is all water, no river mouths
            break;
          }
          if (tiles[j] === Tile.DeepWater) deepNear = true;
        }
      }
      if (open && deepNear) candidates.push(i);
    }
  }
  const out: { x: number; y: number }[] = [];
  for (let tries = 0; tries < count * 8 && out.length < count && candidates.length > 0; tries++) {
    const i = candidates[Math.floor(rng() * candidates.length)];
    const x = i % width;
    const y = (i / width) | 0;
    if (out.some((s) => Math.hypot(s.x - x, s.y - y) < 9)) continue;
    if (springs.some((s) => Math.hypot(s.x - x, s.y - y) < 4)) continue;
    tiles[i] = Tile.Cliff;
    if (rng() < 0.45) {
      // some stacks are a pair: a second tooth leaning close
      for (const [dx, dy] of NEIGHBORS4) {
        const j = (y + dy) * width + (x + dx);
        if (tiles[j] === Tile.ShallowWater && !riverTiles.has(j)) {
          tiles[j] = Tile.Cliff;
          break;
        }
      }
    }
    out.push({ x, y });
  }
  return out;
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

// Can a wanderer walk (and wade) from spawn to the caldera's inner shore?
function craterReachable(
  tiles: Uint8Array,
  spawn: { x: number; y: number },
  crater: Crater,
  cfg: WorldConfig,
): boolean {
  const { width, height } = cfg;
  const seen = new Uint8Array(tiles.length);
  const stack = [spawn.y * width + spawn.x];
  seen[stack[0]] = 1;
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % width;
    const y = (i / width) | 0;
    if (Math.hypot(x - crater.x, y - crater.y) <= crater.lakeRadius) return true;
    for (const [dx, dy] of NEIGHBORS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const j = ny * width + nx;
      if (!seen[j] && WALKABLE.has(tiles[j] as Tile)) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return false;
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
