import { expect, test } from "vitest";
import {
  MAX_SAVED_SIMS,
  SIM_INDEX_KEY,
  forgetSimSlot,
  loadSimSlot,
  readSimIndex,
  saveSimSlot,
  simSlotKey,
  type SavedSim,
  type SimSlotMeta,
} from "../src/game/simSave";
import { worldKey, WORLD_INDEX_KEY } from "../src/game/save";

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
