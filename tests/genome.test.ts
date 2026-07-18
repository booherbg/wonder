import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import {
  GENOME_BOUNDS,
  Genome,
  NUMERIC_TRAITS,
  PlantForm,
  driftDistance,
  hsl,
  mutate,
  phenoKey,
} from "../src/life/genome";
import { generatePlantSpecies, speciesName } from "../src/life/species";
import { Tile } from "../src/world/types";

function baseGenome(): Genome {
  return {
    form: PlantForm.Flower,
    hue: 0.5, hue2: 0.1, sat: 0.8, height: 0.4, spread: 0.5,
    petals: 6, leaves: 2, lean: 0, glow: 0.2,
  };
}

test("mutate is deterministic for the same rng seed", () => {
  const a = mutate(baseGenome(), makeRng(7));
  const b = mutate(baseGenome(), makeRng(7));
  expect(a).toEqual(b);
});

test("mutate respects bounds over many generations", () => {
  const rng = makeRng(3);
  let g = baseGenome();
  for (let i = 0; i < 500; i++) {
    g = mutate(g, rng, 0.1);
    for (const key of NUMERIC_TRAITS) {
      const [lo, hi] = GENOME_BOUNDS[key];
      expect(g[key]).toBeGreaterThanOrEqual(lo);
      expect(g[key]).toBeLessThanOrEqual(hi);
    }
  }
});

test("form never mutates", () => {
  const rng = makeRng(9);
  let g = baseGenome();
  for (let i = 0; i < 100; i++) g = mutate(g, rng);
  expect(g.form).toBe(PlantForm.Flower);
});

test("driftDistance is zero for identical genomes and grows with drift", () => {
  const g = baseGenome();
  expect(driftDistance(g, g)).toBe(0);
  const rng = makeRng(11);
  let drifted = g;
  for (let i = 0; i < 50; i++) drifted = mutate(drifted, rng, 0.08);
  expect(driftDistance(g, drifted)).toBeGreaterThan(0.02);
});

test("phenoKey is stable under sub-quantum jitter and differs across forms", () => {
  const g = baseGenome();
  expect(phenoKey(g)).toBe(phenoKey({ ...g, hue: g.hue + 0.001 }));
  expect(phenoKey(g)).not.toBe(phenoKey({ ...g, form: PlantForm.Tree }));
});

test("hsl formats and wraps hue", () => {
  expect(hsl(0, 1, 0.5)).toBe("hsl(0, 100%, 50%)");
  expect(hsl(1.25, 0.5, 0.4)).toBe("hsl(90, 50%, 40%)");
});

test("species generation is deterministic and habitat-complete", () => {
  const a = generatePlantSpecies(42);
  const b = generatePlantSpecies(42);
  expect(a).toEqual(b);
  const habitats = new Set(a.map((s) => s.habitat));
  for (const h of [Tile.Grass, Tile.Forest, Tile.Sand, Tile.ShallowWater, Tile.Rock]) {
    expect(habitats.has(h)).toBe(true);
  }
});

test("exactly one sport per island and forests always get a tree", () => {
  for (const seed of [1, 42, 999]) {
    const species = generatePlantSpecies(seed);
    expect(species.filter((s) => s.sport)).toHaveLength(1);
    expect(
      species.some((s) => s.habitat === Tile.Forest && s.archetype.form === PlantForm.Tree),
    ).toBe(true);
  }
});

test("species ids are stable indexes and names are capitalized words", () => {
  const species = generatePlantSpecies(7);
  species.forEach((s, i) => expect(s.id).toBe(i));
  for (const s of species) {
    expect(s.name.length).toBeGreaterThan(3);
    expect(s.name[0]).toBe(s.name[0].toUpperCase());
  }
});

test("speciesName is deterministic per rng stream", () => {
  const g = baseGenome();
  expect(speciesName(makeRng(5), g)).toBe(speciesName(makeRng(5), g));
});
