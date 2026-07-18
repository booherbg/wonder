# Island Explorer ("Wander") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A peaceful browser game: each seed generates a pixel-art island (mountains, rivers, forests, beaches) that you explore as a small walking character.

**Architecture:** Pure-function world generator (seed → `WorldMap`) built on seeded value-noise; procedurally drawn 16×16 tile atlas rendered to Canvas 2D with a following camera; axis-separated player collision against tile passability. Generation/logic is unit-tested; rendering is verified by eye.

**Tech Stack:** Vite + TypeScript (strict), Canvas 2D, Vitest. **Zero runtime dependencies.**

**Spec:** `docs/superpowers/specs/2026-07-18-island-explorer-design.md`

## Global Constraints

- Zero runtime dependencies. devDependencies only: `vite`, `typescript`, `vitest`.
- TypeScript `strict: true`; `npm run check` (tsc) must pass at every commit.
- Determinism: `Math.random()` / `Date.now()` may appear ONLY in `src/game/main.ts` (picking a fresh seed). Everything else derives from the seed.
- Every color lives in `src/render/palette.ts`. Every worldgen tunable lives in `src/world/config.ts`. `TILE_SIZE` lives in `src/world/config.ts`.
- Pixel-art rendering: `imageSmoothingEnabled = false`, integer `SCALE = 3`.
- Layering: `world/` never imports from `render/` or `game/`; `render/` never imports from `game/`.
- Commit at the end of every task.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `index.html`, `src/game/main.ts`, `.gitignore`

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `check`, `test`; an `index.html` with `<canvas id="game">` and `<div id="seed-label">` that loads `/src/game/main.ts`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "wander",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "check": "tsc",
    "test": "vitest run",
    "preview": "vite preview"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Write `.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 4: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Wander</title>
    <style>
      html, body { margin: 0; height: 100%; background: #0a0e14; overflow: hidden; }
      canvas { display: block; image-rendering: pixelated; }
      #seed-label {
        position: fixed; left: 12px; bottom: 10px;
        font: 12px monospace; color: rgba(255, 255, 255, 0.55);
        user-select: none;
      }
    </style>
  </head>
  <body>
    <canvas id="game"></canvas>
    <div id="seed-label"></div>
    <script type="module" src="/src/game/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5: Write placeholder `src/game/main.ts`** (proves the pipeline; replaced in Task 9)

```ts
const canvas = document.getElementById("game") as HTMLCanvasElement;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
const ctx = canvas.getContext("2d")!;
ctx.fillStyle = "#0a0e14";
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = "#68a557";
ctx.font = "16px monospace";
ctx.fillText("wander: scaffold ok", 20, 40);
```

- [ ] **Step 6: Install and verify**

Run: `npm install && npm run check && npm run build`
Expected: install succeeds; tsc silent; vite prints `✓ built in …`

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore index.html src/game/main.ts
git commit -m "chore: scaffold vite + typescript + vitest project"
```

---

### Task 2: Seeded RNG (`core/rng.ts`)

**Files:**
- Create: `src/core/rng.ts`
- Test: `tests/rng.test.ts`

**Interfaces:**
- Produces: `type Rng = () => number`; `makeRng(seed: number): Rng` (sequence in [0,1)); `hash2d(x: number, y: number, seed: number): number` (stateless, in [0,1)).

- [ ] **Step 1: Write failing tests `tests/rng.test.ts`**

```ts
import { expect, test } from "vitest";
import { hash2d, makeRng } from "../src/core/rng";

test("same seed produces the same sequence", () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 100; i++) expect(a()).toBe(b());
});

test("different seeds produce different sequences", () => {
  const a = makeRng(1);
  const b = makeRng(2);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  expect(seqA).not.toEqual(seqB);
});

test("values are in [0, 1)", () => {
  const rng = makeRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

test("values are roughly uniform", () => {
  const rng = makeRng(1234);
  let sum = 0;
  for (let i = 0; i < 2000; i++) sum += rng();
  expect(sum / 2000).toBeGreaterThan(0.45);
  expect(sum / 2000).toBeLessThan(0.55);
});

test("hash2d is deterministic and in [0, 1)", () => {
  expect(hash2d(10, 20, 3)).toBe(hash2d(10, 20, 3));
  for (let x = -5; x < 5; x++) {
    for (let y = -5; y < 5; y++) {
      const v = hash2d(x, y, 99);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  }
});

test("hash2d differs across coordinates and seeds", () => {
  expect(hash2d(1, 2, 3)).not.toBe(hash2d(2, 1, 3));
  expect(hash2d(1, 2, 3)).not.toBe(hash2d(1, 2, 4));
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `../src/core/rng`

- [ ] **Step 3: Write `src/core/rng.ts`**

```ts
export type Rng = () => number;

