import { expect, test } from "vitest";
import { Plant } from "../src/life/flora";
import { Genome, PlantForm } from "../src/life/genome";
import { isBloom } from "../src/render/ambient";

// The cosmetic butterfly/moth pollinators have been retired — the insect SWARMS
// (game/swarms.ts) are the island's real pollinators now. What survives here is
// `isBloom`, the shared bloom rule: which plants carry a flower worth working,
// the same test the swarms home on.

let nextIdx = 0;
function plant(x: number, y: number, over: Partial<Genome> = {}): Plant {
  return {
    species: 0,
    x,
    y,
    born: 0,
    idx: nextIdx++,
    genome: {
      form: PlantForm.Flower,
      hue: 0.5,
      hue2: 0.5,
      sat: 0.7,
      height: 0.5,
      spread: 0.5,
      petals: 5,
      leaves: 2,
      lean: 0,
      glow: 0.2,
      ...over,
    },
  };
}

test("isBloom: flowers and shrubs always; succulents only when the spike is up", () => {
  expect(isBloom(plant(0, 0))).toBe(true);
  expect(isBloom(plant(0, 0, { form: PlantForm.Shrub }))).toBe(true);
  // the sprite's own rule: petals >= 8 or true glow sends up the bloom spike
  expect(isBloom(plant(0, 0, { form: PlantForm.Succulent, petals: 5 }))).toBe(false);
  expect(isBloom(plant(0, 0, { form: PlantForm.Succulent, petals: 9 }))).toBe(true);
  expect(isBloom(plant(0, 0, { form: PlantForm.Succulent, petals: 5, glow: 0.9 }))).toBe(true);
  for (const form of [PlantForm.Tree, PlantForm.Fern, PlantForm.Fungus, PlantForm.Coral]) {
    expect(isBloom(plant(0, 0, { form, glow: 1, petals: 10 }))).toBe(false);
  }
});
