# The Hollow, Stage 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A new island style whose plant ecology is shaped by mineral scarcity and a real fitness function, burned in for hundreds of generations before the player's first frame, so every correlation visible on a walk was produced by selection rather than authored.

**Architecture:** Four new pure modules (`minerals`, `fitness`, `motion`, `burnin`) with no rendering or DOM dependencies, plus one narrow hook into `Flora.simTick` that is inert unless a selection context is supplied. The existing island style must remain byte-identical: every new code path is gated behind either a `null` default or a `style === "hollow"` check, and Task 11 proves that with a determinism test.

**Tech Stack:** TypeScript (strict, `npm run check`), Vitest (`npm test`), Vite, canvas 2D. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-03-hollow-design.md`

## Global Constraints

- **Ruggedness K = 3** for the NK fitness landscape. Usable band 2–4. Must not scale with genome size.
- **Six minerals**, each a float in `[0, 1]`.
- **Seeded RNG only.** Use `makeRng` / `hash2d` from `src/core/rng.ts`. No `Math.random()` anywhere.
- **The original island style must be byte-identical.** Any new field defaults to `undefined`/`null`/`false` and draws zero additional RNG when absent.
- **Two different Ks exist in this project.** The NK-landscape ruggedness K (3) and the regulatory-network K (2, stage 2). Name them `RUGGEDNESS_K` and `REGULATORY_K` — never bare `K`.
- **Writing standard** (`docs/WRITING-STANDARD.md`) governs comments and commit messages: define before use, no soft analogies, numbers not adjectives.
- **The repo's tsc runs `noUnusedLocals`.** An unused import in a test file fails `npm run check`. Drop unused imports rather than weakening a test.
- **Every task ends with `npm run check && npm test` passing** before its commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/life/minerals.ts` (new) | The 6-mineral per-tile field: generation, sampling, depletion, return-at-death. Pure. |
| `src/life/fitness.ts` (new) | NK fitness landscape at `RUGGEDNESS_K = 3`; scores a genome against a mineral sample and a light level. Pure. |
| `src/life/motion.ts` (new) | Motion signature: genome → twelve gait features → per-frame offset. Pure. |
| `src/life/burnin.ts` (new) | Headless generation runner over `Flora`, with a floor condition and a report. |
| `src/life/flora.ts` (modify) | One selection hook in `simTick`; inert when `selection` is null. |
| `src/world/config.ts` (modify) | `HOLLOW_CONFIG` — small, dense, enclosed island parameters. |
| `src/game/daynight.ts` (modify) | `tintStrength(nowMs)` — the term glow must key off instead of darkness. |
| `src/render/renderer.ts` (modify) | Glow gating moves from `darkness` to `tintStrength`; motion offset applied to critter draw. |
| `tests/minerals.test.ts`, `tests/fitness.test.ts`, `tests/motion.test.ts`, `tests/burnin.test.ts`, `tests/hollow-determinism.test.ts` (new) | One test file per new module, plus the byte-identical guard. |

---

## Task 1: The mineral field

**Files:**
- Create: `src/life/minerals.ts`
- Test: `tests/minerals.test.ts`

**Interfaces:**
- Consumes: `makeRng`, `hash2d` from `src/core/rng.ts`; `WorldMap`, `Tile`, `tileAt` from `src/world/types.ts`.
- Produces:
  - `MINERAL_COUNT = 6`
  - `type MineralVec = Float32Array` (length 6, each value in `[0, 1]`)
  - `class MineralField` with `sample(tx, ty): MineralVec`, `draw(tx, ty, demand: MineralVec, amount: number): number`, `deposit(tx, ty, vec: MineralVec, amount: number): void`, `totalAt(tx, ty): number`
  - `function mineralFieldFor(map: WorldMap, seed: number): MineralField`

- [ ] **Step 1: Write the failing test**

```ts
// tests/minerals.test.ts
import { describe, expect, it } from "vitest";
import { MINERAL_COUNT, MineralField, mineralFieldFor } from "../src/life/minerals";
import { generate } from "../src/world/generate";
import { DEFAULT_CONFIG } from "../src/world/config";

function land(map: ReturnType<typeof generate>): { tx: number; ty: number } {
  return { tx: map.spawn.x, ty: map.spawn.y };
}

describe("MineralField", () => {
  it("gives every land tile six minerals in [0,1]", () => {
    const map = generate(1234, DEFAULT_CONFIG);
    const f = mineralFieldFor(map, 1234);
    const { tx, ty } = land(map);
    const v = f.sample(tx, ty);
    expect(v.length).toBe(MINERAL_COUNT);
    for (const x of v) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for a seed", () => {
    const map = generate(99, DEFAULT_CONFIG);
    const a = mineralFieldFor(map, 99).sample(map.spawn.x, map.spawn.y);
    const b = mineralFieldFor(map, 99).sample(map.spawn.x, map.spawn.y);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("varies across the island rather than being flat", () => {
    const map = generate(7, DEFAULT_CONFIG);
    const f = mineralFieldFor(map, 7);
    const seen = new Set<string>();
    for (let ty = 0; ty < map.height; ty += 17) {
      for (let tx = 0; tx < map.width; tx += 17) {
        seen.add(Array.from(f.sample(tx, ty), (v) => Math.round(v * 10)).join(","));
      }
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it("draw takes at most what is present and reports what it got", () => {
    const map = generate(3, DEFAULT_CONFIG);
    const f = mineralFieldFor(map, 3);
    const { tx, ty } = land(map);
    const demand = new Float32Array(MINERAL_COUNT).fill(1);
    const before = f.totalAt(tx, ty);
    const got = f.draw(tx, ty, demand, 1);
    expect(got).toBeGreaterThanOrEqual(0);
    expect(got).toBeLessThanOrEqual(MINERAL_COUNT);
    expect(f.totalAt(tx, ty)).toBeLessThanOrEqual(before);
    for (const x of f.sample(tx, ty)) expect(x).toBeGreaterThanOrEqual(0);
  });

  it("deposit clamps an overshoot back to the untouched sample", () => {
    const map = generate(5, DEFAULT_CONFIG);
    const f = mineralFieldFor(map, 5);
    const { tx, ty } = land(map);
    const untouched = Array.from(f.sample(tx, ty));
    // Draw first, so a delta entry exists — without this, deposit early-returns
    // and the assertions below pass whatever deposit does.
    const demand = new Float32Array(MINERAL_COUNT).fill(1);
    f.draw(tx, ty, demand, 0.5);
    expect(f.totalAt(tx, ty)).toBeLessThan(untouched.reduce((s, v) => s + v, 0));
    // Put back far more than was taken: the tile must return to its untouched
    // values and stop there, never climbing past them.
    f.deposit(tx, ty, new Float32Array(MINERAL_COUNT).fill(1), 10);
    const after = f.sample(tx, ty);
    for (let m = 0; m < MINERAL_COUNT; m++) {
      expect(after[m]).toBeLessThanOrEqual(1);
      expect(after[m]).toBeCloseTo(untouched[m], 5);
    }
  });

  it("depositing onto a never-drawn tile is a no-op", () => {
    // Intentional: deposit only repays what was taken. Pinned deliberately so
    // a future change cannot start creating minerals from nothing unnoticed.
    const map = generate(6, DEFAULT_CONFIG);
    const f = mineralFieldFor(map, 6);
    const { tx, ty } = land(map);
    const before = Array.from(f.sample(tx, ty));
    f.deposit(tx, ty, new Float32Array(MINERAL_COUNT).fill(1), 10);
    expect(Array.from(f.sample(tx, ty))).toEqual(before);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/minerals.test.ts`
Expected: FAIL — `Cannot find module '../src/life/minerals'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/life/minerals.ts
import { hash2d } from "../core/rng";
import { Tile, WorldMap, tileAt } from "../world/types";

// ─────────────────────────────────────────────────────────────────────────────
// The mineral field. Six quantities per land tile, each in [0, 1]. Plants draw
// what their genome demands, deplete it, and return a different vector at
// death. Scarcity is the whole point: no tile carries enough of everything for
// one genome to be good at everything, which is what converts drift into
// specialization.
// ─────────────────────────────────────────────────────────────────────────────

export const MINERAL_COUNT = 6;

/** Six mineral quantities, each in [0, 1]. Length is always MINERAL_COUNT. */
export type MineralVec = Float32Array;

// Each mineral gets its own noise lattice, at its own scale, so the six do not
// co-vary. Scales are coprime-ish so their patches do not align into one map.
const SCALES = [23, 31, 37, 43, 53, 61] as const;

function lattice(tx: number, ty: number, seed: number, mineral: number): number {
  const s = SCALES[mineral];
  const gx = Math.floor(tx / s);
  const gy = Math.floor(ty / s);
  const fx = tx / s - gx;
  const fy = ty / s - gy;
  const salt = seed ^ (mineral * 0x9e3779b1);
  const a = hash2d(gx, gy, salt);
  const b = hash2d(gx + 1, gy, salt);
  const c = hash2d(gx, gy + 1, salt);
  const d = hash2d(gx + 1, gy + 1, salt);
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export class MineralField {
  // Depletion deltas only. A tile absent from this map reads its lattice value
  // directly, so an untouched island costs no memory.
  private delta = new Map<number, Float32Array>();

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly seed: number,
    private readonly barren: (tx: number, ty: number) => boolean,
  ) {}

  private key(tx: number, ty: number): number {
    return ty * this.width + tx;
  }

  sample(tx: number, ty: number): MineralVec {
    const out = new Float32Array(MINERAL_COUNT);
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return out;
    if (this.barren(tx, ty)) return out;
    const d = this.delta.get(this.key(tx, ty));
    for (let m = 0; m < MINERAL_COUNT; m++) {
      const base = lattice(tx, ty, this.seed, m);
      const v = base - (d ? d[m] : 0);
      out[m] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    return out;
  }

  totalAt(tx: number, ty: number): number {
    let sum = 0;
    const v = this.sample(tx, ty);
    for (let m = 0; m < MINERAL_COUNT; m++) sum += v[m];
    return sum;
  }

  /**
   * Take up to `amount` × demand[m] of each mineral. Returns the total actually
   * obtained, which is less than the total demanded wherever the tile is short —
   * that shortfall is the selective pressure.
   */
  draw(tx: number, ty: number, demand: MineralVec, amount: number): number {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return 0;
    if (this.barren(tx, ty)) return 0;
    const have = this.sample(tx, ty);
    const k = this.key(tx, ty);
    let d = this.delta.get(k);
    if (!d) {
      d = new Float32Array(MINERAL_COUNT);
      this.delta.set(k, d);
    }
    let got = 0;
    for (let m = 0; m < MINERAL_COUNT; m++) {
      const want = demand[m] * amount;
      const take = want < have[m] ? want : have[m];
      d[m] += take;
      got += take;
    }
    return got;
  }

  /** Return minerals to a tile — what a plant leaves when it dies. */
  deposit(tx: number, ty: number, vec: MineralVec, amount: number): void {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return;
    const k = this.key(tx, ty);
    const d = this.delta.get(k);
    if (!d) return; // nothing was ever taken; the lattice is already at full
    for (let m = 0; m < MINERAL_COUNT; m++) {
      d[m] -= vec[m] * amount;
      if (d[m] < 0) d[m] = 0;
    }
  }
}

const BARREN: ReadonlySet<Tile> = new Set([
  Tile.DeepWater,
  Tile.ShallowWater,
  Tile.Snow,
  Tile.Cliff,
]);

export function mineralFieldFor(map: WorldMap, seed: number): MineralField {
  return new MineralField(map.width, map.height, seed ^ 0x6d316e33, (tx, ty) =>
    BARREN.has(tileAt(map, tx, ty)),
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/minerals.test.ts && npm run check`
Expected: 5 passed, tsc clean