// mulberry32 — tiny, fast, plenty good for terrain
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// stateless hash of (x, y, seed) -> [0, 1); used for noise lattices and per-tile variation
export function hash2d(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ (seed | 0);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test` — Expected: all rng tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/rng.ts tests/rng.test.ts
git commit -m "feat: seeded mulberry32 rng and 2d hash"
```

---

### Task 3: Value noise + fBm (`core/noise.ts`)

**Files:**
- Create: `src/core/noise.ts`
- Test: `tests/noise.test.ts`

**Interfaces:**
- Consumes: `hash2d` from `src/core/rng`.
- Produces: `valueNoise(x: number, y: number, seed: number): number` in [0,1); `fbm(x: number, y: number, seed: number, octaves: number, lacunarity?: number, gain?: number): number` in [0,1).

- [ ] **Step 1: Write failing tests `tests/noise.test.ts`**

```ts
import { expect, test } from "vitest";
import { fbm, valueNoise } from "../src/core/noise";
import { hash2d } from "../src/core/rng";

test("valueNoise is deterministic", () => {
  expect(valueNoise(1.5, 2.7, 42)).toBe(valueNoise(1.5, 2.7, 42));
});

test("valueNoise equals the lattice hash at integer coordinates", () => {
  expect(valueNoise(3, 4, 42)).toBeCloseTo(hash2d(3, 4, 42), 10);
  expect(valueNoise(0, 0, 7)).toBeCloseTo(hash2d(0, 0, 7), 10);
});

test("valueNoise stays in [0, 1)", () => {
  for (let i = 0; i < 500; i++) {
    const v = valueNoise(i * 0.37, i * 0.71, 9);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

test("valueNoise is continuous (tiny step, tiny change)", () => {
  for (let i = 0; i < 100; i++) {
    const x = i * 0.31;
    const y = i * 0.17;
    expect(Math.abs(valueNoise(x, y, 5) - valueNoise(x + 0.01, y, 5))).toBeLessThan(0.15);
  }
});

test("fbm is deterministic and in [0, 1)", () => {
  expect(fbm(1.1, 2.2, 3, 5)).toBe(fbm(1.1, 2.2, 3, 5));
  for (let i = 0; i < 500; i++) {
    const v = fbm(i * 0.13, i * 0.29, 11, 5);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

test("fbm octaves add detail (octave 1 differs from octave 5)", () => {
  let differs = false;
  for (let i = 0; i < 20; i++) {
    if (Math.abs(fbm(i * 0.4, i * 0.6, 2, 1) - fbm(i * 0.4, i * 0.6, 2, 5)) > 1e-9) differs = true;
  }
  expect(differs).toBe(true);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test` — Expected: FAIL — cannot resolve `../src/core/noise`

- [ ] **Step 3: Write `src/core/noise.ts`**

```ts
import { hash2d } from "./rng";

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// value noise: bilinear interpolation over a lattice of hashed values, in [0, 1)
export function valueNoise(x: number, y: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const v00 = hash2d(x0, y0, seed);
  const v10 = hash2d(x0 + 1, y0, seed);
  const v01 = hash2d(x0, y0 + 1, seed);
  const v11 = hash2d(x0 + 1, y0 + 1, seed);
  return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty);
}

// fractal Brownian motion: layered octaves of value noise, normalized to [0, 1)
export function fbm(
  x: number,
  y: number,
  seed: number,
  octaves: number,
  lacunarity = 2,
  gain = 0.5,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq, y * freq, seed + i * 1013);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test` — Expected: all noise tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/noise.ts tests/noise.test.ts
git commit -m "feat: value noise and fbm"
```

---

### Task 4: World types and config (`world/types.ts`, `world/config.ts`)

**Files:**
- Create: `src/world/types.ts`, `src/world/config.ts`
- Test: `tests/types.test.ts`

**Interfaces:**
- Produces (types.ts): `enum Tile { DeepWater=0, ShallowWater, Sand, Grass, Forest, Rock, Snow }`; `interface River { path: number[]; reachedSea: boolean }`; `interface WorldMap { width; height; seed; tiles: Uint8Array; elevation: Float32Array; rivers: River[]; spawn: { x: number; y: number } }`; `WALKABLE: ReadonlySet<Tile>`; `tileAt(map, x, y): Tile` (out-of-bounds → DeepWater); `isWalkable(map, x, y): boolean`.
- Produces (config.ts): `TILE_SIZE = 16`; `interface WorldConfig`; `DEFAULT_CONFIG: WorldConfig`.

- [ ] **Step 1: Write failing tests `tests/types.test.ts`**

```ts
import { expect, test } from "vitest";
import { Tile, WorldMap, isWalkable, tileAt } from "../src/world/types";

function tinyMap(): WorldMap {
  const tiles = new Uint8Array([
    Tile.DeepWater, Tile.ShallowWater,
    Tile.Grass, Tile.Rock,
  ]);
  return {
    width: 2, height: 2, seed: 0, tiles,
    elevation: new Float32Array(4), rivers: [], spawn: { x: 0, y: 1 },
  };
}

test("tileAt reads row-major and returns DeepWater out of bounds", () => {
  const map = tinyMap();
  expect(tileAt(map, 0, 0)).toBe(Tile.DeepWater);
  expect(tileAt(map, 1, 0)).toBe(Tile.ShallowWater);
  expect(tileAt(map, 0, 1)).toBe(Tile.Grass);
  expect(tileAt(map, 1, 1)).toBe(Tile.Rock);
  expect(tileAt(map, -1, 0)).toBe(Tile.DeepWater);
  expect(tileAt(map, 2, 0)).toBe(Tile.DeepWater);
  expect(tileAt(map, 0, 2)).toBe(Tile.DeepWater);
});

test("walkability: shallow water, sand, grass, forest walk; deep water, rock, snow block", () => {
  const map = tinyMap();
  expect(isWalkable(map, 0, 0)).toBe(false); // deep water
  expect(isWalkable(map, 1, 0)).toBe(true);  // shallow water (wading)
  expect(isWalkable(map, 0, 1)).toBe(true);  // grass
  expect(isWalkable(map, 1, 1)).toBe(false); // rock
  expect(isWalkable(map, -1, -1)).toBe(false); // out of bounds
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test` — Expected: FAIL — cannot resolve `../src/world/types`

- [ ] **Step 3: Write `src/world/types.ts`**

```ts
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
```

- [ ] **Step 4: Write `src/world/config.ts`** (every worldgen knob lives here)

```ts
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
  rockLevel: 0.6,
  snowLevel: 0.72,
  forestMoisture: 0.55,
  riverCount: 6,
  riverMinSpringElevation: 0.55,
  riverMaxSteps: 4000,
  minLandFraction: 0.12,
  minWalkableRegion: 3000,
  maxGenerationAttempts: 16,
};
```

- [ ] **Step 5: Run tests + typecheck, verify pass**

Run: `npm test && npm run check` — Expected: PASS, tsc silent

- [ ] **Step 6: Commit**

```bash
git add src/world/types.ts src/world/config.ts tests/types.test.ts
git commit -m "feat: world types, walkability, and tunable config"
```

---

### Task 5: Elevation + biome classification (`world/generate.ts`, part 1)

**Files:**
- Create: `src/world/generate.ts`
- Test: `tests/terrain.test.ts`

**Interfaces:**
- Consumes: `fbm` (core/noise), `WorldConfig`/`DEFAULT_CONFIG` (world/config), `Tile` (world/types).
- Produces: `buildElevation(seed: number, cfg: WorldConfig): Float32Array`; `classify(e: number, m: number, cfg: WorldConfig): Tile`; `classifyTiles(elevation: Float32Array, seed: number, cfg: WorldConfig): Uint8Array`. (Task 6 and 7 extend this file.)

- [ ] **Step 1: Write failing tests `tests/terrain.test.ts`**

```ts
import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/world/config";
import { buildElevation, classify, classifyTiles } from "../src/world/generate";
import { Tile } from "../src/world/types";

const cfg = DEFAULT_CONFIG;

test("elevation is deterministic", () => {
  expect(buildElevation(42, cfg)).toEqual(buildElevation(42, cfg));
});

test("elevation is zero on every border (radial falloff)", () => {
  const e = buildElevation(7, cfg);
  const { width, height } = cfg;
  for (let x = 0; x < width; x++) {
    expect(e[x]).toBe(0); // top row
    expect(e[(height - 1) * width + x]).toBe(0); // bottom row
  }
  for (let y = 0; y < height; y++) {
    expect(e[y * width]).toBe(0); // left column
    expect(e[y * width + width - 1]).toBe(0); // right column
  }
});

test("classify maps elevation/moisture bands to tiles", () => {
  expect(classify(0.1, 0.5, cfg)).toBe(Tile.DeepWater);
  expect(classify(0.32, 0.5, cfg)).toBe(Tile.ShallowWater);
  expect(classify(0.36, 0.5, cfg)).toBe(Tile.Sand);
  expect(classify(0.5, 0.9, cfg)).toBe(Tile.Forest);
  expect(classify(0.5, 0.2, cfg)).toBe(Tile.Grass);
  expect(classify(0.65, 0.5, cfg)).toBe(Tile.Rock);
  expect(classify(0.9, 0.5, cfg)).toBe(Tile.Snow);
});

test("land fraction lands in a sane band across seeds", () => {
  for (const seed of [1, 2, 3]) {
    const elevation = buildElevation(seed, cfg);
    const tiles = classifyTiles(elevation, seed, cfg);
    let land = 0;
    for (const t of tiles) {
      if (t !== Tile.DeepWater && t !== Tile.ShallowWater) land++;
    }
    const fraction = land / tiles.length;
    expect(fraction).toBeGreaterThan(0.08);
    expect(fraction).toBeLessThan(0.7);
  }
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test` — Expected: FAIL — cannot resolve `../src/world/generate`

- [ ] **Step 3: Write `src/world/generate.ts`**

```ts
import { fbm } from "../core/noise";
import { WorldConfig } from "./config";
import { Tile } from "./types";

// fBm elevation shaped by radial falloff: guaranteed sea at the edges,
// highlands only possible near the center.
export function buildElevation(seed: number, cfg: WorldConfig): Float32Array {
  const { width, height } = cfg;
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = (2 * x) / (width - 1) - 1;
      const ny = (2 * y) / (height - 1) - 1;
      const d = Math.sqrt(nx * nx + ny * ny);
      const falloff = Math.max(0, 1 - Math.pow(d, cfg.falloffSharpness));
      const raw = fbm(x / cfg.elevationScale, y / cfg.elevationScale, seed, cfg.elevationOctaves);
      out[y * width + x] = raw * falloff;
    }
  }
  return out;
}

export function classify(e: number, m: number, cfg: WorldConfig): Tile {
  if (e < cfg.seaLevel) return Tile.DeepWater;
  if (e < cfg.shoreLevel) return Tile.ShallowWater;
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
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test` — Expected: all terrain tests PASS.
Note: if the land-fraction test falls outside the band, adjust `seaLevel`/`falloffSharpness` in `DEFAULT_CONFIG` slightly (that file exists to be tuned) — do not widen the test band beyond (0.05, 0.8).

- [ ] **Step 5: Commit**

```bash
git add src/world/generate.ts tests/terrain.test.ts
git commit -m "feat: island elevation and biome classification"
```

---

### Task 6: Rivers (`world/generate.ts`, part 2)

**Files:**
- Modify: `src/world/generate.ts` (append; also add `makeRng` and `River` imports)
- Test: `tests/rivers.test.ts`

**Interfaces:**
- Consumes: `makeRng` (core/rng), `River` (world/types), Task 5's functions.
- Produces: `traceRiver(elevation: Float32Array, tiles: Uint8Array, start: number, cfg: WorldConfig): River` (mutates `tiles`, carving ShallowWater); `carveRivers(elevation: Float32Array, tiles: Uint8Array, seed: number, cfg: WorldConfig): River[]`.

- [ ] **Step 1: Write failing tests `tests/rivers.test.ts`**

```ts
import { expect, test } from "vitest";
import { DEFAULT_CONFIG, WorldConfig } from "../src/world/config";
import { buildElevation, carveRivers, classifyTiles, traceRiver } from "../src/world/generate";
import { Tile } from "../src/world/types";

// 5x5 test world: elevation decreases left to right, right column is sea.
function slopeWorld(): { elevation: Float32Array; tiles: Uint8Array; cfg: WorldConfig } {
  const cfg = { ...DEFAULT_CONFIG, width: 5, height: 5 };
  const elevation = new Float32Array(25);
  const tiles = new Uint8Array(25);
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      elevation[y * 5 + x] = (4 - x) / 5; // 0.8 .. 0.0
      tiles[y * 5 + x] = x === 4 ? Tile.DeepWater : Tile.Grass;
    }
  }
  return { elevation, tiles, cfg };
}

test("river flows downhill and reaches the sea", () => {
  const { elevation, tiles, cfg } = slopeWorld();
  const river = traceRiver(elevation, tiles, 2 * 5 + 0, cfg); // start at (0, 2)
  expect(river.reachedSea).toBe(true);
  expect(river.path).toEqual([10, 11, 12, 13]); // straight east along row 2
  for (const i of river.path) expect(tiles[i]).toBe(Tile.ShallowWater);
  // elevation strictly decreases along the path
  for (let k = 1; k < river.path.length; k++) {
    expect(elevation[river.path[k]]).toBeLessThan(elevation[river.path[k - 1]]);
  }
});

test("river trapped in a bowl becomes a lake terminus", () => {
  const cfg = { ...DEFAULT_CONFIG, width: 5, height: 5 };
  const elevation = new Float32Array(25);
  const tiles = new Uint8Array(25).fill(Tile.Grass);
  // bowl centered at (2,2): elevation rises with distance from center
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      elevation[y * 5 + x] = 0.4 + 0.1 * (Math.abs(x - 2) + Math.abs(y - 2));
    }
  }
  const river = traceRiver(elevation, tiles, 0, cfg); // start at corner (0,0)
  expect(river.reachedSea).toBe(false);
  const last = river.path[river.path.length - 1];
  expect(last).toBe(2 * 5 + 2); // settles at the bowl's bottom
  expect(tiles[last]).toBe(Tile.ShallowWater); // the lake
});

