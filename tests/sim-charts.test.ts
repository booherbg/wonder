import { expect, test } from "vitest";
import { buildLabChartsView } from "../src/game/simCharts";
import { SwarmLayer } from "../src/game/swarms";
import { DEFAULT_POLLINATE_ASSIST } from "../src/life/pollinateAssist";
import { generateCritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { SimKernel } from "../src/life/kernel";
import { generatePlantSpecies } from "../src/life/species";
import { singleBiome } from "../src/world/construct";
import { Tile } from "../src/world/types";
import { TILE_SIZE } from "../src/world/config";

const SEED = 60607;

function labBench() {
  const map = singleBiome(SEED, Tile.Grass, 32);
  const plantSpecies = generatePlantSpecies(SEED);
  const scratch = new Flora(map, plantSpecies, SEED, {}, { tick: 0, plants: [] });
  const critterSpecies = generateCritterSpecies(SEED, map, scratch, plantSpecies);
  const kernel = new SimKernel({ map, plantSpecies, critterSpecies, seed: SEED, censusInterval: 1 });
  const grassId = plantSpecies.findIndex((p) => p.habitat === Tile.Grass);
  const px = 16 * TILE_SIZE + TILE_SIZE / 2;
  const py = 16 * TILE_SIZE + TILE_SIZE / 2;
  kernel.placePlant(grassId, px, py);
  for (let i = 0; i < 5; i++) kernel.step(1, "plants");
  return { kernel, map, plantSpecies, critterSpecies, grassId };
}

test("buildLabChartsView returns census series and construct metadata", () => {
  const { kernel, map, plantSpecies, critterSpecies, grassId } = labBench();
  const view = buildLabChartsView({
    name: "test construct",
    tick: kernel.tick,
    census: kernel.census,
    plantSpecies,
    critterSpecies,
    map,
    flora: kernel.flora,
    swarmLayer: { swarms: [] },
    swarmMatchHistory: new Map(),
  });

  expect(view.name).toBe("test construct");
  expect(view.timeLabel).toBe(`tick ${kernel.tick}`);
  expect(view.totals.plants).toBeGreaterThan(0);
  expect(view.totals.kinds).toBeGreaterThan(0);
  expect(view.series.length).toBeGreaterThan(0);
  expect(view.series[0].id).toBe(grassId);
  expect(view.series[0].counts.length).toBeGreaterThanOrEqual(2);
  expect(view.totalCounts.length).toBe(view.series[0].counts.length);
  expect(view.biomes.length).toBeGreaterThan(0);
  expect(view.biomes[0].name).toBe("grass");
  expect(view.richness.word).toBeTruthy();
  expect(view.chains.chains).toBeGreaterThanOrEqual(0);
});

test("buildLabChartsView maps swarm match history into swarmSeries", () => {
  const { kernel, map, plantSpecies, critterSpecies } = labBench();
  const layer = new SwarmLayer(SEED, plantSpecies, kernel.flora, undefined, {
    perPlantNectar: true,
    autoSpawn: false,
    predation: 0,
  });
  layer.pollinateAssist = { ...DEFAULT_POLLINATE_ASSIST };
  const px = 16 * TILE_SIZE + TILE_SIZE / 2;
  const py = 16 * TILE_SIZE + TILE_SIZE / 2;
  layer.placeCloud(kernel.flora, px, py);
  const ent = layer.swarms[0];
  const swarmMatchHistory = new Map<number, number[]>([[ent.id, [30, 45, 60]]]);
  const view = buildLabChartsView({
    name: "swarm bench",
    tick: kernel.tick,
    census: kernel.census,
    plantSpecies,
    critterSpecies,
    map,
    flora: kernel.flora,
    swarmLayer: layer,
    swarmMatchHistory,
  });

  expect(view.swarmSeries).toHaveLength(1);
  expect(view.swarmSeries[0].name).toBe(ent.name);
  expect(view.swarmSeries[0].matches).toEqual([30, 45, 60]);
  expect(view.swarmSeries[0].color).toMatch(/^hsl\(/);
});
