import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { Critter, CritterSpecies, morphOf, updateCritter } from "../src/life/fauna";
import { Flora, Plant } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { generate } from "../src/world/generate";

const SEED = 42;

// a bare critter species with a chosen role — palate is irrelevant here, the
// meal is set by hand, we only drive the nibble to completion.
function critterSpecies(role: "disperser" | "grazer"): CritterSpecies {
  return {
    id: 0,
    name: "Test Critter",
    bodyHue: 0.5,
    earLen: 0.5,
    tailLen: 0.5,
    size: 1,
    morph: morphOf({ bodyHue: 0.5, earLen: 0.5, tailLen: 0.5, size: 1 }),
    palate: { form: PlantForm.Flower, hueCenter: 0.5, hueWidth: 0.2, glowTaste: 0 },
    favoriteSpecies: 0,
    role,
    den: { x: 2, y: 2 },
  };
}

// a critter caught mid-chew, one tick from landing the visit (see propagate.test.ts)
function nibbling(meal: Plant): Critter {
  return {
    species: 0,
    x: meal.x,
    y: meal.y,
    state: "nibble",
    targetX: meal.x,
    targetY: meal.y,
    stateTime: 0,
    hopPhase: 0,
    facing: 1,
    energy: 0.5,
    meal,
    curiosity: 0,
    mood: "hungry",
  };
}

test("a disperser drops a substrate tagged with its meal where it feeds", () => {
  const map = generate(SEED);
  const flora = new Flora(map, generatePlantSpecies(SEED), SEED, { chains: true });
  const meal = flora.all[0];
  const sp = critterSpecies("disperser");
  const c = nibbling(meal);
  updateCritter(c, 1 / 30, map, flora, [sp], null, makeRng(1));
  expect(flora.substrates).toHaveLength(1);
  expect(flora.substrates[0]).toMatchObject({
    x: meal.x,
    y: meal.y,
    hue: meal.genome.hue,
    glow: meal.genome.glow,
    form: meal.genome.form,
  });
});

test("a grazer emits no substrate (v1: dispersers only)", () => {
  const map = generate(SEED);
  const flora = new Flora(map, generatePlantSpecies(SEED), SEED, { chains: true });
  const sp = critterSpecies("grazer");
  const c = nibbling(flora.all[0]);
  updateCritter(c, 1 / 30, map, flora, [sp], null, makeRng(1));
  expect(flora.substrates).toHaveLength(0);
});

test("with chains off, a disperser emits nothing (the A/B baseline)", () => {
  const map = generate(SEED);
  const flora = new Flora(map, generatePlantSpecies(SEED), SEED, { chains: false });
  const sp = critterSpecies("disperser");
  const c = nibbling(flora.all[0]);
  updateCritter(c, 1 / 30, map, flora, [sp], null, makeRng(1));
  expect(flora.substrates).toHaveLength(0);
});