test("carveRivers is deterministic on a real island", () => {
  const cfg = DEFAULT_CONFIG;
  const e1 = buildElevation(3, cfg);
  const t1 = classifyTiles(e1, 3, cfg);
  const r1 = carveRivers(e1, t1, 3, cfg);
  const e2 = buildElevation(3, cfg);
  const t2 = classifyTiles(e2, 3, cfg);
  const r2 = carveRivers(e2, t2, 3, cfg);
  expect(r1).toEqual(r2);
  expect(t1).toEqual(t2);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test` — Expected: FAIL — `traceRiver` / `carveRivers` not exported

- [ ] **Step 3: Append to `src/world/generate.ts`** (and extend the imports at the top of the file)

```ts
// at top of file, imports become:
import { fbm } from "../core/noise";
import { makeRng } from "../core/rng";
import { WorldConfig } from "./config";
import { River, Tile } from "./types";

const NEIGHBORS4: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

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
    if (next === -1) break; // local minimum: the carved tile is the lake
    i = next;
  }
  return { path, reachedSea };
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
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test` — Expected: all river tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/world/generate.ts tests/rivers.test.ts
git commit -m "feat: rivers traced downhill from mountain springs"
```

---

### Task 7: Spawn, validity, and full `generate()` (`world/generate.ts`, part 3)

**Files:**
- Modify: `src/world/generate.ts` (append; extend imports with `DEFAULT_CONFIG`, `WorldMap`, `WALKABLE`)
- Test: `tests/generate.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 5–6.
- Produces: `generate(seed: number, config?: WorldConfig): WorldMap` — THE public entry point. Deterministic; retries `seed+1, seed+2, …` internally on degenerate islands; throws only after `maxGenerationAttempts` failures.

- [ ] **Step 1: Write failing tests `tests/generate.test.ts`**

```ts
import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/world/config";
import { generate } from "../src/world/generate";
import { Tile, WALKABLE, WorldMap, isWalkable, tileAt } from "../src/world/types";

const cfg = DEFAULT_CONFIG;

function walkableRegionSize(map: WorldMap, startX: number, startY: number): number {
  const seen = new Set<number>([startY * map.width + startX]);
  const stack = [startY * map.width + startX];
  while (stack.length > 0) {
    const i = stack.pop()!;
    const x = i % map.width;
    const y = (i / map.width) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const j = (y + dy) * map.width + (x + dx);
      if (!seen.has(j) && isWalkable(map, x + dx, y + dy)) {
        seen.add(j);
        stack.push(j);
      }
    }
  }
  return seen.size;
}

