import { expect, test } from "vitest";
import { TILE_SIZE } from "../src/world/config";
import { generate } from "../src/world/generate";
import { Tile, WorldMap } from "../src/world/types";
import { Flora, nearestPlant } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { PlantSpecies, generatePlantSpecies } from "../src/life/species";
import { pocketAt } from "../src/world/types";

const SEED = 42;

function islandFlora(): Flora {
  const map = generate(SEED);
  return new Flora(map, generatePlantSpecies(SEED), SEED);
}

function grassPatchMap(size = 12): WorldMap {
  const tiles = new Uint8Array(size * size).fill(Tile.Grass);
  return {
    width: size,
    height: size,
    seed: 0,
    tiles,
    elevation: new Float32Array(size * size),
    rivers: [],
    spawn: { x: 1, y: 1 },
  };
}

function grassSpecies(): PlantSpecies[] {
  return [
    {
      id: 0,
      name: "Testbloom",
      habitat: Tile.Grass,
      archetype: {
        form: PlantForm.Flower,
        hue: 0.3, hue2: 0.6, sat: 0.8, height: 0.4, spread: 0.5,
        petals: 5, leaves: 2, lean: 0, glow: 0.1,
      },
      density: 1,
      sport: false,
    },
  ];
}

test("scatter is deterministic and produces a living island within caps", () => {
  const a = islandFlora();
  const b = islandFlora();
  expect(a.count).toBe(b.count);
  expect(a.count).toBeGreaterThan(500);
  expect(a.count).toBeLessThanOrEqual(a.tuning.maxPlants);
  expect(JSON.stringify(a.all.slice(0, 50))).toBe(JSON.stringify(b.all.slice(0, 50)));
});

test("every plant sits on its species' habitat tile and tiles respect the cap", () => {
  const flora = islandFlora();
  const species = generatePlantSpecies(SEED);
  const map = generate(SEED);
  for (const [key, bucket] of flora.byTile) {
    expect(bucket.length).toBeLessThanOrEqual(flora.tuning.maxPerTile);
    for (const p of bucket) {
      expect(map.tiles[key]).toBe(species[p.species].habitat);
      // plant's world position really is inside its indexed tile
      const tx = Math.floor(p.x / TILE_SIZE);
      const ty = Math.floor(p.y / TILE_SIZE);
      expect(ty * map.width + tx).toBe(key);
    }
  }
});

test("simTick reproduces onto eligible tiles only and stays within caps", () => {
  const flora = new Flora(grassPatchMap(), grassSpecies(), 7, {
    maxPlants: 60,
    reproChance: 0.5,
    simBudget: 100,
  });
  const before = flora.count;
  expect(before).toBeGreaterThan(0);
  for (let i = 0; i < 50; i++) flora.simTick();
  expect(flora.count).toBeGreaterThan(before); // life spreads
  expect(flora.count).toBeLessThanOrEqual(60);
  for (const [, bucket] of flora.byTile) {
    expect(bucket.length).toBeLessThanOrEqual(flora.tuning.maxPerTile);
  }
});

test("simTick is deterministic for the same seed", () => {
  const a = new Flora(grassPatchMap(), grassSpecies(), 9, { reproChance: 0.3 });
  const b = new Flora(grassPatchMap(), grassSpecies(), 9, { reproChance: 0.3 });
  for (let i = 0; i < 30; i++) {
    a.simTick();
    b.simTick();
  }
  expect(a.count).toBe(b.count);
  expect(JSON.stringify(a.all)).toBe(JSON.stringify(b.all));
});

test("old plants die and genomes drift across generations", () => {
  const flora = new Flora(grassPatchMap(), grassSpecies(), 11, {
    lifespan: 5,
    matureAge: 1,
    reproChance: 0.4,
    simBudget: 200,
  });
  const founders = flora.count;
  for (let i = 0; i < 200; i++) flora.simTick();
  // every founder has died (born pre-tick-0, lifespan 5)
  const oldest = Math.min(...flora.all.map((p) => p.born));
  expect(oldest).toBeGreaterThan(0);
  expect(founders).toBeGreaterThan(0);
  // survivors' genomes have drifted away from the archetype
  const archetype = grassSpecies()[0].archetype;
  const anyDrifted = flora.all.some((p) => Math.abs(p.genome.hue - archetype.hue) > 0.01);
  expect(anyDrifted).toBe(true);
});

