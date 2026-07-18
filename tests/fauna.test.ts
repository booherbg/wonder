import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { Flora } from "../src/life/flora";
import {
  Critter,
  generateCritterSpecies,
  spawnCritters,
  updateCritter,
} from "../src/life/fauna";
import { generatePlantSpecies } from "../src/life/species";
import { TILE_SIZE } from "../src/world/config";
import { generate } from "../src/world/generate";
import { isWalkable } from "../src/world/types";

const SEED = 42;

function world() {
  const map = generate(SEED);
  const plants = generatePlantSpecies(SEED);
  const flora = new Flora(map, plants, SEED);
  const critterSpecies = generateCritterSpecies(SEED, map, flora, plants);
  return { map, plants, flora, critterSpecies };
}

test("three critter species with valid favorites and walkable dens", () => {
  const { map, plants, critterSpecies } = world();
  expect(critterSpecies).toHaveLength(3);
  for (const sp of critterSpecies) {
    expect(sp.favoriteSpecies).toBeGreaterThanOrEqual(0);
    expect(sp.favoriteSpecies).toBeLessThan(plants.length);
    expect(isWalkable(map, sp.den.x, sp.den.y)).toBe(true);
    expect(sp.name.length).toBeGreaterThan(3);
  }
  // favorites are distinct
  expect(new Set(critterSpecies.map((s) => s.favoriteSpecies)).size).toBe(3);
});

test("critter generation is deterministic", () => {
  const a = world().critterSpecies;
  const b = world().critterSpecies;
  expect(a).toEqual(b);
});

test("critters spawn on walkable tiles near their den", () => {
  const { map, critterSpecies } = world();
  const critters = spawnCritters(critterSpecies, map, SEED);
  expect(critters.length).toBeGreaterThanOrEqual(9);
  for (const c of critters) {
    const tx = Math.floor(c.x / TILE_SIZE);
    const ty = Math.floor(c.y / TILE_SIZE);
    expect(isWalkable(map, tx, ty)).toBe(true);
    const den = critterSpecies[c.species].den;
    expect(Math.hypot(tx - den.x, ty - den.y)).toBeLessThan(8);
  }
});

test("critters stay on walkable ground through minutes of life", () => {
  const { map, flora, critterSpecies } = world();
  const critters = spawnCritters(critterSpecies, map, SEED);
  const rng = makeRng(99);
  const dt = 1 / 30;
  for (let step = 0; step < 30 * 120; step++) {
    for (const c of critters) {
      updateCritter(c, dt, map, flora, critterSpecies, null, rng);
      expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
      const tx = Math.floor(c.x / TILE_SIZE);
      const ty = Math.floor(c.y / TILE_SIZE);
      expect(isWalkable(map, tx, ty)).toBe(true);
    }
  }
});

test("critters eventually visit their favorite plants (seek/nibble happens)", () => {
  const { map, flora, critterSpecies } = world();
  const critters: Critter[] = spawnCritters(critterSpecies, map, SEED);
  const rng = makeRng(7);
  const seen = new Set<string>();
  const dt = 1 / 30;
  for (let step = 0; step < 30 * 180; step++) {
    for (const c of critters) {
      updateCritter(c, dt, map, flora, critterSpecies, null, rng);
      seen.add(c.state);
    }
  }
  expect(seen.has("seek")).toBe(true);
  expect(seen.has("nibble")).toBe(true);
});
