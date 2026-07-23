# The Simulator — Slice 1: the playable core (World-Lab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the minimum playable core of the Simulator (the World-Lab's Door C, per `docs/superpowers/specs/2026-07-21-simulator-design.md` §"Build order within v1" item 1): **pull a plant and a critter onto a real-tile construct, run time, and watch them interact.** Concretely — a deterministic headless **kernel** wrapping `flora`+`fauna`+`census`; a real-tile **construct** with three starter templates; **place-one** (a habitat-gated palette + click-to-place); **time controls** (pause/play/step-1/step-N, fidelity toggle); and a **data readout** (full internal state of any placed plant/critter, plus a live census + living-web strip).

**Architecture:** The kernel (`src/life/kernel.ts`) is the reusable muscle every later door reuses: it owns a `Flora` (constructed **empty** — a `restored` block with no plants, so `scatter()` never runs), a critter array, and a `CensusLog`, and exposes one deterministic `step(nTicks, fidelity)` plus `placePlant`/`placeCritter`. All of its randomness flows through seeded `makeRng` streams (flora's own internal rng, a critter rng, a placement rng) — no wall clock, no `Math.random` — so N steps replay bit-identically. The construct (`src/world/construct.ts`) builds a small real-tile `WorldMap` (reusing `generate()` for the island, hand-filling the sampler/single-biome), replacing today's blank meadow. The bench (`src/game/worldlab.ts`) is a **separate mode** that reuses the game's own `Renderer` over the construct (real tile art + placed plants/critters drawn by the same pipeline) with a minimal `Scene`, driven by a codex-styled chrome. Play cadence uses wall-clock only to decide *when* to call `step()`; `step()` itself is pure/seeded, and pause simply stops calling it while rendering continues.

**Route decision (flagged for the controller):** today's `?sim=1` is the **swarm/identity-map bench** (`src/game/simulator.ts`, recent live work). The verification harness and the front-door "the simulator" row both target `?sim=1`, so the new World-Lab must own `?sim=1`. This plan therefore makes the **default `?sim` value → the World-Lab**, and **preserves the swarm bench at `?sim=swarm`** (a one-line router change, fully reversible). Reconciling the two ecologies (does the World-Lab eventually host swarms too?) is a larger design question, out of scope here.

**Tech Stack:** TypeScript, Vite, Vitest (node env — no DOM/localStorage in kernel/construct tests). Pure/kernel logic is TDD'd (real headless tests); the bench UI is screenshot-verified via `npm run shot "sim=1" …` (this repo's established practice — logic tested, pixels shot).

## Global Constraints

- **Determinism:** every kernel/sim random draw flows through a seeded `makeRng` (`src/core/rng.ts`). **No `Math.random` / `Date.now` / `new Date()`** in `kernel.ts`, `construct.ts`, or any bench *sim* logic. Same seed + same inputs (placement calls + step counts) ⇒ byte-identical run. The bench **render** loop MAY read the rAF `timeMs` for ambient animation and MAY use wall-clock to pace play — both are view-only and never feed the kernel.
- **Peaceful pillar:** nothing dies. Critters are never added or removed by `step()` (only by an explicit `placeCritter`); foraging reduces plant counts (a grazer's `nibble` sets young plants back) but never kills an animal. Guard with a test asserting `critterCount()` is invariant across steps.
- **Reuse, don't fork:** wrap the tested `Flora`/`fauna`/`CensusLog` — do **not** reimplement ecology. New exports on those modules must be small; the kernel is glue. The bench reuses the game `Renderer` + `Scene`, `critterDrives`/`dominantDrive` (fauna), `sparkline`/`summary` (census), `chainStats`/`richnessWord` (foodweb).
- **Real worlds untouched:** the Simulator is a separate mode. Ordinary play (no `?sim`) stays byte-identical — the ONLY shared-file change is the `?sim` router in `main.ts`. Guard with the pure `parseSimMode` test + a shot proving a normal island is unchanged and `?sim=swarm` still opens the swarm bench.
- **Art:** every new panel consumes the naturalist's-codex `:root` tokens already in `index.html` (mirror the token usage in `src/game/simulator.ts`'s `buildChrome`). No hardcoded chrome hexes. Copy is lowercase and evocative.
- **Incremental:** order tasks so the bench is usable as early as possible; each task ends with an independently testable deliverable (a green test or a read screenshot).
- **Commits:** frequent; end every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Verify before "done":** `npm run check` (tsc) clean · `npx vitest run` green · `npm run build` clean.

