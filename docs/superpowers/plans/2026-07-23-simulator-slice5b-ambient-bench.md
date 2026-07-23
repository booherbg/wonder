# Simulator Slice 5b — the Ambient Bench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Simulator-only (`?sim=1` World-Lab) "ambient bench" that lets you flip placed critter KINDS into opt-in experimental roles — **pollinator** (active cross), **nutrient-shuttle** (relocate substrate), and **aquatic-grazer** (fish) — OFF by default, to PROTOTYPE whether ambient creatures earn a mechanical role. Nothing graduates to real worlds in v1 (bench-only).

**Architecture:** The two "clean" roles ride the existing `Critter`/`CritterSpecies` machinery unchanged: they are new `CritterRole` literals whose only new logic is one more `else if` arm in `updateCritter`'s nibble-resolution branch (`src/life/fauna.ts`), reusing `flora.pollinateSpread` / `flora.addSubstrate` — no new movement, no new entity. The fish role reuses the same feeding (`flora.nibble`) but needs a **water-walkability predicate** threaded through the land movement stack as an injected parameter that defaults to the existing land rule, so ordinary play is byte-identical. The bench UI is a toggle tray modeled exactly on the existing pressures tray — an in-flow child of the bottom-center `stack` (never a `position:fixed` overlay), built from the existing `btn()`/`group()`/`label()` chrome — whose per-role buttons flip a kind live through the EXISTING `kernel.setCritterRole(id, role)` (the same path `grazerShare` already uses). A tiny pure model module (`src/game/simAmbient.ts`, mirroring `src/game/simPressures.ts`) carries the opt-in role menu + badge helper so the DOM wiring has a unit-testable core.

**Scope — three roles in two stages, one deferred:**
- **Stage 1 (Tasks 1–5, ships on its own):** the two CLEAN roles (`"pollinator"`, `"nutrient-shuttle"`) + the ambient bench UI. Both roles are SAFE for real play by construction — `generateCritterSpecies` (`fauna.ts:507`) and `grazerAssignment` (`simPressures.ts:99`) only ever write `"grazer"`/`"disperser"`, so nothing outside the Simulator can produce the new literals and `updateCritter`'s new arms are unreached dead branches in ordinary play (the same idiom as `Flora.suppressedSpecies` / `FloraTuning.chains`).
- **Stage 2 (Tasks 6–7):** the fish `"aquatic-grazer"` role. Feeding is a trivial reuse of `flora.nibble`; the work is MOVEMENT (`critterWalkable`, `fauna.ts:650`, is deliberately shore-only and refuses open water), so we inject a walkability predicate through `moveToward`/`stepToward`/`routeToward`/`stepOffWall` defaulting to `critterWalkable`, plus placement gating to `ShallowWater`.
- **DEFERRED — bird disperser-on-the-wing (out of scope for 5b):** documented at the end. It is a genuinely separate architectural step — flocks (`Flock`/`updateFlock`, `src/life/birds.ts`) do not exist in `SimKernel` today, it needs a two-layer real-play isolation guard (an unsupplied optional `flora` param AND a falsy opt-in flag, because `updateFlock` is a shared function real play calls directly), and a new `placeFlock` path. It stays a documented follow-up.

**Tech Stack:** TypeScript, Vite 6, Vitest 3, Playwright (headless screenshots via `scripts/shot.mjs`). No new dependencies.

## Global Constraints

Every task's requirements implicitly include this section.

