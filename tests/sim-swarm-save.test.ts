import { expect, test } from "vitest";
import { SwarmLayer, canFlower } from "../src/game/swarms";
import { packSim, restoreSim } from "../src/game/simSave";
import { DEFAULT_POLLINATE_ASSIST } from "../src/life/pollinateAssist";
import { SimKernel } from "../src/life/kernel";
import { generateCritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { makeFlower } from "../src/life/swarm";
import { mutateMap } from "../src/life/idmap";
import { makeRng } from "../src/core/rng";
import { buildConstruct, singleBiome } from "../src/world/construct";
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
  return { kernel, layer, flowerSp, species };
}

function placeBloom(kernel: SimKernel, speciesId: number, tx: number, ty: number) {
  const wx = (tx + 0.5) * TILE_SIZE;
  const wy = (ty + 0.5) * TILE_SIZE;
  const p = kernel.placePlant(speciesId, wx, wy);
  expect(p).not.toBeNull();
  return p!;
}

function swarmSnap(layer: SwarmLayer) {
  const ent = layer.swarms[0];
  return {
    count: layer.swarms.length,
    rng: layer.snapshot().rngState,
    ticks: layer.snapshot().ticks,
    population: ent?.sw.population ?? 0,
    energy: ent?.sw.energy ?? 0,
    pinned: ent?.pinned ?? false,
    visitPlantIdx: ent?.visitPlantIdx ?? null,
  };
}

test("SwarmLayer snapshot/restore round-trips cloud state", () => {
  const { kernel, layer, flowerSp } = bench(42);
  const bloom = placeBloom(kernel, flowerSp.id, 5, 5);
  const cloud = layer.inviteCloud(kernel.flora, bloom)!;
  layer.setPinned(cloud, true);
  for (let t = 0; t < 25; t++) layer.tick(kernel.flora);

  const before = swarmSnap(layer);
  const nectarBefore = layer.nectarOf(bloom);
  expect(before.count).toBe(1);
  expect(nectarBefore).toBeLessThan(0.95);

  const saved = layer.snapshot();
  const json = JSON.parse(JSON.stringify(saved));
  const restored = new SwarmLayer(42, kernel.plantSpecies, kernel.flora, undefined, {
    perPlantNectar: true,
    autoSpawn: false,
    predation: 0,
  });
  restored.restore(json);

  expect(restored.swarms).toHaveLength(1);
  expect(restored.swarms[0].pinned).toBe(true);
  expect(restored.swarms[0].sw.population).toBeCloseTo(cloud.sw.population, 5);
  expect(restored.swarms[0].sw.energy).toBeCloseTo(cloud.sw.energy, 5);
  expect(restored.nectarOf(bloom)).toBeCloseTo(nectarBefore, 5);
  expect(restored.snapshot().rngState).toBe(before.rng);
  expect(restored.snapshot().ticks).toBe(before.ticks);
});

test("custom setFlower map survives snapshot/restore", () => {
  const { kernel, layer, flowerSp } = bench(7);
  placeBloom(kernel, flowerSp.id, 4, 4);
  const custom = makeFlower(makeRng(0xbeef), 5);
  custom.map = mutateMap(custom.map, makeRng(0xface), 4);
  layer.setFlower(flowerSp.id, custom);
  layer.placeCloud(kernel.flora, 4 * TILE_SIZE + TILE_SIZE / 2, 4 * TILE_SIZE + TILE_SIZE / 2);

  const saved = JSON.parse(JSON.stringify(layer.snapshot()));
  const restored = new SwarmLayer(7, kernel.plantSpecies, kernel.flora, undefined, {
    perPlantNectar: true,
    autoSpawn: false,
    predation: 0,
  });
  restored.restore(saved);

  const flower = restored.flowerFor(flowerSp.id)!;
  expect(Array.from(flower.map)).toEqual(Array.from(custom.map));
  expect(Array.from(flower.accent)).toEqual(Array.from(custom.accent));
});

test("packSim/restoreSim carries swarms and match history when provided", () => {
  const SEED = 11;
  const map = buildConstruct("single-biome", SEED);
  const species = generatePlantSpecies(SEED);
  const flowerSp =
    species.find((s) => s.habitat === Tile.Grass && canFlower(s.archetype.form)) ?? species[0];
  const scratch = new Flora(map, species, SEED, {}, { tick: 0, plants: [] });
  const critters = generateCritterSpecies(SEED, map, scratch, species);
  const kernel = new SimKernel({ map, plantSpecies: species, critterSpecies: critters, seed: SEED });
  const layer = new SwarmLayer(SEED, species, kernel.flora, undefined, {
    perPlantNectar: true,
    autoSpawn: false,
    predation: 0,
  });
  const bloom = placeBloom(kernel, flowerSp.id, 6, 6);
  layer.inviteCloud(kernel.flora, bloom);
  for (let t = 0; t < 20; t++) {
    kernel.step(1, "plants");
    layer.tick(kernel.flora);
  }
  const matchHistory: Record<string, number[]> = { "0": [12, 24, 36] };
  const blob = JSON.parse(
    JSON.stringify(
      packSim({
        kernel,
        drawer: [],
        starter: "single-biome",
        seed: SEED,
        name: "cloudy",
        savedAt: 1,
        swarms: layer.snapshot(),
        swarmMatchHistory: matchHistory,
      }),
    ),
  );
  expect(blob.swarms?.swarms).toHaveLength(1);
  expect(blob.swarmMatchHistory).toEqual(matchHistory);

  const r = restoreSim(blob);
  expect(r.swarms?.swarms).toHaveLength(1);
  expect(r.swarmMatchHistory).toEqual(matchHistory);
  expect(r.census).toBeDefined();
});

test("packSim/restoreSim omits swarms for legacy blobs and continues deterministically", () => {
  const map = singleBiome(4242, Tile.Grass, 48);
  const plants = generatePlantSpecies(4242);
  const scratch = new Flora(map, plants, 4242, {}, { tick: 0, plants: [] });
  const critters = generateCritterSpecies(4242, map, scratch, plants);
  const kernel = new SimKernel({ map, plantSpecies: plants, critterSpecies: critters, seed: 4242 });
  const grassPlant = plants.findIndex((p) => p.habitat === Tile.Grass);
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (let i = 0; i < 4; i++) kernel.placePlant(grassPlant, at(6 + i), at(6));
  kernel.step(40, "full");

  const blob = JSON.parse(
    JSON.stringify(packSim({ kernel, drawer: [], starter: "single-biome", seed: 4242, name: "legacy", savedAt: 1 })),
  );
  expect(blob.swarms).toBeUndefined();
  const r = restoreSim(blob);
  expect(r.swarms).toBeUndefined();
  expect(r.swarmMatchHistory).toBeUndefined();

  kernel.step(30, "full");
  r.kernel.step(30, "full");
  expect(r.kernel.tick).toBe(kernel.tick);
  expect(r.kernel.flora.count).toBe(kernel.flora.count);
});
