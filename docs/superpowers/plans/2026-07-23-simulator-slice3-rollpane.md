# The Simulator — Slice 3: the roll pane (species lab) + the drawer (species roster) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the World-Lab's **species lab** (per `docs/superpowers/specs/2026-07-21-simulator-design.md` §"The Simulator UI — v1" — the **roll pane** and **the drawer** items — and §"Build order within v1" item 3), extending the slice-1/2 bench (`src/game/worldlab.ts`, already shipped). Two joined surfaces:

1. **The roll pane** — pick a kind (critter OR plant), **roll a batch** of ~9–12 from a *seeded* stream into a **grid of live sprite thumbnails** (drawn by the existing `plantSprites.ts` / `critterSprites.ts`), **pick** ones onto the bench palette (they become placeable kinds the kernel accepts), and **iterate** a pick — *looks* (re-roll / nudge the morph & genome; thumbnails re-render) and *traits* (a critter's palate / role / size; a plant's habitat / reseed). "Roll a bunch, pick one, iterate."
2. **The drawer (roster)** — every kind you introduce (rolled-and-picked, or a starter) is stamped in with **live status**: **number in play** (from `speciesCounts` / a critter tally), **variations** (iterated looks + auto-captured emergent daughters ✧), and an **extinct** mark when the count hits zero. Manage it: **delete** a kind (clears its live instances; the definition is kept) or **bring it back** (re-spawn from the stored definition). The drawer **auto-captures emergent daughters** (✧) as first-class entries.

**Architecture:** The pure, testable core is two new modules, mirroring how slices 1–2 split `simRoster.ts` / `simBrush.ts` out of the DOM-heavy bench:

- **`src/life/roll.ts`** — the dice. A **seeded** batch roll of fresh plant/critter *kinds*, plus the looks/traits nudges. It **reuses the tested whole-roster generators** — `generatePlantSpecies(seed)` and `generateCritterSpecies(seed, map, scratchFlora, plants)` — exactly as the spec's Manipulation API endorses (`rollPlantSpecies`/`rollCritterSpecies` = "reuse the species-roster generator + `generateCritterSpecies`"), drawing a *per-roll roster* and slicing individual members into the batch. `nudgePlantLooks` = `mutate(archetype)`; `nudgeCritterLooks` re-rolls the four body numbers → `morphOf(...)`; `setPlantTraits`/`setCritterTraits` patch habitat/reseed and palate/role/size. **No genome math or sprite rendering is re-implemented** — it composes `mutate`/`morphOf`/`generatePlantSpecies`/`generateCritterSpecies`, all already exported.
- **`src/game/simDrawer.ts`** — the roster model. A `DrawerEntry` per introduced kind holds a **deep-cloned full definition** (for revive), an origin (`starter`/`rolled`/`daughter`), a parent link, an iterated-looks counter, and a `peak`. Pure functions compute **status** (`count` / `extinct` = peak>0 && count==0 / `variations`), **capture daughters** (scan `kernel.plantSpecies` for `parent!==undefined` records not yet entries), and **delete/revive** (a tombstone that preserves the def). Instance add/remove is a kernel op (below); the drawer model itself is pure.

Three genuinely tricky seams the code must respect (see **API-friction notes**):

- **Species ids are array indices.** `placePlant(id)` / `placeCritter(id)` / `flora.addPlant(species,…)` index `kernel.plantSpecies[id]` / `critterSpecies[id]`, and flora's own speciation appends daughters at `speciesList.length`. So a rolled kind gets its id **only when picked** — the kernel **appends** it (id = array length) and Flora sees it live (same array reference). A rolled candidate carries a **provisional id (-1)** until then, and **delete never splices** (that would renumber every later kind + every placed plant's `.species`) — it clears live instances and tombstones the record.
- **Critter thumbnails must dodge the id-cache.** `getCritterSprites(sp)` is cached by `sp.id`; rolling many candidates (id -1, or reusing ids) would collide. The roll pane draws candidate critters with the **uncached `critterPortrait({bodyHue,earLen,tailLen,size})`** (from `critterSprites.ts`), which renders the same morph off the four body numbers with no id. Plants use `getPlantSprite(genome)` (cached by genome-derived `phenoKey`, so distinct archetypes never collide).
- **Daughter events carry no id.** `flora.takeEvents()` returns `{name,parentName,x,y,tick}` — the human-readable flash — but the daughter *record* is appended to `kernel.plantSpecies` with `parent!==undefined`. The drawer captures daughters by **scanning that array** for `parent`-bearing records not yet entries (daughters are plant-only; this engine has no critter speciation).

Everything else is UI wiring inside `worldlab.ts`: a roll-pane panel (kind toggle · roll · thumbnail grid · iterate controls) and a drawer panel (entries with live status · delete/revive), both consuming the codex `:root` tokens already used in `buildChrome`. Kernel gains small **additive, Simulator-only** methods (`introducePlantSpecies`/`introduceCritterSpecies`/`clearPlantInstances`/`clearCritterInstances`/`critterCountOf`) — `kernel.ts` is imported only by `worldlab.ts` + tests, so this touches no real-world path.

**Tech Stack:** TypeScript, Vite, Vitest (node env — `roll.ts` and `simDrawer.ts` are pure, no DOM: thumbnails are rendered only in the browser bench). Pure logic (`roll.ts`, `simDrawer.ts`, the kernel additions) is TDD'd; the roll-pane/drawer UI is screenshot-verified via `node scripts/shot.mjs "sim=1…"` with deterministic display-only dev-aids (`?roll=`, `?rollpick=`, `?iterate=`, `?drawerdemo=`), the same "logic tested, pixels shot" practice slices 1–2 established (the harness presses keys, not canvas coordinates, so an on-load aid seeds the result).

## Global Constraints

- **Determinism:** rolling draws from a **seeded** stream — `makeRng(rollSeedFor(baseSeed, kind, cursor))`, never `Math.random`. Same `(baseSeed, kind, cursor)` ⇒ byte-identical batch; **re-roll advances the cursor** (a fresh, still-reproducible batch). The iterate nudges take an explicit seeded `Rng`. **No `Math.random` / `Date.now` / `new Date()`** in `roll.ts`, `simDrawer.ts`, the kernel additions, or any bench *roll/drawer* logic. Placement of picked kinds still flows through the seeded kernel (`placePlant`/`placeCritter`, slice-1 `placeRng`). The bench render/pointer loop MAY read the rAF `timeMs` for animation — view-only, never sim input.
- **Peaceful pillar:** deleting a kind is a **roster op, not a violent kill** — it clears the kind's live instances so its population falls to zero (the spec's own "populations rise and fall" / "extinct → bring it back" framing), while the **definition is preserved in the drawer** and can be re-spawned. Reviving re-spawns from the stored definition. The slice-1 invariant that **`step()` never births or removes a critter** still holds unchanged (delete/revive are explicit user roster actions outside the step loop, exactly as `placeCritter` is) — guard it with a test that `step()` leaves `critterCount()` invariant even with rolled/daughter kinds present.
- **Reuse, don't fork:** render thumbnails via the existing `getPlantSprite` (`plantSprites.ts`) / `critterPortrait` (`critterSprites.ts`); mutate genomes via `genome.ts` `mutate`; derive critter looks via `morphOf`; roll fresh kinds via `generatePlantSpecies` / `generateCritterSpecies`. **Do NOT re-implement** sprite rendering, genome math, or species generation. Introduced kinds slot into `kernel.plantSpecies`/`critterSpecies` + the slice-1/2 palette + `placeablePlants` gating cleanly (via the new kernel `introduce*` methods). Reuse `worldlab.ts`'s `buildChrome` helpers (`btn()`/`MONO`/`group()`/`label()`/`sep()`), the slice-1 `placeablePlants`/`habitatsOf` gating, and slice-1's screen→world→tile mapping for placement.
- **Real worlds untouched:** Simulator-only. New files: `src/life/roll.ts`, `src/game/simDrawer.ts`, their tests, and UI in `src/game/worldlab.ts`. The only edits to a shared-*looking* file are **additive methods on `src/life/kernel.ts`** — which is imported solely by `worldlab.ts` + tests (verified), so ordinary play and `?sim=swarm` stay byte-identical. **No change** to `species.ts` / `fauna.ts` / `flora.ts` / `main.ts` — all consumed read-only through existing exports. Guarded by the still-green slice-1 `parseSimMode` test + a guard shot.
- **Art:** every new panel consumes the naturalist's-codex `:root` tokens already in `worldlab.ts` (no hardcoded chrome hexes); the daughter mark reuses the spec's `✧`. Copy is lowercase and evocative.
- **Incremental:** (a) roll-pane MVP (roll a batch → grid → pick), (b) iterate looks/traits on a pick, (c) the drawer (live status + delete/revive + daughter auto-capture). Each task ends in a green test or a read screenshot.
- **Commits:** frequent; end every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Verify before "done":** `npm run check` (tsc) clean · `npx vitest run` green · `npm run build` clean.

