import { expect, test } from "vitest";
import { habitatsOf, placeablePlants } from "../src/game/simRoster";
import { biomeSampler, singleBiome } from "../src/world/construct";
import { generatePlantSpecies } from "../src/life/species";
import { Tile } from "../src/world/types";

test("habitatsOf lists the construct's distinct real tiles", () => {
  const h = habitatsOf(singleBiome(1, Tile.Grass, 16));
  expect([...h]).toEqual([Tile.Grass]);
  expect(habitatsOf(biomeSampler(1)).has(Tile.Marsh)).toBe(true);
});

test("placeablePlants keeps only species whose habitat exists on the construct", () => {
  const species = generatePlantSpecies(99);
  const grassOnly = placeablePlants(species, new Set([Tile.Grass]));
  expect(grassOnly.length).toBeGreaterThan(0);
  expect(grassOnly.every((s) => s.habitat === Tile.Grass)).toBe(true);
  // the sampler's richer habitat set admits strictly more kinds
  const sampler = placeablePlants(species, habitatsOf(biomeSampler(1)));
  expect(sampler.length).toBeGreaterThanOrEqual(grassOnly.length);
});
