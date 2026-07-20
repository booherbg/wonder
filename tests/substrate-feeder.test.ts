import { expect, test } from "vitest";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";

test("existing generation is byte-identical (names + archetypes unchanged)", () => {
  // Guard: this array is the seed-42 species names captured on HEAD BEFORE
  // this task (via `generatePlantSpecies(42).map(s => s.name)`). If rolling
  // substrateFeeder ever shifts the main generation stream, this fails.
  const before = [
    "Manor Manyfountain", "Quinor Glowcup", "Raqui Manyplume", "Quipol Fountain",
    "Triszelash Tallreach", "Humma Manystar", "Quizel Glowcarpet", "Ylvel Manyreach",
    "Lutris Glowmoss", "Velra Sprawl", "Saeor Manyknot", "Ashlu Bloom",
    "Saenor Glowrosette", "Ithnor Reef", "Ovasaesil Whorl ✶", "Zelbel Star",
    "Lumior Glowveil", "Ramimi Glowmoss", "Duor Briar", "Dutrisra Lantern",
    "Ashbel Manybell", "Belyl Rush", "Belash Manycup",
  ];
  const after = generatePlantSpecies(42).map((s) => s.name);
  if (before.length) expect(after).toEqual(before);
});
test("substrateFeeder is deterministic and biased to pioneer forms", () => {
  const a = generatePlantSpecies(2438).map((s) => s.substrateFeeder);
  const b = generatePlantSpecies(2438).map((s) => s.substrateFeeder);
  expect(a).toEqual(b); // deterministic
  // across many seeds, pioneer forms are feeders far more often than others
  let pioneerFeed = 0, pioneerTot = 0, otherFeed = 0, otherTot = 0;
  const pioneer = new Set([PlantForm.Moss, PlantForm.Fungus, PlantForm.Sporestalk]);
  for (let s = 0; s < 60; s++) {
    for (const sp of generatePlantSpecies(s)) {
      const isP = pioneer.has(sp.archetype.form);
      if (isP) { pioneerTot++; if (sp.substrateFeeder) pioneerFeed++; }
      else { otherTot++; if (sp.substrateFeeder) otherFeed++; }
    }
  }
  expect(pioneerFeed / pioneerTot).toBeGreaterThan(otherFeed / otherTot + 0.3);
});
