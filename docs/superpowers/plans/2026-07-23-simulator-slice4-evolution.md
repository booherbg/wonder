# The Simulator — Slice 4: the evolutionary layer (roll-a-web · pressures · richness meter · pin-to-reseed) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the World-Lab from "place & watch" into "author & evolve" — the Simulator's **evolutionary layer** (per `docs/superpowers/specs/2026-07-21-simulator-design.md` §"The evolutionary layer — designing something wild (intent 2)" and §"Build order within v1" item 4), extending the slice-1/2/3 bench (`src/game/worldlab.ts`, already shipped). Four joined surfaces:

1. **Roll a foodchain / a web** — beyond rolling *one* kind (slice 3), generate a **matched set built to interlock**: a source plant of hue H + a disperser whose palate favours it + a substrate-feeder tuned to H → a **closable chain**. Roll several → a starter web. Introduce the whole set onto the palette/drawer and auto-place a seed of it so the chain can close as you step.
2. **The pressures panel (v1 basic)** — expose knobs today buried in `FloraTuning`/constants: **drift/mutation rate**, **speciation threshold**, **grazer-share** (selection strength), **reseed rate**, **per-tile cap** (richness ceiling). Cranking them changes how fast/wild phenotypes + chains evolve. Adjusted **live, mid-sim** (see the finding below).
3. **Richness/wildness meter** — a live score for the whole construct reusing `diversityScore`'s formula + chain count (+ `richnessWord`), shown prominently and updating as you step, plus a **"seed it richer"** action (drop a diverse matched web).
4. **Curate — pin-to-reseed (v1 basic)** — **pin** a phenotype (a drawer entry / a live kind) to **re-seed** from it: the wild output becomes new input (re-introduce/re-place from the pinned def). Reuses the drawer's stored definitions.

