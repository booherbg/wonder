# Design B — Byproduct Chains & Seed Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one generic primitive — a transient, trait-tagged `Substrate` byproduct read through the existing `appetite`/hue match — so multi-organism life-cycle chains self-assemble from the seed, different every island; plus make "sail to a new island" a search with a minimum-viable-diversity floor (and a deliberately-sparse frontier opt-in). All of it behind an **A/B toggle** so it can be turned off wholesale.

**Architecture:** A `Substrate` is a mark on the ground carrying the `{hue, glow, form}` of the plant a disperser just ate. Substrate-feeder species (rolled at generation, biased to pioneer forms) germinate on a hue-matching substrate via the existing `addPlant` (caps/habitat still hold). Closure is automatic: a germinated plant is ordinary — eaten in turn, it emits its own substrate. A pure `diversityScore(seed)` counts disperser→plant→substrate-feeder trait-window links + redundancy; the "new island" path rejection-samples random seeds to a floor. Everything is gated by a single `chains` flag; when off, the sim is **byte-identical to today**.

**Tech Stack:** TypeScript, Vite, Vitest. Pixel-art canvas game. Seeded RNG (`src/core/rng.ts` — `makeRng`, `hash2d`); **no `Math.random`/`Date.now` in sim/gen code.**

## Global Constraints

Copied from the spec and the codebase's compatibility discipline. **Every task implicitly includes this section.**

- **Determinism is sacred.** 18+ seeds are pinned bit-identical across the suite. New generation rolls MUST come from a **separate salted rng stream** (pattern: fauna palates use `makeRng(seed ^ 0x9a1a7e)`), never by inserting `rng()` calls into `generatePlantSpecies`'s main stream.
- **A/B-off ≡ today.** With the `chains` flag off: no substrates are ever created, `simTick` draws **zero** extra rng, no rejection sampling occurs, and every existing test and pinned seed is unchanged. This is the safety valve Blaine asked for ("in case it's a disaster hah").
- **No `Math.random` / `Date.now`** in `src/life`, `src/world`, or scoring code — only seeded rng, or the value is passed in.
- **Legibility is part of v1, not polish.** Substrates must render and the dev readout must surface them (spec §Legibility). A hidden mechanic is a failed one.
- **Trait-windows, never named species** (spec §Resilience). Germination and emission always match by hue-window/appetite so multiple species fill each role — lose one, another routes around.
- **Explicit seeds load exactly.** Rejection sampling applies ONLY to the "new random island" path (`R` / `randomSeed()`), never to `?seed=`, the picker, or a saved world.
- Run `npx tsc` (via `npm run check`) and `npx vitest run` green before every commit. Eyeball rendering with `npm run shot`.
- Co-author trailer on every commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  and `Claude-Session: https://claude.ai/code/session_01ESuzCu8BorD1cYDQJ2zNSt`

---

## Open decisions — resolved (the leans, per Blaine's "take the leans")

1. **Decay lifetime** — `SUBSTRATE_LIFETIME = 150` sim-ticks (~½ island-day at ~2s/tick). One named constant in `flora.ts`; tunable. Long enough that chains assemble while you're away, short enough to catch live.
2. **Floor** — `DIVERSITY_FLOOR = 5` chains, `SEED_CANDIDATES = 8` rolls (study: rejects bottom ~22% at ~1.3 rolls avg). Frontier is a **control** (`?frontier`, later a menu checkbox), not a separate mode.
3. **Substrate-feeder germination** — **adds** to normal scatter/reproduction (does not replace it) in v1. A `SUBSTRATE_FEEDER_SCATTER` knob (default `1.0`) is left in place to weight their initial scatter down later if the dependency doesn't feel real; kept at 1.0 for v1 so balance is unchanged when a chain is inactive.
4. **`substrateFeeder` roll** — a per-species flag biased by form (Moss/Fungus/Sporestalk strongly; generatively possible elsewhere), rolled from a **separate rng stream**.

---

## File Structure

