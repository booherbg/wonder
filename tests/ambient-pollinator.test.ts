import { expect, test, vi } from "vitest";
import { updateCritter } from "../src/life/fauna";
import type { Critter, CritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import type { Plant } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { singleBiome } from "../src/world/construct";
import { Tile, WorldMap } from "../src/world/types";
import { makeRng } from "../src/core/rng";

// The nibble-resolution DISPATCH, isolated with a fake Flora so the assertion is
// exactly "which primitive, with which args" — fully deterministic, no rng luck.
// A critter parked in "nibble" state with stateTime 0 resolves its visit on the
// next updateCritter tick (KERNEL_DT slice); flora.all[meal.idx] === meal is the
// gate the real code checks (fauna.ts:811).
function runNibble(role: CritterSpecies["role"]) {
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
    id: 0, role,
    palate: { form: PlantForm.Flower, hueCenter: 0.5, hueWidth: 0.2, glowTaste: 0 },
  }] as unknown as CritterSpecies[];
  const c = {
    species: 0, x: 100, y: 100, state: "nibble", stateTime: 0,
    targetX: 100, targetY: 100, hopPhase: 0, facing: 1, energy: 0.5, meal,
  } as unknown as Critter;
  updateCritter(c, 0.5, {} as unknown as WorldMap, flora, speciesList, null, makeRng(1), {});
  return flora as unknown as {
    nibble: ReturnType<typeof vi.fn>;
    propagate: ReturnType<typeof vi.fn>;
    addSubstrate: ReturnType<typeof vi.fn>;
    pollinateSpread: ReturnType<typeof vi.fn>;
  };
}

test("a pollinator spreads its fed plant via pollinateSpread — wider/looser than a disperser", () => {
  const f = runNibble("pollinator");
  // the wide/loose primitive, with the bench's own reach (6 tiles > the default
  // reseedRadius of 3) and its loose per-cloud density cap (2)
  expect(f.pollinateSpread).toHaveBeenCalledTimes(1);
  expect(f.pollinateSpread).toHaveBeenCalledWith(expect.objectContaining({ idx: 0 }), 6, 2);
  // and it does NOT bite or run the ordinary disperser drop
  expect(f.nibble).not.toHaveBeenCalled();
  expect(f.propagate).not.toHaveBeenCalled();
  expect(f.addSubstrate).not.toHaveBeenCalled();
});

test("grazer and disperser arms are unaffected by the new pollinator arm", () => {
  const grazer = runNibble("grazer");
  expect(grazer.nibble).toHaveBeenCalledTimes(1);
  expect(grazer.pollinateSpread).not.toHaveBeenCalled();

  const disperser = runNibble("disperser");
  expect(disperser.propagate).toHaveBeenCalledTimes(1);
  expect(disperser.addSubstrate).toHaveBeenCalledTimes(1);
  expect(disperser.pollinateSpread).not.toHaveBeenCalled();
});

// Integration over a REAL Flora: a stepped pollinator actually roots same-species
// children through pollinateSpread on a lush field. Deterministic per seed.
test("a stepped pollinator roots same-species children on a real flora (never a bite)", () => {
  const map = singleBiome(11, Tile.Grass, 48);
  const plants = generatePlantSpecies(11);
  const flora = new Flora(map, plants, 11, { chains: true });
  const sp = [{
    id: 0, role: "pollinator",
    palate: { form: PlantForm.Flower, hueCenter: 0.5, hueWidth: 0.2, glowTaste: 0 },
  }] as unknown as CritterSpecies[];
  const rng = makeRng(1);
  const before = flora.count;
  // pollinateSpread only ADDS (never removes), so each snapshot plant's idx stays
  // valid across the sweep; across a lush field at least one child takes root.
  for (const meal of [...flora.all]) {
    const c = {
      species: 0, x: meal.x, y: meal.y, state: "nibble", stateTime: 0,
      targetX: meal.x, targetY: meal.y, hopPhase: 0, facing: 1, energy: 0.6,
      curiosity: 0, mood: "content", meal,
    } as unknown as Critter;
    updateCritter(c, 0.5, map, flora, sp, null, rng, {});
  }
  expect(flora.count).toBeGreaterThan(before); // spread — never a bite (count only grows)
});
