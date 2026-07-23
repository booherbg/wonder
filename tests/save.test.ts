import { expect, test } from "vitest";
import { generateCritterSpecies, spawnCritters } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import {
  packCrittersV2,
  packGenome,
  packWorld,
  restoreCritterRows,
  restoreCritters,
  restoreCrittersV2,
  restoreInventory,
  restorePlants,
  unpackGenome,
} from "../src/game/save";
import { generate } from "../src/world/generate";

const SEED = 42;

test("genome pack/unpack round-trips within rounding tolerance", () => {
  const species = generatePlantSpecies(SEED);
  const g = species[0].archetype;
  const back = unpackGenome(g.form, packGenome(g));
  expect(back.form).toBe(g.form);
  expect(back.hue).toBeCloseTo(g.hue, 3);
  expect(back.height).toBeCloseTo(g.height, 3);
  expect(back.glow).toBeCloseTo(g.glow, 3);
});

test("a saved world restores its plants, inventory, and drifted genomes", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  for (let i = 0; i < 20; i++) flora.simTick();
  const sample = flora.all[100];
  const inv = { seeds: [{ species: sample.species, genome: sample.genome }] };
  const saved = packWorld(SEED, flora.tick, { x: 500, y: 600 }, { x: 30, y: 31 }, inv, flora.all, 1234);

  const restored = new Flora(map, species, SEED, {}, {
    tick: saved.tick,
    plants: restorePlants(saved, species),
  });
  expect(restored.count).toBe(flora.count);
  expect(restored.tick).toBe(flora.tick);
  // habitat invariant still holds after restore (addPlant re-validates)
  for (const [key, bucket] of restored.byTile) {
    for (const p of bucket) {
      expect(map.tiles[key]).toBe(species[p.species].habitat);
    }
  }
  const invBack = restoreInventory(saved, species);
  expect(invBack.seeds).toHaveLength(1);
  expect(invBack.seeds[0].genome.hue).toBeCloseTo(sample.genome.hue, 3);
  expect(saved.home).toEqual([30, 31]);
});

test("a saved world round-trips its name, time, and critters where they stood", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  const critterSpecies = generateCritterSpecies(SEED, map, flora, species);
  const critters = spawnCritters(critterSpecies, map, SEED);
  critters[0].x = 1234.5; // move one so the round-trip has something to prove
  critters[0].y = 678.9;
  critters[0].energy = 0.42;
  const saved = packWorld(
    SEED,
    flora.tick,
    { x: 1, y: 1 },
    null,
    { seeds: [] },
    flora.all,
    1000,
    [],
    [],
    undefined,
    critters,
    { name: "My Little World", playMs: 3_600_000 },
  );
  expect(saved.name).toBe("My Little World");
  expect(saved.playMs).toBe(3_600_000);
  const back = restoreCritters(saved, critterSpecies);
  expect(back).toHaveLength(critters.length);
  expect(back[0].x).toBeCloseTo(1234.5, 1); // positions kept to a tenth of a pixel
  expect(back[0].y).toBeCloseTo(678.9, 1);
  expect(back[0].energy).toBeCloseTo(0.42, 3);
  expect(back[0].species).toBe(critters[0].species);
});

test("tilled soil tiles round-trip through the save", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  flora.laySoil(30, 31);
  flora.laySoil(32, 33);
  const saved = packWorld(
    SEED, flora.tick, { x: 1, y: 1 }, { x: 30, y: 31 }, { seeds: [] }, flora.all, 1000,
    [], [], undefined, [], { soil: flora.soilTileKeys() },
  );
  expect(saved.soil).toEqual(flora.soilTileKeys());
  const restored = new Flora(map, species, SEED, {}, {
    tick: saved.tick,
    plants: restorePlants(saved, species),
    soil: saved.soil,
  });
  expect(restored.hasSoilTile(30, 31)).toBe(true);
  expect(restored.hasSoilTile(32, 33)).toBe(true);
  // a save from before digging simply carries no tilled ground
  const old = packWorld(SEED, 0, { x: 1, y: 1 }, null, { seeds: [] }, [], 1000);
  expect(old.soil ?? null).toBeNull();
});

