import { expect, test } from "vitest";
import { CYCLE_MS, RAIN_MS, isBloomDay, rainAt } from "../src/game/daynight";
import { Flora } from "../src/life/flora";
import { Genome, PlantForm } from "../src/life/genome";
import { PlantSpecies } from "../src/life/species";
import { Tile, WorldMap } from "../src/world/types";

test("some day-cycles rain and some stay dry; showers ease in and out", () => {
  for (const seed of [1, 42, 777]) {
    let rainy = 0;
    let dry = 0;
    let peak = 0;
    const CYCLES = 200;
    for (let c = 0; c < CYCLES; c++) {
      let cyclePeak = 0;
      for (let t = 0; t < CYCLE_MS; t += RAIN_MS / 8) {
        const r = rainAt(c * CYCLE_MS + t, seed);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThanOrEqual(1);
        cyclePeak = Math.max(cyclePeak, r);
      }
      if (cyclePeak > 0) rainy++;
      else dry++;
      peak = Math.max(peak, cyclePeak);
    }
    expect(rainy / CYCLES).toBeGreaterThan(0.15);
    expect(dry / CYCLES).toBeGreaterThan(0.4);
    expect(peak).toBeGreaterThan(0.9); // real soakers happen
  }
});

test("the day after a rainy cycle is a bloom day", () => {
  const seed = 42;
  for (let c = 1; c < 100; c++) {
    let rainedYesterday = false;
    for (let t = 0; t < CYCLE_MS; t += RAIN_MS / 8) {
      if (rainAt((c - 1) * CYCLE_MS + t, seed) > 0) rainedYesterday = true;
    }
    expect(isBloomDay(c * CYCLE_MS + 1, seed)).toBe(rainedYesterday);
  }
});

function fungusWorld(): { flora: Flora; flora2: Flora } {
  const size = 14;
  const tiles = new Uint8Array(size * size).fill(Tile.Grass);
  const map: WorldMap = {
    width: size,
    height: size,
    seed: 0,
    tiles,
    elevation: new Float32Array(size * size),
    rivers: [],
    spawn: { x: 1, y: 1 },
  };
  const archetype: Genome = {
    form: PlantForm.Fungus,
    hue: 0.1, hue2: 0.5, sat: 0.9, height: 0.3, spread: 0.4,
    petals: 6, leaves: 0, lean: 0, glow: 0.5,
  };
  const species: PlantSpecies[] = [
    { id: 0, name: "Raincap", habitat: Tile.Grass, archetype, density: 0.6, sport: false },
  ];
  const tuning = { matureAge: 1, reproChance: 0.12, simBudget: 150, maxPlants: 500 };
  return {
    flora: new Flora(map, species, 5, tuning),
    flora2: new Flora(map, structuredClone(species), 5, tuning),
  };
}

test("on a bloom day the fungi answer threefold", () => {
  const { flora, flora2 } = fungusWorld();
  expect(flora.count).toBe(flora2.count);
  for (let i = 0; i < 60; i++) {
    flora.simTick({ bloom: true });
    flora2.simTick({});
  }
  expect(flora.count).toBeGreaterThan(flora2.count);
});

test("aurora-born plants carry more glow than their ordinary siblings", () => {
  const { flora, flora2 } = fungusWorld();
  for (let i = 0; i < 60; i++) {
    flora.simTick({ aurora: true });
    flora2.simTick({});
  }
  const meanGlow = (f: Flora) => {
    const kids = f.all.filter((p) => p.born > 0);
    return kids.reduce((s, p) => s + p.genome.glow, 0) / Math.max(1, kids.length);
  };
  expect(meanGlow(flora)).toBeGreaterThan(meanGlow(flora2) + 0.05);
});