- **`src/game/flags.ts`** (create) — pure `resolveChains(param, stored)` and the `wander.chains` key. The only new "settings" surface; the menu (separate plan) will later flip the same localStorage key.
- **`src/life/genome.ts`** (modify) — no shape change; export nothing new. (Substrate signature reuses `Genome` fields.)
- **`src/life/species.ts`** (modify) — add `substrateFeeder?: boolean` to `PlantSpecies`; roll it in a new `rollSubstrateFeeders(seed, species)` pass off a salted stream.
- **`src/life/flora.ts`** (modify) — `Substrate` interface, `substrates: Substrate[]`, `addSubstrate`, `chains`/`substrateFeeder` handling in `simTick` (decay + germination), `germinations` counter, `FloraTuning.chains`.
- **`src/life/fauna.ts`** (modify) — disperser emits substrate on the `propagate` path in `updateCritter`.
- **`src/life/foodweb.ts`** (create) — pure `chainStats(plants, critters)` + `diversityScore(seed)` + `pickNewSeed(...)`. No DOM, no globals.
- **`src/render/renderer.ts`** (+ `src/render/tiles.ts` if needed) (modify) — draw substrates as faint tinted ground patches.
- **`src/game/main.ts`** (modify) — read the flag, pass `chains` to Flora, wire disperser emission context if needed, use `pickNewSeed` on the new-island path, `?frontier`, dev-readout line, journal witnessed edge.

---

### Task 0: The A/B toggle (`chains` flag)

**Files:**
- Create: `src/game/flags.ts`
- Test: `tests/flags.test.ts`

**Interfaces:**
- Produces: `CHAINS_KEY = "wander.chains"`; `resolveChains(param: string | null, stored: string | null): boolean` — URL param wins (`"1"`/`"0"`/`"true"`/`"false"`), else stored, else default **true**.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { CHAINS_KEY, resolveChains } from "../src/game/flags";

test("chains default on when nothing is set", () => {
  expect(resolveChains(null, null)).toBe(true);
});
test("a stored choice is honored", () => {
  expect(resolveChains(null, "0")).toBe(false);
  expect(resolveChains(null, "1")).toBe(true);
});
test("a URL param overrides the stored choice", () => {
  expect(resolveChains("0", "1")).toBe(false);
  expect(resolveChains("1", "0")).toBe(true);
  expect(resolveChains("false", null)).toBe(false);
});
test("the storage key is stable", () => {
  expect(CHAINS_KEY).toBe("wander.chains");
});
```

- [ ] **Step 2: Run test — expect FAIL** (`resolveChains is not a function`). `npx vitest run tests/flags.test.ts`
- [ ] **Step 3: Implement `resolveChains`** — parse `"1"/"true"` → true, `"0"/"false"` → false, param first then stored then `true`.
- [ ] **Step 4: Run test — expect PASS.**
- [ ] **Step 5: Commit** (`feat: A/B toggle for byproduct chains (wander.chains, default on)`).

---

### Task 1: `Substrate` type, `Flora.substrates`, `addSubstrate` (flag-gated)

**Files:**
- Modify: `src/life/flora.ts`
- Test: `tests/substrate.test.ts`

**Interfaces:**
- Produces:
  - `interface Substrate { x: number; y: number; hue: number; glow: number; form: PlantForm; born: number; }`
  - `Flora.substrates: Substrate[]` (public readonly-ish list)
  - `Flora.addSubstrate(x: number, y: number, sig: { hue: number; glow: number; form: PlantForm }): void` — pushes a `Substrate` stamped with `this.tick` when `this.tuning.chains`; **no-op when chains off**. Draws no rng.
  - `FloraTuning.chains: boolean` (default **false** in `DEFAULT_TUNING`, so tests/other callers are unchanged; `main.ts` sets it true when the toggle is on).
- Consumes: `PlantForm` (genome.ts), existing `this.tick`, `this.tuning`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { generate } from "../src/world/generate";

function flora(chains: boolean) {
  const map = generate(42);
  return new Flora(map, generatePlantSpecies(42), 42, { chains });
}
const sig = { hue: 0.4, glow: 0.7, form: PlantForm.Moss };

test("addSubstrate stamps the meal's signature when chains are on", () => {
  const f = flora(true);
  f.addSubstrate(100, 120, sig);
  expect(f.substrates).toHaveLength(1);
  expect(f.substrates[0]).toMatchObject({ x: 100, y: 120, hue: 0.4, glow: 0.7, form: PlantForm.Moss });
  expect(f.substrates[0].born).toBe(f.tick);
});
test("addSubstrate is a no-op when chains are off (the A/B baseline)", () => {
  const f = flora(false);
  f.addSubstrate(100, 120, sig);
  expect(f.substrates).toHaveLength(0);
});
```

