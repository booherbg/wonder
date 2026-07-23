import { expect, test } from "vitest";
import { SimKernel } from "../src/life/kernel";
import { generatePlantSpecies } from "../src/life/species";
import { generateCritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { singleBiome } from "../src/world/construct"; // built in Task 2
import { Tile } from "../src/world/types";
import { TILE_SIZE } from "../src/world/config";
import { rollPlantBatch, rollCritterBatch } from "../src/life/roll";

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

test("introducePlantSpecies appends with id === index and Flora accepts it live", () => {
  const { kernel } = bench();
  const before = kernel.plantSpecies.length;
  const [cand] = rollPlantBatch(SEED, 0, 1, { habitats: new Set([Tile.Grass]) });
  const id = kernel.introducePlantSpecies({ ...cand, habitat: Tile.Grass });
  expect(id).toBe(before);
  expect(kernel.plantSpecies[id].id).toBe(id); // id === array index (the invariant Flora relies on)
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  expect(kernel.placePlant(id, at(5), at(5))).not.toBeNull(); // the fresh kind roots
  expect(kernel.speciesCounts().get(id)).toBe(1);
});

test("introduceCritterSpecies appends with id === index; the kind places + steps", () => {
  const { kernel } = bench();
  const before = kernel.critterSpecies.length;
  const [cand] = rollCritterBatch(SEED, 0, 1, kernel.plantSpecies, kernel.map);
  const id = kernel.introduceCritterSpecies({ ...cand });
  expect(id).toBe(before);
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  kernel.placeCritter(id, at(6), at(6));
  expect(kernel.critterCountOf(id)).toBe(1);
  kernel.step(10, "full"); // the new kind updates headless without throwing
  expect(kernel.critterCountOf(id)).toBe(1); // peaceful: step never removes it
});

test("clearPlantInstances / clearCritterInstances zero a kind but keep its record (no splice)", () => {
  const { kernel, grassPlant, critter } = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (let i = 0; i < 4; i++) kernel.placePlant(grassPlant, at(4 + i), at(4));
  kernel.placeCritter(critter, at(7), at(6));
  const plantRecords = kernel.plantSpecies.length;
  const critterRecords = kernel.critterSpecies.length;
  expect(kernel.clearPlantInstances(grassPlant)).toBe(4);
  expect(kernel.clearCritterInstances(critter)).toBe(1);
  expect(kernel.speciesCounts().get(grassPlant) ?? 0).toBe(0); // population → 0
  expect(kernel.critterCountOf(critter)).toBe(0);
  expect(kernel.plantSpecies.length).toBe(plantRecords); // record kept — ids stay stable
  expect(kernel.critterSpecies.length).toBe(critterRecords);
});

test("setTuning takes effect LIVE on the next step — no rebuild, state preserved", () => {
  const { kernel, grassPlant } = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (let i = 0; i < 8; i++) kernel.placePlant(grassPlant, at(4 + i), at(4 + (i % 3)));
  kernel.setTuning({ reproChance: 0 }); // no reseed at all
  kernel.step(60, "plants");
  const held = kernel.flora.count; // barely grew (only aging/thinning)
  // crank reseed + ceiling on the SAME running kernel — no new construct
  kernel.setTuning({ reproChance: 0.4, maxPerTile: 12 });
  kernel.step(60, "plants");
  expect(kernel.flora.count).toBeGreaterThan(held); // the live change drove growth
  expect(kernel.tick).toBe(120); // never rebuilt — the tick kept climbing, state preserved
});

test("a setTuning schedule is deterministic (same schedule ⇒ identical run)", () => {
  const a = bench();
  const b = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (const s of [a, b]) {
    for (let i = 0; i < 6; i++) s.kernel.placePlant(s.grassPlant, at(4 + i), at(5));
    s.kernel.step(30, "plants");
    s.kernel.setTuning({ mutationAmount: 0.25, reproChance: 0.3 });
    s.kernel.step(30, "plants");
  }
  expect(snap(a.kernel)).toEqual(snap(b.kernel));
});

test("setCritterRole flips a kind's role live; step still never births/removes a critter (peaceful)", () => {
  const { kernel, grassPlant, critter } = bench();
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (let i = 0; i < 6; i++) kernel.placePlant(grassPlant, at(4 + i), at(4));
  kernel.placeCritter(critter, at(7), at(6));
  kernel.setCritterRole(critter, "grazer");
  expect(kernel.critterSpecies[critter].role).toBe("grazer");
  const before = kernel.critterCount();
  kernel.step(120, "full"); // a grazer thins plants — but never dies, nor multiplies
  expect(kernel.critterCount()).toBe(before);
});
