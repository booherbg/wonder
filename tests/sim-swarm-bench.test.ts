import { expect, test, vi } from "vitest";
import { SwarmLayer, NECTAR_EMPTY_THRESHOLD, canFlower } from "../src/game/swarms";
import { DEFAULT_POLLINATE_ASSIST } from "../src/life/pollinateAssist";
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
  layer.pollinateAssist = { ...DEFAULT_POLLINATE_ASSIST };
  return { kernel, layer, flowerSp };
}

function placeBloom(kernel: SimKernel, speciesId: number, tx: number, ty: number) {
  const wx = (tx + 0.5) * TILE_SIZE;
  const wy = (ty + 0.5) * TILE_SIZE;
  const p = kernel.placePlant(speciesId, wx, wy);
  expect(p).not.toBeNull();
  return p!;
}

test("per-plant nectar drains one bloom without emptying its sibling", () => {
  const { kernel, layer, flowerSp } = bench(42);
  const a = placeBloom(kernel, flowerSp.id, 5, 5);
  const b = placeBloom(kernel, flowerSp.id, 7, 5);
  const cloud = layer.inviteCloud(kernel.flora, a)!;
  expect(cloud).toBeTruthy();
  for (let t = 0; t < 30; t++) layer.tick(kernel.flora);
  expect(layer.nectarOf(a)).toBeLessThan(0.5);
  expect(layer.nectarOf(b)).toBeGreaterThan(0.9);
});

test("placeCloud adds a swarm near blooms", () => {
  const { kernel, layer, flowerSp } = bench(7);
  placeBloom(kernel, flowerSp.id, 4, 4);
  expect(layer.swarms).toHaveLength(0);
  const wx = 4 * TILE_SIZE + TILE_SIZE / 2;
  const wy = 4 * TILE_SIZE + TILE_SIZE / 2;
  layer.placeCloud(kernel.flora, wx, wy);
  expect(layer.swarms).toHaveLength(1);
  expect(layer.swarms[0].home).not.toBeNull();
});

test("erase removes clouds whose tile is cleared", () => {
  const { kernel, layer, flowerSp } = bench(9);
  const plant = placeBloom(kernel, flowerSp.id, 3, 3);
  layer.inviteCloud(kernel.flora, plant);
  expect(layer.swarms).toHaveLength(1);
  const removed = layer.removeCloudsInTiles([{ x: 3, y: 3 }]);
  expect(removed).toBe(1);
  expect(layer.swarms).toHaveLength(0);
});

test("SwarmLayer.tick uses pollinateAssist from bench config", () => {
  const { kernel, layer, flowerSp } = bench(11);
  const plant = placeBloom(kernel, flowerSp.id, 6, 6);
  layer.inviteCloud(kernel.flora, plant);
  layer.pollinateAssist = { radius: 2, maxSame: 5 };
  const spread = vi.spyOn(kernel.flora, "pollinateSpread").mockReturnValue(true);
  for (let t = 0; t < 600 && spread.mock.calls.length === 0; t++) {
    kernel.step(1, "plants");
    layer.tick(kernel.flora);
  }
  expect(spread.mock.calls.length).toBeGreaterThan(0);
  for (const [, radius, maxSame] of spread.mock.calls) {
    expect(radius).toBe(2);
    expect(maxSame).toBe(5);
  }
});

test("pin holds feed target while free-roam skips spent blooms", () => {
  const { kernel, layer, flowerSp } = bench(13);
  const spent = placeBloom(kernel, flowerSp.id, 2, 2);
  const fuller = placeBloom(kernel, flowerSp.id, 8, 2);
  const cloud = layer.inviteCloud(kernel.flora, spent)!;
  layer.setPinned(cloud, false);
  for (let t = 0; t < 50; t++) layer.tick(kernel.flora);
  expect(layer.nectarOf(spent)).toBeLessThan(NECTAR_EMPTY_THRESHOLD);
  layer.tick(kernel.flora);
  expect(cloud.visitPlantIdx).not.toBe(spent.idx);

  const pinned = layer.inviteCloud(kernel.flora, spent)!;
  layer.setPinned(pinned, true);
  for (let t = 0; t < 10; t++) layer.tick(kernel.flora);
  expect(pinned.visitPlantIdx).toBe(spent.idx);
  expect(pinned.visitPlantIdx).not.toBe(fuller.idx);
});

test("pinned cloud does not wander when a fuller bloom is nearby", () => {
  const { kernel, layer, flowerSp } = bench(15);
  const pinnedBloom = placeBloom(kernel, flowerSp.id, 2, 2);
  placeBloom(kernel, flowerSp.id, 8, 2);
  const cloud = layer.inviteCloud(kernel.flora, pinnedBloom)!;
  expect(cloud.pinned).toBe(true);
  for (let t = 0; t < 80; t++) layer.tick(kernel.flora);
  expect(cloud.visitPlantIdx).toBe(pinnedBloom.idx);
});
