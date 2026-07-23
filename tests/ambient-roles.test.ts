import { expect, test } from "vitest";
import { generateCritterSpecies } from "../src/life/fauna";
import type { CritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { chainStats } from "../src/life/foodweb";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import type { PlantSpecies } from "../src/life/species";
import { biomeSampler } from "../src/world/construct";
import { Tile } from "../src/world/types";

// Real play's ONLY critter-role writer is generateCritterSpecies (fauna.ts:507),
// a closed choice between "grazer" and "disperser". Adding bench-only literals to
// the union must stay structurally impossible for ordinary generation to produce
// — the same additive idiom as Flora.suppressedSpecies / FloraTuning.chains.
test(
  "real-play generation never yields the bench-only roles (and does exercise both real ones)",
  () => {
    let sawGrazer = false;
    let sawDisperser = false;
    for (let seed = 1; seed <= 60; seed++) {
      const map = biomeSampler(seed);
      const plants = generatePlantSpecies(seed);
      const flora = new Flora(map, plants, seed);
      const species = generateCritterSpecies(seed, map, flora, plants);
      for (const sp of species) {
        expect(sp.role === "grazer" || sp.role === "disperser").toBe(true);
        if (sp.role === "grazer") sawGrazer = true;
        if (sp.role === "disperser") sawDisperser = true;
      }
    }
    // proves the two-literal space is genuinely exercised — the assertion above
    // isn't vacuously passing on an all-disperser roster.
    expect(sawGrazer).toBe(true);
    expect(sawDisperser).toBe(true);
  },
  20_000,
);

// The one place the union type leaks into shared code: foodweb's chain-stats
// filters `role === "disperser"`. An equality check silently ignores any new
// literal — a pollinator/shuttle/fish critter simply isn't a disperser. This pins
// that NO foodweb change is needed: flipping a disperser to a new role drops it
// from the chain-stats, it never mis-counts.
test("foodweb ignores the new roles: flipping a disperser to pollinator drops it from chain-stats", () => {
  const g = (hue: number) => ({
    form: PlantForm.Flower, hue, hue2: hue, sat: 0.6, height: 0.4,
    spread: 0.4, petals: 5, leaves: 3, lean: 0, glow: 0.5,
  });
  const source = { id: 0, name: "src", habitat: Tile.Grass, archetype: g(0.5), substrateFeeder: false } as unknown as PlantSpecies;
  const feeder = { id: 1, name: "fdr", habitat: Tile.Grass, archetype: g(0.5), substrateFeeder: true } as unknown as PlantSpecies;
  const plants = [source, feeder];
  const disperser = {
    id: 0, role: "disperser",
    palate: { form: PlantForm.Flower, hueCenter: 0.5, hueWidth: 0.3, glowTaste: 0 },
  } as unknown as CritterSpecies;

  const withDisperser = chainStats(plants, [disperser]);
  expect(withDisperser.chains).toBeGreaterThan(0); // a real (P,S) link exists

  const pollinator = { ...disperser, role: "pollinator" } as CritterSpecies;
  const withPollinator = chainStats(plants, [pollinator]);
  expect(withPollinator.chains).toBe(0); // the new role is NOT a disperser — no foodweb change needed
});
