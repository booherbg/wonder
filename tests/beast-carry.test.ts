import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { CARGO_CAP, generateBeast, updateBeast } from "../src/life/beast";
import { APPETITE_MIN, Palate, appetite } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { Genome, PlantForm, driftDistance } from "../src/life/genome";
import { PlantSpecies } from "../src/life/species";
import { TILE_SIZE } from "../src/world/config";
import { Tile, WorldMap } from "../src/world/types";

// A plain field of walkable grass — a controlled island so a drop always finds
// correct habitat and the only source of a favored kind is the one we plant.
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

function grassFlower(id: number): PlantSpecies {
  return {
    id,
    name: `Testbloom ${id}`,
    habitat: Tile.Grass,
    archetype: { form: PlantForm.Flower, hue: 0.3, hue2: 0.5, sat: 0.8, height: 0.4, spread: 0.5, petals: 5, leaves: 2, lean: 0, glow: 0.2 },
    density: 0.5,
    sport: false,
  };
}

// A genome sitting exactly in the beast's taste — appetite 1.0, so the beast is
// sure to favor it.
function toTaste(p: Palate): Genome {
  return { form: p.form, hue: p.hueCenter, hue2: 0.5, sat: 0.8, height: 0.4, spread: 0.5, petals: 5, leaves: 2, lean: 0, glow: (p.glowTaste + 1) / 2 };
}

// Deterministic: the has-a-beast roll depends only on the seed, so the same
// seed always yields the same beast on our field. Seed 1 has one.
const BEAST_SEED = 1;
const CX = 8; // the source cluster's tile
const CY = 8;
const clusterX = (CX + 0.5) * TILE_SIZE;
const clusterY = (CY + 0.5) * TILE_SIZE;

// One coherent little world: an empty island (no scatter/backfill), a beast
// stood in the cluster, and a hand-sown cluster of one-or-more favored kinds at
// (CX, CY) — the single source we can watch a lineage travel from. Everything
// shares the one map, so walkability and habitat always agree.
function world(species: PlantSpecies[]) {
  const map = grassField(48, 48);
  const beast = generateBeast(BEAST_SEED, map, species)!;
  beast.x = clusterX;
  beast.y = clusterY;
  beast.distance = 0;
  const flora = new Flora(map, species, 1, {}, { tick: 0, plants: [] });
  const source: { x: number; y: number }[] = [];
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]] as const) {
    const x = (CX + dx + 0.5) * TILE_SIZE;
    const y = (CY + dy + 0.5) * TILE_SIZE;
    for (const sp of species) flora.addPlant(sp.id, toTaste(beast.palate), x, y, 0);
    source.push({ x, y });
  }
  return { map, beast, flora, source };
}

test("the beast carries a favored seed clear across the island and sows a drifted child far from the source", () => {
  const { map, beast, flora } = world([grassFlower(0)]);
  // the beast rolled a real taste and empty cargo, ready to carry
  expect(beast.cargo).toHaveLength(0);
  expect(appetite(beast.palate, toTaste(beast.palate))).toBeGreaterThan(APPETITE_MIN);

  const sourceRefs = flora.all.slice(); // every original individual, by reference
  const startCount = flora.count;

  const rng = makeRng(1);
  const dt = 1 / 30;
  let pickedUpSpecies = -1;
  let carriedBeforeDrop: Genome | null = null;
  let drop: ReturnType<typeof updateBeast> = null;

  for (let step = 0; step < 4000; step++) {
    // what sits in the coat right now, before this step may set it down
    const carried = beast.cargo.length > 0 ? { ...beast.cargo[0].genome } : null;
    const before = flora.count;
    const d = updateBeast(beast, dt, map, flora, null, rng);
    // it never eats: the flora only ever grows under the beast
    expect(flora.count).toBeGreaterThanOrEqual(before);
    if (pickedUpSpecies < 0 && beast.cargo.length > 0) pickedUpSpecies = beast.cargo[0].species;
    if (d) {
      drop = d;
      carriedBeforeDrop = carried;
      break;
    }
  }

  // it picked a burr of the favored kind up off the source cluster...
  expect(pickedUpSpecies).toBe(0);
  // ...left every source plant standing, unharmed...
  for (const p of sourceRefs) expect(flora.all.includes(p)).toBe(true);
  expect(flora.count).toBeGreaterThanOrEqual(startCount);

  // ...and, having carried it a long way, set a drifted child down far off
  expect(drop).not.toBeNull();
  expect(drop!.species).toBe(0);
  const tx = Math.floor(drop!.x / TILE_SIZE);
  const ty = Math.floor(drop!.y / TILE_SIZE);
  expect(map.tiles[ty * map.width + tx]).toBe(Tile.Grass); // on its own habitat
  const distTiles = Math.hypot(drop!.x - clusterX, drop!.y - clusterY) / TILE_SIZE;
  // far beyond anything local reseeding (reseedRadius) could ever reach — this
  // seed was carried, not spread
  expect(distTiles).toBeGreaterThan(flora.tuning.reseedRadius * 2);

  // the dropped seed is a drifted child of what was carried: changed, but kin
  expect(carriedBeforeDrop).not.toBeNull();
  const drift = driftDistance(drop!.genome, carriedBeforeDrop!);
  expect(drift).toBeGreaterThan(0); // neutral drift was applied
  expect(drift).toBeLessThan(0.25); // a child, not a stranger
});

test("the beast's cargo never exceeds its bound and it only ever adds plants", () => {
  // two favored kinds sharing the cluster: the beast can carry one of each, so
  // the bound is genuinely exercised (not vacuously one)
  const { map, beast, flora } = world([grassFlower(0), grassFlower(1)]);
  const sourceRefs = flora.all.slice();

  const rng = makeRng(1);
  const dt = 1 / 30;
  let maxCargo = 0;
  const delivered = new Set<number>();
  for (let step = 0; step < 30000; step++) {
    const before = flora.count;
    const drop = updateBeast(beast, dt, map, flora, null, rng);
    maxCargo = Math.max(maxCargo, beast.cargo.length);
    expect(beast.cargo.length).toBeLessThanOrEqual(CARGO_CAP); // never over the bound
    expect(flora.count).toBeGreaterThanOrEqual(before); // never removes a plant
    if (drop) delivered.add(drop.species);
  }

  expect(maxCargo).toBe(CARGO_CAP); // the bound was genuinely reached
  expect(delivered).toEqual(new Set([0, 1])); // both lineages travelled
  // finite space is the only ceiling: no tile ever holds more than the cap
  for (const [, bucket] of flora.byTile) {
    expect(bucket.length).toBeLessThanOrEqual(flora.tuning.maxPerTile);
  }
  // the whole source cluster is still standing after all that traffic
  for (const p of sourceRefs) expect(flora.all.includes(p)).toBe(true);
});

test("carrying is deterministic across two identical runs", () => {
  function run() {
    const { map, beast, flora } = world([grassFlower(0)]);
    const rng = makeRng(3);
    const dt = 1 / 30;
    for (let step = 0; step < 5000; step++) updateBeast(beast, dt, map, flora, null, rng);
    return {
      cargo: beast.cargo,
      x: beast.x,
      y: beast.y,
      distance: beast.distance,
      history: beast.history,
      plants: flora.all.map((p) => ({ species: p.species, x: p.x, y: p.y, genome: p.genome })),
    };
  }

  expect(run()).toEqual(run());
});
