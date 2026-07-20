import { expect, test } from "vitest";
import { Flora, SUBSTRATE_LIFETIME } from "../src/life/flora";
import { PlantForm, Genome } from "../src/life/genome";
import { PlantSpecies, generatePlantSpecies } from "../src/life/species";
import { TILE_SIZE } from "../src/world/config";
import { Tile, WorldMap } from "../src/world/types";
import { generate } from "../src/world/generate";

const SEED = 42;

function fieldMap(w = 16, h = 16, fill: Tile = Tile.Grass): WorldMap {
  return {
    width: w,
    height: h,
    seed: 1,
    tiles: new Uint8Array(w * h).fill(fill),
    elevation: new Float32Array(w * h),
    rivers: [],
    spawn: { x: 2, y: 2 },
  };
}

function moss(hue: number, habitat: Tile = Tile.Grass): PlantSpecies {
  const archetype: Genome = {
    form: PlantForm.Moss,
    hue,
    hue2: hue,
    sat: 0.8,
    height: 0.1,
    spread: 0.3,
    petals: 3,
    leaves: 0,
    lean: 0,
    glow: 0.5,
  };
  return { id: 0, name: "Test Moss", habitat, archetype, density: 0.5, sport: false, substrateFeeder: true };
}

// an empty flora (no scatter) so the ONLY way a plant appears is germination
function emptyFlora(map: WorldMap, species: PlantSpecies[], chains: boolean): Flora {
  return new Flora(map, species, SEED, { chains }, { tick: 0, plants: [] });
}

const at = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE });

test("(a) a feeder germinates on a hue-MATCH substrate within its lifetime", () => {
  const f = emptyFlora(fieldMap(), [moss(0.4)], true);
  const p = at(5, 5);
  f.addSubstrate(p.x, p.y, { hue: 0.4, glow: 0.5, form: PlantForm.Moss }); // exact hue match
  let germinated = false;
  for (let i = 0; i < SUBSTRATE_LIFETIME && !germinated; i++) {
    f.simTick();
    if (f.count > 0) germinated = true;
  }
  expect(germinated).toBe(true);
  expect(f.germinations).toBeGreaterThan(0);
  expect(f.all[0].species).toBe(0); // the feeder
});

test("(b) no germination on a hue-MISMATCH substrate", () => {
  const f = emptyFlora(fieldMap(), [moss(0.4)], true);
  const p = at(5, 5);
  f.addSubstrate(p.x, p.y, { hue: 0.85, glow: 0.5, form: PlantForm.Moss }); // 0.45 away, well past 0.12
  for (let i = 0; i < SUBSTRATE_LIFETIME + 10; i++) f.simTick();
  expect(f.count).toBe(0); // nothing ever took root
});

test("(c) germination respects addPlant: wrong habitat never takes root", () => {
  // the feeder lives on Grass, but the whole map is Rock — the substrate's
  // tile is never the feeder's habitat, so addPlant refuses it
  const f = emptyFlora(fieldMap(16, 16, Tile.Rock), [moss(0.4, Tile.Grass)], true);
  const p = at(5, 5);
  f.addSubstrate(p.x, p.y, { hue: 0.4, glow: 0.5, form: PlantForm.Moss });
  for (let i = 0; i < SUBSTRATE_LIFETIME + 10; i++) f.simTick();
  expect(f.count).toBe(0);
});

test("(c2) a full tile refuses germination; the substrate lingers then decays", () => {
  // reproChance 0 isolates the signal: the only way count could change is a
  // germination, and the full tile must refuse it
  const f = new Flora(fieldMap(), [moss(0.4)], SEED, { chains: true, reproChance: 0 }, { tick: 0, plants: [] });
  const tile = at(5, 5);
  for (let i = 0; i < f.tuning.maxPerTile; i++) {
    f.addPlant(0, moss(0.4).archetype, tile.x, tile.y, -f.tuning.matureAge);
  }
  const before = f.count;
  f.addSubstrate(tile.x, tile.y, { hue: 0.4, glow: 0.5, form: PlantForm.Moss });
  for (let i = 0; i < SUBSTRATE_LIFETIME; i++) f.simTick();
  expect(f.count).toBe(before); // no new plant took root on the full tile
  expect(f.germinations).toBe(0); // the refusal was real, not just crowded out
  expect(f.substrates).toHaveLength(0); // and the refused substrate has decayed
});

test("(d) an unfed substrate is gone after SUBSTRATE_LIFETIME", () => {
  // no feeders at all → the substrate can only decay
  const f = emptyFlora(fieldMap(), [], true);
  const p = at(5, 5);
  f.addSubstrate(p.x, p.y, { hue: 0.4, glow: 0.5, form: PlantForm.Moss });
  for (let i = 0; i < SUBSTRATE_LIFETIME - 1; i++) f.simTick();
  expect(f.substrates).toHaveLength(1); // still present at lifetime-1
  f.simTick();
  expect(f.substrates).toHaveLength(0); // gone at exactly SUBSTRATE_LIFETIME
});

test("(e) determinism: same seed + same scripted emissions → identical sequence", () => {
  const snap = (f: Flora) => ({
    plants: f.all.map((p) => [p.species, Math.round(p.x * 1e6), Math.round(p.y * 1e6), p.born]),
    subs: f.substrates.map((s) => [Math.round(s.x), Math.round(s.y), s.hue, s.born]),
    germ: f.germinations,
  });
  const run = () => {
    const f = emptyFlora(fieldMap(), [moss(0.4)], true);
    for (let i = 0; i < 200; i++) {
      if (i % 20 === 0) {
        const p = at(5 + (i % 3), 5);
        f.addSubstrate(p.x, p.y, { hue: 0.4, glow: 0.5, form: PlantForm.Moss });
      }
      f.simTick();
    }
    return snap(f);
  };
  expect(run()).toEqual(run());
  expect(run().germ).toBeGreaterThan(0); // germination actually exercised
});

test("(f) no-substrate identity: chains:true with zero substrates ≡ chains:false", () => {
  // real scatter + reproduction, no critter feeding → substrates stay empty,
  // so the chains-on flora must draw the exact same rng as chains-off
  const on = new Flora(generate(SEED), generatePlantSpecies(SEED), SEED, { chains: true });
  const off = new Flora(generate(SEED), generatePlantSpecies(SEED), SEED, { chains: false });
  for (let i = 0; i < 120; i++) {
    on.simTick();
    off.simTick();
  }
  expect(on.substrates).toHaveLength(0);
  expect(on.count).toBe(off.count);
  const posOn = on.all.map((p) => [p.species, Math.round(p.x * 1e6), Math.round(p.y * 1e6), p.born]);
  const posOff = off.all.map((p) => [p.species, Math.round(p.x * 1e6), Math.round(p.y * 1e6), p.born]);
  expect(posOn).toEqual(posOff);
});
