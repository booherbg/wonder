import { HOLLOW_CONFIG } from "../world/config";
import { generate } from "../world/generate";
import { Tile, WorldMap, tileAt } from "../world/types";
import { BURN_IN_GENERATIONS, BURN_IN_SIM_BUDGET, BurnInReport, burnIn } from "./burnin";
import { FitnessLandscape, landscapeFor } from "./fitness";
import { Flora } from "./flora";
import { MineralField, mineralFieldFor } from "./minerals";
import { generatePlantSpecies } from "./species";

// ─────────────────────────────────────────────────────────────────────────────
// The Hollow, assembled: a small forested island whose ecology has already run
// for BURN_IN_GENERATIONS generations under mineral scarcity and selection
// before anyone sees it.
// ─────────────────────────────────────────────────────────────────────────────

/** Reroll attempts before a Hollow is returned despite missing the floor. */
const MAX_ATTEMPTS = 8;

export interface Hollow {
  map: WorldMap;
  flora: Flora;
  minerals: MineralField;
  landscape: FitnessLandscape;
  report: BurnInReport;
}

/**
 * How much light reaches the ground on a tile, 0 (deep shade) to 1 (open sun).
 * Forest floor is shaded by its own canopy; open turf and sand are not. This
 * is what makes height-versus-light a real correlation a player can read off
 * the world rather than a constant that resolves the same everywhere.
 *
 * `FitnessLandscape.score` reads `niche.light` against `norm(g, "height")`:
 * a plant is best suited where the light equals its normalised height. So
 * these numbers are also the height each tile selects for. They are ordered
 * by how much canopy stands over the ground, not by how bright the tile
 * looks when drawn:
 *   Forest 0.25       — closed canopy, the deepest shade on the island
 *   Marsh 0.5         — scattered wet-ground scrub, half open
 *   ShallowWater 0.7  — open above, but light is lost entering the water
 *   Grass 0.85        — meadow, only its own sward shading the ground
 *   Scree/Rock 0.9    — bare ground, some of it in the shadow of the ridge
 *   Highland 0.95     — open turf above the treeline
 *   Sand 1.0          — full sun, nothing standing over it
 * Everything else (deep water, snow, cliff) gets 0.6: those tiles carry no
 * plants, so the value only has to be defined, never legible.
 */
export function lightAt(map: WorldMap, tx: number, ty: number): number {
  switch (tileAt(map, tx, ty)) {
    case Tile.Forest:
      return 0.25;
    case Tile.Marsh:
      return 0.5;
    case Tile.ShallowWater:
      return 0.7;
    case Tile.Grass:
      return 0.85;
    case Tile.Scree:
    case Tile.Rock:
      return 0.9;
    case Tile.Highland:
      return 0.95;
    case Tile.Sand:
      return 1.0;
    default:
      return 0.6;
  }
}

function attempt(seed: number, onProgress?: (d: number, t: number) => void): Hollow {
  const map = generate(seed, HOLLOW_CONFIG);
  const minerals = mineralFieldFor(map, seed);
  const landscape = landscapeFor(seed);
  const flora = new Flora(map, generatePlantSpecies(seed), seed, {
    // Burn-in examines every living plant each tick. The default simBudget of
    // 480 against a population near 8000 reaches 6% of the island per tick,
    // which turns 400 ticks into about 1.4 reproductions per plant instead of
    // about 24 — measured, 62.7% of the population born during burn-in at 480
    // against 100% at full coverage. burnIn throws if this is left at the
    // default, because the resulting island looks correct and is not.
    simBudget: BURN_IN_SIM_BUDGET,
    selection: {
      fitness(g, tx, ty) {
        const supply = minerals.sample(tx, ty);
        const f = landscape.score(g, { minerals: supply, light: lightAt(map, tx, ty) });
        // Growing costs what it draws. A plant that cannot get what it demands
        // has already been scored down; drawing it down is what makes the next
        // plant's shortage real.
        minerals.draw(tx, ty, landscape.demandOf(g), 0.002);
        return f;
      },
    },
  });
  const report = burnIn(flora, BURN_IN_GENERATIONS, onProgress);
  return { map, flora, minerals, landscape, report };
}

/**
 * Build a Hollow. Rerolls deterministically (seed+1, seed+2, ...) past a
 * burn-in that leaves too few species, the way worldgen already rerolls past
 * an island with too little land. After MAX_ATTEMPTS the last result is
 * returned with floorHit still set rather than throwing — a caller that wants
 * to refuse can read the report.
 */
export function makeHollow(
  seed: number,
  onProgress?: (done: number, total: number) => void,
): Hollow {
  let last = attempt(seed, onProgress);
  for (let i = 1; i < MAX_ATTEMPTS && last.report.floorHit; i++) {
    last = attempt(seed + i, onProgress);
  }
  return last;
}
