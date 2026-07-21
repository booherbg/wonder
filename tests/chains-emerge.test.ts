import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { generateCritterSpecies, spawnCritters, updateCritter } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generateCraterEndemics, generatePlantSpecies } from "../src/life/species";
import { generate } from "../src/world/generate";

// The pioneer/decomposer forms a byproduct-fed chain routes through. A
// substrate stamped with one of these forms means a disperser ate a
// substrate-feeder — the chain's second link, its continuation.
const FEEDER_FORMS = new Set([PlantForm.Moss, PlantForm.Fungus, PlantForm.Sporestalk]);

// Drive the whole stack the way the game loop does: advance every critter each
// frame (feeding drives emission) and beat the flora sim on a fixed cadence
// (decay + germination). Fully seeded — critters, flora, and spawns all draw
// from the seed — so this is deterministic, never flaky.
function simulate(seed: number, steps = 6000, tickEvery = 20) {
  const map = generate(seed);
  const plants = generatePlantSpecies(seed);
  if (map.crater) plants.push(...generateCraterEndemics(seed, map.crater, plants.length));
  const flora = new Flora(map, plants, seed, { chains: true });
  const critterSpecies = generateCritterSpecies(seed, map, flora, plants);
  const critters = spawnCritters(critterSpecies, map, seed);
  const rng = makeRng(seed ^ 0xcafe);
  const dt = 1 / 30;
  let sawFeederSubstrate = false; // a sprouted (or any) feeder was itself eaten → the chain continued
  for (let i = 0; i < steps; i++) {
    for (const c of critters) updateCritter(c, dt, map, flora, critterSpecies, null, rng);
    if (i % tickEvery === 0) {
      flora.simTick();
      if (flora.substrates.some((s) => FEEDER_FORMS.has(s.form))) sawFeederSubstrate = true;
    }
  }
  return { germinations: flora.germinations, sawFeederSubstrate };
}

test(
  "a multi-link chain emerges on the legendary seed and stays flat on a flat one",
  () => {
    // seed 2438 "Polpol Skerry" — the pinned champion (diversityScore ~44)
    const rich = simulate(2438);
    // link one: byproducts sprout substrate-feeders that no one scattered here
    expect(rich.germinations).toBeGreaterThan(0);
    // link two (closure): a feeder is itself eaten, emitting its own byproduct —
    // D → substrate(P) → S germinates → S eaten → substrate(S). A real chain,
    // never authored — it falls out of this seed's trait mix.
    expect(rich.sawFeederSubstrate).toBe(true);

    // seed 42 — a plainer island: fewer of its disperser-eaten plants stamp a
    // substrate a feeder can take, so far less germinates than on the champion.
    const flat = simulate(42);
    // emergence tracks the seed's trait mix, not code: the champion germinates
    // markedly more than a plain isle. (Seed 42 once read a fluke ~0, but that
    // near-zero leaned on critters wandering uselessly out into the sea; now
    // that a land animal forages the land instead of the ocean it emerges a
    // modest handful — still well shy of the champion. rich >> flat is the claim.)
    expect(flat.germinations).toBeLessThan(rich.germinations * 0.6);
  },
  30_000,
);