test("same seed generates an identical world", () => {
  const a = generate(12345, cfg);
  const b = generate(12345, cfg);
  expect(a.tiles).toEqual(b.tiles);
  expect(a.spawn).toEqual(b.spawn);
  expect(a.rivers).toEqual(b.rivers);
  expect(a.seed).toBe(12345);
});

test("different seeds generate different worlds", () => {
  expect(generate(111, cfg).tiles).not.toEqual(generate(999, cfg).tiles);
});

test("spawn is a walkable grass tile in a large connected region", () => {
  for (const seed of [1, 42, 777]) {
    const map = generate(seed, cfg);
    expect(tileAt(map, map.spawn.x, map.spawn.y)).toBe(Tile.Grass);
    expect(walkableRegionSize(map, map.spawn.x, map.spawn.y)).toBeGreaterThanOrEqual(
      cfg.minWalkableRegion,
    );
  }
});

test("map borders are deep water", () => {
  const map = generate(42, cfg);
  for (let x = 0; x < map.width; x++) {
    expect(tileAt(map, x, 0)).toBe(Tile.DeepWater);
    expect(tileAt(map, x, map.height - 1)).toBe(Tile.DeepWater);
  }
  for (let y = 0; y < map.height; y++) {
    expect(tileAt(map, 0, y)).toBe(Tile.DeepWater);
    expect(tileAt(map, map.width - 1, y)).toBe(Tile.DeepWater);
  }
});

test("every river descends and ends at the sea or a local minimum", () => {
  const map = generate(42, cfg);
  expect(map.rivers.length).toBeGreaterThan(0);
  for (const river of map.rivers) {
    for (let k = 1; k < river.path.length; k++) {
      expect(map.elevation[river.path[k]]).toBeLessThan(map.elevation[river.path[k - 1]]);
    }
    if (river.path.length === cfg.riverMaxSteps) continue; // truncated by safety cap
    const last = river.path[river.path.length - 1];
    const x = last % map.width;
    const y = (last / map.width) | 0;
    if (river.reachedSea) {
      const touchesSea = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
        ([dx, dy]) => tileAt(map, x + dx, y + dy) === Tile.DeepWater,
      );
      expect(touchesSea).toBe(true);
    } else {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        expect(map.elevation[ny * map.width + nx]).toBeGreaterThanOrEqual(
          map.elevation[last],
        );
      }
    }
  }
});