test("the garden bed is a 3x3 around home and boosts survival semantics", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  flora.setHome(50, 60);
  expect(flora.inGarden(50 * 16 + 8, 60 * 16 + 8)).toBe(true);
  expect(flora.inGarden(49 * 16 + 8, 61 * 16 + 8)).toBe(true); // corner of the 3x3
  expect(flora.inGarden(47 * 16 + 8, 60 * 16 + 8)).toBe(false); // two tiles out
  flora.setHome(null);
  expect(flora.inGarden(50 * 16 + 8, 60 * 16 + 8)).toBe(false);
});

test("GUARD: an old-format save (legacy [species,x,y,energy] rows, no crittersV2, no rng) restores to today's exact defaults", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  const critterSpecies = generateCritterSpecies(SEED, map, flora, species);

  // a hand-built legacy SavedWorld: ONLY the 4-element critter rows, nothing new
  const legacy = {
    v: 1 as const,
    seed: SEED,
    tick: 0,
    savedAt: 1000,
    player: [1, 1] as [number, number],
    home: null,
    inv: [],
    plants: [],
    critters: [
      [0, 100, 200, 0.5],
      [1, 300, 400, 0.9],
      [0, 500, 600, 0.1],
    ] as number[][],
  };

  const out = restoreCritters(legacy as unknown as import("../src/game/save").SavedWorld, critterSpecies);
  expect(out).toHaveLength(3);
  // the per-index desync trick + fresh-state defaults, byte-for-byte (save.ts:166-175)
  out.forEach((c, i) => {
    const row = legacy.critters[i];
    expect(c.species).toBe(row[0]);
    expect(c.x).toBe(row[1]);
    expect(c.y).toBe(row[2]);
    expect(c.energy).toBe(row[3]);
    expect(c.state).toBe("idle");
    expect(c.targetX).toBe(row[1]); // target collapses to current position
    expect(c.targetY).toBe(row[2]);
    expect(c.stateTime).toBe((i % 5) * 0.4);
    expect(c.hopPhase).toBe((i * 1.7) % 6.28);
    expect(c.facing).toBe(i % 2 === 0 ? 1 : -1);
    expect(c.curiosity).toBe(0);
    expect(c.mood).toBe("content");
    expect(c.meal).toBeUndefined(); // no meal/treat/stuck/path on a legacy restore
    expect(c.treat).toBeUndefined();
    expect(c.stuck).toBeUndefined();
    expect(c.path).toBeUndefined();
  });
  // an out-of-range species id is dropped, not restored (save.ts:157)
  const withBad = { ...legacy, critters: [[999, 1, 2, 0.5]] as number[][] };
  expect(restoreCritters(withBad as unknown as import("../src/game/save").SavedWorld, critterSpecies)).toHaveLength(0);
});

test("crittersV2 losslessly round-trips every behavioral field, and re-resolves meal to the live plant", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  for (let i = 0; i < 10; i++) flora.simTick();
  const critterSpecies = generateCritterSpecies(SEED, map, flora, species);
  const critters = spawnCritters(critterSpecies, map, SEED);

  // give one critter a rich, non-default behavioral state + a live meal
  const c = critters[0];
  c.x = 123.456; c.y = 78.9; // fractional — would be corrupted by any rounding
  c.state = "seek";
  c.targetX = 111.25; c.targetY = 222.5;
  c.stateTime = 1.234567; c.hopPhase = 4.2; c.facing = -1;
  c.energy = 0.135791; c.curiosity = 0.42; c.mood = "hungry";
  c.stuck = 0.7; c.path = [3, 4, 5]; c.pathGoal = 9; c.treat = true;
  const mealIdx = 12;
  c.meal = flora.all[mealIdx];

  const rows = packCrittersV2(critters, flora);
  const json = JSON.parse(JSON.stringify(rows)); // prove JSON-safe
  expect(json[0].meal).toBe(mealIdx); // meal serialized as a flora.all index

  // restore against a flora rebuilt in the SAME plant order (indices realign)
  const restoredFlora = new Flora(map, species, SEED, {}, {
    tick: flora.tick,
    plants: flora.all.map((p) => ({ species: p.species, genome: p.genome, x: p.x, y: p.y, born: p.born })),
  });
  const back = restoreCritterRows(json, critterSpecies, restoredFlora);
  const b = back[0];
  expect(b.x).toBe(123.456); // LOSSLESS — exact, not just close
  expect(b.y).toBe(78.9);
  expect(b.state).toBe("seek");
  expect(b.targetX).toBe(111.25);
  expect(b.targetY).toBe(222.5);
  expect(b.stateTime).toBe(1.234567); // LOSSLESS — no rounding
  expect(b.hopPhase).toBe(4.2);
  expect(b.facing).toBe(-1);
  expect(b.energy).toBe(0.135791);
  expect(b.curiosity).toBe(0.42);
  expect(b.mood).toBe("hungry");
  expect(b.stuck).toBe(0.7);
  expect(b.path).toEqual([3, 4, 5]);
  expect(b.pathGoal).toBe(9);
  expect(b.treat).toBe(true);
  expect(b.meal).toBe(restoredFlora.all[mealIdx]); // re-resolved to the live object, same identity
});

