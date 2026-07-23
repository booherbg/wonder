# The Simulator — Slice 5a: persistence (full-critter state + sim RNG · a named Simulator slot) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the **full `Critter` behavioral state + the sim RNG stream(s)** so a saved scenario **resumes mid-thought and replays bit-identically** (backward-compatibly, benefitting the **real game** too), and add **save/resume of a Simulator (World-Lab) construct to a NAMED SLOT** in a key namespace strictly separate from real-world saves — per `docs/superpowers/specs/2026-07-21-simulator-design.md` §"The construct — starter canvases › Saving a sim to a slot" and §"Stateful & deterministic critters", and the research in `.superpowers/sdd/slice5a-facts.md`.

**Architecture — TWO STAGES.** The whole slice rides on one ~4-line enabler (an RNG state accessor), then splits into a self-contained real-game win and a Simulator-only slot:

- **Stage 1 — the RNG accessor + real-game full-critter persistence (ships on its own).** `makeRng`'s "seed" parameter and its running state are *the same 32-bit quantity* (facts §3: `let a = seed >>> 0`, no re-hashing), so "restore a stream" is literally "call `makeRng` again with the last-known `a`" — the only missing piece is a way to *read* `a`. Task 1 widens `Rng` to `(() => number) & { state?: () => number }` and attaches `.state()` (facts §3's exact code). On that, Stage 1 extends the **real-world** save (`src/game/save.ts` + `src/game/main.ts`): a **lossless, additive `crittersV2`** block carrying every `Critter` field (facts §2), with `meal` serialized as a plant index into `flora.all` and re-resolved post-restore; plus the real game's module-level `critterRng` state. Every new field is **optional**; absence falls back to today's exact `restoreCritters` defaults, proven by a **backward-compat guard test written FIRST** (Task 2) that stays green through the whole slice. This alone delivers the spec's "animals resume mid-thought" real-game benefit and a bit-identical *critter* stream.
- **Stage 2 — the Simulator slot (rides on Stage 1's accessor).** Thread rng-state read/inject through `Flora` (Task 5) and `SimKernel` (Task 6) — new optional constructor inputs, new `.state()` passthroughs — and **close the Flora resume gaps** facts §4 names (`substrates`, `suppressedSpecies`, `lastSplitTick`, plus the rng stream). Then a **`SavedSim` blob** (own `v:1`) in a **separate slot namespace** (`simSlotKey(id)` / a capped `wander.sims` index, parallel to `worldKey`/`WORLD_INDEX_KEY` but never colliding) serializes the whole kernel + drawer (Tasks 7–8), and the **World-Lab save/load-slot UI** (Task 9) mirrors `nameWorld()` + the isle picker. A determinism test (run N, snapshot, resume, run M vs. N+M straight — identical) proves bit-identical replay at both the Flora and kernel levels.

**Tech Stack:** TypeScript, Vite, Vitest (node env — `rng.ts`, `save.ts`'s critter serialization, the Flora/kernel resume threading, and `simSave.ts` are all pure/DOM-free and TDD'd). The real-game `main.ts` wiring and the World-Lab UI in `worldlab.ts` are DOM-heavy, so they are typecheck- + screenshot-verified via `node scripts/shot.mjs "…"` (the harness presses keys, not canvas coordinates, so an on-load dev-aid seeds the result) — the same "logic tested, pixels shot" practice slices 1–4 established. Storage functions take an injectable `Storage` so localStorage round-trips are unit-testable in node with an in-memory mock.

## Global Constraints

- **Backward-compatible, additive only:** every new field on `SavedWorld` is optional (`?:`); absence falls back to today's exact behavior. NO existing save may break, NO pinned seed/world may shift. The guard test (Task 2) proves it and stays green throughout.
- **Bit-identical replay:** the RNG accessor makes resume exact; a resumed stream *continues*, not restarts. A determinism test — run a sim N ticks, snapshot state+rng, resume from the snapshot, run M more, vs. running N+M straight — must be identical (Flora level Task 5, kernel level Task 6, whole-slot level Task 8).
- **Determinism (no wall clock in sim):** no `Math.random`/`Date.now`/`new Date()` in sim/kernel/flora/rng logic. (`savedAt` epoch-ms is UI metadata, set in the save path only, never a sim input — acceptable, mirroring `SavedWorld.savedAt` today.)
- **Sim slots never collide with real worlds:** a separate key namespace (`simSlotKey` vs `worldKey`), enforced by construction (different key functions, never a shared prefix).
- **Peaceful + real-worlds-untouched where it must be:** Stage 1 changes real save/restore (intended, guarded); Stage 2 is Simulator-only. Ordinary play stays byte-identical except for the intended additive persistence.
- **Commit trailer on every commit:** end every commit message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Verify:** `npm run check` clean · `npx vitest run` green · `npm run build` clean.
- **Line numbers may have drifted:** every `facts §N: file.ts:LINE` citation in this plan reflects the facts doc's snapshot of the code at the time it was written; the codebase has moved since. Treat cited line numbers as approximate — grep for the anchor named alongside the citation (a function/field name, a distinctive comment), don't trust the number itself.

**Out of scope for slice 5a (deferred — noted so nothing is lost):** scenario share/export (a "scenario string"); persisting the real game's `flora.rng`/`birdRng`/`beast` streams (Stage 1 persists the *critter* stream only — the sim slot persists flora too); census fully restoring chart history back to tick 0 (the sim slot carries `census.list()` as a nicety, but a resumed real world's charts still restart); a `v:2` migration framework for `SavedWorld` (unneeded — optional fields under `v:1` are the codebase's proven strategy, facts §6).

---

### Task 1: The RNG `.state()` accessor (the whole slice's enabler)

The ~4-line additive change facts §3 specifies: widen `Rng` so it still calls as `() => number` for every existing caller, and attach a `.state()` that reads the closure's internal `a`. Because `makeRng`'s seed IS its state, `makeRng(rng.state())` reconstructs a stream that continues exactly where the captured one left off.

**Files:**
- Modify: `src/core/rng.ts` (the `Rng` type + `makeRng`, currently 23 lines — facts §3)
- Test: `tests/rng.test.ts` (append to the existing file)

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `type Rng = (() => number) & { state?: () => number }` (widened, still callable as before).
  - `makeRng(seed: number): Rng` — unchanged signature; the returned closure now carries `.state(): number` returning the current internal `a` (a uint32, JSON-safe). `makeRng(saved)` resumes a stream from a captured `.state()`.

- [ ] **Step 1: Write the failing tests** — append to `tests/rng.test.ts`:

```ts
test("a captured .state() resumes the exact same stream (continues, not restarts)", () => {
  const a = makeRng(12345);
  for (let i = 0; i < 37; i++) a(); // advance the stream to an arbitrary point
  const saved = a.state!(); // capture mid-stream — a single uint32
  const b = makeRng(saved); // resume from the captured state
  for (let i = 0; i < 50; i++) expect(b()).toBe(a()); // b reproduces a's continuation exactly
});

test(".state() is JSON-safe and advances as the stream is drawn", () => {
  const r = makeRng(999);
  const s0 = r.state!();
  expect(Number.isInteger(s0)).toBe(true);
  expect(s0).toBeGreaterThanOrEqual(0);
  expect(s0).toBeLessThanOrEqual(0xffffffff);
  expect(JSON.parse(JSON.stringify(s0))).toBe(s0);
  r();
  expect(r.state!()).not.toBe(s0); // drawing moved the state
});

test("makeRng(seed) with a fresh seed still matches makeRng(seed) — no behavior change for existing callers", () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 100; i++) expect(a()).toBe(b()); // the pre-existing invariant still holds
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/rng.test.ts`
  Expected: FAIL — `a.state` is `undefined` (`.state!()` throws "a.state is not a function"), because `Rng` has no `.state` today.

- [ ] **Step 3: Implement the accessor** — replace the whole body of `src/core/rng.ts`'s `Rng` type + `makeRng` with (leave `hash2d` and any other exports untouched):

```ts
// A seeded stream. Still callable as () => number for every existing caller;
// .state() reads the internal counter so a stream can be captured and resumed
// exactly (slice 5a) — makeRng's "seed" argument IS its running state, so
// makeRng(rng.state()) continues rather than restarts.
export type Rng = (() => number) & { state?: () => number };

// mulberry32 — tiny, fast, plenty good for terrain
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const rng: Rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.state = () => a;
  return rng;
}
```

- [ ] **Step 4: Run to verify it passes** — Run: `npx vitest run tests/rng.test.ts`
  Expected: PASS (all rng tests, including the 4 pre-existing ones — the widening is source-compatible).

- [ ] **Step 5: Typecheck** — Run: `npm run check`
  Expected: exit 0. (Every existing `rng()` call site still typechecks; `Rng` is still callable. No call site references `.state` yet.)

- [ ] **Step 6: Commit**

```bash
git add src/core/rng.ts tests/rng.test.ts
git commit -m "feat(rng): a .state() accessor so a seeded stream can be captured and resumed exactly

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The backward-compat guard test (written FIRST, stays green forever)

Before any save-schema change lands, lock today's `restoreCritters` defaulting behavior byte-for-byte (facts §6). This is a pure regression snapshot of the *current* code — it passes immediately and must keep passing unchanged through every later task. It is the structural guarantee that old saves (legacy 4-element `critters` rows, no `crittersV2`, no rng block) never shift.

**Files:**
- Test: `tests/save.test.ts` (append to the existing file)

**Interfaces:**
- Consumes: `restoreCritters` (`../src/game/save`), `generateCritterSpecies` (`../src/life/fauna`) — both already imported at the top of `tests/save.test.ts`.
- Produces: nothing (test-only).

- [ ] **Step 1: Write the guard test** — append to `tests/save.test.ts`:

```ts
test("GUARD: an old-format save (legacy [species,x,y,energy] rows, no crittersV2, no rng) restores to today's exact defaults", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  const critterSpecies = generateCritterSpecies(SEED, map, flora, species);

  // a hand-built legacy SavedWorld: ONLY the 4-element critter rows, nothing new
  const legacy = {
    v: 1 as const,
    seed: SEED,
    tick: 0,
    savedAt: 1000,
    player: [1, 1] as [number, number],
    home: null,
    inv: [],
    plants: [],
    critters: [
      [0, 100, 200, 0.5],
      [1, 300, 400, 0.9],
      [0, 500, 600, 0.1],
    ] as number[][],
  };

  const out = restoreCritters(legacy as unknown as import("../src/game/save").SavedWorld, critterSpecies);
  expect(out).toHaveLength(3);
  // the per-index desync trick + fresh-state defaults, byte-for-byte (save.ts:166-175)
  out.forEach((c, i) => {
    const row = legacy.critters[i];
    expect(c.species).toBe(row[0]);
    expect(c.x).toBe(row[1]);
    expect(c.y).toBe(row[2]);
    expect(c.energy).toBe(row[3]);
    expect(c.state).toBe("idle");
    expect(c.targetX).toBe(row[1]); // target collapses to current position
    expect(c.targetY).toBe(row[2]);
    expect(c.stateTime).toBe((i % 5) * 0.4);
    expect(c.hopPhase).toBe((i * 1.7) % 6.28);
    expect(c.facing).toBe(i % 2 === 0 ? 1 : -1);
    expect(c.curiosity).toBe(0);
    expect(c.mood).toBe("content");
    expect(c.meal).toBeUndefined(); // no meal/treat/stuck/path on a legacy restore
    expect(c.treat).toBeUndefined();
    expect(c.stuck).toBeUndefined();
    expect(c.path).toBeUndefined();
  });
  // an out-of-range species id is dropped, not restored (save.ts:157)
  const withBad = { ...legacy, critters: [[999, 1, 2, 0.5]] as number[][] };
  expect(restoreCritters(withBad as unknown as import("../src/game/save").SavedWorld, critterSpecies)).toHaveLength(0);
});
```

- [ ] **Step 2: Run to verify it PASSES immediately** — Run: `npx vitest run tests/save.test.ts`
  Expected: PASS. (Unlike normal TDD this asserts *current* behavior — it is a regression lock, not a spec for new code. If it fails now, the snapshot of today's defaults is wrong; fix the expectations to match `restoreCritters` as it stands before proceeding.)

- [ ] **Step 3: Commit**

```bash
git add tests/save.test.ts
git commit -m "test(save): GUARD old-format critter restore (legacy rows -> today's exact defaults), locked before any schema change

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