**Out of scope for slice 3 (later slices — noted as deferred):** the **evolutionary layer** — pressures panel, richness/wildness meter, roll-a-foodchain/web, pin-a-phenotype-to-reseed (slice 4); **save/resume to a slot** + full-critter-state/RNG persistence (slice 5); the **ambient bench** + the **title-screen live backdrop**. Iterating an *already-picked-and-placed* kind's looks in place (which would need `clearCritterSpriteCache()` — see friction notes) is out of scope: slice-3 iterate operates on the roll-pane **candidate** before it is picked.

---

### Task 1: The dice — a seeded batch roll + the looks/traits nudges (TDD, pure)

The testable heart of the roll pane: a deterministic batch of fresh plant/critter kinds off a seeded cursor, and the pure iterate transforms. Reuses the whole-roster generators + `mutate`/`morphOf` — no genome/species logic re-implemented. Pure (node env, no DOM, no `Math.random`), so the dice are proven before any pixels.

**Files:**
- Create: `src/life/roll.ts`
- Test: `tests/roll.test.ts`

**Interfaces:**
- Consumes: `Rng`, `makeRng` (`../core/rng`); `Flora` (`./flora`); `CritterRole`, `CritterSpecies`, `Palate`, `generateCritterSpecies`, `morphOf` (`./fauna`); `Genome`, `mutate` (`./genome`); `PlantSpecies`, `generatePlantSpecies` (`./species`); `Tile`, `WorldMap` (`../world/types`).
- Produces:
  - `type RollKind = "plant" | "critter"`; `const PROVISIONAL_ID = -1`.
  - `rollSeedFor(base, kind, cursor): number` — the deterministic per-roll seed.
  - `rollPlantBatch(base, cursor, count, opts?: { habitats?: ReadonlySet<Tile> }): PlantSpecies[]`.
  - `rollCritterBatch(base, cursor, count, plants: PlantSpecies[], map: WorldMap): CritterSpecies[]`.
  - `nudgePlantLooks(sp, rng, amount?): PlantSpecies`; `nudgeCritterLooks(sp, rng, amount?): CritterSpecies`.
  - `setPlantTraits(sp, patch: { habitat?; substrateFeeder? }): PlantSpecies`; `setCritterTraits(sp, patch: { role?; size?; palate? }): CritterSpecies`.

- [ ] **Step 1: Write the failing tests** — `tests/roll.test.ts`:

```ts
import { expect, test } from "vitest";
import {
  PROVISIONAL_ID, nudgeCritterLooks, nudgePlantLooks, rollCritterBatch,
  rollPlantBatch, rollSeedFor, setCritterTraits, setPlantTraits,
} from "../src/life/roll";
import { generatePlantSpecies } from "../src/life/species";
import { morphOf } from "../src/life/fauna";
import { singleBiome, biomeSampler } from "../src/world/construct";
import { Tile } from "../src/world/types";
import { makeRng } from "../src/core/rng";

const SEED = 4242;

// a compact, comparable fingerprint of a batch (order + the fields that read)
const plantSig = (b: { name: string; habitat: number; archetype: { form: number; hue: number } }[]) =>
  b.map((s) => [s.name, s.habitat, s.archetype.form, Math.round(s.archetype.hue * 1e4)]);
const critterSig = (b: { name: string; size: number; role: string; morph: { plan: string } }[]) =>
  b.map((s) => [s.name, Math.round(s.size * 1e3), s.role, s.morph.plan]);

test("rollSeedFor is deterministic and cursor-sensitive", () => {
  expect(rollSeedFor(SEED, "plant", 0)).toBe(rollSeedFor(SEED, "plant", 0));
  expect(rollSeedFor(SEED, "plant", 0)).not.toBe(rollSeedFor(SEED, "plant", 1));
  expect(rollSeedFor(SEED, "plant", 0)).not.toBe(rollSeedFor(SEED, "critter", 0));
});

test("a plant batch is deterministic, right-sized, and provisional-id", () => {
  const a = rollPlantBatch(SEED, 0, 10);
  const b = rollPlantBatch(SEED, 0, 10);
  expect(a.length).toBe(10);
  expect(plantSig(a)).toEqual(plantSig(b)); // same seed+cursor ⇒ identical batch
  expect(a.every((s) => s.id === PROVISIONAL_ID)).toBe(true); // no real id until picked
});

test("re-roll (cursor+1) advances to a different batch", () => {
  expect(plantSig(rollPlantBatch(SEED, 0, 10))).not.toEqual(plantSig(rollPlantBatch(SEED, 1, 10)));
});

test("a habitat filter yields only placeable-habitat plant kinds", () => {
  const batch = rollPlantBatch(SEED, 0, 8, { habitats: new Set([Tile.Grass]) });
  expect(batch.length).toBeGreaterThan(0);
  expect(batch.every((s) => s.habitat === Tile.Grass)).toBe(true);
});

test("a critter batch is deterministic, right-sized, provisional-id, off-map den", () => {
  const map = biomeSampler(SEED);
  const plants = generatePlantSpecies(SEED);
  const a = rollCritterBatch(SEED, 0, 12, plants, map);
  const b = rollCritterBatch(SEED, 0, 12, plants, map);
  expect(a.length).toBe(12);
  expect(critterSig(a)).toEqual(critterSig(b));
  expect(a.every((s) => s.id === PROVISIONAL_ID && s.den.x === -1)).toBe(true);
  expect(a.every((s) => s.favoriteSpecies >= 0 && s.favoriteSpecies < plants.length)).toBe(true);
});

test("nudgePlantLooks drifts the genome but keeps form/habitat/id; the morph re-renders", () => {
  const [sp] = rollPlantBatch(SEED, 0, 1);
  const rng = makeRng(1);
  const out = nudgePlantLooks(sp, rng, 0.2);
  expect(out.archetype.form).toBe(sp.archetype.form); // form is structural, never mutates
  expect(out.habitat).toBe(sp.habitat);
  expect(out.id).toBe(sp.id);
  expect(out.archetype.hue).not.toBe(sp.archetype.hue); // looks changed
  expect(out.archetype).not.toBe(sp.archetype); // a fresh genome, not the same ref
});

test("nudgeCritterLooks re-rolls the body numbers → a fresh morph, same size", () => {
  const map = singleBiome(SEED, Tile.Grass, 32);
  const [sp] = rollCritterBatch(SEED, 0, 1, generatePlantSpecies(SEED), map);
  const out = nudgeCritterLooks(sp, makeRng(9), 0.3);
  expect(out.size).toBe(sp.size); // size is a TRAIT, untouched by a looks nudge
  expect(out.morph).toEqual(morphOf({ bodyHue: out.bodyHue, earLen: out.earLen, tailLen: out.tailLen, size: out.size }));
  expect(out.bodyHue).not.toBe(sp.bodyHue);
});

test("setCritterTraits patches role/size/palate and re-derives morph on a size change", () => {
  const map = singleBiome(SEED, Tile.Grass, 32);
  const [sp] = rollCritterBatch(SEED, 0, 1, generatePlantSpecies(SEED), map);
  const grazed = setCritterTraits(sp, { role: "grazer", size: 1.4 });
  expect(grazed.role).toBe("grazer");
  expect(grazed.size).toBeCloseTo(1.4);
  expect(grazed.morph).toEqual(morphOf({ bodyHue: sp.bodyHue, earLen: sp.earLen, tailLen: sp.tailLen, size: 1.4 }));
  expect(grazed.bodyHue).toBe(sp.bodyHue); // looks untouched
  const clamped = setCritterTraits(sp, { size: 99 });
  expect(clamped.size).toBeLessThanOrEqual(1.6); // size clamped to the legal band
});

test("setPlantTraits patches habitat + reseed flag only", () => {
  const [sp] = rollPlantBatch(SEED, 0, 1);
  const out = setPlantTraits(sp, { habitat: Tile.Marsh, substrateFeeder: true });
  expect(out.habitat).toBe(Tile.Marsh);
  expect(out.substrateFeeder).toBe(true);
  expect(out.archetype.form).toBe(sp.archetype.form); // looks untouched
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/roll.test.ts` → FAIL (`src/life/roll.ts` missing).

- [ ] **Step 3: Implement `src/life/roll.ts`:**

