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
