import { expect, test, vi } from "vitest";
import { SwarmLayer } from "../src/game/swarms";
import { pollinateAssistFor } from "../src/game/simPressures";
import { updateCritter } from "../src/life/fauna";
import type { Critter, CritterSpecies } from "../src/life/fauna";
import { DEFAULT_POLLINATE_ASSIST } from "../src/life/pollinateAssist";
import type { Plant } from "../src/life/flora";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { generate } from "../src/world/generate";
import { makeRng } from "../src/core/rng";
import type { WorldMap } from "../src/world/types";

test("pollinateAssistFor clamps reach and density to pressure ranges", () => {
  expect(pollinateAssistFor(6, 2)).toEqual(DEFAULT_POLLINATE_ASSIST);
  expect(pollinateAssistFor(1, 4)).toEqual({ radius: 1, maxSame: 4 });
  expect(pollinateAssistFor(99, -1)).toEqual({ radius: 10, maxSame: 1 });
});

test("ambient pollinator reads pollinateAssist from CritterContext", () => {
  const meal = {
    idx: 0, x: 100, y: 100, species: 0,
    genome: { form: PlantForm.Flower, hue: 0.5, glow: 0.5 },
  } as unknown as Plant;
  const flora = {
    all: [meal],
    nibble: vi.fn(),
    propagate: vi.fn(),
    addSubstrate: vi.fn(),
    pollinateSpread: vi.fn(() => true),
    takeSubstrateNear: vi.fn(() => null),
  } as unknown as Flora;
  const speciesList = [{
    id: 0, role: "pollinator" as const,
    palate: { form: PlantForm.Flower, hueCenter: 0.5, hueWidth: 0.2, glowTaste: 0 },
  }] as unknown as CritterSpecies[];
  const c = {
    species: 0, x: 100, y: 100, state: "nibble", stateTime: 0,
    targetX: 100, targetY: 100, hopPhase: 0, facing: 1, energy: 0.5, meal,
  } as unknown as Critter;
  updateCritter(c, 0.5, {} as unknown as WorldMap, flora, speciesList, null, makeRng(1), {
    pollinateAssist: { radius: 8, maxSame: 1 },
  });
  expect(flora.pollinateSpread).toHaveBeenCalledWith(expect.objectContaining({ idx: 0 }), 8, 1);
});

test("SwarmLayer.tick uses pollinateAssist radius and density", () => {
  const species = generatePlantSpecies(7);
  const flora = new Flora(generate(7), species, 7);
  const layer = new SwarmLayer(7, species, flora);
  layer.pollinateAssist = { radius: 3, maxSame: 4 };
  const spread = vi.spyOn(flora, "pollinateSpread").mockReturnValue(true);
  for (let t = 0; t < 200 && spread.mock.calls.length === 0; t++) {
    flora.simTick();
    layer.tick(flora);
  }
  expect(spread.mock.calls.length).toBeGreaterThan(0);
  for (const [, radius, maxSame] of spread.mock.calls) {
    expect(radius).toBe(3);
    expect(maxSame).toBe(4);
  }
});