```ts
// The species lab's dice — a SEEDED batch roll of fresh plant/critter KINDS,
// plus the looks/traits nudges the roll pane iterates a pick with. Pure and
// deterministic: same (base seed, kind, cursor) ⇒ the same batch, every time;
// re-roll advances the cursor. REUSES the tested whole-roster generators
// (generatePlantSpecies / generateCritterSpecies — the spec's own
// rollPlantSpecies/rollCritterSpecies) by drawing a per-roll roster and slicing
// members out, plus mutate()/morphOf() for the iterate paths. Nothing here
// re-implements genome math, species generation, or sprite rendering; the roll
// pane draws each def's thumbnail via getPlantSprite / critterPortrait.

import { makeRng, Rng } from "../core/rng";
import { CritterRole, CritterSpecies, Palate, generateCritterSpecies, morphOf } from "./fauna";
import { Flora } from "./flora";
import { mutate } from "./genome";
import { PlantSpecies, generatePlantSpecies } from "./species";
import { Tile, WorldMap } from "../world/types";

export type RollKind = "plant" | "critter";

// A rolled kind has NO real id until it is PICKED and the kernel appends it
// (id === its array index; see kernel.introduce*). -1 flags "not introduced".
export const PROVISIONAL_ID = -1;

// the size band a menagerie is dealt from (fauna's own SIZE_MIN/MAX are
// private; re-declared here only so a trait patch clamps size into the legal
// range — the values must match fauna's).
const SIZE_MIN = 0.35;
const SIZE_MAX = 1.6;

// A deterministic per-roll seed: the bench seed, the kind, and the roll cursor
// mixed to one integer, so every (base, kind, cursor) triple names its own
// reproducible roster. Re-roll = cursor + 1 → a fresh, repeatable batch.
export function rollSeedFor(base: number, kind: RollKind, cursor: number): number {
  let h = (base | 0) ^ 0x9e3779b1;
  h = Math.imul(h ^ (kind === "plant" ? 0x50a7 : 0xc717), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (cursor | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// A batch of fresh plant KINDS. Reuses generatePlantSpecies (a whole ~24-kind
// roster) off the roll seed and slices the first `count` members, optionally
// filtered to habitats the construct can actually host. Each member is a deep
// copy with a provisional id — a candidate, not yet a real species. Draws
// successive rosters (cursor+1, +2, …) only if a heavy habitat filter starves
// one roster of matches.
export function rollPlantBatch(
  base: number,
  cursor: number,
  count: number,
  opts: { habitats?: ReadonlySet<Tile> } = {},
): PlantSpecies[] {
  const out: PlantSpecies[] = [];
  for (let c = cursor; out.length < count && c < cursor + 8; c++) {
    let roster = generatePlantSpecies(rollSeedFor(base, "plant", c));
    if (opts.habitats) roster = roster.filter((s) => opts.habitats!.has(s.habitat));
    for (const sp of roster) {
      if (out.length >= count) break;
      out.push({ ...sp, id: PROVISIONAL_ID, archetype: { ...sp.archetype } });
    }
  }
  return out;
}

// A batch of fresh critter KINDS. Reuses generateCritterSpecies (5–8 per
// roster) off the roll seed, drawing extra rosters until `count` is reached.
// generateCritterSpecies needs a Flora to read dens from — an EMPTY scratch
// Flora is enough (dens fall back to map.spawn with no plants; we then blank
// the den, matching worldlab's own off-map convention so a candidate never
// dens on spawn). favoriteSpecies indexes `plants`, so the palate is already
// cut from a real plant the bench can place.
export function rollCritterBatch(
  base: number,
  cursor: number,
  count: number,
  plants: PlantSpecies[],
  map: WorldMap,
): CritterSpecies[] {
  const out: CritterSpecies[] = [];
  for (let c = cursor; out.length < count && c < cursor + 8; c++) {
    const seed = rollSeedFor(base, "critter", c);
    const scratch = new Flora(map, plants, seed, {}, { tick: 0, plants: [] });
    for (const sp of generateCritterSpecies(seed, map, scratch, plants)) {
      if (out.length >= count) break;
      out.push({ ...sp, id: PROVISIONAL_ID, den: { x: -1, y: -1 }, palate: { ...sp.palate }, morph: { ...sp.morph } });
    }
  }
  return out;
}

// ── iterate: LOOKS (re-render the thumbnail) ────────────────────────────────

// A plant's looks nudge: drift the genome (mutate keeps `form` — structural —
// and jitters hue/height/petals/… ). Identity fields (name, habitat, id,
// substrateFeeder) carry through, so the same kind simply wears a new coat.
export function nudgePlantLooks(sp: PlantSpecies, rng: Rng, amount = 0.12): PlantSpecies {
  return { ...sp, archetype: mutate(sp.archetype, rng, amount) };
}

// A critter's looks nudge: re-roll the four body numbers (bodyHue wraps the
// wheel; earLen/tailLen clamp 0..1), then re-derive the whole morph via morphOf
// — body plan, crown, tail, eyes, coat all reshuffle from the numbers, which is
// exactly the visible re-roll. Size is a TRAIT (setCritterTraits), so a looks
// nudge holds it fixed and keeps the silhouette's scale.
export function nudgeCritterLooks(sp: CritterSpecies, rng: Rng, amount = 0.15): CritterSpecies {
  const wrap = (v: number) => ((v % 1) + 1) % 1;
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const bodyHue = wrap(sp.bodyHue + (rng() * 2 - 1) * amount);
  const earLen = clamp01(sp.earLen + (rng() * 2 - 1) * amount);
  const tailLen = clamp01(sp.tailLen + (rng() * 2 - 1) * amount);
  const size = sp.size;
  return { ...sp, bodyHue, earLen, tailLen, morph: morphOf({ bodyHue, earLen, tailLen, size }), palate: { ...sp.palate } };
}

// ── iterate: TRAITS (change behaviour/where it lives) ───────────────────────

// A plant's traits: where it lives and whether it reseeds off byproduct chains.
export function setPlantTraits(sp: PlantSpecies, patch: { habitat?: Tile; substrateFeeder?: boolean }): PlantSpecies {
  return {
    ...sp,
    habitat: patch.habitat ?? sp.habitat,
    substrateFeeder: patch.substrateFeeder ?? sp.substrateFeeder,
    archetype: { ...sp.archetype },
  };
}

// A critter's traits: palate (what it favours), role (disperser/grazer), size.
// A size change re-derives the morph (morphOf hashes size), so the body scales
// with it — the one trait that also shifts the look, noted for the roll pane.
export function setCritterTraits(
  sp: CritterSpecies,
  patch: { role?: CritterRole; size?: number; palate?: Partial<Palate> },
): CritterSpecies {
  const size = patch.size !== undefined ? Math.max(SIZE_MIN, Math.min(SIZE_MAX, patch.size)) : sp.size;
  const palate = patch.palate ? { ...sp.palate, ...patch.palate } : { ...sp.palate };
  const morph =
    size !== sp.size ? morphOf({ bodyHue: sp.bodyHue, earLen: sp.earLen, tailLen: sp.tailLen, size }) : sp.morph;
  return { ...sp, size, role: patch.role ?? sp.role, palate, morph };
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/roll.test.ts` → PASS (all nine). If a critter-batch determinism test flakes, the culprit is an unseeded draw — grep `roll.ts` for `Math.random`/`Date` (there are none by construction). If `rollPlantBatch` under-fills with a habitat filter, that construct simply hosts few plant forms — the loop draws more rosters; the test uses grass (well-populated).

- [ ] **Step 5: Commit**

```bash
git add src/life/roll.ts tests/roll.test.ts
git commit -m "feat: the species-lab dice — a seeded batch roll + looks/traits iterate (pure, TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The kernel introduces + clears a kind (TDD, additive, Simulator-only)

The one seam that makes a rolled kind *real*: the kernel appends a picked species (id = array index, so Flora + the palette accept it) and — for delete/revive — clears a kind's live instances without splicing the id-indexed arrays. Additive methods only; `kernel.ts` is Simulator-only (imported by `worldlab.ts` + tests).

**Files:**
- Modify: `src/life/kernel.ts` (add methods; no change to `step`/`placePlant`/`placeCritter`)
- Test: `tests/kernel.test.ts` (extend)

**Interfaces (new on `SimKernel`):**
- `introducePlantSpecies(sp: PlantSpecies): number` — `sp.id = this.plantSpecies.length; this.plantSpecies.push(sp); return sp.id;`
- `introduceCritterSpecies(sp: CritterSpecies): number` — same over `critterSpecies`.
- `clearPlantInstances(id: number): number` — `flora.removePlant` every plant of that species; returns the count cleared.
- `clearCritterInstances(id: number): number` — drop every critter of that species from `this.critters`; returns the count cleared.
- `critterCountOf(id: number): number` — the live tally for one critter kind.

- [ ] **Step 1: Write the failing tests** — append to `tests/kernel.test.ts` (reuse the file's existing `bench()`/`at()` helpers; if `bench()` doesn't expose the rolled batch, build a kind inline via `roll.ts`):

```ts
import { rollPlantBatch, rollCritterBatch } from "../src/life/roll";
// (bench, at, SEED already defined at the top of tests/kernel.test.ts)

