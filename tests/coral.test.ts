import { expect, test } from "vitest";
import { generateCritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { generate } from "../src/world/generate";
import { Tile } from "../src/world/types";

test("coral colonizes the shallows of many islands", () => {
  let islandsWithCoral = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const corals = generatePlantSpecies(seed).filter(
      (s) => s.archetype.form === PlantForm.Coral,
    );
    if (corals.length > 0) islandsWithCoral++;
    for (const c of corals) {
      expect(c.habitat).toBe(Tile.ShallowWater);
      if (!c.sport) {
        expect(c.archetype.height).toBeGreaterThanOrEqual(0.15);
        expect(c.archetype.height).toBeLessThanOrEqual(0.6);
      }
    }
  }
  expect(islandsWithCoral).toBeGreaterThan(10); // coral carries half the shallows' pool weight
});

test("critters never crave the seabed - coral is not forage", () => {
  for (const seed of [42, 777]) {
    const map = generate(seed);
    const species = generatePlantSpecies(seed);
    const flora = new Flora(map, species, seed);
    for (const c of generateCritterSpecies(seed, map, flora, species)) {
      expect(species[c.favoriteSpecies].archetype.form).not.toBe(PlantForm.Coral);
      expect(species[c.favoriteSpecies].archetype.form).not.toBe(PlantForm.Tree);
    }
  }
});