### Task 3: `crittersV2` — lossless full-`Critter` serialize/restore (pure, in `save.ts`)

Add an additive, **lossless** `crittersV2` block carrying every `Critter` field (facts §2), sitting *alongside* the legacy `critters?` array. `meal` — the one non-primitive field (a live `Plant` reference) — serializes as its index into `flora.all` and re-resolves against the restored flora (facts §2/§4: `addPlant`'s insertion order equals `RestoredFlora.plants`'s iteration order, so a saved `idx` re-resolves to the same live object). Lossless (no `r1`/`r3` rounding) so both the real game (Task 4) and the sim slot (Task 8) can replay bit-identically. The dispatcher `restoreCrittersV2` consults `crittersV2` when present and **falls back to today's `restoreCritters` when absent** — so the Task 2 guard stays green. One field is deliberately excluded: `companion` is re-derived on load from `SavedCamp.companion` + `takeCompanion` (a per-KIND designation — the nearest of a species is re-designated companion, not a specific critter instance), not stored per-critter. Persisting a per-critter `companion:true` in `crittersV2` risks it desyncing from `SavedCamp.companion`'s re-derivation, so these rows omit it, preserving today's re-derive-only behavior.

**Files:**
- Modify: `src/game/save.ts` (add the `SavedCritterV2` interface, the `crittersV2?` field on `SavedWorld`, and three functions; import `Flora` — the file already imports `Critter`/`CritterSpecies`/`CritterState`/`CritterMood` shapes via fauna and `Plant` via flora, per facts §1/§2. Add any missing type imports.)
- Test: `tests/save.test.ts` (append)

**Interfaces:**
- Consumes: `Critter`, `CritterState`, `CritterMood`, `CritterSpecies` (`../life/fauna`); `Flora`, `Plant` (`../life/flora`); the existing `SavedWorld`, `restoreCritters`, `packWorld` (this file).
- Produces:
  - `interface SavedCritterV2 { species: number; x: number; y: number; state: CritterState; targetX: number; targetY: number; stateTime: number; hopPhase: number; facing: 1 | -1; energy: number; meal?: number | null; treat?: boolean; curiosity: number; mood: CritterMood; stuck?: number; path?: number[]; pathGoal?: number; }` (no `companion` — deliberately omitted, see below)
  - `crittersV2?: SavedCritterV2[]` — a new optional field on `SavedWorld`.
  - `packCrittersV2(critters: Critter[]): SavedCritterV2[]` — lossless; `meal` → `meal.idx` (number) / `null` / omitted.
  - `restoreCritterRows(rows: SavedCritterV2[], speciesList: CritterSpecies[], flora: Flora): Critter[]` — builds `Critter[]` from V2 rows, re-resolving `meal` against `flora.all`.
  - `restoreCrittersV2(saved: SavedWorld, speciesList: CritterSpecies[], flora: Flora): Critter[]` — dispatcher: `saved.crittersV2 ? restoreCritterRows(...) : restoreCritters(saved, speciesList)`.

- [ ] **Step 1: Write the failing tests** — append to `tests/save.test.ts`:

```ts
import { packCrittersV2, restoreCritterRows, restoreCrittersV2 } from "../src/game/save";

test("crittersV2 losslessly round-trips every behavioral field, and re-resolves meal to the live plant", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  for (let i = 0; i < 10; i++) flora.simTick();
  const critterSpecies = generateCritterSpecies(SEED, map, flora, species);
  const critters = spawnCritters(critterSpecies, map, SEED);

  // give one critter a rich, non-default behavioral state + a live meal
  const c = critters[0];
  c.state = "seek";
  c.targetX = 111.25; c.targetY = 222.5;
  c.stateTime = 1.234567; c.hopPhase = 4.2; c.facing = -1;
  c.energy = 0.135791; c.curiosity = 0.42; c.mood = "hungry";
  c.stuck = 0.7; c.path = [3, 4, 5]; c.pathGoal = 9; c.treat = true;
  const mealIdx = 12;
  c.meal = flora.all[mealIdx];

  const rows = packCrittersV2(critters);
  const json = JSON.parse(JSON.stringify(rows)); // prove JSON-safe
  expect(json[0].meal).toBe(mealIdx); // meal serialized as a flora.all index

  // restore against a flora rebuilt in the SAME plant order (indices realign)
  const restoredFlora = new Flora(map, species, SEED, {}, {
    tick: flora.tick,
    plants: flora.all.map((p) => ({ species: p.species, genome: p.genome, x: p.x, y: p.y, born: p.born })),
  });
  const back = restoreCritterRows(json, critterSpecies, restoredFlora);
  const b = back[0];
  expect(b.state).toBe("seek");
  expect(b.targetX).toBe(111.25);
  expect(b.targetY).toBe(222.5);
  expect(b.stateTime).toBe(1.234567); // LOSSLESS — no rounding
  expect(b.hopPhase).toBe(4.2);
  expect(b.facing).toBe(-1);
  expect(b.energy).toBe(0.135791);
  expect(b.curiosity).toBe(0.42);
  expect(b.mood).toBe("hungry");
  expect(b.stuck).toBe(0.7);
  expect(b.path).toEqual([3, 4, 5]);
  expect(b.pathGoal).toBe(9);
  expect(b.treat).toBe(true);
  expect(b.meal).toBe(restoredFlora.all[mealIdx]); // re-resolved to the live object, same identity
});

test("crittersV2 preserves null vs. undefined meal, and drops out-of-range species", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  const critterSpecies = generateCritterSpecies(SEED, map, flora, species);
  const critters = spawnCritters(critterSpecies, map, SEED).slice(0, 3);
  critters[0].meal = null; // explicitly no meal
  // critters[1].meal stays undefined (no meal field at all)
  const rows = packCrittersV2(critters);
  expect(rows[0].meal).toBeNull();
  expect(rows[1].meal).toBeUndefined();
  const back = restoreCritterRows(rows, critterSpecies, flora);
  expect(back[0].meal).toBeNull();
  expect(back[1].meal).toBeUndefined();
  // an out-of-range species id is dropped
  const bad = [{ ...rows[0], species: 999 }];
  expect(restoreCritterRows(bad, critterSpecies, flora)).toHaveLength(0);
});

test("restoreCrittersV2 falls back to the LEGACY defaults when crittersV2 is absent (guard stays green through the dispatcher)", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  const critterSpecies = generateCritterSpecies(SEED, map, flora, species);
  const legacy = packWorld(SEED, 0, { x: 1, y: 1 }, null, { seeds: [] }, [], 1000, [], [], undefined, spawnCritters(critterSpecies, map, SEED));
  expect(legacy.crittersV2).toBeUndefined(); // packWorld with no crittersV2 extra writes none
  const viaDispatcher = restoreCrittersV2(legacy, critterSpecies, flora);
  const viaLegacy = restoreCritters(legacy, critterSpecies);
  // identical defaults — the dispatcher's absent-branch IS the legacy path
  expect(viaDispatcher.map((c) => [c.species, c.state, c.stateTime, c.facing, c.mood]))
    .toEqual(viaLegacy.map((c) => [c.species, c.state, c.stateTime, c.facing, c.mood]));
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/save.test.ts`
  Expected: FAIL — `packCrittersV2`/`restoreCritterRows`/`restoreCrittersV2` are not exported from `../src/game/save`.

- [ ] **Step 3: Implement in `src/game/save.ts`** — add the interface + `crittersV2?` field + three functions. First widen the `SavedWorld` interface (facts §1: it already has `critters?`) by adding one optional field next to it:

```ts
  crittersV2?: SavedCritterV2[]; // full behavioral state + rng-resumable meal; absent in saves from before slice 5a
```

Then add (near `restoreCritters`, importing `Flora`/`Plant` from `../life/flora` and `CritterState`/`CritterMood` from `../life/fauna` if not already imported):

```ts
// The full Critter state, losslessly — every field of the Critter interface
// (fauna.ts). Additive to the legacy 4-element `critters` rows; consulted only
// when present, so old saves are byte-for-byte unaffected. `meal` (a live Plant
// reference) is stored as its flora.all index and re-resolved after restore.
export interface SavedCritterV2 {
  species: number;
  x: number;
  y: number;
  state: CritterState;
  targetX: number;
  targetY: number;
  stateTime: number;
  hopPhase: number;
  facing: 1 | -1;
  energy: number;
  meal?: number | null; // absent = no meal field; null = explicitly none; number = index into flora.all at save
  treat?: boolean;
  // NOTE: no `companion` field, deliberately. The friend at your heel is
  // re-derived on load from SavedCamp.companion + takeCompanion (a per-KIND
  // designation, not a per-critter one), and the sim slot has no companion
  // concept at all. Persisting a per-critter companion:true here would risk
  // desyncing from SavedCamp.companion's re-derivation — omit it, preserving
  // today's re-derive-only behavior.
  curiosity: number;
  mood: CritterMood;
  stuck?: number;
  path?: number[];
  pathGoal?: number;
}

export function packCrittersV2(critters: Critter[]): SavedCritterV2[] {
  return critters.map((c) => {
    const row: SavedCritterV2 = {
      species: c.species,
      x: c.x, // LOSSLESS — no r1/r3; bit-identical replay depends on it
      y: c.y,
      state: c.state,
      targetX: c.targetX,
      targetY: c.targetY,
      stateTime: c.stateTime,
      hopPhase: c.hopPhase,
      facing: c.facing,
      energy: c.energy,
      curiosity: c.curiosity,
      mood: c.mood,
    };
    if (c.meal === null) row.meal = null;
    else if (c.meal) row.meal = c.meal.idx;
    if (c.treat !== undefined) row.treat = c.treat;
    // companion intentionally NOT serialized — re-derived on load, see SavedCritterV2's note
    if (c.stuck !== undefined) row.stuck = c.stuck;
    if (c.path !== undefined) row.path = c.path.slice();
    if (c.pathGoal !== undefined) row.pathGoal = c.pathGoal;
    return row;
  });
}

export function restoreCritterRows(
  rows: SavedCritterV2[],
  speciesList: CritterSpecies[],
  flora: Flora,
): Critter[] {
  const out: Critter[] = [];
  for (const row of rows) {
    const sp = row.species;
    if (sp < 0 || sp >= speciesList.length) continue; // drop out-of-range kinds (matches restoreCritters)
    const c: Critter = {
      species: sp,
      x: row.x,
      y: row.y,
      state: row.state,
      targetX: row.targetX,
      targetY: row.targetY,
      stateTime: row.stateTime,
      hopPhase: row.hopPhase,
      facing: row.facing,
      energy: row.energy,
      curiosity: row.curiosity,
      mood: row.mood,
    };
    if (row.meal === null) c.meal = null;
    else if (typeof row.meal === "number") {
      const p = flora.all[row.meal];
      if (p) c.meal = p; // re-resolve to the live plant; the tick guard re-validates anyway
    }
    if (row.treat !== undefined) c.treat = row.treat;
    // companion intentionally NOT restored from the row — re-derived by the
    // caller (takeCompanion against SavedCamp.companion), see SavedCritterV2's note
    if (row.stuck !== undefined) c.stuck = row.stuck;
    if (row.path !== undefined) c.path = row.path.slice();
    if (row.pathGoal !== undefined) c.pathGoal = row.pathGoal;
    out.push(c);
  }
  return out;
}

// The restore dispatcher: full state when a crittersV2 block is present,
// else today's exact restoreCritters defaults (the guard-tested legacy path).
export function restoreCrittersV2(
  saved: SavedWorld,
  speciesList: CritterSpecies[],
  flora: Flora,
): Critter[] {
  return saved.crittersV2
    ? restoreCritterRows(saved.crittersV2, speciesList, flora)
    : restoreCritters(saved, speciesList);
}
```

