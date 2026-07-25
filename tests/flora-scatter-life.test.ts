import { expect, test } from "vitest";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { PlantSpecies } from "../src/life/species";
import { Tile, WorldMap } from "../src/world/types";

function grassMap(size = 16): WorldMap {
  const n = size * size;
  return {
    width: size,
    height: size,
    seed: 1,
    tiles: new Uint8Array(n).fill(Tile.Grass),
    elevation: new Float32Array(n),
    rivers: [],
    spawn: { x: 1, y: 1 },
  };
}

function oneFlower(): PlantSpecies[] {
  return [
    {
      id: 0,
      name: "Testbloom",
      habitat: Tile.Grass,
      archetype: {
        form: PlantForm.Flower,
        hue: 0.3,
        hue2: 0.6,
        sat: 0.8,
        height: 0.4,
        spread: 0.5,
        petals: 5,
        leaves: 2,
        lean: 0,
        glow: 0.1,
      },
      density: 1,
      sport: false,
    },
  ];
}

test("scatterLife 0 skips the first morning", () => {
  const flora = new Flora(grassMap(), oneFlower(), 42, { scatterLife: 0, maxPlants: 500 });
  expect(flora.count).toBe(0);
});

test("scatterLife 100 is denser than scatterLife 20 when budget binds", () => {
  const map = grassMap(24);
  const sp = oneFlower();
  // Low maxPlants so scale = budget/estimate < 1 and life % changes the morning.
  const a = new Flora(map, sp, 99, { scatterLife: 20, maxPlants: 80 });
  const b = new Flora(map, sp, 99, { scatterLife: 100, maxPlants: 80 });
  expect(a.count).toBeGreaterThan(0);
  expect(b.count).toBeGreaterThan(a.count);
});

test("omitted scatterLife matches life 80 (comfortFraction default)", () => {
  const map = grassMap();
  const sp = oneFlower();
  const implied = new Flora(map, sp, 7, { maxPlants: 500 });
  const explicit = new Flora(map, sp, 7, { scatterLife: 80, maxPlants: 500 });
  expect(implied.count).toBe(explicit.count);
});