- [ ] **Step 2: Run — expect FAIL** (`substrates` undefined / not a function).
- [ ] **Step 3: Implement** the interface, list, `addSubstrate`, and `chains: false` in `DEFAULT_TUNING`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** (`feat: Substrate primitive on Flora (flag-gated, inert by default)`).

---

### Task 2: Roll `substrateFeeder` on species (separate rng stream)

**Files:**
- Modify: `src/life/species.ts`
- Test: `tests/substrate-feeder.test.ts`

**Interfaces:**
- Produces:
  - `PlantSpecies.substrateFeeder?: boolean`
  - `rollSubstrateFeeders(seed: number, species: PlantSpecies[]): void` — mutates species in place, setting `substrateFeeder` from `makeRng(seed ^ 0x5b1e)` (a NEW salt), with per-form base probability: Moss/Fungus/Sporestalk `0.7`, Fern/Vine/Reed `0.2`, others `0.06`.
  - Call `rollSubstrateFeeders(seed, out)` at the END of `generatePlantSpecies` (after the sport pass), so it never shifts the main stream.

**CRITICAL:** Use only the salted stream. Do not add any `rng()` call to the existing body of `generatePlantSpecies`.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from "vitest";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";

test("existing generation is byte-identical (names + archetypes unchanged)", () => {
  // Guard: this array is the seed-42 species names BEFORE this task. Fill it
  // by running `generatePlantSpecies(42).map(s => s.name)` on HEAD first.
  const before = /* PASTE seed-42 names captured on HEAD */ [] as string[];
  const after = generatePlantSpecies(42).map((s) => s.name);
  if (before.length) expect(after).toEqual(before);
});
test("substrateFeeder is deterministic and biased to pioneer forms", () => {
  const a = generatePlantSpecies(2438).map((s) => s.substrateFeeder);
  const b = generatePlantSpecies(2438).map((s) => s.substrateFeeder);
  expect(a).toEqual(b); // deterministic
  // across many seeds, pioneer forms are feeders far more often than others
  let pioneerFeed = 0, pioneerTot = 0, otherFeed = 0, otherTot = 0;
  const pioneer = new Set([PlantForm.Moss, PlantForm.Fungus, PlantForm.Sporestalk]);
  for (let s = 0; s < 60; s++) {
    for (const sp of generatePlantSpecies(s)) {
      const isP = pioneer.has(sp.archetype.form);
      if (isP) { pioneerTot++; if (sp.substrateFeeder) pioneerFeed++; }
      else { otherTot++; if (sp.substrateFeeder) otherFeed++; }
    }
  }
  expect(pioneerFeed / pioneerTot).toBeGreaterThan(otherFeed / otherTot + 0.3);
});
```

- [ ] **Step 2: Capture the `before` names on HEAD** (`node`/a scratch test) and paste into the guard, then run — expect the bias test to FAIL (no `substrateFeeder` yet).
- [ ] **Step 3: Implement `rollSubstrateFeeders`** off the salted stream; call at end of `generatePlantSpecies`.
- [ ] **Step 4: Run — expect PASS** (identity guard green proves the main stream is untouched).
- [ ] **Step 5: Commit** (`feat: roll substrateFeeder per species off a salted stream`).

---

### Task 3: Emission — a disperser drops substrate where it fed

**Files:**
- Modify: `src/life/fauna.ts` (`updateCritter`, the `nibble`-lands block ~683-687)
- Test: `tests/substrate-emit.test.ts`

**Interfaces:**
- Consumes: `Flora.addSubstrate`, `c.meal.genome` (`{hue, glow, form}`).
- Change: in the `state === "nibble"` completion, where `sp.role === "grazer" ? flora.nibble : flora.propagate`, add — for **dispersers only** — `flora.addSubstrate(c.x, c.y, c.meal.genome)` right after `flora.propagate(c.meal)`. (Grazers emit nothing in v1.) `addSubstrate` self-gates on the flag, so no branch on the flag here and no rng draw.

- [ ] **Step 1: Write the failing test** — build a disperser + a matching plant (reuse `tests/unstick.test.ts`'s `deer` helper pattern), drive it to `nibble` completion on a `chains:true` flora, assert a substrate appears carrying the plant's `{hue, glow, form}`; on a grazer, none; with `chains:false`, none. (Set `c.state="nibble"`, `c.meal=<plant>`, `c.stateTime=0`, one `updateCritter` tick.)
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the one-line emission on the disperser branch.
- [ ] **Step 4: Run — expect PASS.** Also run `tests/graze.test.ts`, `tests/propagate.test.ts` — expect still green (grazer path untouched; disperser path adds an rng-free call).
- [ ] **Step 5: Commit** (`feat: dispersers drop trait-tagged substrate where they feed`).

---

### Task 4: Germination + decay in `simTick`

**Files:**
- Modify: `src/life/flora.ts` (`simTick`)
- Test: `tests/substrate-germinate.test.ts`

**Interfaces:**
- Produces: `Flora.germinations: number` (running count, for the dev readout). New constants in `flora.ts`: `SUBSTRATE_LIFETIME = 150`, `SUBSTRATE_HUE_MATCH = 0.12`, `SUBSTRATE_GERMINATE_CHANCE = 0.04` (per live substrate per tick a matching feeder tries), `SUBSTRATE_FEEDER_SCATTER = 1.0` (knob, unused in v1 math beyond ×1).
- Behavior in `simTick`, gated `if (this.tuning.chains && this.substrates.length)`:
  1. **Decay:** drop substrates with `this.tick - born >= SUBSTRATE_LIFETIME`.
  2. **Germination:** for each live substrate, with prob `SUBSTRATE_GERMINATE_CHANCE`, pick a substrate-feeder species `S` whose `|hueWrap(S.archetype.hue - substrate.hue)| <= SUBSTRATE_HUE_MATCH` **and** whose habitat matches the substrate's tile; `addPlant(S.id, S.archetype-drifted, x, y, tick)`. On success, consume that substrate. Reuse `hueWrap` logic like `appetite` (`min(d, 1-d)`).
- **Determinism guard:** the whole block is skipped (no rng) when chains off or no substrates — so seeds with no chain activity are byte-identical.

- [ ] **Step 1: Write failing tests** covering: (a) a feeder germinates on a hue-MATCH substrate within N ticks; (b) does NOT on a hue-MISMATCH substrate; (c) germination respects `addPlant` (full tile / wrong habitat → no plant, substrate may linger then decay); (d) an unfed substrate is gone after `SUBSTRATE_LIFETIME`; (e) **determinism** — two floras, same seed + same scripted substrate emissions → identical plant/substrate sequence; (f) **no-substrate identity** — a `chains:true` flora with zero substrates produces the same `simTick` result (plant positions) as a `chains:false` flora over K ticks (proves no stray rng).
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** decay + germination + `germinations` counter.
- [ ] **Step 4: Run — expect PASS.** Run full `tests/flora.test.ts` + `tests/propagate.test.ts` — green.
- [ ] **Step 5: Commit** (`feat: substrate decay + hue-matched germination in simTick`).

---

### Task 5: `chainStats` + `diversityScore` (pure scoring)

**Files:**
- Create: `src/life/foodweb.ts`
- Test: `tests/foodweb.test.ts`

**Interfaces:**
- Produces:
  - `interface ChainStats { chains: number; closable: number; redundancy: number; }`
  - `chainStats(plants: PlantSpecies[], critters: CritterSpecies[]): ChainStats` — pure. A **link** = a disperser critter `D` with `appetite(D.palate, P.archetype) > APPETITE_MIN` for plant `P`, AND a substrate-feeder `S` (S.substrateFeeder) with hue within `SUBSTRATE_HUE_MATCH` of `P.archetype.hue` and matching habitat. `chains` = count of such (P, hue-band) links; `closable` = links whose `S` is itself eaten by some disperser (chain continues); `redundancy` = average occupants per filled role/hue-band (≥1; higher = more backup).
  - `diversityScore(seed: number): number` — generate `plants = generatePlantSpecies(seed)` (+ crater endemics if any) and `critters` for the seed (build a throwaway `Flora` for dens, then `generateCritterSpecies`), then return a scalar combining `chains` and `redundancy` (e.g. `chains + 2*(redundancy-1)` — reward backup, per spec §Resilience "minimum viable = chains WITH backup, not a raw count").
  - `pickNewSeed(rollSeed: () => number, opts: { floor: number; candidates: number; frontier: boolean }): number` — pure given `rollSeed`: if `frontier`, return `rollSeed()` once (no floor). Else roll up to `candidates`, return the first with `diversityScore ≥ floor`, else the best seen. (Inject `rollSeed` so the test is deterministic.)
- Consumes: `generatePlantSpecies`, `generateCritterSpecies`, `Flora`, `appetite`, `APPETITE_MIN`, `SUBSTRATE_HUE_MATCH`.

- [ ] **Step 1: Write failing tests** — (a) `diversityScore(2438)` (the pinned legendary "Polpol Skerry") is high (`> 30`); a known-flat seed is low; (b) `chainStats` counts a hand-built plants+critters fixture correctly (one disperser eating a flower + one moss feeder in the flower's hue-band → `chains ≥ 1`); redundancy rises when two feeders share the band; (c) `pickNewSeed` with a stub `rollSeed` cycling `[flatSeed, richSeed]` and `floor` between them returns `richSeed`; with `frontier:true` returns the first roll regardless.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** `foodweb.ts`.
- [ ] **Step 4: Run — expect PASS.** (If `diversityScore(2438)` isn't `>30`, re-check hue-band + role logic against the study doc `docs/superpowers/research/food-web-and-byproducts.md` before adjusting the threshold.)
- [ ] **Step 5: Commit** (`feat: chainStats + diversityScore + pickNewSeed (pure food-web scoring)`).

---

### Task 6: Wire the flag, emission context, new-island search, and frontier into `main.ts`

**Files:**
- Modify: `src/game/main.ts`

**Interfaces:**
- Consumes: `resolveChains` (flags.ts), `pickNewSeed`/`diversityScore` (foodweb.ts).
- Changes:
  - Resolve the flag once at load: `const CHAINS = resolveChains(url.get("chains"), localStorage.getItem(CHAINS_KEY)); localStorage.setItem(CHAINS_KEY, CHAINS ? "1" : "0");`
  - Pass `chains: CHAINS` in the `floraTuning` object at both `new Flora(...)` sites in `loadWorld`.
  - `?frontier` → `const FRONTIER = url.has("frontier")`.
  - Replace the `randomSeed()` calls on the **new-island** path (the `R` handler ~918 and the initial `loadWorld(seedFromUrl() ?? randomSeed())` ONLY when there's no explicit seed) with `pickNewSeed(randomSeed, { floor: DIVERSITY_FLOOR, candidates: SEED_CANDIDATES, frontier: FRONTIER })` when `CHAINS`. **Do NOT** route `?seed=`, the picker, or saved worlds through it.

- [ ] **Step 1:** Manual verification via `npm run shot` (main.ts is the untested monolith): `npm run shot -- "seed=2438&warm=400&chains=1" shots/chains-on.png` and `...&chains=0 shots/chains-off.png`. Confirm no crash and (chains on, warmed) substrate patches appear near fed plants.
- [ ] **Step 2:** Verify `?seed=42&chains=0` loads seed 42 exactly (seed-label reads 42) — explicit seeds bypass the search.
- [ ] **Step 3: Commit** (`feat: wire chains flag, seed-search, and frontier into world load`).

---

### Task 7: Render substrates (legibility — part of v1)

**Files:**
- Modify: `src/render/renderer.ts` (and `src/render/tiles.ts` if a ground overlay fits better)
- Verify: `npm run shot`

**Interfaces:**
- Consumes: `flora.substrates` (each `{x, y, hue, glow}`).
- Draw each substrate as a faint, soft-edged tinted ground patch in its `hue` (a low-alpha radial blob ~half a tile), brightened slightly when `glow > 0.6` so glowing byproducts read at night. Must sit UNDER plants/critters. Follow the existing renderer's world→screen transform and draw order.

- [ ] **Step 1:** Implement the draw pass; gate on `flora.substrates.length`.
- [ ] **Step 2:** `npm run shot -- "seed=2438&warm=400&chains=1" shots/substrate.png` — Read the PNG; confirm faint tinted patches are visible on the ground near dispersers/feeders and DON'T occlude sprites. Iterate on alpha/size until it reads as "something is happening here," not noise.
- [ ] **Step 3: Commit** (`feat: render substrate as a faint tinted ground tell`).

---

### Task 8: Dev readout line + journal witnessed edge

**Files:**
- Modify: `src/game/main.ts` (`renderDev` ~213; the witnessed-edge machinery)
- Test: none new for the DOM readout (verify by `` ` `` in a shot); reuse existing journal-edge tests as the pattern.

