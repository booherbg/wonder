import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { generateCritterSpecies, spawnCritters, updateCritter } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { generate } from "../src/world/generate";
import { SWARM_COUNT_CAP, SwarmLayer } from "../src/game/swarms";

// The reciprocal boom, guarded. The swarm layer now PAYS its flower back: a
// well-matched, well-fed swarm pollinates the plant it works — tripping that
// plant's ordinary propagation, so a faithful insect+flower pair spreads faster.
// These pin the three properties that keep it peaceful:
//   (a) it ACCELERATES spread (a swarm's flower outgrows the same flower with none),
//   (b) it's FACULTATIVE (a flower with no swarm still persists — self-seeding is
//       the floor; removing swarms never kills a plant kind),
//   (c) it stays BOUNDED (per-tile caps hold; no runaway, no collapse) even with
//       the full island — critters, flora and swarms — running the whole time.

const SEED = 20; // the seed the ecology-holds guard uses too

const hostedCount = (flora: Flora, hosted: Set<number>): number =>
  flora.all.reduce((n, p) => n + (hosted.has(p.species) ? 1 : 0), 0);

// (a) Pollination accelerates spread. Two byte-identical islands live the same
// self-seeding life; only one also carries swarms that feed → adapt → pollinate
// as they go. The flowering plants under the swarms end up clearly more numerous
// than the very same flowers on the island with no pollinator at all.
test("pollination accelerates: a well-adapted swarm spreads its flower more than no swarm", () => {
  const speciesB = generatePlantSpecies(SEED);
  const floraB = new Flora(generate(SEED), speciesB, SEED);
  const layer = new SwarmLayer(SEED, speciesB, floraB);
  const hosted = new Set(layer.flowers.keys()); // the flowering species swarms work

  // the control: identical flora, but no swarm ever pollinates it
  const floraC = new Flora(generate(SEED), generatePlantSpecies(SEED), SEED);

  const start = hostedCount(floraB, hosted);
  for (let t = 0; t < 400; t++) {
    floraB.simTick();
    layer.tick(floraB); // swarms adapt to their flowers and pollinate them
    floraC.simTick(); // the same island, self-seeding alone
  }

  const boosted = hostedCount(floraB, hosted);
  const control = hostedCount(floraC, hosted);
  expect(boosted).toBeGreaterThan(start); // the flowers spread under their swarms...
  expect(boosted).toBeGreaterThan(control); // ...and more than with no pollinator
});

// (b) Facultative floor. With NO swarm layer ticking at all, the flowering kinds
// must still hold — the plant needs insects to THRIVE, never to SURVIVE. This is
// the resilience requirement: removing swarms never kills a plant kind.
test("facultative floor: a flowering kind with no swarm still persists (self-seeding never stops)", () => {
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(generate(SEED), species, SEED);
  // borrow the hosted-species set, but NEVER tick the layer — no pollination ever
  const hosted = new Set(new SwarmLayer(SEED, species, flora).flowers.keys());
  const startKinds = [...flora.speciesCounts]
    .filter(([s, n]) => hosted.has(s) && n > 0)
    .map(([s]) => s);
  expect(startKinds.length).toBeGreaterThan(0);

  for (let t = 0; t < 800; t++) flora.simTick(); // self-seeding alone, a long run

  // every flowering kind that started present is still present — it just spreads
  // slower without a pollinator, it never mass-dies
  for (const s of startKinds) expect(flora.speciesCounts.get(s) ?? 0).toBeGreaterThan(0);
});

// (c) Bounded. The full island — critters grazing/dispersing, flora self-seeding,
// AND the swarm layer pollinating — run for a long stretch must hold at a lush
// ceiling: never past the global cap (no runaway boom), never collapsing toward
// bare rock, and no swarm cloud exploding past its size lever. Mirrors the
// ecology-holds guard, with the pollination boost live the whole time.
test("an island run with the swarm layer stays bounded — under the cap, no collapse", () => {
  const map = generate(SEED);
  const plants = generatePlantSpecies(SEED);
  const flora = new Flora(map, plants, SEED);
  const critterSpecies = generateCritterSpecies(SEED, map, flora, plants);
  const critters = spawnCritters(critterSpecies, map, SEED);
  const layer = new SwarmLayer(SEED, plants, flora);
  const rng = makeRng(SEED ^ 0x50f7);

  const start = flora.count;
  let minPlants = start;
  let maxPlants = start;
  let maxPop = 0;
  for (let t = 0; t < 3000; t++) {
    const darkness = t % 90 < 36 ? 0.8 : 0; // a day/night, mirroring ecology-holds
    for (let s = 0; s < 2; s++)
      for (const c of critters)
        updateCritter(c, 1, map, flora, critterSpecies, null, rng, { darkness });
    flora.simTick();
    layer.tick(flora); // the pollination boost, running the whole time
    minPlants = Math.min(minPlants, flora.count);
    maxPlants = Math.max(maxPlants, flora.count);
    for (const e of layer.swarms) maxPop = Math.max(maxPop, e.sw.population);
  }

  // no runaway: the reciprocal boom never breaks the island's ceiling — per-tile
  // caps + crowding hold it well under the global cap at every point of the run
  expect(maxPlants).toBeLessThan(flora.tuning.maxPlants);
  // no collapse: the island holds its life the whole run
  expect(minPlants).toBeGreaterThan(start * 0.6);
  // and no cloud explodes past its size lever
  for (const e of layer.swarms) expect(e.sw.population).toBeLessThanOrEqual(e.sw.cap);
  expect(maxPop).toBeLessThanOrEqual(layer.swarms[0].sw.cap);
  // divergence buds cousins over the run, but bounded — never a runaway population
  expect(layer.swarms.length).toBeLessThanOrEqual(SWARM_COUNT_CAP);
});

// (d) Frame-rate independence (finding 1). Which plant a swarm feeds and
// pollinates is decided off its SIM-OWNED home, never the wall-clock-animated
// cloud position — so interleaving any number of uneven render frames between
// sim heartbeats must not change the sim by a single draw. Two byte-identical
// islands live the exact same heartbeats; one is also animated hard, as a fast
// frame rate would. The flora sequence (which pollination writes) and every
// swarm's state must come out identical.
test("live pollination is frame-rate-independent: render animation never perturbs the sim", () => {
  const snapshot = (withAnimate: boolean) => {
    const species = generatePlantSpecies(SEED);
    const flora = new Flora(generate(SEED), species, SEED);
    const layer = new SwarmLayer(SEED, species, flora);
    for (let t = 0; t < 400; t++) {
      flora.simTick();
      layer.tick(flora); // the sim heartbeat: feed, adapt, pollinate, diverge
      if (withAnimate) {
        // many uneven render frames easing the visual clouds all over the island
        for (let f = 0; f < 6; f++) layer.animate(0.008 + f * 0.005);
      }
    }
    return {
      plants: flora.all.map((p) => `${p.species}:${p.x}:${p.y}`).sort().join("|"),
      count: layer.swarms.length,
      pops: layer.swarms.map((e) => Math.round(e.sw.population * 1e6)),
      sensors: layer.swarms.map((e) => [...e.sw.sensor].join(",")),
    };
  };
  const still = snapshot(false);
  const animated = snapshot(true);
  expect(animated.count).toBe(still.count);
  expect(animated.pops).toEqual(still.pops);
  expect(animated.sensors).toEqual(still.sensors);
  expect(animated.plants).toBe(still.plants); // the flora sequence never diverged
});
