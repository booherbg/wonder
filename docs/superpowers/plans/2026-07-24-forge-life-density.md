# Forge life density — Implementation Plan

> **For agentic workers:** Execute task-by-task. Prefer Composer/Grok. TDD for helpers.

**Goal:** Forge **life** slider 0–100 scales first-morning scatter; default 80 = today’s density.

**Spec:** `docs/superpowers/specs/2026-07-24-forge-life-density-design.md`

**Architecture:** `GenArgs.life` (0–100) flows forge → load like `warm`. Flora scatter budget = `(life/100) * maxPlants` when life is set; omit life → keep `comfortFraction * maxPlants` (non-forge loads unchanged).

**Tech stack:** TypeScript, vitest, existing forge / Flora

## Global Constraints

- Default life **80** = byte-identical to current scatter (`0.8 × maxPlants`)
- Life **0** → no plants; **100** → `1.0 × maxPlants` budget
- Warmth unchanged; preview stays terrain-only; lab untouched
- Prefer Composer/Grok for subagents

## File map

| File | Role |
|---|---|
| `src/render/forgeArgs.ts` | `life` on ForgeState/GenArgs; FORGE_BOUNDS; default 80; clamp |
| `src/life/flora.ts` | Optional scatter life % → budget |
| `src/game/main.ts` | Pass `gen.life` into Flora |
| `src/render/forge.ts` | Life slider UI; randomize 50–100 |
| `tests/forge-args.test.ts` | life default/clamp |
| `tests/flora-scatter-life.test.ts` | life 0 / 80 / 100 plant counts |

---

### Task 1: GenArgs + forgeArgs life

**Files:** `src/render/forgeArgs.ts`, `tests/forge-args.test.ts`

- [x] **1.1** Failing tests: default `gen.life === 80`; clamp 999→100, -1→0; INTEGER
- [x] **1.2** Add `life` to ForgeState/GenArgs; `FORGE_BOUNDS.life = [0,100]`; defaultForgeState life 80; forgeArgs clamp; INTEGER_FIELDS
- [x] **1.3** Tests green; commit

### Task 2: Flora scatter respects life

**Files:** `src/life/flora.ts`, `tests/flora-scatter-life.test.ts`

- [x] **2.1** Failing tests on small map: life 0 → 0 plants; life 80 ≈ current; life 100 > life 80 (same seed)
- [x] **2.2** Flora accepts optional `scatterLife?: number` (0–100) via ctor opts or tuning; budget = `(life/100)*maxPlants` when set, else `comfortFraction*maxPlants`; skip scatter if budget ≤ 0
- [x] **2.3** `main.ts` load: pass `gen?.life` when constructing Flora (fresh islands only, not restore)
- [x] **2.4** Tests green; commit

### Task 3: Forge UI + randomize

**Files:** `src/render/forge.ts`

- [x] **3.1** Life slider beside warmth (0–100, step 1, readout `N%`); wire state.life
- [x] **3.2** Randomize-all: `state.life` in [50, 100]; skip treating life as WorldConfig cfg field
- [x] **3.3** Commit

### Task 4: Verify

- [x] **4.1** `npx vitest run` + `npx tsc --noEmit`
- [x] **4.2** Manual: forge life 0 → barren; 80 → normal; warmth still ages

---

## Done when

Spec success criteria met; tests green.
