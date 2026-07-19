import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import {
  Critter,
  generateCritterSpecies,
  updateCritter,
} from "../src/life/fauna";
import { Flora, Plant } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { TILE_SIZE } from "../src/world/config";
import { generate } from "../src/world/generate";

const SEED = 42;

function world() {
  const map = generate(SEED);
  const plants = generatePlantSpecies(SEED);
  const flora = new Flora(map, plants, SEED);
  const critterSpecies = generateCritterSpecies(SEED, map, flora, plants);
  return { map, plants, flora, critterSpecies };
}

// a critter caught mid-chew on a given plant — enough body to land the visit
function nibbling(species: number, meal: Plant): Critter {
  return {
    species,
    x: meal.x,
    y: meal.y,
    state: "nibble",
    targetX: meal.x,
    targetY: meal.y,
    stateTime: 0, // the next tick completes the visit
    hopPhase: 0,
    facing: 1,
    energy: 0.5,
    meal,
    curiosity: 0,
    mood: "hungry",
  };
}

// The mutualist half of the reframe, measured at the flora level the way
// graze.test.ts measures the grazer half: a disperser's visit *spreads* the
// plant instead of consuming it, and the patch outgrows an untouched twin.
test("a visited patch spreads past its untouched twin, never over the per-tile cap", () => {
  const twin = new Flora(generate(SEED), generatePlantSpecies(SEED), SEED);
  const visited = new Flora(generate(SEED), generatePlantSpecies(SEED), SEED);
  const target = visited.all[0].species;
  const countOf = (f: Flora) => f.speciesCounts.get(target) ?? 0;
  const start = countOf(visited);

  // the original patch, captured once, keeps carrying its seed to open ground
  const seedPatch = visited.all.filter((p) => p.species === target);
  for (let round = 0; round < 20; round++) {
    for (const p of seedPatch) visited.propagate(p);
  }

  expect(countOf(visited)).toBeGreaterThan(start); // the patch grew...
  expect(countOf(visited)).toBeGreaterThan(countOf(twin)); // ...past its untouched twin
  // and every original is still standing — a mutualist visit harms nothing
  for (const p of seedPatch) expect(visited.all.includes(p)).toBe(true);
  // finite space is the only ceiling: no tile ever holds more than the cap
  for (const [, bucket] of visited.byTile) {
    expect(bucket.length).toBeLessThanOrEqual(visited.tuning.maxPerTile);
  }
});

// Positive feedback, capped by finite space: hammer one plant and its
// neighborhood fills to the per-tile cap, after which propagate simply
// no-ops. That saturation — not predation — is the whole balancer.
test("dispersal saturates on finite space: a hammered plant hits a ceiling and stops", () => {
  const { flora } = world();
  const p = flora.all[0];
  const before = flora.count;
  let refusals = 0;
  for (let i = 0; i < 400; i++) {
    if (!flora.propagate(p)) refusals++;
  }
  expect(flora.count).toBeGreaterThanOrEqual(before); // a visit never removes
  expect(refusals).toBeGreaterThan(0); // the neighborhood saturated and refused
  expect(flora.all.includes(p)).toBe(true); // the visited plant stands, unharmed
  for (const [, bucket] of flora.byTile) {
    expect(bucket.length).toBeLessThanOrEqual(flora.tuning.maxPerTile);
  }
});

// A drifted seed can only take root on the species' own habitat — addPlant
// refuses the rest, so a spread patch never bleeds onto the wrong terrain.
test("propagate only sows on the species' own habitat", () => {
  const { map, plants, flora } = world();
  const target = flora.all[0].species;
  const habitat = plants[target].habitat;
  const seedPatch = flora.all.filter((p) => p.species === target);
  for (let round = 0; round < 10; round++) {
    for (const p of seedPatch) flora.propagate(p);
  }
  for (const q of flora.all) {
    if (q.species !== target) continue;
    const tx = Math.floor(q.x / TILE_SIZE);
    const ty = Math.floor(q.y / TILE_SIZE);
    expect(map.tiles[ty * map.width + tx]).toBe(habitat);
  }
});

// The fork itself, through updateCritter: same meal, same energy gained, but
// a disperser leaves the plant standing (and may spread it) while a grazer
// genuinely consumes it. Both feed — the ledger invariant is untouched.
test("the fork in the visit: a disperser spreads its meal, a grazer consumes it", () => {
  const dt = 1 / 30;

  // grazer: a young plant is eaten whole
  {
    const map = generate(SEED);
    const plants = generatePlantSpecies(SEED);
    const flora = new Flora(map, plants, SEED);
    const critterSpecies = generateCritterSpecies(SEED, map, flora, plants);
    critterSpecies[0].role = "grazer";
    const meal = flora.all[0];
    meal.born = flora.tick; // young → a bite eats it whole
    const before = flora.count;
    const c = nibbling(0, meal);
    updateCritter(c, dt, map, flora, critterSpecies, null, makeRng(1));
    expect(flora.count).toBe(before - 1); // consumed
    expect(flora.all.includes(meal)).toBe(false);
    expect(c.energy).toBeGreaterThan(0.5); // still fed
  }

  // disperser: the same young plant is left standing, and may seed nearby
  {
    const map = generate(SEED);
    const plants = generatePlantSpecies(SEED);
    const flora = new Flora(map, plants, SEED);
    const critterSpecies = generateCritterSpecies(SEED, map, flora, plants);
    critterSpecies[0].role = "disperser";
    const meal = flora.all[0];
    meal.born = flora.tick;
    const before = flora.count;
    const c = nibbling(0, meal);
    updateCritter(c, dt, map, flora, critterSpecies, null, makeRng(1));
    expect(flora.all.includes(meal)).toBe(true); // unharmed, still standing
    expect(flora.count).toBeGreaterThanOrEqual(before); // never fewer; maybe one more
    expect(c.energy).toBeGreaterThan(0.5); // fed just the same
  }
});

// Mutualism dominates by construction. Sampled across many seeds: grazers
// exist (the thread of friction is real) but dispersers clearly outnumber
// them. A critter's role is rolled off its own seed's rng stream, so one
// shared island is enough — only the seed passed to generateCritterSpecies
// varies, and that is what sets each critter's disposition.
test("dispositions: dispersal dominates every island, grazing is a minority thread", () => {
  const { map, plants, flora } = world();
  let dispersers = 0;
  let grazers = 0;
  for (let seed = 1; seed <= 300; seed++) {
    for (const sp of generateCritterSpecies(seed, map, flora, plants)) {
      if (sp.role === "grazer") grazers++;
      else dispersers++;
    }
  }
  expect(grazers).toBeGreaterThan(0); // friction is real
  expect(dispersers).toBeGreaterThan(grazers * 2); // but dispersal clearly dominates
});