test("all tiles are valid Tile values and every biome band can occur", () => {
  const map = generate(12345, cfg);
  const present = new Set<number>();
  for (const t of map.tiles) {
    expect(t).toBeGreaterThanOrEqual(Tile.DeepWater);
    expect(t).toBeLessThanOrEqual(Tile.Snow);
    present.add(t);
  }
  // a healthy island has water, shore, and living land
  for (const t of [Tile.DeepWater, Tile.ShallowWater, Tile.Sand, Tile.Grass, Tile.Forest]) {
    expect(present.has(t)).toBe(true);
  }
  expect(WALKABLE.has(Tile.Grass)).toBe(true);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test` — Expected: FAIL — `generate` not exported

- [ ] **Step 3: Append to `src/world/generate.ts`** (extend imports: `DEFAULT_CONFIG` from `./config`; add `WALKABLE`, `WorldMap` to the `./types` import)

```ts
// imports at top of file now:
// import { fbm } from "../core/noise";
// import { makeRng } from "../core/rng";
// import { DEFAULT_CONFIG, WorldConfig } from "./config";
// import { River, Tile, WALKABLE, WorldMap } from "./types";

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
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test && npm run check` — Expected: ALL tests PASS, tsc silent.
Note: if the "every biome band can occur" assertions fail for `12345`, tune `DEFAULT_CONFIG` thresholds (not the test) — e.g. lower `rockLevel`/`snowLevel` or raise `elevationScale`.

- [ ] **Step 5: Commit**

```bash
git add src/world/generate.ts tests/generate.test.ts
git commit -m "feat: full island generation with spawn and validity retries"
```

---

### Task 8: Palette and procedural tile art (`render/palette.ts`, `render/tiles.ts`)

**Files:**
- Create: `src/render/palette.ts`, `src/render/tiles.ts`

**Interfaces:**
- Consumes: `makeRng` (core/rng), `TILE_SIZE` (world/config), `Tile` (world/types).
- Produces: `PALETTE` (every color, named); `VARIANTS = 4`; `SCALE = 3`; `buildTileAtlas(): HTMLCanvasElement` (atlas: column = variant, row = `Tile` enum value; water variants are drift-animation frames); `drawPlayerSprite(): HTMLCanvasElement` (16×16, feet+shadow on bottom rows).
- No unit tests (canvas): visual verification happens in Task 9.

- [ ] **Step 1: Write `src/render/palette.ts`**

```ts
// Every color in the game. Change the mood of the whole world from this file.
export const PALETTE = {
  background: "#0a0e14",

  deepWaterBase: "#22467c",
  deepWaterGlint: "#2d548e",
  shallowWaterBase: "#4a7dbd",
  shallowWaterGlint: "#5d8fcc",

  sandBase: "#e3d29c",
  sandSpeckle: ["#d6c489", "#efe0b2", "#cbb878"],

  grassBase: "#68a557",
  grassSpeckle: ["#5c9a4c", "#77b364", "#4f8c41"],

  forestFloor: "#568f47",
  treeCanopyDark: "#2f6134",
  treeCanopy: "#3e7a40",
  treeCanopyLight: "#4f8f4c",
  treeTrunk: "#6b4a2f",

  rockBase: "#8b8e93",
  rockSpeckle: ["#7c7f84", "#999da2", "#70737a"],
  rockShadow: "#63666d",

  snowBase: "#e9eef4",
  snowSpeckle: ["#dbe3ec", "#f4f7fb", "#cfd9e5"],

  playerCloak: "#c94f43",
  playerSkin: "#f0c8a0",
  playerHair: "#4a3225",
  playerShadow: "rgba(0, 0, 0, 0.25)",
} as const;
```

- [ ] **Step 2: Write `src/render/tiles.ts`**

```ts
import { makeRng } from "../core/rng";
import { TILE_SIZE } from "../world/config";
import { Tile } from "../world/types";
import { PALETTE } from "./palette";

export const VARIANTS = 4; // variant columns per tile row (water uses them as animation frames)
export const SCALE = 3; // screen pixels per art pixel
const TILE_TYPES = 7;

type Ctx = CanvasRenderingContext2D;

function fill(ctx: Ctx, ox: number, oy: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(ox, oy, TILE_SIZE, TILE_SIZE);
}

function px(ctx: Ctx, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function speckle(
  ctx: Ctx,
  ox: number,
  oy: number,
  rngSeed: number,
  colors: readonly string[],
  count: number,
): void {
  const rng = makeRng(rngSeed);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * TILE_SIZE);
    const y = Math.floor(rng() * TILE_SIZE);
    px(ctx, ox + x, oy + y, colors[Math.floor(rng() * colors.length)]);
  }
}

// Water: same glint rows every variant, x shifted by variant index — cycling
// variants 0→1→2→1 makes the glints drift gently back and forth.
function drawWater(
  ctx: Ctx,
  ox: number,
  oy: number,
  v: number,
  base: string,
  glint: string,
  rngSeed: number,
): void {
  fill(ctx, ox, oy, base);
  const rng = makeRng(rngSeed);
  for (let i = 0; i < 3; i++) {
    const y = Math.floor(rng() * TILE_SIZE);
    const w = 2 + Math.floor(rng() * 3);
    const x = (Math.floor(rng() * TILE_SIZE) + v) % (TILE_SIZE - w);
    ctx.fillStyle = glint;
    ctx.fillRect(ox + x, oy + y, w, 1);
  }
}

function drawSand(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.sandBase);
  speckle(ctx, ox, oy, 700 + v, PALETTE.sandSpeckle, 12);
}

function drawGrass(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.grassBase);
  speckle(ctx, ox, oy, 100 + v, PALETTE.grassSpeckle, 14);
}

function drawForest(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.forestFloor);
  speckle(ctx, ox, oy, 200 + v, PALETTE.grassSpeckle, 6);
  const rng = makeRng(300 + v);
  const cx = ox + 8 + (Math.floor(rng() * 3) - 1); // tree sways off-center per variant
  ctx.fillStyle = PALETTE.treeTrunk;
  ctx.fillRect(cx - 1, oy + 11, 2, 3);
  ctx.fillStyle = PALETTE.treeCanopyDark;
  ctx.fillRect(cx - 3, oy + 9, 6, 2);
  ctx.fillRect(cx - 4, oy + 6, 8, 3);
  ctx.fillRect(cx - 3, oy + 4, 6, 2);
  ctx.fillRect(cx - 2, oy + 2, 4, 2);
  ctx.fillStyle = PALETTE.treeCanopy;
  ctx.fillRect(cx - 3, oy + 5, 5, 3);
  ctx.fillRect(cx - 2, oy + 3, 4, 2);
  ctx.fillStyle = PALETTE.treeCanopyLight;
  ctx.fillRect(cx - 2, oy + 4, 2, 2);
  px(ctx, cx, oy + 3, PALETTE.treeCanopyLight);
}

function drawRock(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.rockBase);
  speckle(ctx, ox, oy, 400 + v, PALETTE.rockSpeckle, 12);
  const rng = makeRng(500 + v);
  for (let i = 0; i < 2; i++) {
    let x = Math.floor(rng() * TILE_SIZE);
    let y = Math.floor(rng() * 8);
    for (let s = 0; s < 5; s++) {
      px(ctx, ox + Math.min(x, TILE_SIZE - 1), oy + Math.min(y, TILE_SIZE - 1), PALETTE.rockShadow);
      if (rng() < 0.5) x += 1;
      y += 1;
    }
  }
}

