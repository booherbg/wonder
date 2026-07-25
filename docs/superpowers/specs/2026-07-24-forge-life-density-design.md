# Forge life density — design

**Date:** 2026-07-24  
**Status:** approved (brainstorm)  
**Surfaces:** World Forge (title → forge); `GenArgs` / load path for generated islands  
**Ship order:** Track D — **before** honest-time census (Track B)  
**Out of scope:** In-world place/roll tools; Simulator pressures UI (Track C); World-Lab kernel (already empty-start); forge preview flora

---

## Goal

The forge can choose how full the first morning is — from a **barren** island to today’s living scatter — without changing geology knobs or inventing new seeding tools. Warmth still only **ages** whatever scattered.

---

## Locked decisions

| Topic | Choice |
|---|---|
| Control | One forge slider: **life** **0–100** |
| Meaning | Fraction of today’s scatter budget (`comfortFraction × maxPlants`) |
| Default | **80** — byte-identical to current islands when left alone |
| 0 | No scatter (empty slate; warm is a no-op until something lives) |
| 100 | Full scatter budget (today’s scale ceiling) |
| Warmth | Unchanged: ticks of post-scatter fast-forward |
| Preview | Terrain-only (same as warmth — no flora in the mini) |
| Lab | Untouched |
| Tools in world | **No** this pass (parked with Track C) |

---

## Behavior

### Forge UI
- Primary row (near warmth): label **life**, range input 0–100, readout like `80%` (or `empty` at 0 if that reads clearer — prefer `%` for consistency with other forge readouts).
- Fine-grain fold does **not** need a duplicate; one slider is enough.
- Randomize-all: roll life in a mid–high band (e.g. ~50–100) so random sails stay lively; exact band set in the plan. Manual default remains 80.

### Plumbing
- Add `life: number` to `ForgeState` / `GenArgs` (0–100 integer) and `FORGE_BOUNDS.life: [0, 100]`.
- `forgeArgs()` clamps and passes `life` through like `warm`.
- On main-world Flora construction after generate: scale the scatter budget by `life / 100`. When `life === 0`, skip scatter entirely (or budget 0 — same outcome).
- Persist only via gen args / URL if other forge fields already do; no new save schema beyond what’s needed for regenerate-from-forge parity. Prefer the same pattern `warm` uses today.

### Interaction with warm
- `life` decides **how many** plants exist at tick 0 of warm.
- `warm` then runs flora (+ swarm) ticks as today.
- Empty + warm > 0: still barren (nothing to grow from). That is intentional.

---

## Non-goals

- Changing `maxPlants`, `comfortFraction` defaults, or crowding math (except multiplying the scatter budget)
- Bringing lab roll/place/cloud tools into the main world
- Exposing the thirteen Simulator pressures in the world
- Life density on forge auto-preview canvas

---

## Success criteria

1. Forge **life = 0** → land with **0** plants after generate (warm optional, still 0).
2. Forge **life = 80** (default) → plant count in the same ballpark as today’s scatter.
3. Forge **life = 100** → denser than 80, still within `maxPlants` / scatter scale rules.
4. Warmth still ages; it does not replace or override the life slider.
5. `tsc` + vitest green; forgeArgs / scatter covered by tests.

---

## Phasing

| Step | Ships |
|---|---|
| 1 | `life` on ForgeState / GenArgs / FORGE_BOUNDS + tests |
| 2 | Scatter budget respects `life`; load path wired |
| 3 | Forge UI slider + readout; randomize band |
| 4 | Verify empty / default / full mornings |

---

## Follow-ons

- **Track B** (honest time) — denser census + live richness; empty/thin islands make charts meaningful.
- **Track C** — whether pressures / seeding tools enter the world (separate discussion).
- **Track A** — touch / mobile after B+D.
