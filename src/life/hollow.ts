import { HOLLOW_CONFIG } from "../world/config";
import { generate } from "../world/generate";
import { Tile, WorldMap, tileAt } from "../world/types";
import {
  BURN_IN_GENERATIONS,
  BURN_IN_SIM_BUDGET,
  BurnInReport,
  burnIn,
  burnInAsync,
} from "./burnin";
import { PlantSpecies } from "./species";
import { FitnessLandscape, landscapeFor } from "./fitness";
import { Flora } from "./flora";
import { MineralField, mineralFieldFor } from "./minerals";
import { generatePlantSpecies } from "./species";
import { CANOPY_REFRESH_TICKS, CanopyField } from "./canopy";
import { applyHueKey } from "./huekey";

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
  /**
   * The species list `flora` was built on — the same array object Flora holds,
   * so any daughter species founded during burn-in is already in it. A caller
   * that hands this Flora to a game needs this list: Flora keeps its own copy
   * private, and rebuilding it from the seed would miss the daughters.
   */
  species: PlantSpecies[];
  minerals: MineralField;
  landscape: FitnessLandscape;
  canopy: CanopyField;
  report: BurnInReport;
}

/**
 * How much light reaches the ground from the terrain alone, 0 (deep shade) to
 * 1 (open sun), before any plant is standing on it. Composed with CanopyField
 * — `light = terrainLight * canopy.lightAt` — so this factor covers only what
 * the flora does not model.
 *
 * RETUNED from the first version, which gave Forest 0.25 and Sand 1.0. That
 * encoded canopy in the tile type, which double-counts now that the canopy is
 * simulated, and it could not select for height: `PlantSpecies.habitat` pins a
 * species to one tile, so a per-tile constant is a per-species constant with
 * no gradient inside the habitat. Measured mean genome height on Tile.Forest
 * moved -0.012 to +0.003 across seeds 2026, 11 and 5, sign unstable.
 *
 * What is left here is shade the plants cannot cast:
 *   DeepWater 0.35    — light lost through the water column
 *   ShallowWater 0.7  — the same, over a shorter column
 *   Cliff 0.55        — ground in the shadow of a sheer face
 *   Snow 0.9          — high and open, but the ground is often north-facing
 *   everything else 1 — open to the sky; whatever darkens it is a plant, and
 *                       CanopyField is what says so
 */
export function terrainLight(map: WorldMap, tx: number, ty: number): number {
  switch (tileAt(map, tx, ty)) {
    case Tile.DeepWater:
      return 0.35;
    case Tile.ShallowWater:
      return 0.7;
    case Tile.Cliff:
      return 0.55;
    case Tile.Snow:
      return 0.9;
    default:
      return 1;
  }
}

/** Everything a Hollow attempt needs built, with burn-in not yet run. */
interface Unburned {
  map: WorldMap;
  flora: Flora;
  species: PlantSpecies[];
  minerals: MineralField;
  landscape: FitnessLandscape;
  canopy: CanopyField;
}

/**
 * Build one candidate island and its ecology, up to but not including burn-in.
 * Split out so the synchronous and chunked-async paths run identical setup —
 * every rng draw here happens in the same order either way, so the two produce
 * the same island from the same seed.
 */
function setUp(seed: number): Unburned {
  const map = generate(seed, HOLLOW_CONFIG);
  const minerals = mineralFieldFor(map, seed);
  const landscape = landscapeFor(seed);
  const canopy = new CanopyField(map.width, map.height);
  // `flora` is read by the selection callback below, which cannot run before
  // the constructor returns, so the deferred binding is safe.
  let flora!: Flora;
  // Refresh bookkeeping. The canopy is rebuilt from the whole population, so
  // it is refreshed on a tick boundary rather than per examination: the first
  // plant examined in a refresh tick rebuilds it, the other 8,000 read it.
  // `Flora.tick` is deterministic, so which tick triggers a refresh is too.
  let refreshedAt = -1;
  const species = applyHueKey(generatePlantSpecies(seed), seed);
  flora = new Flora(map, species, seed, {
    // Burn-in examines every living plant each tick. The default simBudget of
    // 480 against a population near 8000 reaches 6% of the island per tick,
    // which turns 400 ticks into about 1.4 reproductions per plant instead of
    // about 24 — measured, 62.7% of the population born during burn-in at 480
    // against 100% at full coverage. burnIn throws if this is left at the
    // default, because the resulting island looks correct and is not.
    simBudget: BURN_IN_SIM_BUDGET,
    selection: {
      fitness(g, tx, ty) {
        if (flora.tick - refreshedAt >= CANOPY_REFRESH_TICKS) {
          canopy.refresh(flora);
          refreshedAt = flora.tick;
        }
        const supply = minerals.sample(tx, ty);
        // The plant's own shade is excluded: it is not standing in its own
        // shadow, and leaving it in makes the light it is scored against a
        // function of its own height.
        const light =
          terrainLight(map, tx, ty) *
          canopy.lightExcluding(tx, ty, CanopyField.shadeOfGenome(g));
        const f = landscape.score(g, { minerals: supply, light });
        // Growing costs what it draws. A plant that cannot get what it demands
        // has already been scored down; drawing it down is what makes the next
        // plant's shortage real.
        minerals.draw(tx, ty, landscape.demandOf(g), 0.002);
        return f;
      },
    },
  });
  return { map, flora, species, minerals, landscape, canopy };
}