function drawSnow(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.snowBase);
  speckle(ctx, ox, oy, 600 + v, PALETTE.snowSpeckle, 10);
}

export function buildTileAtlas(): HTMLCanvasElement {
  const atlas = document.createElement("canvas");
  atlas.width = VARIANTS * TILE_SIZE;
  atlas.height = TILE_TYPES * TILE_SIZE;
  const ctx = atlas.getContext("2d")!;
  for (let v = 0; v < VARIANTS; v++) {
    const ox = v * TILE_SIZE;
    drawWater(ctx, ox, Tile.DeepWater * TILE_SIZE, v, PALETTE.deepWaterBase, PALETTE.deepWaterGlint, 800);
    drawWater(ctx, ox, Tile.ShallowWater * TILE_SIZE, v, PALETTE.shallowWaterBase, PALETTE.shallowWaterGlint, 900);
    drawSand(ctx, ox, Tile.Sand * TILE_SIZE, v);
    drawGrass(ctx, ox, Tile.Grass * TILE_SIZE, v);
    drawForest(ctx, ox, Tile.Forest * TILE_SIZE, v);
    drawRock(ctx, ox, Tile.Rock * TILE_SIZE, v);
    drawSnow(ctx, ox, Tile.Snow * TILE_SIZE, v);
  }
  return atlas;
}

// 16x16 wanderer; feet + shadow occupy the bottom rows, anchor is (8, 15).
export function drawPlayerSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE_SIZE;
  c.height = TILE_SIZE;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = PALETTE.playerShadow;
  ctx.fillRect(5, 14, 6, 2);
  ctx.fillStyle = PALETTE.playerCloak;
  ctx.fillRect(5, 8, 6, 6);
  ctx.fillStyle = PALETTE.playerSkin;
  ctx.fillRect(6, 4, 4, 4);
  ctx.fillStyle = PALETTE.playerHair;
  ctx.fillRect(6, 3, 4, 2);
  return c;
}
```

- [ ] **Step 3: Typecheck**

Run: `npm run check && npm test` — Expected: tsc silent, existing tests still PASS

- [ ] **Step 4: Commit**

```bash
git add src/render/palette.ts src/render/tiles.ts
git commit -m "feat: palette and procedural pixel tile atlas"
```

---

### Task 9: Renderer + first look at the island (`render/renderer.ts`, `game/main.ts`)

**Files:**
- Create: `src/render/renderer.ts`
- Modify: `src/game/main.ts` (replace placeholder entirely)

**Interfaces:**
- Consumes: `buildTileAtlas`, `drawPlayerSprite`, `VARIANTS`, `SCALE` (render/tiles); `TILE_SIZE` (world/config); `hash2d` (core/rng); `generate` (world/generate).
- Produces: `class Renderer { constructor(canvas: HTMLCanvasElement, map: WorldMap); setMap(map: WorldMap): void; resize(): void; get viewWidth(): number; get viewHeight(): number; draw(camX: number, camY: number, player: { x: number; y: number } | null, timeMs: number): void }`. Camera args are world-pixel coordinates of the viewport's top-left.

- [ ] **Step 1: Write `src/render/renderer.ts`**

```ts
import { hash2d } from "../core/rng";
import { TILE_SIZE } from "../world/config";
import { Tile, WorldMap } from "../world/types";
import { PALETTE } from "./palette";
import { SCALE, VARIANTS, buildTileAtlas, drawPlayerSprite } from "./tiles";

const WATER_FRAME_MS = 450;
const WATER_FRAME_SEQUENCE = [0, 1, 2, 1]; // gentle back-and-forth drift

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private atlas: HTMLCanvasElement;
  private playerSprite: HTMLCanvasElement;

  constructor(
    private canvas: HTMLCanvasElement,
    private map: WorldMap,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.atlas = buildTileAtlas();
    this.playerSprite = drawPlayerSprite();
    this.resize();
  }

  setMap(map: WorldMap): void {
    this.map = map;
  }

  resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  get viewWidth(): number {
    return this.canvas.width / SCALE;
  }

  get viewHeight(): number {
    return this.canvas.height / SCALE;
  }

  draw(camX: number, camY: number, player: { x: number; y: number } | null, timeMs: number): void {
    const { ctx, map } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    ctx.fillStyle = PALETTE.background;
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    const waterFrame =
      WATER_FRAME_SEQUENCE[Math.floor(timeMs / WATER_FRAME_MS) % WATER_FRAME_SEQUENCE.length];
    const x0 = Math.max(0, Math.floor(camX / TILE_SIZE));
    const y0 = Math.max(0, Math.floor(camY / TILE_SIZE));
    const x1 = Math.min(map.width - 1, Math.ceil((camX + this.viewWidth) / TILE_SIZE));
    const y1 = Math.min(map.height - 1, Math.ceil((camY + this.viewHeight) / TILE_SIZE));

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = map.tiles[ty * map.width + tx] as Tile;
        const h = Math.floor(hash2d(tx, ty, map.seed) * VARIANTS);
        const isWater = tile === Tile.DeepWater || tile === Tile.ShallowWater;
        const variant = isWater ? (h + waterFrame) % VARIANTS : h;
        ctx.drawImage(
          this.atlas,
          variant * TILE_SIZE,
          tile * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE,
          Math.round(tx * TILE_SIZE - camX),
          Math.round(ty * TILE_SIZE - camY),
          TILE_SIZE,
          TILE_SIZE,
        );
      }
    }

    if (player) {
      ctx.drawImage(
        this.playerSprite,
        Math.round(player.x - 8 - camX),
        Math.round(player.y - 15 - camY),
      );
    }
  }
}
```

- [ ] **Step 2: Replace `src/game/main.ts`** (static view centered on spawn; player arrives in Task 10)

```ts
import { DEFAULT_CONFIG, TILE_SIZE } from "../world/config";
import { generate } from "../world/generate";
import { Renderer } from "../render/renderer";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi));
}

const canvas = document.getElementById("game") as HTMLCanvasElement;
const map = generate(12345, DEFAULT_CONFIG);
const renderer = new Renderer(canvas, map);
window.addEventListener("resize", () => renderer.resize());

