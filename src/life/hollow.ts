import { HOLLOW_CONFIG } from "../world/config";
import { generate } from "../world/generate";
import { Tile, WorldMap, tileAt } from "../world/types";
import {
  BURN_IN_GENERATIONS,
  BURN_IN_SIM_BUDGET,
  BURN_IN_YIELD_EVERY,
  BurnInReport,
  SwarmTicker,
  burnIn,
  burnInAsync,
} from "./burnin";
import { PlantSpecies } from "./species";
import { FitnessLandscape, landscapeFor } from "./fitness";
import { Flora, FloraTuning } from "./flora";
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

/**
 * Builds the insect layer a Hollow burns in with, given the island the burn-in
 * is about to run on. Injected by the caller: `SwarmLayer` lives in
 * `src/game/`, and `src/life/` must not import from there.
 *
 * Called once per ATTEMPT, after the Flora exists and before the first
 * generation, so every reroll gets its own layer and a discarded attempt's
 * insects are discarded with it. Must be deterministic in `seed` — the seed
 * passed is the attempt's seed (`makeHollow`'s seed plus its offset), the same
 * number the map, species and mineral field were built from.
 *
 * `S` is the concrete layer type so the caller gets its own class back out of
 * `Hollow.swarms` rather than the `tick`-only view burn-in needs.
 */
export type HollowSwarmFactory<S extends SwarmTicker> = (
  seed: number,
  species: PlantSpecies[],
  flora: Flora,
  map: WorldMap,
) => S;

export interface Hollow<S extends SwarmTicker = SwarmTicker> {
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
  /**
   * Which reroll produced this island: 0 for the first attempt, 1 for the
   * second, up to MAX_ATTEMPTS - 1. The accepted map, species list, mineral
   * field and landscape were all built from `seed + attemptOffset`, never from
   * `seed` itself unless this is 0. Recorded because the reroll is driven by
   * the BURN-IN OUTCOME (see pickAttempt), so the seed alone does not say which
   * island you got — rebuilding it without this number means re-running a
   * 400-generation burn-in, measured at 6.2-7.0 s across five seeds.
   */
  attemptOffset: number;
  /**
   * The insect layer that lived through this island's burn-in — the same
   * object, so the pollinators the player meets are the ones whose colour was
   * selected against these flowers. Null when no factory was passed, which is
   * every caller that wants the pre-insect burn-in (plants competing alone).
   *
   * A caller that rebuilds its own layer from the seed instead of adopting
   * this one throws the co-evolution away and gets fresh, unselected swarms.
   */
  swarms: S | null;
}

/** One Hollow attempt, before the reroll loop has said which one it is. */
type HollowAttempt<S extends SwarmTicker> = Omit<Hollow<S>, "attemptOffset">;

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
interface Unburned<S extends SwarmTicker> {
  map: WorldMap;
  flora: Flora;
  species: PlantSpecies[];
  minerals: MineralField;
  landscape: FitnessLandscape;
  canopy: CanopyField;
  swarms: S | null;
}

/**
 * The three fields a Hollow's flora is scored against, plus the Flora tuning
 * that reads them. `simBudget` is BURN_IN_SIM_BUDGET (10000), `selection` is
 * the mineral-and-light fitness callback, and `chains` is false (see below).
 */
export interface HollowEcology {
  minerals: MineralField;
  landscape: FitnessLandscape;
  canopy: CanopyField;
  tuning: Pick<FloraTuning, "simBudget" | "selection" | "chains">;
}

/**
 * Build the mineral field, fitness landscape and canopy for a Hollow map, and
 * the Flora tuning that scores plants against them.
 *
 * `getFlora` returns the Flora the tuning will be handed to. It is a getter
 * because the selection callback must name a Flora that does not exist until
 * the constructor it is passed to returns; the callback cannot run before
 * then, so the deferred read is safe.
 *
 * Exported so a Hollow RESTORED from a save is scored by the same selection
 * context that built it. Rebuilding a Hollow's Flora with the default tuning
 * (selection: null) would make the island drift instead of select — the same
 * plants, no longer under the pressure that shaped them.
 */