test("crittersV2 persists a nutrient-shuttle's carried substrate across a save round-trip (F1)", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED, { chains: true });
  const critterSpecies = generateCritterSpecies(SEED, map, flora, species);
  const critters = spawnCritters(critterSpecies, map, SEED).slice(0, 2);

  // one critter is mid-carry: it lifted a substrate off the pool (takeSubstrateNear
  // splices it out), so the ferried load now lives ONLY on the critter — the pool
  // is empty. World total = 1 (0 pooled + 1 carried).
  critters[0].carriedSubstrate = { hue: 0.37, glow: 0.6, form: PlantForm.Flower };
  expect(flora.substrates.length).toBe(0);

  const rows = packCrittersV2(critters, flora);
  const json = JSON.parse(JSON.stringify(rows)); // prove JSON-safe
  expect(json[0].carriedSubstrate).toEqual({ hue: 0.37, glow: 0.6, form: PlantForm.Flower });
  expect(json[1].carriedSubstrate).toBeUndefined(); // absent when empty-handed — legacy shape unchanged

  const back = restoreCritterRows(json, critterSpecies, flora);
  expect(back[0].carriedSubstrate).toEqual({ hue: 0.37, glow: 0.6, form: PlantForm.Flower });
  expect(back[1].carriedSubstrate).toBeUndefined();
  // pool STILL empty — the world total stays 1 (still carried, none dropped): the
  // peaceful-conservation pillar holds across the persistence round trip (C1).
  expect(flora.substrates.length).toBe(0);
});

test("crittersV2 preserves null vs. undefined meal, and drops out-of-range species", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  const critterSpecies = generateCritterSpecies(SEED, map, flora, species);
  const critters = spawnCritters(critterSpecies, map, SEED).slice(0, 3);
  critters[0].meal = null; // explicitly no meal
  // critters[1].meal stays undefined (no meal field at all)
  const rows = packCrittersV2(critters, flora);
  expect(rows[0].meal).toBeNull();
  expect(rows[1].meal).toBeUndefined();
  const back = restoreCritterRows(rows, critterSpecies, flora);
  expect(back[0].meal).toBeNull();
  expect(back[1].meal).toBeUndefined();
  // an out-of-range species id is dropped
  const bad = [{ ...rows[0], species: 999 }];
  expect(restoreCritterRows(bad, critterSpecies, flora)).toHaveLength(0);
  // a stale/out-of-range meal idx (beyond flora.all.length, e.g. from a save
  // taken against a since-shrunk flora) resolves to no meal — never crashes
  const oobRow = [{ ...rows[1], meal: flora.all.length + 5 }];
  const oobBack = restoreCritterRows(oobRow, critterSpecies, flora);
  expect(oobBack).toHaveLength(1);
  expect(oobBack[0].meal).toBeUndefined();
});

test("restoreCrittersV2 falls back to the LEGACY defaults when crittersV2 is absent (guard stays green through the dispatcher)", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(map, species, SEED);
  const critterSpecies = generateCritterSpecies(SEED, map, flora, species);
  const legacy = packWorld(SEED, 0, { x: 1, y: 1 }, null, { seeds: [] }, [], 1000, [], [], undefined, spawnCritters(critterSpecies, map, SEED));
  expect(legacy.crittersV2).toBeUndefined(); // packWorld with no crittersV2 extra writes none
  const viaDispatcher = restoreCrittersV2(legacy, critterSpecies, flora);
  const viaLegacy = restoreCritters(legacy, critterSpecies);
  // identical defaults — the dispatcher's absent-branch IS the legacy path
  expect(viaDispatcher.map((c) => [c.species, c.state, c.stateTime, c.facing, c.mood]))
    .toEqual(viaLegacy.map((c) => [c.species, c.state, c.stateTime, c.facing, c.mood]));
});
