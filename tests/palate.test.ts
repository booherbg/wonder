import { expect, test } from "vitest";
import { APPETITE_MIN, Palate, appetite, generateCritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { generate } from "../src/world/generate";

const plants7 = generatePlantSpecies(7);
const arch = plants7[0].archetype;

test("appetite gates on form and falls off with hue distance", () => {
  const palate: Palate = { form: arch.form, hueCenter: arch.hue, hueWidth: 0.15, glowTaste: 0 };
  const exact = appetite(palate, arch);
  expect(exact).toBeGreaterThan(APPETITE_MIN);
  const otherForm = plants7.find((p) => p.archetype.form !== arch.form)!;
  expect(appetite(palate, { ...arch, form: otherForm.archetype.form })).toBe(0);
  const near = appetite(palate, { ...arch, hue: (arch.hue + 0.05) % 1 });
  const far = appetite(palate, { ...arch, hue: (arch.hue + 0.12) % 1 });
  expect(exact).toBeGreaterThanOrEqual(near);
  expect(near).toBeGreaterThan(far);
  expect(appetite(palate, { ...arch, hue: (arch.hue + 0.5) % 1 })).toBe(0);
});

test("the color wheel wraps: a taste near 0 loves a hue near 1", () => {
  const palate: Palate = { form: arch.form, hueCenter: 0.02, hueWidth: 0.12, glowTaste: 0 };
  expect(appetite(palate, { ...arch, hue: 0.97 })).toBeGreaterThan(0);
});

test("glow taste pulls toward and away from the light", () => {
  const shuns: Palate = { form: arch.form, hueCenter: arch.hue, hueWidth: 0.15, glowTaste: -1 };
  const seeks: Palate = { form: arch.form, hueCenter: arch.hue, hueWidth: 0.15, glowTaste: 1 };
  const dim = { ...arch, glow: 0.05 };
  const bright = { ...arch, glow: 0.95 };
  expect(appetite(shuns, dim)).toBeGreaterThan(appetite(shuns, bright));
  expect(appetite(seeks, bright)).toBeGreaterThan(appetite(seeks, dim));
});

test("every island's critters can eat what they were born loving", () => {
  for (const seed of [1, 7, 20, 42]) {
    const map = generate(seed);
    const plants = generatePlantSpecies(seed);
    const flora = new Flora(map, plants, seed);
    for (const sp of generateCritterSpecies(seed, map, flora, plants)) {
      expect(appetite(sp.palate, plants[sp.favoriteSpecies].archetype)).toBeGreaterThan(
        APPETITE_MIN,
      );
      expect(sp.palate.form).not.toBe(PlantForm.Tree);
      expect(sp.palate.form).not.toBe(PlantForm.Coral);
      expect(sp.palate.hueWidth).toBeGreaterThan(0);
    }
  }
});