- [ ] **Step 5: Commit**

```bash
git add src/life/minerals.ts tests/minerals.test.ts
git commit -m "feat(life): a six-mineral per-tile field, drawn down and returned

Six noise lattices at coprime scales so the minerals do not co-vary into
one map. Depletion is stored as deltas, so an untouched island costs no
memory and reads its lattice directly."
```

---

## Task 2: The NK fitness landscape

**Files:**
- Create: `src/life/fitness.ts`
- Test: `tests/fitness.test.ts`

**Interfaces:**
- Consumes: `makeRng`, `hash2d`; `Genome`, `NUMERIC_TRAITS`, `GENOME_BOUNDS` from `src/life/genome.ts`; `MineralVec`, `MINERAL_COUNT` from `src/life/minerals.ts`.
- Produces:
  - `RUGGEDNESS_K = 3`
  - `interface Niche { minerals: MineralVec; light: number }`
  - `class FitnessLandscape` with `score(g: Genome, niche: Niche): number` in `[0, 1]`, and `demandOf(g: Genome): MineralVec`
  - `function landscapeFor(seed: number): FitnessLandscape`

- [ ] **Step 1: Write the failing test**

```ts
// tests/fitness.test.ts
import { describe, expect, it } from "vitest";
import { RUGGEDNESS_K, landscapeFor } from "../src/life/fitness";
import { MINERAL_COUNT } from "../src/life/minerals";
import { PlantForm, mutate } from "../src/life/genome";
import { makeRng } from "../src/core/rng";

const G = {
  form: PlantForm.Flower,
  hue: 0.3, hue2: 0.5, sat: 0.7, height: 0.5, spread: 0.5,
  petals: 5, leaves: 2, lean: 0, glow: 0.1,
};

function niche(fill: number, light = 0.5) {
  return { minerals: new Float32Array(MINERAL_COUNT).fill(fill), light };
}

describe("FitnessLandscape", () => {
  it("uses K = 3", () => {
    expect(RUGGEDNESS_K).toBe(3);
  });

  it("scores into [0,1]", () => {
    const L = landscapeFor(42);
    const rng = makeRng(1);
    for (let i = 0; i < 200; i++) {
      const g = mutate(G, rng, 0.5);
      const s = L.score(g, niche(rng()));
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for a seed", () => {
    expect(landscapeFor(8).score(G, niche(0.5))).toBe(landscapeFor(8).score(G, niche(0.5)));
  });

  it("gives different islands different landscapes", () => {
    expect(landscapeFor(8).score(G, niche(0.5))).not.toBe(landscapeFor(9).score(G, niche(0.5)));
  });

  it("rewards a genome more in the niche it demands than in a starved one", () => {
    const L = landscapeFor(11);
    expect(L.score(G, niche(0.9))).toBeGreaterThan(L.score(G, niche(0.02)));
  });

  it("demandOf returns six non-negative demands", () => {
    const d = landscapeFor(3).demandOf(G);
    expect(d.length).toBe(MINERAL_COUNT);
    for (const x of d) expect(x).toBeGreaterThanOrEqual(0);
  });

  // Ruggedness must be measured by EXHAUSTIVE ENUMERATION, not by sampling
  // hill climbs. A sampled climb over 9 traits at 8 quantisation levels
  // (8^9 ~= 1.3e8 genotypes) never collides across 40 walks at any K, so it
  // returns 40 distinct peaks whatever the wiring does and cannot
  // discriminate. Bench 2 did not sample either — it enumerated 65,536
  // genotypes to find its 58 optima.
  //
  // Reduce each of the 9 numeric traits to two levels (its bound minimum and
  // maximum) for 2^9 = 512 genotypes, then count true local optima: a
  // genotype where no single-bit flip scores higher.
  function genomeForBits(bits: number): Genome {
    const g: Genome = { ...G };
    NUMERIC_TRAITS.forEach((t, i) => {
      const [lo, hi] = GENOME_BOUNDS[t];
      (g as unknown as Record<string, number>)[t] = (bits >> i) & 1 ? hi : lo;
    });
    return g;
  }

  function countLocalOptima(
    L: ReturnType<typeof landscapeForK>,
    n: { minerals: Float32Array; light: number },
  ): number {
    const score = new Float64Array(512);
    for (let b = 0; b < 512; b++) score[b] = L.score(genomeForBits(b), n);
    let optima = 0;
    for (let b = 0; b < 512; b++) {
      let best = true;
      for (let i = 0; i < 9; i++) if (score[b ^ (1 << i)] > score[b]) { best = false; break; }
      if (best) optima++;
    }
    return optima;
  }

  // Measured on this landscape: k=0 -> 1 local optimum, k=3 -> 14, at a fixed
  // niche on seed 21. k=0 collapsing to a single peak is the pre-NK baseline
  // the layer exists to move past — bench 2's "one answer, always, on every
  // island". The k3 > k0*2 threshold sits well under the measured 14x gap.
  it("K=3 produces clearly more local optima than K=0 (exhaustive 512-genotype enumeration)", () => {
    const n = niche(0.6);
    const optimaAtK0 = countLocalOptima(landscapeForK(21, 0), n);
    const optimaAtK3 = countLocalOptima(landscapeForK(21, RUGGEDNESS_K), n);
    expect(optimaAtK3).toBeGreaterThan(optimaAtK0 * 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fitness.test.ts`
Expected: FAIL — `Cannot find module '../src/life/fitness'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/life/fitness.ts
import { hash2d } from "../core/rng";
import { GENOME_BOUNDS, Genome, NUMERIC_TRAITS, NumericTrait } from "./genome";
import { MINERAL_COUNT, MineralVec } from "./minerals";

// ─────────────────────────────────────────────────────────────────────────────
// The NK fitness landscape. Each trait's contribution depends on its own value
// and on RUGGEDNESS_K other traits, so the landscape has many local optima
// rather than one global answer (K=0) or none reachable (K=N-1).
//
// K = 3 is bench 2's recommendation, usable band 2-4. At N=16 it gives 58 local
// optima among 65,536 genotypes, top-three basins holding 29%, and a population
// run ending on 4.0 distinct peaks with the dominant one at 87% — "one common
// form plus a few odd rare ones".
//
// Do NOT raise K as the genome grows. Bench 2's argmax across N = 10..20 is
// 4, 3, 2, 3, 3, 3 — a small constant. Genome size is safe to grow; K is not.
//
// This K is NOT the regulatory-network K (2, stage 2). Different models,
// different quantities; the numbers must never be pooled.
// ─────────────────────────────────────────────────────────────────────────────

export const RUGGEDNESS_K = 3;

/** What a place offers: what minerals are present, and how much light. */
export interface Niche {
  minerals: MineralVec;
  light: number; // 0 = deep shade, 1 = open sun
}

// Traits are scored in a fixed order so the epistasis wiring is stable.
const TRAITS: readonly NumericTrait[] = NUMERIC_TRAITS;
const N = TRAITS.length;

/** Normalise a trait to [0,1] using its declared bounds. */
function norm(g: Genome, t: NumericTrait): number {
  const [lo, hi] = GENOME_BOUNDS[t];
  const v = (g[t] - lo) / (hi - lo);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class FitnessLandscape {
  // partners[i] = the K trait indices trait i's contribution also depends on.
  private readonly partners: Uint8Array;

  constructor(private readonly seed: number) {
    this.partners = new Uint8Array(N * RUGGEDNESS_K);
    for (let i = 0; i < N; i++) {
      // Deterministic, distinct partners: walk forward by seeded strides,
      // skipping i itself. Fixed wiring per island.
      let picked = 0;
      let probe = 1;
      while (picked < RUGGEDNESS_K && probe < N * 4) {
        const j = (i + 1 + Math.floor(hash2d(i, probe, seed) * (N - 1))) % N;
        let dup = j === i;
        for (let q = 0; q < picked; q++) if (this.partners[i * RUGGEDNESS_K + q] === j) dup = true;
        if (!dup) this.partners[i * RUGGEDNESS_K + picked++] = j;
        probe++;
      }
      // Degenerate fallback for tiny genomes: pad with the next index along.
      while (picked < RUGGEDNESS_K) this.partners[i * RUGGEDNESS_K + picked++] = (i + 1) % N;
    }
  }

  /**
   * What this genome needs from the ground: six demands, each >= 0. Derived
   * from the genome so a bigger, showier plant costs more, and so which
   * minerals it wants depends on which traits it invests in.
   */
  demandOf(g: Genome): MineralVec {
    const out = new Float32Array(MINERAL_COUNT);
    for (let i = 0; i < N; i++) {
      const v = norm(g, TRAITS[i]);
      out[i % MINERAL_COUNT] += v / Math.ceil(N / MINERAL_COUNT);
    }
    for (let m = 0; m < MINERAL_COUNT; m++) if (out[m] > 1) out[m] = 1;
    return out;
  }

  /**
   * Fitness in [0, 1]: the mean of N per-trait contributions, each a function
   * of the trait, its K partners, and what the niche supplies.
   */
  score(g: Genome, niche: Niche): number {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      // Quantise the trait and its partners into a lookup coordinate. 8 levels
      // per trait keeps the table implicit (hashed) rather than allocated.
      let coord = Math.min(7, Math.floor(norm(g, TRAITS[i]) * 8));
      for (let k = 0; k < RUGGEDNESS_K; k++) {
        const j = this.partners[i * RUGGEDNESS_K + k];
        coord = coord * 8 + Math.min(7, Math.floor(norm(g, TRAITS[j]) * 8));
      }
      // The landscape value for this trait-and-partners combination.
      const base = hash2d(i, coord, this.seed);
      // What the ground actually supplies for the mineral this trait draws on,
      // and whether the light suits it. A trait scoring well on a landscape it
      // cannot afford does not count.
      const supply = niche.minerals[i % MINERAL_COUNT];
      const want = norm(g, TRAITS[i]);
      const afford = supply >= want * 0.9 ? 1 : supply / Math.max(1e-6, want * 0.9);
      sum += base * (0.35 + 0.65 * afford);
    }
    const mean = sum / N;
    // Light modulates the whole plant, not one trait: tall plants want sun,
    // low ones tolerate shade. Bounded so light alone never decides fitness.
    const wantsLight = norm(g, "height");
    const lightFit = 1 - Math.abs(niche.light - wantsLight) * 0.5;
    const f = mean * (0.7 + 0.3 * lightFit);
    return f < 0 ? 0 : f > 1 ? 1 : f;
  }
}

export function landscapeFor(seed: number): FitnessLandscape {
  return new FitnessLandscape(seed ^ 0x4e4b3300);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/fitness.test.ts && npm run check`