**Interfaces:**
- `renderDev`: add a line when `CHAINS` — `chains: <flora.substrates.length> substrates · <flora.germinations> sprouted · score <diversityScore(currentSeed)>`. (Cache `diversityScore(currentSeed)` per island like `devTileComposition` does, so it isn't recomputed each frame.)
- Journal: when the player is still/slow near a germination event, record a witnessed link ("moss sprouts where the ambler has fed"), reusing the existing witnessed-edge path (see memory: `WeakMap<Critter,Plant>` anti-spam in `main.ts`). Keep it OFF when chains off.

- [ ] **Step 1:** Add the dev-readout line (cached score). `npm run shot -- "seed=2438&warm=400&chains=1" shots/dev.png "\`"` — confirm the line renders with sane numbers.
- [ ] **Step 2:** Wire the journal witnessed edge on germination near a still player.
- [ ] **Step 3: Commit** (`feat: surface chains in the dev readout + witnessed journal edge`).

---

### Task 9: Pin the legendary demo seed as an emergence test

**Files:**
- Test: `tests/chains-emerge.test.ts`

**Interfaces:** Consumes the whole stack (Flora with `chains:true`, critters, `simTick`).

- [ ] **Step 1: Write the test** — on seed **2438**, build a `chains:true` world (plants + critters), simulate N sim-ticks WITH critter feeding driving emission (advance critters and `flora.simTick` together, as the game loop does), and assert: a multi-link chain forms — i.e. `flora.germinations > 0` and at least one germinated plant is itself eaten (a substrate of a feeder's form/hue appears). On a flat seed, assert few/none within the same N. This proves emergence tracks the seed, not authored chains.
- [ ] **Step 2: Run — expect PASS** (after Tasks 1-4). If flaky, raise N or seed the critter rng deterministically.
- [ ] **Step 3: Commit** (`test: chains emerge on seed 2438, stay flat on a flat seed`).

---

## Self-Review

- **Spec coverage:** R1 emission → Task 3. R2 germination-on-match → Task 4. R3 decay → Task 4. R4 automatic closure → falls out (Task 3 emits from any eaten plant incl. germinated ones; Task 9 proves it). Legibility (render + dev readout + journal) → Tasks 7, 8. `diversityScore` + rejection sampling + frontier → Tasks 5, 6. Resilience/redundancy metric → Task 5 (`redundancy` in `chainStats`, folded into `diversityScore`). A/B toggle → Task 0, threaded in Tasks 1, 6. Legendary seed 2438 pinned → Task 9. Determinism → Global Constraints + Tasks 2, 4 identity tests.
- **Deferred (v2, per spec):** trait-conduit (hue re-emission), plant spore-fall, grazer byproducts, Mission-mode hiding, pollinator flower-tinting, disease-on-monoculture balancer. Not in this plan.
- **Type consistency:** `chains: boolean` on `FloraTuning`; `addSubstrate(x,y,sig)` sig `{hue,glow,form}`; `substrateFeeder?: boolean` on `PlantSpecies`; `chainStats`/`diversityScore`/`pickNewSeed` signatures fixed in Task 5 and consumed unchanged in Task 6/8.
- **Risk — monoculture amplification / performance:** substrate count is bounded by decay (Task 4) + `addPlant` caps; measure substrate count in the seed-2438 shot. The disease balancer (its natural pair) is explicitly deferred.
