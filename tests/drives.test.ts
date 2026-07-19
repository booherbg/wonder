import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import {
  Critter,
  CritterContext,
  critterDrives,
  dominantDrive,
  generateCritterSpecies,
  spawnCritters,
  updateCritter,
} from "../src/life/fauna";
import { Flora } from "../src/life/flora";
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

// a critter on a bench: just enough body to ask the drives a question
function mk(energy: number, curiosity = 0): Critter {
  return {
    species: 0,
    x: 0,
    y: 0,
    state: "idle",
    targetX: 0,
    targetY: 0,
    stateTime: 0,
    hopPhase: 0,
    facing: 1,
    energy,
    curiosity,
    mood: "content",
  };
}

test("an empty belly is the loudest voice — even against night and play", () => {
  expect(dominantDrive(critterDrives(mk(0.15)))).toBe("hunger");
  // deep night, curiosity at its cap: real hunger still wins
  expect(dominantDrive(critterDrives(mk(0.2, 0.55), { darkness: 0.75 }))).toBe("hunger");
});

test("a spent body's need for the den outranks even hunger — nothing starves", () => {
  expect(dominantDrive(critterDrives(mk(0.04)))).toBe("comfort");
  expect(dominantDrive(critterDrives(mk(0)))).toBe("comfort");
});

test("a full belly in daylight presses nothing — the critter is content", () => {
  const d = critterDrives(mk(0.95));
  expect(d.hunger).toBe(0);
  expect(dominantDrive(d)).toBe(null);
});

test("night leans a fed critter homeward; in daylight the same belly grazes", () => {
  expect(dominantDrive(critterDrives(mk(0.6), { darkness: 0.75 }))).toBe("comfort");
  expect(dominantDrive(critterDrives(mk(0.6), { darkness: 0 }))).toBe("hunger");
});

test("curiosity wins only an easy heart — never a truly empty one", () => {
  expect(dominantDrive(critterDrives(mk(0.8, 0.55)))).toBe("curiosity");
  expect(dominantDrive(critterDrives(mk(0.5, 0.55)))).toBe("hunger");
});

test("a hungry critter goes to food: seek, then nibble, wearing 'hungry'", () => {
  const { map, flora, critterSpecies } = world();
  const critters = spawnCritters(critterSpecies, map, SEED);
  const c = critters[0];
  c.energy = 0.2;
  c.stateTime = 0;
  const rng = makeRng(5);
  const dt = 1 / 30;
  let sawSeekHungry = false;
  let sawNibble = false;
  for (let step = 0; step < 30 * 60; step++) {
    updateCritter(c, dt, map, flora, critterSpecies, null, rng);
    if (c.state === "seek" && c.mood === "hungry") sawSeekHungry = true;
    if (c.state === "nibble") sawNibble = true;
  }
  expect(sawSeekHungry).toBe(true);
  expect(sawNibble).toBe(true);
});

test("a fed critter sidles toward a wanderer who keeps still", () => {
  const { map, flora, critterSpecies } = world();
  const critters = spawnCritters(critterSpecies, map, SEED);
  const c = critters[0];
  c.energy = 1;
  c.stateTime = 0;
  const player = { x: c.x + 2 * TILE_SIZE, y: c.y };
  const ctx: CritterContext = { playerStill: true };
  const rng = makeRng(5);
  const dt = 1 / 30;
  const startDist = Math.hypot(player.x - c.x, player.y - c.y);
  let minDist = startDist;
  let sawCurious = false;
  for (let step = 0; step < 30 * 30; step++) {
    updateCritter(c, dt, map, flora, critterSpecies, player, rng, ctx);
    minDist = Math.min(minDist, Math.hypot(player.x - c.x, player.y - c.y));
    if (c.mood === "curious") sawCurious = true;
  }
  expect(sawCurious).toBe(true);
  expect(minDist).toBeLessThan(startDist * 0.6);
});

test("in the dark, critters turn homeward, drowsy, and sleep at the den", () => {
  const { map, flora, critterSpecies } = world();
  const critters = spawnCritters(critterSpecies, map, SEED);
  for (const c of critters) c.energy = 0.6;
  const ctx: CritterContext = { darkness: 0.75 };
  const rng = makeRng(3);
  const dt = 1 / 30;
  let sawDrowsy = false;
  for (let step = 0; step < 30 * 60; step++) {
    for (const c of critters) {
      updateCritter(c, dt, map, flora, critterSpecies, null, rng, ctx);
      if (c.mood === "drowsy") sawDrowsy = true;
    }
  }
  expect(sawDrowsy).toBe(true);
  const asleep = critters.filter((c) => c.state === "sleep");
  expect(asleep.length).toBeGreaterThanOrEqual(Math.ceil(critters.length / 2));
  // and the sleepers are curled at their own dens
  for (const c of asleep) {
    const den = critterSpecies[c.species].den;
    const d = Math.hypot(c.x - (den.x + 0.5) * TILE_SIZE, c.y - (den.y + 0.5) * TILE_SIZE);
    expect(d).toBeLessThan(3 * TILE_SIZE);
  }
});

test("nothing starves: a spent critter turns weary, sleeps, and rises", () => {
  const { map, flora, critterSpecies } = world();
  const critters = spawnCritters(critterSpecies, map, SEED);
  const c = critters[0];
  c.energy = 0.04;
  c.stateTime = 0;
  const rng = makeRng(9);
  const dt = 1 / 30;
  let sawWeary = false;
  let sawSleep = false;
  let peak = c.energy;
  for (let step = 0; step < 30 * 60; step++) {
    updateCritter(c, dt, map, flora, critterSpecies, null, rng);
    if (c.mood === "weary") sawWeary = true;
    if (c.state === "sleep") sawSleep = true;
    expect(c.energy).toBeGreaterThanOrEqual(0);
    peak = Math.max(peak, c.energy);
  }
  expect(sawWeary).toBe(true);
  expect(sawSleep).toBe(true);
  expect(peak).toBeGreaterThan(0.15); // sleep gave back more than living took
});

test("the same seed is the same life: two runs march in step", () => {
  const run = () => {
    const { map, flora, critterSpecies } = world();
    const critters = spawnCritters(critterSpecies, map, SEED);
    const rng = makeRng(11);
    const dt = 1 / 30;
    const player = { x: (map.spawn.x + 0.5) * TILE_SIZE, y: (map.spawn.y + 0.5) * TILE_SIZE };
    for (let step = 0; step < 30 * 30; step++) {
      const ctx: CritterContext = { darkness: step > 450 ? 0.75 : 0, playerStill: true };
      for (const c of critters) {
        updateCritter(c, dt, map, flora, critterSpecies, player, rng, ctx);
      }
    }
    return critters.map((c) => ({
      x: c.x,
      y: c.y,
      state: c.state,
      mood: c.mood,
      energy: c.energy,
      curiosity: c.curiosity,
    }));
  };
  expect(run()).toEqual(run());
});
