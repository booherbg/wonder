import { expect, test } from "vitest";
import { critterWalkable, fishWalkable, updateCritter } from "../src/life/fauna";
import type { Critter, CritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { biomeSampler } from "../src/world/construct";
import { Tile, WorldMap, tileAt } from "../src/world/types";
import { TILE_SIZE } from "../src/world/config";
import { makeRng } from "../src/core/rng";

// A 8×3 strip: an all-DeepWater sea with one row of [Grass, 4×ShallowWater,
// 3×DeepWater]. Tile (1,1) shallow fronts the grass → SHORE; (2,1)..(4,1) shallow
// have no dry neighbour → OPEN-SEA; (0,1) is dry Grass; (5,1) is DeepWater.
function stripMap(): WorldMap {
  const w = 8;
  const h = 3;
  const tiles = new Uint8Array(w * h);
  tiles.fill(Tile.DeepWater);
  const row = 1;
  tiles[row * w + 0] = Tile.Grass;
  tiles[row * w + 1] = Tile.ShallowWater;
  tiles[row * w + 2] = Tile.ShallowWater;
  tiles[row * w + 3] = Tile.ShallowWater;
  tiles[row * w + 4] = Tile.ShallowWater;
  const elevation = new Float32Array(w * h);
  elevation.fill(0.5);
  return { width: w, height: h, seed: 1, tiles, elevation, rivers: [], spawn: { x: 0, y: 1 } };
}

test("fishWalkable frees open-sea shallows a land critter refuses; the land rule is unchanged", () => {
  const m = stripMap();
  // dry grass (0,1): land yes, fish no
  expect(critterWalkable(m, 0, 1)).toBe(true);
  expect(fishWalkable(m, 0, 1)).toBe(false);
  // shore shallow (1,1): fronts grass — both yes
  expect(critterWalkable(m, 1, 1)).toBe(true);
  expect(fishWalkable(m, 1, 1)).toBe(true);
  // open-sea shallow (3,1): no dry neighbour — land NO (unchanged rule), fish YES
  expect(critterWalkable(m, 3, 1)).toBe(false);
  expect(fishWalkable(m, 3, 1)).toBe(true);
  // deep water (5,1): neither
  expect(critterWalkable(m, 5, 1)).toBe(false);
  expect(fishWalkable(m, 5, 1)).toBe(false);
});

test("a fish crosses open-sea shallows toward a target; a land critter cannot (default path inert)", () => {
  const m = stripMap();
  const plants = generatePlantSpecies(1);
  const flora = new Flora(m, plants, 1, { chains: true });
  const center = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE });
  const target = center(4, 1); // far open-sea shallow
  const start = center(1, 1); // shore shallow — both can stand here

  const mkSp = (role: CritterSpecies["role"]): CritterSpecies[] =>
    [{
      id: 0, role, den: { x: 1, y: 1 },
      palate: { form: 0, hueCenter: 0.5, hueWidth: 0.2, glowTaste: 0 },
    }] as unknown as CritterSpecies[];
  const mkC = (): Critter => ({
    species: 0, x: start.x, y: start.y, state: "seek", targetX: target.x, targetY: target.y,
    stateTime: 1000, hopPhase: 0, facing: 1, energy: 0.9, curiosity: 0, mood: "hungry",
  } as unknown as Critter);

  const fish = mkC();
  const land = mkC();
  const fishSp = mkSp("aquatic-grazer");
  const landSp = mkSp("disperser");
  const rng = makeRng(1);
  let fishMaxX = 1;
  let landMaxX = 1;
  for (let i = 0; i < 120; i++) {
    updateCritter(fish, 0.5, m, flora, fishSp, null, rng, {});
    updateCritter(land, 0.5, m, flora, landSp, null, rng, {});
    fishMaxX = Math.max(fishMaxX, Math.floor(fish.x / TILE_SIZE));
    landMaxX = Math.max(landMaxX, Math.floor(land.x / TILE_SIZE));
  }
  expect(fishMaxX).toBe(4); // swam the shallows to the far tile, stopped at the deep edge
  expect(landMaxX).toBeLessThan(2); // never left the shore tile into open water — land movement unchanged
});

test("a fish grazes a water-habitat plant it swims to", () => {
  const m = biomeSampler(3);
  const plants = generatePlantSpecies(3);
  const flora = new Flora(m, plants, 3, { chains: true });
  // a plant standing on a ShallowWater tile, a few tiles in from the left edge
  const water = flora.all.find(
    (p) =>
      tileAt(m, Math.floor(p.x / TILE_SIZE), Math.floor(p.y / TILE_SIZE)) === Tile.ShallowWater &&
      p.x > 6 * TILE_SIZE,
  );
  expect(water).toBeTruthy();
  const wp = water!;
  const sp = [{
    id: 0, role: "aquatic-grazer", den: { x: Math.floor(wp.x / TILE_SIZE), y: Math.floor(wp.y / TILE_SIZE) },
    palate: { form: wp.genome.form, hueCenter: wp.genome.hue, hueWidth: 0.4, glowTaste: wp.genome.glow * 2 - 1 },
  }] as unknown as CritterSpecies[];
  const c = {
    species: 0, x: wp.x - 3 * TILE_SIZE, y: wp.y, state: "idle", targetX: wp.x, targetY: wp.y,
    stateTime: 0, hopPhase: 0, facing: 1, energy: 0.2, curiosity: 0, mood: "hungry",
  } as unknown as Critter;
  const rng = makeRng(1);
  let ate = false;
  for (let i = 0; i < 200 && !ate; i++) {
    const before = c.energy;
    updateCritter(c, 0.5, m, flora, sp, null, rng, {});
    if (c.energy > before + 0.2) ate = true; // a whole MEAL_ENERGY landed
  }
  expect(ate).toBe(true); // reached a water plant across the shallows and grazed it
});
