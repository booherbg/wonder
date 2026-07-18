import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { Flora } from "../src/life/flora";
import { Genome, PlantForm, driftDistance } from "../src/life/genome";
import { PlantSpecies, speciateFrom } from "../src/life/species";
import { emptyInventory } from "../src/game/inventory";
import { MURMURS } from "../src/game/murmurs";
import { SavedWorld, packWorld, restoreDaughters, restorePlants } from "../src/game/save";
import { TILE_SIZE } from "../src/world/config";
import { Tile, WorldMap } from "../src/world/types";

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

const ARCHETYPE: Genome = {
  form: PlantForm.Flower,
  hue: 0.3, hue2: 0.6, sat: 0.8, height: 0.4, spread: 0.5,
  petals: 5, leaves: 2, lean: 0, glow: 0.1,
};

function grassSpecies(): PlantSpecies[] {
  return [
    {
      id: 0,
      name: "Testbloom",
      habitat: Tile.Grass,
      archetype: { ...ARCHETYPE },
      density: 1,
      sport: false,
    },
  ];
}

// far from the archetype (hue swung, taller, glowing) — past splitDistance
const DRIFTED: Genome = { ...ARCHETYPE, hue: 0.75, height: 0.75, glow: 0.6 };

function driftedFlora(tuning: Record<string, number> = {}): Flora {
  const flora = new Flora(grassPatchMap(), grassSpecies(), 21, {
    matureAge: 1,
    reproChance: 1,
    simBudget: 200,
    mutationAmount: 0.01,
    splitCooldownTicks: 0,
    splitClusterMin: 5,
    ...tuning,
  });
  for (const p of [...flora.all]) flora.removePlant(p);
  for (let i = 0; i < 8; i++) {
    const tx = 5 + (i % 3);
    const ty = 5 + Math.floor(i / 3);
    flora.addPlant(0, { ...DRIFTED }, tx * TILE_SIZE + 8, ty * TILE_SIZE + 8, -100);
  }
  return flora;
}

test("speciateFrom keeps the family epithet, marks the daughter, records lineage", () => {
  const parent: PlantSpecies = { ...grassSpecies()[0], name: "Luma Bell" };
  const sp = speciateFrom(parent, 7, { ...ARCHETYPE, glow: 0.9 }, makeRng(3), 120);
  expect(sp.name).toMatch(/^[A-Z][a-z]+ Glowbell ✧$/);
  expect(sp.parent).toBe(0);
  expect(sp.id).toBe(7);
  expect(sp.bornTick).toBe(120);
  expect(sp.habitat).toBe(parent.habitat);
  expect(sp.archetype.glow).toBe(0.9);
});

test("speciateFrom strips the old trait prefix before earning a new one", () => {
  const parent: PlantSpecies = { ...grassSpecies()[0], name: "Vel Tallwood ✶" };
  const sp = speciateFrom(parent, 1, { ...ARCHETYPE, petals: 9 }, makeRng(5), 0);
  expect(sp.name.endsWith("Manywood ✧")).toBe(true);
});

test("a drifted cluster splits into a named daughter species", () => {
  const species = grassSpecies();
  const flora = new Flora(grassPatchMap(), species, 21, {
    matureAge: 1,
    reproChance: 1,
    simBudget: 200,
    mutationAmount: 0.01,
    splitCooldownTicks: 0,
    splitClusterMin: 5,
  });
  for (const p of [...flora.all]) flora.removePlant(p);
  for (let i = 0; i < 8; i++) {
    const tx = 5 + (i % 3);
    const ty = 5 + Math.floor(i / 3);
    flora.addPlant(0, { ...DRIFTED }, tx * TILE_SIZE + 8, ty * TILE_SIZE + 8, -100);
  }
  let events: ReturnType<Flora["takeEvents"]> = [];
  for (let i = 0; i < 40 && events.length === 0; i++) {
    flora.simTick();
    events = flora.takeEvents();
  }
  expect(events.length).toBeGreaterThan(0);
  expect(events[0].parentName).toBe("Testbloom");
  expect(events[0].name).toContain("✧");
  expect(species.length).toBeGreaterThanOrEqual(2);
  const daughter = species[1];
  expect(daughter.parent).toBe(0);
  expect(driftDistance(daughter.archetype, ARCHETYPE)).toBeGreaterThanOrEqual(
    flora.tuning.splitDistance,
  );
  // the cluster crossed over together and the counts followed
  const members = flora.all.filter((p) => p.species === 1).length;
  expect(members).toBeGreaterThanOrEqual(5);
  expect(flora.speciesCounts.get(1)).toBe(members);
});

test("no split when the island's daughter budget is spent", () => {
  const flora = driftedFlora({ maxDaughterSpecies: 0 });
  for (let i = 0; i < 40; i++) flora.simTick();
  expect(flora.takeEvents()).toEqual([]);
});

test("speciation is deterministic for the same seed", () => {
  const a = driftedFlora();
  const b = driftedFlora();
  for (let i = 0; i < 40; i++) {
    a.simTick();
    b.simTick();
  }
  expect(JSON.stringify(a.takeEvents())).toBe(JSON.stringify(b.takeEvents()));
  expect(JSON.stringify(a.all)).toBe(JSON.stringify(b.all));
});

test("daughter species survive the save/restore roundtrip", () => {
  const species = grassSpecies();
  const daughter = speciateFrom(species[0], 1, { ...DRIFTED }, makeRng(9), 77);
  species.push(daughter);
  const flora = new Flora(grassPatchMap(), species, 21);
  for (const p of [...flora.all]) flora.removePlant(p);
  flora.addPlant(1, { ...DRIFTED }, 5 * TILE_SIZE + 8, 5 * TILE_SIZE + 8, 10);
  const packed = packWorld(
    21, 50, { x: 0, y: 0 }, null, emptyInventory(), flora.all, 1234, species.slice(1),
  );
  const saved = JSON.parse(JSON.stringify(packed)) as SavedWorld;

  const fresh = grassSpecies();
  restoreDaughters(saved, fresh);
  expect(fresh.length).toBe(2);
  expect(fresh[1].name).toBe(daughter.name);
  expect(fresh[1].parent).toBe(0);
  expect(fresh[1].bornTick).toBe(77);
  expect(fresh[1].archetype.form).toBe(PlantForm.Flower);
  expect(fresh[1].archetype.hue).toBeCloseTo(DRIFTED.hue, 3);
  const plants = restorePlants(saved, fresh);
  expect(plants.length).toBe(1);
  expect(plants[0].species).toBe(1);
  expect(plants[0].genome.glow).toBeCloseTo(DRIFTED.glow, 3);
});

test("witnessing a split has murmurs waiting", () => {
  expect(MURMURS.filter((m) => m.tag === "speciation").length).toBeGreaterThanOrEqual(2);
});
