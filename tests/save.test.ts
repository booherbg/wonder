import { expect, test } from "vitest";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { packGenome, packWorld, restoreInventory, restorePlants, unpackGenome } from "../src/game/save";
import { generate } from "../src/world/generate";

const SEED = 42;

test("genome pack/unpack round-trips within rounding tolerance", () => {
  const species = generatePlantSpecies(SEED);
  const g = species[0].archetype;
  const back = unpackGenome(g.form, packGenome(g));
  expect(back.form).toBe(g.form);
  expect(back.hue).toBeCloseTo(g.hue, 3);
  expect(back.height).toBeCloseTo(g.height, 3);
  expect(back.glow).toBeCloseTo(g.glow, 3);
});

test("a saved world restores its plants, inventory, and drifted genomes", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  for (let i = 0; i < 20; i++) flora.simTick();
  const sample = flora.all[100];
  const inv = { seeds: [{ species: sample.species, genome: sample.genome }] };
  const saved = packWorld(SEED, flora.tick, { x: 500, y: 600 }, { x: 30, y: 31 }, inv, flora.all, 1234);

  const restored = new Flora(map, species, SEED, {}, {
    tick: saved.tick,
    plants: restorePlants(saved, species),
  });
  expect(restored.count).toBe(flora.count);
  expect(restored.tick).toBe(flora.tick);
  // habitat invariant still holds after restore (addPlant re-validates)
  for (const [key, bucket] of restored.byTile) {
    for (const p of bucket) {
      expect(map.tiles[key]).toBe(species[p.species].habitat);
    }
  }
  const invBack = restoreInventory(saved, species);
  expect(invBack.seeds).toHaveLength(1);
  expect(invBack.seeds[0].genome.hue).toBeCloseTo(sample.genome.hue, 3);
  expect(saved.home).toEqual([30, 31]);
});

test("the garden bed is a 3x3 around home and boosts survival semantics", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  flora.setHome(50, 60);
  expect(flora.inGarden(50 * 16 + 8, 60 * 16 + 8)).toBe(true);
  expect(flora.inGarden(49 * 16 + 8, 61 * 16 + 8)).toBe(true); // corner of the 3x3
  expect(flora.inGarden(47 * 16 + 8, 60 * 16 + 8)).toBe(false); // two tiles out
  flora.setHome(null);
  expect(flora.inGarden(50 * 16 + 8, 60 * 16 + 8)).toBe(false);
});
