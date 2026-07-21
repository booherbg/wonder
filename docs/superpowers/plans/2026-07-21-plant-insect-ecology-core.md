# Plant–Insect Ecology Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless, fully-tested core of Wonder's plant–insect ecology — the shared identity map, the flower, and the insect swarm (a cloud plus an internal gene pool) that adapts to a flower via an adaptive metabolism.

**Architecture:** Two new pure-logic modules with no rendering and no game wiring. `idmap.ts` holds the pixel-map math (make, mutate, match, reward, appearance colors). `swarm.ts` holds the ecology entities — `Flower` (map + nectar) and `Swarm` (cloud + gene pool) — and the per-tick step (feed → evolve → population). Everything is seeded by an injected `Rng` so runs are deterministic and testable. Later plans add predation, behaviour, the Simulator UI, and game integration on top of these primitives.

**Tech Stack:** TypeScript, Vitest (`npm test`), `tsc` (`npm run check`). RNG via `src/core/rng.ts` (`makeRng(seed): Rng`, `Rng = () => number`). Colors via `hsl()` in `src/life/genome.ts`.

## Global Constraints

- **Peaceful by construction:** nothing in this system kills — a swarm's *population* rises and falls; it never "dies" as an event. (Predation lands in Plan 2 as a gentle drain.)
- **Deterministic:** all randomness comes from an injected `Rng`. Never call `Math.random()` or `Date.now()` in `src/life/idmap.ts` or `src/life/swarm.ts`.
- **Additive & isolated:** these are brand-new modules. Do **not** modify existing files, worldgen, or any pinned seed in Plan 1. `npm run check` and `npm test` stay green.
- **Game vocabulary in code/comments:** swarm, flower, map, match, reward, nectar, pool, population, adapt. Avoid bio/chemistry phrasing.
- **Map constants (fixed for now, tune later):** grid `MAP_G = 7` (49 cells); colors `MAP_NCOL = 6` (value `0` = neutral/unpainted, `1..6` = colors).

---

## File Structure

- **Create `src/life/idmap.ts`** — pure pixel-map math. No state. Exports: constants, `IdMap`, `randomSensorMap`, `makeFlowerSignature`, `mutateMap`, `matchReward`, `maxReward`, `metabolicEfficiency`, `resemblance`, `appearanceColors`.
- **Create `src/life/swarm.ts`** — ecology entities + step. Exports: `Flower`, `makeFlower`, `regenNectar`, `Swarm`, `makeSwarm`, `feedSwarm`, `evolveSwarm`, `updatePopulation`, `stepSwarm`, and tuning constants.
- **Create `tests/idmap.test.ts`** — unit tests for the map math.
- **Create `tests/swarm.test.ts`** — unit tests for feeding, evolution, population, and one end-to-end adaptation test.

---

### Task 1: The identity map — make, mutate, appearance

**Files:**
- Create: `src/life/idmap.ts`
- Test: `tests/idmap.test.ts`

**Interfaces:**
- Produces: `MAP_G`, `MAP_CELLS`, `MAP_NCOL` (numbers); `IdMap = Uint8Array`; `randomSensorMap(rng: Rng): IdMap`; `makeFlowerSignature(rng: Rng, flowerSize: number): { map: IdMap; accent: Uint8Array }`; `mutateMap(src: IdMap, rng: Rng, flips?: number): IdMap`; `appearanceColors(map: IdMap): string[]`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/idmap.test.ts
import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import {
  MAP_CELLS, MAP_NCOL, randomSensorMap, makeFlowerSignature, mutateMap, appearanceColors,
} from "../src/life/idmap";

test("a random sensor map is the right length with values in range", () => {
  const g = randomSensorMap(makeRng(1));
  expect(g.length).toBe(MAP_CELLS);
  for (const v of g) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(MAP_NCOL);
});

test("a flower signature stamps exactly flowerSize accent cells over a base fill", () => {
  const { map, accent } = makeFlowerSignature(makeRng(2), 6);
  expect(map.length).toBe(MAP_CELLS);
  expect(accent.length).toBe(MAP_CELLS);
  let accentCount = 0, baseFilled = 0;
  for (let i = 0; i < MAP_CELLS; i++) {
    if (accent[i]) accentCount++;
    if (map[i] !== 0) baseFilled++;
  }
  expect(accentCount).toBe(6);
  expect(baseFilled).toBe(MAP_CELLS); // base color fills every cell, accent overlays some
});

