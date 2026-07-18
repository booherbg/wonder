import { expect, test } from "vitest";
import { Flora } from "../src/life/flora";
import { generateCraterEndemics, generatePlantSpecies } from "../src/life/species";
import { TILE_SIZE } from "../src/world/config";
import { generate } from "../src/world/generate";
import { Tile } from "../src/world/types";

test("crater islands hold two endemics: iris and shore, glowing and marked", () => {
  for (const seed of [20, 29]) {
    const map = generate(seed);
    const base = generatePlantSpecies(seed);
    const endemics = generateCraterEndemics(seed, map.crater!, base.length);
    expect(endemics.length).toBe(2);
    expect(endemics[0].habitat).toBe(Tile.ShallowWater);
    expect(endemics[1].habitat).toBe(Tile.Sand);
    for (const e of endemics) {
      expect(e.name.endsWith("⟡")).toBe(true);
      expect(e.homeland).toBeDefined();
      expect(e.archetype.glow).toBeGreaterThanOrEqual(0.75);
      expect(e.archetype.sat).toBe(1);
      expect(e.id).toBeGreaterThanOrEqual(base.length);
    }
    // deterministic: same seed, same endemics
    expect(JSON.stringify(endemics)).toBe(
      JSON.stringify(generateCraterEndemics(seed, map.crater!, base.length)),
    );
  }
});

test("endemic plants scatter only inside the homeland", () => {
  const seed = 20;
  const map = generate(seed);
  const species = generatePlantSpecies(seed);
  species.push(...generateCraterEndemics(seed, map.crater!, species.length));
  const flora = new Flora(map, species, seed);
  const endemicIds = new Set(species.filter((s) => s.homeland).map((s) => s.id));
  let found = 0;
  for (const p of flora.all) {
    if (!endemicIds.has(p.species)) continue;
    found++;
    const sp = species[p.species];
    const tx = Math.floor(p.x / TILE_SIZE);
    const ty = Math.floor(p.y / TILE_SIZE);
    expect(Math.hypot(tx - sp.homeland!.x, ty - sp.homeland!.y)).toBeLessThanOrEqual(
      sp.homeland!.radius,
    );
  }
  expect(found).toBeGreaterThan(0); // the homeland is truly colonized
});

test("a carried seed grows far from home - the pouch beats the rim", () => {
  const seed = 20;
  const map = generate(seed);
  const species = generatePlantSpecies(seed);
  species.push(...generateCraterEndemics(seed, map.crater!, species.length));
  const flora = new Flora(map, species, seed);
  const shoreEndemic = species.find((s) => s.homeland && s.habitat === Tile.Sand)!;
  flora.removePlant(flora.all[0]); // the island is full at scatter; one spot opens
  // try far sand tiles — beaches at the island's edge — until one has room
  let planted = false;
  let tried = 0;
  for (let i = 0; i < map.tiles.length && !planted && tried < 50; i++) {
    if (map.tiles[i] !== Tile.Sand) continue;
    const tx = i % map.width;
    const ty = (i / map.width) | 0;
    if (Math.hypot(tx - map.crater!.x, ty - map.crater!.y) <= 60) continue;
    tried++;
    const fx = tx * TILE_SIZE + 8;
    const fy = ty * TILE_SIZE + 8;
    planted = flora.addPlant(shoreEndemic.id, { ...shoreEndemic.archetype }, fx, fy, 0) !== null;
  }
  expect(tried).toBeGreaterThan(0);
  expect(planted).toBe(true);
});

test("ordinary islands keep no homelands", () => {
  for (const sp of generatePlantSpecies(42)) {
    expect(sp.homeland).toBeUndefined();
  }
});