Expected: 7 passed, tsc clean

- [ ] **Step 5: Commit**

```bash
git add src/life/fitness.ts tests/fitness.test.ts
git commit -m "feat(life): an NK fitness landscape at K=3

Bench 2's recommendation, with its constraint written into the module
doc: argmax K across N = 10..20 is 4, 3, 2, 3, 3, 3, so the genome may
grow but K may not grow with it. Named RUGGEDNESS_K to keep it distinct
from the regulatory-network K of stage 2."
```

---

## Task 3: The selection hook in Flora

`Flora.simTick` currently computes `repro` from `reproChance`, tending, rain and bloom, with no reference to whether the genome suits where it stands (`src/life/flora.ts:552`). That is the drift the spec diagnoses. This task adds one optional hook and changes nothing when it is absent.

**Files:**
- Modify: `src/life/flora.ts` (the `FloraTuning` interface at :72, `DEFAULT_TUNING` at :94, and `simTick` at :523)
- Test: `tests/flora-selection.test.ts` (create)

**Interfaces:**
- Consumes: `Niche`, `FitnessLandscape` (Task 2); `MineralField` (Task 1).
- Produces:
  - `interface SelectionContext { fitness(g: Genome, tx: number, ty: number): number }`
  - `FloraTuning.selection: SelectionContext | null` — **default `null`**
  - When non-null, reproduction is scaled by `0.35 + 1.3 × fitness` and age-death by `1.6 − 1.2 × fitness`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/flora-selection.test.ts
import { describe, expect, it } from "vitest";
import { Flora, SelectionContext } from "../src/life/flora";
import { generate } from "../src/world/generate";
import { DEFAULT_CONFIG } from "../src/world/config";
import { generatePlantSpecies } from "../src/life/species";

function build(sel: SelectionContext | null) {
  const map = generate(2026, DEFAULT_CONFIG);
  const species = generatePlantSpecies(2026);
  return new Flora(map, species, 2026, { selection: sel });
}

