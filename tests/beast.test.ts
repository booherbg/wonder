import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { beastSegments, chooseBeastTarget, generateBeast, updateBeast } from "../src/life/beast";
import { Palate } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { Genome, PlantForm } from "../src/life/genome";
import { PlantSpecies, generatePlantSpecies } from "../src/life/species";
import { TILE_SIZE } from "../src/world/config";
import { generate } from "../src/world/generate";
import { Tile, WorldMap, isWalkable } from "../src/world/types";

test("beast generation is deterministic and spawns on walkable ground", () => {
  for (const seed of [1, 42, 777, 12345, 555]) {
    const map = generate(seed);
    const plants = generatePlantSpecies(seed);
    const a = generateBeast(seed, map, plants);
    const b = generateBeast(seed, map, plants);
    expect(a).toEqual(b);
    if (a) {
      expect(isWalkable(map, Math.floor(a.x / TILE_SIZE), Math.floor(a.y / TILE_SIZE))).toBe(true);
      expect(a.name.length).toBeGreaterThan(6);
      expect(a.segments).toBeGreaterThanOrEqual(5);
    }
  }
});

// generates 20 whole islands — needs more than the default 5s under load
test("some islands have a beast and some do not", () => {
  const withBeast: number[] = [];
  const without: number[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const map = generate(seed);
    (generateBeast(seed, map, generatePlantSpecies(seed)) ? withBeast : without).push(seed);
  }
  expect(withBeast.length).toBeGreaterThan(5);
  expect(without.length).toBeGreaterThan(0);
}, 20_000);

// A plain walkable field, one flower kind, and a genome cut exactly to the
// beast's taste — the same controlled little world beast-carry uses.
function grassField(w: number, h: number): WorldMap {
  return {
    width: w,
    height: h,
    seed: 0,
    tiles: new Uint8Array(w * h).fill(Tile.Grass),
    elevation: new Float32Array(w * h).fill(0.5),
    rivers: [],
    spawn: { x: w >> 1, y: h >> 1 },
  };
}

const testbloom: PlantSpecies = {
  id: 0,
  name: "Testbloom",
  habitat: Tile.Grass,
  archetype: { form: PlantForm.Flower, hue: 0.3, hue2: 0.5, sat: 0.8, height: 0.4, spread: 0.5, petals: 5, leaves: 2, lean: 0, glow: 0.2 },
  density: 0.5,
  sport: false,
};

function toTaste(p: Palate): Genome {
  return { form: p.form, hue: p.hueCenter, hue2: 0.5, sat: 0.8, height: 0.4, spread: 0.5, petals: 5, leaves: 2, lean: 0, glow: (p.glowTaste + 1) / 2 };
}

test("the beast forages with intent: most targets sit by the stand it favors, the rest roam free", () => {
  const map = grassField(48, 48);
  const beast = generateBeast(1, map, [testbloom])!;
  beast.x = (8 + 0.5) * TILE_SIZE;
  beast.y = (24 + 0.5) * TILE_SIZE;
  // one favored stand, far across the field from where the beast is stood
  const flora = new Flora(map, [testbloom], 1, {}, { tick: 0, plants: [] });
  for (let dx = 0; dx < 3; dx++) {
    for (let dy = 0; dy < 3; dy++) {
      flora.addPlant(0, toTaste(beast.palate), (38 + dx + 0.5) * TILE_SIZE, (22 + dy + 0.5) * TILE_SIZE, 0);
    }
  }
  const rng = makeRng(7);
  const N = 400;
  let nearStand = 0;
  for (let i = 0; i < N; i++) {
    const t = chooseBeastTarget(beast, map, flora, rng);
    expect(t).not.toBeNull();
    expect(isWalkable(map, t!.x, t!.y)).toBe(true); // the invariant targeting must keep
    if (Math.hypot(t!.x - 39, t!.y - 23) <= 3) nearStand++;
  }
  expect(nearStand).toBeGreaterThan(N * 0.5); // it goes where its favorites grow...
  expect(nearStand).toBeLessThan(N * 0.95); // ...yet still wanders the whole island
});

test("with nothing it favors in reach, targeting falls back to a plain walkable wander", () => {
  const map = grassField(32, 32);
  const beast = generateBeast(1, map, [testbloom])!;
  const flora = new Flora(map, [testbloom], 1, {}, { tick: 0, plants: [] }); // an empty field
  const rng = makeRng(11);
  for (let i = 0; i < 50; i++) {
    const t = chooseBeastTarget(beast, map, flora, rng);
    expect(t).not.toBeNull();
    expect(isWalkable(map, t!.x, t!.y)).toBe(true);
  }
});

test("the beast stays on walkable ground across minutes of travel", () => {
  const map = generate(42);
  const plants = generatePlantSpecies(42);
  const flora = new Flora(map, plants, 42);
  const beast = generateBeast(42, map, plants);
  expect(beast).not.toBeNull();
  const rng = makeRng(5);
  const dt = 1 / 30;
  for (let step = 0; step < 30 * 240; step++) {
    updateBeast(beast!, dt, map, flora, null, rng);
    const tx = Math.floor(beast!.x / TILE_SIZE);
    const ty = Math.floor(beast!.y / TILE_SIZE);
    expect(isWalkable(map, tx, ty)).toBe(true);
  }
  // it has actually gone somewhere and its body trails behind
  expect(beast!.history.length).toBeGreaterThan(4);
  const segs = beastSegments(beast!);
  expect(segs).toHaveLength(beast!.segments);
  expect(segs[0].r).toBeGreaterThan(segs[segs.length - 1].r);
  // the pressed-grass trail exists and never outlives its fade window
  expect(beast!.trail.length).toBeGreaterThan(0);
  expect(beast!.trail.length).toBeLessThanOrEqual(220);
  for (const tp of beast!.trail) {
    expect(beast!.ageSec - tp.age).toBeLessThanOrEqual(60.1);
  }
});
