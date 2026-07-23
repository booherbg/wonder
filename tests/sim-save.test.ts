import { expect, test } from "vitest";
import {
  MAX_SAVED_SIMS,
  SIM_INDEX_KEY,
  forgetSimSlot,
  loadSimSlot,
  packSim,
  readSimIndex,
  restoreSim,
  saveSimSlot,
  simSlotKey,
  type SavedSim,
  type SimSlotMeta,
} from "../src/game/simSave";
import { worldKey, WORLD_INDEX_KEY } from "../src/game/save";
import { nextDrawerKey, syncKeySeq } from "../src/game/simDrawer";
import { SimKernel } from "../src/life/kernel";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { generateCritterSpecies } from "../src/life/fauna";
import { buildConstruct } from "../src/world/construct";
import { Tile } from "../src/world/types";
import { TILE_SIZE } from "../src/world/config";
import { paintBiome } from "../src/game/simBrush";

// an in-memory Storage so the localStorage round-trip is testable in node
function memStore(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear() { m.clear(); },
    getItem(k: string) { return m.get(k) ?? null; },
    key(i: number) { return [...m.keys()][i] ?? null; },
    removeItem(k: string) { m.delete(k); },
    setItem(k: string, v: string) { m.set(k, String(v)); },
  } as Storage;
}

// a minimal well-typed SavedSim (Task 8 produces the full one; storage is blob-agnostic)
function stubSim(name: string): SavedSim {
  return {
    v: 1, savedAt: 1, name, starter: "single-biome", seed: 7, width: 40, height: 40,
    flora: { tick: 0, plants: [], rngState: 0 },
    critters: [], critterRngState: 0, placeRngState: 0,
    plantSpecies: [], critterSpecies: [], drawer: [],
  };
}

test("the sim-slot namespace never collides with the real-world namespace", () => {
  expect(simSlotKey("abc")).toBe("wander.sim.abc");
  expect(simSlotKey("abc")).not.toBe(worldKey(7 as unknown as number));
  expect(SIM_INDEX_KEY).toBe("wander.sims");
  expect(SIM_INDEX_KEY).not.toBe(WORLD_INDEX_KEY);
});

test("save/load/forget round-trips a slot; the index is most-recent-first", () => {
  const store = memStore();
  const meta: SimSlotMeta = { id: "a1", name: "reef", savedAt: 100 };
  saveSimSlot(store, meta, stubSim("reef"));
  saveSimSlot(store, { id: "b2", name: "meadow", savedAt: 200 }, stubSim("meadow"));
  expect(readSimIndex(store).map((m) => m.id)).toEqual(["b2", "a1"]); // newest first
  expect(loadSimSlot(store, "a1")?.name).toBe("reef");
  expect(store.getItem(worldKey(7))).toBeNull(); // no real-world key was ever written

  forgetSimSlot(store, "a1");
  expect(loadSimSlot(store, "a1")).toBeNull(); // blob gone
  expect(readSimIndex(store).map((m) => m.id)).toEqual(["b2"]); // index entry gone
});

test("re-saving the same id moves it to front without duplicating", () => {
  const store = memStore();
  saveSimSlot(store, { id: "a1", name: "v1", savedAt: 100 }, stubSim("v1"));
  saveSimSlot(store, { id: "b2", name: "other", savedAt: 150 }, stubSim("other"));
  saveSimSlot(store, { id: "a1", name: "v2", savedAt: 200 }, stubSim("v2")); // re-save a1
  expect(readSimIndex(store).map((m) => m.id)).toEqual(["a1", "b2"]);
  expect(readSimIndex(store).filter((m) => m.id === "a1")).toHaveLength(1); // no dupe
  expect(loadSimSlot(store, "a1")?.name).toBe("v2"); // blob updated
});

test("the index caps at MAX_SAVED_SIMS, evicting the oldest blob AND its index entry", () => {
  const store = memStore();
  for (let i = 0; i < MAX_SAVED_SIMS + 3; i++) {
    saveSimSlot(store, { id: `s${i}`, name: `s${i}`, savedAt: i }, stubSim(`s${i}`));
  }
  const idx = readSimIndex(store);
  expect(idx).toHaveLength(MAX_SAVED_SIMS);
  expect(loadSimSlot(store, "s0")).toBeNull(); // oldest blob evicted
  expect(store.getItem(simSlotKey("s0"))).toBeNull(); // its blob key removed, not orphaned
  expect(idx.map((m) => m.id)).not.toContain("s0");
});

