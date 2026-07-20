import { expect, test } from "vitest";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { PlantSpecies } from "../src/life/species";
import { TILE_SIZE } from "../src/world/config";
import { Tile, WorldMap } from "../src/world/types";

// An island split down the middle: meadow to the west, beach to the east.
// A grass flower belongs only on the meadow — so the beach is off-habitat,
// exactly the ground the wanderer wants to amend with soil.
function splitMap(size = 12): WorldMap {
  const tiles = new Uint8Array(size * size);
  for (let ty = 0; ty < size; ty++) {
    for (let tx = 0; tx < size; tx++) {
      tiles[ty * size + tx] = tx < size / 2 ? Tile.Grass : Tile.Sand;
    }
  }
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
      name: "Meadowbloom",
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

// world px at the middle of a tile
const cx = (tx: number) => tx * TILE_SIZE + 8;
const cy = (ty: number) => ty * TILE_SIZE + 8;

function emptyFlora(): Flora {
  const flora = new Flora(splitMap(), grassSpecies(), 1, { maxPerTile: 4 });
  for (const p of [...flora.all]) flora.removePlant(p);
  return flora;
}

test("soil is laid tile by tile and remembered", () => {
  const flora = emptyFlora();
  expect(flora.hasSoilTile(9, 6)).toBe(false);
  expect(flora.laySoil(9, 6)).toBe(true);
  expect(flora.hasSoilTile(9, 6)).toBe(true);
  // out of bounds is a quiet no
  expect(flora.laySoil(-1, 0)).toBe(false);
  expect(flora.laySoil(999, 0)).toBe(false);
});

test("the player may sow on its own habitat, or on any tile amended with soil", () => {
  const flora = emptyFlora();
  const g = grassSpecies()[0].archetype;
  // on the meadow, the grass flower roots as ever
  expect(flora.sowableAt(0, cx(2), cy(2))).toBe(true);
  // on the bare beach it will not — the sea's habitat is not the meadow's
  expect(flora.sowableAt(0, cx(9), cy(6))).toBe(false);
  // amend that beach tile with a clod, and now it takes the meadow flower
  flora.laySoil(9, 6);
  expect(flora.sowableAt(0, cx(9), cy(6))).toBe(true);
  const planted = flora.sowByPlayer(0, { ...g }, cx(9), cy(6), 0);
  expect(planted).not.toBeNull();
  expect(planted!.species).toBe(0);
  // an un-amended beach tile still refuses the player's sow
  expect(flora.sowByPlayer(0, { ...g }, cx(10), cy(6), 0)).toBeNull();
});

test("the wild sim never takes the soil bypass — only rootableAt gates it", () => {
  const flora = emptyFlora();
  flora.laySoil(9, 6);
  // sowByPlayer accepts the amended beach tile...
  expect(flora.sowableAt(0, cx(9), cy(6))).toBe(true);
  // ...but rootableAt — the gate the whole sim runs through — still says no,
  // so drift, propagate, reseeding and scatter can never jump off-habitat
  expect(flora.rootableAt(0, cx(9), cy(6))).toBe(false);
});

test("a soil-sown off-habitat patch cannot spread into the wild", () => {
  const flora = emptyFlora();
  const g = grassSpecies()[0].archetype;
  // a lone meadow flower on an amended beach tile, ringed by more beach
  flora.laySoil(9, 6);
  const p = flora.sowByPlayer(0, { ...g }, cx(9), cy(6), 0)!;
  // hammer propagation: every attempt reseeds within reach, all onto sand,
  // and addPlant refuses each — the player's one plant stands, alone
  for (let i = 0; i < 200; i++) flora.propagate(p);
  const grass = flora.all.filter((q) => q.species === 0);
  expect(grass).toHaveLength(1);
  expect(grass[0]).toBe(p);
});

test("simTick reseeds by habitat even beside amended ground", () => {
  const flora = emptyFlora();
  const g = grassSpecies()[0].archetype;
  flora.laySoil(9, 6);
  flora.sowByPlayer(0, { ...g }, cx(9), cy(6), -100); // mature at once
  // an eager island: were the sim to honor soil, the beach would fill with
  // meadow flowers. It does not — the count on sand never climbs past the one.
  const heavy = new Flora(splitMap(), grassSpecies(), 3, {
    reproChance: 1, matureAge: 1, simBudget: 200, maxPerTile: 4,
  });
  for (const q of [...heavy.all]) heavy.removePlant(q);
  heavy.laySoil(9, 6);
  heavy.sowByPlayer(0, { ...g }, cx(9), cy(6), -100);
  for (let i = 0; i < 80; i++) heavy.simTick();
  const onSand = heavy.all.filter((q) => Math.floor(q.x / TILE_SIZE) >= 6);
  expect(onSand.length).toBeLessThanOrEqual(1); // only the player's own
});

test("the per-tile cap still holds on amended ground", () => {
  const flora = emptyFlora();
  const g = grassSpecies()[0].archetype;
  flora.laySoil(9, 6);
  for (let i = 0; i < flora.tuning.maxPerTile; i++) {
    expect(flora.sowByPlayer(0, { ...g }, cx(9), cy(6), 0)).not.toBeNull();
  }
  // the fifth clod-sown seed finds the tile full, soil or no soil
  expect(flora.sowableAt(0, cx(9), cy(6))).toBe(false);
  expect(flora.sowByPlayer(0, { ...g }, cx(9), cy(6), 0)).toBeNull();
});

test("a garden plant fills its tilled plot — but never the wild around it", () => {
  // a wider split island: meadow west (tx<8), bare beach east. Till a 3×3 plot
  // deep in the beach — well beyond the reseed reach of the flower's true
  // habitat — so ONLY garden-spread can move it, never ordinary reproduction.
  const flora = new Flora(splitMap(16), grassSpecies(), 3, {
    reproChance: 1, matureAge: 1, mutationAmount: 0, simBudget: 200, maxPerTile: 4,
  });
  for (const q of [...flora.all]) flora.removePlant(q);
  const plot: [number, number][] = [];
  for (let ty = 6; ty <= 8; ty++) {
    for (let tx = 11; tx <= 13; tx++) {
      flora.laySoil(tx, ty);
      plot.push([tx, ty]);
    }
  }
  const g = grassSpecies()[0].archetype;
  flora.sowByPlayer(0, { ...g }, cx(12), cy(7), -100); // centre, mature at once
  for (let i = 0; i < 200; i++) flora.simTick();

  // every tilled tile of the plot now carries the flower — the plot filled in
  for (const [tx, ty] of plot) {
    const here = flora.all.filter(
      (q) => Math.floor(q.x / TILE_SIZE) === tx && Math.floor(q.y / TILE_SIZE) === ty,
    );
    expect(here.length, `plot tile ${tx},${ty}`).toBeGreaterThanOrEqual(1);
  }
  // ...but not one flower stands anywhere outside the tilled plot — the wild is
  // never colonised (off-habitat sand refuses it; the meadow is out of reach)
  const strays = flora.all.filter((q) => {
    const tx = Math.floor(q.x / TILE_SIZE);
    const ty = Math.floor(q.y / TILE_SIZE);
    return !(tx >= 11 && tx <= 13 && ty >= 6 && ty <= 8);
  });
  expect(strays).toHaveLength(0);
});

test("laid soil tiles round-trip through a restored flora", () => {
  const flora = emptyFlora();
  flora.laySoil(9, 6);
  flora.laySoil(3, 3);
  const keys = flora.soilTileKeys();
  const restored = new Flora(splitMap(), grassSpecies(), 1, {}, {
    tick: 0,
    plants: [],
    soil: keys,
  });
  expect(restored.hasSoilTile(9, 6)).toBe(true);
  expect(restored.hasSoilTile(3, 3)).toBe(true);
  expect(restored.hasSoilTile(5, 5)).toBe(false);
});