- [ ] **Step 4: Run to verify it passes** — Run: `npx vitest run tests/save.test.ts`
  Expected: PASS — all new crittersV2 tests **and** the Task 2 GUARD test and the pre-existing save tests. (`restoreCritters` was not touched; the dispatcher's absent-branch is the legacy path.)

- [ ] **Step 5: Typecheck** — Run: `npm run check`
  Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/game/save.ts tests/save.test.ts
git commit -m "feat(save): lossless crittersV2 block — full Critter state + meal-by-index, additive with a legacy fall-back

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Real-game wiring — persist `crittersV2` + the module `critterRng` state (animals resume mid-thought)

Wire Stage 1 into the real game (`src/game/main.ts`, facts §1/§3): on save, write the `crittersV2` block and the module-level `critterRng`'s `.state()`; on load, restore critters via `restoreCrittersV2` (full state) and re-seed `critterRng` from the saved state — with **both absent → today's exact behavior** (legacy `restoreCritters` defaults + a fresh `makeRng(seed ^ 0xcafe)`). This delivers the spec's real-game benefit: critters resume mid-thought, and their rng stream *continues* rather than restarting, so the critter simulation replays bit-identically. `main.ts` is the DOM entry (not unit-tested), so the save-format round-trip is asserted in `save.test.ts` and the wiring is typecheck- + grep-verified; the *stream-continues* guarantee is Task 1's proof and the *state-is-lossless* guarantee is Task 3's.

**Files:**
- Modify: `src/game/save.ts` (add the `critterRngState?: number` optional field to `SavedWorld`; widen `packWorld`'s `extra` param + its returned object literal to actually carry `crittersV2`/`critterRngState` through — `packWorld` hand-picks fields from `extra`, it does not spread it)
- Modify: `src/game/main.ts` — `persist()` (facts §1: main.ts:733-773, the single `SavedWorld` writer), the load path (facts §2: restore critters ~main.ts:879-881 — a stale facts-doc citation of `~930-939` moved; grep `restoreCritters(saved, critterSpecies)` for the real anchor), and `critterRng` construction (facts §3: main.ts:881, `makeRng(seed ^ 0xcafe)`)
- Test: `tests/save.test.ts` (append)

**Interfaces:**
- Consumes: `packWorld`, `packCrittersV2`, `restoreCrittersV2`, `SavedWorld` (`./save`); `makeRng` (`../core/rng`); the module-level `critterRng: Rng` and `currentSeed` in `main.ts` (facts §3).
- Produces:
  - `critterRngState?: number` — a new optional field on `SavedWorld`.
  - No new exported function; `packWorld`'s `extra` PARAM widens to accept `crittersV2`/`critterRngState`, and its returned object literal explicitly assigns both — `packWorld` hand-picks fields from `extra` one at a time rather than spreading it (there is no `...extra` today), so the two new fields must be added explicitly, alongside `name`/`playMs`/`soil`.

- [ ] **Step 1: Write the failing test** — append to `tests/save.test.ts`:

```ts
test("packWorld carries crittersV2 + critterRngState through `extra`; both absent by default", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  const critterSpecies = generateCritterSpecies(SEED, map, flora, species);
  const critters = spawnCritters(critterSpecies, map, SEED);
  critters[0].state = "seek";
  critters[0].mood = "hungry";

  const rngState = 0xabcdef; // a captured critterRng.state()
  const saved = packWorld(
    SEED, flora.tick, { x: 1, y: 1 }, null, { seeds: [] }, flora.all, 1000,
    [], [], undefined, critters,
    { crittersV2: packCrittersV2(critters), critterRngState: rngState },
  );
  expect(saved.critterRngState).toBe(rngState);
  expect(saved.crittersV2).toHaveLength(critters.length);
  expect(saved.crittersV2![0].state).toBe("seek");
  expect(saved.crittersV2![0].mood).toBe("hungry");

  // a legacy save (no extra) carries neither — the fall-back is intact
  const legacy = packWorld(SEED, 0, { x: 1, y: 1 }, null, { seeds: [] }, [], 1000);
  expect(legacy.crittersV2 ?? null).toBeNull();
  expect(legacy.critterRngState ?? null).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/save.test.ts`
  Expected: FAIL — `saved.critterRngState` typechecks as never / is `undefined` because `SavedWorld` has no `critterRngState` field.

- [ ] **Step 3: Add the field to `SavedWorld`, and widen `packWorld` to actually carry `crittersV2`/`critterRngState` through `extra`.** In `src/game/save.ts`, next to `crittersV2?`:

```ts
  critterRngState?: number; // the sim critter rng stream position, so animals resume mid-thought; absent in saves from before slice 5a
```

`packWorld` does **NOT** spread `extra` onto the returned object — it hand-picks fields one at a time (`name: extra.name`, `playMs: extra.playMs`, `soil: extra.soil && …`). Adding the two fields to the `SavedWorld` interface alone will NOT make them appear on a packed save; `packWorld` itself must be widened. Widen its `extra` param type:

```ts
// was:
  extra: { name?: string; playMs?: number; soil?: number[] } = {},
// now:
  extra: { name?: string; playMs?: number; soil?: number[]; crittersV2?: SavedCritterV2[]; critterRngState?: number } = {},
```

and add the two fields to the returned object literal, alongside `soil`:

```ts
// was:
    soil: extra.soil && extra.soil.length > 0 ? [...extra.soil] : undefined,
// now:
    soil: extra.soil && extra.soil.length > 0 ? [...extra.soil] : undefined,
    crittersV2: extra.crittersV2,
    critterRngState: extra.critterRngState,
```

(`SavedCritterV2` is Task 3's type, already defined earlier in this file — no new import needed.)

- [ ] **Step 4: Run to verify the save-format test passes** — Run: `npx vitest run tests/save.test.ts`
  Expected: PASS (the new format test + all prior save tests + the GUARD).

- [ ] **Step 5: Wire `main.ts` — save path.** In `persist()` (facts §1: main.ts:733-773), where `packWorld(...)` is assembled with its `extra` object, add the two fields (the module `critterRng` is in scope, facts §3: main.ts:680/696):

```ts
    // ...inside persist()'s packWorld extra object, alongside name/playMs/soil:
    crittersV2: packCrittersV2(critters),
    critterRngState: critterRng.state?.(),
```

Import `packCrittersV2` from `./save` (its import list already pulls `packWorld`/`restoreCritters`).

- [ ] **Step 6: Wire `main.ts` — load path.** Where critters are restored today (facts §2: `restoreCritters(...)` before `takeCompanion`, ~main.ts:879-881 — the facts doc's `~930-939` citation is stale; grep `restoreCritters(saved, critterSpecies)` for the real anchor), the restored `Flora` is already in scope (facts §4: `flora.setHome(...)` runs at main.ts:860-861, so the Flora exists by the critter-restore point). The real code is:

```ts
const savedCritters = saved ? restoreCritters(saved, critterSpecies) : [];
critters = savedCritters.length > 0 ? savedCritters : spawnCritters(critterSpecies, map, seed);
```

`saved` is `null` for a new/unsaved world, so it is guarded, and there's a `spawnCritters` fallback for when nothing was restored. Swap ONLY the inner call — preserve both the guard and the fallback line:

```ts
// was:
    const savedCritters = saved ? restoreCritters(saved, critterSpecies) : [];
    critters = savedCritters.length > 0 ? savedCritters : spawnCritters(critterSpecies, map, seed);
// now:
    const savedCritters = saved ? restoreCrittersV2(saved, critterSpecies, flora) : [];
    critters = savedCritters.length > 0 ? savedCritters : spawnCritters(critterSpecies, map, seed);
```

(Do NOT collapse this to a single unguarded `const critters = restoreCrittersV2(saved, critterSpecies, flora);` — `saved` is `null` for a new/unsaved world, so an unguarded call would throw on a fresh island, and it would also discard the `spawnCritters` fallback that seeds fresh critters at their dens when there is no save or the save carried zero critters.)

And where `critterRng` is (re)seeded on entering a world (facts §3: main.ts:881, `makeRng(seed ^ 0xcafe)`), resume from the saved state when present:

```ts
    // was: critterRng = makeRng(seed ^ 0xcafe);
    critterRng = makeRng(saved?.critterRngState ?? (seed ^ 0xcafe)); // resume the stream when the save carries it, else fresh
```

(If the local variable holding the loaded save is not named `saved` at that line, use whatever `loadSave(seed)` result is in scope — facts §1: `loadSave` is main.ts:775-784; the `critterRng` seed line runs in the same world-entry path. When there is no save, the `?? (seed ^ 0xcafe)` branch is today's exact behavior.)

Import `restoreCrittersV2` from `./save`.

- [ ] **Step 7: Typecheck + grep the wiring** — Run:

```bash
npm run check
grep -nE "critterRngState|restoreCrittersV2|packCrittersV2" src/game/main.ts
```
Expected: `npm run check` exit 0; the grep shows `packCrittersV2(critters)` + `critterRngState: critterRng.state?.()` in the save path, `restoreCrittersV2(saved, critterSpecies, flora)` and `makeRng(saved?.critterRngState ?? (seed ^ 0xcafe))` in the load path. Confirm no remaining bare `restoreCritters(saved` in the real load path (only the guard-tested function definition and the dispatcher's fall-back should reference it).

- [ ] **Step 8: Determinism spot-check** — Run: `grep -nE "Math\.random|Date\.now|new Date" src/core/rng.ts src/game/save.ts` → no hits in the critter-serialization or rng logic (the only `Date.now`/`savedAt` uses are the UI save-metadata path, which is allowed). The "stream continues, not restarts" guarantee is Task 1's rng test; the "state is lossless" guarantee is Task 3's round-trip.

- [ ] **Step 9: Screenshot the real game is intact** — Run:

```
node scripts/shot.mjs "seed=42" scratchpad/s5a-realworld.png 2500 960 640 "Escape"
```
Open `scratchpad/s5a-realworld.png`. Expected: island 42 renders and plays exactly as before — critters present, no visual change (the persistence is invisible until a save/reload). This guards that the wiring did not disturb ordinary play.

- [ ] **Step 10: Commit**

```bash
git add src/game/save.ts src/game/main.ts tests/save.test.ts
git commit -m "feat(save): real game persists full critter state + critterRng stream — animals resume mid-thought, backward-compatibly

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Stage 2 — the Simulator slot

### Task 5: Thread rng-state + close the Flora resume gaps (`flora.ts`)

Expose `Flora`'s rng stream position, accept a restored one, and close the three resume gaps facts §4 names so a resumed Flora is bit-identical: `substrates` (in-flight byproduct markers — no restore path today), `suppressedSpecies` (public Set, re-apply), and `lastSplitTick` (private speciation-cooldown gate — without it, a resumed sim could allow an *early* split the original run's cooldown blocked). All additive via new optional `RestoredFlora` fields + read-only accessors; the existing 5-arg `new Flora(...)` and every current caller are untouched.

**Files:**
- Modify: `src/life/flora.ts` — the `RestoredFlora` interface (facts §4: currently `{ tick; plants; soil? }`, flora.ts:131-135), the constructor (facts §4: flora.ts:166-182, where `restored` skips `scatter`), the `Substrate` interface (add `export` if not already exported, facts §4: flora.ts:31-38), `private rng` (flora.ts:161), `private lastSplitTick` (flora.ts:164)
- Test: `tests/flora.test.ts` (append)

**Interfaces:**
- Consumes: `makeRng` (`../core/rng`), the existing `Flora`/`RestoredFlora`/`Substrate` (this file).
- Produces:
  - `RestoredFlora` gains: `rngState?: number; substrates?: Substrate[]; suppressed?: number[]; lastSplitTick?: number;` (all optional — absence = today's behavior).
  - `Flora.rngState(): number` — the current rng stream position (`this.rng.state!()`).
  - `Flora.substratesSnapshot(): Substrate[]` — a copy of the live substrate markers.
  - `Flora.lastSplitTickValue(): number` — the speciation-cooldown gate (may be `-Infinity`).
  - `export interface Substrate` (ensure it is exported for the sim slot to serialize).

- [ ] **Step 1: Write the failing test** — append to `tests/flora.test.ts` (mirror the file's existing `new Flora(map, species, SEED)` construction style):

```ts
test("a Flora resumes bit-identically from a full restore blob (rng + substrates + lastSplitTick)", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);

  // (a) a straight run: scatter, step to N, snapshot, keep stepping to N+M
  const a = new Flora(map, species, SEED);
  const N = 60, M = 60;
  for (let i = 0; i < N; i++) a.simTick();
  const blob = {
    tick: a.tick,
    plants: a.all.map((p) => ({ species: p.species, genome: p.genome, x: p.x, y: p.y, born: p.born })),
    soil: a.soilTileKeys(),
    rngState: a.rngState(),
    substrates: a.substratesSnapshot(),
    suppressed: [...a.suppressedSpecies],
    lastSplitTick: Number.isFinite(a.lastSplitTickValue()) ? a.lastSplitTickValue() : undefined,
  };
  for (let i = 0; i < M; i++) a.simTick();

  // (b) a resumed run from the N-snapshot, then M more
  const b = new Flora(map, species, SEED, {}, blob);
  expect(b.tick).toBe(N); // resumed at the snapshot tick
  expect(b.rngState()).toBe(blob.rngState); // the stream position was injected, not re-seeded
  for (let i = 0; i < M; i++) b.simTick();

  // identical continuation
  const snap = (f: Flora) => ({
    tick: f.tick,
    count: f.count,
    plants: f.all.map((p) => [p.species, Math.round(p.x * 1e3), Math.round(p.y * 1e3), Math.round(p.genome.hue * 1e6)]),
    rng: f.rngState(),
  });
  expect(snap(b)).toEqual(snap(a));
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/flora.test.ts`
  Expected: FAIL — `a.rngState`/`a.substratesSnapshot`/`a.lastSplitTickValue` are not functions on `Flora`, and `RestoredFlora` has no `rngState`/`substrates`/`lastSplitTick` fields.

- [ ] **Step 3: Implement in `src/life/flora.ts`.**

  (a) Ensure the `Substrate` interface is exported (facts §4: flora.ts:31-38) — prefix with `export` if it is only `interface Substrate {...}` today:

```ts
export interface Substrate {
  x: number;
  y: number;
  hue: number;
  glow: number;
  form: number;
  born: number;
}
```

  (b) Widen `RestoredFlora` (facts §4: flora.ts:131-135):

```ts
export interface RestoredFlora {
  tick: number;
  plants: { species: number; genome: Genome; x: number; y: number; born: number }[];
  soil?: number[]; // tile keys the wanderer amended with soil
  rngState?: number; // resume the flora rng stream exactly (slice 5a); absent = fresh makeRng(seed ^ 0xf10a)
  substrates?: Substrate[]; // in-flight byproduct-chain markers; absent = none
  suppressed?: number[]; // suppressedSpecies ids to re-apply; absent = none
  lastSplitTick?: number; // speciation cooldown gate; absent = -Infinity (never split yet)
}
```

  (c) In the constructor (facts §4: flora.ts:166-182), where `this.rng = makeRng(seed ^ 0xf10a)` is set, resume from the restored state when present:

```ts
    this.rng = makeRng(restored?.rngState ?? (seed ^ 0xf10a));
```

  And after the plants are re-inserted (still inside the `restored` branch that skips `scatter`), re-apply the three gap fields:

```ts
    if (restored) {
      if (restored.substrates) this.substrates = restored.substrates.map((s) => ({ ...s }));
      if (restored.suppressed) for (const id of restored.suppressed) this.suppressedSpecies.add(id);
      if (restored.lastSplitTick !== undefined) this.lastSplitTick = restored.lastSplitTick;
    }
```

(Place this where `restored` is in scope — right after the existing plant re-insertion loop, before the constructor ends. `this.substrates` and `this.lastSplitTick` are the existing private fields, facts §4: flora.ts:156/164; `this.suppressedSpecies` is the existing public `readonly` Set, flora.ts:149 — `.add` mutates its contents, allowed under `readonly`.)

  (d) Add the three read-only accessors (anywhere among the public methods, e.g. near `takeEvents`):

```ts
  rngState(): number {
    return this.rng.state!(); // makeRng always attaches .state (slice 5a)
  }

  substratesSnapshot(): Substrate[] {
    return this.substrates.map((s) => ({ ...s }));
  }

  lastSplitTickValue(): number {
    return this.lastSplitTick; // may be -Infinity when no split has happened yet
  }
```

- [ ] **Step 4: Run to verify it passes** — Run: `npx vitest run tests/flora.test.ts`
  Expected: PASS — the resume run reproduces the straight run bit-identically, and all pre-existing flora tests stay green (the new `RestoredFlora` fields are optional; existing callers pass none).

- [ ] **Step 5: Typecheck** — Run: `npm run check`
  Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/life/flora.ts tests/flora.test.ts
git commit -m "feat(flora): resume the rng stream + substrates + suppressed + lastSplitTick — a Flora reloads bit-identically

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Thread rng-state + restored flora/critters through `SimKernel` + the bit-identical replay test

Give `SimKernel` the optional resume inputs facts §4 names (`restoredFlora`, `critterRngState`, `placeRngState`) so it constructs its `Flora` from a *real* saved block (not the hardcoded `{ tick: 0, plants: [] }`, facts §4: kernel.ts:55) and resumes both rng streams; add `.state()` passthroughs. Critters are restored by the caller via `kernel.critters = restoreCritterRows(...)` after construction (kernel.ts:39 makes `critters` a public mutable field), which re-resolves `meal` against the kernel's own flora — so no `save.ts` import is needed in the life layer. This task carries **THE Global-Constraints bit-identical replay test** at the kernel level.

**Files:**
- Modify: `src/life/kernel.ts` — `KernelInit` (facts §4: kernel.ts:24-31), the constructor's `new Flora(...)` call + `critterRng`/`placeRng` seeding (facts §4: kernel.ts:52-59)
- Test: `tests/kernel.test.ts` (append; reuse the file's existing `bench()`/`snap()` helpers and imports)

**Interfaces:**
- Consumes: `RestoredFlora` (`./flora`), `makeRng` (`../core/rng`), `packCrittersV2`/`restoreCritterRows` (`../game/save`, in the TEST only — the kernel source stays free of `save.ts`), the existing `KernelInit`/`SimKernel`.
- Produces:
  - `KernelInit` gains: `restoredFlora?: RestoredFlora; critterRngState?: number; placeRngState?: number;` (all optional).
  - `SimKernel.critterRngState(): number`, `SimKernel.placeRngState(): number` — stream-position accessors.
  - (`SimKernel.flora.rngState()` from Task 5 is the flora stream accessor — reused, not re-added.)

- [ ] **Step 1: Write the failing test** — append to `tests/kernel.test.ts` (extend the imports at the top with `import { packCrittersV2, restoreCritterRows } from "../src/game/save";` and reuse `bench`/`snap`/`TILE_SIZE`):

```ts
test("a kernel resumes bit-identically from a full snapshot — flora + critters + all rng streams", () => {
  const a = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  a.kernel.placePlant(a.grassPlant, at(8), at(8));
  a.kernel.placeCritter(a.critter, at(11), at(11)); // within seek range → it will form a meal mid-run
  a.kernel.step(90, "full");

  // snapshot: flora restore block + critters-as-rows + both kernel rng positions
  const restoredFlora = {
    tick: a.kernel.flora.tick,
    plants: a.kernel.flora.all.map((p) => ({ species: p.species, genome: p.genome, x: p.x, y: p.y, born: p.born })),
    soil: a.kernel.flora.soilTileKeys(),
    rngState: a.kernel.flora.rngState(),
    substrates: a.kernel.flora.substratesSnapshot(),
    suppressed: [...a.kernel.flora.suppressedSpecies],
    lastSplitTick: Number.isFinite(a.kernel.flora.lastSplitTickValue()) ? a.kernel.flora.lastSplitTickValue() : undefined,
  };
  const critterRows = JSON.parse(JSON.stringify(packCrittersV2(a.kernel.critters))); // JSON-safe rows (meal as idx)
  const critterRngState = a.kernel.critterRngState();
  const placeRngState = a.kernel.placeRngState();

  // rebuild the same map + plant roster deterministically; the CRITTER roster
  // must be CLONED from the live run, not regenerated from seed — placeCritter
  // (facts §4: kernel.ts:90) mutates the shared CritterSpecies record's `den`,
  // and this test also mutated its `role`; calling generateCritterSpecies(...)
  // again would build a fresh roster missing both, and the resumed run could
  // diverge on homing.
  const map = singleBiome(SEED, Tile.Grass, 40);
  const plants = generatePlantSpecies(SEED);
  const critterSpecies = structuredClone(a.kernel.critterSpecies);
  const resumed = new SimKernel({
    map, plantSpecies: plants, critterSpecies, seed: SEED,
    restoredFlora, critterRngState, placeRngState,
  });
  resumed.critters = restoreCritterRows(critterRows, critterSpecies, resumed.flora); // re-resolves meal against resumed.flora
  expect(resumed.tick).toBe(90);
  expect(resumed.critterRngState()).toBe(critterRngState);

  // step BOTH forward 90 more; identical
  a.kernel.step(90, "full");
  resumed.step(90, "full");
  expect(snap(resumed)).toEqual(snap(a.kernel));
  // and the mid-thought behavioral state carried across (not reset to idle)
  expect(resumed.critters.map((c) => [c.state, Math.round(c.curiosity * 1e6), Math.round(c.hopPhase * 1e6)]))
    .toEqual(a.kernel.critters.map((c) => [c.state, Math.round(c.curiosity * 1e6), Math.round(c.hopPhase * 1e6)]));
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/kernel.test.ts`
  Expected: FAIL — `KernelInit` has no `restoredFlora`/`critterRngState`/`placeRngState`, and `SimKernel.critterRngState`/`placeRngState` are not functions.

- [ ] **Step 3: Implement in `src/life/kernel.ts`.**

  (a) Widen `KernelInit` (facts §4: kernel.ts:24-31) — add three optional fields (import `RestoredFlora` from `./flora`):

```ts
export interface KernelInit {
  map: WorldMap;
  plantSpecies: PlantSpecies[];
  critterSpecies: CritterSpecies[];
  seed: number;
  tuning?: Partial<FloraTuning>;
  censusInterval?: number;
  restoredFlora?: RestoredFlora; // resume a saved construct's flora (slice 5a); absent = empty bench
  critterRngState?: number; // resume the critter rng stream; absent = fresh makeRng(seed ^ 0x5112)
  placeRngState?: number; // resume the placement rng stream; absent = fresh makeRng(seed ^ 0x71a2)
}
```

  (b) In the constructor (facts §4: kernel.ts:52-59), pass the restored block into `new Flora(...)` and resume both rng streams:

```ts
    this.flora = new Flora(
      init.map,
      init.plantSpecies,
      init.seed,
      { chains: true, ...(init.tuning ?? {}) },
      init.restoredFlora ?? { tick: 0, plants: [] }, // empty bench unless resuming a saved construct
    );
    this.census = new CensusLog(init.censusInterval ?? 1, 240);
    this.critterRng = makeRng(init.critterRngState ?? (init.seed ^ 0x5112));
    this.placeRng = makeRng(init.placeRngState ?? (init.seed ^ 0x71a2));
```

  (c) Add the two stream-position accessors (near the other public methods):

```ts
  critterRngState(): number {
    return this.critterRng.state!();
  }

  placeRngState(): number {
    return this.placeRng.state!();
  }
```

- [ ] **Step 4: Run to verify it passes** — Run: `npx vitest run tests/kernel.test.ts`
  Expected: PASS — the resumed kernel reproduces `a.kernel`'s next 90 ticks bit-identically (flora + critters + rng), and the critters carried their mid-thought state; all pre-existing kernel tests stay green (the new `KernelInit` fields are optional, so `bench()` still builds an empty kernel).

- [ ] **Step 5: Typecheck** — Run: `npm run check`
  Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/life/kernel.ts tests/kernel.test.ts
git commit -m "feat(kernel): resume from a restored flora + injected critter/place rng streams — bit-identical kernel replay

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The sim-slot namespace + `SavedSim` types + capped/evicted storage (`simSave.ts`)

A **new Simulator-only file** holding the whole `SavedSim` type surface and the slot storage plumbing — a key namespace **strictly separate** from real worlds (facts §5/§6: `simSlotKey(id)` = `wander.sim.<id>` vs `worldKey(seed)` = `wander.world.<seed>`; `SIM_INDEX_KEY` = `wander.sims` vs `WORLD_INDEX_KEY` = `wander.worlds`), capped and evict-oldest like `MAX_SAVED_WORLDS = 8`. Storage functions take an injectable `Storage` so the round-trip is unit-testable in node with an in-memory mock; the browser passes `localStorage`. Types are defined here (one place) so Task 8's `packSim`/`restoreSim` and the UI reference the exact same field names.

**Files:**
- Create: `src/game/simSave.ts`
- Test: `tests/sim-save.test.ts`

**Interfaces:**
- Consumes: `StarterKind` (`../world/construct`); `PlantSpecies` (`../life/species`); `CritterSpecies` (`../life/fauna`); `Genome` (`../life/genome`); `Substrate` (`../life/flora`); `SavedCritterV2` (`./save`); `DrawerEntry` (`./simDrawer`); `SpeciesTrace` (`../life/census`).
- Produces:
  - `const SIM_INDEX_KEY = "wander.sims"`, `const MAX_SAVED_SIMS = 8`, `function simSlotKey(id: string): string`.
  - `interface SimSlotMeta { id: string; name: string; savedAt: number; }`
  - `interface SavedSimFlora { tick: number; plants: SavedSimPlant[]; soil?: number[]; rngState: number; substrates?: Substrate[]; suppressed?: number[]; lastSplitTick?: number; }`
  - `interface SavedSimPlant { species: number; genome: Genome; x: number; y: number; born: number; }`
  - `interface SavedSimControl { playing: boolean; fidelity: "plants" | "full"; speedMul: number; stepN: number; }`
  - `interface SavedSim { v: 1; savedAt: number; name: string; starter: StarterKind; seed: number; width: number; height: number; tiles?: number[]; flora: SavedSimFlora; critters: SavedCritterV2[]; critterRngState: number; placeRngState: number; plantSpecies: PlantSpecies[]; critterSpecies: CritterSpecies[]; drawer: DrawerEntry[]; census?: SpeciesTrace[]; control?: SavedSimControl; }`
  - `function saveSimSlot(store: Storage, meta: SimSlotMeta, blob: SavedSim): void`
  - `function readSimIndex(store: Storage): SimSlotMeta[]`
  - `function loadSimSlot(store: Storage, id: string): SavedSim | null`
  - `function forgetSimSlot(store: Storage, id: string): void`

- [ ] **Step 1: Write the failing test** — `tests/sim-save.test.ts`:

```ts
import { expect, test } from "vitest";
import {
  MAX_SAVED_SIMS,
  SIM_INDEX_KEY,
  forgetSimSlot,
  loadSimSlot,
  readSimIndex,
  saveSimSlot,
  simSlotKey,
  type SavedSim,
  type SimSlotMeta,
} from "../src/game/simSave";
import { worldKey, WORLD_INDEX_KEY } from "../src/game/save";

// an in-memory Storage so the localStorage round-trip is testable in node
function memStore(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear() { m.clear(); },
    getItem(k: string) { return m.get(k) ?? null; },
    key(i: number) { return [...m.keys()][i] ?? null; },
    removeItem(k: string) { m.delete(k); },
    setItem(k: string, v: string) { m.set(k, String(v)); },
  } as Storage;
}

// a minimal well-typed SavedSim (Task 8 produces the full one; storage is blob-agnostic)
function stubSim(name: string): SavedSim {
  return {
    v: 1, savedAt: 1, name, starter: "single-biome", seed: 7, width: 40, height: 40,
    flora: { tick: 0, plants: [], rngState: 0 },
    critters: [], critterRngState: 0, placeRngState: 0,
    plantSpecies: [], critterSpecies: [], drawer: [],
  };
}

test("the sim-slot namespace never collides with the real-world namespace", () => {
  expect(simSlotKey("abc")).toBe("wander.sim.abc");
  expect(simSlotKey("abc")).not.toBe(worldKey(7 as unknown as number));
  expect(SIM_INDEX_KEY).toBe("wander.sims");
  expect(SIM_INDEX_KEY).not.toBe(WORLD_INDEX_KEY);
});

test("save/load/forget round-trips a slot; the index is most-recent-first", () => {
  const store = memStore();
  const meta: SimSlotMeta = { id: "a1", name: "reef", savedAt: 100 };
  saveSimSlot(store, meta, stubSim("reef"));
  saveSimSlot(store, { id: "b2", name: "meadow", savedAt: 200 }, stubSim("meadow"));
  expect(readSimIndex(store).map((m) => m.id)).toEqual(["b2", "a1"]); // newest first
  expect(loadSimSlot(store, "a1")?.name).toBe("reef");
  expect(store.getItem(worldKey(7))).toBeNull(); // no real-world key was ever written

  forgetSimSlot(store, "a1");
  expect(loadSimSlot(store, "a1")).toBeNull(); // blob gone
  expect(readSimIndex(store).map((m) => m.id)).toEqual(["b2"]); // index entry gone
});

test("re-saving the same id moves it to front without duplicating", () => {
  const store = memStore();
  saveSimSlot(store, { id: "a1", name: "v1", savedAt: 100 }, stubSim("v1"));
  saveSimSlot(store, { id: "b2", name: "other", savedAt: 150 }, stubSim("other"));
  saveSimSlot(store, { id: "a1", name: "v2", savedAt: 200 }, stubSim("v2")); // re-save a1
  expect(readSimIndex(store).map((m) => m.id)).toEqual(["a1", "b2"]);
  expect(readSimIndex(store).filter((m) => m.id === "a1")).toHaveLength(1); // no dupe
  expect(loadSimSlot(store, "a1")?.name).toBe("v2"); // blob updated
});

test("the index caps at MAX_SAVED_SIMS, evicting the oldest blob AND its index entry", () => {
  const store = memStore();
  for (let i = 0; i < MAX_SAVED_SIMS + 3; i++) {
    saveSimSlot(store, { id: `s${i}`, name: `s${i}`, savedAt: i }, stubSim(`s${i}`));
  }
  const idx = readSimIndex(store);
  expect(idx).toHaveLength(MAX_SAVED_SIMS);
  expect(loadSimSlot(store, "s0")).toBeNull(); // oldest blob evicted
  expect(store.getItem(simSlotKey("s0"))).toBeNull(); // its blob key removed, not orphaned
  expect(idx.map((m) => m.id)).not.toContain("s0");
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/sim-save.test.ts`
  Expected: FAIL — `../src/game/simSave` does not exist.

- [ ] **Step 3: Implement `src/game/simSave.ts`** (types + storage; the pack/restore bodies land in Task 8 — this file starts with only the type surface + storage):

```ts
// The Simulator slot — a saved World-Lab construct, in a key namespace STRICTLY
// separate from real worlds (simSlotKey/SIM_INDEX_KEY vs worldKey/WORLD_INDEX_KEY),
// so a sim slot can never collide with or evict a real wander.world.<seed> entry.
// Its own v:1 marker from day one (SavedWorld lacks a migration path — facts §6).
import type { StarterKind } from "../world/construct";
import type { PlantSpecies } from "../life/species";
import type { CritterSpecies } from "../life/fauna";
import type { Genome } from "../life/genome";
import type { Substrate } from "../life/flora";
import type { SavedCritterV2 } from "./save";
import type { DrawerEntry } from "./simDrawer";
import type { SpeciesTrace } from "../life/census";

export const SIM_INDEX_KEY = "wander.sims"; // parallel to WORLD_INDEX_KEY = "wander.worlds"
export const MAX_SAVED_SIMS = 8; // mirrors MAX_SAVED_WORLDS

export function simSlotKey(id: string): string {
  return `wander.sim.${id}`; // parallel to worldKey's `wander.world.${seed}` — never a shared prefix
}

export interface SimSlotMeta {
  id: string;
  name: string; // a sim slot names itself (not seed-derived); the user-chosen name is its only name
  savedAt: number; // epoch ms — UI metadata, never a sim input
}

export interface SavedSimPlant {
  species: number;
  genome: Genome; // stored wholesale (lossless) — bit-identical replay depends on it
  x: number;
  y: number;
  born: number;
}

export interface SavedSimFlora {
  tick: number;
  plants: SavedSimPlant[];
  soil?: number[];
  rngState: number;
  substrates?: Substrate[];
  suppressed?: number[];
  lastSplitTick?: number; // omitted when -Infinity (never split yet)
}

export interface SavedSimControl {
  playing: boolean;
  fidelity: "plants" | "full";
  speedMul: number;
  stepN: number;
}

export interface SavedSim {
  v: 1;
  savedAt: number;
  name: string;
  starter: StarterKind;
  seed: number;
  width: number; // for a defensive dim check on restore
  height: number;
  tiles?: number[]; // the full tile grid, ONLY when painted (differs from buildConstruct(starter, seed))
  flora: SavedSimFlora;
  critters: SavedCritterV2[]; // full behavioral state (reuses save.ts's lossless rows)
  critterRngState: number;
  placeRngState: number;
  plantSpecies: PlantSpecies[]; // wholesale, INCLUDING runtime introduces + mutations
  critterSpecies: CritterSpecies[]; // wholesale, INCLUDING runtime den/role mutations (facts §4)
  drawer: DrawerEntry[]; // the roster/palette roster, plain data
  census?: SpeciesTrace[]; // optional — chart continuity only, feeds no rng
  control?: SavedSimControl; // optional — UI pacing continuity
}

export function readSimIndex(store: Storage): SimSlotMeta[] {
  const raw = store.getItem(SIM_INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SimSlotMeta[]) : [];
  } catch {
    return []; // defensive — a corrupt index reads as empty, never throws
  }
}

export function saveSimSlot(store: Storage, meta: SimSlotMeta, blob: SavedSim): void {
  store.setItem(simSlotKey(meta.id), JSON.stringify(blob));
  const index = readSimIndex(store).filter((m) => m.id !== meta.id); // drop any prior entry for this id
  index.unshift(meta); // most-recent-first
  while (index.length > MAX_SAVED_SIMS) {
    const evicted = index.pop()!;
    store.removeItem(simSlotKey(evicted.id)); // evict the oldest blob too, never orphan it
  }
  store.setItem(SIM_INDEX_KEY, JSON.stringify(index));
}

export function loadSimSlot(store: Storage, id: string): SavedSim | null {
  const raw = store.getItem(simSlotKey(id));
  if (!raw) return null;
  try {
    const blob = JSON.parse(raw) as SavedSim;
    return blob.v === 1 ? blob : null; // only the version we understand
  } catch {
    return null;
  }
}

export function forgetSimSlot(store: Storage, id: string): void {
  store.removeItem(simSlotKey(id));
  const index = readSimIndex(store).filter((m) => m.id !== id);
  store.setItem(SIM_INDEX_KEY, JSON.stringify(index));
}
```

(If `worldKey`/`WORLD_INDEX_KEY` are not already exported from `src/game/save.ts`, add `export` to them — facts §1 lists both as existing top-level definitions, save.ts:191-196. The test imports them to prove non-collision.)

- [ ] **Step 4: Run to verify it passes** — Run: `npx vitest run tests/sim-save.test.ts`
  Expected: PASS — all four storage tests (namespace non-collision, round-trip, re-save-to-front, cap+evict).

- [ ] **Step 5: Typecheck** — Run: `npm run check`
  Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/game/simSave.ts tests/sim-save.test.ts src/game/save.ts
git commit -m "feat(sim-slot): a SavedSim type surface + a capped wander.sims namespace, strictly separate from real worlds

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `packSim` / `restoreSim` — serialize a whole kernel+drawer and resume it bit-identically

The determinism-critical serialization: gather the enumerated kernel state (facts §4/§5 — starter+seed, painted tiles only, full flora, full critters, both rng streams, `plantSpecies`/`critterSpecies` wholesale *including* runtime `den`/`role` mutations, the drawer roster, optional census + control) into a `SavedSim`, and a matching `restoreSim` that reconstructs a `SimKernel` + drawer. One task because the `SavedSim` field names in `packSim` must match `restoreSim` exactly. Carries the **whole-slot** round-trip determinism proof. Also adds the drawer `keySeq` bump facts §4 flags (so new entries after resume don't collide with restored keys).

**Files:**
- Modify: `src/game/simSave.ts` (add `packSim`/`restoreSim` + a `tilesIfPainted` helper)
- Modify: `src/game/simDrawer.ts` (add `export function syncKeySeq(entries: DrawerEntry[]): void` + export the existing key-mint as `nextDrawerKey()` — facts §4: the module owns a `let keySeq` at simDrawer.ts:42)
- Test: `tests/sim-save.test.ts` (append)

**Interfaces:**
- Consumes: `SimKernel`, `KernelInit` (`../life/kernel`); `buildConstruct`, `StarterKind` (`../world/construct`); `packCrittersV2`, `restoreCritterRows` (`./save`); `DrawerEntry`, `syncKeySeq` (`./simDrawer`); the `SavedSim`/`SavedSimControl` types (this file, Task 7).
- Produces:
  - `interface PackSimInput { kernel: SimKernel; drawer: DrawerEntry[]; starter: StarterKind; seed: number; name: string; savedAt: number; control?: SavedSimControl; }`
  - `function packSim(input: PackSimInput): SavedSim`
  - `interface RestoredSim { kernel: SimKernel; drawer: DrawerEntry[]; starter: StarterKind; control?: SavedSimControl; }`
  - `function restoreSim(saved: SavedSim): RestoredSim`
  - `simDrawer.ts`: `function nextDrawerKey(): string` (the existing minter, now exported), `function syncKeySeq(entries: DrawerEntry[]): void`.

- [ ] **Step 1: Write the failing test** — append to `tests/sim-save.test.ts`:

```ts
import { packSim, restoreSim } from "../src/game/simSave";
import { nextDrawerKey, syncKeySeq } from "../src/game/simDrawer";
import { SimKernel } from "../src/life/kernel";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { generateCritterSpecies } from "../src/life/fauna";
import { buildConstruct } from "../src/world/construct";
import { Tile } from "../src/world/types";
import { TILE_SIZE } from "../src/world/config";
import { paintBiome } from "../src/game/simBrush";

const SEED = 4242;

function liveBench() {
  // buildConstruct("single-biome", SEED) — NOT singleBiome(SEED, Tile.Grass, 40).
  // packSim/restoreSim rebuild the map via buildConstruct(starter, seed), which
  // calls singleBiome(seed) at its DEFAULT size (48, not 40); a bench built at a
  // different size would make tilesIfPainted always see a "painted" diff (or
  // restoreSim would throw a straight dim mismatch).
  const map = buildConstruct("single-biome", SEED);
  const plants = generatePlantSpecies(SEED);
  const scratch = new Flora(map, plants, SEED, {}, { tick: 0, plants: [] });
  const critters = generateCritterSpecies(SEED, map, scratch, plants);
  const kernel = new SimKernel({ map, plantSpecies: plants, critterSpecies: critters, seed: SEED });
  const grassPlant = plants.findIndex((p) => p.habitat === Tile.Grass);
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (let i = 0; i < 6; i++) kernel.placePlant(grassPlant, at(6 + i), at(6));
  kernel.placeCritter(critters[0].id, at(9), at(7)); // mutates its species' den (facts §4)
  kernel.setCritterRole(critters[0].id, "grazer"); // a live role mutation to persist
  return { kernel, map, grassPlant };
}

function snap(k: SimKernel) {
  return {
    tick: k.tick,
    floraCount: k.flora.count,
    counts: [...k.speciesCounts().entries()].sort((a, b) => a[0] - b[0]),
    critters: k.critters.map((c) => [
      Math.round(c.x * 1e3), Math.round(c.y * 1e3), c.state,
      Math.round(c.energy * 1e6), c.mood, Math.round(c.curiosity * 1e6),
    ]),
    frng: k.flora.rngState(), crng: k.critterRngState(), prng: k.placeRngState(),
  };
}

test("packSim -> JSON -> restoreSim resumes a whole construct bit-identically", () => {
  const { kernel } = liveBench();
  kernel.step(90, "full");

  const blob = packSim({ kernel, drawer: [], starter: "single-biome", seed: SEED, name: "grassbench", savedAt: 123 });
  const json = JSON.parse(JSON.stringify(blob)) as typeof blob; // prove fully JSON-safe
  const r = restoreSim(json);
  expect(r.kernel.tick).toBe(90);

  kernel.step(90, "full");
  r.kernel.step(90, "full");
  expect(snap(r.kernel)).toEqual(snap(kernel)); // identical continuation, all three streams included
});

test("packSim captures runtime species mutations (den + role) wholesale", () => {
  const { kernel } = liveBench();
  const blob = JSON.parse(JSON.stringify(packSim({ kernel, drawer: [], starter: "single-biome", seed: SEED, name: "x", savedAt: 1 })));
  const r = restoreSim(blob);
  // the grazer role and the placement-moved den survived the round-trip
  expect(r.kernel.critterSpecies[0].role).toBe("grazer");
  expect(r.kernel.critterSpecies[0].den).toEqual(kernel.critterSpecies[0].den);
});

test("tiles are persisted only when painted; a painted construct restores its paint", () => {
  const { kernel, map } = liveBench();
  const unpainted = packSim({ kernel, drawer: [], starter: "single-biome", seed: SEED, name: "x", savedAt: 1 });
  expect(unpainted.tiles).toBeUndefined(); // pristine construct === buildConstruct(starter, seed)

  paintBiome(map, [{ tx: 2, ty: 2 }], Tile.ShallowWater); // hand-paint one cell (facts §4)
  const painted = packSim({ kernel, drawer: [], starter: "single-biome", seed: SEED, name: "x", savedAt: 1 });
  expect(painted.tiles).toBeDefined();
  const r = restoreSim(JSON.parse(JSON.stringify(painted)));
  const idx = 2 * r.kernel.map.width + 2;
  expect(r.kernel.map.tiles[idx]).toBe(Tile.ShallowWater); // paint restored
});

test("syncKeySeq advances the drawer minter past restored keys (no collision after resume)", () => {
  const restored = [
    { key: "e3" }, { key: "e7" }, { key: "e5" },
  ] as unknown as Parameters<typeof syncKeySeq>[0];
  syncKeySeq(restored);
  const next = nextDrawerKey(); // must be past 7
  expect(Number(next.slice(1))).toBeGreaterThan(7);
});
```

- [ ] **Step 2: Run to verify it fails** — Run: `npx vitest run tests/sim-save.test.ts`
  Expected: FAIL — `packSim`/`restoreSim` not exported from `./simSave`; `nextDrawerKey`/`syncKeySeq` not exported from `./simDrawer`.

- [ ] **Step 3: Add the drawer key helpers to `src/game/simDrawer.ts`.** The module already owns a `let keySeq` (simDrawer.ts:42) and mints keys inline in `makeEntry` as `` `e${keySeq++}` `` — an **"e" prefix, no dash** (simDrawer.ts:51: `key: \`e${keySeq++}\`,`). Export a `nextDrawerKey()` that mints in that exact format, and add the bump:

```ts
// exported so the sim slot can mint fresh, collision-free keys after a resume
export function nextDrawerKey(): string {
  return `e${keySeq++}`; // the file's existing format — an "e" prefix, no dash
}

// after restoring a saved roster, advance the shared counter past every restored
// key's numeric suffix, so new entries never collide with resumed ones (facts §4)
export function syncKeySeq(entries: DrawerEntry[]): void {
  for (const e of entries) {
    const suffix = Number(e.key.slice(1)); // strip the "e" prefix — real keys are "e0"/"e42", never dashed
    if (Number.isFinite(suffix) && suffix >= keySeq) keySeq = suffix + 1;
  }
}
```

Then change `makeEntry`'s own `key: \`e${keySeq++}\`,` line to `key: nextDrawerKey(),`, routing the single existing mint site through it so there is exactly one owner of the format. This is a pure, Simulator-only refactor — `tests/sim-drawer.test.ts` asserts no particular key format (only stability/uniqueness), so it stays green through the change.

- [ ] **Step 4: Add `packSim`/`restoreSim` + `tilesIfPainted` to `src/game/simSave.ts`:**

```ts
import type { DrawerEntry } from "./simDrawer";
import { syncKeySeq } from "./simDrawer";
import { SimKernel } from "../life/kernel";
import { buildConstruct } from "../world/construct";
import { packCrittersV2, restoreCritterRows } from "./save";

export interface PackSimInput {
  kernel: SimKernel;
  drawer: DrawerEntry[];
  starter: StarterKind;
  seed: number;
  name: string;
  savedAt: number;
  control?: SavedSimControl;
}

// the tile grid ONLY when it has been hand-painted away from the pure
// buildConstruct(starter, seed) baseline; else undefined (buildConstruct
// reproduces it on restore). Small: width*height bytes.
function tilesIfPainted(tiles: Uint8Array, starter: StarterKind, seed: number): number[] | undefined {
  const base = buildConstruct(starter, seed).tiles;
  if (base.length !== tiles.length) return Array.from(tiles); // defensive: any dim drift → persist wholesale
  for (let i = 0; i < tiles.length; i++) if (tiles[i] !== base[i]) return Array.from(tiles);
  return undefined;
}

export function packSim(input: PackSimInput): SavedSim {
  const { kernel, drawer, starter, seed, name, savedAt, control } = input;
  const lastSplit = kernel.flora.lastSplitTickValue();
  return {
    v: 1,
    savedAt,
    name,
    starter,
    seed,
    width: kernel.map.width,
    height: kernel.map.height,
    tiles: tilesIfPainted(kernel.map.tiles, starter, seed),
    flora: {
      tick: kernel.flora.tick,
      plants: kernel.flora.all.map((p) => ({ species: p.species, genome: p.genome, x: p.x, y: p.y, born: p.born })),
      soil: kernel.flora.soilTileKeys(),
      rngState: kernel.flora.rngState(),
      substrates: kernel.flora.substratesSnapshot(),
      suppressed: [...kernel.flora.suppressedSpecies],
      lastSplitTick: Number.isFinite(lastSplit) ? lastSplit : undefined, // -Infinity is not JSON-safe
    },
    critters: packCrittersV2(kernel.critters),
    critterRngState: kernel.critterRngState(),
    placeRngState: kernel.placeRngState(),
    plantSpecies: structuredClone(kernel.plantSpecies), // wholesale, incl. runtime introduces
    critterSpecies: structuredClone(kernel.critterSpecies), // wholesale, incl. den/role mutations
    drawer: structuredClone(drawer),
    census: kernel.census.list(),
    control,
  };
}

export interface RestoredSim {
  kernel: SimKernel;
  drawer: DrawerEntry[];
  starter: StarterKind;
  control?: SavedSimControl;
}

export function restoreSim(saved: SavedSim): RestoredSim {
  const map = buildConstruct(saved.starter, saved.seed);
  if (saved.tiles) {
    if (saved.tiles.length !== map.tiles.length) {
      throw new Error(`sim slot dim mismatch: ${saved.tiles.length} vs ${map.tiles.length}`);
    }
    map.tiles.set(saved.tiles); // overlay the painted grid
  }
  const plantSpecies = structuredClone(saved.plantSpecies);
  const critterSpecies = structuredClone(saved.critterSpecies);
  const kernel = new SimKernel({
    map,
    plantSpecies,
    critterSpecies,
    seed: saved.seed,
    restoredFlora: {
      tick: saved.flora.tick,
      plants: saved.flora.plants,
      soil: saved.flora.soil,
      rngState: saved.flora.rngState,
      substrates: saved.flora.substrates,
      suppressed: saved.flora.suppressed,
      lastSplitTick: saved.flora.lastSplitTick,
    },
    critterRngState: saved.critterRngState,
    placeRngState: saved.placeRngState,
  });
  // critters restored after the kernel exists so meal re-resolves against kernel.flora
  kernel.critters = restoreCritterRows(saved.critters, critterSpecies, kernel.flora);
  const drawer = structuredClone(saved.drawer);
  syncKeySeq(drawer); // new entries won't collide with resumed keys
  return { kernel, drawer, starter: saved.starter, control: saved.control };
}
```

(`kernel.map.width`/`height`/`tiles`, `kernel.map` public readonly, and `kernel.census.list()` are all per facts §4. NOTE: the codebase's one existing deep-clone convention is the GUARDED `cloneDef` helper (`src/game/simDrawer.ts:37-40` — `structuredClone` when present, else a JSON round-trip), not a bare `structuredClone`. Prefer `cloneDef` for `plantSpecies`/`critterSpecies`/`drawer` here and in `restoreSim` below, for consistency with that convention.)

- [ ] **Step 5: Run to verify it passes** — Run: `npx vitest run tests/sim-save.test.ts`
  Expected: PASS — the whole-slot bit-identical resume, the den/role wholesale capture, the painted-tiles round-trip, and the keySeq bump.

- [ ] **Step 6: Typecheck + full sim-side suite** — Run: `npm run check` (exit 0), then `npx vitest run tests/sim-save.test.ts tests/kernel.test.ts tests/flora.test.ts tests/sim-drawer.test.ts` (all green — the drawer refactor didn't break the roster suite).

- [ ] **Step 7: Determinism grep** — Run: `grep -nE "Math\.random|Date\.now|new Date" src/game/simSave.ts` → no hits (the only wall-clock is `savedAt`, passed in by the UI, never read as a sim input).

- [ ] **Step 8: Commit**

```bash
git add src/game/simSave.ts src/game/simDrawer.ts tests/sim-save.test.ts
git commit -m "feat(sim-slot): packSim/restoreSim — full kernel+drawer serialization, bit-identical resume, keySeq synced

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: The World-Lab save/load-slot UI (`worldlab.ts`)

Add the save/load-slot controls as one more button-row in the existing bench chrome (facts §5: alongside the drawer panel + time-controls bar, following the `ui.onX = () => {...}` callback convention, worldlab.ts:1532-1560). Save prompts for a name (mirroring `nameWorld()`'s `window.prompt`, facts §5), serializes via `packSim`, and writes through `saveSimSlot(localStorage, …)`. Load opens a slot picker (mirroring the isle picker, facts §5) whose rows come from `readSimIndex(localStorage)`; clicking a row calls `restoreSim` and rebuilds the bench (new kernel, restored drawer, `renderer.setMap`). This is DOM wiring — verified by typecheck + a screenshot showing the controls and the picker; the round-trip correctness is Task 8's unit proof.

**Files:**
- Modify: `src/game/worldlab.ts` — the chrome/button-row construction (facts §5: ~worldlab.ts:2112-2150), the `ui` callback object (worldlab.ts:1532-1560), and the module state it holds (`drawer` at worldlab.ts:546; the current `starter`/`seed`/`kernel`; time-control state `playing`/`fidelity`/`speedMul`/`stepN` at worldlab.ts:1521-1528)
- Test: none new (UI; unit coverage is Tasks 7–8). Add a display-only dev-aid `?slots=1` for the shot.

**Interfaces:**
- Consumes: `packSim`, `restoreSim`, `saveSimSlot`, `readSimIndex`, `forgetSimSlot`, `loadSimSlot`, `simSlotKey`, `type SimSlotMeta`, `type SavedSimControl` (`./simSave`); the bench's existing chrome helpers (`btn()`/`group()`/`label()` etc. per facts §5) and `renderer.setMap` (facts §5, the isle picker's `sail` does `renderer.setMap(map)`).
- Produces: `ui.onSaveSlot: () => void`, `ui.onLoadSlot: () => void`, and an internal `rebuildFromSim(r: RestoredSim)` that swaps in the restored kernel/drawer.

- [ ] **Step 1: Add a slot id + name-on-save prompt (mirrors `nameWorld()`).** In `worldlab.ts`, wire `ui.onSaveSlot` alongside the other `ui.on*` callbacks:

```ts
ui.onSaveSlot = () => {
  const name = window.prompt("name this construct", currentSlotName ?? "construct")?.trim();
  if (!name) return; // empty/cancel → no save (mirrors nameWorld's null/empty guard)
  const savedAt = Date.now(); // UI metadata only — never a sim input
  const id = currentSlotId ?? `${savedAt.toString(36)}-${Math.floor(savedAt % 1000)}`; // stable per open slot; fresh otherwise
  const control: SavedSimControl = { playing, fidelity, speedMul, stepN };
  const blob = packSim({ kernel, drawer, starter, seed, name, savedAt, control });
  saveSimSlot(localStorage, { id, name, savedAt }, blob);
  currentSlotId = id;
  currentSlotName = name;
  flashHud(`saved · ${name}`); // reuse the bench's existing HUD-flash helper
};
```

(Add module-level `let currentSlotId: string | null = null;` and `let currentSlotName: string | null = null;` near the other bench state. `starter`/`seed` are the values the current construct was built from; `playing`/`fidelity`/`speedMul`/`stepN` are the existing time-control state, facts §4/§5. If the bench's HUD-flash helper has a different name, use it.)

- [ ] **Step 2: Add the load-slot picker (mirrors the isle picker) + the rebuild.** Wire `ui.onLoadSlot` to open a picker over `readSimIndex(localStorage)`:

```ts
ui.onLoadSlot = () => openSlotPicker();

function openSlotPicker(): void {
  const rows = readSimIndex(localStorage); // {id, name, savedAt}[], most-recent-first
  // build a panel of .slot-row entries (name + "last saved" phrase + a forget button),
  // mirroring picker.ts's openPicker: a click on a row loads it, a forget button removes it.
  renderSlotPanel(rows, (id) => {
    const blob = loadSimSlot(localStorage, id);
    if (!blob) return;
    rebuildFromSim(restoreSim(blob), blob.seed, id, blob.name);
    closeSlotPanel();
  }, (id) => {
    forgetSimSlot(localStorage, id);
    openSlotPicker(); // re-open with the entry gone (mirrors the isle picker's forget → re-open)
  });
}

function rebuildFromSim(r: RestoredSim, restoredSeed: number, id: string, name: string): void {
  kernel = r.kernel;
  drawer = r.drawer;
  starter = r.starter;
  seed = restoredSeed; // the construct's seed, carried in the blob — keep the module `seed` in sync so a re-save re-derives the same baseline
  if (r.control) { playing = r.control.playing; fidelity = r.control.fidelity; speedMul = r.control.speedMul; stepN = r.control.stepN; }
  currentSlotId = id;
  currentSlotName = name;
  renderer.setMap(kernel.map); // point the renderer at the restored construct (facts §5)
  refreshDrawerPanel(); // re-render the roster panel from the restored drawer
}
```

(`kernel`, `drawer`, `starter`, `seed` must be reassignable module `let`s — if any is currently `const`, change it to `let` (a Simulator-only change). The construct's `seed` is threaded from the loaded blob into `rebuildFromSim` so the module `seed` stays in sync (a later re-save re-derives the same `buildConstruct` baseline). `renderSlotPanel`/`closeSlotPanel`/`refreshDrawerPanel` are the bench's panel helpers; reuse the isle-picker DOM pattern from `picker.ts` for row layout. The picker reads `savedAt` for a "last saved" phrase — the same `savedAtOf`/relative-time helper the isle picker uses.)

- [ ] **Step 3: Add the button-row + the `?slots=1` dev-aid.** In the chrome construction (facts §5: ~worldlab.ts:2112-2150), add a "save · load" button-row using the existing `btn()`/`group()` helpers, wired to `ui.onSaveSlot`/`ui.onLoadSlot`. Then honor a display-only query flag so the shot can open the picker on load:

```ts
if (new URLSearchParams(location.search).get("slots") === "1") openSlotPicker();
```

- [ ] **Step 4: Typecheck** — Run: `npm run check`
  Expected: exit 0.

- [ ] **Step 5: Screenshot the controls + the picker.** Run:

```
node scripts/shot.mjs "sim=1&starter=single-biome" scratchpad/s5a-lab-controls.png 2600 1400 950 ""
node scripts/shot.mjs "sim=1&starter=single-biome&slots=1" scratchpad/s5a-lab-picker.png 2600 1400 950 ""
```
Open both. Expected: `s5a-lab-controls.png` — the bench shows a **save · load** button-row in the chrome (codex tokens, no hardcoded hexes), the rest of the bench unchanged. `s5a-lab-picker.png` — the slot picker panel is open (empty on a fresh profile, or listing saved slots), mirroring the isle picker's row layout. Confirm the controls read coherently and the picker opens.

- [ ] **Step 6: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "feat(worldlab): save/load a construct to a named slot — name-on-save prompt + a slot picker mirroring the isle picker

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Full verify + backward-compat / determinism / namespace guards + a doc note

Prove the whole slice green, the persistence backward-compatible and deterministic, real worlds untouched, and leave a pointer in the tech doc.

**Files:**
- Modify: `docs/superpowers/2026-07-22-plant-insect-ecology-tech.md` (a short "persistence (slice 5a)" note)

- [ ] **Step 1: Full gate** — Run: `npm run check` (exit 0) · `npx vitest run` (all green — report the count; call out the still-green Task 2 GUARD, the new `rng`/`save`/`flora`/`kernel`/`sim-save` tests, and the untouched slice-1–4 `construct`/`sim-roster`/`sim-brush`/`roll`/`sim-drawer`/`kernel` suites) · `npm run build` (ok).

- [ ] **Step 2: Backward-compat proof.** Confirm the GUARD test (Task 2) is still green unchanged and that a legacy `SavedWorld` (no `crittersV2`, no `critterRngState`) restores via the dispatcher to the exact legacy defaults (Task 3's fall-back test). No pinned seed shifts: `grep -nE "crittersV2|critterRngState" src/game/save.ts` shows only optional (`?:`) fields and additive functions; `restoreCritters` (the legacy function) is unchanged.

- [ ] **Step 3: Determinism proof.** The bit-identical replay is proven at three levels — Task 1 (a stream resumes exactly), Task 5 (a Flora resumes bit-identically), Task 6 (a kernel resumes bit-identically), Task 8 (a whole slot resumes bit-identically). Confirm `grep -nE "Math\.random|Date\.now|new Date" src/core/rng.ts src/game/save.ts src/game/simSave.ts src/life/flora.ts src/life/kernel.ts` → the only hits are UI `savedAt` metadata (none in sim/flora/kernel/rng logic).

- [ ] **Step 4: Namespace-isolation proof.** `grep -nE "wander\.sim" src/game/simSave.ts` shows `wander.sim.<id>` / `wander.sims`; the `tests/sim-save.test.ts` non-collision test asserts `simSlotKey(id) !== worldKey(seed)` and `SIM_INDEX_KEY !== WORLD_INDEX_KEY`. A sim slot never writes a `wander.world.*` key (the round-trip test asserts `store.getItem(worldKey(7))` stays null).

- [ ] **Step 5: Real-worlds-untouched screenshot.** Run:

```
node scripts/shot.mjs "seed=42" scratchpad/s5a-guard-world.png 2500 960 640 "Escape"
node scripts/shot.mjs "sim=1&starter=single-biome" scratchpad/s5a-guard-lab.png 2600 1400 950 ""
```
Open both. Expected: `s5a-guard-world.png` — island 42 in ordinary play, visually unchanged (the additive persistence is invisible until reload); `s5a-guard-lab.png` — the World-Lab with the new save/load row, otherwise intact.

- [ ] **Step 6: Doc note** — append one short paragraph to `docs/superpowers/2026-07-22-plant-insect-ecology-tech.md`: slice 5a shipped persistence — an RNG **`.state()`** accessor (`makeRng`'s seed *is* its state, so `makeRng(rng.state())` continues a stream); the real game now persists a **lossless `crittersV2`** block (full `Critter` state, `meal` as a flora index) + the module **`critterRng`** stream, additively and backward-compatibly (a GUARD test locks the legacy default path), so **animals resume mid-thought**; `Flora`/`SimKernel` gained resume threading (rng-state read/inject) and the Flora gaps closed (`substrates`/`suppressedSpecies`/`lastSplitTick`); and a **`SavedSim`** blob in a **separate `wander.sims` slot namespace** (`simSave.ts`, capped/evicted like real worlds, never colliding) saves/resumes a whole World-Lab construct **bit-identically**, with a name-on-save prompt + slot picker in the bench. Deferred: scenario share/export; persisting the real game's flora/bird/beast streams; a `v:2` migration framework.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/2026-07-22-plant-insect-ecology-tech.md
git commit -m "docs: persistence (slice 5a) — full critter state + sim RNG resume, and a separate Simulator slot namespace

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (coverage against the slice-5a scope)

| Slice-5a scope item (prompt / spec) | Task(s) | Verified by |
|---|---|---|
| RNG `.state()` accessor — widen `Rng`, attach `.state()`, resume exactly (facts §3) | Task 1 | `tests/rng.test.ts` — a captured `.state()` resumes the exact continuation; existing rng invariants stay green |
| Additive lossless `crittersV2` on `SavedWorld`; `meal` as a plant index re-resolved post-restore (facts §2/§4) | Task 3 | `tests/save.test.ts` — every field round-trips lossless, `meal` re-resolves to the live object, out-of-range dropped |
| A new restore path consulted when `crittersV2` present, else today's `restoreCritters` defaults | Task 3 (`restoreCrittersV2` dispatcher) + Task 4 (wired into `main.ts`) | fall-back test (dispatcher's absent-branch == legacy); GUARD still green |
| Persist the real game's module `critterRng` state; absent → fresh `makeRng(seed ^ 0xcafe)` | Task 4 | save-format test (`critterRngState` round-trips via `extra`); `main.ts` grep; Task 1 proves continuation |
| **Backward-compat GUARD test FIRST**, green throughout (facts §6) | Task 2 (written before any schema change) | passes immediately against current code, re-asserted in Tasks 3/4/10 |
| Thread rng read/inject through `Flora` (expose `rng.state()`, accept a restored rng state) | Task 5 | `rngState()` accessor + `RestoredFlora.rngState`; the Flora resume test |
| Close Flora gaps: `substrates` (no path today), `suppressedSpecies` (re-apply), `lastSplitTick` (accessor + restore) | Task 5 | `substratesSnapshot()`/`lastSplitTickValue()`/`RestoredFlora.{substrates,suppressed,lastSplitTick}`; resume test bit-identical |
| Thread through `SimKernel` (`critterRng`/`placeRng`, restored flora — new optional `KernelInit` fields, facts §4) | Task 6 | `KernelInit.{restoredFlora,critterRngState,placeRngState}` + accessors; the kernel bit-identical replay test |
| `SavedSim` blob (own `v:1`) + slot namespace separate from world keys, capped/evicted (facts §5) | Task 7 | `tests/sim-save.test.ts` — non-collision, round-trip, re-save-to-front, cap+evict |
| Serialize full kernel state incl. runtime `den`/`role` mutations, painted `map.tiles` only, drawer, optional census/control (facts §4/§5) | Task 8 (`packSim`) | den+role wholesale test; tiles-only-when-painted test |
| Matching restore reconstructing a `SimKernel` + drawer, bit-identical | Task 8 (`restoreSim`) + drawer `syncKeySeq` | whole-slot resume test; keySeq-bump test |
| World-Lab save/load-slot UI: button-row, `ui.onSaveSlot`/`ui.onLoadSlot`, name-on-save prompt (mirror `nameWorld`), slot picker (mirror isle picker) (facts §5) | Task 9 | typecheck + `s5a-lab-controls`/`s5a-lab-picker` shots |
| Bit-identical replay (resume continues, not restarts) | Tasks 1, 5, 6, 8 | four determinism tests (stream / Flora / kernel / whole-slot) |
| Determinism — no wall clock in sim | Tasks 4, 8, 10 | `grep` guards; `savedAt` only in the UI save path |
| Sim slots never collide with real worlds | Tasks 7, 10 | non-collision test + `worldKey` stays null through a slot save |
| Real worlds byte-identical except the intended additive persistence | Tasks 2, 4, 10 | GUARD test + `s5a-guard-world` shot + additive-only greps |

### Type-consistency check (packSim ↔ restoreSim ↔ types)
- `SavedSim` is defined once (Task 7). `packSim` (Task 8) writes exactly its fields; `restoreSim` (Task 8) reads exactly its fields — `flora.{tick,plants,soil,rngState,substrates,suppressed,lastSplitTick}`, `critters`, `critterRngState`, `placeRngState`, `plantSpecies`, `critterSpecies`, `drawer`, `tiles`, `width`, `height`, `starter`, `seed`, `control`. No field written that restore ignores; no field read that pack omits (`census` is written and intentionally not fed back into the kernel — chart-only, noted).
- `SavedCritterV2` (Task 3) is the single critter-row type used by `packCrittersV2`/`restoreCritterRows` (Task 3) and reused by `SavedSim.critters` (Task 7) and both real-game (Task 4) and sim-slot (Task 8) paths — one shape, no divergence.
- `RestoredFlora`'s new fields (Task 5) match the `SavedSimFlora` fields `restoreSim` passes into the kernel (Task 8): `rngState`/`substrates`/`suppressed`/`lastSplitTick`. `KernelInit.restoredFlora` (Task 6) IS `RestoredFlora`.
- Accessor names are consistent across tasks: `flora.rngState()`, `flora.substratesSnapshot()`, `flora.lastSplitTickValue()` (Task 5); `kernel.critterRngState()`, `kernel.placeRngState()` (Task 6) — referenced by the exact same names in Tasks 6 and 8.
- Storage function names: `saveSimSlot`/`readSimIndex`/`loadSimSlot`/`forgetSimSlot`/`simSlotKey` (Task 7) — referenced by the exact same names in the UI (Task 9).

### Placeholder scan
No `TODO`/`TBD`/"similar to above"/"implement later". Every code step shows complete code. The UI task (Task 9) shows the callback bodies in full and names the reused bench helpers explicitly (rather than re-printing slice-1–4 chrome code), and is screenshot-verified — consistent with how slices 1–4 handle `worldlab.ts` UI; the round-trip logic it calls is fully unit-tested in Tasks 7–8.

### Genuine ambiguities in the facts doc, and how they were resolved
1. **Lossy vs. lossless critter serialization.** The existing real-world save rounds positions (`r1`) and energy (`r3`); the spec asks Stage 1 for *both* "resume mid-thought" *and* "bit-identical". Rounding breaks bit-identity. **Resolved:** `crittersV2` is **lossless** (raw numbers, no `r1`/`r3`) — a new field, so it costs the legacy `critters` rows nothing, and one lossless critter serialization serves both the real game (Task 4) and the sim slot (Task 8). Stated in Task 3.
2. **Scope of the real game's "bit-identical".** Stage 1 persists only the *critter* rng (`critterRng`), not `flora.rng`/`birdRng`/beast. **Resolved:** Stage 1 makes the real game's **critter** stream bit-identical (the spec's named benefit) and resumes full critter state; whole-world bit-identity incl. flora is achieved for the **sim slot** (Stage 2, where `flora.rngState` is persisted). Called out in the "Out of scope" note and the Stage-1 architecture.
3. **`lastSplitTick` is `-Infinity` initially (not JSON-safe).** **Resolved:** serialize as `undefined` when non-finite; restore to `-Infinity` when the field is absent. Encoded in `packSim`/`SavedSimFlora` and the constructor default (Tasks 5/8).
4. **Construct map reconstruction (`buildConstruct(starter, seed)` vs. a param'd `singleBiome`).** Facts §4 frames `buildConstruct` as a pure `(starter, seed) → WorldMap`; the kernel test uses a lower-level `singleBiome(seed, tile, size)`. **Resolved:** persist `starter`+`seed` and rebuild via `buildConstruct`; persist the full `tiles` grid **only when painted** (differs from the baseline) with a defensive `width`/`height` dim check — any deviation beyond the pure baseline (including a different single-biome fill) shows up as a tile diff and is captured wholesale. Flagged for Task 9 to record `starter` as whatever the bench built with.
5. **`simDrawer.ts`'s key-minting API name.** Facts §4 confirms a module-level `let keySeq` (simDrawer.ts:42) and `cloneDef`, but not the minter's function name. **Resolved:** Task 8 exports `nextDrawerKey()` (routing the single existing mint site through it) + adds `syncKeySeq(entries)` sharing that one counter; the `tests/sim-drawer.test.ts` suite must stay green through the refactor. If the mint is already a named function, alias it rather than rename.
6. **Where sim-slot code lives.** Facts §5 says the serialize function sits "near `worldlab.ts`", and §1 keeps `worldKey`/`WORLD_INDEX_KEY` in `save.ts`. **Resolved:** put all sim-slot types + storage + `packSim`/`restoreSim` in a **new Simulator-only `src/game/simSave.ts`**, keeping the shared `save.ts` change minimal (only the additive `crittersV2`/`critterRngState` fields + the lossless critter functions, which the real game *and* the slot both reuse). Avoids a `src/life → src/game` layer inversion (the kernel never imports `save.ts`; the caller restores critters post-construction).