const SEED = 4242;

function liveBench() {
  // buildConstruct("single-biome", SEED) — NOT singleBiome(SEED, Tile.Grass, 40).
  // packSim/restoreSim rebuild the map via buildConstruct(starter, seed), which
  // calls singleBiome(seed) at its DEFAULT size (48, not 40); a bench built at a
  // different size would make tilesIfPainted always see a "painted" diff (or
  // restoreSim would throw a straight dim mismatch).
  const map = buildConstruct("single-biome", SEED);
  const plants = generatePlantSpecies(SEED);
  const scratch = new Flora(map, plants, SEED, {}, { tick: 0, plants: [] });
  const critters = generateCritterSpecies(SEED, map, scratch, plants);
  const kernel = new SimKernel({ map, plantSpecies: plants, critterSpecies: critters, seed: SEED });
  const grassPlant = plants.findIndex((p) => p.habitat === Tile.Grass);
  const at = (t: number) => (t + 0.5) * TILE_SIZE;
  for (let i = 0; i < 6; i++) kernel.placePlant(grassPlant, at(6 + i), at(6));
  kernel.placeCritter(critters[0].id, at(9), at(7)); // mutates its species' den (facts §4)
  kernel.setCritterRole(critters[0].id, "grazer"); // a live role mutation to persist
  return { kernel, map, grassPlant };
}

function snap(k: SimKernel) {
  return {
    tick: k.tick,
    floraCount: k.flora.count,
    counts: [...k.speciesCounts().entries()].sort((a, b) => a[0] - b[0]),
    critters: k.critters.map((c) => [
      Math.round(c.x * 1e3), Math.round(c.y * 1e3), c.state,
      Math.round(c.energy * 1e6), c.mood, Math.round(c.curiosity * 1e6),
    ]),
    frng: k.flora.rngState(), crng: k.critterRngState(), prng: k.placeRngState(),
  };
}

test("packSim -> JSON -> restoreSim resumes a whole construct bit-identically", () => {
  const { kernel } = liveBench();
  kernel.step(90, "full");

  const blob = packSim({ kernel, drawer: [], starter: "single-biome", seed: SEED, name: "grassbench", savedAt: 123 });
  const json = JSON.parse(JSON.stringify(blob)) as typeof blob; // prove fully JSON-safe
  const r = restoreSim(json);
  expect(r.kernel.tick).toBe(90);

  kernel.step(90, "full");
  r.kernel.step(90, "full");
  expect(snap(r.kernel)).toEqual(snap(kernel)); // identical continuation, all three streams included
});

test("packSim captures runtime species mutations (den + role) wholesale", () => {
  const { kernel } = liveBench();
  const blob = JSON.parse(JSON.stringify(packSim({ kernel, drawer: [], starter: "single-biome", seed: SEED, name: "x", savedAt: 1 })));
  const r = restoreSim(blob);
  // the grazer role and the placement-moved den survived the round-trip
  expect(r.kernel.critterSpecies[0].role).toBe("grazer");
  expect(r.kernel.critterSpecies[0].den).toEqual(kernel.critterSpecies[0].den);
});

test("tiles are persisted only when painted; a painted construct restores its paint", () => {
  const { kernel, map } = liveBench();
  const unpainted = packSim({ kernel, drawer: [], starter: "single-biome", seed: SEED, name: "x", savedAt: 1 });
  expect(unpainted.tiles).toBeUndefined(); // pristine construct === buildConstruct(starter, seed)

  paintBiome(map, [{ x: 2, y: 2 }], Tile.ShallowWater); // hand-paint one cell (facts §4)
  const painted = packSim({ kernel, drawer: [], starter: "single-biome", seed: SEED, name: "x", savedAt: 1 });
  expect(painted.tiles).toBeDefined();
  const r = restoreSim(JSON.parse(JSON.stringify(painted)));
  const idx = 2 * r.kernel.map.width + 2;
  expect(r.kernel.map.tiles[idx]).toBe(Tile.ShallowWater); // paint restored
});

test("syncKeySeq advances the drawer minter past restored keys (no collision after resume)", () => {
  const restored = [
    { key: "e3" }, { key: "e7" }, { key: "e5" },
  ] as unknown as Parameters<typeof syncKeySeq>[0];
  syncKeySeq(restored);
  const next = nextDrawerKey(); // must be past 7
  expect(Number(next.slice(1))).toBeGreaterThan(7);
});
