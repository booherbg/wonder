import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import {
  drawerEntryForClone,
  introduceClonedPlant,
  mutateClonePreview,
  snapshotClone,
} from "../src/game/simCloneFlower";
import { SwarmLayer, canFlower } from "../src/game/swarms";
import { SimKernel } from "../src/life/kernel";
import { generateCritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { singleBiome } from "../src/world/construct";
import { Tile } from "../src/world/types";
import { TILE_SIZE } from "../src/world/config";

function bench(seed: number) {
  const map = singleBiome(seed, Tile.Grass, 16);
  const species = generatePlantSpecies(seed);
  const flowerSp =
    species.find((s) => s.habitat === Tile.Grass && canFlower(s.archetype.form)) ?? species[0];
  const scratch = new Flora(map, species, seed, {}, { tick: 0, plants: [] });
  const critters = generateCritterSpecies(seed, map, scratch, species);
  const kernel = new SimKernel({ map, plantSpecies: species, critterSpecies: critters, seed });
  const layer = new SwarmLayer(seed, species, kernel.flora, undefined, {
    perPlantNectar: true,
    autoSpawn: false,
    predation: 0,
  });
  return { kernel, layer, flowerSp };
}

test("introduceClonedPlant assigns a new species id and custom flower map", () => {
  const { kernel, layer, flowerSp } = bench(42);
  const parentId = flowerSp.id;
  const parentCount = kernel.plantSpecies.length;
  const parentFlower = layer.flowerFor(parentId)!;
  const preview = snapshotClone(flowerSp, parentFlower, 0.08);
  const mutated = mutateClonePreview(preview, makeRng(99));
  const newId = introduceClonedPlant(kernel, layer, mutated, makeRng(7));

  expect(newId).toBe(parentCount);
  expect(newId).not.toBe(parentId);
  expect(kernel.plantSpecies[newId].parent).toBe(parentId);
  const custom = layer.flowerFor(newId)!;
  expect(custom.map).not.toEqual(parentFlower.map);
  expect(custom.map).toEqual(mutated.map);
});

test("drawerEntryForClone records cloned origin with parent link", () => {
  const { kernel, layer, flowerSp } = bench(3);
  const preview = snapshotClone(flowerSp, layer.flowerFor(flowerSp.id)!, 0.05);
  const id = introduceClonedPlant(kernel, layer, preview, makeRng(1));
  const entry = drawerEntryForClone(id, kernel.plantSpecies[id], flowerSp.id);
  expect(entry.origin).toBe("cloned");
  expect(entry.parentId).toBe(flowerSp.id);
  expect(entry.speciesId).toBe(id);
});

test("cloned cousin is placeable on the construct", () => {
  const { kernel, layer, flowerSp } = bench(5);
  const preview = snapshotClone(flowerSp, layer.flowerFor(flowerSp.id)!, 0.06);
  const id = introduceClonedPlant(kernel, layer, preview, makeRng(2));
  const wx = 4 * TILE_SIZE + TILE_SIZE / 2;
  const wy = 4 * TILE_SIZE + TILE_SIZE / 2;
  const p = kernel.placePlant(id, wx, wy);
  expect(p).not.toBeNull();
  expect(p!.species).toBe(id);
});