/**
 * Finish an attempt once burn-in has run. Leaves the canopy consistent with
 * the population that is actually returned, not with whichever refresh tick
 * burn-in happened to stop after.
 */
function finish(u: Unburned, report: BurnInReport): Hollow {
  u.canopy.refresh(u.flora);
  return { ...u, report };
}

function attempt(seed: number, onProgress?: (d: number, t: number) => void): Hollow {
  const u = setUp(seed);
  return finish(u, burnIn(u.flora, BURN_IN_GENERATIONS, onProgress));
}

async function attemptAsync(
  seed: number,
  onProgress?: (d: number, t: number) => void,
): Promise<Hollow> {
  const u = setUp(seed);
  return finish(u, await burnInAsync(u.flora, BURN_IN_GENERATIONS, onProgress));
}

/**
 * Light reaching the ground on a tile of a finished Hollow: terrain times
 * canopy, the same product the selection callback used during burn-in.
 */
export function hollowLightAt(h: Hollow, tx: number, ty: number, ownShade = 0): number {
  return terrainLight(h.map, tx, ty) * h.canopy.lightExcluding(tx, ty, ownShade);
}

/**
 * The reroll loop, separated from island building so it can be tested without
 * a burn-in. Calls `build` with `seed`, then `seed + 1`, `seed + 2`, ... while
 * the report says the species floor was missed, up to MAX_ATTEMPTS. Returns
 * the last result either way: after MAX_ATTEMPTS it is returned with floorHit
 * still set rather than throwing, so a caller that wants to refuse can read
 * the report.
 */
export function pickAttempt<T extends { report: { floorHit: boolean } }>(
  seed: number,
  build: (s: number) => T,
): T {
  let last = build(seed);
  for (let i = 1; i < MAX_ATTEMPTS && last.report.floorHit; i++) last = build(seed + i);
  return last;
}

/**
 * Build a Hollow. Rerolls deterministically past a burn-in that leaves too few
 * species, the way worldgen already rerolls past an island with too little
 * land. See pickAttempt for the retry rule.
 */
export function makeHollow(
  seed: number,
  onProgress?: (done: number, total: number) => void,
): Hollow {
  return pickAttempt(seed, (s) => attempt(s, onProgress));
}

/** pickAttempt's rule, awaiting each attempt. Same seeds, same order. */
export async function pickAttemptAsync<T extends { report: { floorHit: boolean } }>(
  seed: number,
  build: (s: number) => Promise<T>,
): Promise<T> {
  let last = await build(seed);
  for (let i = 1; i < MAX_ATTEMPTS && last.report.floorHit; i++) last = await build(seed + i);
  return last;
}

/**
 * makeHollow for interactive callers: the same island from the same seed, but
 * burn-in runs in chunks that hand the thread back so the browser can paint
 * between them. Use this anywhere a click is waiting on the result — the whole
 * call costs 6.2-7.0 s (measured, five seeds), which run synchronously freezes
 * the tab for that entire span and paints no progress at all.
 *
 * `onProgress(done, total)` reports generations within the CURRENT attempt, so
 * a reroll restarts the count at 0 of 400.
 */
export async function makeHollowAsync(
  seed: number,
  onProgress?: (done: number, total: number) => void,
): Promise<Hollow> {
  return pickAttemptAsync(seed, (s) => attemptAsync(s, onProgress));
}