**Out of scope for slice 1 (later slices — noted as deferred):** the stamp brush + **biome brush** (so slice 1 places only onto the construct's *existing* tiles — use the sampler to reach every habitat); the roll pane + drawer; the evolutionary layer (pressures/richness/roll-a-web); save/resume to a slot + full-critter-state persistence; the ambient bench; the title-screen backdrop.

---

### Task 1: The headless kernel — deterministic `step()` (TDD, pure)

The reusable muscle: a `Flora`+critters+`CensusLog` you step forward with no renderer and no player, reproducibly from a seed. This is what Doors A & B fork later — build it clean.

**Files:**
- Create: `src/life/kernel.ts`
- Test: `tests/kernel.test.ts`

**Interfaces:**
- Consumes: `Flora`, `FloraTuning`, `Plant` (`./flora`); `Critter`, `CritterSpecies`, `updateCritter` (`./fauna`); `PlantSpecies` (`./species`); `mutate` (`./genome`); `CensusLog` (`./census`); `makeRng`, `Rng` (`../core/rng`); `WorldMap` (`../world/types`).
- Produces:
  - `type Fidelity = "plants" | "full"`; `const KERNEL_DT: number` (fixed critter-time per tick).
  - `interface KernelInit { map; plantSpecies; critterSpecies; seed; tuning?; censusInterval? }`.
  - `class SimKernel` with `readonly flora`, `readonly census`, `readonly plantSpecies`, `readonly critterSpecies`, `critters: Critter[]`; `get tick`; `speciesCounts()`; `critterCount()`; `placePlant(speciesId, wx, wy): Plant | null` (habitat-gated); `placeCritter(speciesId, wx, wy): Critter`; `step(nTicks?, fidelity?): void`.

- [ ] **Step 1: Write the failing tests** — `tests/kernel.test.ts`:

```ts
import { expect, test } from "vitest";
import { SimKernel } from "../src/life/kernel";
import { generatePlantSpecies } from "../src/life/species";
import { generateCritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { singleBiome } from "../src/world/construct"; // built in Task 2
import { Tile } from "../src/world/types";
import { TILE_SIZE } from "../src/world/config";

const SEED = 4242;

// A deterministic bench: a grass construct, the seed's rosters, and one
// grass-habitat plant + one critter that favours it, placed a few tiles apart.
function bench() {
  const map = singleBiome(SEED, Tile.Grass, 40);
  const plants = generatePlantSpecies(SEED);
  const scratch = new Flora(map, plants, SEED, {}, { tick: 0, plants: [] });
  const critters = generateCritterSpecies(SEED, map, scratch, plants);
  const kernel = new SimKernel({ map, plantSpecies: plants, critterSpecies: critters, seed: SEED });
  const grassPlant = plants.findIndex((p) => p.habitat === Tile.Grass);
  const critter = critters[0].id;
  return { kernel, grassPlant, critter };
}

// a compact, comparable snapshot of everything the sim owns
function snap(k: SimKernel) {
  return {
    tick: k.tick,
    floraCount: k.flora.count,
    counts: [...k.speciesCounts().entries()].sort((a, b) => a[0] - b[0]),
    critters: k.critters.map((c) => [
      Math.round(c.x * 1e3), Math.round(c.y * 1e3), c.state,
      Math.round(c.energy * 1e6), c.mood, Math.round(c.targetX * 1e3), Math.round(c.targetY * 1e3),
    ]),
  };
}

test("an empty kernel places nothing until asked (no scatter)", () => {
  const { kernel } = bench();
  expect(kernel.flora.count).toBe(0);
  expect(kernel.critterCount()).toBe(0);
  expect(kernel.tick).toBe(0);
});

test("placePlant is habitat-gated: a grass plant roots on grass, refuses off-habitat", () => {
  const { kernel, grassPlant } = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  expect(kernel.placePlant(grassPlant, at(5), at(5))).not.toBeNull(); // on the grass construct
  expect(kernel.placePlant(grassPlant, -50, -50)).toBeNull();         // off the map → refused
  expect(kernel.flora.count).toBe(1);
});

test("N steps reproduce bit-identically from a seed — plants fidelity", () => {
  const a = bench(); const b = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (const s of [a, b]) s.kernel.placePlant(s.grassPlant, at(6), at(6));
  a.kernel.step(60, "plants");
  b.kernel.step(60, "plants");
  expect(snap(a.kernel)).toEqual(snap(b.kernel));
});

test("N steps reproduce bit-identically — full fidelity (critters + plants)", () => {
  const a = bench(); const b = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (const s of [a, b]) {
    s.kernel.placePlant(s.grassPlant, at(8), at(8));
    s.kernel.placeCritter(s.critter, at(11), at(11)); // within seek range of the plant
  }
  a.kernel.step(90, "full");
  b.kernel.step(90, "full");
  expect(snap(a.kernel)).toEqual(snap(b.kernel));
  expect(a.kernel.tick).toBe(90);
});

test("peaceful: step never births or kills a critter", () => {
  const { kernel, grassPlant, critter } = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (let i = 0; i < 6; i++) kernel.placePlant(grassPlant, at(4 + i), at(4));
  kernel.placeCritter(critter, at(7), at(6));
  const before = kernel.critterCount();
  kernel.step(120, "full");
  expect(kernel.critterCount()).toBe(before); // animals never die (nor multiply) in slice 1
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/kernel.test.ts` → FAIL (`src/life/kernel.ts` / `src/world/construct.ts` missing). (Task 2 builds `construct.ts`; if you run this before Task 2, expect the `singleBiome` import to be the failing edge — that is fine, it drives both. Recommended: land Task 2's `singleBiome` first, or stub it, then return here.)

- [ ] **Step 3: Implement `src/life/kernel.ts`:**

```ts
// The headless life kernel — the World-Lab's reusable muscle. It wraps the
// tested Flora + critter set + CensusLog behind ONE deterministic step(): no
// renderer, no player, all randomness through seeded rng streams, so N steps
// replay bit-identically from a seed. This is exactly what Doors A (deep-time)
// and B (the forge) fork/preview with later — so it stays clean and pure.

import { makeRng, Rng } from "../core/rng";
import { TILE_SIZE } from "../world/config";
import { WorldMap } from "../world/types";
import { CensusLog } from "./census";
import { Critter, CritterSpecies, updateCritter } from "./fauna";
import { Flora, FloraTuning, Plant } from "./flora";
import { mutate } from "./genome";
import { PlantSpecies } from "./species";

export type Fidelity = "plants" | "full";

// One tick advances the island one heartbeat AND gives every critter a fixed
// slice of think-time. A constant (never a wall-clock dt) is what keeps the
// run deterministic; ~0.5s is brisk enough that a placed critter crosses a few
// tiles and closes a chain within a watchable number of steps.
export const KERNEL_DT = 0.5;

export interface KernelInit {
  map: WorldMap;
  plantSpecies: PlantSpecies[];
  critterSpecies: CritterSpecies[];
  seed: number;
  tuning?: Partial<FloraTuning>;
  censusInterval?: number; // sim-ticks between census samples (default 1: bench feedback is immediate)
}

export class SimKernel {
  readonly map: WorldMap;
  readonly flora: Flora;
  readonly census: CensusLog;
  readonly plantSpecies: PlantSpecies[];
  readonly critterSpecies: CritterSpecies[];
  critters: Critter[] = [];
  private critterRng: Rng; // the one stream updateCritter draws from
  private placeRng: Rng; // placement drift + a critter's starting jitter — kept off the step stream

  constructor(init: KernelInit) {
    this.map = init.map;
    this.plantSpecies = init.plantSpecies;
    this.critterSpecies = init.critterSpecies;
    // EMPTY flora: a restored block with no plants means scatter() never runs —
    // the construct is a blank bench you populate by hand. chains ON so
    // substrate feeders can germinate and a chain can visibly close.
    this.flora = new Flora(
      init.map,
      init.plantSpecies,
      init.seed,
      { chains: true, ...(init.tuning ?? {}) },
      { tick: 0, plants: [] },
    );
    this.census = new CensusLog(init.censusInterval ?? 1, 240);
    this.critterRng = makeRng(init.seed ^ 0x5112);
    this.placeRng = makeRng(init.seed ^ 0x71a2);
  }

  get tick(): number {
    return this.flora.tick;
  }
  critterCount(): number {
    return this.critters.length;
  }
  speciesCounts(): ReadonlyMap<number, number> {
    return this.flora.speciesCounts;
  }

  // Set one plant of a species down (world px). Habitat-gated exactly as the
  // wild sim: addPlant refuses an off-habitat or full tile (returns null), so a
  // grass plant simply won't root on sand — the spec's "paint water first"
  // answer, minus the (deferred) biome brush.
  placePlant(speciesId: number, wx: number, wy: number): Plant | null {
    const arch = this.plantSpecies[speciesId].archetype;
    const genome = mutate(arch, this.placeRng, 0.03); // a hair of drift so a patch isn't a photocopy
    return this.flora.addPlant(speciesId, genome, wx, wy, this.flora.tick);
  }

  // Set one critter down (world px). Built as spawnCritters shapes them, but at
  // the click, not a den. Draws only from placeRng, so placement never perturbs
  // the step stream.
  placeCritter(speciesId: number, wx: number, wy: number): Critter {
    const c: Critter = {
      species: speciesId,
      x: wx,
      y: wy,
      state: "idle",
      targetX: wx,
      targetY: wy,
      stateTime: this.placeRng() * 2,
      hopPhase: this.placeRng() * 6.28,
      facing: this.placeRng() < 0.5 ? 1 : -1,
      energy: 0.5 + this.placeRng() * 0.4,
      curiosity: 0,
      mood: "content",
    };
    this.critters.push(c);
    return c;
  }

  // Run time. "plants" scrubs flora + census only (fast); "full" also steps
  // every critter headless — a null player (nothing draws them to a hearth) and
  // an empty context, so co-adaptation (grazing sets plants back, dispersal
  // spreads + emits substrate) actually happens. Deterministic end to end.
  step(nTicks = 1, fidelity: Fidelity = "full"): void {
    for (let i = 0; i < nTicks; i++) {
      this.flora.simTick();
      if (fidelity === "full") {
        for (const c of this.critters) {
          updateCritter(c, KERNEL_DT, this.map, this.flora, this.critterSpecies, null, this.critterRng, {});
        }
      }
      this.census.sample(this.flora.tick, this.flora.speciesCounts);
    }
  }
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/kernel.test.ts` → PASS (all five). If the determinism tests fail, the culprit is an unseeded draw — grep the kernel for `Math.random`/`Date`. If `placePlant(grassPlant, …)` returns null, confirm `singleBiome` fills grass and the world px lands inside the map.

- [ ] **Step 5: Commit**

```bash
git add src/life/kernel.ts tests/kernel.test.ts
git commit -m "feat: the headless life kernel — deterministic step() over flora+fauna+census

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The construct — real-tile starter templates (TDD, pure)

The blank-meadow replacement: a small real-tile `WorldMap` (no void tile) in three flavours. The playable island reuses the true generator; the sampler and single-biome are hand-filled and deterministic.

**Files:**
- Create: `src/world/construct.ts`
- Test: `tests/construct.test.ts`

**Interfaces:**
- Consumes: `generate` (`./generate`); `DEFAULT_CONFIG`, `WorldConfig` (`./config`); `Tile`, `WorldMap`, `isWalkable` (`./types`).
- Produces: `type StarterKind = "playable-island" | "biome-sampler" | "single-biome"`; `function playableIsland(seed): WorldMap`; `function biomeSampler(seed): WorldMap`; `function singleBiome(seed, tile?, size?): WorldMap`; `function buildConstruct(kind: StarterKind, seed): WorldMap`.

- [ ] **Step 1: Write the failing tests** — `tests/construct.test.ts`:

```ts
import { expect, test } from "vitest";
import { biomeSampler, buildConstruct, playableIsland, singleBiome } from "../src/world/construct";
import { Tile, WorldMap, isWalkable } from "../src/world/types";

const REAL_TILES = new Set(Object.values(Tile).filter((v) => typeof v === "number") as number[]);

// the "no void tile" guarantee: every cell is a real biome enum value
function everyTileReal(map: WorldMap): boolean {
  for (const t of map.tiles) if (!REAL_TILES.has(t)) return false;
  return true;
}

test("single-biome fills one real tile everywhere, spawn walkable", () => {
  const m = singleBiome(123, Tile.Grass, 32);
  expect(m.width).toBe(32);
  expect(m.height).toBe(32);
  expect(m.tiles.every((t) => t === Tile.Grass)).toBe(true);
  expect(everyTileReal(m)).toBe(true);
  expect(isWalkable(m, m.spawn.x, m.spawn.y)).toBe(true);
});

test("biome-sampler carries every headline biome, all real tiles, spawn on grass", () => {
  const m = biomeSampler(7);
  const present = new Set(m.tiles);
  for (const t of [Tile.ShallowWater, Tile.Sand, Tile.Grass, Tile.Forest, Tile.Marsh, Tile.Rock, Tile.Highland]) {
    expect(present.has(t)).toBe(true);
  }
  expect(everyTileReal(m)).toBe(true);
  expect(m.tiles[m.spawn.y * m.width + m.spawn.x]).toBe(Tile.Grass);
});

test("hand-built constructs are deterministic (same seed → identical tiles)", () => {
  expect([...biomeSampler(7).tiles]).toEqual([...biomeSampler(7).tiles]);
  expect([...singleBiome(7).tiles]).toEqual([...singleBiome(7).tiles]);
});

test("playable-island is a real island: valid map, some land, walkable spawn, no void", () => {
  const m = playableIsland(20260722);
  expect(m.width).toBeGreaterThan(0);
  let land = 0;
  for (const t of m.tiles) if (t !== Tile.DeepWater && t !== Tile.ShallowWater) land++;
  expect(land).toBeGreaterThan(0);
  expect(everyTileReal(m)).toBe(true);
  expect(isWalkable(m, m.spawn.x, m.spawn.y)).toBe(true);
});

test("buildConstruct dispatches each starter kind", () => {
  expect(buildConstruct("single-biome", 1).tiles.every((t) => t === Tile.Grass)).toBe(true);
  expect(new Set(buildConstruct("biome-sampler", 1).tiles).size).toBeGreaterThan(3);
  expect(buildConstruct("playable-island", 1).width).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/construct.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/world/construct.ts`:**

```ts
// Starter canvases for the Simulator — small REAL-tile worlds (no void tile),
// the blank-meadow replacement. The playable island reuses the true generator;
// the sampler and single-biome are hand-filled and deterministic. The biome
// brush (deferred) will repaint any of these tiles later; slice 1 places onto
// them as-is, which is why the sampler carries every headline biome at once.

import { DEFAULT_CONFIG, WorldConfig } from "./config";
import { generate } from "./generate";
import { Tile, WorldMap } from "./types";

export type StarterKind = "playable-island" | "biome-sampler" | "single-biome";

// A blank real-tile map: one biome everywhere, a flat elevation field, no
// rivers/features, spawn at the centre. Enough of a WorldMap for Flora (tiles +
// dims) and critters (isWalkable reads tiles).
function blankMap(w: number, h: number, seed: number, fill: Tile): WorldMap {
  const tiles = new Uint8Array(w * h);
  tiles.fill(fill);
  const elevation = new Float32Array(w * h);
  elevation.fill(0.5);
  return {
    width: w,
    height: h,
    seed,
    tiles,
    elevation,
    rivers: [],
    spawn: { x: Math.floor(w / 2), y: Math.floor(h / 2) },
  };
}

// One biome fills the map — the near-empty "blank" canvas for studying one
// habitat's web in isolation. Grass by default (walkable, so critters den and
// roam); a caller may pick another.
export function singleBiome(seed: number, tile: Tile = Tile.Grass, size = 48): WorldMap {
  return blankMap(size, size, seed, tile);
}

// The major biomes as clean horizontal bands + a Rock/Highland corner, so you
// can drop any kind onto legal ground and test cross-biome interactions in one
// screen. Deterministic (no rng). Spawn sits on the grass band.
export function biomeSampler(seed: number): WorldMap {
  const bands: Tile[] = [Tile.ShallowWater, Tile.Sand, Tile.Grass, Tile.Forest, Tile.Marsh];
  const bandH = 12;
  const w = 60;
  const h = bands.length * bandH;
  const m = blankMap(w, h, seed, Tile.Grass);
  for (let ty = 0; ty < h; ty++) {
    const band = bands[Math.min(bands.length - 1, Math.floor(ty / bandH))];
    for (let tx = 0; tx < w; tx++) m.tiles[ty * w + tx] = band;
  }
  // an upper-right high-ground corner: Highland turf over a Rock apron
  for (let ty = 0; ty < 10; ty++) {
    for (let tx = w - 12; tx < w; tx++) {
      m.tiles[ty * w + tx] = ty < 5 ? Tile.Highland : Tile.Rock;
    }
  }
  const grassBand = bands.indexOf(Tile.Grass);
  m.spawn = { x: Math.floor(w / 2), y: grassBand * bandH + Math.floor(bandH / 2) };
  return m;
}

// A small REAL island — the true generator at a modest size, so you begin with
// terrain, water and biomes to mess with immediately. The thresholds are
// loosened for the small map (the 300x300 defaults would reroll forever at this
// scale); tune them if generate() ever throws (the test guards a viable island).
export function playableIsland(seed: number): WorldMap {
  const config: WorldConfig = {
    ...DEFAULT_CONFIG,
    width: 80,
    height: 80,
    riverCount: 2,
    craterChance: 0,
    minLandFraction: 0.1,
    minWalkableRegion: 400,
  };
  return generate(seed, config);
}

export function buildConstruct(kind: StarterKind, seed: number): WorldMap {
  switch (kind) {
    case "playable-island":
      return playableIsland(seed);
    case "biome-sampler":
      return biomeSampler(seed);
    case "single-biome":
      return singleBiome(seed);
  }
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/construct.test.ts` → PASS. If `playable-island` throws "no viable island", loosen `minWalkableRegion`/`minLandFraction` or nudge `width`/`height` up until a seed lands (the test pins seed `20260722`; adjust the constants, not the seed).

- [ ] **Step 5: Re-run the kernel test now that `singleBiome` exists** — `npx vitest run tests/kernel.test.ts` → PASS (closes the Task 1 dependency).

- [ ] **Step 6: Commit**

```bash
git add src/world/construct.ts tests/construct.test.ts
git commit -m "feat: real-tile construct starters — playable-island / biome-sampler / single-biome

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `?sim` routing + the placeable-kinds filter (TDD, pure) + wire the mode

The two testable seams the bench leans on: which sim mode a URL asks for (so the swarm bench is preserved), and which palette kinds may root on a given construct. Both pure; then the one-line `main.ts` route.

**Files:**
- Modify: `src/game/flags.ts` (add `parseSimMode`)
- Create: `src/game/simRoster.ts` (`habitatsOf` + `placeablePlants`)
- Modify: `src/game/main.ts` (the `?sim` router)
- Test: `tests/flags.test.ts` (extend), `tests/sim-roster.test.ts`

**Interfaces:**
- Produces: `type SimMode = "lab" | "swarm"`; `parseSimMode(search: string): SimMode | null` (null ⇒ not sim mode); `habitatsOf(map: WorldMap): Set<Tile>`; `placeablePlants(species: PlantSpecies[], habitats: Set<Tile>): PlantSpecies[]`.
- Consumes (main.ts): `startSimulator` (existing swarm bench), `startWorldLab` (Task 4).

- [ ] **Step 1: Write the failing tests.** Append to `tests/flags.test.ts`:

```ts
import { parseSimMode } from "../src/game/flags";

test("parseSimMode: absent ?sim is not sim mode", () => {
  expect(parseSimMode("?seed=42")).toBeNull();
  expect(parseSimMode("")).toBeNull();
});
test("parseSimMode: ?sim / ?sim=1 / any other value → the World-Lab", () => {
  expect(parseSimMode("?sim")).toBe("lab");
  expect(parseSimMode("?sim=1")).toBe("lab");
  expect(parseSimMode("?sim=lab")).toBe("lab");
});
test("parseSimMode: ?sim=swarm preserves the swarm bench", () => {
  expect(parseSimMode("?sim=swarm")).toBe("swarm");
});
```

And `tests/sim-roster.test.ts`:

```ts
import { expect, test } from "vitest";
import { habitatsOf, placeablePlants } from "../src/game/simRoster";
import { biomeSampler, singleBiome } from "../src/world/construct";
import { generatePlantSpecies } from "../src/life/species";
import { Tile } from "../src/world/types";

test("habitatsOf lists the construct's distinct real tiles", () => {
  const h = habitatsOf(singleBiome(1, Tile.Grass, 16));
  expect([...h]).toEqual([Tile.Grass]);
  expect(habitatsOf(biomeSampler(1)).has(Tile.Marsh)).toBe(true);
});

test("placeablePlants keeps only species whose habitat exists on the construct", () => {
  const species = generatePlantSpecies(99);
  const grassOnly = placeablePlants(species, new Set([Tile.Grass]));
  expect(grassOnly.length).toBeGreaterThan(0);
  expect(grassOnly.every((s) => s.habitat === Tile.Grass)).toBe(true);
  // the sampler's richer habitat set admits strictly more kinds
  const sampler = placeablePlants(species, habitatsOf(biomeSampler(1)));
  expect(sampler.length).toBeGreaterThanOrEqual(grassOnly.length);
});
```

- [ ] **Step 2: Run to verify both fail** — `npx vitest run tests/flags.test.ts tests/sim-roster.test.ts`.

- [ ] **Step 3: Implement.** Append to `src/game/flags.ts`:

```ts
// Which bench a ?sim URL asks for. Today's ?sim=1 is the swarm/identity-map
// bench; the World-Lab (slice-1 construct) takes over the default, and the
// swarm bench is preserved behind ?sim=swarm. null ⇒ ordinary play.
export type SimMode = "lab" | "swarm";
export function parseSimMode(search: string): SimMode | null {
  const params = new URLSearchParams(search.startsWith("?") ? search : "?" + search);
  if (!params.has("sim")) return null;
  return params.get("sim") === "swarm" ? "swarm" : "lab";
}
```

Create `src/game/simRoster.ts`:

```ts
// The palette's raw material: which of the seed's rolled kinds may actually be
// placed on a given construct. A plant only roots on its own habitat (no biome
// brush yet in slice 1), so the palette offers exactly the species the
// construct's tiles can host.
import { PlantSpecies } from "../life/species";
import { Tile, WorldMap } from "../world/types";

export function habitatsOf(map: WorldMap): Set<Tile> {
  return new Set(map.tiles as unknown as Iterable<Tile>);
}

export function placeablePlants(species: PlantSpecies[], habitats: Set<Tile>): PlantSpecies[] {
  return species.filter((s) => habitats.has(s.habitat));
}
```

- [ ] **Step 4: Run to verify both pass** — `npx vitest run tests/flags.test.ts tests/sim-roster.test.ts` → PASS.

- [ ] **Step 5: Wire the `?sim` router in `main.ts`.** At the top-of-file sim guard (`src/game/main.ts:108`, currently `if (new URL(location.href).searchParams.has("sim")) { startSimulator(); … }`), replace the guard with mode branching. Extend the existing `./simulator` import with `startWorldLab` from `./worldlab` (Task 4 creates it — until then, stub `export function startWorldLab(): void {}` so the app compiles), and import `parseSimMode`:

```ts
import { parseSimMode } from "./flags";
import { startWorldLab } from "./worldlab";
// … existing: import { startSimulator } from "./simulator";

const simMode = parseSimMode(location.search);
if (simMode) {
  if (simMode === "swarm") startSimulator();
  else startWorldLab();
} else {
  // …everything below is the game, unchanged, run only outside the Simulator…
```

(Keep the existing `else`/closing structure intact — this only swaps the guard expression and adds the two-way branch. Ordinary play, with no `?sim`, is byte-identical.)

- [ ] **Step 6: Typecheck** — `npm run check` → 0 (with the `startWorldLab` stub in place).

- [ ] **Step 7: Commit**

```bash
git add src/game/flags.ts src/game/simRoster.ts src/game/main.ts tests/flags.test.ts tests/sim-roster.test.ts
git commit -m "feat: ?sim router (World-Lab default, swarm bench at ?sim=swarm) + placeable-kinds filter

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The bench scaffold — construct render over the real renderer (screenshot)

Stand up `startWorldLab()`: build a construct, a kernel, and draw both by **reusing the game `Renderer`** with a minimal `Scene` (real tile art, and any placed plants/critters drawn by the same pipeline). Codex chrome shell + a starter selector. No placement/time yet — just a living, real-tile canvas you can see.

**Files:**
- Create/replace: `src/game/worldlab.ts` (replace the Task-3 stub)
- (Reference only — mirror patterns:) `src/game/simulator.ts` (chrome/layout/loop), `src/game/main.ts:2590` (the `renderer.draw` Scene assembly).

**Interfaces:**
- Consumes: `buildConstruct`, `StarterKind` (`../world/construct`); `SimKernel` (`../life/kernel`); `Renderer`, `Scene` (`../render/renderer`); `generatePlantSpecies` (`../life/species`); `generateCritterSpecies` (`../life/fauna`); `Flora` (`../life/flora`); `makeRng` (`../core/rng`); `TILE_SIZE` (`../world/config`).
- Produces: `export function startWorldLab(): void`.

- [ ] **Step 1: Scaffold `startWorldLab()`.** Structure (mirror `simulator.ts` for canvas/layout/loop/chrome, but render through the game `Renderer`):

```ts
export function startWorldLab(): void {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const seed = seedFromUrl(); // reuse simulator.ts's helper (copy or import)
  let starter: StarterKind = (new URL(location.href).searchParams.get("starter") as StarterKind) || "biome-sampler";

  let map!: WorldMap, kernel!: SimKernel, renderer!: Renderer;
  let species!: PlantSpecies[], critterSpecies!: CritterSpecies[];

  function build(): void {
    map = buildConstruct(starter, seed);
    species = generatePlantSpecies(seed);
    const scratch = new Flora(map, species, seed, {}, { tick: 0, plants: [] }); // empty: dens fall back to spawn
    critterSpecies = generateCritterSpecies(seed, map, scratch, species);
    kernel = new SimKernel({ map, plantSpecies: species, critterSpecies, seed });
    if (!renderer) renderer = new Renderer(canvas, map);
    else renderer.setMap(map);
    centreCamera();
  }

  // a fixed camera that centres the construct; arrow keys / drag pan it
  let camX = 0, camY = 0;
  function centreCamera(): void {
    camX = (map.width * TILE_SIZE - renderer.viewWidth) / 2;
    camY = (map.height * TILE_SIZE - renderer.viewHeight) / 2;
  }

  build();

  function frame(now: number): void {
    renderer.draw(camX, camY, {
      player: null,
      flora: kernel.flora,
      plantSpecies: kernel.plantSpecies,
      critters: kernel.critters,
      critterSpecies: kernel.critterSpecies,
      darkness: 0,
    }, now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // … chrome (eyebrow + back button + starter selector), pan input, resize …
}
```

- [ ] **Step 2: Chrome shell** — mirror `simulator.ts`'s `buildChrome`: a fixed eyebrow ("Wonder · the Simulator" / "the world-lab" / a lowercase tagline), a "back to the island ↩" button (drop `?sim`, same as `leaveBench`), and a bottom bar with a **starter selector** (playable-island · biome-sampler · single-biome) whose change calls `build()`. All styles consume `:root` tokens (copy the `btn()`/`MONO` helpers).

- [ ] **Step 3: Pan input** — arrow keys nudge `camX/camY` (clamped to the map), and Esc drops `?sim` (leave). Resize re-centres. (No zoom needed in slice 1; `renderer` defaults to zoom 1.)

- [ ] **Step 4: Typecheck** — `npm run check` → 0.

- [ ] **Step 5: Screenshot the construct and inspect it**

```
node scripts/shot.mjs "sim=1&starter=biome-sampler" scratchpad/lab-sampler.png 2200 1100 820 ""
node scripts/shot.mjs "sim=1&starter=playable-island" scratchpad/lab-island.png 2200 1100 820 ""
```
Open both. Expected: `lab-sampler.png` — clean horizontal bands of **real tile art** (shallow water · sand · grass · forest · marsh) with a rock/highland corner, centred, codex chrome + starter selector, no life yet. `lab-island.png` — a small real island (terrain, water, coast). Confirm the tiles render as the game's art (not the swarm bench's flat meadow), and the page is legibly framed. Put PNGs under `scratchpad/` — do not commit them.

- [ ] **Step 6: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "feat: the World-Lab bench — real-tile construct rendered over the game renderer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Place-one — the palette + click-to-place (screenshot)

A minimal palette (plant kinds filtered to the construct's habitats + the rolled critter kinds), a selected tool, and click-to-place feeding the kernel. Plus a `?demo` dev aid that seeds a deterministic scenario, so screenshots (and the acceptance flow) show placed life without a click.

**Files:**
- Modify: `src/game/worldlab.ts`

**Interfaces:**
- Consumes: `placeablePlants`, `habitatsOf` (`../game/simRoster`); `kernel.placePlant`/`placeCritter`.

- [ ] **Step 1: Palette model** — `const plantKinds = placeablePlants(species, habitatsOf(map));` and `const critterKinds = critterSpecies;`. Rebuild on `build()`. Render two rows of buttons (plants tinted by `archetype.hue`, critters labelled by name); selecting one sets `selected = { kind: "plant"|"critter", id }`.

- [ ] **Step 2: Click-to-place** — on canvas click, convert screen px → world px through the camera (`wx = camX + (e.offsetX/rect.width)*renderer.viewWidth`, likewise wy), then tile-snap. If `selected.kind === "plant"`: `const p = kernel.placePlant(id, wx, wy);` and if `p === null` flash a lowercase "won't root here — wrong habitat" note (the spec's habitat answer, minus the deferred biome brush). If `"critter"`: `kernel.placeCritter(id, wx, wy)`. A separate **select** tool (default) picks an entity for Task 7's readout instead of placing.

- [ ] **Step 3: The `?demo` dev aid** — after `build()`, if `?demo` is present, seed a deterministic acceptance scenario against the kernel: a **source** plant (a placeable disperser-favoured kind), a **disperser** critter whose palate matches it (pick from `critterSpecies` via `appetite(sp.palate, source.archetype) > APPETITE_MIN`), and a hue-matched **substrate-feeder** plant (a placeable `substrateFeeder` kind within `SUBSTRATE_HUE_MATCH` of the source hue) — placed a few tiles apart near the construct centre. This makes the chain reproducible for both the screenshot harness and manual verify. (If no matching disperser/feeder exists for this seed, fall back to placing one plant + the nearest-palate critter and log a console note — the demo is a best-effort aid, not a guarantee.)

- [ ] **Step 4: Typecheck** — `npm run check` → 0.

- [ ] **Step 5: Screenshot placed life**

```
node scripts/shot.mjs "sim=1&starter=single-biome&demo=1" scratchpad/lab-placed.png 2200 1100 820 ""
```
Open it. Expected: on the grass single-biome, at least one **plant sprite** and one **critter sprite** (the game's real art) sit on the construct, with the palette rows visible in the chrome. Confirm the plant reads as a plant and the critter as a critter (not swarm motes).

- [ ] **Step 6: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "feat: place-one — habitat-gated plant/critter palette + click-to-place (+ ?demo scenario)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Time controls — pause / play / step-1 / step-N + fidelity (screenshot)

Drive the kernel: pause/play (play halts the kernel while rendering keeps running), single-step, step-N, and a plants/full fidelity toggle. Plus a `?run=N` dev aid that pre-steps on load so a screenshot shows an evolved world.

**Files:**
- Modify: `src/game/worldlab.ts`

- [ ] **Step 1: Play loop** — a `playing` flag (default false) and a wall-clock accumulator in `frame(now)`: while playing, accumulate `dt` and call `kernel.step(1, fidelity)` once per `TICK_MS` (e.g. 240ms at 1×, scaled by a speed factor). **Pause simply stops calling `step()`** — the `renderer.draw` line runs every frame regardless, so a paused world still pans and inspects. (Wall-clock here only *paces* stepping; each `step()` is seeded/deterministic — Global Constraints hold.)

- [ ] **Step 2: Controls** — bottom-bar buttons **Pause/Play · Step · Step N** (N from a small number input, default 20) and a **fidelity** toggle (plants · full). Keys: `space` play/pause, `→` step 1, `shift+→` step N. `Step`/`Step N` set `playing = false` then call `kernel.step(1|N, fidelity)`. After any step, refresh the readout (Task 7) if something is selected.

- [ ] **Step 3: The `?run=N` dev aid** — after `?demo` seeding, if `?run=N` is present, call `kernel.step(N, "full")` once on load (bounded, e.g. `Math.min(N, 5000)`), so a screenshot lands on an already-evolved bench.

- [ ] **Step 4: Typecheck** — `npm run check` → 0.

- [ ] **Step 5: Screenshot a stepped world** — the demo scenario, run forward so the disperser has fed and the feeder has begun to germinate:

```
node scripts/shot.mjs "sim=1&starter=single-biome&demo=1&run=300" scratchpad/lab-run.png 2200 1100 820 ""
```
Open it. Expected vs. `lab-placed.png`: visibly more plants (the disperser spread the source; the substrate-feeder has sprouted where it fed) — the world has clearly *changed under time*. Also drive it live: `node scripts/shot.mjs "sim=1&demo=1" scratchpad/lab-play.png 4000 1100 820 "space"` — pressing space starts play; the 4s wait lets a few ticks run, so this shot differs from the un-played one.

- [ ] **Step 6: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "feat: time controls — pause/play/step-1/step-N + fidelity toggle (render never halts)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The data readout — full internal state + live census/web (screenshot)

Inspect anything on the bench → its full internal state, plus a bench-wide legibility strip (census + living-web) that updates live as you step. A bench-owned codex plate (raw internals, not the player-facing `openInspect` card).

**Files:**
- Modify: `src/game/worldlab.ts`

**Interfaces:**
- Consumes: `critterDrives`, `dominantDrive`, `appetite` (`../life/fauna`); `sparkline` + `CensusLog.summary`/`.list` (`../life/census`); `chainStats`, `richnessWord` (`../life/foodweb`).

- [ ] **Step 1: Pick + readout plate** — with the **select** tool, a click picks the nearest placed critter (then plant) within a tile-radius. Render a right-side codex plate (mirror `simulator.ts`'s `plate` styling + `stat()`/`head()`/`title()` helpers):
  - **critter** → species name · role · size; palate (form, hueCenter, hueWidth, glowTaste); and the individual's live state — `state`, `mood`, `energy`, `curiosity`, `targetX/Y`, `meal` (its species name or "—"); plus computed **drives** via `critterDrives(c)` (hunger / comfort / curiosity) with the **dominant** one (`dominantDrive`) marked — the legible "why".
  - **plant** → species name · habitat · `substrateFeeder`; genome traits (form, hue, hue2, sat, height, spread, petals, leaves, lean, glow); **age** = `kernel.tick - plant.born`.

- [ ] **Step 2: The living-web + census strip** — a always-on panel (bottom or left): `kernel.census.summary()` → live / arose / lost; a short per-species list with `sparkline(trace.counts)` + current count (reuse `census.list()` + `flora.speciesCounts`); and `chainStats(species, critterSpecies)` → "chains N · closable M" with `richnessWord`. Recompute the census/web read after every `kernel.step` (and on placement, since a new kind can add a latent link). This is where you **watch the chain close**: when the placed source + disperser + feeder resolve, the feeder species' count climbs from 0 in the census.

- [ ] **Step 3: Typecheck** — `npm run check` → 0.

- [ ] **Step 4: Screenshot the readout** — select the demo critter (the `?demo` scenario places it deterministically; add a tiny `?inspect=critter` aid that auto-selects the first placed critter so the harness can show the plate without a click):

```
node scripts/shot.mjs "sim=1&demo=1&run=120&inspect=critter" scratchpad/lab-readout.png 2400 1200 900 ""
```
Open it. Expected: the critter plate showing role/palate + live state (energy, mood, target, meal) and the drives with the dominant marked; and the census/web strip showing per-species counts (with sparklines) and a chain count. Then `…&inspect=plant` for the plant genome plate. Confirm the numbers move between `run=0` and `run=120` (the readout is live, not static).

- [ ] **Step 5: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "feat: the data readout — full internal state + live census/living-web strip

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Full verify + the mode-isolation guard + a doc note

Prove the slice green and real worlds untouched, and leave a pointer for the next slice.

**Files:**
- Modify: `docs/superpowers/2026-07-22-plant-insect-ecology-tech.md` (a short "the World-Lab (Simulator slice 1)" note) — or the simulator spec's foot.

- [ ] **Step 1: Full gate** — `npm run check` (0) · `npx vitest run` (all green — report the count, incl. the new `kernel`/`construct`/`sim-roster`/`flags` tests) · `npm run build` (ok).

- [ ] **Step 2: The mode-isolation guard (real worlds byte-identical)** — the guard is the pure `parseSimMode` test (Task 3) plus a visual proof that the only shared-file change didn't disturb play:

```
node scripts/shot.mjs "seed=42" scratchpad/guard-world.png 2500 960 640 "Escape"
node scripts/shot.mjs "sim=swarm" scratchpad/guard-swarm.png 2500 1000 800 ""
node scripts/shot.mjs "sim=1" scratchpad/guard-lab.png 2500 1100 820 ""
```
Open all three. Expected: `guard-world.png` — island 42 in normal play, unchanged (no `?sim` ⇒ `parseSimMode` returns null ⇒ the game boots exactly as before); `guard-swarm.png` — the **existing swarm/identity-map bench**, still reachable and intact; `guard-lab.png` — the new World-Lab. Three distinct, correct destinations from one router.

- [ ] **Step 3: Doc note** — one short paragraph: the World-Lab lives at `?sim=1` (swarm bench moved to `?sim=swarm`); the kernel (`src/life/kernel.ts`) is the reusable deterministic core; the construct (`src/world/construct.ts`) is the starter surface; deferred slice-2+ items (biome brush, roll pane, evolutionary layer, save/resume, ambient bench).

- [ ] **Step 4: Commit** (push/merge handled at branch-finish, not here):

```bash
git add -A
git commit -m "docs: the World-Lab (Simulator slice 1) — kernel + construct + place-one, green

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (coverage against the slice-1 scope)

| Slice-1 scope item | Task(s) | Verified by |
|---|---|---|
| **1. Headless deterministic kernel** (wrap flora+fauna+census; N steps reproduce; both fidelities; no renderer) | Task 1 | `tests/kernel.test.ts` — determinism at plants + full fidelity, headless (node env), peaceful invariant |
| **2. Real-tile construct** (playable-island / biome-sampler / single-biome; no void tile; reuses `generate()`) | Task 2 (+ selector in Task 4) | `tests/construct.test.ts` — every tile a real enum, each biome present, deterministic, valid island; `lab-sampler`/`lab-island` shots |
| **3. Place-one** (≥1 plant + ≥1 critter kind, habitat-gated, click-to-place → kernel) | Task 3 (placeable filter) + Task 5 (palette + click + `?demo`) | `tests/sim-roster.test.ts`; kernel habitat-gate test; `lab-placed.png` |
| **4. Time controls** (pause/play/step-1/step-N; play halts kernel, render keeps running; fidelity toggle) | Task 6 | `lab-run.png` (stepped world differs) + `lab-play.png` (space starts play) |
| **5. Data readout** (full internal state of a critter/plant + species data; living-web + census update live) | Task 7 | `lab-readout.png` — drives/energy/mood/target/meal + genome + live census/chain count |
| **Determinism (seeded RNG only)** | Task 1 (kernel), Global Constraints | kernel reproduce-tests are the proof (no `Math.random`/`Date`) |
| **Peaceful pillar (nothing dies)** | Task 1 | `critterCount()` invariant test |
| **Real worlds byte-identical (mode isolation)** | Task 3 (router) + Task 8 (guard) | `parseSimMode` tests + `guard-world`/`guard-swarm`/`guard-lab` shots |
| **Reuse over fork** | Tasks 1, 4, 7 | kernel wraps Flora/fauna/census; bench reuses `Renderer`/`Scene`; readout reuses `critterDrives`/`sparkline`/`chainStats` |

## Deferred to later slices (spec build-order 2–5, noted so they aren't lost)
- **Biome brush + stamp brush** (slice 2) — slice 1 places only onto existing construct tiles; the sampler covers every headline habitat meanwhile.
- **Roll pane + drawer** (slice 3); **evolutionary layer** — pressures panel, roll-a-web, richness meter (slice 4); **save/resume to a slot + full-critter-state + RNG persistence** (slice 5); **ambient bench**; **title-screen live backdrop**.

## Open calls flagged for the controller
1. **`?sim=1` ownership.** This plan makes `?sim=1` → the new World-Lab and preserves the swarm/identity-map bench at `?sim=swarm`. Confirm that's the intended handoff (the alternative — keep `?sim=1` = swarm and route the lab elsewhere — conflicts with the `npm run shot "sim=1"` verification and the front-door "the simulator" row).
2. **New file name.** The bench lives in a new `src/game/worldlab.ts` rather than overwriting the live `src/game/simulator.ts` (the swarm bench). The spec's file map says `simulator.ts`; this preserves recent work instead. Rename later if desired.
3. **Two ecologies.** The swarm bench (`idmap.ts`/`swarm.ts`) and this kernel (`flora`/`fauna`) are *different* ecologies. Whether the World-Lab eventually hosts swarms too is a larger design question beyond slice 1.

## API-friction notes (where fauna/flora make a scope item harder than the spec implies)
- **Critter dens fall back to `map.spawn`.** `generateCritterSpecies` finds dens by scanning `flora.all` for the favourite plant; on an **empty** construct there are none, so every rolled kind dens at `map.spawn`. A placed critter's `comfort`/hunger-fallback drives therefore pull it toward spawn, not toward where you dropped it. Slice-1 mitigation (worth building into `placeCritter`/the palette): when a kind is first placed, set its species `den` to the placement tile so "home" means "here." Flag for the controller — it lightly bends the "pure place-one" model.
- **Critter/flora time coupling is approximate.** In real play, critters update every render frame (small `dt`, many per heartbeat) while flora ticks once per heartbeat. The kernel couples them **1:1** with a fixed `KERNEL_DT` — deterministic and watchable, but a critter "thinks" slower relative to flora than in-game. Fine for slice 1; note it so nobody reads bench pacing as ground truth.
- **`chainStats` is over the roster, not live individuals.** The living-web count reflects *latent* chains in the introduced-kinds set, not realised links among placed plants. The genuine "chain closed" evidence is the **census** (a substrate-feeder species climbing from 0 as it germinates). The readout pairs both; a truly realised-link web detector is a later-slice nicety.
- **`updateCritter(null player)` confirmed safe.** Read-through verified: every `player` use is guarded (`player != null` / `player &&`), and the function touches no DOM/canvas — so the kernel's headless `full` fidelity is sound (this closes the spec's "feasibility to verify before leaning on it").
</content>
</invoke>
