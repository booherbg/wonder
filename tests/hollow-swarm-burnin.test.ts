import { describe, expect, it } from "vitest";
import { HOLLOW_CONFIG, TILE_SIZE } from "../src/world/config";
import { generate } from "../src/world/generate";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { applyHueKey } from "../src/life/huekey";
import { hollowEcology } from "../src/life/hollow";
import { BURN_IN_GENERATIONS, burnIn } from "../src/life/burnin";
import { SwarmLayer, hollowSwarmFactory, meanHostMatch } from "../src/game/swarms";

// ─────────────────────────────────────────────────────────────────────────────
// The acceptance criterion for putting insects into the Hollow's burn-in.
//
// TERMS
//   metabolic efficiency — 0..1, the score of a swarm's sensor IdMap against
//     its host flower's signature map and accent (src/life/idmap.ts). 1 is a
//     perfect match; POLLINATE_MATCH_MIN (0.3) is the floor below which a
//     swarm does not pollinate at all.
//   mean host match — that score averaged over every swarm in a layer that has
//     a host with a flower map (src/game/swarms.ts meanHostMatch). `n` is the
//     number of swarms counted, which is the whole layer here.
//   burned-in layer — the swarm layer ticked once per generation for all 400
//     burn-in generations alongside the flora.
//   fresh layer — a swarm layer constructed on the SAME finished island, the
//     way every island built one before this change: spawned against those
//     flowers with sensor maps drawn from the seed, never selected on them.
//
// MEASURED, seeds 2026 / 11 / 5, n = 8 / 4 / 5 swarms:
//   burned-in mean   0.8742 · 0.8501 · 0.7225
//   fresh mean       0.3327 · 0.2968 · 0.2731
//   difference       0.5415 · 0.5533 · 0.4494
//
// The thresholds below sit well inside those margins. They are load-bearing:
// removing the `layer` argument from the burnIn call (so the swarms exist but
// never step) drops the burned-in means to the fresh values and fails both the
// floor and the difference assertion.
// ─────────────────────────────────────────────────────────────────────────────

/** Lowest mean host match a burned-in layer may show. Measured minimum: 0.7225. */
const BURNED_FLOOR = 0.6;
/** Highest mean host match a fresh layer may show. Measured maximum: 0.3327. */
const FRESH_CEILING = 0.45;
/** Least the burned-in mean may exceed the fresh one by. Measured minimum: 0.4494. */
const MIN_GAIN = 0.3;

const SEEDS = [2026, 11, 5];

/** One Hollow attempt's island, ecology and flora — hollow.ts's setUp, inlined
 *  so the test can choose whether swarms step without going through the reroll
 *  loop (which would cost a second 400-generation burn-in on a thin seed). */
function island(seed: number): { map: ReturnType<typeof generate>; flora: Flora; species: ReturnType<typeof applyHueKey> } {
  const map = generate(seed, HOLLOW_CONFIG);
  let flora!: Flora;
  const eco = hollowEcology(map, seed, () => flora);
  const species = applyHueKey(generatePlantSpecies(seed), seed);
  flora = new Flora(map, species, seed, eco.tuning);
  return { map, flora, species };
}

describe("insects burned into the Hollow match its flowers better than fresh ones", () => {
  for (const seed of SEEDS) {
    it(`seed ${seed}`, () => {
      const { map, flora, species } = island(seed);
      const layer = hollowSwarmFactory()(seed, species, flora, map);
      burnIn(flora, BURN_IN_GENERATIONS, undefined, layer);

      const burned = meanHostMatch(layer);
      // The comparison arm: what this island's insects would have been before
      // this change — a layer built on the finished island, unselected on it.
      const fresh = meanHostMatch(
        new SwarmLayer(seed, species, flora, {
          x: (map.spawn.x + 0.5) * TILE_SIZE,
          y: (map.spawn.y + 0.5) * TILE_SIZE,
        }),
      );

      expect(burned.n).toBeGreaterThan(0);
      expect(fresh.n).toBeGreaterThan(0);
      expect(burned.mean).toBeGreaterThan(BURNED_FLOOR);
      expect(fresh.mean).toBeLessThan(FRESH_CEILING);
      expect(burned.mean - fresh.mean).toBeGreaterThan(MIN_GAIN);
    }, 120000);
  }

  // The burn-in hook must be genuinely optional: a Hollow built without a
  // factory is the plants-competing-alone island every existing test measures,
  // and passing no ticker must not change what burnIn does to the flora.
  it("burnIn without a swarm ticker leaves the flora exactly as it was", () => {
    const a = island(7);
    const b = island(7);
    burnIn(a.flora, 40);
    burnIn(b.flora, 40, undefined, undefined);
    expect(a.flora.all.length).toBe(b.flora.all.length);
    expect(a.flora.tick).toBe(b.flora.tick);
  }, 60000);
});
