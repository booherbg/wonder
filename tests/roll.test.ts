import { expect, test } from "vitest";
import {
  PROVISIONAL_ID, nudgeCritterLooks, nudgePlantLooks, rollCritterBatch,
  rollPlantBatch, rollSeedFor, setCritterTraits, setPlantTraits,
} from "../src/life/roll";
import { generatePlantSpecies } from "../src/life/species";
import { morphOf } from "../src/life/fauna";
import { singleBiome, biomeSampler } from "../src/world/construct";
import { Tile } from "../src/world/types";
import { makeRng } from "../src/core/rng";

const SEED = 4242;

// a compact, comparable fingerprint of a batch (order + the fields that read)
const plantSig = (b: { name: string; habitat: number; archetype: { form: number; hue: number } }[]) =>
  b.map((s) => [s.name, s.habitat, s.archetype.form, Math.round(s.archetype.hue * 1e4)]);
const critterSig = (b: { name: string; size: number; role: string; morph: { plan: string } }[]) =>
  b.map((s) => [s.name, Math.round(s.size * 1e3), s.role, s.morph.plan]);

test("rollSeedFor is deterministic and cursor-sensitive", () => {
  expect(rollSeedFor(SEED, "plant", 0)).toBe(rollSeedFor(SEED, "plant", 0));
  expect(rollSeedFor(SEED, "plant", 0)).not.toBe(rollSeedFor(SEED, "plant", 1));
  expect(rollSeedFor(SEED, "plant", 0)).not.toBe(rollSeedFor(SEED, "critter", 0));
});

test("a plant batch is deterministic, right-sized, and provisional-id", () => {
  const a = rollPlantBatch(SEED, 0, 10);
  const b = rollPlantBatch(SEED, 0, 10);
  expect(a.length).toBe(10);
  expect(plantSig(a)).toEqual(plantSig(b)); // same seed+cursor ⇒ identical batch
  expect(a.every((s) => s.id === PROVISIONAL_ID)).toBe(true); // no real id until picked
});

test("re-roll (cursor+1) advances to a different batch", () => {
  expect(plantSig(rollPlantBatch(SEED, 0, 10))).not.toEqual(plantSig(rollPlantBatch(SEED, 1, 10)));
});

test("a habitat filter yields only placeable-habitat plant kinds", () => {
  const batch = rollPlantBatch(SEED, 0, 8, { habitats: new Set([Tile.Grass]) });
  expect(batch.length).toBeGreaterThan(0);
  expect(batch.every((s) => s.habitat === Tile.Grass)).toBe(true);
});

test("a critter batch is deterministic, right-sized, provisional-id, off-map den", () => {
  const map = biomeSampler(SEED);
  const plants = generatePlantSpecies(SEED);
  const a = rollCritterBatch(SEED, 0, 12, plants, map);
  const b = rollCritterBatch(SEED, 0, 12, plants, map);
  expect(a.length).toBe(12);
  expect(critterSig(a)).toEqual(critterSig(b));
  expect(a.every((s) => s.id === PROVISIONAL_ID && s.den.x === -1)).toBe(true);
  expect(a.every((s) => s.favoriteSpecies >= 0 && s.favoriteSpecies < plants.length)).toBe(true);
});

test("nudgePlantLooks drifts the genome but keeps form/habitat/id; the morph re-renders", () => {
  const [sp] = rollPlantBatch(SEED, 0, 1);
  const rng = makeRng(1);
  const out = nudgePlantLooks(sp, rng, 0.2);
  expect(out.archetype.form).toBe(sp.archetype.form); // form is structural, never mutates
  expect(out.habitat).toBe(sp.habitat);
  expect(out.id).toBe(sp.id);
  expect(out.archetype.hue).not.toBe(sp.archetype.hue); // looks changed
  expect(out.archetype).not.toBe(sp.archetype); // a fresh genome, not the same ref
});

test("nudgeCritterLooks re-rolls the body numbers → a fresh morph, same size", () => {
  const map = singleBiome(SEED, Tile.Grass, 32);
  const [sp] = rollCritterBatch(SEED, 0, 1, generatePlantSpecies(SEED), map);
  const out = nudgeCritterLooks(sp, makeRng(9), 0.3);
  expect(out.size).toBe(sp.size); // size is a TRAIT, untouched by a looks nudge
  expect(out.morph).toEqual(morphOf({ bodyHue: out.bodyHue, earLen: out.earLen, tailLen: out.tailLen, size: out.size }));
  expect(out.bodyHue).not.toBe(sp.bodyHue);
});

test("setCritterTraits patches role/size/palate and re-derives morph on a size change", () => {
  const map = singleBiome(SEED, Tile.Grass, 32);
  const [sp] = rollCritterBatch(SEED, 0, 1, generatePlantSpecies(SEED), map);
  const grazed = setCritterTraits(sp, { role: "grazer", size: 1.4 });
  expect(grazed.role).toBe("grazer");
  expect(grazed.size).toBeCloseTo(1.4);
  expect(grazed.morph).toEqual(morphOf({ bodyHue: sp.bodyHue, earLen: sp.earLen, tailLen: sp.tailLen, size: 1.4 }));
  expect(grazed.bodyHue).toBe(sp.bodyHue); // looks untouched
  const clamped = setCritterTraits(sp, { size: 99 });
  expect(clamped.size).toBeLessThanOrEqual(1.6); // size clamped to the legal band
});

test("setPlantTraits patches habitat + reseed flag only", () => {
  const [sp] = rollPlantBatch(SEED, 0, 1);
  const out = setPlantTraits(sp, { habitat: Tile.Marsh, substrateFeeder: true });
  expect(out.habitat).toBe(Tile.Marsh);
  expect(out.substrateFeeder).toBe(true);
  expect(out.archetype.form).toBe(sp.archetype.form); // looks untouched
});
