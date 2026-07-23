import { expect, test } from "vitest";
import { SimKernel } from "../src/life/kernel";
import { Flora } from "../src/life/flora";
import { generateCritterSpecies } from "../src/life/fauna";
import { generatePlantSpecies } from "../src/life/species";
import { singleBiome } from "../src/world/construct";
import { Tile } from "../src/world/types";
import { TILE_SIZE } from "../src/world/config";

test("eraseAtTile removes plants and critters on that tile; species defs remain", () => {
  const map = singleBiome(7, Tile.Grass, 12);
  const plants = generatePlantSpecies(7);
  const grass = plants.find((p) => p.habitat === Tile.Grass) ?? plants[0];
  const scratch = new Flora(map, plants, 7, {}, { tick: 0, plants: [] });
  const critters = generateCritterSpecies(7, map, scratch, plants);
  const kernel = new SimKernel({
    map,
    plantSpecies: plants,
    critterSpecies: critters,
    seed: 7,
  });
  const tx = 4;
  const ty = 4;
  const wx = (tx + 0.5) * TILE_SIZE;
  const wy = (ty + 0.5) * TILE_SIZE;
  expect(kernel.placePlant(grass.id, wx, wy)).not.toBeNull();
  kernel.placeCritter(0, wx, wy);
  expect(kernel.flora.all.length).toBeGreaterThan(0);
  expect(kernel.critters.length).toBe(1);
  const nSpecies = kernel.plantSpecies.length;
  const nCritterKinds = kernel.critterSpecies.length;
  const erased = kernel.eraseAtTile(tx, ty);
  expect(erased.plants).toBeGreaterThanOrEqual(1);
  expect(erased.critters).toBe(1);
  expect(
    kernel.flora.all.filter((p) => Math.floor(p.x / TILE_SIZE) === tx && Math.floor(p.y / TILE_SIZE) === ty),
  ).toHaveLength(0);
  expect(
    kernel.critters.filter((c) => Math.floor(c.x / TILE_SIZE) === tx && Math.floor(c.y / TILE_SIZE) === ty),
  ).toHaveLength(0);
  expect(kernel.plantSpecies.length).toBe(nSpecies);
  expect(kernel.critterSpecies.length).toBe(nCritterKinds);
});