- **Determinism:** no `Math.random`/`Date.now`/`new Date()`. New role logic lives inside `updateCritter`/`kernel.step()` (tick-deterministic, `KERNEL_DT=0.5`) and draws ONLY from `kernel.critterRng` (the `rng` param) or `flora`'s own `this.rng` via its methods — never a new stream. Same seed + placements + role schedule + step count ⇒ identical run. (The pickup half of nutrient-shuttle and the fish walkability predicate draw NO rng at all — nearest-by-distance and a tile test — which is stricter than required.)
- **Peaceful:** a role thins/spreads/relocates, never violently kills; `step()` never births/removes a critter. No predation (all in-scope roles are plant/substrate-directed).
- **Real worlds untouched:** adding `CritterRole` literals + `updateCritter` arms + an injected walkability predicate must be INERT for ordinary play — real play never assigns the new roles and never passes the fish predicate. Tests pin this (Tasks 1 and 6). The `foodweb.ts` `role === "disperser"` filter (`src/life/foodweb.ts:39`) already ignores unknown roles — Task 1 includes a guard test confirming NO change is needed there.
- **Art:** the ambient tray consumes `:root` tokens + `btn()`/`group()`/`label()`; copy lowercase + evocative; no reintroduced layout overlap (never a `position:fixed` side panel — see the tray's hard-won comment trail at `worldlab.ts:2680-2693`).
- **Commit trailer every commit:** `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Verify:** `npm run check` clean, `npx vitest run` green, `npm run build` clean.
- **Line numbers drift:** Task 1 expands the `CritterRole` union's comment block in `fauna.ts`, and every later task's edits shift what follows it further still. Treat every absolute line-number citation in this plan (`fauna.ts:NNN`, `worldlab.ts:NNN`, …) as a locator, not a guarantee — grep for the quoted anchor text (the exact `old_string` shown at each step) and confirm it before editing; don't trust the number alone.

## File map

| File | Responsibility | Stage |
|---|---|---|
| `src/life/fauna.ts` | new `CritterRole` literals; `carriedSubstrate` field on `Critter`; pollinator/shuttle/aquatic-grazer arms in `updateCritter`; bench constants; `WalkPredicate` type; `fishWalkable`; walkability threaded through the movement stack | 1 & 2 |
| `src/life/flora.ts` | new `takeSubstrateNear(x,y,radius)` pickup helper (find-and-remove nearest substrate) | 1 |
| `src/game/simAmbient.ts` (new) | pure model: `AMBIENT_ROLES` opt-in menu + `roleBadge()` | 1 & 2 |
| `src/game/worldlab.ts` | ambient tray + per-kind role toggles + chip role badge + role-correct inspect-card copy + `?ambient` dev-aid; fish placement gating to `ShallowWater` | 1 & 2 |
| `tests/ambient-roles.test.ts` (new) | real-play inertness + foodweb-ignores-new-roles guard | 1 |
| `tests/ambient-pollinator.test.ts` (new) | pollinator dispatch + real-flora spread | 1 |
| `tests/ambient-shuttle.test.ts` (new) | substrate relocate A→B, count conserved | 1 |
| `tests/sim-ambient.test.ts` (new) | `AMBIENT_ROLES` / `roleBadge` model | 1 & 2 |
| `tests/ambient-fish.test.ts` (new) | walkability predicates; fish swims where land can't; fish grazes water plant | 2 |

---

# STAGE 1 — the ambient bench UI + the two clean roles

---

### Task 1: Two clean `CritterRole` literals + real-play inertness

**Files:**
- Modify: `src/life/fauna.ts:19-24` (the `CritterRole` union + its comment)
- Create test: `tests/ambient-roles.test.ts`

**Interfaces:**
- Consumes: `generateCritterSpecies(seed, map, flora, plants)` (`fauna.ts:433`, returns `CritterSpecies[]`); `chainStats(plants, critters)` (`foodweb.ts:38`, returns `{ chains, closable, redundancy }`); `biomeSampler(seed)`, `generatePlantSpecies(seed)`, `new Flora(map, plants, seed)`.
- Produces: `type CritterRole = "disperser" | "grazer" | "pollinator" | "nutrient-shuttle"` (Stage 2 adds `"aquatic-grazer"`). Later tasks' `updateCritter` arms and the bench UI depend on these exact literal spellings.

- [ ] **Step 1: Write the failing test**

Create `tests/ambient-roles.test.ts`:

```ts
import { expect, test } from "vitest";
import { generateCritterSpecies } from "../src/life/fauna";
import type { CritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { chainStats } from "../src/life/foodweb";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import type { PlantSpecies } from "../src/life/species";
import { biomeSampler } from "../src/world/construct";
import { Tile } from "../src/world/types";

// Real play's ONLY critter-role writer is generateCritterSpecies (fauna.ts:507),
// a closed choice between "grazer" and "disperser". Adding bench-only literals to
// the union must stay structurally impossible for ordinary generation to produce
// — the same additive idiom as Flora.suppressedSpecies / FloraTuning.chains.
test(
  "real-play generation never yields the bench-only roles (and does exercise both real ones)",
  () => {
    let sawGrazer = false;
    let sawDisperser = false;
    for (let seed = 1; seed <= 60; seed++) {
      const map = biomeSampler(seed);
      const plants = generatePlantSpecies(seed);
      const flora = new Flora(map, plants, seed);
      const species = generateCritterSpecies(seed, map, flora, plants);
      for (const sp of species) {
        expect(sp.role === "grazer" || sp.role === "disperser").toBe(true);
        if (sp.role === "grazer") sawGrazer = true;
        if (sp.role === "disperser") sawDisperser = true;
      }
    }
    // proves the two-literal space is genuinely exercised — the assertion above
    // isn't vacuously passing on an all-disperser roster.
    expect(sawGrazer).toBe(true);
    expect(sawDisperser).toBe(true);
  },
  20_000,
);

// The one place the union type leaks into shared code: foodweb's chain-stats
// filters `role === "disperser"`. An equality check silently ignores any new
// literal — a pollinator/shuttle/fish critter simply isn't a disperser. This pins
// that NO foodweb change is needed: flipping a disperser to a new role drops it
// from the chain-stats, it never mis-counts.
test("foodweb ignores the new roles: flipping a disperser to pollinator drops it from chain-stats", () => {
  const g = (hue: number) => ({
    form: PlantForm.Flower, hue, hue2: hue, sat: 0.6, height: 0.4,
    spread: 0.4, petals: 5, leaves: 3, lean: 0, glow: 0.5,
  });
  const source = { id: 0, name: "src", habitat: Tile.Grass, archetype: g(0.5), substrateFeeder: false } as unknown as PlantSpecies;
  const feeder = { id: 1, name: "fdr", habitat: Tile.Grass, archetype: g(0.5), substrateFeeder: true } as unknown as PlantSpecies;
  const plants = [source, feeder];
  const disperser = {
    id: 0, role: "disperser",
    palate: { form: PlantForm.Flower, hueCenter: 0.5, hueWidth: 0.3, glowTaste: 0 },
  } as unknown as CritterSpecies;

  const withDisperser = chainStats(plants, [disperser]);
  expect(withDisperser.chains).toBeGreaterThan(0); // a real (P,S) link exists

  const pollinator = { ...disperser, role: "pollinator" } as CritterSpecies;
  const withPollinator = chainStats(plants, [pollinator]);
  expect(withPollinator.chains).toBe(0); // the new role is NOT a disperser — no foodweb change needed
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ambient-roles.test.ts`
Expected: FAIL — the second test references `role: "pollinator"`, which is not yet assignable to `CritterRole`; vitest reports a transform/type error such as `Type '"pollinator"' is not assignable to type 'CritterRole'` (or the test simply cannot compile). The first test would pass but the file fails as a whole.

- [ ] **Step 3: Add the two literals**

In `src/life/fauna.ts`, replace the `CritterRole` block at lines 19-24:

```ts
// How a critter's visit lands on the plant it favors. Most kinds are
// dispersers — a visit spreads the plant (a drifted seed to open ground)
// while feeding the critter, so both gain. A minority are grazers who still
// take a real bite: the thread of friction that keeps a little negative
// feedback in an otherwise mutualist web.
export type CritterRole = "disperser" | "grazer";
```

with:

```ts
// How a critter's visit lands on the plant it favors. Most kinds are
// dispersers — a visit spreads the plant (a drifted seed to open ground)
// while feeding the critter, so both gain. A minority are grazers who still
// take a real bite: the thread of friction that keeps a little negative
// feedback in an otherwise mutualist web.
//
// "pollinator" and "nutrient-shuttle" are Simulator ambient-bench roles
// (slice 5b), OFF by default and producible ONLY through worldlab.ts's ambient
// tray — generateCritterSpecies and grazerAssignment only ever write the first
// two literals, so an ordinary island's critters are always exactly "grazer" or
// "disperser" and updateCritter's new arms are unreached in real play. This is
// the same additive idiom as Flora.suppressedSpecies / FloraTuning.chains.
export type CritterRole = "disperser" | "grazer" | "pollinator" | "nutrient-shuttle";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ambient-roles.test.ts`
Expected: PASS — `Test Files 1 passed`, `Tests 2 passed`.

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/life/fauna.ts tests/ambient-roles.test.ts
git commit -m "feat(sim): add pollinator + nutrient-shuttle CritterRole literals (bench-only, inert in real play)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Pollinator active-cross arm

**Files:**
- Modify: `src/life/fauna.ts` — add `POLLINATOR_RADIUS`/`POLLINATOR_MAX_SAME` constants just above `updateCritter` (currently `fauna.ts:777`); add the pollinator arm inside the nibble-resolution branch (`fauna.ts:812-821`)
- Create test: `tests/ambient-pollinator.test.ts`

**Interfaces:**
- Consumes: `updateCritter(c, dt, map, flora, speciesList, player, rng, ctx)` (`fauna.ts:777`); `flora.pollinateSpread(p, radius, maxSame): boolean` (`flora.ts:407` — draws only from `flora.rng`, WIDER + LOWER-density than `propagate`); `flora.propagate(p)`; `flora.addSubstrate(x,y,{hue,glow,form})`; `flora.nibble(p)`.
- Produces: the pollinator behavior — a nibble-resolution on a `"pollinator"` kind calls `flora.pollinateSpread(c.meal, POLLINATOR_RADIUS, POLLINATOR_MAX_SAME)` and NOTHING else; grazer/disperser arms unchanged.

- [ ] **Step 1: Write the failing test**

Create `tests/ambient-pollinator.test.ts`:

```ts
import { expect, test, vi } from "vitest";
import { updateCritter } from "../src/life/fauna";
import type { Critter, CritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import type { Plant } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { singleBiome } from "../src/world/construct";
import { Tile, WorldMap } from "../src/world/types";
import { makeRng } from "../src/core/rng";

// The nibble-resolution DISPATCH, isolated with a fake Flora so the assertion is
// exactly "which primitive, with which args" — fully deterministic, no rng luck.
// A critter parked in "nibble" state with stateTime 0 resolves its visit on the
// next updateCritter tick (KERNEL_DT slice); flora.all[meal.idx] === meal is the
// gate the real code checks (fauna.ts:811).
function runNibble(role: CritterSpecies["role"]) {
  const meal = {
    idx: 0, x: 100, y: 100, species: 0,
    genome: { form: PlantForm.Flower, hue: 0.5, glow: 0.5 },
  } as unknown as Plant;
  const flora = {
    all: [meal],
    nibble: vi.fn(),
    propagate: vi.fn(),
    addSubstrate: vi.fn(),
    pollinateSpread: vi.fn(() => true),
    takeSubstrateNear: vi.fn(() => null),
  } as unknown as Flora;
  const speciesList = [{
    id: 0, role,
    palate: { form: PlantForm.Flower, hueCenter: 0.5, hueWidth: 0.2, glowTaste: 0 },
  }] as unknown as CritterSpecies[];
  const c = {
    species: 0, x: 100, y: 100, state: "nibble", stateTime: 0,
    targetX: 100, targetY: 100, hopPhase: 0, facing: 1, energy: 0.5, meal,
  } as unknown as Critter;
  updateCritter(c, 0.5, {} as unknown as WorldMap, flora, speciesList, null, makeRng(1), {});
  return flora as unknown as {
    nibble: ReturnType<typeof vi.fn>;
    propagate: ReturnType<typeof vi.fn>;
    addSubstrate: ReturnType<typeof vi.fn>;
    pollinateSpread: ReturnType<typeof vi.fn>;
  };
}

test("a pollinator spreads its fed plant via pollinateSpread — wider/looser than a disperser", () => {
  const f = runNibble("pollinator");
  // the wide/loose primitive, with the bench's own reach (6 tiles > the default
  // reseedRadius of 3) and its loose per-cloud density cap (2)
  expect(f.pollinateSpread).toHaveBeenCalledTimes(1);
  expect(f.pollinateSpread).toHaveBeenCalledWith(expect.objectContaining({ idx: 0 }), 6, 2);
  // and it does NOT bite or run the ordinary disperser drop
  expect(f.nibble).not.toHaveBeenCalled();
  expect(f.propagate).not.toHaveBeenCalled();
  expect(f.addSubstrate).not.toHaveBeenCalled();
});

test("grazer and disperser arms are unaffected by the new pollinator arm", () => {
  const grazer = runNibble("grazer");
  expect(grazer.nibble).toHaveBeenCalledTimes(1);
  expect(grazer.pollinateSpread).not.toHaveBeenCalled();

  const disperser = runNibble("disperser");
  expect(disperser.propagate).toHaveBeenCalledTimes(1);
  expect(disperser.addSubstrate).toHaveBeenCalledTimes(1);
  expect(disperser.pollinateSpread).not.toHaveBeenCalled();
});

// Integration over a REAL Flora: a stepped pollinator actually roots same-species
// children through pollinateSpread on a lush field. Deterministic per seed.
test("a stepped pollinator roots same-species children on a real flora (never a bite)", () => {
  const map = singleBiome(11, Tile.Grass, 48);
  const plants = generatePlantSpecies(11);
  const flora = new Flora(map, plants, 11, { chains: true });
  const sp = [{
    id: 0, role: "pollinator",
    palate: { form: PlantForm.Flower, hueCenter: 0.5, hueWidth: 0.2, glowTaste: 0 },
  }] as unknown as CritterSpecies[];
  const rng = makeRng(1);
  const before = flora.count;
  // pollinateSpread only ADDS (never removes), so each snapshot plant's idx stays
  // valid across the sweep; across a lush field at least one child takes root.
  for (const meal of [...flora.all]) {
    const c = {
      species: 0, x: meal.x, y: meal.y, state: "nibble", stateTime: 0,
      targetX: meal.x, targetY: meal.y, hopPhase: 0, facing: 1, energy: 0.6,
      curiosity: 0, mood: "content", meal,
    } as unknown as Critter;
    updateCritter(c, 0.5, map, flora, sp, null, rng, {});
  }
  expect(flora.count).toBeGreaterThan(before); // spread — never a bite (count only grows)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ambient-pollinator.test.ts`
Expected: FAIL — the first test's `expect(f.pollinateSpread).toHaveBeenCalledTimes(1)` fails with `expected "spy" to be called 1 times, but got 0 times` (the pollinator role currently falls into the `else`/disperser arm, calling `propagate`+`addSubstrate` instead).

- [ ] **Step 3: Add the constants**

In `src/life/fauna.ts`, immediately BEFORE `export function updateCritter(` (at line 777), insert:

```ts
// The pollinator active-cross's reach — WIDER than a disperser's reseed drift
// (FloraTuning.reseedRadius, default 3 tiles) and LOWER-density, so a pollination
// boom reads as airy spread, not a rigid carpet. Bench-local numbers (the
// Simulator's own), deliberately NOT swarms.ts's POLLINATE_* constants — that
// file drags the whole SwarmLayer in; these stand alone. pollinateSpread draws
// only from flora.rng, so this adds no new stream.
const POLLINATOR_RADIUS = 6; // tiles — > reseedRadius (3): the "wider" of wider/looser
const POLLINATOR_MAX_SAME = 2; // per-cloud density cap, below the per-tile cap: the "looser"

```

- [ ] **Step 4: Add the pollinator arm**

In `src/life/fauna.ts`, inside the nibble-resolution branch, replace the grazer/else block at lines 812-821:

```ts
        if (sp.role === "grazer") {
          flora.nibble(c.meal);
        } else {
          flora.propagate(c.meal);
          // a disperser leaves a byproduct where it fed, tagged with the eaten
          // plant's trait-signature — the substrate a matching feeder germinates
          // on. addSubstrate self-gates on the chains flag (no-op + no rng when
          // off), so this needs no branch and never perturbs the seeded stream.
          flora.addSubstrate(c.x, c.y, c.meal.genome);
        }
```

with:

```ts
        if (sp.role === "grazer") {
          flora.nibble(c.meal);
        } else if (sp.role === "pollinator") {
          // active cross (Simulator ambient bench): carry this bloom's genes
          // WIDER and LOOSER than a disperser's reseed drift, via the standalone
          // pollinateSpread — it draws only from flora.rng (no new stream) and
          // routes through addPlant, so every cap/habitat gate still holds.
          // Bench-only; real play never assigns "pollinator".
          flora.pollinateSpread(c.meal, POLLINATOR_RADIUS, POLLINATOR_MAX_SAME);
        } else {
          flora.propagate(c.meal);
          // a disperser leaves a byproduct where it fed, tagged with the eaten
          // plant's trait-signature — the substrate a matching feeder germinates
          // on. addSubstrate self-gates on the chains flag (no-op + no rng when
          // off), so this needs no branch and never perturbs the seeded stream.
          flora.addSubstrate(c.x, c.y, c.meal.genome);
        }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/ambient-pollinator.test.ts`
Expected: PASS — `Tests 3 passed`.

- [ ] **Step 6: Typecheck**

Run: `npm run check`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/life/fauna.ts tests/ambient-pollinator.test.ts
git commit -m "feat(sim): pollinator active-cross role arm (flora.pollinateSpread, bench-only)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Nutrient-shuttle role — `carriedSubstrate` + `takeSubstrateNear` + the arm

**Files:**
- Modify: `src/life/flora.ts` — add `takeSubstrateNear(x,y,radius)` after `addSubstrate` (`flora.ts:358`)
- Modify: `src/life/fauna.ts` — add `carriedSubstrate?` field to `Critter` (`fauna.ts:326`); add `SHUTTLE_PICKUP_RADIUS` constant (beside the pollinator constants, above `updateCritter`); add the shuttle arm inside the nibble-resolution branch
- Create test: `tests/ambient-shuttle.test.ts`

**Interfaces:**
- Consumes: `flora.substrates: Substrate[]` (public, `flora.ts:156`); `flora.addSubstrate(x,y,{hue,glow,form})` (`flora.ts:355`); `Substrate` = `{ x, y, hue, glow, form, born }` (`flora.ts:31`); `PlantForm` (`genome.ts:3`).
- Produces: `Flora.takeSubstrateNear(x, y, radius): Substrate | null` (find nearest live substrate within `radius` px, REMOVE it from the pool, return it — or null; deterministic, no rng). `Critter.carriedSubstrate?: { hue: number; glow: number; form: PlantForm }`. The shuttle arm: empty-handed → lift the nearest substrate; carrying → drop it here. Count conserved across lift+drop (peaceful).

**Design note (resolving the facts' either/or):** the facts said the shuttle may filter `flora.substrates` inline OR add a small `substratesNear` helper mirroring `plantsNear`. We add a dedicated **`takeSubstrateNear` (find-and-remove)** on `Flora` rather than a pure query, because the shuttle needs REMOVAL (the pickup), and encapsulating the array mutation in `Flora` mirrors how `removePlant` keeps its own bookkeeping — cleaner than splicing `flora.substrates` from `fauna.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/ambient-shuttle.test.ts`:

```ts
import { expect, test } from "vitest";
import { updateCritter } from "../src/life/fauna";
import type { Critter, CritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { singleBiome } from "../src/world/construct";
import { Tile } from "../src/world/types";
import { makeRng } from "../src/core/rng";

// A nutrient shuttle ferries a loose substrate from where it fed (A) to where it
// lands next (B): empty-handed it lifts the nearest one; carrying, it sets it
// down. Peaceful: the count is CONSERVED across lift+drop (relocated, never
// created or destroyed). Deterministic: no rng in either half.
test("a nutrient shuttle relocates a substrate from A to B, count conserved", () => {
  const map = singleBiome(7, Tile.Grass, 48);
  const plants = generatePlantSpecies(7);
  const flora = new Flora(map, plants, 7, { chains: true }); // chains on: substrates live
  const meal = flora.all[0]; // any real plant satisfies the meal-still-there gate

  const A = { x: 100, y: 100 };
  const B = { x: 500, y: 400 };
  flora.addSubstrate(A.x, A.y, { hue: 0.42, glow: 0.3, form: PlantForm.Flower });
  expect(flora.substrates.length).toBe(1);

  const sp = [{
    id: 0, role: "nutrient-shuttle",
    palate: { form: PlantForm.Flower, hueCenter: 0.5, hueWidth: 0.2, glowTaste: 0 },
  }] as unknown as CritterSpecies[];
  const rng = makeRng(1);
  const at = (x: number, y: number): Critter => ({
    species: 0, x, y, state: "nibble", stateTime: 0, targetX: x, targetY: y,
    hopPhase: 0, facing: 1, energy: 0.6, curiosity: 0, mood: "content", meal,
  } as unknown as Critter);

  // arrival #1 at A, empty-handed → lifts the substrate off the ground
  const c = at(A.x, A.y);
  updateCritter(c, 0.5, map, flora, sp, null, rng, {});
  expect(flora.substrates.length).toBe(0);
  expect(c.carriedSubstrate).toEqual({ hue: 0.42, glow: 0.3, form: PlantForm.Flower });

  // arrival #2 at B, carrying → sets it down at the NEW place
  c.x = B.x; c.y = B.y; c.state = "nibble"; c.stateTime = 0; c.meal = meal;
  updateCritter(c, 0.5, map, flora, sp, null, rng, {});
  expect(c.carriedSubstrate).toBeUndefined();
  expect(flora.substrates.length).toBe(1); // count conserved — peaceful
  const moved = flora.substrates[0];
  expect(moved.x).toBe(B.x);
  expect(moved.y).toBe(B.y);
  expect(moved.hue).toBe(0.42); // the same load, relocated
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ambient-shuttle.test.ts`
Expected: FAIL — `flora.takeSubstrateNear` does not exist and the shuttle arm isn't wired, so the `"nutrient-shuttle"` role falls into the disperser `else` arm; `expect(flora.substrates.length).toBe(0)` fails (it stays 1, and a byproduct may be added), and `c.carriedSubstrate` is `undefined`. (May also fail to compile: `carriedSubstrate` not yet on `Critter`.)

- [ ] **Step 3: Add `takeSubstrateNear` to Flora**

In `src/life/flora.ts`, immediately AFTER the `addSubstrate` method (which ends at line 358 with its closing `}`), insert:

```ts

  // The nutrient shuttle's pickup (Simulator ambient bench): find the nearest
  // live substrate within `radius` px of (x, y), REMOVE it from the pool, and
  // hand it back — or null if none is in reach. Deterministic (nearest by
  // squared distance; the first in the array wins a tie — no rng). Removing here
  // and re-adding through addSubstrate at the drop keeps the substrate COUNT
  // conserved: a shuttle relocates, it never creates or destroys (the peaceful
  // pillar). substrates is empty unless chains are on (only SimKernel forces
  // it), so this is inert off the bench.
  takeSubstrateNear(x: number, y: number, radius: number): Substrate | null {
    const r2 = radius * radius;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.substrates.length; i++) {
      const s = this.substrates[i];
      const d = (s.x - x) ** 2 + (s.y - y) ** 2;
      if (d <= r2 && d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) return null;
    const [taken] = this.substrates.splice(best, 1);
    return taken;
  }
```

- [ ] **Step 4: Add the `carriedSubstrate` field**

In `src/life/fauna.ts`, in the `Critter` interface, replace the closing of the interface at lines 326-327:

```ts
  pathGoal?: number; // the goal tile that detour was routed to; dropped if the goal moves
}
```

with:

```ts
  pathGoal?: number; // the goal tile that detour was routed to; dropped if the goal moves
  carriedSubstrate?: { hue: number; glow: number; form: PlantForm }; // Simulator "nutrient-shuttle" role ONLY: a lifted substrate in transit. Absent in real play (that role is bench-only), so ordinary critters are byte-identical.
}
```

(`PlantForm` is already imported at `fauna.ts:5`.)

- [ ] **Step 5: Add the `SHUTTLE_PICKUP_RADIUS` constant**

In `src/life/fauna.ts`, immediately after the two `POLLINATOR_*` constants added in Task 2 (above `updateCritter`), insert:

```ts
// The nutrient shuttle's pickup reach — how near a loose substrate must be for a
// ferrying critter to lift it on a feeding visit. A tile or two, in world px
// (substrates carry world-px coords, matching plantsNear's px radii). No rng.
const SHUTTLE_PICKUP_RADIUS = 2 * TILE_SIZE;

```

(`TILE_SIZE` is already imported and used throughout `fauna.ts`.)

- [ ] **Step 6: Add the shuttle arm**

In `src/life/fauna.ts`, inside the nibble-resolution branch, replace the pollinator arm added in Task 2:

```ts
        } else if (sp.role === "pollinator") {
          // active cross (Simulator ambient bench): carry this bloom's genes
          // WIDER and LOOSER than a disperser's reseed drift, via the standalone
          // pollinateSpread — it draws only from flora.rng (no new stream) and
          // routes through addPlant, so every cap/habitat gate still holds.
          // Bench-only; real play never assigns "pollinator".
          flora.pollinateSpread(c.meal, POLLINATOR_RADIUS, POLLINATOR_MAX_SAME);
        } else {
```

with:

```ts
        } else if (sp.role === "pollinator") {
          // active cross (Simulator ambient bench): carry this bloom's genes
          // WIDER and LOOSER than a disperser's reseed drift, via the standalone
          // pollinateSpread — it draws only from flora.rng (no new stream) and
          // routes through addPlant, so every cap/habitat gate still holds.
          // Bench-only; real play never assigns "pollinator".
          flora.pollinateSpread(c.meal, POLLINATOR_RADIUS, POLLINATOR_MAX_SAME);
        } else if (sp.role === "nutrient-shuttle") {
          // ferry a loose substrate from where it fed to where it lands next:
          // carrying → set it down here; empty-handed → lift the nearest one.
          // No rng (nearest-by-distance), and the count is conserved across
          // lift+drop — the peaceful pillar. Bench-only; real play never assigns
          // this role, so the carriedSubstrate field stays absent in ordinary play.
          if (c.carriedSubstrate) {
            flora.addSubstrate(c.x, c.y, c.carriedSubstrate);
            c.carriedSubstrate = undefined;
          } else {
            const lifted = flora.takeSubstrateNear(c.x, c.y, SHUTTLE_PICKUP_RADIUS);
            if (lifted) c.carriedSubstrate = { hue: lifted.hue, glow: lifted.glow, form: lifted.form };
          }
        } else {
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/ambient-shuttle.test.ts`
Expected: PASS — `Tests 1 passed`.

- [ ] **Step 8: Typecheck**

Run: `npm run check`
Expected: no output, exit 0.

- [ ] **Step 9: Commit**

```bash
git add src/life/flora.ts src/life/fauna.ts tests/ambient-shuttle.test.ts
git commit -m "feat(sim): nutrient-shuttle role — relocate substrate A->B, count conserved (bench-only)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The ambient-role model (`simAmbient.ts`)

**Files:**
- Create: `src/game/simAmbient.ts`
- Create test: `tests/sim-ambient.test.ts`

**Interfaces:**
- Consumes: `CritterRole` (`fauna.ts:24`).
- Produces: `AMBIENT_ROLES: AmbientRole[]` (the opt-in role menu, with `"disperser"` first as the reset) and `roleBadge(role: CritterRole): string`. Task 5's DOM wiring consumes both; Stage 2 (Task 7) appends the fish entry.

This mirrors `src/game/simPressures.ts` (a pure, DOM-free, rng-free model the panel writes onto the kernel) so the ambient tray has a unit-testable core.

- [ ] **Step 1: Write the failing test**

Create `tests/sim-ambient.test.ts`:

```ts
import { expect, test } from "vitest";
import { AMBIENT_ROLES, roleBadge } from "../src/game/simAmbient";

test("the ambient menu offers the clean opt-in roles with disperser as the reset", () => {
  const ids = AMBIENT_ROLES.map((r) => r.id);
  expect(ids[0]).toBe("disperser"); // the reset — a toggled kind can always be handed back
  expect(ids).toContain("pollinator");
  expect(ids).toContain("nutrient-shuttle");
});

test("every ambient role carries a lowercase label and an evocative help line", () => {
  for (const r of AMBIENT_ROLES) {
    expect(r.label).toBe(r.label.toLowerCase());
    expect(r.help.length).toBeGreaterThan(0);
  }
});

test("roleBadge marks the opt-in roles and leaves the default plain", () => {
  expect(roleBadge("disperser")).toBe("");
  expect(roleBadge("pollinator")).toBe("✿");
  expect(roleBadge("nutrient-shuttle")).toBe("❖");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sim-ambient.test.ts`
Expected: FAIL — `Failed to resolve import "../src/game/simAmbient"` (module does not exist yet).

- [ ] **Step 3: Create the module**

Create `src/game/simAmbient.ts`:

```ts
// The ambient bench's opt-in role menu — the Simulator-only surface (slice 5b)
// for flipping a placed critter KIND into an experimental role, OFF by default.
// PURE: no DOM, no rng, no wall clock — mirrors simPressures.ts. The tray writes
// these onto the EXISTING kernel through kernel.setCritterRole (the same path
// grazerShare uses). NOTHING here graduates to real worlds in v1: these roles are
// producible ONLY through this bench, never by generateCritterSpecies, so an
// ordinary island never sees them.
import { CritterRole } from "../life/fauna";

export interface AmbientRole {
  id: CritterRole;
  label: string; // the tray button's lowercase caption
  glyph: string; // a one-char badge shown beside a kind wearing this role ("" for the plain default)
  help: string; // one evocative line — the button's title tooltip
}

// "disperser" leads as the reset (the ordinary role every kind starts in), so a
// toggled kind can always be handed back. Stage 2 appends the fish role.
export const AMBIENT_ROLES: AmbientRole[] = [
  { id: "disperser", label: "disperser", glyph: "", help: "the ordinary role — scatters a drifted seed where it feeds" },
  { id: "pollinator", label: "pollinator", glyph: "✿", help: "active cross — carries a bloom's genes wider and looser than drift" },
  { id: "nutrient-shuttle", label: "shuttle", glyph: "❖", help: "ferries a loose substrate from where it fed to where it lands next" },
];

// The badge glyph for a role — "" for the plain default — so a flipped kind reads
// at a glance on its palette chip. An unknown/real-play role (e.g. "grazer") has
// no ambient badge.
export function roleBadge(role: CritterRole): string {
  return AMBIENT_ROLES.find((r) => r.id === role)?.glyph ?? "";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sim-ambient.test.ts`
Expected: PASS — `Tests 3 passed`.

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/game/simAmbient.ts tests/sim-ambient.test.ts
git commit -m "feat(sim): AMBIENT_ROLES opt-in menu + roleBadge (pure model for the ambient tray)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wire the ambient tray + role toggles + chip badge into the World-Lab

**Files:**
- Modify: `src/game/worldlab.ts` — imports; `Chrome` interface; `setPalette` chip badge; `critterInspectView` (role-correct copy on the inspect card); `refreshPalette` (feed the tray) + its boot-time catch-up call; `buildChrome` (bar button + ambient tray build); the body wiring (`ui.onAmbientRole`) + `?ambient` dev-aid
- Verify: `scripts/shot.mjs` screenshot

**Interfaces:**
- Consumes: `AMBIENT_ROLES`, `roleBadge` (`simAmbient.ts`); `CritterRole` (`fauna.ts`); `kernel.setCritterRole(id, role)` (`kernel.ts:181`); the existing `btn()`/`group()`/`label()`/`sep()` chrome (`worldlab.ts:1794-1883`); the `stack` container; `critterKinds` (the live roster closure `let`, `worldlab.ts:628`); `refreshPalette`/`refreshDrawer` (`worldlab.ts:624`, `:916`).
- Produces: three new `Chrome` methods — `onAmbientRole(id, role)`, `setAmbient(kinds)`, `openAmbient(open?)`. A bench tray that flips a placed kind live. No unit test (the `worldlab.ts` DOM is verified by tsc + screenshot; its logic core is `simAmbient.ts`, already tested in Task 4).

This is a DOM-wiring task: its gate is `npm run check` clean + `npx vitest run` green + a screenshot showing the tray. There is no failing-unit-test cycle because `worldlab.ts` builds real DOM (the pressures tray was shipped the same way — its logic lives in the tested `simPressures.ts`, its DOM verified by screenshot).

- [ ] **Step 1: Add imports**

In `src/game/worldlab.ts`, add `CritterRole` to the existing `../life/fauna` import (it already imports `CritterSpecies`), and add a new import for the ambient model. Find the fauna import line (it contains `CritterSpecies`) and ensure it reads, e.g.:

```ts
import { Critter, CritterRole, CritterSpecies /* …existing… */ } from "../life/fauna";
```

Then add near the other `../game`/local imports:

```ts
import { AMBIENT_ROLES, roleBadge } from "./simAmbient";
```

- [ ] **Step 2: Extend the `Chrome` interface**

In `src/game/worldlab.ts`, inside `interface Chrome` (ends at line 1790 with `openPressures`), add after the `openPressures` line:

```ts
  // the ambient bench (Simulator slice 5b): opt-in experimental roles for placed
  // critter KINDS, toggled live through kernel.setCritterRole. Same in-flow
  // child-of-`stack` tray shape as the pressures tray above — NOT a
  // position:fixed overlay. Bench-only; nothing graduates to real worlds.
  onAmbientRole: (id: number, role: CritterRole) => void;
  setAmbient: (kinds: { id: number; name: string; role: CritterRole }[]) => void;
  openAmbient: (open?: boolean) => void;
```

- [ ] **Step 3: Add the role badge to critter chips**

In `src/game/worldlab.ts`, in `chrome.setPalette` (line 2081), replace the `critterBtns` mapping:

```ts
    critterBtns = critters.map((c) => {
      const b = document.createElement("button");
      b.textContent = c.name.toLowerCase();
      b.style.cssText = btn(false);
      b.onclick = () => chrome.onSelect({ kind: "critter", id: c.id });
      critterRow.appendChild(b);
      return { id: c.id, b };
    });
```

with:

```ts
    critterBtns = critters.map((c) => {
      const b = document.createElement("button");
      const badge = roleBadge(c.role); // "" for a plain disperser; a glyph for a bench role
      b.textContent = badge ? `${c.name.toLowerCase()} ${badge}` : c.name.toLowerCase();
      b.style.cssText = btn(false);
      b.onclick = () => chrome.onSelect({ kind: "critter", id: c.id });
      critterRow.appendChild(b);
      return { id: c.id, b };
    });
```

- [ ] **Step 4: Prefer the ambient role's own copy in the inspect card**

The shared `roleLine()` (`src/render/inspect.ts:309-313`) only ever distinguishes `"grazer"` from everything else:

```ts
export function roleLine(role: CritterRole): string {
  return role === "grazer"
    ? "a grazer — it crops what it favors as it feeds"
    : "a spreader — its visits carry a favorite's seed to new ground";
}
```

All three bench roles (`"pollinator"`, `"nutrient-shuttle"`, and Stage 2's `"aquatic-grazer"`) fall into that `else` and get mislabeled — a fish, which feeds via the plain `flora.nibble` exactly like a grazer, would read "a spreader — its visits carry a favorite's seed to new ground," which is backwards (it never spreads a seed). `roleLine()` itself must NOT change: real play calls it directly (`inspect.ts:645`) and it is pinned by `tests/inspect-role.test.ts`. The fix belongs only in the Simulator's own `critterInspectView` (`src/game/worldlab.ts:219-239`), which already composes a `CritterInspectView` from `sp` and can prefer `AMBIENT_ROLES`'s per-role `help` copy (imported in Step 1; every entry — `"disperser"`, `"pollinator"`, `"nutrient-shuttle"`, and Stage 2's `"aquatic-grazer"` — carries a `help: string`, `simAmbient.ts`) before falling back to `roleLine` for `"grazer"`, the one real-play role `AMBIENT_ROLES` doesn't list.

In `src/game/worldlab.ts`, in `critterInspectView`, replace:

```ts
  return {
    name: sp.name,
    role: sp.role,
    roleLine: roleLine(sp.role),
```

with:

```ts
  return {
    name: sp.name,
    role: sp.role,
    // the ambient bench's own copy wins over the shared roleLine: real play's
    // roleLine only tells "grazer" from everything else and reads any bench
    // role as a generic "spreader" (render/inspect.ts:309-313) — wrong for a
    // fish, which never spreads a seed. AMBIENT_ROLES (Task 4) carries
    // evocative, role-correct help text for every bench role; fall back to
    // roleLine only for "grazer", the one real-play role it doesn't list.
    // Simulator-only: the shared roleLine() real play calls stays untouched.
    roleLine: AMBIENT_ROLES.find((r) => r.id === sp.role)?.help ?? roleLine(sp.role),
```

No new unit test: `critterInspectView` has no existing unit harness — its `roleLine` field was already display-only, gated the same way the rest of this DOM-wiring task is (tsc + full suite + screenshot), and `roleLine()` itself keeps its own pinned test untouched. Confirm by hand alongside the manual check in Step 12: once a kind is flipped to `pollinator`/`shuttle` (or, in Stage 2, `fish`), inspect it and read its card — it should show that role's own `help` line, never "a spreader…".

- [ ] **Step 5: Feed the ambient tray from `refreshPalette`**

In `src/game/worldlab.ts`, in `refreshPalette` (line 624), replace the `if (ui) { … }` block at lines 636-639:

```ts
    if (ui) {
      ui.setPalette(plantKinds, critterKinds);
      ui.setSelected(selected);
    }
```

with:

```ts
    if (ui) {
      ui.setPalette(plantKinds, critterKinds);
      ui.setSelected(selected);
      // keep the ambient tray in lockstep with the roster + each kind's live role
      ui.setAmbient(critterKinds.map((c) => ({ id: c.id, name: c.name, role: c.role })));
    }
```

- [ ] **Step 6: Add the bar button (in `buildChrome`)**

In `src/game/worldlab.ts`, immediately after the `pressuresBtn` is appended (line 1986, `bar.appendChild(pressuresBtn);`), insert:

```ts

  // ── the ambient bench toggle: an "ambient ✿" button beside pressures, same
  // btn() chrome as every other bar control. Flips the ambient tray (built near
  // the end of this function) open/closed — the Simulator's opt-in ambient roles,
  // one click away (slice 5b). ─────────────────────────────────────────────────
  const ambientBtn = document.createElement("button");
  ambientBtn.id = "ambient-btn";
  ambientBtn.textContent = "ambient ✿";
  ambientBtn.style.cssText = btn(false);
  ambientBtn.onclick = () => chrome.openAmbient();
  bar.appendChild(ambientBtn);
```

- [ ] **Step 7: Build the ambient tray (in `buildChrome`)**

In `src/game/worldlab.ts`, immediately BEFORE the final `return chrome;` of `buildChrome` (line 2768), insert:

```ts

  // ── the ambient bench: opt-in experimental roles for placed critter KINDS
  // (pollinator / shuttle / … ), OFF by default. Same in-flow-child-of-`stack`
  // pattern as the pressures tray above (NOT a position:fixed overlay — see that
  // tray's own hard-won comment trail), same btn()/group()/label() chrome. Each
  // row is one critter kind + a button per role; clicking flips that kind live
  // through kernel.setCritterRole (the exact path grazerShare already uses).
  // Bench-only: nothing graduates to real worlds in v1. ────────────────────────
  const ambientTray = document.createElement("div");
  ambientTray.id = "lab-ambient-tray";
  ambientTray.style.cssText =
    "display: none; max-width: 340px; max-height: 46vh; overflow-y: auto; padding: 12px 16px;" +
    " background: var(--panel); border-radius: var(--radius); box-shadow: var(--frame); color: var(--ink);" +
    " font-family: var(--serif); user-select: none;";
  stack.appendChild(ambientTray); // appended after evoTray — column-reverse stacks it above the bar

  const ambientHead = document.createElement("div");
  ambientHead.style.cssText = "text-align: center;";
  ambientHead.innerHTML =
    `<div style="font-variant: small-caps; letter-spacing: 0.03em; font-size: 17px; color: var(--ink-bright);">the ambient bench</div>` +
    `<div style="font: 11px var(--mono); color: rgba(228,236,242,0.5); margin-top: -2px;">give a placed kind an experimental role — bench only, nothing graduates</div>`;
  ambientTray.appendChild(ambientHead);

  const ambientRows = document.createElement("div");
  ambientRows.style.cssText = "display: flex; flex-direction: column; gap: 8px; margin-top: 10px;";
  ambientTray.appendChild(ambientRows);

  chrome.setAmbient = (kinds) => {
    ambientRows.replaceChildren();
    if (kinds.length === 0) {
      ambientRows.appendChild(label("place a critter first"));
      return;
    }
    for (const k of kinds) {
      const rowEl = document.createElement("div");
      rowEl.style.cssText = "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;";
      const nameEl = document.createElement("span");
      nameEl.textContent = k.name.toLowerCase();
      nameEl.style.cssText = "font-variant: small-caps; color: var(--ink-bright); min-width: 96px;";
      rowEl.appendChild(nameEl);
      for (const role of AMBIENT_ROLES) {
        const b = document.createElement("button");
        b.textContent = role.label;
        b.title = role.help;
        b.style.cssText = btn(k.role === role.id); // the active role reads lit
        b.onclick = () => chrome.onAmbientRole(k.id, role.id);
        rowEl.appendChild(b);
      }
      ambientRows.appendChild(rowEl);
    }
  };

  let ambientOpen = false;
  chrome.openAmbient = (open) => {
    ambientOpen = open ?? !ambientOpen;
    ambientTray.style.display = ambientOpen ? "block" : "none";
    ambientBtn.style.cssText = btn(ambientOpen);
  };
  chrome.onAmbientRole = () => {}; // real handler wired by startWorldLab's body
```

- [ ] **Step 8: Wire the body handler + dev-aid**

In `src/game/worldlab.ts`, immediately after the `ui.onPressure` wiring (line 1496, `ui.onPressure = (id, value) => setPressure(id, value);`), insert:

```ts
  ui.onAmbientRole = (id, role) => {
    const was = kernel.critterSpecies[id].role;
    kernel.setCritterRole(id, role); // the same live role-flip grazerShare uses
    refreshPalette(); // repaints the chip badge AND the tray (refreshPalette feeds setAmbient)
    refreshDrawer();
    ui?.flashNote(was === role ? `${role} — unchanged` : `role → ${role}`);
  };
  // a dev-aid so the tray can be screenshot open without a mouse click
  if (new URLSearchParams(location.search).has("ambient")) {
    refreshPalette(); // ensure setAmbient has the current roster
    ui.openAmbient(true);
  }
```

(Note: the file's existing dev-aid flags are hoisted once near the top of the function as their own `const`s — `evoAid`/`pressuresAid` at `worldlab.ts:524-525`, both read via `new URL(location.href).searchParams...`. The snippet above instead reads `?ambient` inline with a one-off `new URLSearchParams(location.search)` at the point of use. Not worth blocking this slice on — but if tidying, hoist `const ambientAid = new URL(location.href).searchParams.has("ambient");` beside `evoAid` and use `ambientAid` here, for consistency with the rest of the file.)

**Also close the boot-time gap this dev-aid doesn't cover.** `build()` (`worldlab.ts:~1453`) calls `refreshPalette()` *before* `ui` exists (`ui = buildChrome(...)` comes right after, at `worldlab.ts:~1456`), so that very first `refreshPalette()` call's `if (ui) {...}` guard — including the `ui.setAmbient(...)` line added in Step 5 — never fires. Right after `buildChrome`, the boot sequence already patches exactly this class of gap with a short catch-up block that hand-calls `ui.setPalette`/`ui.setSelected`/`ui.setBrushSize`/`ui.setRollKind` (grep for that cluster if the line number has drifted; currently the four lines immediately after the `ui.onPressure` wiring this step inserts after, around `worldlab.ts:1497-1500`). Without a matching `ui.setAmbient(...)` there, the ambient tray opens **blank** on an ordinary first use — until the `?ambient` dev-aid's own `refreshPalette()` call happens to run (only when that flag is set) or some unrelated action re-runs `refreshPalette()`. Extend that catch-up block:

In `src/game/worldlab.ts`, replace:

```ts
  ui.setPalette(plantKinds, critterKinds);
  ui.setSelected(selected);
  ui.setBrushSize(brushSize);
  ui.setRollKind(rollKind);
```

with:

```ts
  ui.setPalette(plantKinds, critterKinds);
  ui.setSelected(selected);
  ui.setBrushSize(brushSize);
  ui.setRollKind(rollKind);
  // the boot-time twin of refreshPalette's own ui.setAmbient call (Step 5):
  // build() (just above) ran refreshPalette() before `ui` existed, so that
  // first call's if (ui) {...} guard never fired for setAmbient either.
  // Without this, the ambient tray opens BLANK on an ordinary first use.
  ui.setAmbient(critterKinds.map((c) => ({ id: c.id, name: c.name, role: c.role })));
```

(`critterKinds` is the same live-roster closure `let` `refreshPalette` itself reads — already in scope here, per the other hand-calls right above it.)

- [ ] **Step 9: Typecheck**

Run: `npm run check`
Expected: no output, exit 0.

- [ ] **Step 10: Run the full suite (nothing regressed)**

Run: `npx vitest run`
Expected: all test files pass (`Test Files … passed`, `Tests … passed`), including the Task 1–4 files.

- [ ] **Step 11: Build**

Run: `npm run build`
Expected: Vite build completes with no errors (`✓ built in …`).

- [ ] **Step 12: Screenshot-verify the tray**

Run:

```bash
npm run shot -- "sim=1&ambient=1" shots/ambient-tray.png 4000 1400 900
```

Expected: `shots/ambient-tray.png` is written. Open it and confirm: (a) the bottom bar shows an `ambient ✿` button beside `pressures ⚘`; (b) the ambient tray is OPEN above the bar with the header "the ambient bench" and (since no critter is placed yet) the "place a critter first" line. Consuming only `:root` tokens, it matches the pressures tray's look and does not overlap the side panels.

Then, for the toggled-role case, run the dev server and drive it by hand:

```bash
npm run dev
```

Open `http://localhost:5173/?sim=1`, place a critter (select a critter chip, click the construct), open the ambient tray via `ambient ✿`, and click `pollinator` on that kind's row. Confirm the `pollinator` button lights, the palette chip gains the `✿` badge, and a `role → pollinator` note flashes. (This manual check verifies the live `kernel.setCritterRole` path; the flip's mechanical effect is already unit-tested in Task 2.)

- [ ] **Step 13: Commit**

```bash
git add src/game/worldlab.ts shots/ambient-tray.png
git commit -m "feat(sim): the ambient bench tray — per-kind opt-in role toggles + chip badges

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Stage 1 ships here** — the ambient bench + the two clean roles are complete and independently usable.

---

# STAGE 2 — fish aquatic-grazer

Fish only meaningfully exercise on the `playable-island` / `biome-sampler` starters (they carry water tiles); `single-biome` defaults to `Tile.Grass` (`construct.ts:35`), so it has no shallows for a fish to swim unless painted.

---

### Task 6: Fish aquatic-grazer — water walkability + movement threading + feeding

**Files:**
- Modify: `src/life/fauna.ts` — add `"aquatic-grazer"` to `CritterRole`; add `WalkPredicate` type; export `critterWalkable`; add `fishWalkable`; thread a `walkable` predicate (default `critterWalkable`) through `stepToward`/`moveToward`/`routeToward`/`stepOffWall`; inject it in `updateCritter`; add `"aquatic-grazer"` to the grazer feeding arm
- Create test: `tests/ambient-fish.test.ts`

**Interfaces:**
- Consumes: `critterWalkable(map, x, y): boolean` (`fauna.ts:650`, shore-only land rule); `tileAt(map, x, y): Tile`, `isWalkable`, `Tile`, `WALKABLE` (`world/types.ts`); `updateCritter` movement call sites (`fauna.ts:850`, `:860`); `flora.nibble(c.meal)`.
- Produces: `type WalkPredicate = (map, x, y) => boolean`; `fishWalkable` (free through `ShallowWater`, refuses everything else); exported `critterWalkable`; the four movement functions gain a trailing `walkable: WalkPredicate = critterWalkable` param; `updateCritter` picks `fishWalkable` iff `sp.role === "aquatic-grazer"`. Real play never sets that role, so the default (`critterWalkable`) path is byte-identical.

**Why a predicate parameter and not a duplicate:** the movement stack (`stepToward`'s nudge, `moveToward`'s arrival check, `routeToward`'s bounded BFS, `stepOffWall`'s side-step) is generic tile-boolean-gated code; `critterWalkable` is its ONLY gate. Injecting the predicate (defaulting to `critterWalkable`) reuses all of it and leaves every existing caller byte-identical.

- [ ] **Step 1: Write the failing test**

Create `tests/ambient-fish.test.ts`:

```ts
import { expect, test } from "vitest";
import { critterWalkable, fishWalkable, updateCritter } from "../src/life/fauna";
import type { Critter, CritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { biomeSampler } from "../src/world/construct";
import { Tile, WorldMap, tileAt } from "../src/world/types";
import { TILE_SIZE } from "../src/world/config";
import { makeRng } from "../src/core/rng";

// A 8×3 strip: an all-DeepWater sea with one row of [Grass, 4×ShallowWater,
// 3×DeepWater]. Tile (1,1) shallow fronts the grass → SHORE; (2,1)..(4,1) shallow
// have no dry neighbour → OPEN-SEA; (0,1) is dry Grass; (5,1) is DeepWater.
function stripMap(): WorldMap {
  const w = 8;
  const h = 3;
  const tiles = new Uint8Array(w * h);
  tiles.fill(Tile.DeepWater);
  const row = 1;
  tiles[row * w + 0] = Tile.Grass;
  tiles[row * w + 1] = Tile.ShallowWater;
  tiles[row * w + 2] = Tile.ShallowWater;
  tiles[row * w + 3] = Tile.ShallowWater;
  tiles[row * w + 4] = Tile.ShallowWater;
  const elevation = new Float32Array(w * h);
  elevation.fill(0.5);
  return { width: w, height: h, seed: 1, tiles, elevation, rivers: [], spawn: { x: 0, y: 1 } };
}

test("fishWalkable frees open-sea shallows a land critter refuses; the land rule is unchanged", () => {
  const m = stripMap();
  // dry grass (0,1): land yes, fish no
  expect(critterWalkable(m, 0, 1)).toBe(true);
  expect(fishWalkable(m, 0, 1)).toBe(false);
  // shore shallow (1,1): fronts grass — both yes
  expect(critterWalkable(m, 1, 1)).toBe(true);
  expect(fishWalkable(m, 1, 1)).toBe(true);
  // open-sea shallow (3,1): no dry neighbour — land NO (unchanged rule), fish YES
  expect(critterWalkable(m, 3, 1)).toBe(false);
  expect(fishWalkable(m, 3, 1)).toBe(true);
  // deep water (5,1): neither
  expect(critterWalkable(m, 5, 1)).toBe(false);
  expect(fishWalkable(m, 5, 1)).toBe(false);
});

test("a fish crosses open-sea shallows toward a target; a land critter cannot (default path inert)", () => {
  const m = stripMap();
  const plants = generatePlantSpecies(1);
  const flora = new Flora(m, plants, 1, { chains: true });
  const center = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE });
  const target = center(4, 1); // far open-sea shallow
  const start = center(1, 1); // shore shallow — both can stand here

  const mkSp = (role: CritterSpecies["role"]): CritterSpecies[] =>
    [{
      id: 0, role, den: { x: 1, y: 1 },
      palate: { form: 0, hueCenter: 0.5, hueWidth: 0.2, glowTaste: 0 },
    }] as unknown as CritterSpecies[];
  const mkC = (): Critter => ({
    species: 0, x: start.x, y: start.y, state: "seek", targetX: target.x, targetY: target.y,
    stateTime: 1000, hopPhase: 0, facing: 1, energy: 0.9, curiosity: 0, mood: "hungry",
  } as unknown as Critter);

  const fish = mkC();
  const land = mkC();
  const fishSp = mkSp("aquatic-grazer");
  const landSp = mkSp("disperser");
  const rng = makeRng(1);
  let fishMaxX = 1;
  let landMaxX = 1;
  for (let i = 0; i < 120; i++) {
    updateCritter(fish, 0.5, m, flora, fishSp, null, rng, {});
    updateCritter(land, 0.5, m, flora, landSp, null, rng, {});
    fishMaxX = Math.max(fishMaxX, Math.floor(fish.x / TILE_SIZE));
    landMaxX = Math.max(landMaxX, Math.floor(land.x / TILE_SIZE));
  }
  expect(fishMaxX).toBe(4); // swam the shallows to the far tile, stopped at the deep edge
  expect(landMaxX).toBeLessThan(2); // never left the shore tile into open water — land movement unchanged
});

test("a fish grazes a water-habitat plant it swims to", () => {
  const m = biomeSampler(3);
  const plants = generatePlantSpecies(3);
  const flora = new Flora(m, plants, 3, { chains: true });
  // a plant standing on a ShallowWater tile, a few tiles in from the left edge
  const water = flora.all.find(
    (p) =>
      tileAt(m, Math.floor(p.x / TILE_SIZE), Math.floor(p.y / TILE_SIZE)) === Tile.ShallowWater &&
      p.x > 6 * TILE_SIZE,
  );
  expect(water).toBeTruthy();
  const wp = water!;
  const sp = [{
    id: 0, role: "aquatic-grazer", den: { x: Math.floor(wp.x / TILE_SIZE), y: Math.floor(wp.y / TILE_SIZE) },
    palate: { form: wp.genome.form, hueCenter: wp.genome.hue, hueWidth: 0.4, glowTaste: wp.genome.glow * 2 - 1 },
  }] as unknown as CritterSpecies[];
  const c = {
    species: 0, x: wp.x - 3 * TILE_SIZE, y: wp.y, state: "idle", targetX: wp.x, targetY: wp.y,
    stateTime: 0, hopPhase: 0, facing: 1, energy: 0.2, curiosity: 0, mood: "hungry",
  } as unknown as Critter;
  const rng = makeRng(1);
  let ate = false;
  for (let i = 0; i < 200 && !ate; i++) {
    const before = c.energy;
    updateCritter(c, 0.5, m, flora, sp, null, rng, {});
    if (c.energy > before + 0.2) ate = true; // a whole MEAL_ENERGY landed
  }
  expect(ate).toBe(true); // reached a water plant across the shallows and grazed it
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ambient-fish.test.ts`
Expected: FAIL — `critterWalkable` / `fishWalkable` are not exported (`does not provide an export named 'fishWalkable'`), and `role: "aquatic-grazer"` is not yet a `CritterRole`. The file fails to compile.

- [ ] **Step 3: Add the `"aquatic-grazer"` literal**

In `src/life/fauna.ts`, extend the `CritterRole` union (edited in Task 1) to add the fish role:

```ts
export type CritterRole = "disperser" | "grazer" | "pollinator" | "nutrient-shuttle";
```

becomes:

```ts
export type CritterRole = "disperser" | "grazer" | "pollinator" | "nutrient-shuttle" | "aquatic-grazer";
```

- [ ] **Step 4: Add `WalkPredicate`, export `critterWalkable`, add `fishWalkable`**

In `src/life/fauna.ts`, replace the `critterWalkable` definition header at lines 645-658. The current text is:

```ts
// Where a critter will set foot: dry ground always, and a shallow tile only at
// the SHORE — one that fronts dry, walkable land. So it wades in to reach food
// growing at the water's edge, but never strikes out into open-sea shallows
// where a land animal would only end up stranded. (The wanderer wades freely;
// this is a critter-only rule.)
function critterWalkable(map: WorldMap, x: number, y: number): boolean {
  if (!isWalkable(map, x, y)) return false;
  if (tileAt(map, x, y) !== Tile.ShallowWater) return true; // dry, walkable ground
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
    const t = tileAt(map, x + dx, y + dy);
    if (t !== Tile.ShallowWater && t !== Tile.DeepWater && WALKABLE.has(t)) return true; // a shore edge
  }
  return false; // open-sea shallow: no dry neighbour — off-limits
}
```

Replace it with (adds the `WalkPredicate` type, exports `critterWalkable` unchanged in behaviour, and adds `fishWalkable`):

```ts
// The movement stack's one gate, hoisted to a type so a fish can swap in its own
// water rule (fishWalkable) while every ordinary caller keeps the land rule. All
// four movement functions below take this as an injected parameter defaulting to
// critterWalkable — so real play, which never passes anything else, is byte-
// identical.
export type WalkPredicate = (map: WorldMap, x: number, y: number) => boolean;

// Where a critter will set foot: dry ground always, and a shallow tile only at
// the SHORE — one that fronts dry, walkable land. So it wades in to reach food
// growing at the water's edge, but never strikes out into open-sea shallows
// where a land animal would only end up stranded. (The wanderer wades freely;
// this is a critter-only rule.) Exported so the Simulator's fish tests can
// contrast it with fishWalkable; behaviour unchanged.
export function critterWalkable(map: WorldMap, x: number, y: number): boolean {
  if (!isWalkable(map, x, y)) return false;
  if (tileAt(map, x, y) !== Tile.ShallowWater) return true; // dry, walkable ground
  for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
    const t = tileAt(map, x + dx, y + dy);
    if (t !== Tile.ShallowWater && t !== Tile.DeepWater && WALKABLE.has(t)) return true; // a shore edge
  }
  return false; // open-sea shallow: no dry neighbour — off-limits
}

// A fish's walkability — the mirror of the land rule (Simulator "aquatic-grazer"
// role, slice 5b). It swims freely through ANY ShallowWater tile (open-sea
// shallows included: no shore-adjacency test) and refuses everything else — dry
// land and deep water alike — so it stays in the shallows where the water plants
// grow. DeepWater carries no plant species anywhere (HABITAT_FORMS lists only
// ShallowWater among water tiles), so the shallows are the whole aquatic range a
// grazer needs. Bench-only: reached solely when sp.role === "aquatic-grazer", a
// role real play never assigns.
export function fishWalkable(map: WorldMap, x: number, y: number): boolean {
  return tileAt(map, x, y) === Tile.ShallowWater;
}
```

- [ ] **Step 5: Thread the predicate through `stepToward`**

In `src/life/fauna.ts`, replace `stepToward` (lines 664-683):

```ts
function stepToward(c: Critter, px: number, py: number, dt: number, map: WorldMap, speed: number): boolean {
  const dx = px - c.x;
  const dy = py - c.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return true;
  const step = Math.min(dist, speed * dt);
  const nx = c.x + (dx / dist) * step;
  const ny = c.y + (dy / dist) * step;
  if (Math.abs(dx) > 0.5) c.facing = dx > 0 ? 1 : -1;
  // step onto land or a shore-shallow (critterWalkable); only when already stuck
  // on a bad tile — an open-sea shallow it somehow reached — may it step onto any
  // walkable tile to escape back toward shore.
  const onBad = !critterWalkable(map, Math.floor(c.x / TILE_SIZE), Math.floor(c.y / TILE_SIZE));
  const canStep = (tx: number, ty: number): boolean =>
    critterWalkable(map, tx, ty) || (onBad && isWalkable(map, tx, ty));
  if (canStep(Math.floor(nx / TILE_SIZE), Math.floor(c.y / TILE_SIZE))) c.x = nx;
  if (canStep(Math.floor(c.x / TILE_SIZE), Math.floor(ny / TILE_SIZE))) c.y = ny;
  c.hopPhase += dt * 9;
  return Math.hypot(px - c.x, py - c.y) < 2;
}
```

with:

```ts
function stepToward(
  c: Critter, px: number, py: number, dt: number, map: WorldMap, speed: number,
  walkable: WalkPredicate = critterWalkable,
): boolean {
  const dx = px - c.x;
  const dy = py - c.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return true;
  const step = Math.min(dist, speed * dt);
  const nx = c.x + (dx / dist) * step;
  const ny = c.y + (dy / dist) * step;
  if (Math.abs(dx) > 0.5) c.facing = dx > 0 ? 1 : -1;
  // step where this critter's own rule allows; only when already stuck on a bad
  // tile (an off-limits tile it somehow reached) may it step onto any walkable
  // tile to escape. The escape hatch stays isWalkable (byte-identical for land).
  const onBad = !walkable(map, Math.floor(c.x / TILE_SIZE), Math.floor(c.y / TILE_SIZE));
  const canStep = (tx: number, ty: number): boolean =>
    walkable(map, tx, ty) || (onBad && isWalkable(map, tx, ty));
  if (canStep(Math.floor(nx / TILE_SIZE), Math.floor(c.y / TILE_SIZE))) c.x = nx;
  if (canStep(Math.floor(c.x / TILE_SIZE), Math.floor(ny / TILE_SIZE))) c.y = ny;
  c.hopPhase += dt * 9;
  return Math.hypot(px - c.x, py - c.y) < 2;
}
```

**Known scope limit, accepted as-is:** the `onBad`/`canStep` escape hatch above intentionally falls back to the plain `isWalkable` (the raw land-or-not tile test), NOT the injected `walkable` predicate — so a *stuck* fish (one that somehow ends up on a tile `fishWalkable` refuses) could in theory step onto dry land to escape, same as a land critter escapes an open-sea shallow. This is not parameterized because fish placement (Task 7, gated to `ShallowWater`) and fish movement (this task, `fishWalkable`-gated) both keep a fish inside the shallows in the first place, so `onBad` should never actually fire for one — the hatch is dead code for the fish case in practice. Documented rather than fixed, to keep this predicate-injection minimal; a future tightening could parameterize the hatch too (e.g. `walkable === fishWalkable ? isWalkable-in-water : isWalkable`) if a fish is ever observed beaching itself.

- [ ] **Step 6: Thread the predicate through `moveToward`**

In `src/life/fauna.ts`, replace `moveToward` (lines 690-704):

```ts
function moveToward(c: Critter, dt: number, map: WorldMap, speed = CRITTER_SPEED): boolean {
  const goalTile = Math.floor(c.targetY / TILE_SIZE) * map.width + Math.floor(c.targetX / TILE_SIZE);
  if (c.pathGoal !== goalTile) {
    c.path = undefined;
    c.pathGoal = goalTile;
  }
  if (c.path && c.path.length > 0) {
    const wp = c.path[0];
    const wpX = ((wp % map.width) + 0.5) * TILE_SIZE;
    const wpY = (((wp / map.width) | 0) + 0.5) * TILE_SIZE;
    if (stepToward(c, wpX, wpY, dt, map, speed)) c.path.shift();
    if (c.path.length > 0) return false; // still detouring — not yet arrived
  }
  return stepToward(c, c.targetX, c.targetY, dt, map, speed);
}
```

with:

```ts
function moveToward(
  c: Critter, dt: number, map: WorldMap, speed = CRITTER_SPEED,
  walkable: WalkPredicate = critterWalkable,
): boolean {
  const goalTile = Math.floor(c.targetY / TILE_SIZE) * map.width + Math.floor(c.targetX / TILE_SIZE);
  if (c.pathGoal !== goalTile) {
    c.path = undefined;
    c.pathGoal = goalTile;
  }
  if (c.path && c.path.length > 0) {
    const wp = c.path[0];
    const wpX = ((wp % map.width) + 0.5) * TILE_SIZE;
    const wpY = (((wp / map.width) | 0) + 0.5) * TILE_SIZE;
    if (stepToward(c, wpX, wpY, dt, map, speed, walkable)) c.path.shift();
    if (c.path.length > 0) return false; // still detouring — not yet arrived
  }
  return stepToward(c, c.targetX, c.targetY, dt, map, speed, walkable);
}
```

- [ ] **Step 7: Thread the predicate through `stepOffWall`**

In `src/life/fauna.ts`, replace `stepOffWall` (lines 710-725):

```ts
function stepOffWall(c: Critter, map: WorldMap): void {
  const cx = Math.floor(c.x / TILE_SIZE);
  const cy = Math.floor(c.y / TILE_SIZE);
  const ring = [
    [0, -1], [-1, 0], [1, 0], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];
  for (const [dx, dy] of ring) {
    if (critterWalkable(map, cx + dx, cy + dy)) {
      c.targetX = (cx + dx + 0.5) * TILE_SIZE;
      c.targetY = (cy + dy + 0.5) * TILE_SIZE;
      c.state = "idle";
      return;
    }
  }
}
```

with:

```ts
function stepOffWall(c: Critter, map: WorldMap, walkable: WalkPredicate = critterWalkable): void {
  const cx = Math.floor(c.x / TILE_SIZE);
  const cy = Math.floor(c.y / TILE_SIZE);
  const ring = [
    [0, -1], [-1, 0], [1, 0], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];
  for (const [dx, dy] of ring) {
    if (walkable(map, cx + dx, cy + dy)) {
      c.targetX = (cx + dx + 0.5) * TILE_SIZE;
      c.targetY = (cy + dy + 0.5) * TILE_SIZE;
      c.state = "idle";
      return;
    }
  }
}
```

- [ ] **Step 8: Thread the predicate through `routeToward`**

In `src/life/fauna.ts`, change `routeToward`'s signature (line 734):

```ts
function routeToward(c: Critter, map: WorldMap): boolean {
```

to:

```ts
function routeToward(c: Critter, map: WorldMap, walkable: WalkPredicate = critterWalkable): boolean {
```

and inside its BFS loop change the neighbour gate (line 760):

```ts
      if (from.has(v) || !critterWalkable(map, nx, ny)) continue;
```

to:

```ts
      if (from.has(v) || !walkable(map, nx, ny)) continue;
```

- [ ] **Step 9: Inject the predicate + feeding in `updateCritter`**

In `src/life/fauna.ts`, at the top of `updateCritter`, replace line 787:

```ts
  const sp = speciesList[c.species];
```

with:

```ts
  const sp = speciesList[c.species];
  // a fish swims (fishWalkable); every other kind keeps the land rule. Real play
  // never assigns "aquatic-grazer", so `walk` is always critterWalkable there and
  // the movement calls below are byte-identical to before this parameter existed.
  const walk: WalkPredicate = sp.role === "aquatic-grazer" ? fishWalkable : critterWalkable;
```

Then change the `moveToward` call (line 850):

```ts
  const arrived = moveToward(c, dt, map, pace);
```

to:

```ts
  const arrived = moveToward(c, dt, map, pace, walk);
```

and the stuck-recovery call (line 860):

```ts
      if (!routeToward(c, map)) stepOffWall(c, map); // route around the obstacle, else side-step
```

to:

```ts
      if (!routeToward(c, map, walk)) stepOffWall(c, map, walk); // route around the obstacle, else side-step
```

Finally, add `"aquatic-grazer"` to the feeding arm — change the grazer test in the nibble-resolution branch (edited in Task 2/3):

```ts
        if (sp.role === "grazer") {
          flora.nibble(c.meal);
        } else if (sp.role === "pollinator") {
```

to:

```ts
        if (sp.role === "grazer" || sp.role === "aquatic-grazer") {
          // a fish crops a water plant exactly as a grazer bites a land one — the
          // feeding is identical; only REACHING the plant differs (see `walk`).
          flora.nibble(c.meal);
        } else if (sp.role === "pollinator") {
```

- [ ] **Step 10: Run the fish test to verify it passes**

Run: `npx vitest run tests/ambient-fish.test.ts`
Expected: PASS — `Tests 3 passed`.

- [ ] **Step 11: Run the full suite (movement threading is inert for every existing critter test)**

Run: `npx vitest run`
Expected: ALL test files pass — critically the existing fauna/movement/behaviour tests (`fauna.test.ts`, `graze.test.ts`, `unstick.test.ts`, `behavior.test.ts`, `kernel.test.ts`, …) are unchanged, proving the injected default (`critterWalkable`) left land movement byte-identical.

- [ ] **Step 12: Typecheck + build**

Run: `npm run check && npm run build`
Expected: `npm run check` no output; build completes with no errors.

- [ ] **Step 13: Commit**

```bash
git add src/life/fauna.ts tests/ambient-fish.test.ts
git commit -m "feat(sim): fish aquatic-grazer — inject a water-walkability predicate through the movement stack (default land rule = byte-identical)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Fish on the bench — menu entry + placement gated to shallow water

**Files:**
- Modify: `src/game/simAmbient.ts` — append the `"aquatic-grazer"` entry to `AMBIENT_ROLES`
- Modify: `tests/sim-ambient.test.ts` — assert the fish entry
- Modify: `src/game/worldlab.ts` — import `tileAt`; gate `"aquatic-grazer"` critter placement to `ShallowWater` in `stampKindAt`; fish-flavored refusal note
- Verify: screenshot

**Interfaces:**
- Consumes: `AMBIENT_ROLES` (`simAmbient.ts`); `kernel.critterSpecies[id].role`; `tileAt(map, x, y)`, `Tile.ShallowWater`; `stampKindAt`'s cell loop (`worldlab.ts:583-598`).
- Produces: the ambient tray gains a `fish` toggle; placing a fish kind roots only on `ShallowWater` cells (mirroring how `placePlant` habitat-gates plants), with a fish-specific refusal flash.

- [ ] **Step 1: Extend the model test (failing)**

In `tests/sim-ambient.test.ts`, add:

```ts
test("the ambient menu includes the fish aquatic-grazer role with a badge", () => {
  expect(AMBIENT_ROLES.map((r) => r.id)).toContain("aquatic-grazer");
  expect(roleBadge("aquatic-grazer")).toBe("≈");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/sim-ambient.test.ts`
Expected: FAIL — `expect(AMBIENT_ROLES.map(...)).toContain("aquatic-grazer")` fails (`expected [ 'disperser', 'pollinator', 'nutrient-shuttle' ] to contain 'aquatic-grazer'`).

- [ ] **Step 3: Append the fish entry to the menu**

In `src/game/simAmbient.ts`, replace the `AMBIENT_ROLES` array:

```ts
export const AMBIENT_ROLES: AmbientRole[] = [
  { id: "disperser", label: "disperser", glyph: "", help: "the ordinary role — scatters a drifted seed where it feeds" },
  { id: "pollinator", label: "pollinator", glyph: "✿", help: "active cross — carries a bloom's genes wider and looser than drift" },
  { id: "nutrient-shuttle", label: "shuttle", glyph: "❖", help: "ferries a loose substrate from where it fed to where it lands next" },
];
```

with:

```ts
export const AMBIENT_ROLES: AmbientRole[] = [
  { id: "disperser", label: "disperser", glyph: "", help: "the ordinary role — scatters a drifted seed where it feeds" },
  { id: "pollinator", label: "pollinator", glyph: "✿", help: "active cross — carries a bloom's genes wider and looser than drift" },
  { id: "nutrient-shuttle", label: "shuttle", glyph: "❖", help: "ferries a loose substrate from where it fed to where it lands next" },
  { id: "aquatic-grazer", label: "fish", glyph: "≈", help: "aquatic grazer — swims the shallows and crops water plants a land critter can't reach" },
];
```

- [ ] **Step 4: Run the model test to verify it passes**

Run: `npx vitest run tests/sim-ambient.test.ts`
Expected: PASS — `Tests 4 passed`.

- [ ] **Step 5: Import `tileAt` in worldlab**

In `src/game/worldlab.ts`, update the world/types import at line 54:

```ts
import { Tile, WorldMap } from "../world/types";
```

to:

```ts
import { Tile, WorldMap, tileAt } from "../world/types";
```

- [ ] **Step 6: Gate fish placement to shallow water**

In `src/game/worldlab.ts`, in `stampKindAt` (line 583), replace the cell loop + refusal flash (lines 587-596):

```ts
    for (const { x, y } of cells) {
      const { x: px, y: py } = worldPxCenter(x, y);
      if (selected.kind === "plant") {
        const p = kernel.placePlant(selected.id, px, py);
        if (p === null && x === tx && y === ty) centreRefused = true;
      } else {
        kernel.placeCritter(selected.id, px, py);
      }
    }
    if (centreRefused && ui) ui.flashNote("won't root here — wrong habitat");
```

with:

```ts
    for (const { x, y } of cells) {
      const { x: px, y: py } = worldPxCenter(x, y);
      if (selected.kind === "plant") {
        const p = kernel.placePlant(selected.id, px, py);
        if (p === null && x === tx && y === ty) centreRefused = true;
      } else {
        // a fish (aquatic-grazer) only takes to ShallowWater — the critter mirror
        // of placePlant's habitat gate (§4/§5). Every other critter places on any
        // cell, exactly as before.
        if (kernel.critterSpecies[selected.id].role === "aquatic-grazer" && tileAt(map, x, y) !== Tile.ShallowWater) {
          if (x === tx && y === ty) centreRefused = true;
          continue;
        }
        kernel.placeCritter(selected.id, px, py);
      }
    }
    if (centreRefused && ui) {
      ui.flashNote(selected.kind === "critter" ? "a fish needs shallow water" : "won't root here — wrong habitat");
    }
```

- [ ] **Step 7: Typecheck + full suite + build**

Run: `npm run check && npx vitest run && npm run build`
Expected: `npm run check` no output; all tests pass; build completes with no errors.

- [ ] **Step 8: Screenshot-verify the fish toggle**

Run:

```bash
npm run shot -- "sim=1&ambient=1" shots/ambient-fish.png 4000 1400 900
```

Expected: `shots/ambient-fish.png` written; the open ambient tray now shows a `fish` button in each kind's role row (four buttons: `disperser`, `pollinator`, `shuttle`, `fish`).

Then, to confirm the placement gate + swim behaviour end-to-end, drive the dev server by hand:

```bash
npm run dev
```

Open `http://localhost:5173/?sim=1&starter=biome-sampler` (the sampler carries a `ShallowWater` band). Place a critter, open the ambient tray, click `fish` on its row (chip badge → `≈`). Then select that kind and try to place on a Grass cell — confirm the `a fish needs shallow water` flash and no placement. Place it on the shallow band, press play, and watch it swim the shallows toward a water plant. (The swim/graze mechanics are unit-tested in Task 6; this is a visual confirmation.)

- [ ] **Step 9: Commit**

```bash
git add src/game/simAmbient.ts tests/sim-ambient.test.ts src/game/worldlab.ts shots/ambient-fish.png
git commit -m "feat(sim): fish on the ambient bench — menu toggle + placement gated to shallow water

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

**Stage 2 ships here** — the fish aquatic-grazer role is complete and bench-placeable.

---

## DEFERRED — bird disperser-on-the-wing (out of scope for slice 5b)

Documented per the spec's ambient menu ("Birds … dispersers on the wing — a settled flock drops a drifted seed of what it fed on"). It is **not** built in 5b, for concrete architectural reasons (facts §1/§6):

1. **Flocks don't exist in the kernel.** `Flock`/`updateFlock` (`src/life/birds.ts`) run only in `main.ts`'s ordinary-play loop. `SimKernel`/`worldlab.ts` import nothing from `birds.ts` — there is no flock in the World-Lab today. Bringing one in is a first-of-its-kind addition (a `kernel.placeFlock`, a `flocks: Flock[]` field, a step-loop `updateFlock` call), not a role-flip on an existing entity.
2. **`updateFlock` is a shared function real play calls directly** (`main.ts:2542`, 6 args, no `Flora` param). Unlike a `CritterRole` literal — which is safe by construction because the ONLY generator (`generateCritterSpecies`) can't produce it — a bird-disperse hook needs a **two-layer** isolation guard: an added optional `flora?: Flora` parameter that `main.ts` never supplies (stays `undefined`) AND a falsy opt-in flag on `BirdSpecies`/`Flock` that `generateFlocks` never sets. Both must hold together, because there's no "only the Simulator can construct this" invariant here otherwise.
3. **`propagate` drifts around the fed plant, not the flock.** `flora.propagate(p)` (`flora.ts:384`) drops within `reseedRadius` of the SOURCE plant, so "drop a seed where the flock settled" needs `pollinateSpread`-shaped drift keyed off the flock's own `(x, y)`, not a verbatim `propagate` call — new drop logic, not a reuse.

This is a genuinely separate build (new kernel entity + two-layer guard + new placement path + new drop math) and stays a documented follow-up.

---

## Self-Review

**1. Spec coverage** (against the master spec's "Ambient & fauna roles" tier menu + the task brief):

| Requirement | Task |
|---|---|
| Add `"pollinator"` + `"nutrient-shuttle"` `CritterRole` literals | Task 1 |
| Test: real-play generation never yields the new roles | Task 1 |
| Confirm `foodweb.ts` disperser filter needs no change | Task 1 (guard test) |
| Pollinator active-cross arm calling `flora.pollinateSpread(c.meal, R, maxSame)` | Task 2 |
| Bench-local `POLLINATOR_RADIUS`/`POLLINATOR_MAX_SAME` (not swarms.ts's) | Task 2 |
| Test: pollinator spreads wider/looser via `pollinateSpread`; grazer/disperser unaffected | Task 2 |
| Nutrient shuttle: `carriedSubstrate?` field, pickup from `flora.substrates`, drop via `addSubstrate` | Task 3 |
| Decision stated: dedicated `takeSubstrateNear` (find-and-remove) vs inline filter | Task 3 (design note) |
| Test: shuttle relocates A→B, count conserved | Task 3 |
| Ambient bench tray modeled on the pressures tray (in-flow child of `stack`, `btn()`/`group()`/`label()`, no `position:fixed`) | Task 5 |
| Per-role opt-in toggles (OFF by default) flipping role via `kernel.setCritterRole` | Task 5 |
| Role badge on critter kinds | Task 5 (chip badge) + Task 4 (`roleBadge`) |
| Screenshot-verify tray + a role toggled | Task 5 |
| Ambient tray populated on an ordinary FIRST open, not just after some later `refreshPalette()` call | Task 5 (Step 8's boot-time `ui.setAmbient` catch-up) |
| Inspect card shows role-correct copy for a bench role, not the shared `roleLine`'s generic "spreader" | Task 5 (Step 4) |
| Fish: `fishWalkable` free through `ShallowWater`, indifferent to dry shore | Task 6 |
| Predicate injected through `moveToward`/`stepToward`/`routeToward`/`stepOffWall`, default `critterWalkable` | Task 6 |
| Keyed off `"aquatic-grazer"` `CritterRole` | Task 6 |
| Feeding reuses `flora.nibble(c.meal)` | Task 6 |
| Test: fish moves onto `ShallowWater` where land can't + grazes a water plant | Task 6 |
| Test: real-play default-predicate path unchanged | Task 6 (land-critter half + full suite in Step 11) |
| Placement gated to `ShallowWater` (mirror `habitatsOf`/`placeablePlants`) | Task 7 |
| Note fish only exercise on `playable-island`/`biome-sampler` | Stage 2 intro + Task 7 Step 8 |
| Bird role deferred with reason | Deferred section |

No gaps.

**2. Placeholder scan:** every code step contains complete code (full function bodies for all four movement functions, the full `takeSubstrateNear`, the full tray build, the full test files). No "TODO", "similar to", or "add error handling". The only step without a failing-unit-test cycle is Task 5 (DOM wiring), which is justified inline (the `worldlab.ts` DOM has no unit harness; its logic core `simAmbient.ts` is unit-tested in Task 4, and the deliverable is gated by tsc + full suite + screenshot).

**3. Type consistency:**
- `CritterRole` literals `"pollinator"` / `"nutrient-shuttle"` (Task 1) / `"aquatic-grazer"` (Task 6) are spelled identically in the `updateCritter` arms (Tasks 2/3/6), `simAmbient.ts` (Tasks 4/7), the worldlab placement gate (Task 7), and every test.
- `Critter.carriedSubstrate?: { hue: number; glow: number; form: PlantForm }` (Task 3) is read/written with exactly those keys in the shuttle arm (`c.carriedSubstrate.{hue,glow,form}`) and asserted with the same keys in `tests/ambient-shuttle.test.ts`.
- `Flora.takeSubstrateNear(x, y, radius): Substrate | null` (Task 3) is called with `(c.x, c.y, SHUTTLE_PICKUP_RADIUS)` in the arm; `Substrate` fields `{x,y,hue,glow,form,born}` match `flora.ts:31`.
- `WalkPredicate = (map: WorldMap, x: number, y: number) => boolean` (Task 6) is the exact trailing-parameter type on all four movement functions and the type of `walk` in `updateCritter`; `fishWalkable`/`critterWalkable` both match it.
- `Chrome` methods `onAmbientRole(id: number, role: CritterRole)`, `setAmbient(kinds: { id; name; role }[])`, `openAmbient(open?)` (Task 5 interface) are defined in `buildChrome` and consumed by `refreshPalette`/`ui.onAmbientRole`/the `?ambient` dev-aid with matching signatures.
- `AMBIENT_ROLES` entry shape `{ id, label, glyph, help }` (Task 4) matches `roleBadge`'s `.glyph` lookup and the tray's `role.label`/`role.help`/`role.id` reads (Task 5).
- Kernel/Flora/construct call shapes used in tests match source: `new Flora(map, plants, seed, tuning?)` (`flora.ts:166`), `generateCritterSpecies(seed, map, flora, plants)` (`fauna.ts:433`), `updateCritter(c, dt, map, flora, speciesList, player, rng, ctx)` (`fauna.ts:777`), `singleBiome(seed, tile?, size?)` / `biomeSampler(seed)` (`construct.ts:35,42`), `chainStats(plants, critters)` (`foodweb.ts:38`).

All consistent.
