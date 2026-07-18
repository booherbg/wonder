import { expect, test } from "vitest";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { Tile } from "../src/world/types";

test("succulents settle the dry places on many islands", () => {
  let sandy = 0;
  let rocky = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const sp of generatePlantSpecies(seed)) {
      if (sp.archetype.form !== PlantForm.Succulent) continue;
      expect([Tile.Sand, Tile.Rock]).toContain(sp.habitat);
      if (sp.habitat === Tile.Sand) sandy++;
      else rocky++;
      if (!sp.sport) {
        expect(sp.archetype.height).toBeGreaterThanOrEqual(0.1);
        expect(sp.archetype.height).toBeLessThanOrEqual(0.45);
        expect(sp.archetype.glow).toBeLessThanOrEqual(0.7);
      }
    }
  }
  expect(sandy).toBeGreaterThan(10); // half the sand pool is succulent
  expect(rocky).toBeGreaterThan(0); // and the rock keeps a few
});

test("succulent names draw from their own epithet family", () => {
  const words = ["rosette", "pad", "jewel", "star", "thorn"];
  let checked = 0;
  for (let seed = 1; seed <= 30; seed++) {
    for (const sp of generatePlantSpecies(seed)) {
      if (sp.archetype.form !== PlantForm.Succulent) continue;
      const epithet = sp.name.replace(" ✶", "").split(" ").pop()!.toLowerCase();
      expect(words.some((w) => epithet.endsWith(w))).toBe(true);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(0);
});
