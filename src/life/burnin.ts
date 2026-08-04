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

/**
 * The one method burn-in needs from an insect layer: advance the pollinators
 * one island heartbeat against this Flora.
 *
 * Declared here as a structural type rather than imported, because the only
 * implementation (`SwarmLayer`) lives in `src/game/` and `src/life/` must not
 * depend on `src/game/`. The caller constructs the layer and injects it.
 *
 * The implementation must be deterministic given its own seeded Rng, and it
 * may mutate `flora` (SwarmLayer pollinates through `flora.pollinateSpread`).
 */
export interface SwarmTicker {
  tick(flora: Flora): void;
}

/** Generations run before the first frame. Spec band: 300-600. */
export const BURN_IN_GENERATIONS = 400;

// `Flora.tuning.simBudget` (default 480) bounds how many plants a tick
// examines. That bound exists to cap per-frame cost during play, where a
// frame must actually fit in a frame. Burn-in has no frame — capping it
// there is not a saving, it is a silent loss of the thing being paid for.
//
// The arithmetic: at simBudget 480 against a population near 8000 plants, a
// tick reaches 480/8000 ≈ 6% of the island. With reproChance 0.06, the
// expected reproductions per plant per tick is 0.06 × 0.06 ≈ 0.0036, so 400
// ticks yield about 1.4 reproductions per plant — one generation of
// turnover, not hundreds. At full coverage (simBudget ≥ population) the same
// 400 ticks examine every plant every tick, yielding about 400 × 0.06 ≈ 24
// reproductions per plant.
//
// Callers MUST construct the Flora passed to burnIn with
// `simBudget: BURN_IN_SIM_BUDGET` (or otherwise ≥ the expected population),
// or the "generations" burnIn reports will not correspond to real
// generational turnover.
/** simBudget to use on any Flora that will be burned in, matching maxPlants so every living plant is examined each tick. */
export const BURN_IN_SIM_BUDGET = 10000;

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

// A capped simBudget makes burn-in a very expensive no-op: at 480 against a
// population near 8000 a tick reaches 6% of the island, and 400 ticks yields
// about 1.4 reproductions per plant rather than about 24. Measured: 62.7% of
// the population born during burn-in at 480, 100% at full coverage. This is
// a configuration error the caller cannot see in the result, so refuse it.
// Both burnIn and burnInAsync call this, so neither can drift off the rule.
function requireFullCoverage(flora: Flora): void {
  if (flora.tuning.simBudget < flora.all.length) {
    throw new Error(
      `burnIn requires simBudget >= population to examine every plant each tick; ` +
        `got simBudget=${flora.tuning.simBudget} against ${flora.all.length} plants. ` +
        `Construct the Flora with simBudget: BURN_IN_SIM_BUDGET.`,
    );
  }
}

function reportFor(flora: Flora, generations: number, startedMs: number): BurnInReport {
  let species = 0;
  for (const count of flora.speciesCounts.values()) if (count > 0) species++;
  return {
    generations,
    species,
    plants: flora.all.length,
    elapsedMs: Date.now() - startedMs,
    floorHit: species < BURN_IN_SPECIES_FLOOR,
  };
}

/**
 * `swarms`, when given, is ticked once after every `flora.simTick()`, so the
 * pollinators live the same generations the plants do: a swarm's colour is
 * selected against the flowers standing at that generation, and the flowers it
 * pollinates spread. Omit it and burn-in behaves exactly as it did before
 * insects took part — plants competing alone.
 *
 * Order matters and is fixed: plants first, then insects. The swarm layer reads
 * the population the tick just produced.
 */
export function burnIn(
  flora: Flora,
  generations: number = BURN_IN_GENERATIONS,
  onProgress?: (done: number, total: number) => void,
  swarms?: SwarmTicker,
): BurnInReport {
  requireFullCoverage(flora);
  const started = Date.now();
  const every = Math.max(1, Math.floor(generations / PROGRESS_STEPS));
  for (let i = 1; i <= generations; i++) {
    flora.simTick();
    swarms?.tick(flora);
    if (onProgress && (i % every === 0 || i === generations)) onProgress(i, generations);
  }
  return reportFor(flora, generations, started);
}

/** Generations run per chunk before burnInAsync hands the thread back. */
export const BURN_IN_YIELD_EVERY = 20;

/**
 * Hand the thread back to the browser long enough for it to PAINT one frame,
 * then resume. `await Promise.resolve()` is not enough — a microtask drains
 * before the renderer ever runs, so a progress readout written under it never
 * reaches the screen. requestAnimationFrame resolves after the next paint;
 * setTimeout(0) is the fallback under Node, where there is no rAF and tests
 * only need the macrotask boundary.
 */
function yieldToPaint(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

/**
 * burnIn, chunked so a browser tab stays responsive while it runs.
 *
 * Measured: a whole makeHollow call costs 6.2-7.0 s across five seeds. Run
 * synchronously from a click handler that is 6-7 s with no paint at all — the
 * progress callback would update a screen nobody ever sees, and the tab can
 * raise an unresponsive-page warning. This runs `yieldEvery` generations, then
 * awaits a paint, so the readout advances about `generations / yieldEvery`
 * times (400 / 20 = 20 visible steps) and input keeps being handled.
 *
 * Identical arithmetic to burnIn: the same ticks in the same order on the same
 * Flora, so the resulting island is byte-identical to the synchronous path.
 */
export async function burnInAsync(
  flora: Flora,
  generations: number = BURN_IN_GENERATIONS,
  onProgress?: (done: number, total: number) => void,
  yieldEvery: number = BURN_IN_YIELD_EVERY,
  swarms?: SwarmTicker,
): Promise<BurnInReport> {
  requireFullCoverage(flora);
  const started = Date.now();
  const chunk = Math.max(1, Math.floor(yieldEvery));
  let done = 0;
  while (done < generations) {
    const upTo = Math.min(generations, done + chunk);
    for (; done < upTo; done++) {
      flora.simTick();
      swarms?.tick(flora);
    }
    onProgress?.(done, generations);
    if (done < generations) await yieldToPaint();
  }
  return reportFor(flora, generations, started);
}