export function hollowEcology(map: WorldMap, seed: number, getFlora: () => Flora): HollowEcology {
  const minerals = mineralFieldFor(map, seed);
  const landscape = landscapeFor(seed);
  const canopy = new CanopyField(map.width, map.height);
  // Refresh bookkeeping. The canopy is rebuilt from the whole population, so
  // it is refreshed on a tick boundary rather than per examination: the first
  // plant examined in a refresh tick rebuilds it, the other 8,000 read it.
  // `Flora.tick` is deterministic, so which tick triggers a refresh is too.
  let refreshedAt = -1;
  return {
    minerals,
    landscape,
    canopy,
    tuning: {
      // Burn-in examines every living plant each tick. The default simBudget of
      // 480 against a population near 8000 reaches 6% of the island per tick,
      // which turns 400 ticks into about 1.4 reproductions per plant instead of
      // about 24 — measured, 62.7% of the population born during burn-in at 480
      // against 100% at full coverage. burnIn throws if this is left at the
      // default, because the resulting island looks correct and is not.
      simBudget: BURN_IN_SIM_BUDGET,
      // Byproduct chains (`Flora.substrates`: emitted substrates that later
      // germinate) are OFF on a Hollow, on both the fresh and the resumed
      // path, and this field is what states it in one place — `hollowEcology`
      // is the tuning both paths use, so neither can pick a different answer.
      //
      // Chosen off, not inherited: every number in §12 of
      // docs/03-ECOLOGY-DESIGN-SPACE.md — the 400-generation burn-in, the
      // selection-beats-drift margin, the reroll floor — was measured with
      // chains off, and a Hollow's substrates are not serialised, so a resumed
      // island with chains on would start with an empty substrate list against
      // a population that had been emitting for 400 generations. Turning them
      // on is a stage-2 change that has to be re-measured and saved, not a
      // default to fall into.
      chains: false,
      selection: {
        fitness(g, tx, ty) {
          const flora = getFlora();
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
    },
  };
}

/**
 * Build one candidate island and its ecology, up to but not including burn-in.
 * Split out so the synchronous and chunked-async paths run identical setup —
 * every rng draw here happens in the same order either way, so the two produce
 * the same island from the same seed.
 */
function setUp<S extends SwarmTicker>(
  seed: number,
  makeSwarms?: HollowSwarmFactory<S>,
): Unburned<S> {
  const map = generate(seed, HOLLOW_CONFIG);
  let flora!: Flora;
  const eco = hollowEcology(map, seed, () => flora);
  const species = applyHueKey(generatePlantSpecies(seed), seed);
  flora = new Flora(map, species, seed, eco.tuning);
  // Built AFTER the Flora and BEFORE the first generation, so the swarms are
  // seeded on the founder plants and then selected against everything the
  // burn-in does to them. The factory draws only from its own salted Rng, so
  // the map, species list, mineral field and landscape above are unchanged by
  // its presence — an island burned in without insects has the same terrain.
  const swarms = makeSwarms ? makeSwarms(seed, species, flora, map) : null;
  return {
    map,
    flora,
    species,
    minerals: eco.minerals,
    landscape: eco.landscape,
    canopy: eco.canopy,
    swarms,
  };
}

/**
 * Finish an attempt once burn-in has run. Leaves the canopy consistent with
 * the population that is actually returned, not with whichever refresh tick
 * burn-in happened to stop after.
 */
function finish<S extends SwarmTicker>(u: Unburned<S>, report: BurnInReport): HollowAttempt<S> {
  u.canopy.refresh(u.flora);
  return { ...u, report };
}

function attempt<S extends SwarmTicker>(
  seed: number,
  onProgress?: (d: number, t: number) => void,
  makeSwarms?: HollowSwarmFactory<S>,
): HollowAttempt<S> {
  const u = setUp(seed, makeSwarms);
  return finish(u, burnIn(u.flora, BURN_IN_GENERATIONS, onProgress, u.swarms ?? undefined));
}

async function attemptAsync<S extends SwarmTicker>(
  seed: number,
  onProgress?: (d: number, t: number) => void,
  makeSwarms?: HollowSwarmFactory<S>,
): Promise<HollowAttempt<S>> {
  const u = setUp(seed, makeSwarms);
  return finish(
    u,
    await burnInAsync(
      u.flora,
      BURN_IN_GENERATIONS,
      onProgress,
      BURN_IN_YIELD_EVERY,
      u.swarms ?? undefined,
    ),
  );
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
 *
 * `build` receives the offset as well as the seed, so the caller can record
 * WHICH attempt was accepted — the one number a save needs to rebuild this
 * island without re-running burn-in (see Hollow.attemptOffset).
 */
export function pickAttempt<T extends { report: { floorHit: boolean } }>(
  seed: number,
  build: (s: number, offset: number) => T,
): T {
  let last = build(seed, 0);
  for (let i = 1; i < MAX_ATTEMPTS && last.report.floorHit; i++) last = build(seed + i, i);
  return last;
}

/**
 * Build a Hollow. Rerolls deterministically past a burn-in that leaves too few
 * species, the way worldgen already rerolls past an island with too little
 * land. See pickAttempt for the retry rule.
 */
export function makeHollow<S extends SwarmTicker>(
  seed: number,
  onProgress?: (done: number, total: number) => void,
  makeSwarms?: HollowSwarmFactory<S>,
): Hollow<S> {
  return pickAttempt(seed, (s, offset) => ({
    ...attempt(s, onProgress, makeSwarms),
    attemptOffset: offset,
  }));
}

/** pickAttempt's rule, awaiting each attempt. Same seeds, same order. */
export async function pickAttemptAsync<T extends { report: { floorHit: boolean } }>(
  seed: number,
  build: (s: number, offset: number) => Promise<T>,
): Promise<T> {
  let last = await build(seed, 0);
  for (let i = 1; i < MAX_ATTEMPTS && last.report.floorHit; i++) last = await build(seed + i, i);
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
export async function makeHollowAsync<S extends SwarmTicker>(
  seed: number,
  onProgress?: (done: number, total: number) => void,
  makeSwarms?: HollowSwarmFactory<S>,
): Promise<Hollow<S>> {
  return pickAttemptAsync(seed, async (s, offset) => ({
    ...(await attemptAsync(s, onProgress, makeSwarms)),
    attemptOffset: offset,
  }));
}