describe("Flora selection", () => {
  it("with no selection context, is byte-identical to today", () => {
    const a = build(null);
    const b = build(null);
    for (let i = 0; i < 200; i++) { a.simTick(); b.simTick(); }
    expect(a.all.length).toBe(b.all.length);
    expect(a.all.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join("|"))
      .toBe(b.all.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join("|"));
  });

  it("draws no extra rng when selection is null", () => {
    // Two Floras, one constructed with an explicit null selection and one with
    // the field omitted entirely, must agree tick for tick.
    const map = generate(77, DEFAULT_CONFIG);
    const species = generatePlantSpecies(77);
    const a = new Flora(map, species, 77, {});
    const b = new Flora(map, species, 77, { selection: null });
    for (let i = 0; i < 150; i++) { a.simTick(); b.simTick(); }
    expect(a.all.length).toBe(b.all.length);
  });

  it("with selection on, high-fitness genomes come to outnumber low ones", () => {
    // A PAIRED CONTROL, not a before/after on one run. Mean height rises
    // slightly under drift alone (measured +0.0006), so "after > before" can
    // pass with selection entirely disabled on a favourable seed — assert the
    // gap against a twin instead.
    //
    // Measured on this seed, 1500 ticks: real selection gives
    // Δ(selected − drift) ≈ +0.353; with both selection channels disabled the
    // two populations are identical and Δ is exactly 0. 0.1 sits far above the
    // noise floor and far below the observed effect.
    const meanHeight = (f: Flora) =>
      f.all.reduce((s, p) => s + p.genome.height, 0) / f.all.length;

    const map = generate(31, DEFAULT_CONFIG);
    const species = generatePlantSpecies(31);
    const selected = new Flora(map, species, 31, {
      selection: { fitness: (g) => g.height },
    });
    const drift = new Flora(map, species, 31, { selection: null });
    for (let i = 0; i < 1500; i++) {
      selected.simTick();
      drift.simTick();
    }
    expect(meanHeight(selected) - meanHeight(drift)).toBeGreaterThan(0.1);
  });

  it("selection is deterministic for a seed", () => {
    const sel = { fitness: (g: { height: number }) => g.height };
    const map = generate(5, DEFAULT_CONFIG);
    const species = generatePlantSpecies(5);
    const a = new Flora(map, species, 5, { selection: sel as SelectionContext });
    const b = new Flora(map, species, 5, { selection: sel as SelectionContext });
    for (let i = 0; i < 300; i++) { a.simTick(); b.simTick(); }
    expect(a.all.length).toBe(b.all.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/flora-selection.test.ts`
Expected: FAIL — `selection` is not a property of `FloraTuning`; tsc error and the height test fails.

- [ ] **Step 3: Write minimal implementation**

Add above `FloraTuning` in `src/life/flora.ts`:

```ts
/**
 * What decides whether a plant standing here breeds or dies. Supplied only by
 * the Hollow; every other island passes null and behaves exactly as before.
 * `fitness` returns [0, 1] for this genome at this tile.
 */
export interface SelectionContext {
  fitness(g: Genome, tx: number, ty: number): number;
}
```

Add to the `FloraTuning` interface:

```ts
  /** Selection, or null for pure drift. Null ⇒ zero extra rng, byte-identical. */
  selection: SelectionContext | null;
```

Add to `DEFAULT_TUNING`:

```ts
  selection: null, // pure drift, exactly as every island behaved before the Hollow
```

In `simTick`, replace the age-death block:

```ts
      if (age > t.lifespan && this.rng() < 0.15) {
        this.removePlant(p);
        continue;
      }
```

with:

```ts
      // Selection, when the island has any: a plant suited to where it stands
      // holds on longer and breeds harder. Computed once and reused for both
      // gates so a tick costs at most one fitness call per examined plant.
      const fit = t.selection
        ? t.selection.fitness(
            p.genome,
            Math.floor(p.x / TILE_SIZE),
            Math.floor(p.y / TILE_SIZE),
          )
        : 0;
      const deathScale = t.selection ? 1.6 - 1.2 * fit : 1;
      if (age > t.lifespan && this.rng() < 0.15 * deathScale) {
        this.removePlant(p);
        continue;
      }
```

and replace:

```ts
      let repro = t.reproChance * (this.tended(p.x, p.y) ? 2 : 1); // tended ground breeds eagerly
```

with:

```ts
      let repro = t.reproChance * (this.tended(p.x, p.y) ? 2 : 1); // tended ground breeds eagerly
      if (t.selection) repro *= 0.35 + 1.3 * fit; // suited plants breed; unsuited ones fade
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/flora-selection.test.ts && npm test && npm run check`
Expected: 4 passed in the new file; **the whole existing suite still passes** — that is the byte-identical guarantee.

- [ ] **Step 5: Commit**

```bash
git add src/life/flora.ts tests/flora-selection.test.ts
git commit -m "feat(life): selection in Flora, inert unless an island asks for it

Reproduction consulted reproChance, tending and weather but never whether
a genome suited where it stood, which is bench 2's drift control: fitness
pinned at 0.500 forever. A null SelectionContext draws zero extra rng, so
every existing island is unchanged."
```

---

## Task 4: The burn-in runner

**Files:**
- Create: `src/life/burnin.ts`
- Test: `tests/burnin.test.ts`

**Interfaces:**
- Consumes: `Flora`, `SelectionContext` (Task 3); `MineralField` (Task 1); `FitnessLandscape` (Task 2).
- Produces:
  - `interface BurnInReport { generations: number; species: number; plants: number; elapsedMs: number; floorHit: boolean }`
  - `function burnIn(flora: Flora, generations: number, onProgress?: (done: number, total: number) => void): BurnInReport`
  - `const BURN_IN_GENERATIONS = 400`, `const BURN_IN_SPECIES_FLOOR = 4`

- [ ] **Step 1: Write the failing test**

```ts
// tests/burnin.test.ts
import { describe, expect, it } from "vitest";
import { BURN_IN_GENERATIONS, BURN_IN_SPECIES_FLOOR, burnIn } from "../src/life/burnin";
import { Flora } from "../src/life/flora";
import { generate } from "../src/world/generate";
import { DEFAULT_CONFIG } from "../src/world/config";
import { generatePlantSpecies } from "../src/life/species";

function fresh(seed = 1) {
  const map = generate(seed, DEFAULT_CONFIG);
  return new Flora(map, generatePlantSpecies(seed), seed, {
    selection: { fitness: (g) => g.height },
  });
}

describe("burnIn", () => {
  it("advances the flora clock by the generations asked for", () => {
    const f = fresh();
    const before = f.tick;
    const r = burnIn(f, 50);
    expect(f.tick).toBe(before + 50);
    expect(r.generations).toBe(50);
  });

  it("reports what survived", () => {
    const r = burnIn(fresh(), 100);
    expect(r.plants).toBeGreaterThan(0);
    expect(r.species).toBeGreaterThan(0);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("reports the floor rather than failing silently when too few species survive", () => {
    const map = generate(4, DEFAULT_CONFIG);
    // A selection context that rewards exactly one narrow genome starves the
    // rest, which is the failure mode the floor exists to surface.
    const f = new Flora(map, generatePlantSpecies(4), 4, {
      selection: { fitness: (g) => (g.height > 0.97 ? 1 : 0) },
    });
    const r = burnIn(f, 400);
    expect(typeof r.floorHit).toBe("boolean");
    if (r.species < BURN_IN_SPECIES_FLOOR) expect(r.floorHit).toBe(true);
  });

  it("calls onProgress so a loading screen can show something", () => {
    const seen: number[] = [];
    burnIn(fresh(), 40, (done) => seen.push(done));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(40);
  });

  it("is deterministic for a seed", () => {
    const a = burnIn(fresh(9), 120);
    const b = burnIn(fresh(9), 120);
    expect(a.plants).toBe(b.plants);
    expect(a.species).toBe(b.species);
  });

  it("ships a default generation count in the spec's 300-600 band", () => {
    expect(BURN_IN_GENERATIONS).toBeGreaterThanOrEqual(300);
    expect(BURN_IN_GENERATIONS).toBeLessThanOrEqual(600);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/burnin.test.ts`
Expected: FAIL — `Cannot find module '../src/life/burnin'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/life/burnin.ts
import { Flora } from "./flora";

// ─────────────────────────────────────────────────────────────────────────────
// Burn-in. The Hollow runs its own ecology headless before the player's first
// frame, so what they walk into is the survivor set rather than a starting
// state. Three things this buys, all load-bearing:
//
//   - Correlations are earned. A broad leaf stands in shade because narrow
//     leaved competitors lost there, not because a generator placed it.
//   - Loss is already complete. Everything that could crash crashed off
//     screen, so the island is peaceful because it is old rather than because
//     it is protected.
//   - The island knows its own history and can be asked about it.
// ─────────────────────────────────────────────────────────────────────────────

/** Generations run before the first frame. Spec band: 300-600. */
export const BURN_IN_GENERATIONS = 400;

/** Below this many surviving species, the burn-in is reported as failed. */
export const BURN_IN_SPECIES_FLOOR = 4;

/** Progress is reported at most this many times, to keep the callback cheap. */
const PROGRESS_STEPS = 20;

export interface BurnInReport {
  generations: number;
  species: number; // distinct species with at least one survivor
  plants: number;
  elapsedMs: number;
  /** True when fewer than BURN_IN_SPECIES_FLOOR species survived. Never silent. */
  floorHit: boolean;
}

export function burnIn(
  flora: Flora,
  generations: number = BURN_IN_GENERATIONS,
  onProgress?: (done: number, total: number) => void,
): BurnInReport {
  const started = Date.now();
  const every = Math.max(1, Math.floor(generations / PROGRESS_STEPS));
  for (let i = 1; i <= generations; i++) {
    flora.simTick();
    if (onProgress && (i % every === 0 || i === generations)) onProgress(i, generations);
  }
  let species = 0;
  for (const count of flora.speciesCounts.values()) if (count > 0) species++;
  return {
    generations,
    species,
    plants: flora.all.length,
    elapsedMs: Date.now() - started,
    floorHit: species < BURN_IN_SPECIES_FLOOR,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/burnin.test.ts && npm run check`
Expected: 6 passed, tsc clean

- [ ] **Step 5: Measure the real cost and record it**

This is the spec's named risk: 300–600 generations was a target, not a measurement.

Add this case to the end of the `describe` block in `tests/burnin.test.ts`:

```ts
  it("records the cost of a full-size burn-in", () => {
    const r = burnIn(fresh(2026), BURN_IN_GENERATIONS);
    // Not an assertion about speed — a measurement printed for the spec.
    console.log(`burn-in: ${BURN_IN_GENERATIONS} generations in ${r.elapsedMs}ms, ` +
      `${r.plants} plants, ${r.species} species`);
    expect(r.generations).toBe(BURN_IN_GENERATIONS);
  });
```

Run: `npx vitest run tests/burnin.test.ts --reporter=verbose`
Record the printed millisecond figure — it is needed in Task 10.

- [ ] **Step 6: Commit**

```bash
git add src/life/burnin.ts tests/burnin.test.ts
git commit -m "feat(life): burn-in, so the Hollow is old before anyone sees it

Runs the ecology headless for 400 generations with no renderer attached.
Reports the survivor set and, when fewer than four species remain, says
so rather than handing back a silently empty island."
```

---

## Task 5: The Hollow island style

**Files:**
- Modify: `src/world/config.ts`
- Test: `tests/hollow-config.test.ts` (create)

**Interfaces:**
- Produces: `const HOLLOW_CONFIG: WorldConfig`, `type IslandStyle = "classic" | "hollow"`, `function configForStyle(style: IslandStyle): WorldConfig`

- [ ] **Step 1: Write the failing test**

```ts
// tests/hollow-config.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, HOLLOW_CONFIG, configForStyle } from "../src/world/config";
import { generate } from "../src/world/generate";

describe("the Hollow's island style", () => {
  it("leaves the classic config untouched", () => {
    expect(configForStyle("classic")).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG.width).toBe(300);
    expect(DEFAULT_CONFIG.height).toBe(300);
  });

  it("is smaller and denser than the classic island", () => {
    expect(HOLLOW_CONFIG.width).toBeLessThan(DEFAULT_CONFIG.width);
    expect(HOLLOW_CONFIG.forestMoisture).toBeLessThan(DEFAULT_CONFIG.forestMoisture);
  });

  it("generates a walkable island", () => {
    const map = generate(1, HOLLOW_CONFIG);
    expect(map.width).toBe(HOLLOW_CONFIG.width);
    expect(map.spawn.x).toBeGreaterThanOrEqual(0);
  });

  it("generates walkable islands across many seeds", () => {
    for (let s = 1; s <= 12; s++) {
      const map = generate(s, HOLLOW_CONFIG);
      expect(map.spawn.x).toBeGreaterThanOrEqual(0);
      expect(map.spawn.y).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hollow-config.test.ts`
Expected: FAIL — `HOLLOW_CONFIG` is not exported.

- [ ] **Step 3: Write minimal implementation**

Append to `src/world/config.ts`:

```ts
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
  minWalkableRegion: 700, // scaled from 3000 by the ~4.6x drop in tile count
};

export function configForStyle(style: IslandStyle): WorldConfig {
  return style === "hollow" ? HOLLOW_CONFIG : DEFAULT_CONFIG;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hollow-config.test.ts && npm test && npm run check`
Expected: 4 passed; the whole suite still passes.

- [ ] **Step 5: Commit**

```bash
git add src/world/config.ts tests/hollow-config.test.ts
git commit -m "feat(world): the Hollow island style — 140x140, mostly forest

A second WorldConfig beside DEFAULT_CONFIG, reached through
configForStyle. minWalkableRegion drops 3000 -> 700, scaled by the 4.6x
fall in tile count, so the reroll gate means the same thing it did."
```

---

## Task 6: Motion signatures

**Files:**
- Create: `src/life/motion.ts`
- Test: `tests/motion.test.ts`

**Interfaces:**
- Consumes: `hash2d`; `Genome`.
- Produces:
  - `interface Gait { period: number; amplitude: number; pauseFraction: number; drift: number; bobPhase: number; darting: number }`
  - `function gaitFor(speciesSeed: number): Gait`
  - `function motionOffset(gait: Gait, tMs: number, phase: number): { dx: number; dy: number }`
  - `function gaitFeatures(gait: Gait): number[]` — the twelve-feature vector, for tests and the bench

- [ ] **Step 1: Write the failing test**

```ts
// tests/motion.test.ts
import { describe, expect, it } from "vitest";
import { gaitFeatures, gaitFor, motionOffset } from "../src/life/motion";

describe("motion signature", () => {
  it("is deterministic per species", () => {
    expect(gaitFor(7)).toEqual(gaitFor(7));
  });

  it("gives different species different gaits", () => {
    expect(gaitFor(7)).not.toEqual(gaitFor(8));
  });

  it("exposes twelve features", () => {
    expect(gaitFeatures(gaitFor(1)).length).toBe(12);
  });

  it("offsets stay small enough not to teleport a sprite", () => {
    const g = gaitFor(3);
    for (let t = 0; t < 20000; t += 37) {
      const { dx, dy } = motionOffset(g, t, 0.3);
      expect(Math.abs(dx)).toBeLessThanOrEqual(4);
      expect(Math.abs(dy)).toBeLessThanOrEqual(4);
    }
  });

  it("two species are separable by their feature vectors", () => {
    // Bench 11 measured 89.1% separability against a 12.5% chance level over
    // eight genomes. This asserts only that distinct species produce distinct
    // vectors, which is the property the renderer depends on.
    const seen = new Set<string>();
    for (let s = 0; s < 8; s++) seen.add(gaitFeatures(gaitFor(s)).map((v) => v.toFixed(3)).join(","));
    expect(seen.size).toBe(8);
  });

  it("phase decorrelates individuals of one species", () => {
    const g = gaitFor(5);
    const a = motionOffset(g, 1000, 0.0);
    const b = motionOffset(g, 1000, 0.5);
    expect(a.dx === b.dx && a.dy === b.dy).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/motion.test.ts`
Expected: FAIL — `Cannot find module '../src/life/motion'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/life/motion.ts
import { hash2d } from "../core/rng";

// ─────────────────────────────────────────────────────────────────────────────
// Motion signature — how a species moves, derived from its seed rather than
// hand-animated.
//
// Bench 11 measured motion separability at 89.1% against a 12.5% chance level
// (eight genomes drawn uniformly at random, 24 ten-second flights each, twelve
// features), and put motion ahead of colour below 8.5px of sprite size:
//
//   sprite size   2px    5px     14px
//   motion        51%    88.9%   99%
//   colour        24%    58.3%   100%
//
// So at gameplay zoom a critter is identified by its gait, and colour only
// takes over on leaning in. The crossing point moved between 5.2 and 11.2px
// across the bench's sweep, so the Hollow's default zoom must be checked
// against it rather than assumed.
// ─────────────────────────────────────────────────────────────────────────────

export interface Gait {
  period: number; // ms for one full cycle
  amplitude: number; // art px of lateral sway
  pauseFraction: number; // 0..0.6 of each cycle spent still
  drift: number; // art px of slow vertical wander
  bobPhase: number; // 0..1 offset between the lateral and vertical components
  darting: number; // 0 = smooth, 1 = sharp starts and stops
}

export function gaitFor(speciesSeed: number): Gait {
  const h = (k: number) => hash2d(speciesSeed, k, 0x9017104);
  return {
    period: 700 + h(1) * 2600,
    amplitude: 0.6 + h(2) * 2.6,
    pauseFraction: h(3) * 0.6,
    drift: h(4) * 1.6,
    bobPhase: h(5),
    darting: h(6),
  };
}

/** The twelve-feature description bench 11 classified on. */
export function gaitFeatures(g: Gait): number[] {
  return [
    g.period / 3300,
    g.amplitude / 3.2,
    g.pauseFraction,
    g.drift / 1.6,
    g.bobPhase,
    g.darting,
    g.amplitude / Math.max(1, g.period / 1000), // sway per second
    g.pauseFraction * g.darting, // stop-and-start sharpness
    Math.sin(g.bobPhase * Math.PI * 2),
    Math.cos(g.bobPhase * Math.PI * 2),
    g.drift / Math.max(0.1, g.amplitude), // vertical-to-lateral ratio
    1 - g.pauseFraction, // duty cycle
  ];
}

/**
 * Where this individual sits relative to its base position, in art px.
 * `phase` in [0,1) decorrelates individuals of one species so a group does
 * not move as a block.
 */
export function motionOffset(g: Gait, tMs: number, phase: number): { dx: number; dy: number } {
  const cycle = ((tMs / g.period + phase) % 1 + 1) % 1;
  // The pause sits at the head of each cycle; motion occupies the remainder.
  if (cycle < g.pauseFraction) return { dx: 0, dy: 0 };
  const run = (cycle - g.pauseFraction) / (1 - g.pauseFraction);
  // Darting species ease sharply; smooth ones ride a plain sine.
  const eased = g.darting > 0.5 ? Math.sign(Math.sin(run * Math.PI * 2)) * Math.abs(Math.sin(run * Math.PI * 2)) ** (1 - g.darting * 0.7) : Math.sin(run * Math.PI * 2);
  const dx = eased * g.amplitude;
  const dy = Math.sin((run + g.bobPhase) * Math.PI * 2) * g.drift;
  return { dx: clamp4(dx), dy: clamp4(dy) };
}

function clamp4(v: number): number {
  return v < -4 ? -4 : v > 4 ? 4 : v;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/motion.test.ts && npm run check`
Expected: 6 passed, tsc clean

- [ ] **Step 5: Commit**

```bash
git add src/life/motion.ts tests/motion.test.ts
git commit -m "feat(life): motion signatures — a gait per species, from its seed

Bench 11 put motion at 89.1% separability against 12.5% chance, and ahead
of colour below 8.5px of sprite (88.9% vs 58.3% at 5px). A per-individual
phase keeps a group from moving as one block."
```

---

## Task 7: Glow fires off tint, not luminance

Bench 10 left this broken deliberately so its table would keep showing the problem. Pigment separation retention runs 93% daylight, 35% at the twilight peak, 24% deep twilight, 27% night — below half for 54% of every day. Glow currently gates on `darkness` (`src/render/renderer.ts:711`), which is still near zero when the tint damage peaks mid-dusk.

**Files:**
- Modify: `src/game/daynight.ts`
- Modify: `src/render/renderer.ts:711` (and the `nightPass` call at :836)
- Test: `tests/glow-tint.test.ts` (create)

**Interfaces:**
- Produces: `function tintStrength(nowMs: number): number` in `[0, 1]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/glow-tint.test.ts
import { describe, expect, it } from "vitest";
import { DAY_MS, DUSK_MS, darknessAt, skyGrade, tintStrength } from "../src/game/daynight";

describe("tintStrength", () => {
  it("is zero in clear day", () => {
    expect(tintStrength(DAY_MS / 2)).toBe(0);
  });

  it("stays within [0,1] across a whole cycle", () => {
    for (let t = 0; t < 500_000; t += 1000) {
      const v = tintStrength(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("tracks the sky cast's alpha", () => {
    const t = DAY_MS + DUSK_MS * 0.5;
    expect(tintStrength(t)).toBeCloseTo(skyGrade(t).a, 5);
  });

  // The finding: at the twilight peak the tint is already doing its damage
  // while darkness is still low. Glow gated on darkness therefore fires late.
  it("leads darkness at the dusk peak, which is why glow must key off it", () => {
    const peak = DAY_MS + DUSK_MS * 0.5;
    expect(tintStrength(peak)).toBeGreaterThan(darknessAt(peak) * 0.62);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/glow-tint.test.ts`
Expected: FAIL — `tintStrength` is not exported from `daynight`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/game/daynight.ts`:

```ts
/**
 * How strongly the sky is casting colour over the scene, 0..1.
 *
 * This is the term glow must key off, not darkness. Bench 10 measured pigment
 * separation retention against the unlit palette at 93% in daylight, 35% at
 * the twilight peak, 24% in deep twilight and 27% at night — below half for
 * about 54% of the cycle, with mean hue rotation of 60-62 degrees at the worst
 * point. The damage is the tint, not the darkness: at the peak the model mixes
 * 49% toward a single warm colour. Night-with-glow restored 108% of separation
 * but dusk-with-glow only 74%, because glow was fading on luminance while the
 * worst damage happened where the tint peaked.
 */
export function tintStrength(nowMs: number): number {
  return skyGrade(nowMs).a;
}
```

In `src/render/renderer.ts`, import it:

```ts
import { CYCLE_MS, DAY_MS, isBiolumeNight, skyGrade, tintStrength } from "../game/daynight";
```

Compute it once beside `darkness` (near :671):

```ts
    const darkness = scene.darkness ?? 0;
    // Glow keys off the sky's colour cast, not its darkness — see tintStrength.
    const tintNow = tintStrength(timeMs);
```

Change the glow gate at :711 from:

```ts
            if (darkness > 0.05 && p.genome.glow > GLOW_THRESHOLD) {
```

to:

```ts
            if (tintNow > 0.05 && p.genome.glow > GLOW_THRESHOLD) {
```

and the night pass at :836 from:

```ts
    if (darkness > 0.01) this.nightPass(camX, camY, scene, darkness, glowers, timeMs);
```

to:

```ts
    // Driven by the tint so glow rises with the dusk cast rather than lagging
    // it — the lag is what cost dusk two-thirds of its pigment separation.
    const glowDrive = Math.max(darkness, tintNow);
    if (glowDrive > 0.01) this.nightPass(camX, camY, scene, glowDrive, glowers, timeMs);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/glow-tint.test.ts && npm test && npm run check`
Expected: 4 passed; the whole suite still passes. If `tests/depth.test.ts` or a screenshot test asserts on dusk appearance, update its expectation and note the change in the commit body.

- [ ] **Step 5: Commit**

```bash
git add src/game/daynight.ts src/render/renderer.ts tests/glow-tint.test.ts
git commit -m "fix(render): glow rises with the sky's tint, not its darkness

Pigment separation ran 93% daylight, 35% at the twilight peak, 24% deep
twilight, 27% night — under half for 54% of every cycle. The damage is
the tint term, which peaks mid-dusk while darkness is still near zero,
so glow gated on darkness fired late: dusk-with-glow restored only 74%
of separation against night-with-glow's 108%."
```

---

## Task 8: Growth as animation

§9.5 ranks this first — roughly a day, and it improves every existing screen. A plant's drawn size eases from nothing to full over its first `matureAge` ticks instead of appearing at full size.

**Files:**
- Create: `src/render/growth.ts`
- Modify: `src/render/renderer.ts` (the plant draw loop near :700–:720)
- Test: `tests/growth.test.ts` (create)

**Interfaces:**
- Produces: `function growthScale(ageTicks: number, matureAge: number): number` in `[0.18, 1]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/growth.test.ts
import { describe, expect, it } from "vitest";
import { growthScale } from "../src/render/growth";

describe("growthScale", () => {
  it("starts visible but small", () => {
    const s = growthScale(0, 20);
    expect(s).toBeGreaterThanOrEqual(0.18);
    expect(s).toBeLessThan(0.35);
  });

  it("reaches full size at maturity and stays there", () => {
    expect(growthScale(20, 20)).toBeCloseTo(1, 5);
    expect(growthScale(900, 20)).toBeCloseTo(1, 5);
  });

  it("is monotonic up to maturity", () => {
    let prev = -1;
    for (let a = 0; a <= 20; a++) {
      const s = growthScale(a, 20);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it("handles a zero maturity age without dividing by zero", () => {
    expect(growthScale(0, 0)).toBe(1);
  });

  it("never returns a scale outside [0.18, 1]", () => {
    for (let a = -5; a < 100; a++) {
      const s = growthScale(a, 20);
      expect(s).toBeGreaterThanOrEqual(0.18);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/growth.test.ts`
Expected: FAIL — `Cannot find module '../src/render/growth'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/render/growth.ts

// A plant appearing at full size reads as placed; a plant easing up from a
// sprout reads as alive. The floor of 0.18 keeps a new sprout visible rather
// than a subpixel nothing, and the ease is smoothstep so growth is quickest in
// the middle of a plant's youth.
const SPROUT_FLOOR = 0.18;

export function growthScale(ageTicks: number, matureAge: number): number {
  if (matureAge <= 0) return 1;
  const t = ageTicks / matureAge;
  if (t >= 1) return 1;
  if (t <= 0) return SPROUT_FLOOR;
  const eased = t * t * (3 - 2 * t);
  return SPROUT_FLOOR + (1 - SPROUT_FLOOR) * eased;
}
```

In `src/render/renderer.ts`, import it and apply it where each plant sprite is drawn. Inside the plant loop (near :700), before the `drawImage` for a plant sprite, wrap the draw:

```ts
        const grow = growthScale(scene.floraTick - p.born, scene.matureAge ?? 20);
        if (grow < 1) {
          ctx.save();
          // Scale about the plant's base so it grows up out of the ground
          // rather than out of its own centre.
          ctx.translate(dx + w / 2, dy + h);
          ctx.scale(grow, grow);
          ctx.translate(-(dx + w / 2), -(dy + h));
        }
        // ... the existing drawImage for this plant, unchanged ...
        if (grow < 1) ctx.restore();
```

Add to the `Scene` interface in `renderer.ts`:

```ts
  floraTick?: number; // the flora clock, for growth animation; absent ⇒ no growth easing
  matureAge?: number; // ticks to full size; absent ⇒ 20
```

Guard so an absent `floraTick` disables the effect entirely:

```ts
        const grow = scene.floraTick === undefined
          ? 1
          : growthScale(scene.floraTick - p.born, scene.matureAge ?? 20);
```

Then pass `floraTick: flora.tick` and `matureAge: flora.tuning.matureAge` where the scene is built in `src/game/main.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/growth.test.ts && npm test && npm run check`
Expected: 5 passed; the whole suite still passes.

- [ ] **Step 5: Verify it in the running app**

Run: `npm run dev`, open the app, and watch a patch of ground for a minute. New plants must ease up from sprouts rather than appearing at full size. If nothing visibly grows, confirm `floraTick` is actually being passed into the scene.

- [ ] **Step 6: Commit**

```bash
git add src/render/growth.ts src/render/renderer.ts src/game/main.ts tests/growth.test.ts
git commit -m "feat(render): plants grow into their size instead of appearing at it

Smoothstep from a 0.18 sprout floor to full over matureAge ticks, scaled
about the base so a plant rises out of the ground rather than out of its
own centre. An absent floraTick on the scene disables it entirely."
```

---

## Task 9: Wiring — the Hollow generates, burns in, and selects

This is the task that makes the previous eight into one thing.

**Files:**
- Create: `src/life/hollow.ts`
- Test: `tests/hollow.test.ts` (create)

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces:
  - `interface Hollow { map: WorldMap; flora: Flora; minerals: MineralField; landscape: FitnessLandscape; report: BurnInReport }`
  - `function makeHollow(seed: number, onProgress?: (done: number, total: number) => void): Hollow`

- [ ] **Step 1: Write the failing test**

```ts
// tests/hollow.test.ts
import { describe, expect, it } from "vitest";
import { makeHollow } from "../src/life/hollow";
import { BURN_IN_SPECIES_FLOOR } from "../src/life/burnin";
import { HOLLOW_CONFIG } from "../src/world/config";

describe("makeHollow", () => {
  it("returns an island that has already lived", () => {
    const h = makeHollow(2026);
    expect(h.map.width).toBe(HOLLOW_CONFIG.width);
    expect(h.flora.tick).toBeGreaterThan(300);
    expect(h.flora.all.length).toBeGreaterThan(0);
  });

  it("is deterministic for a seed", () => {
    const a = makeHollow(11);
    const b = makeHollow(11);
    expect(a.flora.all.length).toBe(b.flora.all.length);
    expect(a.report.species).toBe(b.report.species);
  });

  it("meets the species floor, or says it did not", () => {
    const h = makeHollow(3);
    if (h.report.floorHit) expect(h.report.species).toBeLessThan(BURN_IN_SPECIES_FLOOR);
    else expect(h.report.species).toBeGreaterThanOrEqual(BURN_IN_SPECIES_FLOOR);
  });

  it("rerolls past a burn-in that empties the island", () => {
    // Across a dozen seeds, every returned Hollow must clear the floor —
    // makeHollow retries with seed+1 the way worldgen already does.
    for (let s = 1; s <= 12; s++) {
      expect(makeHollow(s).report.floorHit).toBe(false);
    }
  });

  it("has drawn its minerals down where plants stand", () => {
    const h = makeHollow(5);
    const p = h.flora.all[0];
    expect(p).toBeDefined();
    const tx = Math.floor(p.x / 16);
    const ty = Math.floor(p.y / 16);
    expect(h.minerals.totalAt(tx, ty)).toBeLessThanOrEqual(6);
  });

  it("selection actually shaped the result", () => {
    // A burned-in Hollow's mean fitness must exceed that of the same island
    // with selection off — the whole claim of stage 1 in one assertion.
    const h = makeHollow(9);
    const scored = h.flora.all.map((p) =>
      h.landscape.score(p.genome, {
        minerals: h.minerals.sample(Math.floor(p.x / 16), Math.floor(p.y / 16)),
        light: 0.5,
      }),
    );
    const mean = scored.reduce((s, v) => s + v, 0) / scored.length;
    expect(mean).toBeGreaterThan(0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/hollow.test.ts`
Expected: FAIL — `Cannot find module '../src/life/hollow'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/life/hollow.ts
import { HOLLOW_CONFIG } from "../world/config";
import { generate } from "../world/generate";
import { WorldMap } from "../world/types";
import { TILE_SIZE } from "../world/config";
import { BURN_IN_GENERATIONS, BURN_IN_SIM_BUDGET, BurnInReport, burnIn } from "./burnin";
import { FitnessLandscape, landscapeFor } from "./fitness";
import { Flora } from "./flora";
import { MineralField, mineralFieldFor } from "./minerals";
import { generatePlantSpecies } from "./species";

// ─────────────────────────────────────────────────────────────────────────────
// The Hollow, assembled: a small forested island whose ecology has already run
// for BURN_IN_GENERATIONS generations under mineral scarcity and selection
// before anyone sees it.
// ─────────────────────────────────────────────────────────────────────────────

/** Reroll attempts before a Hollow is returned despite missing the floor. */
const MAX_ATTEMPTS = 8;

export interface Hollow {
  map: WorldMap;
  flora: Flora;
  minerals: MineralField;
  landscape: FitnessLandscape;
  report: BurnInReport;
}

function attempt(seed: number, onProgress?: (d: number, t: number) => void): Hollow {
  const map = generate(seed, HOLLOW_CONFIG);
  const minerals = mineralFieldFor(map, seed);
  const landscape = landscapeFor(seed);
  const flora = new Flora(map, generatePlantSpecies(seed), seed, {
    // Burn-in examines every living plant each tick. The default simBudget of
    // 480 against a population near 8000 reaches 6% of the island per tick,
    // which turns 400 ticks into about 1.4 reproductions per plant instead of
    // about 24 — measured, 62.7% of the population born during burn-in at 480
    // against 100% at full coverage. burnIn throws if this is left at the
    // default, because the resulting island looks correct and is not.
    simBudget: BURN_IN_SIM_BUDGET,
    selection: {
      fitness(g, tx, ty) {
        const supply = minerals.sample(tx, ty);
        // Light: forest floor is shaded, open ground is not. Cheap proxy until
        // the canopy layer exists.
        const light = 0.5;
        const f = landscape.score(g, { minerals: supply, light });
        // Growing costs what it draws. A plant that cannot get what it demands
        // has already been scored down; drawing it down is what makes the next
        // plant's shortage real.
        minerals.draw(tx, ty, landscape.demandOf(g), 0.002);
        return f;
      },
    },
  });
  const report = burnIn(flora, BURN_IN_GENERATIONS, onProgress);
  return { map, flora, minerals, landscape, report };
}

/**
 * Build a Hollow. Rerolls deterministically (seed+1, seed+2, ...) past a
 * burn-in that leaves too few species, the way worldgen already rerolls past
 * an island with too little land. After MAX_ATTEMPTS the last result is
 * returned with floorHit still set rather than throwing — a caller that wants
 * to refuse can read the report.
 */
export function makeHollow(
  seed: number,
  onProgress?: (done: number, total: number) => void,
): Hollow {
  let last = attempt(seed, onProgress);
  for (let i = 1; i < MAX_ATTEMPTS && last.report.floorHit; i++) {
    last = attempt(seed + i, onProgress);
  }
  return last;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/hollow.test.ts && npm run check`
Expected: 6 passed, tsc clean

If the "selection actually shaped the result" case fails with a mean at or near 0.5, that is the drift signature and it means the hook is not firing. Check that `selection` is reaching `DEFAULT_TUNING`'s merge in the `Flora` constructor.

If the reroll case is slow (8 attempts × 400 generations × 12 seeds), reduce that test to 4 seeds and note the reduction in a comment — a silent cap is a plan failure, a stated one is not.

- [ ] **Step 5: Commit**

```bash
git add src/life/hollow.ts tests/hollow.test.ts
git commit -m "feat(life): makeHollow — the island assembled and already old

Generation, minerals, an NK landscape at K=3, selection wired into Flora,
and 400 generations of burn-in before the value is returned. Rerolls
deterministically past a burn-in that leaves under four species, and
after eight attempts returns the last one with floorHit still set rather
than throwing."
```

---

## Task 10: The forge entry and the loading screen

**Files:**
- Modify: `src/render/forge.ts`
- Modify: `src/game/main.ts` (the worldgen path)
- Test: `tests/hollow-forge.test.ts` (create)

**Interfaces:**
- Consumes: `IslandStyle`, `configForStyle` (Task 5); `makeHollow` (Task 9).
- Produces: a style control in the forge whose value reaches worldgen.

- [ ] **Step 1: Read the forge's existing parameter rail**

Run: `grep -n "FORGE_BOUNDS\|export function forge\|param" src/render/forge.ts | head -30`

Match whatever pattern the existing controls use. Do not invent a new control style.

- [ ] **Step 2: Write the failing test**

```ts
// tests/hollow-forge.test.ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, configForStyle } from "../src/world/config";

describe("forge island style", () => {
  it("defaults to classic so an unchanged forge builds an unchanged island", () => {
    expect(configForStyle("classic")).toEqual(DEFAULT_CONFIG);
  });

  it("offers exactly the two styles stage 1 ships", () => {
    const styles: Array<"classic" | "hollow"> = ["classic", "hollow"];
    for (const s of styles) expect(configForStyle(s)).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails or passes trivially**

Run: `npx vitest run tests/hollow-forge.test.ts`
Expected: PASS if Task 5 landed. This file is a regression guard on the default, not a driver — the driving verification for this task is step 6.

- [ ] **Step 4: Add the style control to the forge**

Add a two-option control labelled **Island** with values **Classic** and **Hollow**, defaulting to Classic. Follow the existing control pattern found in step 1.

- [ ] **Step 5: Route it through worldgen with progress**

In `src/game/main.ts`, where the world is generated, branch on the style:

```ts
  if (style === "hollow") {
    // Burn-in costs seconds, not milliseconds — the measured figure is in the
    // plan's Task 4 step 5. Show progress rather than freezing on a click.
    const h = makeHollow(seed, (done, total) => showBurnInProgress(done, total));
    map = h.map;
    flora = h.flora;
  } else {
    map = generate(seed, DEFAULT_CONFIG);
    // ... the existing classic path, unchanged ...
  }
```

Implement `showBurnInProgress` as a minimal text line on the existing loading/working screen (`src/render/working.ts` already exists — use it rather than adding a new screen):

```
  Growing the Hollow — 240 of 400 generations
```

- [ ] **Step 6: Verify in the running app**

Run: `npm run dev`

Then check all four:
1. Forge defaults to Classic; generating produces the island it always did.
2. Selecting Hollow and generating shows the progress line, and the count reaches 400.
3. The generated Hollow is walkable and visibly forested.
4. Switching back to Classic still works without a reload.

- [ ] **Step 7: Commit**

```bash
git add src/render/forge.ts src/game/main.ts src/render/working.ts tests/hollow-forge.test.ts
git commit -m "feat(forge): choose the island — Classic or Hollow

Hollow runs burn-in behind the existing working screen with a generation
count, because 400 generations costs seconds and a silent freeze on a
click reads as a hang. Classic remains the default and its path is
untouched."
```

---

## Task 11: The byte-identical guard

The spec's hardest constraint is that the original island style is unaffected. This task proves it rather than asserting it.

**Files:**
- Test: `tests/hollow-determinism.test.ts` (create)

- [ ] **Step 1: Write the test**

```ts
// tests/hollow-determinism.test.ts
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/world/config";
import { generate } from "../src/world/generate";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";

// The Hollow must not have changed the island every existing save was made on.
// These fingerprints are computed from the classic path only; if a future
// change alters them, that change has broken existing worlds and the failure
// is the point.
describe("the classic island is unchanged by the Hollow", () => {
  const SEEDS = [1, 7, 42, 1234, 2026];

  // GOLDEN FINGERPRINTS, captured from `master` — the code as it stood before
  // any Hollow work. Comparing generate(seed) against generate(seed) would only
  // prove worldgen is deterministic, which it would be even if every island had
  // changed. These hashes are the only thing that proves the classic island is
  // the SAME island it was, and `findSpawn` was modified during Task 5, so this
  // is the guard on that change.
  //
  // If one of these fails, do not update the constant to match. A change here
  // means every existing save now loads a different island.
  const CLASSIC_FINGERPRINTS: Record<number, string> = {
    1: "1d5a05f5691879d8:78,191",
    7: "d95633357116d07b:226,214",
    42: "4e52868adab49b4e:71,106",
    1234: "e504608011512bd9:98,185",
    2026: "a57d70a2f329def5:122,211",
  };

  it("worldgen produces the same islands it did before the Hollow", () => {
    for (const s of SEEDS) {
      const m = generate(s, DEFAULT_CONFIG);
      const hash = createHash("sha256").update(Buffer.from(m.tiles)).digest("hex").slice(0, 16);
      expect(`${hash}:${m.spawn.x},${m.spawn.y}`).toBe(CLASSIC_FINGERPRINTS[s]);
    }
  });

  it("flora with default tuning draws no selection rng", () => {
    for (const s of SEEDS) {
      const map = generate(s, DEFAULT_CONFIG);
      // Each Flora gets its OWN species array. Flora stores the list by
      // reference and pushes daughter species onto it in place on speciation
      // (flora.ts:704-705), so sharing one array lets two "independent"
      // instances contaminate each other's species indices.
      const a = new Flora(map, generatePlantSpecies(s), s);
      const b = new Flora(map, generatePlantSpecies(s), s, { selection: null });
      for (let i = 0; i < 400; i++) { a.simTick(); b.simTick(); }
      expect(a.all.length).toBe(b.all.length);
      expect(a.tick).toBe(b.tick);
      const fa = a.all.map((p) => `${p.species}:${p.x.toFixed(2)}:${p.y.toFixed(2)}`).join("|");
      const fb = b.all.map((p) => `${p.species}:${p.x.toFixed(2)}:${p.y.toFixed(2)}`).join("|");
      expect(fa).toBe(fb);
    }
  });

  it("DEFAULT_TUNING still has selection off", () => {
    const map = generate(1, DEFAULT_CONFIG);
    const f = new Flora(map, generatePlantSpecies(1), 1);
    expect(f.tuning.selection).toBe(null);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/hollow-determinism.test.ts`
Expected: 3 passed. **If any fail, stop** — a previous task broke the classic island and must be fixed before this plan continues.

- [ ] **Step 3: Run the whole suite and the type check**

Run: `npm test && npm run check`
Expected: all green.

- [ ] **Step 4: Run the bench QA harness**

Run: `node scripts/bench-qa.mjs`
Expected: no new failures. Stage 1 does not add a bench, so this is a regression check only.

- [ ] **Step 5: Commit**

```bash
git add tests/hollow-determinism.test.ts
git commit -m "test: prove the classic island is byte-identical after the Hollow

Fingerprints worldgen tiles and 400 ticks of flora across five seeds, and
asserts DEFAULT_TUNING still carries selection: null. If these fail, a
change has broken every existing save and that is what the failure means."
```

---

## Task 12: Record what stage 1 measured

The spec named two risks that only stage 1 can answer: the real burn-in cost, and whether the Hollow's default zoom lands inside bench 11's 5.2–11.2px ambiguity band.

**Files:**
- Modify: `docs/superpowers/specs/2026-08-03-hollow-design.md` (the Risks section)
- Modify: `docs/03-ECOLOGY-DESIGN-SPACE.md` (append a stage-1 findings block)

- [ ] **Step 1: Measure the sprite size at the Hollow's default zoom**

Run: `npm run dev`, open a Hollow, and measure a critter sprite's on-screen height in art px at the default zoom level. `TILE_SIZE` is 16 and `SCALE * zoomLevel` is the transform (`src/render/renderer.ts:147`), so the figure is computable as well as observable — record both.

- [ ] **Step 2: Write the findings into the spec's Risks section**

Replace each of the two risk paragraphs with what was actually measured. Keep the writing standard: state both sides of every comparison and its sample size. If the sprite lands inside 5.2–11.2px, say so and say what was done about it rather than leaving it open.

- [ ] **Step 3: Append a stage-1 block to the ecology document**

Under a new heading `## 12 · Stage 1 findings`, record:
- burn-in cost in ms at 400 generations, and the plant and species counts
- how many seeds out of how many cleared the species floor on the first attempt
- the measured sprite size and where it fell against 5.2–11.2px
- whether mean fitness after burn-in exceeded the 0.500 drift baseline, and by how much

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-08-03-hollow-design.md docs/03-ECOLOGY-DESIGN-SPACE.md
git commit -m "docs: what stage 1 actually measured

Burn-in cost, the species-floor reroll rate, the sprite size against
bench 11's 5.2-11.2px ambiguity band, and mean fitness after burn-in
against the 0.500 drift baseline."
```

---

## What stage 1 does not build

Named so no implementer improvises them:

- **No camera change.** Canvas 2D, top-down, as today.
- **No attractor bodies.** Stage 2 — N = 32, regulatory K = 2, p = 0.40, with the all-32 hash readout.
- **No punctuated mutation.** Stage 2.
- **No per-species verbs, no lens rewrite, no chemistry gate.** Stage 3.
- **No host plate.** Stage 3.
- **No planting, seeds, breeding, journal, or puzzles.** Deferred during design.
- **No canopy occlusion layer.** The Hollow's enclosure in stage 1 comes from island size and forest density only. If it does not read as enclosed, that is a stage-1 finding for Task 12, not a scope expansion.

---

## Self-review notes

**Spec coverage:** Layer 1 → Task 1. Layer 2 → Task 2. Layer 3 → Tasks 4, 9. Motion → Tasks 6, and its renderer application is folded into Task 8's draw-loop edit. Palette (grounded split-complementary) is **not** covered by a task — see the gap below. Glow fix → Task 7. Growth → Task 8. Hollow style → Tasks 5, 10. Byte-identical constraint → Task 11. Named risks → Task 12.

**Known gap, stated rather than hidden:** the spec's grounded split-complementary palette at bias 0.70 has no task in this plan. It touches `src/render/palette.ts`, which stage 1 otherwise does not modify, and it changes the appearance of *every* island rather than only the Hollow — which conflicts with the byte-identical constraint that Task 11 enforces. It needs its own decision: either scope it to the Hollow only, or accept that it changes the classic island's colours. That decision was not made during design, so it is flagged here rather than guessed at.

**Type consistency:** `SelectionContext.fitness(g, tx, ty)` is used identically in Tasks 3, 9 and 11. `MineralVec` is `Float32Array` throughout. `RUGGEDNESS_K` is never written as bare `K`. `BurnInReport.floorHit` is read in Tasks 4, 9 and 10.

---

## Task 13: The Hollow's palette key — grounded split-complementary, bias 0.70

**Added after the plan's first draft**, resolving the gap named in Self-review. Decision: **Hollow only.** The classic island's colours are untouched, so Task 11's guarantee stands in full.

The key does **not** touch `src/render/palette.ts` — that file holds terrain constants. Plant colour comes from `genome.hue` through `hsl()` (`src/life/genome.ts:125`), so the key constrains which hues the Hollow's species are rolled with, and nothing else.

**Execution order:** after Task 9, before Task 10.

**Files:**
- Create: `src/life/huekey.ts`
- Modify: `src/life/hollow.ts` (apply the key to the rolled species)
- Test: `tests/huekey.test.ts`

**Interfaces:**
- Consumes: `hash2d`; `PlantSpecies` from `src/life/species.ts`; `clampTrait` from `src/life/genome.ts`.
- Produces:
  - `const SPLIT_COMPLEMENTARY_OFFSETS = [0, 150, 210]` (degrees)
  - `const HUE_BIAS = 0.70`
  - `const TERRAIN_GREEN_HUE = 0.286` — the hue of `PALETTE.grassBase` (#68a557), which is what "grounded" anchors to
  - `function hueKeyFor(seed: number): number[]` — three anchor hues in `[0, 1)`
  - `function groundHue(hue: number, anchors: number[], bias: number): number` — pull a hue toward its nearest anchor
  - `function applyHueKey(species: PlantSpecies[], seed: number): PlantSpecies[]` — returns a new array; does not mutate

- [ ] **Step 1: Write the failing test**

```ts
// tests/huekey.test.ts
import { describe, expect, it } from "vitest";
import {
  HUE_BIAS,
  SPLIT_COMPLEMENTARY_OFFSETS,
  TERRAIN_GREEN_HUE,
  applyHueKey,
  groundHue,
  hueKeyFor,
} from "../src/life/huekey";
import { generatePlantSpecies } from "../src/life/species";

function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 1;
  return d > 0.5 ? 1 - d : d;
}

describe("the Hollow's hue key", () => {
  it("ships bench 10's recommended constants", () => {
    expect(SPLIT_COMPLEMENTARY_OFFSETS).toEqual([0, 150, 210]);
    expect(HUE_BIAS).toBe(0.7);
  });

  it("grounds one anchor on the terrain green", () => {
    const anchors = hueKeyFor(42);
    expect(anchors.some((a) => hueGap(a, TERRAIN_GREEN_HUE) < 0.001)).toBe(true);
  });

  it("gives three anchors, all in [0,1)", () => {
    const anchors = hueKeyFor(7);
    expect(anchors.length).toBe(3);
    for (const a of anchors) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });

  // Bench 10 declined the best-scoring keys because tetradic and triadic
  // offsets are closed under their own rotation, so grounding them yields one
  // identical anchor set for every island. Split-complementary's 0/150/210 are
  // not rotation-symmetric, so distinct islands must still produce distinct
  // chords. This is the property that choice was made for.
  it("produces different chords on different islands", () => {
    const seen = new Set<string>();
    for (let s = 1; s <= 12; s++) {
      seen.add(hueKeyFor(s).map((h) => h.toFixed(4)).sort().join(","));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("pulls a hue toward its nearest anchor without collapsing onto it", () => {
    const anchors = [0.0, 0.25, 0.5];
    const moved = groundHue(0.2, anchors, HUE_BIAS);
    expect(hueGap(moved, 0.25)).toBeLessThan(hueGap(0.2, 0.25));
    expect(hueGap(moved, 0.25)).toBeGreaterThan(0);
  });

  it("leaves 78% of the wheel reachable at bias 0.70", () => {
    // Bias 1.0 would pin every hue onto three anchors: 39% of the wheel.
    // 0.70 is arithmetic about arc width, not taste — 78% stays reachable.
    const anchors = hueKeyFor(3);
    const reached = new Set<number>();
    for (let i = 0; i < 360; i++) {
      reached.add(Math.round(groundHue(i / 360, anchors, HUE_BIAS) * 360));
    }
    expect(reached.size / 360).toBeGreaterThan(0.6);
  });

  it("returns a new species array and does not mutate the input", () => {
    const base = generatePlantSpecies(11);
    const before = base.map((s) => s.genome.hue);
    const keyed = applyHueKey(base, 11);
    expect(keyed).not.toBe(base);
    expect(base.map((s) => s.genome.hue)).toEqual(before);
  });

  it("moves species hues toward the key", () => {
    const base = generatePlantSpecies(5);
    const keyed = applyHueKey(base, 5);
    const anchors = hueKeyFor(5);
    const near = (list: typeof base) =>
      list.reduce((sum, s) => sum + Math.min(...anchors.map((a) => hueGap(s.genome.hue, a))), 0) /
      list.length;
    expect(near(keyed)).toBeLessThan(near(base));
  });

  it("is deterministic for a seed", () => {
    expect(applyHueKey(generatePlantSpecies(8), 8).map((s) => s.genome.hue)).toEqual(
      applyHueKey(generatePlantSpecies(8), 8).map((s) => s.genome.hue),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/huekey.test.ts`
Expected: FAIL — `Cannot find module '../src/life/huekey'`

- [ ] **Step 3: Write minimal implementation**

```ts
// src/life/huekey.ts
import { hash2d } from "../core/rng";
import { PlantSpecies } from "./species";

// ─────────────────────────────────────────────────────────────────────────────
// The Hollow's palette key: grounded split-complementary at bias 0.70.
//
// Bench 10's recommendation, and the only setting in its sweep where every
// measure improved at once over 14 islands per configuration: scene discord
// 26.1% -> 19.5%, flora discord 23.5% -> 18.8%, island difference
// 0.302 -> 0.380, character spread 10.4 -> 11.2 degrees.
//
// Two of that bench's findings decide the details here:
//
//   Grounding beats the choice of key. A key touching only the flora barely
//   moves the scene number — the plants agree with each other and go on
//   disagreeing with the dirt. Anchoring one hue to the terrain green took
//   grounded tetradic to 9.6% flora discord, a 63% reduction.
//
//   Split-complementary despite not scoring best, because tetradic and triadic
//   offsets are closed under their own rotation: grounding those yields ONE
//   identical anchor set for every island in the game, and the island
//   difference statistic is blind to that. 0/150/210 are not rotation
//   symmetric, so grounding still produces distinct chords per island.
//
// Bias 0.70 rather than 1.0 is arithmetic about arc width: 78% of the hue
// wheel stays reachable at 0.70, only 39% at 1.0. Variety improves under the
// constraint rather than suffering — island difference rises 0.302 -> 0.514,
// because an unbiased island has no character to differ in.
//
// This module applies ONLY to the Hollow. The classic island's colours are
// untouched, which is what keeps the byte-identical guarantee whole.
// ─────────────────────────────────────────────────────────────────────────────

/** Degrees around the wheel. Not rotation-symmetric — that is the point. */
export const SPLIT_COMPLEMENTARY_OFFSETS = [0, 150, 210] as const;

/** How hard a hue is pulled toward its anchor. 0.70 keeps 78% of the wheel. */
export const HUE_BIAS = 0.7;

/** The hue of PALETTE.grassBase (#68a557) — what "grounded" anchors to. */
export const TERRAIN_GREEN_HUE = 0.286;

/** Distance between two hues around the wheel, 0..0.5. */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 1;
  return d > 0.5 ? 1 - d : d;
}

/**
 * Three anchor hues for an island. One is always the terrain green — that is
 * the grounding — and the chord is rotated per island so islands differ.
 */
export function hueKeyFor(seed: number): number[] {
  // Which of the three offsets lands on the ground colour varies per island,
  // which is what makes grounding produce distinct chords rather than one.
  const rootIndex = Math.floor(hash2d(seed, 1, 0x68a557) * 3) % 3;
  const root = TERRAIN_GREEN_HUE - SPLIT_COMPLEMENTARY_OFFSETS[rootIndex] / 360;
  return SPLIT_COMPLEMENTARY_OFFSETS.map((deg) => {
    const h = root + deg / 360;
    return ((h % 1) + 1) % 1;
  });
}

/** Pull a hue toward its nearest anchor by `bias` of the remaining distance. */
export function groundHue(hue: number, anchors: number[], bias: number): number {
  let best = anchors[0];
  let bestGap = hueGap(hue, anchors[0]);
  for (const a of anchors) {
    const g = hueGap(hue, a);
    if (g < bestGap) {
      best = a;
      bestGap = g;
    }
  }
  // Move along the short way around the wheel.
  let delta = best - hue;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  const moved = hue + delta * bias;
  return ((moved % 1) + 1) % 1;
}

/**
 * Roll the Hollow's species onto its key. Returns a new array; the input is
 * left alone so a caller can compare keyed against unkeyed.
 */
export function applyHueKey(species: PlantSpecies[], seed: number): PlantSpecies[] {
  const anchors = hueKeyFor(seed);
  return species.map((sp) => ({
    ...sp,
    genome: {
      ...sp.genome,
      hue: groundHue(sp.genome.hue, anchors, HUE_BIAS),
      // The accent rides the key too, at half strength, so a flower's core
      // stays distinguishable from its petals rather than collapsing onto it.
      hue2: groundHue(sp.genome.hue2, anchors, HUE_BIAS * 0.5),
    },
  }));
}
```

- [ ] **Step 4: Apply it in the Hollow only**

In `src/life/hollow.ts`, change the species roll inside `attempt`:

```ts
  const flora = new Flora(map, generatePlantSpecies(seed), seed, {
```

to:

```ts
  const flora = new Flora(map, applyHueKey(generatePlantSpecies(seed), seed), seed, {
```

and add the import:

```ts
import { applyHueKey } from "./huekey";
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/huekey.test.ts tests/hollow.test.ts tests/hollow-determinism.test.ts && npm test && npm run check`
Expected: 9 passed in the new file; `hollow-determinism` still green — that is the proof the classic island did not move.

- [ ] **Step 6: Commit**

```bash
git add src/life/huekey.ts src/life/hollow.ts tests/huekey.test.ts
git commit -m "feat(life): the Hollow's palette key — grounded split-complementary

Bench 10's recommendation, applied to the Hollow's rolled species only,
so the classic island's colours do not move and the byte-identical test
stays green. Split-complementary rather than the better-scoring tetradic
because tetradic offsets are closed under their own rotation: grounding
them would give every island in the game one identical anchor set.

Bias 0.70 keeps 78% of the hue wheel reachable against 1.0's 39%."
```