function frame(now: number): void {
  const camX = clamp(
    (map.spawn.x + 0.5) * TILE_SIZE - renderer.viewWidth / 2,
    0,
    map.width * TILE_SIZE - renderer.viewWidth,
  );
  const camY = clamp(
    (map.spawn.y + 0.5) * TILE_SIZE - renderer.viewHeight / 2,
    0,
    map.height * TILE_SIZE - renderer.viewHeight,
  );
  renderer.draw(camX, camY, null, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 3: Typecheck + tests**

Run: `npm run check && npm test` — Expected: clean

- [ ] **Step 4: Look at the island (visual verification)**

Run: `npm run dev` (background), open http://localhost:5173, screenshot.
Verify: an island is visible — sea at the edges of the map area, beach ring, green interior with forest patches, gray/white highlands somewhere, at least one blue river thread; water glints shimmer; pixels are crisp (no blur). **This is the moment to tune `DEFAULT_CONFIG` and `PALETTE` if the island looks wrong or ugly — iterate until it reads as "a beautiful island", keeping all tests green.**

- [ ] **Step 5: Commit**

```bash
git add src/render/renderer.ts src/game/main.ts
git commit -m "feat: tile renderer with camera and shimmering water"
```

---

### Task 10: Player movement + camera follow (`game/player.ts`, `game/main.ts`)

**Files:**
- Create: `src/game/player.ts`
- Modify: `src/game/main.ts` (replace entirely)
- Test: `tests/player.test.ts`

**Interfaces:**
- Consumes: `TILE_SIZE` (world/config), `WorldMap`/`isWalkable` (world/types).
- Produces: `interface InputState { up: boolean; down: boolean; left: boolean; right: boolean }`; `PLAYER_SPEED = 96`; `class Player { constructor(x: number, y: number); x: number; y: number; update(dt: number, input: InputState, map: WorldMap): void }`. `(x, y)` is the feet center in world pixels.

- [ ] **Step 1: Write failing tests `tests/player.test.ts`**

```ts
import { expect, test } from "vitest";
import { PLAYER_SPEED, Player } from "../src/game/player";
import { Tile, WorldMap } from "../src/world/types";

// '.' grass, '#' rock, '~' deep water — 16px tiles
function mapFrom(rows: string[]): WorldMap {
  const height = rows.length;
  const width = rows[0].length;
  const tiles = new Uint8Array(width * height);
  const chars: Record<string, Tile> = { ".": Tile.Grass, "#": Tile.Rock, "~": Tile.DeepWater };
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) tiles[y * width + x] = chars[row[x]];
  });
  return {
    width, height, seed: 0, tiles,
    elevation: new Float32Array(width * height), rivers: [], spawn: { x: 1, y: 1 },
  };
}

const IDLE = { up: false, down: false, left: false, right: false };

test("walks right on open grass at PLAYER_SPEED", () => {
  const map = mapFrom(["....", "....", "....", "...."]);
  const p = new Player(32, 32);
  p.update(0.1, { ...IDLE, right: true }, map);
  expect(p.x).toBeCloseTo(32 + PLAYER_SPEED * 0.1, 5);
  expect(p.y).toBe(32);
});

test("diagonal movement is normalized (not faster)", () => {
  const map = mapFrom(["....", "....", "....", "...."]);
  const p = new Player(32, 32);
  p.update(0.1, { ...IDLE, right: true, down: true }, map);
  const dist = Math.hypot(p.x - 32, p.y - 32);
  expect(dist).toBeCloseTo(PLAYER_SPEED * 0.1, 5);
});

test("rock blocks movement", () => {
  const map = mapFrom(["....", "..#.", "....", "...."]);
  const p = new Player(24, 24); // feet box sits inside tile (1,1)
  p.update(0.1, { ...IDLE, right: true }, map); // tile (2,1) is rock
  expect(p.x).toBe(24);
});

test("deep water blocks movement", () => {
  const map = mapFrom(["....", "..~.", "....", "...."]);
  const p = new Player(24, 24);
  p.update(0.1, { ...IDLE, right: true }, map);
  expect(p.x).toBe(24);
});

test("slides along a wall (blocked axis stops, free axis moves)", () => {
  const map = mapFrom(["....", "..#.", "....", "...."]);
  const p = new Player(24, 24);
  p.update(0.1, { ...IDLE, right: true, down: true }, map);
  expect(p.x).toBe(24); // blocked by rock
  expect(p.y).toBeGreaterThan(24); // still slides down
});

test("map edge blocks movement (out of bounds is deep water)", () => {
  const map = mapFrom(["....", "....", "....", "...."]);
  const p = new Player(8, 8);
  p.update(1.0, { ...IDLE, left: true }, map);
  expect(p.x).toBe(8);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npm test` — Expected: FAIL — cannot resolve `../src/game/player`

- [ ] **Step 3: Write `src/game/player.ts`**

```ts
import { TILE_SIZE } from "../world/config";
import { WorldMap, isWalkable } from "../world/types";

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export const PLAYER_SPEED = 96; // world pixels per second (6 tiles/s)

const HALF_WIDTH = 4; // feet collision box: 8 wide, 5 tall, anchored at (x, y)
const BOX_HEIGHT = 5;

export class Player {
  constructor(
    public x: number,
    public y: number,
  ) {}

  update(dt: number, input: InputState, map: WorldMap): void {
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (dx === 0 && dy === 0) return;
    const step = (PLAYER_SPEED * dt) / Math.hypot(dx, dy);
    const nx = this.x + dx * step;
    if (!this.collides(map, nx, this.y)) this.x = nx;
    const ny = this.y + dy * step;
    if (!this.collides(map, this.x, ny)) this.y = ny;
  }

  private collides(map: WorldMap, x: number, y: number): boolean {
    const corners: ReadonlyArray<readonly [number, number]> = [
      [x - HALF_WIDTH, y],
      [x + HALF_WIDTH - 1, y],
      [x - HALF_WIDTH, y - BOX_HEIGHT],
      [x + HALF_WIDTH - 1, y - BOX_HEIGHT],
    ];
    return corners.some(
      ([cx, cy]) => !isWalkable(map, Math.floor(cx / TILE_SIZE), Math.floor(cy / TILE_SIZE)),
    );
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npm test` — Expected: all player tests PASS

- [ ] **Step 5: Replace `src/game/main.ts`** (game loop, input, camera follow)

```ts
import { DEFAULT_CONFIG, TILE_SIZE } from "../world/config";
import { generate } from "../world/generate";
import { Renderer } from "../render/renderer";
import { InputState, Player } from "./player";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi));
}

function seedFromUrl(): number | null {
  const raw = new URL(location.href).searchParams.get("seed");
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

const canvas = document.getElementById("game") as HTMLCanvasElement;
const map = generate(seedFromUrl() ?? 12345, DEFAULT_CONFIG);
const player = new Player((map.spawn.x + 0.5) * TILE_SIZE, (map.spawn.y + 0.5) * TILE_SIZE);
const renderer = new Renderer(canvas, map);

const keys = new Set<string>();
window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("resize", () => renderer.resize());

function input(): InputState {
  return {
    up: keys.has("w") || keys.has("arrowup"),
    down: keys.has("s") || keys.has("arrowdown"),
    left: keys.has("a") || keys.has("arrowleft"),
    right: keys.has("d") || keys.has("arrowright"),
  };
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  player.update(dt, input(), map);
  const camX = clamp(
    player.x - renderer.viewWidth / 2,
    0,
    map.width * TILE_SIZE - renderer.viewWidth,
  );
  const camY = clamp(
    player.y - renderer.viewHeight / 2,
    0,
    map.height * TILE_SIZE - renderer.viewHeight,
  );
  renderer.draw(camX, camY, player, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 6: Typecheck + visual verification**

Run: `npm run check && npm test`, then `npm run dev`, open http://localhost:5173.
Verify: the wanderer stands at spawn; WASD/arrows walk smoothly, diagonals aren't faster; camera follows; deep water, rock, and snow block; shallow river/shore tiles are wadeable; camera stops at map edges.

- [ ] **Step 7: Commit**

```bash
git add src/game/player.ts src/game/main.ts tests/player.test.ts
git commit -m "feat: walking player with collision and camera follow"
```

---

### Task 11: Seed UI — label, `R` to regenerate, shareable URL (`game/main.ts`)

**Files:**
- Modify: `src/game/main.ts` (replace entirely — final form)

**Interfaces:**
- Consumes: everything already built.
- Produces: final entry point. `R` = new random island; `?seed=N` loads island N; the URL always reflects the current island; label shows `seed N — R for a new island`.

- [ ] **Step 1: Replace `src/game/main.ts`**

```ts
import { DEFAULT_CONFIG, TILE_SIZE } from "../world/config";
import { generate } from "../world/generate";
import { WorldMap } from "../world/types";
import { Renderer } from "../render/renderer";
import { InputState, Player } from "./player";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi));
}

