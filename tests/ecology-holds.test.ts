import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { generateCritterSpecies, spawnCritters, updateCritter } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { generate } from "../src/world/generate";

// An island run for a long stretch must not collapse — the finite-space
// balancer (per-tile caps + crowding thinning) should hold it at a lush
// ceiling while critters graze and disperse, not crash it to a bare rock.
// A guard against a tuning change quietly turning the peaceful sim into a
// boom-bust one.
test("a real island holds its life over a long run — no collapse", () => {
  const seed = 20; // ~53% water: plenty of habitat edges to stress the balance
  const map = generate(seed);
  const plants = generatePlantSpecies(seed);
  const flora = new Flora(map, plants, seed);
  const species = generateCritterSpecies(seed, map, flora, plants);
  const critters = spawnCritters(species, map, seed);
  const rng = makeRng(seed ^ 0x50f7);
  const start = flora.count;
  const startKinds = [...flora.speciesCounts].filter(([, n]) => n > 0).length;
  let minPlants = start;

  for (let t = 0; t < 3000; t++) {
    const darkness = t % 90 < 36 ? 0.8 : 0; // a day/night so critters graze then den
    for (let s = 0; s < 2; s++) {
      for (const c of critters) updateCritter(c, 1, map, flora, species, null, rng, { darkness });
    }
    flora.simTick();
    minPlants = Math.min(minPlants, flora.count);
  }
  const liveKinds = [...flora.speciesCounts].filter(([, n]) => n > 0).length;

  // never crashes toward empty: the island stays well-populated throughout
  expect(minPlants).toBeGreaterThan(start * 0.6);
  // biodiversity holds — succession may drop a kind or two, never most of them
  expect(liveKinds).toBeGreaterThanOrEqual(Math.max(8, Math.floor(startKinds * 0.6)));
});
