import { expect, test } from "vitest";
import { updateCritter } from "../src/life/fauna";
import type { Critter, CritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { singleBiome } from "../src/world/construct";
import { Tile } from "../src/world/types";
import { makeRng } from "../src/core/rng";

// A nutrient shuttle ferries a loose substrate from where it fed (A) to where it
// lands next (B): empty-handed it lifts the nearest one; carrying, it sets it
// down. Peaceful: the count is CONSERVED across lift+drop (relocated, never
// created or destroyed). Deterministic: no rng in either half.
test("a nutrient shuttle relocates a substrate from A to B, count conserved", () => {
  const map = singleBiome(7, Tile.Grass, 48);
  const plants = generatePlantSpecies(7);
  const flora = new Flora(map, plants, 7, { chains: true }); // chains on: substrates live
  const meal = flora.all[0]; // any real plant satisfies the meal-still-there gate

  const A = { x: 100, y: 100 };
  const B = { x: 500, y: 400 };
  flora.addSubstrate(A.x, A.y, { hue: 0.42, glow: 0.3, form: PlantForm.Flower });
  expect(flora.substrates.length).toBe(1);

  const sp = [{
    id: 0, role: "nutrient-shuttle",
    palate: { form: PlantForm.Flower, hueCenter: 0.5, hueWidth: 0.2, glowTaste: 0 },
  }] as unknown as CritterSpecies[];
  const rng = makeRng(1);
  const at = (x: number, y: number): Critter => ({
    species: 0, x, y, state: "nibble", stateTime: 0, targetX: x, targetY: y,
    hopPhase: 0, facing: 1, energy: 0.6, curiosity: 0, mood: "content", meal,
  } as unknown as Critter);

  // arrival #1 at A, empty-handed → lifts the substrate off the ground
  const c = at(A.x, A.y);
  updateCritter(c, 0.5, map, flora, sp, null, rng, {});
  expect(flora.substrates.length).toBe(0);
  expect(c.carriedSubstrate).toEqual({ hue: 0.42, glow: 0.3, form: PlantForm.Flower });

  // arrival #2 at B, carrying → sets it down at the NEW place
  c.x = B.x; c.y = B.y; c.state = "nibble"; c.stateTime = 0; c.meal = meal;
  updateCritter(c, 0.5, map, flora, sp, null, rng, {});
  expect(c.carriedSubstrate).toBeUndefined();
  expect(flora.substrates.length).toBe(1); // count conserved — peaceful
  const moved = flora.substrates[0];
  expect(moved.x).toBe(B.x);
  expect(moved.y).toBe(B.y);
  expect(moved.hue).toBe(0.42); // the same load, relocated
});
