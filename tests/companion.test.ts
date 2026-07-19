import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import {
  generateCritterSpecies,
  releaseCompanion,
  spawnCritters,
  takeCompanion,
  updateCritter,
} from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { SavedWorld, packWorld } from "../src/game/save";
import { TILE_SIZE } from "../src/world/config";
import { generate } from "../src/world/generate";
import { WorldMap, isWalkable } from "../src/world/types";

const SEED = 42;

function world() {
  const map = generate(SEED);
  const plants = generatePlantSpecies(SEED);
  const flora = new Flora(map, plants, SEED);
  const critterSpecies = generateCritterSpecies(SEED, map, flora, plants);
  return { map, plants, flora, critterSpecies };
}

// a walkable place to stand, a good walk from the kind's den: the first
// tile of a deterministic ring scan, so the test never rolls dice for it
function standAt(map: WorldMap, den: { x: number; y: number }, r: number): { x: number; y: number } {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (isWalkable(map, den.x + dx, den.y + dy)) {
        return { x: (den.x + dx + 0.5) * TILE_SIZE, y: (den.y + dy + 0.5) * TILE_SIZE };
      }
    }
  }
  throw new Error("no walkable ground on the ring");
}

test("taking one home flags the nearest of its kind — and a new friend releases the old", () => {
  const { map, critterSpecies } = world();
  const critters = spawnCritters(critterSpecies, map, SEED);
  const den = critterSpecies[0].den;
  const player = { x: (den.x + 0.5) * TILE_SIZE, y: (den.y + 0.5) * TILE_SIZE };
  // the nearest of kind 0, found by hand
  const kind = critters.filter((c) => c.species === 0);
  expect(kind.length).toBeGreaterThan(0);
  const nearest = kind.reduce((a, b) =>
    Math.hypot(a.x - player.x, a.y - player.y) <= Math.hypot(b.x - player.x, b.y - player.y)
      ? a
      : b,
  );
  const chosen = takeCompanion(critters, 0, player);
  expect(chosen).toBe(nearest);
  expect(chosen?.companion).toBe(true);
  expect(critters.filter((c) => c.companion)).toHaveLength(1);
  // asking a new friend releases the old one kindly — one at a time, always
  const second = takeCompanion(critters, 1, player);
  expect(second?.species).toBe(1);
  expect(nearest.companion).toBe(false);
  expect(critters.filter((c) => c.companion)).toHaveLength(1);
  // and released outright, no one wears the mark
  expect(releaseCompanion(critters)).toBe(second);
  expect(critters.some((c) => c.companion)).toBe(false);
  // a kind with no one on the island simply can't be asked
  expect(takeCompanion(critters, 99, player)).toBeNull();
});

test("a companion keeps the wanderer's company; its wild twin keeps its own", () => {
  const { map, flora, critterSpecies } = world();
  const critters = spawnCritters(critterSpecies, map, SEED);
  // stand a good walk from the kind's den, so following is a real choice
  const player = standAt(map, critterSpecies[0].den, 12);
  const companion = takeCompanion(critters, 0, player);
  expect(companion).not.toBeNull();
  const twin = critters.find((c) => c.species === 0 && c !== companion);
  expect(twin).toBeDefined();
  const rng = makeRng(5);
  const dt = 1 / 30;
  let compSum = 0;
  let twinSum = 0;
  let samples = 0;
  for (let step = 0; step < 30 * 90; step++) {
    for (const c of critters) updateCritter(c, dt, map, flora, critterSpecies, player, rng);
    // the companion walks only real ground, wherever the following leads
    const tx = Math.floor(companion!.x / TILE_SIZE);
    const ty = Math.floor(companion!.y / TILE_SIZE);
    expect(isWalkable(map, tx, ty)).toBe(true);
    if (step >= 30 * 30) {
      // after the walk over: measure who actually keeps your company
      compSum += Math.hypot(companion!.x - player.x, companion!.y - player.y);
      twinSum += Math.hypot(twin!.x - player.x, twin!.y - player.y);
      samples++;
    }
  }
  const compAvg = compSum / samples;
  const twinAvg = twinSum / samples;
  expect(compAvg).toBeLessThan(3 * TILE_SIZE); // truly at your heel
  expect(compAvg).toBeLessThan(twinAvg * 0.5); // measurably closer than its wild twin
  // the ledger invariant, kept warmest of all for a friend: it never starves
  expect(companion!.energy).toBeGreaterThan(0.3);
});

test("the save carries the friend home: packWorld → SavedWorld → the kind re-adopted", () => {
  const { map, flora, critterSpecies } = world();
  const player = { x: 500, y: 600 };
  const saved = packWorld(
    SEED,
    flora.tick,
    player,
    { x: 30, y: 31 },
    { seeds: [] },
    flora.all,
    1234,
    [],
    [],
    {
      wood: 1,
      stone: 0,
      rush: 0,
      taken: [],
      fire: true,
      companion: { species: 2, name: critterSpecies[2].name },
    },
  );
  // through the letterbox of JSON and back, identity intact
  const back = JSON.parse(JSON.stringify(saved)) as SavedWorld;
  expect(back.camp?.companion).toEqual({ species: 2, name: critterSpecies[2].name });
  expect(back.camp?.fire).toBe(true); // the rest of the camp block rides undisturbed
  // individuals respawn each load: what the save keeps is the kind — on
  // return, the nearest of it is re-designated yours, waiting where you
  // left it
  const critters = spawnCritters(critterSpecies, map, SEED);
  const comp = back.camp?.companion;
  const readopted = comp ? takeCompanion(critters, comp.species, player) : null;
  expect(readopted?.species).toBe(2);
  expect(readopted?.companion).toBe(true);
  expect(critters.filter((c) => c.companion)).toHaveLength(1);
});