function seedFromUrl(): number | null {
  const raw = new URL(location.href).searchParams.get("seed");
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// the one intentional use of Math.random(): choosing a fresh seed
function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

const canvas = document.getElementById("game") as HTMLCanvasElement;
const seedLabel = document.getElementById("seed-label")!;

let map: WorldMap;
let player: Player;

function loadWorld(seed: number): void {
  map = generate(seed, DEFAULT_CONFIG);
  player = new Player((map.spawn.x + 0.5) * TILE_SIZE, (map.spawn.y + 0.5) * TILE_SIZE);
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  history.replaceState(null, "", url);
  seedLabel.textContent = `seed ${seed} — R for a new island`;
}

loadWorld(seedFromUrl() ?? randomSeed());
const renderer = new Renderer(canvas, map);

const keys = new Set<string>();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === "r") {
    loadWorld(randomSeed());
    renderer.setMap(map);
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("resize", () => renderer.resize());

function input(): InputState {
  return {
    up: keys.has("w") || keys.has("arrowup"),
    down: keys.has("s") || keys.has("arrowdown"),
    left: keys.has("a") || keys.has("arrowleft"),
    right: keys.has("d") || keys.has("arrowright"),
  };
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  player.update(dt, input(), map);
  const camX = clamp(
    player.x - renderer.viewWidth / 2,
    0,
    map.width * TILE_SIZE - renderer.viewWidth,
  );
  const camY = clamp(
    player.y - renderer.viewHeight / 2,
    0,
    map.height * TILE_SIZE - renderer.viewHeight,
  );
  renderer.draw(camX, camY, player, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- [ ] **Step 2: Typecheck + tests**

Run: `npm run check && npm test` — Expected: clean

- [ ] **Step 3: Visual verification**

With `npm run dev` running, verify: fresh load gets a random island and the URL gains `?seed=N`; reloading that URL reproduces the same island; pressing `R` swaps in a new island with the player at its spawn and updates URL + label; the label reads `seed N — R for a new island`.

- [ ] **Step 4: Commit**

```bash
git add src/game/main.ts
git commit -m "feat: seed label, R to regenerate, shareable seed urls"
```

---

### Task 12: README + final verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write `README.md`**

```markdown
# Wander

A peaceful, generative pixel-art island to explore. Every seed is a new
island — mountains at the heart, rivers running to the sea, forests and
meadows between.

## Play

    npm install
    npm run dev

Open http://localhost:5173.

- **WASD / arrows** — walk
- **R** — new island
- **?seed=N** in the URL — revisit a specific island (the URL always shows
  the current seed, so copy it to share an island)

Deep water, bare rock, and snow block your path; you can wade through
rivers and shallows.

## Tweak it

Everything tunable lives in an obvious place:

- `src/world/config.ts` — island size, sea level, mountain/snow lines,
  forest density, river count… every worldgen knob, commented
- `src/render/palette.ts` — every color in the game
- `src/render/tiles.ts` — the pixel art itself, one draw function per tile

## Develop

    npm test        # world generation unit tests (vitest)
    npm run check   # typecheck
    npm run build   # production build

Design docs live in `docs/superpowers/`.
```

- [ ] **Step 2: Full verification pass**

Run: `npm run check && npm test && npm run build`
Expected: tsc silent; ALL tests pass; build succeeds.
Then use the superpowers:verification-before-completion skill: with `npm run dev` running, walk the island for ~30 seconds (screenshot), confirm every item in the Task 10/11 visual checklists, and confirm 60fps-smooth movement (no visible stutter).

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: readme with play/tweak/develop instructions"
```
