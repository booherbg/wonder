import { expect, test } from "vitest";
import { SimKernel } from "../src/life/kernel";
import { generatePlantSpecies } from "../src/life/species";
import { generateCritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { singleBiome } from "../src/world/construct"; // built in Task 2
import { Tile } from "../src/world/types";
import { TILE_SIZE } from "../src/world/config";

const SEED = 4242;

// A deterministic bench: a grass construct, the seed's rosters, and one
// grass-habitat plant + one critter that favours it, placed a few tiles apart.
function bench() {
  const map = singleBiome(SEED, Tile.Grass, 40);
  const plants = generatePlantSpecies(SEED);
  const scratch = new Flora(map, plants, SEED, {}, { tick: 0, plants: [] });
  const critters = generateCritterSpecies(SEED, map, scratch, plants);
  const kernel = new SimKernel({ map, plantSpecies: plants, critterSpecies: critters, seed: SEED });
  const grassPlant = plants.findIndex((p) => p.habitat === Tile.Grass);
  const critter = critters[0].id;
  return { kernel, grassPlant, critter };
}

// a compact, comparable snapshot of everything the sim owns
function snap(k: SimKernel) {
  return {
    tick: k.tick,
    floraCount: k.flora.count,
    counts: [...k.speciesCounts().entries()].sort((a, b) => a[0] - b[0]),
    critters: k.critters.map((c) => [
      Math.round(c.x * 1e3), Math.round(c.y * 1e3), c.state,
      Math.round(c.energy * 1e6), c.mood, Math.round(c.targetX * 1e3), Math.round(c.targetY * 1e3),
    ]),
  };
}

test("an empty kernel places nothing until asked (no scatter)", () => {
  const { kernel } = bench();
  expect(kernel.flora.count).toBe(0);
  expect(kernel.critterCount()).toBe(0);
  expect(kernel.tick).toBe(0);
});

test("placePlant is habitat-gated: a grass plant roots on grass, refuses off-habitat", () => {
  const { kernel, grassPlant } = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  expect(kernel.placePlant(grassPlant, at(5), at(5))).not.toBeNull(); // on the grass construct
  expect(kernel.placePlant(grassPlant, -50, -50)).toBeNull();         // off the map → refused
  expect(kernel.flora.count).toBe(1);
});

test("N steps reproduce bit-identically from a seed — plants fidelity", () => {
  const a = bench(); const b = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (const s of [a, b]) s.kernel.placePlant(s.grassPlant, at(6), at(6));
  a.kernel.step(60, "plants");
  b.kernel.step(60, "plants");
  expect(snap(a.kernel)).toEqual(snap(b.kernel));
});

test("N steps reproduce bit-identically — full fidelity (critters + plants)", () => {
  const a = bench(); const b = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (const s of [a, b]) {
    s.kernel.placePlant(s.grassPlant, at(8), at(8));
    s.kernel.placeCritter(s.critter, at(11), at(11)); // within seek range of the plant
  }
  a.kernel.step(90, "full");
  b.kernel.step(90, "full");
  expect(snap(a.kernel)).toEqual(snap(b.kernel));
  expect(a.kernel.tick).toBe(90);
});

test("placeCritter anchors its kind's den to the drop tile, not map.spawn", () => {
  const { kernel, critter } = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  const wx = at(30);
  const wy = at(3); // far from map.spawn (the 40x40 construct's center)
  kernel.placeCritter(critter, wx, wy);
  expect(kernel.critterSpecies[critter].den).toEqual({
    x: Math.floor(wx / TILE_SIZE),
    y: Math.floor(wy / TILE_SIZE),
  });
});

test("peaceful: step never births or kills a critter", () => {
  const { kernel, grassPlant, critter } = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (let i = 0; i < 6; i++) kernel.placePlant(grassPlant, at(4 + i), at(4));
  kernel.placeCritter(critter, at(7), at(6));
  const before = kernel.critterCount();
  kernel.step(120, "full");
  expect(kernel.critterCount()).toBe(before); // animals never die (nor multiply) in slice 1
});
