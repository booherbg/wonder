import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { Critter, CritterSpecies, morphOf, updateCritter } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { TILE_SIZE } from "../src/world/config";
import { Tile, WALKABLE, WorldMap, isWalkable, tileAt } from "../src/world/types";

// Deep water walling the east and south of a shallow tile makes a concave
// corner. A critter whose den lies across that water walks straight at it and
// — with only axis-separated wall-sliding — creeps into the corner and pins:
// both the eastward and southward steps land in deep water, so it stops
// moving, and every homeward decision re-aims at the same unreachable den.
// The deer Blaine found "jammed in the corner of a shallow-water tile."
function inletMap(): WorldMap {
  const w = 20;
  const h = 20;
  const tiles = new Uint8Array(w * h).fill(Tile.Grass);
  const set = (x: number, y: number, t: Tile) => (tiles[y * w + x] = t);
  set(5, 5, Tile.ShallowWater); // the critter's shallow perch
  for (let y = 0; y <= 12; y++) set(6, y, Tile.DeepWater); // the wall to the east
  for (let x = 0; x <= 12; x++) set(x, 6, Tile.DeepWater); // the wall to the south
  return {
    width: w,
    height: h,
    seed: 1,
    tiles,
    elevation: new Float32Array(w * h),
    rivers: [],
    spawn: { x: 5, y: 5 },
  };
}

function deer(den: { x: number; y: number }): CritterSpecies {
  return {
    id: 0,
    name: "Test Deer",
    bodyHue: 0.5,
    earLen: 0.5,
    tailLen: 0.5,
    size: 1,
    morph: morphOf({ bodyHue: 0.5, earLen: 0.5, tailLen: 0.5, size: 1 }),
    palate: { form: PlantForm.Flower, hueCenter: 0.5, hueWidth: 0.1, glowTaste: 0 },
    favoriteSpecies: 0,
    role: "disperser",
    den,
  };
}

test("a critter does not stay jammed in a shallow-water corner (unreachable den)", () => {
  const map = inletMap();
  const plants = generatePlantSpecies(1);
  const flora = new Flora(map, plants, 1);
  const sp = deer({ x: 8, y: 8 }); // den across the deep water — no straight path
  const c: Critter = {
    species: 0,
    x: 5.5 * TILE_SIZE,
    y: 5.5 * TILE_SIZE,
    state: "idle",
    targetX: 5.5 * TILE_SIZE,
    targetY: 5.5 * TILE_SIZE,
    stateTime: 0,
    hopPhase: 0,
    facing: 1,
    energy: 0.5,
    curiosity: 0,
    mood: "content",
  };
  const rng = makeRng(7);
  const tiles = new Set<string>();
  for (let i = 0; i < 600; i++) {
    updateCritter(c, 1 / 30, map, flora, [sp], null, rng, { darkness: 1 });
    tiles.add(`${Math.floor(c.x / TILE_SIZE)},${Math.floor(c.y / TILE_SIZE)}`);
  }
  // it can't reach the den, but it must not freeze in the corner: a critter
  // that keeps trying the same blocked step visits exactly one tile forever.
  expect(tiles.size).toBeGreaterThan(1);
  // and it never ends up standing in the deep water it can't walk on
  expect(isWalkable(map, Math.floor(c.x / TILE_SIZE), Math.floor(c.y / TILE_SIZE))).toBe(true);
});

// The other half of the rule: a land critter may wade the shore but never
// strikes out into open-sea shallows — even when lured by a den planted there.
// (The wanderer still wades freely; this is a critter-only restraint.)
function seaMap(): WorldMap {
  const w = 20;
  const h = 20;
  const tiles = new Uint8Array(w * h).fill(Tile.Grass);
  for (let y = 0; y < h; y++) for (let x = 10; x < w; x++) tiles[y * w + x] = Tile.ShallowWater; // open sea east
  return {
    width: w,
    height: h,
    seed: 1,
    tiles,
    elevation: new Float32Array(w * h),
    rivers: [],
    spawn: { x: 8, y: 8 },
  };
}

test("a land critter never wades out into open-sea shallows", () => {
  const map = seaMap();
  const plants = generatePlantSpecies(1);
  const flora = new Flora(map, plants, 1);
  const sp = deer({ x: 15, y: 8 }); // a den out in the shallows — a lure it must refuse
  const c: Critter = {
    species: 0,
    x: 8.5 * TILE_SIZE,
    y: 8.5 * TILE_SIZE,
    state: "idle",
    targetX: 8.5 * TILE_SIZE,
    targetY: 8.5 * TILE_SIZE,
    stateTime: 0,
    hopPhase: 0,
    facing: 1,
    energy: 0.5,
    curiosity: 0,
    mood: "content",
  };
  const rng = makeRng(3);
  const isOpenSea = (tx: number, ty: number): boolean => {
    if (tileAt(map, tx, ty) !== Tile.ShallowWater) return false;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
      const t = tileAt(map, tx + dx, ty + dy);
      if (t !== Tile.ShallowWater && t !== Tile.DeepWater && WALKABLE.has(t)) return false; // a shore edge
    }
    return true;
  };
  for (let i = 0; i < 800; i++) {
    updateCritter(c, 1 / 30, map, flora, [sp], null, rng, { darkness: 1 });
    const tx = Math.floor(c.x / TILE_SIZE);
    const ty = Math.floor(c.y / TILE_SIZE);
    expect(isOpenSea(tx, ty)).toBe(false); // it may wade the shore, but never the open sea
  }
});

// A cliff wall with a single gap stands between a critter and its den. Greedy
// wall-sliding would grind at the rock forever; the critter must route AROUND —
// up to the gap, through, and down the far side — to get home. (Cliff, not Rock:
// bare Rock is walkable now, so it's the sheer Cliff faces that still wall off.)
test("a critter routes around a cliff wall to reach its den", () => {
  const w = 20;
  const h = 20;
  const tiles = new Uint8Array(w * h).fill(Tile.Grass);
  for (let y = 0; y < h; y++) if (y !== 3) tiles[y * w + 10] = Tile.Cliff; // wall at x=10, one gap at y=3
  const map: WorldMap = {
    width: w,
    height: h,
    seed: 1,
    tiles,
    elevation: new Float32Array(w * h),
    rivers: [],
    spawn: { x: 5, y: 10 },
  };
  const plants = generatePlantSpecies(1);
  const flora = new Flora(map, plants, 1);
  const sp = deer({ x: 15, y: 10 }); // den on the far side of the wall
  const c: Critter = {
    species: 0,
    x: 5.5 * TILE_SIZE,
    y: 10.5 * TILE_SIZE,
    state: "idle",
    targetX: 5.5 * TILE_SIZE,
    targetY: 10.5 * TILE_SIZE,
    stateTime: 0,
    hopPhase: 0,
    facing: 1,
    energy: 0.05, // spent, so comfort pulls it home
    curiosity: 0,
    mood: "content",
  };
  const rng = makeRng(5);
  let closest = Infinity;
  for (let i = 0; i < 5000; i++) {
    updateCritter(c, 1 / 30, map, flora, [sp], null, rng, { darkness: 1 });
    const tx = Math.floor(c.x / TILE_SIZE);
    const ty = Math.floor(c.y / TILE_SIZE);
    expect(tileAt(map, tx, ty)).not.toBe(Tile.Cliff); // never grinds into the cliff
    closest = Math.min(closest, Math.hypot(c.x / TILE_SIZE - 15.5, c.y / TILE_SIZE - 10.5));
  }
  expect(closest).toBeLessThan(2.5); // it wound its way home — impossible without routing around
});