test("every species whose habitat exists gets at least a small colony", () => {
  for (const seed of [42, 777]) {
    const map = generate(seed);
    const species = generatePlantSpecies(seed);
    const flora = new Flora(map, species, seed);
    const habitatsPresent = new Set(map.tiles);
    const counts = new Map<number, number>();
    for (const p of flora.all) counts.set(p.species, (counts.get(p.species) ?? 0) + 1);
    for (const sp of species) {
      if (!habitatsPresent.has(sp.habitat)) continue;
      expect(counts.get(sp.id) ?? 0).toBeGreaterThan(0);
    }
  }
});

test("same-species neighbors cross-pollinate: children blend their parents", () => {
  const flora = new Flora(grassPatchMap(), grassSpecies(), 3, {
    reproChance: 1,
    simBudget: 50,
    mutationAmount: 0.02,
    maxPlants: 40,
  });
  for (const p of [...flora.all]) flora.removePlant(p);
  const g = grassSpecies()[0].archetype;
  flora.addPlant(0, { ...g, hue: 0.9 }, 40, 40, -100);
  flora.addPlant(0, { ...g, hue: 0.1 }, 44, 40, -100);
  for (let i = 0; i < 20; i++) flora.simTick();
  const kids = flora.all.filter((p) => p.born > 0);
  expect(kids.length).toBeGreaterThan(0);
  // crossed children sit near the circular midpoint (hue ~0), not near 0.5
  expect(kids.some((k) => Math.min(k.genome.hue, 1 - k.genome.hue) < 0.1)).toBe(true);
});

test("plants inside pockets are amplified - full saturation, strong glow", () => {
  let checked = 0;
  for (const seed of [1, 42, 777, 12345, 555]) {
    const map = generate(seed);
    if (!map.pockets || map.pockets.length === 0) continue;
    const flora = new Flora(map, generatePlantSpecies(seed), seed);
    for (const p of flora.all) {
      const tx = Math.floor(p.x / TILE_SIZE);
      const ty = Math.floor(p.y / TILE_SIZE);
      if (!pocketAt(map, tx, ty)) continue;
      expect(p.genome.sat).toBe(1);
      expect(p.genome.glow).toBeGreaterThanOrEqual(0.7);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(0); // some pocket flora actually exists
});

test("plantsNear returns exactly the plants within the radius", () => {
  const flora = new Flora(grassPatchMap(), grassSpecies(), 13);
  expect(flora.count).toBeGreaterThan(0);
  const p = flora.all[0];
  const near = flora.plantsNear(p.x, p.y, 1);
  expect(near).toContain(p);
  for (const q of flora.plantsNear(p.x, p.y, 40)) {
    expect((q.x - p.x) ** 2 + (q.y - p.y) ** 2).toBeLessThanOrEqual(40 * 40);
  }
});

test("nearestPlant picks the truly nearest, not tile-scan order", () => {
  const flora = new Flora(grassPatchMap(), grassSpecies(), 13);
  for (const p of [...flora.all]) flora.removePlant(p);
  const g = grassSpecies()[0].archetype;
  // the tile scan visits row 2 before row 5, so the far plant comes first
  const far = flora.addPlant(0, { ...g }, 2 * TILE_SIZE + 8, 2 * TILE_SIZE + 8, 0)!;
  const near = flora.addPlant(0, { ...g }, 5 * TILE_SIZE + 8, 5 * TILE_SIZE + 8, 0)!;
  const x = 5 * TILE_SIZE + 10;
  const y = 5 * TILE_SIZE + 10;
  const found = flora.plantsNear(x, y, 100);
  expect(found[0]).toBe(far); // scan order really would hand you the far one
  expect(nearestPlant(found, x, y)).toBe(near);
  expect(nearestPlant([], x, y)).toBeNull();
});