**THE load-bearing finding (answers the slice's central design question — INVESTIGATED in `src/life/flora.ts`): `FloraTuning` is LIVE-adjustable mid-sim; the pressures panel needs NO Flora rebuild.** `Flora.tuning` is a Flora-owned object (the constructor spreads `{ ...DEFAULT_TUNING, ...tuning }`), and **every** consumer reads `this.tuning.<field>` *fresh each tick/call* — `simTick` (`const t = this.tuning;` per tick → `simBudget`/`maxPlants`/`comfortFraction`/`lifespan`/`reproChance`/`reseedRadius`/`matureAge`/`pollinationRadius`/`mutationAmount`), `maybeSpeciate` (`splitCooldownTicks`/`splitDistance`/`maxDaughterSpecies`/`splitKinRadius`/`splitKinDistance`/`splitClusterMin`), `hasRoom` (`maxPlants`/`maxPerTile`), `propagate`/`pollinateSpread`/`stepSubstrates` (`reseedRadius`/`mutationAmount`). **Nothing is captured at construction** (`scatter()` reads tuning too but only runs at build, and the kernel builds Flora empty). The `readonly tuning` class field blocks *reassignment* (`this.tuning = …`) but the interface's fields are plain mutable `number`s — so `Object.assign(kernel.flora.tuning, patch)` compiles and takes effect on the very **next** `step()`, with the current plant/critter/tick state fully preserved. A slider therefore writes tuning **in place**; the run stays deterministic because it's a pure parameter change on the same seeded streams (no new rng draws). This makes the slice **low-difficulty on its hardest question**. The one pressure that is *not* a `FloraTuning` field — **grazer-share** — maps to `CritterSpecies.role`, which `updateCritter` also reads live (`const sp = speciesList[c.species]; if (sp.role === "grazer") …`), so flipping a kind's role lands on the next step too.

**Architecture:** The pure, testable core is two new modules (mirroring how slices 1–3 split `simRoster.ts` / `simBrush.ts` / `roll.ts` / `simDrawer.ts` out of the DOM-heavy bench), plus small **additive, Simulator-only** kernel + drawer additions:

- **`src/life/rollweb.ts`** — roll a matched, closable web. **`foodweb.ts` only SCORES a set** (`chainStats`/`chainLinks`/`diversityScore` read what links *already* exist — there is **no "build a matched chain" constructor**), so roll-a-web **synthesises** the set and **verifies closure with the sim's own matching rules**: `appetite`/`APPETITE_MIN` (a disperser eats a plant) and `hueGap`/`SUBSTRATE_HUE_MATCH` (a feeder germinates on a byproduct). It **reuses `roll.ts`** for real, named candidate kinds and **`setCritterTraits`** to aim a disperser's palate — no genome/species/matching logic is re-implemented. Each chain closes with a **single disperser**: `appetite` gates *hard* on form equality (`if (g.form !== palate.form) return 0`), so one palate eats one plant *form* — therefore the source and feeder share the chain's `(form, hue)` family (the feeder merely *flagged* `substrateFeeder`), and the disperser eats the source (→ byproduct at hue H) **and** the feeder that wakes on it (→ the loop continues). Distinct real names/genomes keep the two plants legible even though they interlock by hue.
- **`src/game/simPressures.ts`** — the pressures model + the richness meter, both pure. `tuningPatchFor(id, value): Partial<FloraTuning>` maps the four tuning-backed pressures to their fields (speciation additionally opens the companion split gates so a lower threshold actually fires); `grazerAssignment(ids, share): Map<id, CritterRole>` is the deterministic (no-rng) role paint for selection strength. `richnessMeter(plants, critters): Richness` reuses `chainStats` + `richnessWord` and the **exact `diversityScore` arithmetic** (`chains + 2*(redundancy-1)`) — computed over the **construct's own species** (NOT `diversityScore(seed)`, which rebuilds a *fresh* world from a seed and is the wrong target).

The kernel gains `setTuning(patch)` (`Object.assign(this.flora.tuning, patch)`) and `setCritterRole(id, role)` — additive, and `kernel.ts` is imported only by `worldlab.ts` + tests, so no real-world path changes. `simDrawer.ts` gains a `pinned` flag + `pinEntry`/`unpinEntry`/`pinnedEntries` (the pin model, mirroring the existing `deleteEntry`/`reviveEntry` tombstone shape). Everything else is UI wiring inside `worldlab.ts`: the always-visible **richness meter** (hoisted into the existing census panel's header — no new column, no overlap), a **roll-a-web / seed-richer** control row in the roll pane, and a **toggled "evolution tray"** (a `position: fixed`, bounded, self-scrolling overlay opened from the bottom bar) holding the five pressures sliders — an *overlay*, not a column child, so the left/right **bounded/scrolling stacks stay exactly intact** (no reprise of the slice-slice overlap those stacks were built to fix).

**Tech Stack:** TypeScript, Vite, Vitest (node env — `rollweb.ts`, `simPressures.ts`, the kernel additions, and the drawer pin additions are pure, no DOM). Pure logic is TDD'd (roll-a-web produces a matched/closable set deterministically; the richness score matches `diversityScore`'s formula; the tuning→behaviour effect is proven via the kernel); the pressures/meter/pin/web UI is screenshot-verified via `node scripts/shot.mjs "sim=1…"` with deterministic display-only dev-aids (`?web=`, `?rich=`, `?evo=`, `?pressures=`, `?pin=`/`?reseed=`), the same "logic tested, pixels shot" practice slices 1–3 established (the harness presses keys, not canvas coordinates, so an on-load aid seeds the result).

## Global Constraints

- **Determinism:** evolution runs on the kernel's **seeded** streams. No `Math.random`/`Date.now`/`new Date()` in `rollweb.ts`, `simPressures.ts`, the kernel additions, the drawer pin additions, or any bench evolution logic. Roll-a-web draws from `roll.ts`'s `rollSeedFor`+`makeRng` (per-web cursor); `grazerAssignment` is a pure no-rng sort. **A pressures change is a deterministic parameter change** — `setTuning`/`setCritterRole` add *no* rng draws, so *same seed + same placements + same tuning/role schedule + same step count ⇒ identical run* (guarded by a schedule-replay test in Task 3). Pin-reseed placement flows through the seeded kernel `placePlant`/`placeCritter` (slice-1 `placeRng`, off the step stream). The **richness meter is display-only** — it only READS `chainStats`, never mutates the sim. The bench render/pointer loop MAY read the rAF `timeMs` for animation — view-only, never sim input.
- **Peaceful pillar holds:** cranking predation/grazer-share **thins populations, never kills an animal violently** — a grazer *nibbles* (a young plant is eaten, a mature one is set back to sprout; `flora.nibble`), and `setCritterRole` is a roster op. The slice-1 invariant that **`step()` never births or removes a critter** still holds (pressures/role changes are user actions outside the step loop). "populations rise and fall." Guarded: the slice-1 `critterCount()`-across-`step()` test stays green even with cranked pressures.
- **Reuse, don't fork:** the pressures panel adjusts the **existing** `FloraTuning`/kernel (via `setTuning`) and existing `CritterSpecies.role` (via `setCritterRole`); roll-a-web reuses `foodweb.ts` matching (`appetite`/`APPETITE_MIN`/`hueGap`/`SUBSTRATE_HUE_MATCH`/`chainLinks`/`chainStats`) + `roll.ts` (`rollPlantBatch`/`rollCritterBatch`/`setCritterTraits`); the meter reuses `chainStats`/`richnessWord` and the `diversityScore` score formula. **Do NOT re-implement** matching, scoring, genome math, or species generation. The `idmap.ts`/`swarm.ts` identity-map matcher is the **separate `?sim=swarm` ecology** and is *not* used here — the `?sim=1` bench's chains run on `foodweb.ts`. Reuse `worldlab.ts`'s `buildChrome` helpers (`btn()`/`MONO`/`group()`/`label()`/`sep()`/`title()`/`stat()`), and its placement helpers (`nearestTileOf`/`worldPxCenter`/`stampKindAt`) for auto-placement/reseed.
- **Real worlds untouched:** Simulator-only. New files: `src/life/rollweb.ts`, `src/game/simPressures.ts`, their tests, and UI in `src/game/worldlab.ts`. Additive edits only to `src/life/kernel.ts` (`setTuning`/`setCritterRole` — Simulator-only file) and `src/game/simDrawer.ts` (the `pinned` field + pin toggles — Simulator-only file). **No change** to `species.ts`/`fauna.ts`/`flora.ts`/`main.ts`/`renderer.ts` — all consumed read-only through existing exports. Ordinary play and `?sim=swarm` stay byte-identical (guarded by the still-green slice-1 `parseSimMode` test + a guard shot).
- **Art:** every new surface consumes the naturalist's-codex `:root` tokens already in `worldlab.ts` (no hardcoded chrome hexes); copy is lowercase and evocative; the richness word wears the firefly gold it already uses in the census strip. Fit into the bench layout **without re-introducing the left-column overlap** — the meter rides *inside* the existing census panel and the pressures live in a `position: fixed` overlay tray, so the left/right **bounded/scrolling stacks are left structurally intact**.
- **Incremental:** (a) roll-a-web + the richness meter, (b) the pressures panel (live tuning), (c) pin-to-reseed. Each task ends in a green test or a read screenshot.
- **Commits:** frequent; end every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Verify before "done":** `npm run check` (tsc) clean · `npx vitest run` green · `npm run build` clean.

**Out of scope for slice 4 (later slices — noted as deferred):** named lineages / branch-a-phenotype / export a curated kind toward a real world (v2 curate); a scrubbable timeline; deep-time fork/adopt (Door A); the ambient bench; the title-screen live backdrop; save/resume to a slot + full-critter-state/RNG persistence (slice 5). Pinning a *specific live individual's exact drifted genome* (as opposed to its species-level def) is v2 — slice-4 pin operates on the drawer's stored **species** definition, which is what "reuse the drawer's stored definitions" endorses.

---

### Task 1: Roll a matched, closable web (TDD, pure)

The heart of "roll a foodchain": a deterministic set of interlocking chains, each a `source`/`feeder`/`disperser` triple **guaranteed closable** under the sim's own matching rules. Synthesises the set (foodweb has no builder) and the tests **verify closure with `foodweb.ts` itself**. Pure (node env, no DOM, no `Math.random`), reusing `roll.ts` + `setCritterTraits`.

**Files:**
- Create: `src/life/rollweb.ts`
- Test: `tests/rollweb.test.ts`

**Interfaces:**
- Consumes: `CritterSpecies`, `Palate` (`./fauna`); `PlantForm` (`./genome`); `PlantSpecies`, `generatePlantSpecies` (`./species`); `Tile`, `WorldMap` (`../world/types`); `rollCritterBatch`, `rollPlantBatch`, `setCritterTraits` (`./roll`).
- Produces:
  - `interface WebChain { source: PlantSpecies; feeder: PlantSpecies; disperser: CritterSpecies; }`
  - `interface RolledWeb { chains: WebChain[]; }`
  - `rollWeb(base: number, cursor: number, size: number, habitats: ReadonlySet<Tile>, map: WorldMap): RolledWeb`.

- [ ] **Step 1: Write the failing tests** — `tests/rollweb.test.ts`:

```ts
import { expect, test } from "vitest";
import { rollWeb } from "../src/life/rollweb";
import { appetite, APPETITE_MIN } from "../src/life/fauna";
import { hueGap, SUBSTRATE_HUE_MATCH } from "../src/life/flora";
import { chainLinks, chainStats } from "../src/life/foodweb";
import { singleBiome, biomeSampler } from "../src/world/construct";
import { Tile } from "../src/world/types";

const SEED = 4242;

test("rollWeb yields the requested number of chains on a well-populated construct", () => {
  const map = biomeSampler(SEED);
  const web = rollWeb(SEED, 0, 3, new Set([Tile.Grass, Tile.Marsh, Tile.Forest]), map);
  expect(web.chains.length).toBe(3);
});

test("every rolled chain is CLOSABLE under the sim's own matching rules", () => {
  const map = singleBiome(SEED, Tile.Grass, 40);
  const web = rollWeb(SEED, 0, 3, new Set([Tile.Grass]), map);
  expect(web.chains.length).toBeGreaterThan(0);
  for (const ch of web.chains) {
    // the disperser eats the source (appetite over the scenery line)
    expect(appetite(ch.disperser.palate, ch.source.archetype)).toBeGreaterThan(APPETITE_MIN);
    // the feeder is a substrate-feeder in the source's hue window
    expect(ch.feeder.substrateFeeder).toBe(true);
    expect(hueGap(ch.feeder.archetype.hue, ch.source.archetype.hue)).toBeLessThanOrEqual(SUBSTRATE_HUE_MATCH);
    // and the disperser eats the feeder too → the loop closes
    expect(appetite(ch.disperser.palate, ch.feeder.archetype)).toBeGreaterThan(APPETITE_MIN);
    expect(ch.disperser.role).toBe("disperser"); // a grazer would bite, not scatter — no byproduct
    // the feeder shares the source's habitat, so the in-sim germinate rule (same tile) can fire
    expect(ch.feeder.habitat).toBe(ch.source.habitat);
    // foodweb.ts AGREES: a closable link + closable chain stats exist
    const links = chainLinks([ch.source, ch.feeder], [ch.disperser]);
    expect(links.some((l) => l.closes)).toBe(true);
    const stats = chainStats([ch.source, ch.feeder], [ch.disperser]);
    expect(stats.chains).toBeGreaterThanOrEqual(1);
    expect(stats.closable).toBeGreaterThanOrEqual(1);
  }
});

test("rollWeb is deterministic; a different cursor gives a different web", () => {
  const map = singleBiome(SEED, Tile.Grass, 40);
  const sig = (w: ReturnType<typeof rollWeb>) =>
    w.chains.map((c) => [c.source.name, Math.round(c.source.archetype.hue * 1e4), c.disperser.name]);
  expect(sig(rollWeb(SEED, 0, 3, new Set([Tile.Grass]), map))).toEqual(
    sig(rollWeb(SEED, 0, 3, new Set([Tile.Grass]), map)),
  );
  expect(sig(rollWeb(SEED, 0, 3, new Set([Tile.Grass]), map))).not.toEqual(
    sig(rollWeb(SEED, 1, 3, new Set([Tile.Grass]), map)),
  );
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/rollweb.test.ts` → FAIL (`src/life/rollweb.ts` missing).

- [ ] **Step 3: Implement `src/life/rollweb.ts`:**

```ts
// Roll a foodchain / a web — a MATCHED SET of kinds built to interlock into a
// CLOSABLE byproduct chain (spec §"The evolutionary layer"). foodweb.ts only
// SCORES a species set (chainStats/chainLinks read what links already exist —
// there is no "build a matched chain" path), so this SYNTHESISES the set and the
// tests VERIFY closure with the sim's own rules: appetite/APPETITE_MIN (a
// disperser eats a plant) + hueGap/SUBSTRATE_HUE_MATCH (a feeder germinates on a
// byproduct). Reuses roll.ts for real, named candidate kinds + setCritterTraits
// to aim a disperser's palate; no genome/species/matching logic is re-implemented.
//
// Each chain closes with ONE disperser: fauna.appetite gates HARD on form
// equality (`if (g.form !== palate.form) return 0`), so a single palate eats one
// plant FORM. Therefore the source AND the feeder share the chain's (form, hue)
// family — the feeder is merely FLAGGED substrateFeeder — and the disperser eats
// the source (→ byproduct at hue H) AND the feeder that wakes on it (→ the loop
// continues). Distinct real names/genomes keep the two plants legible.

import { CritterSpecies, Palate } from "./fauna";
import { PlantForm } from "./genome";
import { PlantSpecies, generatePlantSpecies } from "./species";
import { Tile, WorldMap } from "../world/types";
import { rollCritterBatch, rollPlantBatch, setCritterTraits } from "./roll";

// forms a disperser can actually eat — fauna excludes Tree/Coral from a
// critter's nibblable pool, so a chain is built around one of the rest.
const nibblable = (f: PlantForm): boolean => f !== PlantForm.Tree && f !== PlantForm.Coral;

export interface WebChain {
  source: PlantSpecies; // the plant the disperser eats + scatters (form F, hue H)
  feeder: PlantSpecies; // a substrateFeeder in the source's hue-window (form F, hue H)
  disperser: CritterSpecies; // palate aimed at (F, H); eats BOTH → the loop closes
}

export interface RolledWeb {
  chains: WebChain[];
}

// A palate GUARANTEED to eat an archetype of (form, hue, glow): centred on the
// hue (hueScore → 1), wide enough to tolerate drift, glow taste matched — so
// appetite = hueScore*(0.6 + 0.4*glowScore) sits near 1, well over APPETITE_MIN
// (0.3). Built by construction, not by search, so the disperser link is closable.
function palateFor(arch: { form: PlantForm; hue: number; glow: number }): Palate {
  return {
    form: arch.form,
    hueCenter: arch.hue,
    hueWidth: 0.2, // generous, so both source and feeder sit inside the window
    glowTaste: Math.max(-1, Math.min(1, arch.glow * 2 - 1)),
  };
}

// One matched, closable chain around a nibblable-form source on a hosted
// habitat. Deterministic off (base, cursor, i). Returns null only if the given
// habitats host no nibblable plant form at all (caller skips it).
function rollChain(
  base: number,
  cursor: number,
  i: number,
  habitats: ReadonlySet<Tile>,
  map: WorldMap,
): WebChain | null {
  // a per-chain slice of the roll cursor, so chains in one web don't collide
  const c = cursor * 16 + i;
  // real, named plant candidates limited to the construct's habitats
  const plants = rollPlantBatch(base, c, 12, { habitats });
  const source = plants.find((p) => nibblable(p.archetype.form));
  if (!source) return null;
  const F = source.archetype.form;
  const H = source.archetype.hue;

  // the feeder: a DIFFERENT same-form candidate if the batch holds one (a real
  // distinct name/genome), else a clone of the source — either way retuned to
  // hue H and flagged substrateFeeder, on the source's habitat so it can both
  // germinate there (the in-sim rule needs a shared tile) and be reached by the
  // disperser.
  const other = plants.find((p) => p !== source && p.archetype.form === F);
  const feederBase = other ?? source;
  const feeder: PlantSpecies = {
    ...feederBase,
    habitat: source.habitat,
    substrateFeeder: true,
    archetype: { ...feederBase.archetype, form: F, hue: H }, // hue gap 0 ≤ SUBSTRATE_HUE_MATCH
  };

  // the disperser: a real rolled critter (real name/morph), palate re-aimed at
  // (F, H) and forced to disperse. rollCritterBatch needs a REAL-id plant list
  // to cut favourites from (its favoriteSpecies indexes plants by `.id`), so
  // pass the base roster — the palate is overridden anyway.
  const realRoster = generatePlantSpecies(base);
  const [critter] = rollCritterBatch(base, c, 1, realRoster, map);
  const disperser = setCritterTraits(critter, { role: "disperser", palate: palateFor(source.archetype) });

  return { source, feeder, disperser };
}

// Roll a starter web: up to `size` interlocking chains, each a
// source/feeder/disperser triple guaranteed to close. Deterministic off (base,
// cursor). Chains that can't be built on the given habitats are skipped, so a
// single-biome construct simply yields fewer (never a throw).
export function rollWeb(
  base: number,
  cursor: number,
  size: number,
  habitats: ReadonlySet<Tile>,
  map: WorldMap,
): RolledWeb {
  const chains: WebChain[] = [];
  for (let i = 0; i < size * 3 && chains.length < size; i++) {
    const chain = rollChain(base, cursor, i, habitats, map);
    if (chain) chains.push(chain);
  }
  return { chains };
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/rollweb.test.ts` → PASS (all three). If the closability test ever fails, the culprit is a source of a *non-nibblable* form (Tree/Coral) slipping through — the `nibblable` filter guards it; or a habitat set that hosts nothing nibblable (the biome-sampler test uses grass/marsh/forest, all well-populated). `npm run check` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/life/rollweb.ts tests/rollweb.test.ts
git commit -m "feat: roll a matched, closable web — synthesise + verify with foodweb's own rules (pure, TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The pressures model + the richness meter (TDD, pure)

The pressures panel's brain and the wildness gauge, both pure. `tuningPatchFor` maps each tuning-backed pressure to its `FloraTuning` field(s); `grazerAssignment` is the deterministic role paint for selection strength; `richnessMeter` reuses `chainStats`/`richnessWord` + the exact `diversityScore` formula over the **construct's** species. Pure (node env, no DOM, no rng), so the model is proven before any slider exists.

**Files:**
- Create: `src/game/simPressures.ts`
- Test: `tests/sim-pressures.test.ts`

**Interfaces:**
- Consumes: `CritterRole`, `CritterSpecies` (`../life/fauna`); `FloraTuning` (`../life/flora`); `ChainStats`, `chainStats`, `richnessWord` (`../life/foodweb`); `PlantSpecies` (`../life/species`).
- Produces:
  - `type PressureId = "mutationAmount" | "splitDistance" | "grazerShare" | "reproChance" | "maxPerTile"`.
  - `interface Pressure { id: PressureId; label: string; min: number; max: number; step: number; tuningKey?: keyof FloraTuning; }` and `const PRESSURES: Pressure[]`.
  - `tuningPatchFor(id: PressureId, value: number): Partial<FloraTuning>`.
  - `grazerAssignment(ids: readonly number[], share: number): Map<number, CritterRole>`.
  - `interface Richness { score; word; chains; closable; redundancy }` and `richnessMeter(plants: PlantSpecies[], critters: CritterSpecies[]): Richness`.

- [ ] **Step 1: Write the failing tests** — `tests/sim-pressures.test.ts`:

```ts
import { expect, test } from "vitest";
import {
  PRESSURES, grazerAssignment, richnessMeter, tuningPatchFor,
} from "../src/game/simPressures";
import { chainStats, richnessWord } from "../src/life/foodweb";
import { rollWeb } from "../src/life/rollweb";
import { singleBiome } from "../src/world/construct";
import { Tile } from "../src/world/types";

const SEED = 4242;

test("all five pressures are exposed; the four tuning-backed ones name a FloraTuning field", () => {
  expect(PRESSURES.map((p) => p.id)).toEqual([
    "mutationAmount", "splitDistance", "grazerShare", "reproChance", "maxPerTile",
  ]);
  expect(PRESSURES.filter((p) => p.tuningKey).length).toBe(4); // grazerShare is the role-flip one
});

test("tuningPatchFor maps each tuning pressure to its field; speciation opens the split gates", () => {
  expect(tuningPatchFor("mutationAmount", 0.2)).toEqual({ mutationAmount: 0.2 });
  expect(tuningPatchFor("reproChance", 0.3)).toEqual({ reproChance: 0.3 });
  expect(tuningPatchFor("maxPerTile", 6.4)).toEqual({ maxPerTile: 6 }); // an integer cap
  const wild = tuningPatchFor("splitDistance", 0.1);
  expect(wild.splitDistance).toBe(0.1);
  expect(wild.splitClusterMin).toBe(2);       // a low threshold also frees the cluster gate
  expect(wild.splitCooldownTicks).toBe(0);    // …and the cooldown, so it actually fires
  expect(tuningPatchFor("grazerShare", 0.5)).toEqual({}); // not a tuning field
});

test("grazerAssignment flips a deterministic share of kinds to grazer", () => {
  const ids = [5, 2, 9, 1]; // unsorted on purpose
  const a = grazerAssignment(ids, 0.5);
  expect([...a.entries()].sort()).toEqual([...grazerAssignment(ids, 0.5).entries()].sort()); // deterministic
  expect([...a.values()].filter((r) => r === "grazer").length).toBe(2); // round(0.5*4)
  expect([...grazerAssignment(ids, 0).values()].every((r) => r === "disperser")).toBe(true);
  expect([...grazerAssignment(ids, 1).values()].every((r) => r === "grazer")).toBe(true);
});

test("richnessMeter reuses the diversityScore formula + richnessWord thresholds", () => {
  expect(richnessMeter([], []).word).toBe("flat"); // an empty construct is flat
  const map = singleBiome(SEED, Tile.Grass, 40);
  const web = rollWeb(SEED, 0, 3, new Set([Tile.Grass]), map);
  const plants = web.chains.flatMap((c) => [c.source, c.feeder]);
  const critters = web.chains.map((c) => c.disperser);
  const r = richnessMeter(plants, critters);
  const stats = chainStats(plants, critters);
  expect(r.score).toBeCloseTo(stats.chains + 2 * (stats.redundancy - 1)); // the SAME arithmetic
  expect(r.word).toBe(richnessWord(r.score));
  expect(r.chains).toBeGreaterThan(0);
  expect(r.closable).toBeGreaterThan(0); // a rolled web is closable → a real chain to watch
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/sim-pressures.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/game/simPressures.ts`:**

```ts
// The pressures panel's model + the richness/wildness meter — the evolutionary
// layer's two pure pieces (spec §"The evolutionary layer"). PURE: no DOM, no
// rng, no wall clock. The panel writes these onto the EXISTING kernel/Flora — a
// LIVE FloraTuning change (Flora reads this.tuning fresh every tick; see the
// plan's live-tuning finding) plus role flips for grazer-share (updateCritter
// reads sp.role live). The meter only READS, reusing foodweb's chainStats +
// richnessWord (the exact diversityScore arithmetic) — never re-scoring by hand.

import { CritterRole, CritterSpecies } from "../life/fauna";
import { FloraTuning } from "../life/flora";
import { ChainStats, chainStats, richnessWord } from "../life/foodweb";
import { PlantSpecies } from "../life/species";

export type PressureId =
  | "mutationAmount" // drift / mutation rate
  | "splitDistance"  // speciation threshold (how far a daughter must drift)
  | "grazerShare"    // grazer share / selection strength (a role-flip, not a tuning field)
  | "reproChance"    // reseed rate
  | "maxPerTile";    // per-tile cap (the richness ceiling)

export interface Pressure {
  id: PressureId;
  label: string;
  min: number;
  max: number;
  step: number;
  tuningKey?: keyof FloraTuning; // present for the four FloraTuning-backed pressures
}

// The five pressures, in panel order. Ranges bracket DEFAULT_TUNING so the
// default sits mid-slider and cranking a knob is a visible change.
export const PRESSURES: Pressure[] = [
  { id: "mutationAmount", label: "drift", min: 0, max: 0.3, step: 0.01, tuningKey: "mutationAmount" },
  { id: "splitDistance", label: "speciation", min: 0.08, max: 0.6, step: 0.01, tuningKey: "splitDistance" },
  { id: "grazerShare", label: "grazer share", min: 0, max: 1, step: 0.05 },
  { id: "reproChance", label: "reseed rate", min: 0, max: 0.4, step: 0.01, tuningKey: "reproChance" },
  { id: "maxPerTile", label: "per-tile cap", min: 1, max: 12, step: 1, tuningKey: "maxPerTile" },
];

// A FloraTuning patch for a tuning-backed pressure. Speciation is special: a
// LOWER threshold means "speciate more readily", but a lower splitDistance alone
// is silently blocked by the cluster/cooldown gates — so we open them in step
// (the same permissive direction ?split=1 uses), keeping the panel's one slider
// honest as "how wild speciation runs".
export function tuningPatchFor(id: PressureId, value: number): Partial<FloraTuning> {
  switch (id) {
    case "mutationAmount":
      return { mutationAmount: value };
    case "reproChance":
      return { reproChance: value };
    case "maxPerTile":
      return { maxPerTile: Math.round(value) };
    case "splitDistance":
      return {
        splitDistance: value,
        splitClusterMin: value < 0.2 ? 2 : value < 0.35 ? 4 : 6,
        splitCooldownTicks: value < 0.2 ? 0 : value < 0.35 ? 120 : 500,
      };
    default:
      return {}; // grazerShare is not a FloraTuning field
  }
}

// The grazer-share paint: given the critter kinds' ids and a target share 0..1,
// which become grazers. Deterministic (sort by id; the first ⌊share·N⌋ graze,
// the rest disperse) — no rng, so the same share always paints the same roster.
// updateCritter reads sp.role live, so writing these back lands on the next step.
export function grazerAssignment(ids: readonly number[], share: number): Map<number, CritterRole> {
  const sorted = [...ids].sort((a, b) => a - b);
  const clamped = Math.max(0, Math.min(1, share));
  const nGraze = Math.round(clamped * sorted.length);
  const out = new Map<number, CritterRole>();
  sorted.forEach((id, i) => out.set(id, i < nGraze ? "grazer" : "disperser"));
  return out;
}

// ── the richness / wildness meter ───────────────────────────────────────────

export interface Richness {
  score: number; // chains + 2*(redundancy-1) — the SAME formula diversityScore uses
  word: string; // richnessWord(score): flat/sparse/living/rich/lush/legendary
  chains: number;
  closable: number;
  redundancy: number;
}

// A live wildness reading for the WHOLE construct: the food web's standing
// chain-potential (chainStats over the construct's OWN species — never
// diversityScore(seed), which rebuilds a fresh world from a seed), scored by the
// exact diversityScore arithmetic and named by richnessWord. Display-only: it
// never mutates the sim.
export function richnessMeter(plants: PlantSpecies[], critters: CritterSpecies[]): Richness {
  const stats: ChainStats = chainStats(plants, critters);
  const score = stats.chains + 2 * (stats.redundancy - 1);
  return { score, word: richnessWord(score), chains: stats.chains, closable: stats.closable, redundancy: stats.redundancy };
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/sim-pressures.test.ts` → PASS (all four). `npm run check` → 0. Confirm rng-clean: `grep -nE "Math\.random|Date\.now|new Date" src/game/simPressures.ts` → no hits.

- [ ] **Step 5: Commit**

```bash
git add src/game/simPressures.ts tests/sim-pressures.test.ts
git commit -m "feat: the pressures model + richness meter — live-tuning patches, deterministic grazer-share, reused scoring (pure, TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The kernel adjusts tuning + roles LIVE (TDD, additive, Simulator-only)

The seam that makes the pressures panel a live lever: `setTuning` mutates the running Flora's tuning **in place** (no rebuild — the finding above), and `setCritterRole` flips a kind's role live. This task's tests are the **proof** of the live-tuning answer (a mid-run change drives behaviour on the next step, state preserved) and of determinism (same schedule ⇒ identical run).

**Files:**
- Modify: `src/life/kernel.ts` (add two methods; import `CritterRole`; leave `step`/`placePlant`/`placeCritter`/`introduce*`/`clear*` untouched)
- Test: `tests/kernel.test.ts` (extend — reuse the file's `bench()`/`snap()`/`at()` helpers)

**Interfaces (new on `SimKernel`):**
- `setTuning(patch: Partial<FloraTuning>): void` — `Object.assign(this.flora.tuning, patch)` (`FloraTuning` is already imported in `kernel.ts`).
- `setCritterRole(id: number, role: CritterRole): void` — `this.critterSpecies[id].role = role;` (add `CritterRole` to the `./fauna` import).

- [ ] **Step 1: Write the failing tests** — append to `tests/kernel.test.ts`:

```ts
test("setTuning takes effect LIVE on the next step — no rebuild, state preserved", () => {
  const { kernel, grassPlant } = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (let i = 0; i < 8; i++) kernel.placePlant(grassPlant, at(4 + i), at(4 + (i % 3)));
  kernel.setTuning({ reproChance: 0 }); // no reseed at all
  kernel.step(60, "plants");
  const held = kernel.flora.count; // barely grew (only aging/thinning)
  // crank reseed + ceiling on the SAME running kernel — no new construct
  kernel.setTuning({ reproChance: 0.4, maxPerTile: 12 });
  kernel.step(60, "plants");
  expect(kernel.flora.count).toBeGreaterThan(held); // the live change drove growth
  expect(kernel.tick).toBe(120); // never rebuilt — the tick kept climbing, state preserved
});

test("a setTuning schedule is deterministic (same schedule ⇒ identical run)", () => {
  const a = bench();
  const b = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (const s of [a, b]) {
    for (let i = 0; i < 6; i++) s.kernel.placePlant(s.grassPlant, at(4 + i), at(5));
    s.kernel.step(30, "plants");
    s.kernel.setTuning({ mutationAmount: 0.25, reproChance: 0.3 });
    s.kernel.step(30, "plants");
  }
  expect(snap(a.kernel)).toEqual(snap(b.kernel));
});

test("setCritterRole flips a kind's role live; step still never births/removes a critter (peaceful)", () => {
  const { kernel, grassPlant, critter } = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (let i = 0; i < 6; i++) kernel.placePlant(grassPlant, at(4 + i), at(4));
  kernel.placeCritter(critter, at(7), at(6));
  kernel.setCritterRole(critter, "grazer");
  expect(kernel.critterSpecies[critter].role).toBe("grazer");
  const before = kernel.critterCount();
  kernel.step(120, "full"); // a grazer thins plants — but never dies, nor multiplies
  expect(kernel.critterCount()).toBe(before);
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/kernel.test.ts` → FAIL (new methods missing).

- [ ] **Step 3: Implement — add to `SimKernel` in `src/life/kernel.ts`** (add `CritterRole` to the existing `import { Critter, CritterSpecies, updateCritter } from "./fauna";` → `import { Critter, CritterRole, CritterSpecies, updateCritter } from "./fauna";`):

```ts
  // Live-adjust the running Flora's tuning IN PLACE — the pressures panel's one
  // lever (the evolutionary layer, slice 4). Flora reads this.tuning fresh every
  // simTick/maybeSpeciate/propagate/hasRoom/stepSubstrates (verified in flora.ts —
  // NO field is captured at construction), so a patch takes effect on the very
  // NEXT step() with NO rebuild and NO loss of the current plant/critter/tick
  // state. A deterministic parameter change: it adds no rng draws, so the same
  // seed + placements + tuning schedule + step count ⇒ an identical run. The
  // `readonly tuning` field forbids reassignment; its number fields are mutable,
  // so Object.assign is the in-place write. Additive + Simulator-only.
  setTuning(patch: Partial<FloraTuning>): void {
    Object.assign(this.flora.tuning, patch);
  }

  // Selection strength's other half: set a critter KIND's role live (a grazer
  // bites / a disperser scatters). updateCritter reads sp.role fresh, so a flip
  // lands on the next step. A roster op, never a violent kill — the peaceful
  // pillar holds (a grazer nibbles; nothing dies).
  setCritterRole(id: number, role: CritterRole): void {
    this.critterSpecies[id].role = role;
  }
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/kernel.test.ts` → PASS (existing + new three). `npm run check` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/life/kernel.ts tests/kernel.test.ts
git commit -m "feat: kernel adjusts FloraTuning + critter roles LIVE mid-sim — no rebuild, deterministic (Simulator-only)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Roll-a-web + auto-place + the always-visible richness meter + "seed it richer" (screenshot)

Wire `rollweb.ts` and `richnessMeter` into the bench: a **roll a web** button that introduces the matched set (source/feeder/disperser) into the drawer + palette and **auto-places a seed** of it so the chain closes as you step; the **richness meter** hoisted prominently into the census panel (updating every step); and a **seed it richer** action that drops a bigger diverse web. Dev aids `?web=`/`?rich=` seed the shots.

**Files:**
- Modify: `src/game/worldlab.ts`

**Interfaces:**
- Consumes: `rollWeb`, `WebChain` (`../life/rollweb`); `richnessMeter` (`./simPressures`); the kernel `introducePlantSpecies`/`introduceCritterSpecies`; existing bench helpers `makeEntry`, `refreshPalette`, `refreshDrawer`, `refreshCensusStrip`, `nearestTileOf`, `worldPxCenter`, `habitatsOf`.

- [ ] **Step 1: Web state + the introduce/place helper.** Add module-scope state: `let webCursor = 0;` and constants `const WEB_SIZE = 3; const WEB_SIZE_RICH = 6;`. Factor the pick→introduce body already inside `pickBatch` into two tiny local helpers so roll-a-web can reuse the exact path (drawer entry + palette refresh):
  - `introducePlantDef(def: PlantSpecies): number` → `const id = kernel.introducePlantSpecies({ ...def, id: PROVISIONAL_ID }); drawer.push(makeEntry({ kind: "plant", speciesId: id, def: kernel.plantSpecies[id], origin: "rolled" })); return id;`
  - `introduceCritterDef(def: CritterSpecies): number` → same over `introduceCritterSpecies` (drop `id`); returns the new id.
  Keep `pickBatch` calling these so its behaviour is unchanged (a pure refactor).

- [ ] **Step 2: `seedWeb(size)`.** A helper that rolls and plants a web:
  - `const web = rollWeb(seed, webCursor, size, habitatsOf(map), map); webCursor++;` (deterministic advance, like `rollCursor`).
  - For each `chain` of `web.chains`: `const srcId = introducePlantDef(chain.source);` `const feedId = introducePlantDef(chain.feeder);` then **point the disperser's `favoriteSpecies` at the introduced source** (so the inspect card's "born loving" line reads coherently and never indexes an out-of-range plant): `const dsp = introduceCritterDef({ ...chain.disperser, favoriteSpecies: srcId });`
  - **Auto-place a seed** near the construct centre, reusing the exact `seedDemoScenario` placement pattern (`nearestTileOf(map, habitat, cx, cy)` + `worldPxCenter` + `kernel.placePlant`/`placeCritter`): a source plant on a `source.habitat` tile, the disperser a few tiles beside it, the feeder on another `source.habitat` tile nearby — so stepping actually closes the chain (disperser seeks source → nibble → `propagate` + `addSubstrate(hue H)` → the feeder germinates on the shared-habitat byproduct).
  - `refreshPalette(); refreshDrawer(); refreshCensusStrip();` then flash `rolled a web — ${web.chains.length} chains introduced + seeded`.
  - **seed it richer** = `seedWeb(WEB_SIZE_RICH)`; **roll a web** = `seedWeb(WEB_SIZE)`.

- [ ] **Step 3: The richness meter (always visible, in the census panel).** Extend `CensusWebView` with a `richnessScore: number` (and keep the existing `richness` word), computed via `richnessMeter(kernel.plantSpecies, kernel.critterSpecies)` inside `censusWebView` (replace the inline `chainStats(...)` score math with a `richnessMeter` call — the same numbers, now from the shared pure fn). In `chrome.setCensusWeb`, render a **prominent meter block at the top of the `web` panel** (above "census"): the `richness` word in big firefly-gold small-caps + the numeric `score`, plus `chains` / `closable`. No new panel — it rides inside the existing bounded/scrolling census panel, so the left column stays intact.

- [ ] **Step 4: Chrome — the roll-a-web controls.** In `buildChrome`, add a control row to the **roll pane** (below the existing roll/re-roll row, inside the already-capped+scrolling `rollPane`): a `roll a web` button and a `seed it richer` button. Extend the `Chrome` interface with `onRollWeb: () => void` and `onSeedRicher: () => void`; wire them to `seedWeb(WEB_SIZE)` / `seedWeb(WEB_SIZE_RICH)`. Consume only `:root` tokens; reuse `btn()`/`group()`/`label()`.

- [ ] **Step 5: The dev aids.** In `build()`, after the slice-3 aids: `?web=1` calls `seedWeb(WEB_SIZE)` (introduces + auto-places one web); `?rich=1` calls `seedWeb(WEB_SIZE_RICH)` (a richer web); both compose with `&run=N` (already handled by the `runTicks` aid) so a shot lands on an already-closing web. Display-only, rng-free beyond the seeded roll + the seeded placement.

- [ ] **Step 6: Typecheck** — `npm run check` → 0.

- [ ] **Step 7: Screenshot roll-a-web + the meter** —

```
node scripts/shot.mjs "sim=1&starter=biome-sampler&web=1" scratchpad/lab-web.png 2600 1400 950 ""
node scripts/shot.mjs "sim=1&starter=biome-sampler&web=1&run=300" scratchpad/lab-web-closing.png 2600 1400 950 ""
node scripts/shot.mjs "sim=1&starter=biome-sampler&rich=1&run=300" scratchpad/lab-web-richer.png 2600 1400 950 ""
```
Open all three. Expected: `lab-web.png` — the roll pane shows `roll a web`/`seed it richer`; the drawer lists the introduced source/feeder/disperser kinds; the auto-placed seed sits on the construct; the census panel's **richness meter** reads a live word/score with `chains > 0`. `lab-web-closing.png` — after 300 ticks the feeder species has climbed out of zero in the census (the chain closed as it stepped) and `closable` is non-zero. `lab-web-richer.png` — a denser web (more chains), a higher richness word (e.g. `rich`/`lush`). Confirm the meter is prominent and the columns didn't collide.

- [ ] **Step 8: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "feat: roll a foodchain/web — introduce + auto-place a closable matched set + a live richness meter + seed-it-richer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The pressures panel — live sliders in an evolution tray (screenshot)

The five pressures as **live** sliders (drift · speciation · grazer-share · reseed · per-tile cap) — dragging one writes `kernel.setTuning(...)` / `kernel.setCritterRole(...)` on the running kernel, so the very next step evolves faster/wilder. The panel is a **toggled `position: fixed` overlay tray** (not a column child), so the left/right bounded/scrolling stacks stay structurally intact.

**Files:**
- Modify: `src/game/worldlab.ts`

**Interfaces:**
- Consumes: `PRESSURES`, `Pressure`, `PressureId`, `tuningPatchFor`, `grazerAssignment` (`./simPressures`); the kernel `setTuning`/`setCritterRole`; `DEFAULT_TUNING` (`../life/flora`) for initial slider values; existing `critterKinds`/drawer for the grazer-share id list.

- [ ] **Step 1: Apply-a-pressure state + handler.** Add module-scope `let pressureValues: Record<PressureId, number>` seeded from `DEFAULT_TUNING` (`mutationAmount`, `splitDistance`, `reproChance`, `maxPerTile`) plus `grazerShare: <fraction of current critter kinds that are grazers>` (or 0 at boot). A `setPressure(id, value)` bench fn:
  - `pressureValues[id] = value;`
  - if the pressure has a `tuningKey` (all but `grazerShare`) → `kernel.setTuning(tuningPatchFor(id, value));`
  - if `grazerShare` → `const ids = critterKinds.map(c => c.id); const roles = grazerAssignment(ids, value); for (const [id, role] of roles) kernel.setCritterRole(id, role);` then `refreshPalette()`/`refreshDrawer()` (roles are cosmetic to the palette but a re-render keeps any role-derived copy honest).
  - `refreshCensusStrip();` (the meter reflects the new potential immediately; population follows as you step).
  All live — no rebuild. Determinism holds (no new rng draws).

- [ ] **Step 2: Chrome — the evolution tray.** In `buildChrome`, build a `position: fixed` codex panel `evoTray` (right-docked, e.g. `right: 18px; bottom: 96px; max-height: 70vh; overflow-y: auto; z-index: 7;`), hidden by default (`display: none`), holding one labelled `<input type="range">` per `PRESSURES` entry (min/max/step from the descriptor) with a live value readout (reuse `stat()`), styled with `:root` tokens (accent via `accent-color: rgb(var(--lumen))`). Add a **`pressures ⚘`** toggle button to the bottom `bar` (beside `brush`) that flips the tray's visibility. Because the tray is a fixed overlay — not a `leftStack`/`rightStack` child — it can't push a column into the overlap those stacks were built to avoid. Extend `Chrome` with `onPressure(id: PressureId, value: number)`, `setPressure(id, value)` (sync a slider + its readout), and `openPressures(open?: boolean)`; wire `onPressure` → `setPressure` (bench).

- [ ] **Step 3: The dev aids.** `?evo=1` opens the tray (`chrome.openPressures(true)`) so a shot shows the sliders; `?pressures=wild` opens the tray **and** cranks each pressure to its wild end (`setPressure("mutationAmount", 0.28)`, `setPressure("splitDistance", 0.1)`, `setPressure("grazerShare", 0.5)`, `setPressure("reproChance", 0.35)`, `setPressure("maxPerTile", 10)`) — combined with `&web=1&run=N` a shot shows a wilder, faster-evolving web (more daughters ✧ in the drawer, thinner grazed patches). Display-only paths reusing the same seeded kernel.

- [ ] **Step 4: Typecheck** — `npm run check` → 0.

- [ ] **Step 5: Screenshot the pressures panel** —

```
node scripts/shot.mjs "sim=1&starter=single-biome&evo=1" scratchpad/lab-pressures.png 2600 1400 950 ""
node scripts/shot.mjs "sim=1&starter=single-biome&split=1&web=1&pressures=wild&run=600" scratchpad/lab-pressures-wild.png 2600 1400 950 ""
node scripts/shot.mjs "sim=1&starter=biome-sampler&web=1&pressures=wild&run=400" scratchpad/lab-pressures-web.png 2600 1400 950 ""
```
Open all three. Expected: `lab-pressures.png` — the evolution tray open with five labelled sliders at their default positions, values readable. `lab-pressures-wild.png` — the tray cranked wild; after 600 ticks on the permissive split the drawer shows one or more ✧ daughters (the higher drift + lower speciation threshold firing) and thinned patches (grazer share up); the richness meter reads higher. `lab-pressures-web.png` — a wild web on the sampler, chains closing faster than at defaults. Confirm the tray overlays cleanly and the left/right columns are untouched.

- [ ] **Step 6: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "feat: the pressures panel — five LIVE sliders (drift/speciation/grazer-share/reseed/per-tile) in an evolution tray

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Curate — pin-to-reseed (TDD pin model + screenshot)

The curate loop: **pin** a phenotype (a drawer entry / a live kind) to **re-seed** from it — the wild output becomes new input. A tiny pure addition to the drawer model (`pinned` + toggles, mirroring `deleteEntry`/`reviveEntry`), then a bench **reseed** action that re-places from each pinned entry's **stored def** through the existing seeded `placePlant`/`placeCritter`.

**Files:**
- Modify: `src/game/simDrawer.ts` (add the `pinned` field + `pinEntry`/`unpinEntry`/`pinnedEntries` — additive; `makeEntry` sets `pinned: false`)
- Test: `tests/sim-drawer.test.ts` (extend)
- Modify: `src/game/worldlab.ts` (the pin toggle + reseed wiring)

**Interfaces (new on `simDrawer.ts`):**
- `DrawerEntry` gains `pinned: boolean`.
- `pinEntry(entry): DrawerEntry` / `unpinEntry(entry): DrawerEntry` — immutable toggles preserving `def`.
- `pinnedEntries(entries: readonly DrawerEntry[]): DrawerEntry[]` — non-deleted pinned entries.

- [ ] **Step 1: Write the failing tests** — append to `tests/sim-drawer.test.ts`:

```ts
import { pinEntry, pinnedEntries, unpinEntry } from "../src/game/simDrawer"; // add to the existing import

test("pin/unpin toggles the flag and preserves the stored def", () => {
  const def = plantDef(3, { substrateFeeder: true });
  const e = makeEntry({ kind: "plant", speciesId: 3, def, origin: "rolled" });
  expect(e.pinned).toBe(false); // fresh entries are unpinned
  const pinned = pinEntry(e);
  expect(pinned.pinned).toBe(true);
  expect(pinned.def).toEqual(def); // curation never disturbs the definition
  expect(unpinEntry(pinned).pinned).toBe(false);
});

test("pinnedEntries returns non-deleted pinned kinds only", () => {
  const a = pinEntry(makeEntry({ kind: "plant", speciesId: 0, def: plantDef(0), origin: "rolled" }));
  const b = makeEntry({ kind: "plant", speciesId: 1, def: plantDef(1), origin: "rolled" });
  const c = deleteEntry(pinEntry(makeEntry({ kind: "plant", speciesId: 2, def: plantDef(2), origin: "rolled" })));
  expect(pinnedEntries([a, b, c]).map((e) => e.speciesId)).toEqual([0]); // b unpinned, c deleted
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/sim-drawer.test.ts` → FAIL (new exports missing).

- [ ] **Step 3: Implement — extend `src/game/simDrawer.ts`** (add `pinned: boolean;` to `DrawerEntry`; set `pinned: false` in `makeEntry`'s returned object; append the toggles/selector):

```ts
// Curate: pin a phenotype to RE-SEED from it (the wild output becomes new
// input, spec §"The evolutionary layer"). A pin is a flag on the drawer entry;
// the bench re-places from the entry's STORED def through the seeded kernel.
// Immutable-style, like delete/revive, so callers swap the entry in their list.
export function pinEntry(entry: DrawerEntry): DrawerEntry {
  return { ...entry, pinned: true };
}
export function unpinEntry(entry: DrawerEntry): DrawerEntry {
  return { ...entry, pinned: false };
}
// The kinds curation should re-seed from: pinned, not cleared.
export function pinnedEntries(entries: readonly DrawerEntry[]): DrawerEntry[] {
  return entries.filter((e) => e.pinned && !e.deleted);
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/sim-drawer.test.ts` → PASS (existing seven + new two). `npm run check` → 0.

- [ ] **Step 5: Bench wiring — pin toggle + reseed.** In `worldlab.ts`:
  - **Pin toggle per drawer row.** Add `pinned: boolean` to the `DrawerRow` view and set it from the entry; in `refreshDrawer`'s row map, include `pinned: e.pinned`. In `chrome.setDrawer`, add a small **pin ⭑ / unpin** button per row (reusing `btn()`), calling `chrome.onPinEntry(key)` / `chrome.onUnpinEntry(key)`. A `pinDrawerEntry(key)` / `unpinDrawerEntry(key)` bench fn swaps the entry via `pinEntry`/`unpinEntry` and `refreshDrawer()`s.
  - **Reseed action.** A `reseedPinned()` bench fn that, for each `pinnedEntries(drawer)` entry, re-places a few instances from its **stored def** near the construct centre through the existing `kernel.placePlant(id, …)` / `placeCritter(id, …)` (reuse the exact `reviveDrawerEntry` placement loop: `nearestTileOf` + `worldPxCenter`; the species record still sits at its id, so placing just works and the drawer's deep-cloned `def` is the conceptual source of truth). `refreshPalette()`/`refreshDrawer()`/`refreshCensusStrip()`. Wire it to a **reseed pinned** button (in the roll pane's web-control row, beside `roll a web`) and expose `chrome.onReseedPinned`. Deterministic: placement draws only from the seeded `placeRng` (off the step stream).

- [ ] **Step 6: The dev aids.** `?pin=<key-or-index>` pins that drawer entry (the SAME `pinDrawerEntry` a click runs); `?reseed=1` calls `reseedPinned()` once on load. Combine `?drawerdemo=1&pin=0&reseed=1` so a shot shows a pinned kind re-seeded from its def. Display-only, rng-free beyond the seeded placement.

- [ ] **Step 7: Typecheck + screenshot** — `npm run check` → 0, then:

```
node scripts/shot.mjs "sim=1&starter=single-biome&drawerdemo=1&pin=0" scratchpad/lab-pin.png 2600 1400 950 ""
node scripts/shot.mjs "sim=1&starter=single-biome&drawerdemo=1&pin=0&reseed=1&run=120" scratchpad/lab-pin-reseed.png 2600 1400 950 ""
node scripts/shot.mjs "sim=1&starter=single-biome&split=1&drawerdemo=1&run=600&pin=0&reseed=1" scratchpad/lab-pin-daughter.png 2600 1400 950 ""
```
Open all three. Expected: `lab-pin.png` — a drawer row shows the **pinned ⭑** state and the `reseed pinned` button is available. `lab-pin-reseed.png` — the pinned kind has fresh instances on the construct (re-seeded from its stored def) and a non-zero `in play` count. `lab-pin-daughter.png` — after a long permissive-split run, a ✧ daughter (the wild output) can be pinned and re-seeded, closing the curate loop (best-effort like slice-3's `?split`; the pure `pinnedEntries`/`cloneDef` tests are the guarantee). Confirm pinning a kind then reseeding genuinely re-places it.

- [ ] **Step 8: Commit**

```bash
git add src/game/simDrawer.ts tests/sim-drawer.test.ts src/game/worldlab.ts
git commit -m "feat: curate — pin a phenotype to re-seed from its stored def (pure pin model + bench reseed)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Full verify + determinism/peaceful/mode-isolation guards + a doc note

Prove the slice green, the evolution deterministic and peaceful, and real worlds untouched; leave a pointer for slice 5.

**Files:**
- Modify: `docs/superpowers/2026-07-22-plant-insect-ecology-tech.md` (a short "the evolutionary layer (Simulator slice 4)" note).

- [ ] **Step 1: Full gate** — `npm run check` (0) · `npx vitest run` (all green — report the count, incl. the new `rollweb` / `sim-pressures` tests, the extended `kernel` + `sim-drawer` tests, and the still-green slice-1/2/3 `construct`/`sim-roster`/`sim-brush`/`roll`/`flags` tests) · `npm run build` (ok).

- [ ] **Step 2: Determinism + peaceful spot-check.** Confirm the evolution core is rng-clean: `grep -nE "Math\.random|Date\.now|new Date" src/life/rollweb.ts src/game/simPressures.ts` → no hits (roll-a-web is seeded via `rollSeedFor`+`makeRng`; `grazerAssignment`/the meter are pure). The determinism proof is Task 3's `setTuning`-schedule replay test; the peaceful invariant is guarded by the slice-1 `critterCount()`-across-`step()` test (still green) and Task 3's `setCritterRole` + `step` test (a grazed kind survives). Note in the doc that **a pressures change is a deterministic parameter change** (live tuning, no rng) and **grazer-share thins, never kills** (a grazer nibbles).

- [ ] **Step 3: The mode-isolation guard (real worlds byte-identical).** The only shared-*looking* edits are additive methods on the Simulator-only `kernel.ts` (`setTuning`/`setCritterRole`) and the Simulator-only `simDrawer.ts` (`pinned` + toggles); no `main.ts`/`species.ts`/`fauna.ts`/`flora.ts`/`renderer.ts` change, so the slice-1 `parseSimMode` test still guards the router. Add the visual proof:

```
node scripts/shot.mjs "seed=42" scratchpad/guard-world.png 2500 960 640 "Escape"
node scripts/shot.mjs "sim=swarm" scratchpad/guard-swarm.png 2500 1000 800 ""
node scripts/shot.mjs "sim=1&web=1&evo=1" scratchpad/guard-lab.png 2500 1100 820 ""
```
Open all three. Expected: `guard-world.png` — island 42 in normal play, unchanged; `guard-swarm.png` — the swarm/identity-map bench, intact; `guard-lab.png` — the World-Lab now carrying the roll-a-web + richness meter + pressures tray, no life until you place/roll. Three distinct, correct destinations.

- [ ] **Step 4: Doc note** — one short paragraph: the evolutionary layer shipped — **roll-a-web** (`rollweb.ts` synthesises a matched source/feeder/disperser triple and verifies closure with `foodweb.ts`'s own `appetite`/`hueGap` rules — foodweb only *scores*, so closure is built by construction: source+feeder share the `(form,hue)` family so one disperser closes the loop); the **pressures panel** (`simPressures.ts` + kernel `setTuning`/`setCritterRole` — **`FloraTuning` is live-adjustable mid-sim; no rebuild**, because Flora reads `this.tuning` fresh each tick; grazer-share is a live role flip); the **richness meter** (reuses `chainStats`+`richnessWord` and the `diversityScore` score formula over the construct's own species, display-only); and **pin-to-reseed** (`simDrawer` `pinned` + a bench reseed from the stored `def`). Deferred slice-5 items unchanged (save/resume to a slot, full-critter-state/RNG persistence, the ambient bench, the title-screen backdrop) plus v2 curate (named lineages / branch-a-phenotype / export toward a real world) and Door A's scrubbable timeline.

- [ ] **Step 5: Commit** (push/merge handled at branch-finish, not here):

```bash
git add -A
git commit -m "docs: the evolutionary layer (Simulator slice 4) — roll-a-web + pressures + richness meter + pin-to-reseed, green

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (coverage against the slice-4 scope)

| Slice-4 scope item | Task(s) | Verified by |
|---|---|---|
| **1. Roll a foodchain / a web — a matched, closable set (reuse foodweb matching + roll.ts)** | Task 1 (`rollWeb`) + Task 4 (introduce + auto-place) | `tests/rollweb.test.ts` — every chain closable via `appetite`/`hueGap`/`chainLinks`/`chainStats`, deterministic; `lab-web`/`lab-web-closing` shots (feeder climbs out of zero as it steps) |
| **1b. Introduce the whole set onto palette/drawer + auto-place a seed** | Task 4 | `lab-web` shot (drawer lists source/feeder/disperser; seed on the construct); reuses `introduce*` + `seedDemoScenario` placement |
| **2. Pressures panel v1 — drift / speciation / grazer-share / reseed / per-tile, adjusted LIVE** | Task 2 (`tuningPatchFor`/`grazerAssignment`) + Task 3 (`setTuning`/`setCritterRole`) + Task 5 (sliders) | `tests/sim-pressures.test.ts` + `tests/kernel.test.ts` (live change drives the next step; schedule deterministic); `lab-pressures*` shots |
| **2b. LIVE-tuning question answered (no rebuild)** | Task 3 | `flora.ts` reads `this.tuning` fresh per tick (finding); the `setTuning`-live test proves a mid-run change takes effect with tick/state preserved |
| **3. Richness/wildness meter — live score, reuse diversityScore formula + chain count** | Task 2 (`richnessMeter`) + Task 4 (prominent, in the census panel) | `tests/sim-pressures.test.ts` (score == `chains+2*(redundancy-1)`, word == `richnessWord`); `lab-web` shot (meter prominent, live) |
| **3b. "Seed it richer" — drop a diverse matched web** | Task 4 (`seedWeb(WEB_SIZE_RICH)`) | `lab-web-richer` shot (denser web, higher richness word) |
| **4. Curate — pin-to-reseed (reuse the drawer's stored defs)** | Task 6 (`pinEntry`/`unpinEntry`/`pinnedEntries` + bench reseed) | `tests/sim-drawer.test.ts` (toggle preserves `def`; `pinnedEntries` filters); `lab-pin`/`lab-pin-reseed` shots |
| **Determinism (seeded evolution, no `Math.random`/wall-clock; a pressures change is a param change)** | Tasks 1–3, 7 | `rollSeedFor`+`makeRng` roll; `grazerAssignment`/meter pure; `setTuning`-schedule replay test; `grep` guard |
| **Peaceful pillar (grazer-share thins, never kills)** | Tasks 3, 7 | slice-1 `critterCount()`-across-`step` still green; `setCritterRole`+`step` test (a grazed kind survives) |
| **Reuse over fork** | Tasks 1, 2, 4, 5 | `rollweb` composes `roll.ts`+`setCritterTraits`+foodweb rules; `richnessMeter` reuses `chainStats`/`richnessWord`; pressures adjust the EXISTING `FloraTuning`/roles; no matching/scoring/genome logic re-implemented |
| **Real worlds byte-identical (mode isolation); columns kept intact** | Tasks 5, 7 | only additive Simulator-only `kernel.ts`/`simDrawer.ts`; slice-1 `parseSimMode` test + `guard-world`/`guard-swarm`/`guard-lab` shots; meter rides in the census panel, pressures in a fixed overlay tray (no `leftStack`/`rightStack` change) |

## Deferred to later slices (spec build-order 5+, noted so they aren't lost)
- **v2 curate** — named lineages, branch-a-phenotype, export a curated kind toward a real world. Slice-4 pin operates on the drawer's species-level `def`.
- **Deep-time / Door A** — fork a real world, run forward at a chosen fidelity, before→after, adopt-or-discard; the scrubbable timeline.
- **Save/resume to a slot** + full-critter-state + RNG persistence (slice 5); the **ambient bench**; the **title-screen live backdrop**.

## Open calls flagged for the controller
1. **Roll-a-web closes with a single disperser by sharing the `(form,hue)` family.** `appetite` gates hard on form equality, so a one-palate chain requires source + feeder to share a form; the feeder is a real (or cloned) same-form candidate flagged `substrateFeeder`, retuned to hue H. This is the minimal *guaranteed*-closable unit and keeps the plan honest (verified by `chainLinks`). If a richer multi-form chain is wanted later (source form F1 eaten by D1, feeder form F2 eaten by a *second* disperser D2), that's a 4-member chain — flagged, not built (the 3-member triple matches the spec's "a plant + a disperser + a substrate-feeder → a closable chain").
2. **`richnessMeter` scores the CONSTRUCT, not `diversityScore(seed)`.** `diversityScore(seed)` rebuilds a *fresh* world from a seed (the "sail to a new island" roll) — the wrong target for a live meter. The honest reuse is its *formula* (`chains + 2*(redundancy-1)`) + `richnessWord`, applied to `kernel.plantSpecies`/`critterSpecies`. The always-visible meter shows the standing chain-*potential*; the census population beside it is the live proof a chain *realised*. Confirm that split reads right (potential vs realised).
3. **Pressures live in a toggled overlay tray, the meter inside the census panel.** To honour "no left-column overlap; keep the bounded/scrolling stacks intact", the five sliders are a `position: fixed` overlay (not a column child) and the meter rides in the existing census panel's header. If an always-open pressures panel is preferred, it would need a fourth bounded/scrolling column — flagged as a layout change, not assumed.
4. **Grazer-share repaints ALL current critter kinds' roles.** The slider sets a *global* grazer fraction across the drawer's critter kinds (deterministic paint). It will override a role a user set by hand in the slice-3 iterate strip (or on a rolled web's disperser). That's the intended "selection strength" knob, but it's a global override — confirm that's the wanted behaviour (a per-kind role lock is a v2 refinement).
5. **`?split=1` / `?pressures=wild` demo tuning.** The daughter-and-pin screenshots lean on the permissive split tuning + a long `run` to force a ✧ within a bounded shot (best-effort, like slice-3). The pure tests (`rollweb` closability, `sim-pressures`, `sim-drawer`) are the guarantees; the shots illustrate.

## API-friction notes (where fauna/flora/foodweb make a scope item harder than the spec implies — and the key answers the controller asked for)
- **THE key answer — `FloraTuning` is LIVE-adjustable mid-sim; the pressures panel needs NO rebuild.** `Flora.tuning` is a Flora-owned object (constructor: `this.tuning = { ...DEFAULT_TUNING, ...tuning }`), and **every** read is fresh each tick/call — `simTick` (`const t = this.tuning;` per heartbeat), `maybeSpeciate`, `hasRoom`, `propagate`, `pollinateSpread`, `stepSubstrates`. **Nothing is captured at construction** (`scatter` reads tuning but only runs at build; the kernel builds Flora empty). `Object.assign(kernel.flora.tuning, patch)` therefore lands on the next `step()` with the whole plant/critter/tick state preserved. The `readonly tuning` field only blocks *reassignment*; its number fields are mutable. **This makes the slice's hardest question low-difficulty** — a slider writes tuning in place; no state-preserving rebuild path is needed.
- **The one non-tuning pressure (grazer-share) is a live role flip.** `updateCritter` reads `speciesList[c.species].role` fresh (`if (sp.role === "grazer") …`), so `kernel.setCritterRole(id, role)` (writing `critterSpecies[id].role`) lands on the next step too. No `FloraTuning` field controls grazer share (`GRAZER_CHANCE` in `fauna.ts` is a private generation-time constant only), so the panel paints roles directly — deterministic via `grazerAssignment` (no rng).
- **`foodweb.ts` only SCORES — there is no "build a matched set" path.** `chainStats`/`chainLinks`/`diversityScore` READ what links exist over a given species set; none synthesises a closable chain. So roll-a-web **synthesises** (reusing `roll.ts` candidates + `setCritterTraits`) and **verifies** with the same rules the sim runs on (`appetite`/`APPETITE_MIN`, `hueGap`/`SUBSTRATE_HUE_MATCH`) — closure is guaranteed by construction (source+feeder share form+hue; disperser palate centred on them), and the tests assert it via `chainLinks(...).some(l => l.closes)` + `chainStats(...).closable ≥ 1`.
- **`rollCritterBatch` needs a REAL-id plant list.** `generateCritterSpecies` (which `rollCritterBatch` calls) cuts a critter's `favoriteSpecies` by indexing `plants` via `p.id`; a *provisional-id* (`-1`) batch would index `plants[-1]` and throw. So `rollweb`'s `rollChain` passes `generatePlantSpecies(base)` (real ids) to `rollCritterBatch` — the disperser's palate is overridden anyway, so only a valid array shape matters. (The slice-3 bench already passes `kernel.plantSpecies` here — real ids — so this only bites the new synthesis path.)
- **A web disperser's `favoriteSpecies` must point at a valid `kernel.plantSpecies` index on introduce.** `critterInspectView` reads `plantSpecies[sp.favoriteSpecies].name`; a rolled disperser's `favoriteSpecies` indexes the *base* roster, which may not line up after introduces grow the array. Task 4 sets `favoriteSpecies = <the source's new id>` on introduce, so the inspect card's "born loving" line reads coherently and never indexes out of range.
- **In-sim germination needs a shared habitat tile (foodweb's score is habitat-blind).** `chainStats`/`chainLinks` match on form/hue/role only, but `flora.stepSubstrates` additionally requires the feeder share the byproduct's **tile** to germinate. So `rollweb` sets `feeder.habitat = source.habitat`, and auto-placement drops both on `source.habitat` tiles — otherwise the web would *score* closable yet never *close* on the bench. (The rollweb test asserts `feeder.habitat === source.habitat` to lock this in.)
- **`idmap.ts`/`swarm.ts` are the SEPARATE `?sim=swarm` ecology — not used here.** The `?sim=1` World-Lab's chains run entirely on `foodweb.ts` + `flora`/`fauna` matching; the identity-map (pixel-signature) matcher belongs to the swarm bench. Roll-a-web reuses `hueGap`/`appetite`, *not* the swarm's `resemblance`/`matchReward`. Noted so a "reuse the matcher" instinct doesn't pull in the wrong module.
- **The pin reseed re-places against the still-present species record.** Delete tombstones (never splices), so a pinned kind's record sits unchanged at its id; `reseedPinned` just re-places instances via the existing `placePlant`/`placeCritter` (as `reviveDrawerEntry` already does). The drawer's deep-cloned `def` is the conceptual source of truth (and future-proofs against edits), but no re-introduction / id reassignment is needed on reseed.
