import { expect, test } from "vitest";
import { Plant } from "../src/life/flora";
import { Genome, PlantForm } from "../src/life/genome";
import { bestBloom, hueAffinity, isBloom } from "../src/render/ambient";

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

test("hueAffinity: 1 at the colour it loves, 0 across the wheel, wraps around", () => {
  expect(hueAffinity(0.3, 0.3)).toBe(1);
  expect(hueAffinity(0, 0.5)).toBeCloseTo(0, 10);
  // 0.05 and 0.95 sit a tenth of the wheel apart, not nine tenths
  expect(hueAffinity(0.05, 0.95)).toBeCloseTo(0.8, 10);
  expect(hueAffinity(0.1, 0.7)).toBeCloseTo(hueAffinity(0.7, 0.1), 10);
});

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

test("bestBloom picks the bloom nearest its favored hue among equals", () => {
  const rose = plant(-10, 0, { hue: 0.0 });
  const violet = plant(10, 0, { hue: 0.7 });
  expect(bestBloom([rose, violet], 0, 0, 0.02, false)).toBe(rose);
  expect(bestBloom([rose, violet], 0, 0, 0.7, false)).toBe(violet);
});

test("bestBloom skips what cannot be worked, and the flower it just left", () => {
  const tree = plant(2, 0, { form: PlantForm.Tree });
  const here = plant(0, 0);
  const there = plant(30, 0);
  expect(bestBloom([tree, here, there], 0, 0, 0.5, false, here)).toBe(there);
  expect(bestBloom([tree, here], 0, 0, 0.5, false, here)).toBeNull();
  expect(bestBloom([], 0, 0, 0.5, false)).toBeNull();
});

test("bestBloom: of two loved blooms, the closer one; a blossom before a berry bush", () => {
  const near = plant(8, 0, { hue: 0.3 });
  const far = plant(60, 0, { hue: 0.3 });
  expect(bestBloom([far, near], 0, 0, 0.3, false)).toBe(near);
  const flower = plant(10, 0, { hue: 0.3 });
  const shrub = plant(-10, 0, { form: PlantForm.Shrub, hue: 0.3 });
  expect(bestBloom([shrub, flower], 0, 0, 0.3, false)).toBe(flower);
});

test("moths steer by glow, butterflies by colour", () => {
  const loved = plant(-10, 0, { hue: 0.1, glow: 0.1 });
  const lantern = plant(10, 0, { hue: 0.6, glow: 0.95 });
  expect(bestBloom([loved, lantern], 0, 0, 0.1, false)).toBe(loved);
  expect(bestBloom([loved, lantern], 0, 0, 0.1, true)).toBe(lantern);
});