test("introducePlantSpecies appends with id === index and Flora accepts it live", () => {
  const { kernel } = bench();
  const before = kernel.plantSpecies.length;
  const [cand] = rollPlantBatch(SEED, 0, 1, { habitats: new Set([Tile.Grass]) });
  const id = kernel.introducePlantSpecies({ ...cand, habitat: Tile.Grass });
  expect(id).toBe(before);
  expect(kernel.plantSpecies[id].id).toBe(id); // id === array index (the invariant Flora relies on)
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  expect(kernel.placePlant(id, at(5), at(5))).not.toBeNull(); // the fresh kind roots
  expect(kernel.speciesCounts().get(id)).toBe(1);
});

test("introduceCritterSpecies appends with id === index; the kind places + steps", () => {
  const { kernel } = bench();
  const before = kernel.critterSpecies.length;
  const [cand] = rollCritterBatch(SEED, 0, 1, kernel.plantSpecies, kernel.map);
  const id = kernel.introduceCritterSpecies({ ...cand });
  expect(id).toBe(before);
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  kernel.placeCritter(id, at(6), at(6));
  expect(kernel.critterCountOf(id)).toBe(1);
  kernel.step(10, "full"); // the new kind updates headless without throwing
  expect(kernel.critterCountOf(id)).toBe(1); // peaceful: step never removes it
});