test("mutateMap changes at least one cell and stays in range", () => {
  const src = randomSensorMap(makeRng(3));
  const out = mutateMap(src, makeRng(4), 3);
  expect(out).not.toBe(src); // new array
  let diffs = 0;
  for (let i = 0; i < MAP_CELLS; i++) { if (out[i] !== src[i]) diffs++; expect(out[i]).toBeLessThanOrEqual(MAP_NCOL); }
  expect(diffs).toBeGreaterThanOrEqual(1);
});

test("appearanceColors returns a color string per cell", () => {
  const cols = appearanceColors(randomSensorMap(makeRng(5)));
  expect(cols.length).toBe(MAP_CELLS);
  expect(typeof cols[0]).toBe("string");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/idmap.test.ts`
Expected: FAIL — cannot find module `../src/life/idmap`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/life/idmap.ts
import { Rng } from "../core/rng";
import { hsl } from "./genome";

export const MAP_G = 7;
export const MAP_CELLS = MAP_G * MAP_G;
export const MAP_NCOL = 6; // colors 1..6; 0 = neutral

export type IdMap = Uint8Array;

// hue per color index (1..6); index 0 (neutral) renders as a dim ground tone.
const HUES = [0, 8, 44, 168, 276, 192, 338]; // ember, gold, mint, violet, teal, rose

const randColor = (rng: Rng): number => 1 + Math.floor(rng() * MAP_NCOL);

/** A fresh insect sensor map: biased toward neutral so a naive swarm is a cheap generalist. */
export function randomSensorMap(rng: Rng): IdMap {
  const g = new Uint8Array(MAP_CELLS);
  for (let i = 0; i < MAP_CELLS; i++) g[i] = rng() < 0.6 ? 0 : randColor(rng);
  return g;
}

/** A plant's appearance signature: a base/foliage color fills every cell, with `flowerSize`
 *  accent cells (the flower) overlaid in a distinct color. `accent[i]` marks the jackpot cells. */
export function makeFlowerSignature(rng: Rng, flowerSize: number): { map: IdMap; accent: Uint8Array } {
  const base = randColor(rng);
  let flower = randColor(rng);
  if (flower === base) flower = 1 + (flower % MAP_NCOL); // ensure the flower reads against the foliage
  const map = new Uint8Array(MAP_CELLS).fill(base);
  const accent = new Uint8Array(MAP_CELLS);
  const size = Math.max(0, Math.min(MAP_CELLS, Math.floor(flowerSize)));
  const idx = [...Array(MAP_CELLS).keys()];
  for (let k = 0; k < size; k++) {
    const j = k + Math.floor(rng() * (MAP_CELLS - k));
    [idx[k], idx[j]] = [idx[j], idx[k]];
    map[idx[k]] = flower;
    accent[idx[k]] = 1;
  }
  return { map, accent };
}

/** Return a copy with `flips` cells randomly re-rolled (neutral or a color). */
export function mutateMap(src: IdMap, rng: Rng, flips = 2): IdMap {
  const g = src.slice();
  const n = Math.max(1, flips);
  for (let k = 0; k < n; k++) {
    const i = Math.floor(rng() * MAP_CELLS);
    g[i] = rng() < 0.4 ? 0 : randColor(rng);
  }
  return g;
}

/** Render a map to per-cell CSS colors (neutral = a dim ground tone). */
export function appearanceColors(map: IdMap): string[] {
  const out: string[] = new Array(MAP_CELLS);
  for (let i = 0; i < MAP_CELLS; i++) {
    out[i] = map[i] === 0 ? hsl(200, 12, 14) : hsl(HUES[map[i]], 62, 58);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/idmap.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/life/idmap.ts tests/idmap.test.ts
git commit -m "feat(ecology): identity map — make, mutate, appearance colors"
```

---

### Task 2: Matching & reward — the specialist/generalist jackpot

**Files:**
- Modify: `src/life/idmap.ts`
- Test: `tests/idmap.test.ts`

**Interfaces:**
- Consumes: `IdMap`, `MAP_CELLS` from Task 1.
- Produces: `matchReward(sensor: IdMap, flowerMap: IdMap, accent: Uint8Array): number`; `maxReward(flowerMap: IdMap, accent: Uint8Array): number`; `metabolicEfficiency(sensor: IdMap, flowerMap: IdMap, accent: Uint8Array): number` (0..1); `resemblance(sensor: IdMap, flowerMap: IdMap): number` (0..1); constants `BASE_HIT`, `FLOWER_HIT`, `UPKEEP`.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/idmap.test.ts
import { matchReward, metabolicEfficiency, resemblance } from "../src/life/idmap";

test("a perfect sensor beats a partial one, which beats a neutral one", () => {
  const { map, accent } = makeFlowerSignature(makeRng(10), 6);
  const perfect = map.slice();                                   // identical → full reward
  const neutral = new Uint8Array(map.length);                    // all 0 → no reward, no cost
  const partial = map.slice(); partial[map.indexOf(map.find((v) => v !== 0)!)] = 0;
  const rP = matchReward(perfect, map, accent);
  const rPart = matchReward(partial, map, accent);
  const rN = matchReward(neutral, map, accent);
  expect(rP).toBeGreaterThan(rPart);
  expect(rPart).toBeGreaterThan(rN);
});

test("flower (accent) matches are worth more than base matches", () => {
  const { map, accent } = makeFlowerSignature(makeRng(11), 4);
  const baseCell = accent.indexOf(0), flowerCell = accent.indexOf(1);
  const onlyBase = new Uint8Array(map.length); onlyBase[baseCell] = map[baseCell];
  const onlyFlower = new Uint8Array(map.length); onlyFlower[flowerCell] = map[flowerCell];
  expect(matchReward(onlyFlower, map, accent)).toBeGreaterThan(matchReward(onlyBase, map, accent));
});

test("metabolicEfficiency is 0..1 and near 1 for a perfect match", () => {
  const { map, accent } = makeFlowerSignature(makeRng(12), 6);
  const eff = metabolicEfficiency(map.slice(), map, accent);
  expect(eff).toBeGreaterThan(0.9);
  expect(eff).toBeLessThanOrEqual(1);
  expect(metabolicEfficiency(new Uint8Array(map.length), map, accent)).toBe(0);
});

test("resemblance is the fraction of flower-colored cells matched", () => {
  const { map } = makeFlowerSignature(makeRng(13), 6);
  expect(resemblance(map.slice(), map)).toBe(1);
  expect(resemblance(new Uint8Array(map.length), map)).toBe(0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/idmap.test.ts`
Expected: FAIL — `matchReward` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/life/idmap.ts
export const BASE_HIT = 0.12;   // matching a foliage/base cell: generic, works on many plants
export const FLOWER_HIT = 0.9;  // matching a flower accent cell: the specialized jackpot
export const UPKEEP = 0.18;     // cost of holding any colored sensor cell

/** Reward for a sensor working a flower: colored cells cost upkeep and pay on a match
 *  (accent cells pay the jackpot, base cells pay a little). Neutral cells are free and inert. */
export function matchReward(sensor: IdMap, flowerMap: IdMap, accent: Uint8Array): number {
  let r = 0;
  for (let i = 0; i < MAP_CELLS; i++) {
    if (sensor[i] === 0) continue;
    r -= UPKEEP;
    if (sensor[i] === flowerMap[i]) r += accent[i] ? FLOWER_HIT : BASE_HIT;
  }
  return r;
}

/** The best reward possible against this flower (color every cell to match). */
export function maxReward(flowerMap: IdMap, accent: Uint8Array): number {
  let m = 0;
  for (let i = 0; i < MAP_CELLS; i++) m += (accent[i] ? FLOWER_HIT : BASE_HIT) - UPKEEP;
  return Math.max(1e-6, m);
}

/** How efficiently this sensor feeds on this flower, 0..1 (the "adaptive metabolism"). */
export function metabolicEfficiency(sensor: IdMap, flowerMap: IdMap, accent: Uint8Array): number {
  const r = matchReward(sensor, flowerMap, accent);
  return Math.max(0, Math.min(1, r / maxReward(flowerMap, accent)));
}

/** Fraction of the flower's colored cells the sensor reproduces (for resemblance / camouflage). */
export function resemblance(sensor: IdMap, flowerMap: IdMap): number {
  let need = 0, got = 0;
  for (let i = 0; i < MAP_CELLS; i++) if (flowerMap[i] !== 0) { need++; if (sensor[i] === flowerMap[i]) got++; }
  return need ? got / need : 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/idmap.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/life/idmap.ts tests/idmap.test.ts
git commit -m "feat(ecology): match reward, adaptive metabolism, resemblance"
```

---

### Task 3: The swarm evolves toward a flower (selection on the gene pool)

**Files:**
- Create: `src/life/swarm.ts`
- Test: `tests/swarm.test.ts`

**Interfaces:**
- Consumes: `IdMap`, `randomSensorMap`, `makeFlowerSignature`, `mutateMap`, `matchReward`, `resemblance` from idmap.
- Produces: `Flower { map: IdMap; accent: Uint8Array; nectar: number }`; `makeFlower(rng: Rng, flowerSize: number): Flower`; `Swarm { pool: IdMap[]; sensor: IdMap; population: number; energy: number }`; `makeSwarm(rng: Rng, poolSize?: number): Swarm`; `evolveSwarm(sw: Swarm, flower: Flower, rng: Rng): void`; `POOL_SIZE`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/swarm.test.ts
import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { resemblance } from "../src/life/idmap";
import { makeFlower, makeSwarm, evolveSwarm, POOL_SIZE } from "../src/life/swarm";

test("a swarm adapts its sensor toward a flower over generations", () => {
  const rng = makeRng(100);
  const flower = makeFlower(makeRng(101), 6);
  const sw = makeSwarm(makeRng(102));
  const before = resemblance(sw.sensor, flower.map);
  for (let g = 0; g < 250; g++) evolveSwarm(sw, flower, rng);
  const after = resemblance(sw.sensor, flower.map);
  expect(after).toBeGreaterThan(before);
  expect(after).toBeGreaterThan(0.7);
});

test("the gene pool keeps its size across evolution", () => {
  const rng = makeRng(103);
  const flower = makeFlower(makeRng(104), 5);
  const sw = makeSwarm(makeRng(105));
  for (let g = 0; g < 10; g++) evolveSwarm(sw, flower, rng);
  expect(sw.pool.length).toBe(POOL_SIZE);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/swarm.test.ts`
Expected: FAIL — cannot find module `../src/life/swarm`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/life/swarm.ts
import { Rng } from "../core/rng";
import { IdMap, randomSensorMap, makeFlowerSignature, mutateMap, matchReward } from "./idmap";

export const POOL_SIZE = 8; // internal gene pool per swarm — bookkeeping, not spatial agents
export const MUTATE_FLIPS = 2;

export interface Flower {
  map: IdMap;        // full appearance signature (base + flower accent)
  accent: Uint8Array; // 1 where a cell is flower-accent (the jackpot)
  nectar: number;    // 0..1 available now
}

export function makeFlower(rng: Rng, flowerSize: number): Flower {
  const { map, accent } = makeFlowerSignature(rng, flowerSize);
  return { map, accent, nectar: 1 };
}

export interface Swarm {
  pool: IdMap[];   // ~POOL_SIZE varied sensor maps
  sensor: IdMap;   // the current best (representative body/appearance)
  population: number; // 0..SWARM_CAP (Task 4); starts small
  energy: number;  // 0..1 metabolic reserve (Task 4)
}

export function makeSwarm(rng: Rng, poolSize = POOL_SIZE): Swarm {
  const pool: IdMap[] = [];
  for (let i = 0; i < poolSize; i++) pool.push(randomSensorMap(rng));
  return { pool, sensor: pool[0], population: 10, energy: 0.5 };
}

/** One generation: score the pool against the flower, keep the top half, refill by mutation. */
export function evolveSwarm(sw: Swarm, flower: Flower, rng: Rng): void {
  sw.pool.sort((a, b) => matchReward(b, flower.map, flower.accent) - matchReward(a, flower.map, flower.accent));
  const keep = Math.max(1, Math.floor(sw.pool.length / 2));
  const survivors = sw.pool.slice(0, keep);
  const next = survivors.slice();
  while (next.length < sw.pool.length) next.push(mutateMap(survivors[Math.floor(rng() * survivors.length)], rng, MUTATE_FLIPS));
  sw.pool = next;
  sw.sensor = survivors[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/swarm.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/life/swarm.ts tests/swarm.test.ts
git commit -m "feat(ecology): swarm gene pool adapts toward a flower via selection"
```

---

### Task 4: Adaptive metabolism — nectar-gated feeding and population

**Files:**
- Modify: `src/life/swarm.ts`
- Test: `tests/swarm.test.ts`

**Interfaces:**
- Consumes: `Flower`, `Swarm` from Task 3; `metabolicEfficiency` from idmap.
- Produces: `regenNectar(flower: Flower): void`; `feedSwarm(sw: Swarm, flower: Flower): number` (energy gained); `updatePopulation(sw: Swarm): void`; constants `NECTAR_REGEN`, `NECTAR_DRAW`, `LIVING_COST`, `SWARM_CAP`.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/swarm.test.ts
import { makeFlower as mkFlower } from "../src/life/swarm";
import { regenNectar, feedSwarm, updatePopulation, NECTAR_DRAW } from "../src/life/swarm";

test("feeding depletes nectar and regen restores it (capped at 1)", () => {
  const flower = mkFlower(makeRng(200), 6);
  const sw = makeSwarm(makeRng(201));
  flower.nectar = 1;
  feedSwarm(sw, flower);
  expect(flower.nectar).toBeCloseTo(1 - NECTAR_DRAW, 5);
  for (let i = 0; i < 200; i++) regenNectar(flower);
  expect(flower.nectar).toBe(1);
});

test("a well-matched swarm gains more energy per feed than a mismatched one", () => {
  const flower = mkFlower(makeRng(202), 6);
  const good = makeSwarm(makeRng(203)); good.sensor = flower.map.slice(); // perfect match
  const bad = makeSwarm(makeRng(204)); bad.sensor = new Uint8Array(flower.map.length); // neutral
  flower.nectar = 1; const gGain = feedSwarm(good, flower);
  flower.nectar = 1; const bGain = feedSwarm(bad, flower);
  expect(gGain).toBeGreaterThan(bGain);
});

test("population grows when fed and shrinks when starved", () => {
  const sw = makeSwarm(makeRng(205)); sw.energy = 1; sw.population = 10;
  updatePopulation(sw); const grew = sw.population;
  expect(grew).toBeGreaterThan(10);
  sw.energy = 0; for (let i = 0; i < 50; i++) updatePopulation(sw);
  expect(sw.population).toBeLessThan(grew);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/swarm.test.ts`
Expected: FAIL — `feedSwarm` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/life/swarm.ts
import { metabolicEfficiency } from "./idmap";

export const NECTAR_REGEN = 0.02; // per tick
export const NECTAR_DRAW = 0.2;   // most an insect can take in one feed
export const LIVING_COST = 0.02;  // energy burned per tick just living
export const SWARM_CAP = 100;     // population ceiling (finite space)

export function regenNectar(flower: Flower): void {
  flower.nectar = Math.min(1, flower.nectar + NECTAR_REGEN);
}

/** Draw available nectar (capped) and convert it by the swarm's metabolic efficiency. */
export function feedSwarm(sw: Swarm, flower: Flower): number {
  const drawn = Math.min(flower.nectar, NECTAR_DRAW);
  flower.nectar -= drawn;
  const gain = drawn * metabolicEfficiency(sw.sensor, flower.map, flower.accent);
  sw.energy = Math.min(1, sw.energy + gain);
  return gain;
}

/** Living costs energy; population eases toward what the current energy can support. */
export function updatePopulation(sw: Swarm): void {
  sw.energy = Math.max(0, sw.energy - LIVING_COST);
  const target = sw.energy * SWARM_CAP;
  sw.population += (target - sw.population) * 0.05;
  sw.population = Math.max(0, Math.min(SWARM_CAP, sw.population));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/swarm.test.ts`
Expected: PASS (5 tests total).

- [ ] **Step 5: Commit**

```bash
git add src/life/swarm.ts tests/swarm.test.ts
git commit -m "feat(ecology): adaptive metabolism — nectar-gated feeding + population"
```

---

### Task 5: The step — feed, evolve, live — and an end-to-end adaptation test

**Files:**
- Modify: `src/life/swarm.ts`
- Test: `tests/swarm.test.ts`

**Interfaces:**
- Consumes: `regenNectar`, `feedSwarm`, `evolveSwarm`, `updatePopulation`.
- Produces: `stepSwarm(sw: Swarm, flower: Flower, rng: Rng): void` — one tick of the whole loop.

- [ ] **Step 1: Write the failing test**

```ts
// append to tests/swarm.test.ts
import { stepSwarm } from "../src/life/swarm";

test("over a run, a swarm on a flower both adapts and grows its population", () => {
  const rng = makeRng(300);
  const flower = mkFlower(makeRng(301), 6);
  const sw = makeSwarm(makeRng(302));
  sw.population = 5; sw.energy = 0.3;
  const beforeMatch = resemblance(sw.sensor, flower.map);
  for (let t = 0; t < 400; t++) stepSwarm(sw, flower, rng);
  expect(resemblance(sw.sensor, flower.map)).toBeGreaterThan(beforeMatch);
  expect(resemblance(sw.sensor, flower.map)).toBeGreaterThan(0.6);
  expect(sw.population).toBeGreaterThan(5); // a fed, adapted swarm grows
});

test("a swarm on a barren flower (no nectar regen reaching it) does not grow unbounded", () => {
  const rng = makeRng(303);
  const flower = mkFlower(makeRng(304), 6);
  const sw = makeSwarm(makeRng(305));
  for (let t = 0; t < 500; t++) stepSwarm(sw, flower, rng);
  expect(sw.population).toBeLessThanOrEqual(100); // never exceeds the cap
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/swarm.test.ts`
Expected: FAIL — `stepSwarm` is not exported.

- [ ] **Step 3: Write minimal implementation**

```ts
// append to src/life/swarm.ts
/** One tick: the flower refreshes a little nectar, the swarm feeds, its pool evolves, it lives. */
export function stepSwarm(sw: Swarm, flower: Flower, rng: Rng): void {
  regenNectar(flower);
  feedSwarm(sw, flower);
  evolveSwarm(sw, flower, rng);
  updatePopulation(sw);
}
```

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run tests/swarm.test.ts tests/idmap.test.ts`
Expected: PASS (all).
Run: `npm run check`
Expected: no type errors.
Run: `npm test`
Expected: the full suite stays green (these are additive modules).

- [ ] **Step 5: Commit**

```bash
git add src/life/swarm.ts tests/swarm.test.ts
git commit -m "feat(ecology): stepSwarm ties feed+evolve+live into one tick"
```

---

## Self-Review

- **Spec coverage (this plan = the *core* slice of the ecology spec):** identity map (base+flower layers) ✓ Task 1; matching + adaptive metabolism + the specialist/generalist jackpot ✓ Task 2; swarm = cloud + internal gene pool with selection ✓ Task 3; nectar-gated pulsed feeding + population ✓ Task 4; the per-tick loop + end-to-end adaptation ✓ Task 5. *Deferred to later plans (by design):* camouflage/conspicuousness (`resemblance` is built here, used in Plan 2), predation, behaviour genes, divergence, spatial foraging/home, pollination back-effect on plants, the Simulator UI, and game wiring.
- **Placeholders:** none — every step has real code and an exact run command.
- **Type consistency:** `IdMap = Uint8Array` throughout; `Flower { map, accent, nectar }` and `Swarm { pool, sensor, population, energy }` are used identically across Tasks 3–5; `matchReward(sensor, flowerMap, accent)` signature is stable.

## Notes for the next plans

- **Plan 2 (predation)** will add `conspicuousness(sw, plantMap) = 1 − resemblance(sensor, plantMap)` (reusing `resemblance`) and a gentle population drain; swarms gain a spatial position + home flower there.
- The ecology-holds discipline (`tests/ecology-holds.test.ts`) is the model for a later "swarms don't wipe / don't explode" guard once predation exists.
