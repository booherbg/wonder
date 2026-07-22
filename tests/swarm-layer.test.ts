import { expect, test } from "vitest";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { generate } from "../src/world/generate";
import { isBloom } from "../src/render/ambient";
import {
  MAX_SWARMS,
  MIN_SWARMS,
  SwarmLayer,
  buildFlowerMaps,
  canFlower,
  flowerSizeFor,
} from "../src/game/swarms";

// The world swarm layer is a purely additive life/visual layer bolted onto a
// real island: it reads flora, spawns a bounded set of swarms near the blooms,
// and each heartbeat homes each on its nearest flowering plant. These pin the
// spatial glue (the part on top of the tested idmap/swarm core) and — crucially
// — that it never disturbs the flora it rides on.

const SEED = 20; // the seed the ecology-holds guard uses too

function build(seed = SEED): { flora: Flora; layer: SwarmLayer; species: ReturnType<typeof generatePlantSpecies> } {
  const map = generate(seed);
  const species = generatePlantSpecies(seed);
  const flora = new Flora(map, species, seed);
  const layer = new SwarmLayer(seed, species, flora);
  return { flora, layer, species };
}

test("a flower map is built for every flowering species, and only those", () => {
  const species = generatePlantSpecies(SEED);
  const flowers = buildFlowerMaps(SEED, species);
  for (const sp of species) {
    if (canFlower(sp.archetype.form)) {
      const flower = flowers.get(sp.id);
      expect(flower).toBeDefined();
      // the accent (the jackpot cells) is exactly the species' flower size
      const accentCells = flower!.accent.reduce((n, v) => n + v, 0);
      expect(accentCells).toBe(flowerSizeFor(sp));
      // a base/foliage colour always fills the grid — there's always something to match
      expect(flower!.map.some((v) => v !== 0)).toBe(true);
    } else {
      expect(flowers.has(sp.id)).toBe(false);
    }
  }
});

test("canFlower matches the isBloom forms (flowers, shrubs, succulents)", () => {
  expect(canFlower(PlantForm.Flower)).toBe(true);
  expect(canFlower(PlantForm.Shrub)).toBe(true);
  expect(canFlower(PlantForm.Succulent)).toBe(true);
  expect(canFlower(PlantForm.Tree)).toBe(false);
  expect(canFlower(PlantForm.Fungus)).toBe(false);
  expect(canFlower(PlantForm.Coral)).toBe(false);
});

test("swarms spawn only on/near flowering plants", () => {
  const { flora, layer } = build();
  expect(layer.swarms.length).toBeGreaterThanOrEqual(MIN_SWARMS);
  expect(layer.swarms.length).toBeLessThanOrEqual(MAX_SWARMS);
  const blooms = flora.all.filter((p) => isBloom(p) && layer.flowers.has(p.species));
  for (const ent of layer.swarms) {
    // each swarm is anchored to a real flowering plant it can work
    expect(ent.home).not.toBeNull();
    expect(layer.flowers.has(ent.home!.species)).toBe(true);
    const host = blooms.find(
      (p) => p.species === ent.home!.species && p.x === ent.home!.x && p.y === ent.home!.y,
    );
    expect(host).toBeDefined();
    // and it hovers close to a bloom, never adrift over bare ground
    const nearestBloom = Math.min(...blooms.map((p) => Math.hypot(p.x - ent.x, p.y - ent.y)));
    expect(nearestBloom).toBeLessThan(3 * 16); // within ~3 tiles
  }
});

test("a swarm re-homes onto the nearest flowering plant each heartbeat", () => {
  const { flora, layer } = build();
  const ent = layer.swarms[0];
  const blooms = flora.all.filter((p) => isBloom(p) && layer.flowers.has(p.species));
  // teleport the cloud onto a DIFFERENT bloom, well away from its current home
  const target = blooms.find((p) => Math.hypot(p.x - ent.x, p.y - ent.y) > 4 * 16);
  expect(target).toBeDefined();
  ent.x = target!.x;
  ent.y = target!.y;
  layer.tick(flora);
  // the nearest flowering plant to that spot is the target itself (distance 0)
  expect(ent.home).not.toBeNull();
  expect(ent.home!.x).toBe(target!.x);
  expect(ent.home!.y).toBe(target!.y);
  expect(ent.home!.species).toBe(target!.species);
});

test("swarms adapt: feeding + evolving lifts resemblance toward the host flower", () => {
  const { flora, layer } = build();
  const ent = layer.swarms.find((e) => e.home)!;
  const flower = layer.flowers.get(ent.home!.species)!;
  const before = ent.sw.pool.slice(); // snapshot the gene pool
  for (let t = 0; t < 60; t++) layer.tick(flora);
  const view = layer.inspect(ent, generatePlantSpecies(SEED));
  expect(view).not.toBeNull();
  // resemblance is a real 0..1 fraction, and the pool has genuinely changed
  expect(view!.resemblance).toBeGreaterThanOrEqual(0);
  expect(view!.resemblance).toBeLessThanOrEqual(1);
  expect(ent.sw.pool.some((g, i) => before[i] !== g)).toBe(true);
  // the host name resolves to the flowering species it works
  expect(view!.hostName.length).toBeGreaterThan(0);
  expect(flower.map.length).toBe(view!.sensor.length);
});

test("the swarm layer is deterministic from the seed", () => {
  const a = build();
  const b = build();
  expect(b.layer.swarms.length).toBe(a.layer.swarms.length);
  for (let i = 0; i < a.layer.swarms.length; i++) {
    expect(b.layer.swarms[i].x).toBe(a.layer.swarms[i].x);
    expect(b.layer.swarms[i].y).toBe(a.layer.swarms[i].y);
    expect(b.layer.swarms[i].sw.population).toBe(a.layer.swarms[i].sw.population);
    expect([...b.layer.swarms[i].sw.sensor]).toEqual([...a.layer.swarms[i].sw.sensor]);
  }
});

test("the swarm layer never disturbs the flora it rides on (seed-safe)", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  // a control flora, untouched by any swarm layer
  const control = new Flora(map, species, SEED);
  const controlSnapshot = control.all.map((p) => `${p.species}:${p.x}:${p.y}`).join("|");

  // a second flora that carries a swarm layer, ticked hard
  const map2 = generate(SEED);
  const species2 = generatePlantSpecies(SEED);
  const flora = new Flora(map2, species2, SEED);
  const before = flora.all.map((p) => `${p.species}:${p.x}:${p.y}`).join("|");
  const layer = new SwarmLayer(SEED, species2, flora);
  layer.animate(0.5);
  for (let t = 0; t < 200; t++) layer.tick(flora);

  // flora is byte-identical to before the swarm layer touched it...
  expect(flora.all.map((p) => `${p.species}:${p.x}:${p.y}`).join("|")).toBe(before);
  // ...and identical to a flora that never had a swarm layer at all
  expect(before).toBe(controlSnapshot);
});