test("clearPlantInstances / clearCritterInstances zero a kind but keep its record (no splice)", () => {
  const { kernel, grassPlant, critter } = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (let i = 0; i < 4; i++) kernel.placePlant(grassPlant, at(4 + i), at(4));
  kernel.placeCritter(critter, at(7), at(6));
  const plantRecords = kernel.plantSpecies.length;
  const critterRecords = kernel.critterSpecies.length;
  expect(kernel.clearPlantInstances(grassPlant)).toBe(4);
  expect(kernel.clearCritterInstances(critter)).toBe(1);
  expect(kernel.speciesCounts().get(grassPlant) ?? 0).toBe(0); // population → 0
  expect(kernel.critterCountOf(critter)).toBe(0);
  expect(kernel.plantSpecies.length).toBe(plantRecords); // record kept — ids stay stable
  expect(kernel.critterSpecies.length).toBe(critterRecords);
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/kernel.test.ts` → FAIL (new methods missing).

- [ ] **Step 3: Implement — add to `SimKernel` in `src/life/kernel.ts`** (leave existing members untouched):

```ts
  // Append a PICKED plant kind — its id is its array index (the invariant
  // placePlant, Flora.addPlant, and flora speciation all rely on: they index
  // plantSpecies[id]). Flora holds this very array by reference, so the new
  // kind is live the instant it's pushed. Called only from the bench's roll
  // pane, never by step().
  introducePlantSpecies(sp: PlantSpecies): number {
    const id = this.plantSpecies.length;
    sp.id = id;
    this.plantSpecies.push(sp);
    return id;
  }

  introduceCritterSpecies(sp: CritterSpecies): number {
    const id = this.critterSpecies.length;
    sp.id = id;
    this.critterSpecies.push(sp);
    return id;
  }

  // Clear a kind's live instances — its population falls to zero — WITHOUT
  // removing the species record (ids are positional; splicing would renumber
  // every later kind and every placed plant's `.species`). The drawer keeps the
  // definition and can bring it back. Peaceful: a roster op, not a violent kill
  // (the spec's "populations rise and fall"). removePlant maintains
  // speciesCounts, so the count reads 0 afterward.
  clearPlantInstances(id: number): number {
    const doomed = this.flora.all.filter((p) => p.species === id);
    for (const p of doomed) this.flora.removePlant(p);
    return doomed.length;
  }

  clearCritterInstances(id: number): number {
    const before = this.critters.length;
    this.critters = this.critters.filter((c) => c.species !== id);
    return before - this.critters.length;
  }

  critterCountOf(id: number): number {
    let n = 0;
    for (const c of this.critters) if (c.species === id) n++;
    return n;
  }
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/kernel.test.ts` → PASS (existing five + new three). `npm run check` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/life/kernel.ts tests/kernel.test.ts
git commit -m "feat: kernel introduces/clears a rolled kind — id===index, no splice (Simulator-only)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The drawer model — status, delete/revive, daughter capture (TDD, pure)

The roster's brain: a `DrawerEntry` per introduced kind holding a **deep-cloned full definition** (for revive), pure status computation (count / extinct / variations), delete/revive (a tombstone that preserves the def), and daughter auto-capture (scan `plantSpecies` for `parent`-bearing records not yet entries). Pure (node env, no DOM), so the roster logic is proven before the panel.

**Files:**
- Create: `src/game/simDrawer.ts`
- Test: `tests/sim-drawer.test.ts`

**Interfaces:**
- Consumes: `CritterSpecies` (`../life/fauna`); `PlantSpecies` (`../life/species`).
- Produces:
  - `type EntryKind = "plant" | "critter"`; `type EntryOrigin = "starter" | "rolled" | "daughter"`.
  - `interface DrawerEntry { key: string; kind: EntryKind; speciesId: number; name: string; def: PlantSpecies | CritterSpecies; origin: EntryOrigin; parentId?: number; looksIterations: number; peak: number; deleted: boolean; }`
  - `interface EntryStatus { count: number; extinct: boolean; variations: number; }`
  - `cloneDef<T>(def: T): T` — a deep clone (defs are plain JSON-safe data).
  - `makeEntry(args): DrawerEntry` — with a fresh `key`, `def = cloneDef(...)`, `looksIterations: 0`, `peak: 0`, `deleted: false`.
  - `bumpPeak(entry, count): void` — raise `entry.peak` (the only mutation; keeps extinct meaningful).
  - `statusOf(entry, count, entries): EntryStatus` — pure.
  - `captureDaughters(plantSpecies, entries, nextKey): DrawerEntry[]` — the new daughter entries to append.
  - `deleteEntry(entry): DrawerEntry`; `reviveEntry(entry): DrawerEntry` — tombstone toggles, def preserved.

- [ ] **Step 1: Write the failing tests** — `tests/sim-drawer.test.ts`:

```ts
import { expect, test } from "vitest";
import {
  DrawerEntry, bumpPeak, captureDaughters, cloneDef, deleteEntry, makeEntry, reviveEntry, statusOf,
} from "../src/game/simDrawer";
import { rollPlantBatch } from "../src/life/roll";
import { PlantSpecies } from "../src/life/species";
import { Tile } from "../src/world/types";

const SEED = 7;
const plantDef = (id: number, extra: Partial<PlantSpecies> = {}): PlantSpecies => ({
  ...rollPlantBatch(SEED, 0, 1)[0], id, ...extra,
});

test("cloneDef is deep — mutating the live def never touches the stored one", () => {
  const live = plantDef(3);
  const stored = cloneDef(live);
  live.archetype.hue = 0.999;
  live.name = "changed";
  expect(stored.archetype.hue).not.toBe(0.999);
  expect(stored.name).not.toBe("changed");
});

test("statusOf: extinct only after a kind has lived (peak>0) and fallen to 0", () => {
  const e = makeEntry({ kind: "plant", speciesId: 3, def: plantDef(3), origin: "rolled" });
  expect(statusOf(e, 0, [e]).extinct).toBe(false); // never lived yet → not extinct, just new
  bumpPeak(e, 5);
  expect(statusOf(e, 5, [e]).extinct).toBe(false); // alive
  expect(statusOf(e, 0, [e]).extinct).toBe(true); // lived, now gone
});

test("delete/revive round-trip preserves the full definition", () => {
  const def = plantDef(3, { substrateFeeder: true });
  const e = makeEntry({ kind: "plant", speciesId: 3, def, origin: "rolled" });
  const gone = deleteEntry(e);
  expect(gone.deleted).toBe(true);
  const back = reviveEntry(gone);
  expect(back.deleted).toBe(false);
  expect(back.def).toEqual(def); // the stored definition survived intact
});

test("a deleted kind never reads as extinct (it was removed, not lost to the sim)", () => {
  const e = makeEntry({ kind: "plant", speciesId: 3, def: plantDef(3), origin: "rolled" });
  bumpPeak(e, 4);
  const gone = deleteEntry(e);
  expect(statusOf(gone, 0, [gone]).extinct).toBe(false);
});

test("captureDaughters adds first-class entries for parent-bearing records not yet known", () => {
  const picked = makeEntry({ kind: "plant", speciesId: 0, def: plantDef(0), origin: "rolled" });
  // the sim appended a daughter at index 1 (parent = 0) — as flora speciation does
  const speciesList: PlantSpecies[] = [
    plantDef(0),
    plantDef(1, { name: "Ova Bloom ✧", parent: 0, bornTick: 42 }),
  ];
  const fresh = captureDaughters(speciesList, [picked], 100);
  expect(fresh.length).toBe(1);
  expect(fresh[0].origin).toBe("daughter");
  expect(fresh[0].parentId).toBe(0);
  expect(fresh[0].speciesId).toBe(1);
  // idempotent: once captured, it isn't captured again
  expect(captureDaughters(speciesList, [picked, ...fresh], 200).length).toBe(0);
});

test("variations = iterated looks + captured daughters of this kind", () => {
  const parent = makeEntry({ kind: "plant", speciesId: 0, def: plantDef(0), origin: "rolled" });
  parent.looksIterations = 2;
  const daughter = makeEntry({ kind: "plant", speciesId: 1, def: plantDef(1, { parent: 0 }), origin: "daughter", parentId: 0 });
  const entries = [parent, daughter];
  expect(statusOf(parent, 3, entries).variations).toBe(3); // 2 looks + 1 daughter
  expect(statusOf(daughter, 1, entries).variations).toBe(0);
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/sim-drawer.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `src/game/simDrawer.ts`:**

```ts
// The drawer (species roster) — the Sim's cast list, kept as a pure model so
// its status arithmetic and delete/revive/daughter-capture are tested headless;
// the panel in worldlab.ts is only its view. Each entry holds a DEEP-CLONED
// full definition (the spec's "not just a live reference"), so a kind survives
// deletion and can be re-spawned. Daughters (flora's ✧ speciation) are
// auto-captured as first-class entries. Pure: no DOM, no rng, no wall clock.

import { CritterSpecies } from "../life/fauna";
import { PlantSpecies } from "../life/species";

export type EntryKind = "plant" | "critter";
export type EntryOrigin = "starter" | "rolled" | "daughter";

export interface DrawerEntry {
  key: string; // a stable UI key, unique per entry
  kind: EntryKind;
  speciesId: number; // index into kernel.plantSpecies / critterSpecies
  name: string;
  def: PlantSpecies | CritterSpecies; // a deep-cloned full definition, for revive
  origin: EntryOrigin;
  parentId?: number; // for a daughter: the species id it split from
  looksIterations: number; // iterate-looks applied to this kind (a variation count)
  peak: number; // highest population seen — so "extinct" means lived-then-lost
  deleted: boolean; // a delete tombstone; the def is preserved
}

export interface EntryStatus {
  count: number;
  extinct: boolean;
  variations: number;
}

// A deep clone of a plain species record (genome numbers, strings, a nested
// morph/palate/den — all JSON-safe). structuredClone where present, else a
// JSON round-trip. Optional-undefined fields simply drop, which is harmless.
export function cloneDef<T>(def: T): T {
  const sc = (globalThis as { structuredClone?: <U>(v: U) => U }).structuredClone;
  return sc ? sc(def) : (JSON.parse(JSON.stringify(def)) as T);
}

let keySeq = 0;
export function makeEntry(args: {
  kind: EntryKind;
  speciesId: number;
  def: PlantSpecies | CritterSpecies;
  origin: EntryOrigin;
  parentId?: number;
}): DrawerEntry {
  return {
    key: `e${keySeq++}`,
    kind: args.kind,
    speciesId: args.speciesId,
    name: args.def.name,
    def: cloneDef(args.def),
    origin: args.origin,
    parentId: args.parentId,
    looksIterations: 0,
    peak: 0,
    deleted: false,
  };
}

// The only mutation the model makes: track the high-water population so
// "extinct" can mean lived-then-lost, not merely never-placed. Called each
// refresh with the kind's live count.
export function bumpPeak(entry: DrawerEntry, count: number): void {
  if (count > entry.peak) entry.peak = count;
}

// Pure status for one entry against its live count. Extinct = it once lived
// (peak>0) and is now gone (count 0), and wasn't deliberately deleted (a
// tombstone reads as "removed", never "extinct"). Variations = iterated looks
// plus daughters captured under this kind.
export function statusOf(entry: DrawerEntry, count: number, entries: readonly DrawerEntry[]): EntryStatus {
  const daughters = entries.filter((e) => e.origin === "daughter" && e.parentId === entry.speciesId).length;
  return {
    count,
    extinct: !entry.deleted && entry.peak > 0 && count === 0,
    variations: entry.looksIterations + daughters,
  };
}

// The daughters flora has surfaced that the drawer hasn't captured yet: any
// plant species record carrying a `parent` whose id isn't already an entry.
// Daughter events (takeEvents) carry no id, but the daughter RECORD is appended
// to plantSpecies with `parent` set — so we scan the array. Returns the fresh
// entries to append; idempotent once they're in `entries`.
export function captureDaughters(
  plantSpecies: readonly PlantSpecies[],
  entries: readonly DrawerEntry[],
  _nextKey?: number,
): DrawerEntry[] {
  const known = new Set(entries.filter((e) => e.kind === "plant").map((e) => e.speciesId));
  const fresh: DrawerEntry[] = [];
  for (const sp of plantSpecies) {
    if (sp.parent === undefined || known.has(sp.id)) continue;
    fresh.push(makeEntry({ kind: "plant", speciesId: sp.id, def: sp, origin: "daughter", parentId: sp.parent }));
    known.add(sp.id);
  }
  return fresh;
}

// Delete/revive: a tombstone toggle that PRESERVES the stored definition (the
// live instances are cleared by the kernel; the record and this def stay put so
// the id never moves). Immutable-style so callers swap the entry in their list.
export function deleteEntry(entry: DrawerEntry): DrawerEntry {
  return { ...entry, deleted: true };
}
export function reviveEntry(entry: DrawerEntry): DrawerEntry {
  return { ...entry, deleted: false };
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/sim-drawer.test.ts` → PASS (all seven). `npm run check` → 0.

- [ ] **Step 5: Commit**

```bash
git add src/game/simDrawer.ts tests/sim-drawer.test.ts
git commit -m "feat: the drawer model — status/extinct/variations + delete-revive + daughter capture (pure, TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: The roll pane MVP — roll a batch → grid of live thumbnails → pick (screenshot)

Stand up the roll-pane panel: a kind toggle (critter/plant), a **roll** button that draws a seeded batch, a **grid** of live sprite thumbnails (plants via `getPlantSprite`, critters via the uncached `critterPortrait`), and **pick** — clicking a thumbnail introduces the kind into the kernel (id = index), the palette (placeable), and the drawer. A `?roll=`/`?rollpick=` dev aid seeds a deterministic grid for the shot.

**Files:**
- Modify: `src/game/worldlab.ts`

**Interfaces:**
- Consumes: `RollKind`, `rollPlantBatch`, `rollCritterBatch`, `PROVISIONAL_ID` (`../life/roll`); `getPlantSprite` (`../render/plantSprites`); `critterPortrait` (`../render/critterSprites`); `makeEntry` (`./simDrawer`); the new kernel `introducePlantSpecies`/`introduceCritterSpecies`; slice-1 `habitatsOf`/`placeablePlants`.

- [ ] **Step 1: Roll-pane state + the batch.** Add module-scope bench state: `let rollKind: RollKind = "critter";`, `let rollCursor = 0;`, `let batch: (PlantSpecies | CritterSpecies)[] = [];`, `let drawer: DrawerEntry[] = [];` (seed the drawer with the construct's *starter* kinds on `build()`, origin `"starter"`, so the roster isn't empty). A `rollBatch()` helper:
  - `rollKind === "plant"` → `batch = rollPlantBatch(seed, rollCursor, ROLL_COUNT, { habitats: habitatsOf(map) })` (only kinds the construct can host).
  - `rollKind === "critter"` → `batch = rollCritterBatch(seed, rollCursor, ROLL_COUNT, kernel.plantSpecies, map)`.
  - `ROLL_COUNT = 10` (spec's 9–12). A **roll** button calls `rollBatch()`; a **re-roll** increments `rollCursor` then `rollBatch()` (deterministic advance). Rebuild the grid on each roll.

- [ ] **Step 2: The thumbnail grid (reuse, don't fork).** Render each batch member into a small display canvas — a tiny local blit helper (`drawThumb(host, src, zoom)`: `imageSmoothingEnabled=false; drawImage(src, …)` scaled; `image-rendering: pixelated`) over the **existing** sprite canvases — never a re-implemented drawer:
  - plant → `getPlantSprite(member.archetype, member.habitat === Tile.ShallowWater)` (cached by genome `phenoKey`; distinct archetypes never collide).
  - critter → `critterPortrait({ bodyHue, earLen, tailLen, size })` (**uncached** — dodges `getCritterSprites`' id-cache, renders the morph off the four numbers).
  Lay them in a codex-panel grid (~5×2), each cell a button showing the thumbnail + the kind's lowercase name, tinted like the palette chips (plants by `hsl(archetype.hue,…)`).

- [ ] **Step 3: Pick → introduce.** Clicking a grid cell introduces that member:
  - plant → `const id = kernel.introducePlantSpecies({ ...member, id: PROVISIONAL_ID });` then re-filter `plantKinds = placeablePlants(kernel.plantSpecies, habitatsOf(map))` and push `makeEntry({ kind:"plant", speciesId:id, def: kernel.plantSpecies[id], origin:"rolled" })` to `drawer`.
  - critter → `const id = kernel.introduceCritterSpecies({ ...member });` then `critterKinds = drawerLiveCritters()` (see Task 6 — the palette now sources critters from non-deleted drawer entries) and push a `"rolled"` entry.
  Refresh the palette (`ui.setPalette`) and select the freshly-picked kind so a click places it. A short flash: "picked <name> — now on the palette".

- [ ] **Step 4: Chrome — the roll-pane panel.** In `buildChrome`, add a roll-pane surface (a codex panel, e.g. top-left under the eyebrow or a toggled tray) with: a kind toggle (`critter · plant`), a `roll` + `re-roll` button, and a `grid` host. Extend the `Chrome` interface with `onRollKind`, `onRoll`, `onReRoll`, `setBatch(cells: { thumb: HTMLCanvasElement; name: string; tint: string }[])`, `onPickBatch(index)`. Consume only `:root` tokens; reuse `btn()`/`label()`/`group()`.

- [ ] **Step 5: The dev aids.** In `build()`, after the slice-1/2 aids: read `?roll` (`"plant"|"critter"` → set `rollKind`, then `rollBatch()` so the grid is populated for a shot) and `?rollpick` (a comma list of indices → introduce those batch members deterministically, so a shot shows them picked + on the palette + in the drawer). Display-only, rng-free beyond the seeded roll.

- [ ] **Step 6: Typecheck** — `npm run check` → 0.

- [ ] **Step 7: Screenshot the roll pane** —

```
node scripts/shot.mjs "sim=1&starter=single-biome&roll=critter" scratchpad/lab-roll-critters.png 2400 1200 900 ""
node scripts/shot.mjs "sim=1&starter=biome-sampler&roll=plant" scratchpad/lab-roll-plants.png 2400 1200 900 ""
node scripts/shot.mjs "sim=1&starter=single-biome&roll=critter&rollpick=0,3" scratchpad/lab-roll-pick.png 2400 1200 900 ""
```
Open all three. Expected: `lab-roll-critters.png` — a grid of ~10 **distinct critter thumbnails** (real body-plan art, varied silhouettes — no id-cache duplication), the kind toggle on `critter`. `lab-roll-plants.png` — a grid of ~10 plant thumbnails, each a real plant sprite, drawn from the sampler's habitats. `lab-roll-pick.png` — cells 0 and 3 introduced: the two kinds now appear in the bottom palette (selectable) and as `rolled` drawer entries. Confirm critter thumbnails are visibly varied (proving `critterPortrait` per-numbers, not one cached sprite).

- [ ] **Step 8: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "feat: the roll pane — seeded batch → live thumbnail grid → pick onto the palette

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Iterate a pick — looks (re-roll/nudge) + traits (screenshot)

The character-creator half: with a batch cell focused, **iterate** it — *looks* (nudge the genome / re-roll the morph; the thumbnail re-renders) and *traits* (critter palate/role/size; plant habitat/reseed). Iteration transforms the **candidate in the batch** (before pick), so no id-cache dance is needed; the picked kind is whatever you finally choose.

**Files:**
- Modify: `src/game/worldlab.ts`

**Interfaces:**
- Consumes: `nudgePlantLooks`, `nudgeCritterLooks`, `setPlantTraits`, `setCritterTraits` (`../life/roll`); `makeRng` (`../core/rng`); `PlantForm`/`CritterRole` for the trait pickers.

- [ ] **Step 1: Focus a candidate.** Add `let focus: number | null = null;` (index into `batch`). Clicking a grid cell now **focuses** it (opens an iterate strip below the grid) with a "pick" button to introduce; double-click (or the pick button) introduces as in Task 4. A seeded `iterateRng = makeRng(seed ^ 0x17e7)` drives the nudges deterministically (advances per nudge; re-focusing/re-rolling resets it off `rollSeedFor` so a shot is reproducible).

- [ ] **Step 2: Looks controls.** In the iterate strip: **nudge** (small `mutate`/morph re-roll) and **re-roll looks** (a bigger amount). For the focused member:
  - plant → `batch[focus] = nudgePlantLooks(member, iterateRng, amount)`.
  - critter → `batch[focus] = nudgeCritterLooks(member, iterateRng, amount)`.
  Re-render that cell's thumbnail (same `getPlantSprite`/`critterPortrait` path). The thumbnail visibly changes — the whole point.

- [ ] **Step 3: Traits controls.**
  - critter → a **role** toggle (`disperser · grazer` → `setCritterTraits(m,{role})`), a **size** stepper (small/large → `setCritterTraits(m,{size})`, which also re-derives the morph so the body scales), and a **palate** nudge (shift `hueCenter`/widen `hueWidth`, or retarget `form` to a placed plant's form → `setCritterTraits(m,{palate})`).
  - plant → a **habitat** picker (the biome tiles → `setPlantTraits(m,{habitat})`) and a **reseed** toggle (`substrateFeeder` → `setPlantTraits(m,{substrateFeeder})`).
  Re-render the focused cell (a size/habitat change alters the thumbnail for critters/plants respectively).

- [ ] **Step 4: Chrome — the iterate strip.** Extend `Chrome` with `setFocus(view | null)` (renders the strip: the enlarged thumbnail + looks buttons + the kind-appropriate trait controls + a `pick` button) and callbacks `onNudgeLooks`, `onRerollLooks`, `onSetTrait(patch)`, `onPickFocused`. Codex tokens; reuse the plate helpers (`title`/`stat`) from `buildChrome` for the trait readout.

- [ ] **Step 5: The dev aid.** `?iterate=looks|traits` (with `?roll=` + a focus index, default 0): deterministically focus cell 0 and apply one looks-nudge or one traits-change, so a shot shows the strip open with a re-rendered thumbnail. Display-only, off `iterateRng`.

- [ ] **Step 6: Typecheck** — `npm run check` → 0.

- [ ] **Step 7: Screenshot iterate** —

```
node scripts/shot.mjs "sim=1&starter=single-biome&roll=critter&iterate=looks" scratchpad/lab-iterate-looks.png 2400 1200 900 ""
node scripts/shot.mjs "sim=1&starter=single-biome&roll=critter&iterate=traits" scratchpad/lab-iterate-traits.png 2400 1200 900 ""
node scripts/shot.mjs "sim=1&starter=biome-sampler&roll=plant&iterate=looks" scratchpad/lab-iterate-plant.png 2400 1200 900 ""
```
Open all three. Expected: `lab-iterate-looks.png` — cell 0's iterate strip open, its enlarged critter thumbnail re-rendered by the looks nudge (a different silhouette/colour than the same cell in `lab-roll-critters.png`), the looks buttons visible. `lab-iterate-traits.png` — the strip showing the role/size/palate controls, with a trait changed (e.g. role now `grazer`, or a larger body from a size step). `lab-iterate-plant.png` — a plant candidate's strip with the genome re-rendered + habitat/reseed controls. Confirm the thumbnail actually changes under iterate (re-render is live).

- [ ] **Step 8: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "feat: iterate a pick — looks (nudge/re-roll morph+genome) + traits (palate/role/size · habitat/reseed)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: The drawer — live status + delete/revive + daughter auto-capture (screenshot)

The roster panel: every introduced kind (starters + picked + auto-captured daughters ✧) stamped in with **number in play**, **variations**, and an **extinct** mark; **delete** (clears live instances, keeps the definition) and **bring back** (re-spawn from the stored def). The palette now sources its live kinds from **non-deleted** drawer entries, so delete/revive flow through cleanly.

**Files:**
- Modify: `src/game/worldlab.ts`

**Interfaces:**
- Consumes: `DrawerEntry`, `statusOf`, `bumpPeak`, `captureDaughters`, `deleteEntry`, `reviveEntry` (`./simDrawer`); the kernel `clearPlantInstances`/`clearCritterInstances`/`critterCountOf`/`speciesCounts`; `kernel.flora.takeEvents()`.

- [ ] **Step 1: Seed the drawer + source the palette from it.** On `build()`, seed `drawer` with the construct's **starter** kinds: each placeable plant kind and each starter critter kind → `makeEntry({ …, origin: "starter" })`. Change the palette's kind lists to source from the drawer: `plantKinds = drawer.filter(e => e.kind==="plant" && !e.deleted).map(e => kernel.plantSpecies[e.speciesId])` intersected with `placeablePlants(…)`; `critterKinds` likewise from non-deleted critter entries. (A helper `drawerLive(kind)`.) So a deleted kind leaves the palette; a revived one returns.

- [ ] **Step 2: Live status + daughter capture on every refresh.** In `refreshCensusStrip()` (or a new `refreshDrawer()` called from the same places — after every `kernel.step` batch and every placement/introduce):
  - `const fresh = captureDaughters(kernel.plantSpecies, drawer); if (fresh.length) { drawer.push(...fresh); … }` — auto-capture emergent daughters as first-class ✧ entries. Pair with `kernel.flora.takeEvents()` for a "✧ a daughter arose: <name>" flash (the events give the human name; the scan gives the id).
  - For each entry: `const count = e.kind==="plant" ? (kernel.speciesCounts().get(e.speciesId) ?? 0) : kernel.critterCountOf(e.speciesId); bumpPeak(e, count);` then `statusOf(e, count, drawer)` for the row.
  Render the drawer panel: name (daughters marked ✧, with their parent's name), `in play: N`, `variations: V`, and an **extinct** badge when `status.extinct`.

- [ ] **Step 3: Delete / bring back.** Each row carries a **delete** button and, when deleted, a **bring back** button:
  - delete → `kernel.clearPlantInstances(id)` / `kernel.clearCritterInstances(id)` (population → 0, record kept), then swap the entry for `deleteEntry(e)` in `drawer`, refresh the palette (drops it) + the strip. Peaceful copy: "cleared <name> — its definition is kept; bring it back any time."
  - bring back → swap for `reviveEntry(e)`, then re-spawn a few instances from the stored def near the construct centre via the existing `kernel.placePlant(id, …)` / `placeCritter(id, …)` (reuse `nearestTileOf` + `worldPxCenter`), and refresh. (The species record is still at its id, so placement just works; the stored def is the revive source of truth.)

- [ ] **Step 4: Chrome — the drawer panel.** In `buildChrome`, add a drawer surface (a codex panel, e.g. right side under/above the readout, or a toggled tray) listing entries with the status fields + the delete/bring-back buttons. Extend `Chrome` with `setDrawer(rows: { key; name; sub; count; variations; extinct; deleted }[])`, `onDeleteEntry(key)`, `onReviveEntry(key)`. Codex tokens; reuse the `stat()`/`title()` plate helpers and the census strip's `speciesRow` styling.

- [ ] **Step 5: The dev aids.** `?drawerdemo=1`: introduce a couple of rolled kinds + a stamped patch, so the drawer shows populated `in play` counts; combine with `&run=N` to move counts (and, for a plant kind on a permissive split tuning, surface a ✧ daughter). Add a `?split=1` aid that constructs the kernel with permissive speciation tuning (`{ splitDistance: 0.12, splitClusterMin: 2, splitCooldownTicks: 0, splitKinDistance: 0.4 }`) + a dense same-kind stamp + a long `run`, so a shot can catch a captured daughter. Best-effort (like slice-1's `?demo`): the pure `captureDaughters` test is the real guarantee; the shot illustrates. Also `?drawerdel=<key-or-index>` to show a delete/extinct badge deterministically.

- [ ] **Step 6: Typecheck** — `npm run check` → 0.

- [ ] **Step 7: Screenshot the drawer** —

```
node scripts/shot.mjs "sim=1&starter=single-biome&drawerdemo=1&run=200" scratchpad/lab-drawer.png 2400 1200 900 ""
node scripts/shot.mjs "sim=1&starter=single-biome&drawerdemo=1&drawerdel=0" scratchpad/lab-drawer-extinct.png 2400 1200 900 ""
node scripts/shot.mjs "sim=1&starter=single-biome&split=1&drawerdemo=1&run=600" scratchpad/lab-drawer-daughter.png 2400 1200 900 ""
```
Open all three. Expected: `lab-drawer.png` — the drawer listing starter + rolled kinds with live `in play` counts and `variations`; the world has stepped 200 ticks so counts moved. `lab-drawer-extinct.png` — a deleted kind's row carrying the **extinct/cleared** badge + a `bring back` button, and that kind gone from the palette. `lab-drawer-daughter.png` — a ✧ **daughter** entry auto-captured under its parent (if the permissive split fired; if not, the pure test still proves capture — note it in the run log). Confirm the drawer's numbers are live (differ from a `run=0` capture) and daughters read as first-class rows.

- [ ] **Step 8: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "feat: the drawer — live status (count/variations/extinct) + delete/revive + daughter ✧ capture

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Full verify + the determinism/peaceful/mode-isolation guards + a doc note

Prove the slice green, the roll deterministic and the roster peaceful, and real worlds untouched; leave a pointer for slice 4.

**Files:**
- Modify: `docs/superpowers/2026-07-22-plant-insect-ecology-tech.md` (a short "the species lab (Simulator slice 3)" note).

- [ ] **Step 1: Full gate** — `npm run check` (0) · `npx vitest run` (all green — report the count, incl. the new `roll` / `sim-drawer` tests + the extended `kernel` tests + the still-green slice-1/2 `construct`/`sim-roster`/`sim-brush`/`flags`) · `npm run build` (ok).

- [ ] **Step 2: Determinism + peaceful spot-check.** Confirm the roll/drawer core is rng-clean: `grep -nE "Math\.random|Date\.now|new Date" src/life/roll.ts src/game/simDrawer.ts` → no hits (rolling is seeded via `rollSeedFor` + `makeRng`; the drawer is pure). The peaceful invariant is guarded two ways: the slice-1 `critterCount()`-across-`step()` test still passes (delete/revive are outside `step`), and Task 2's new kernel test asserts a rolled kind survives `step()`. Note in the doc that **delete is a roster op** (clears instances, keeps the definition) — the spec's "populations rise and fall", never a violent kill.

- [ ] **Step 3: The mode-isolation guard (real worlds byte-identical).** The only shared-*looking* edit is additive methods on the Simulator-only `kernel.ts`; no `main.ts`/`species.ts`/`fauna.ts`/`flora.ts` change, so the slice-1 `parseSimMode` test still guards the router. Add the visual proof:

```
node scripts/shot.mjs "seed=42" scratchpad/guard-world.png 2500 960 640 "Escape"
node scripts/shot.mjs "sim=swarm" scratchpad/guard-swarm.png 2500 1000 800 ""
node scripts/shot.mjs "sim=1" scratchpad/guard-lab.png 2500 1100 820 ""
```
Open all three. Expected: `guard-world.png` — island 42 in normal play, unchanged; `guard-swarm.png` — the swarm/identity-map bench, intact; `guard-lab.png` — the World-Lab now carrying the roll-pane + drawer surfaces, no life until you place/roll. Three distinct, correct destinations.

- [ ] **Step 4: Doc note** — one short paragraph: the species lab shipped — the roll pane (seeded batch via `roll.ts` reusing `generatePlantSpecies`/`generateCritterSpecies`; thumbnails via `getPlantSprite`/`critterPortrait`; pick → `kernel.introduce*` with id===index; iterate looks via `mutate`/`morphOf` + traits) and the drawer (`simDrawer.ts` model: status/extinct/variations, delete/revive preserving the definition, daughter ✧ auto-capture by scanning `plantSpecies` for `parent`-bearing records). Ids are positional so delete tombstones (never splices). Deferred slice-4+ items unchanged (evolutionary layer, save/resume, ambient bench, title backdrop).

- [ ] **Step 5: Commit** (push/merge handled at branch-finish, not here):

```bash
git add -A
git commit -m "docs: the species lab (Simulator slice 3) — roll pane + drawer, green

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (coverage against the slice-3 scope)

| Slice-3 scope item | Task(s) | Verified by |
|---|---|---|
| **1a. Roll a batch of ~9–12 of a chosen kind from a seeded stream** | Task 1 (`rollPlantBatch`/`rollCritterBatch`/`rollSeedFor`) + Task 4 (roll/re-roll wiring) | `tests/roll.test.ts` — deterministic, right-sized, cursor-advances, provisional-id; `lab-roll-critters`/`lab-roll-plants` shots |
| **1b. Grid of live sprite thumbnails (reuse `plantSprites`/`critterSprites`)** | Task 4 | `lab-roll-*` shots (real sprite art); critter thumbs via **uncached `critterPortrait`** (no id-cache collision) |
| **1c. Pick a kind onto the palette (kernel + placeable gating accept it)** | Task 2 (`introduce*`, id===index) + Task 4 (pick→introduce) | `tests/kernel.test.ts` (id===index, Flora accepts live, places); `lab-roll-pick` shot |
| **1d. Iterate looks (re-roll/nudge morph + genome; thumbnails re-render)** | Task 1 (`nudgePlantLooks`/`nudgeCritterLooks`) + Task 5 | `tests/roll.test.ts` (form preserved, genome/morph change); `lab-iterate-looks`/`lab-iterate-plant` shots |
| **1e. Iterate traits (critter palate/role/size · plant habitat/reseed)** | Task 1 (`setCritterTraits`/`setPlantTraits`) + Task 5 | `tests/roll.test.ts` (patches named fields, size re-derives morph + clamps); `lab-iterate-traits` shot |
| **2a. Drawer stamps every introduced kind with live status (count in play)** | Task 3 (`statusOf`/`bumpPeak`) + Task 6 | `tests/sim-drawer.test.ts`; `lab-drawer` shot (live counts move over `run`) |
| **2b. Variations (iterated looks + emergent daughters)** | Task 3 (`statusOf` variations) + Task 6 | `tests/sim-drawer.test.ts` "variations = looks + daughters" |
| **2c. Extinct mark when count hits zero** | Task 3 (extinct = peak>0 && count==0, not for deleted) + Task 6 | `tests/sim-drawer.test.ts` (extinct only after lived-then-lost; deleted ≠ extinct); `lab-drawer-extinct` shot |
| **2d. Delete a kind / bring it back (from the STORED definition)** | Task 2 (`clear*Instances`, no splice) + Task 3 (`deleteEntry`/`reviveEntry`/`cloneDef`) + Task 6 | `tests/sim-drawer.test.ts` delete/revive round-trip preserves the def + deep-clone; `lab-drawer-extinct` shot |
| **2e. Auto-capture emergent daughters ✧ as first-class entries** | Task 3 (`captureDaughters`) + Task 6 | `tests/sim-drawer.test.ts` (captures parent-bearing records, idempotent); `lab-drawer-daughter` shot (best-effort) |
| **Determinism (seeded roll, no `Math.random`/wall-clock)** | Task 1, Task 7 | roll is seeded via `rollSeedFor`+`makeRng`; `grep` guard; determinism tests |
| **Peaceful pillar (delete = roster op, not a kill)** | Task 2, Task 3, Task 7 | slice-1 `critterCount()`-across-`step` invariant still green; kernel test (rolled kind survives `step`); delete clears instances but keeps the def |
| **Reuse over fork** | Tasks 1, 4, 5 | `roll.ts` composes `generatePlantSpecies`/`generateCritterSpecies`/`mutate`/`morphOf`; thumbnails via `getPlantSprite`/`critterPortrait`; no genome/sprite/species logic re-implemented |
| **Real worlds byte-identical (mode isolation)** | Task 7 | only additive Simulator-only `kernel.ts` methods; slice-1 `parseSimMode` test + `guard-world`/`guard-swarm`/`guard-lab` shots |

## Deferred to later slices (spec build-order 4–5, noted so they aren't lost)
- **The evolutionary layer** — pressures panel (drift/speciation/grazer-share), richness/wildness meter, roll-a-foodchain/web, pin-a-phenotype-to-reseed (slice 4).
- **Save/resume to a slot** + full-critter-state + RNG persistence (slice 5); the **ambient bench**; the **title-screen live backdrop**.
- **Iterating an already-picked-and-placed kind in place** — would mutate a live species record at a fixed id and need `clearCritterSpriteCache()` to refresh the id-cached critter sprite; slice-3 iterate stays on the pre-pick candidate, so this isn't needed here.

## Open calls flagged for the controller
1. **Roll = roster-slice, not genome-synthesis.** This plan rolls a batch by drawing a whole seeded roster (`generatePlantSpecies`/`generateCritterSpecies`) and slicing members — exactly what the spec's Manipulation API endorses, and it needs **zero new exports** from `species.ts`/`fauna.ts`. The tradeoff: a plant batch's members are whatever forms that habitat's roster rolled (good variety, but you can't demand "roll me a Coral"); a critter batch's palate is cut from a real plant in the construct's roster (so a rolled critter meaningfully favours something placeable). If finer control is wanted later, a genome-first synthesis path (`rollPlantKind`/`rollCritterKind` off `sampleArchetype`) is the alternative — flagged, not built.
2. **Delete tombstones, never splices.** Because species ids are array indices, delete clears live instances + marks the entry deleted but leaves the record in `kernel.plantSpecies`/`critterSpecies`. Over a long session this grows the arrays with tombstones (cheap — a few dozen records). An id-compaction pass is possible but risky (it must renumber every placed plant's `.species` + every daughter's `parent`); deferred as unnecessary for the bench.
3. **Daughters are plant-only.** Flora speciation (✧) is the only speciation this engine runs, so `captureDaughters` scans `plantSpecies`. Critters don't speciate here (the swarm bench's cousin-budding is a separate ecology). If a critter-daughter concept lands later, the capture generalizes.
4. **`?split=1` demo tuning.** The daughter-capture screenshot leans on a permissive speciation tuning + a dense stamp + a long `run` to force a ✧ within a bounded shot. It's best-effort (like slice-1's `?demo`); the pure `captureDaughters` test is the guarantee. Confirm the `?split` dev aid on the bench is acceptable (it's Simulator-only, display-time).

## API-friction notes (where fauna/flora/render make a scope item harder than the spec implies — and the key answers the controller asked for)
- **THE key answer: there is NO "roll one" generator — but rolling a brand-new kind is still clean via REUSE.** `generatePlantSpecies(seed)` mints a whole ~24-kind roster; `generateCritterSpecies(seed, map, flora, plants)` mints 5–8 critters tied to favourite plants/dens. Neither exposes a single-kind path. **Slice 3 does not need a new synthesis module** — it draws a per-roll roster and slices members (the spec's own `rollPlantSpecies`/`rollCritterSpecies` = "reuse the roster generator + `generateCritterSpecies`"). This keeps the slice's *generation* difficulty **low** (no `sampleArchetype`/`critterName` export, no bespoke palate math). The difficulty lives entirely in the **integration** seams below, not in minting a kind.
- **Species ids ARE array indices — the load-bearing constraint.** `placePlant(id)`/`placeCritter(id)` index `plantSpecies[id]`/`critterSpecies[id]`; `flora.addPlant(species,…)` reads `speciesList[species].habitat`; flora speciation appends daughters at `speciesList.length`. `kernel.plantSpecies` **is the same array** Flora holds (constructor passes it by reference), so appending a picked kind to it via `introducePlantSpecies` is seen live by Flora — but the id **must** be assigned at push time (`id = array.length`), never earlier (a candidate carries `PROVISIONAL_ID = -1`), or a concurrent flora daughter-append could collide. And **delete must never splice** (it would renumber every later kind + every placed plant's `.species` + every daughter's `parent`) — hence the tombstone. This is the single most important thing to get right.
- **`getCritterSprites` is id-cached — use `critterPortrait` for candidates.** `getCritterSprites(sp)` caches by `sp.id`; rolling many candidates (id -1, or reusing ids) would return a stale sprite. `critterPortrait({bodyHue,earLen,tailLen,size})` (already exported, uncached) renders the same morph off the four numbers — the correct off-DOM thumbnail path for the roll grid. Plants use `getPlantSprite(genome)`, cached by genome-derived `phenoKey`, so distinct archetypes never collide. (Placed critters still render fine via `getCritterSprites` because a *picked* kind has a fresh unique id.)
- **Thumbnails render into small canvases with a plain scaled blit.** The sprite *generation* is fully reused (`getPlantSprite` → 16×28 canvas; `critterPortrait` → 16×16 canvas); the roll pane only needs a ~5-line `drawImage`-with-`imageSmoothingEnabled=false` blit into a display canvas (`image-rendering: pixelated`) — DOM plumbing, not a re-implemented drawer. `inspect.ts`'s private `croppedSprite` (tight-crop) could be exported for an even tighter thumb, but the plain scaled blit avoids touching a shared file.
- **Daughter events carry no id → capture by scanning.** `flora.takeEvents()` returns `{name,parentName,x,y,tick}` (great for the ✧ flash) but not the daughter's id. The daughter *record*, however, is appended to `kernel.plantSpecies` with `parent!==undefined` — so `captureDaughters` scans that array for `parent`-bearing records not yet in the drawer. Clean, deterministic, idempotent.
- **`flora.removePlant` maintains `speciesCounts` (swap-and-pop with `idx` fix-up)** — so `clearPlantInstances` (filter `flora.all` into a held list, then `removePlant` each) leaves the kind's count at 0 correctly. Critters are a plain array on the kernel, so `clearCritterInstances` is a filter. Both are additive kernel methods; neither runs inside `step()`, so the slice-1 peaceful invariant is untouched.
- **A revived kind re-spawns against its still-present record.** Because delete tombstones (never splices), the species record sits unchanged at its id; revive just re-places instances via the existing `placePlant`/`placeCritter`. The drawer's deep-cloned `def` is the conceptual source of truth (and future-proofs against edits), but no re-introduction/id-reassignment is needed on revive.
