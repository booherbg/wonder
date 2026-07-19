import { expect, test } from "vitest";
import {
  EATEN_BY_CAP,
  JOURNAL_KEY,
  Sighting,
  loadJournal,
  recordForage,
  recordSighting,
} from "../src/game/journal";
import { KV } from "../src/game/murmurs";
import { Genome, PlantForm } from "../src/life/genome";

function fakeKV(): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const GENOME: Genome = {
  form: PlantForm.Flower,
  hue: 0.3, hue2: 0.6, sat: 0.8, height: 0.4, spread: 0.5,
  petals: 5, leaves: 2, lean: 0, glow: 0.1,
};

function sighting(overrides: Partial<Sighting> = {}): Sighting {
  return {
    seed: 7,
    island: "Dusil Skerry",
    speciesId: 2,
    speciesName: "Luma Bell",
    genome: { ...GENOME },
    aquatic: false,
    drift: 12,
    at: 1000,
    ...overrides,
  };
}

test("a forage is only noted on a page that already exists", () => {
  const kv = fakeKV();
  recordForage(7, 2, "Poni Hopper", kv); // no page yet — nothing to write on
  expect(loadJournal(kv)).toEqual([]);
  recordSighting(sighting(), kv);
  recordForage(9, 2, "Poni Hopper", kv); // another island's page — still absent
  recordForage(7, 2, "Poni Hopper", kv);
  const entries = loadJournal(kv);
  expect(entries.length).toBe(1);
  expect(entries[0].eatenBy).toEqual(["Poni Hopper"]);
});

test("the same grazer is written down once, in first-seen order", () => {
  const kv = fakeKV();
  recordSighting(sighting(), kv);
  recordForage(7, 2, "Poni Hopper", kv);
  recordForage(7, 2, "Molsan Whisk", kv);
  recordForage(7, 2, "Poni Hopper", kv);
  expect(loadJournal(kv)[0].eatenBy).toEqual(["Poni Hopper", "Molsan Whisk"]);
});

test("a page holds at most six grazers", () => {
  const kv = fakeKV();
  recordSighting(sighting(), kv);
  for (let i = 0; i < EATEN_BY_CAP + 3; i++) {
    recordForage(7, 2, `Kinbul Scamper ${i}`, kv);
  }
  const eatenBy = loadJournal(kv)[0].eatenBy!;
  expect(eatenBy.length).toBe(EATEN_BY_CAP);
  expect(eatenBy[0]).toBe("Kinbul Scamper 0"); // the first witnesses are kept
});

test("witnessed links survive the roundtrip through storage", () => {
  const kv = fakeKV();
  recordSighting(sighting(), kv);
  recordForage(7, 2, "Poni Hopper", kv);
  recordForage(7, 2, "Molsan Whisk", kv);
  const reopened = fakeKV();
  reopened.map.set(JOURNAL_KEY, kv.map.get(JOURNAL_KEY)!);
  expect(loadJournal(reopened)[0].eatenBy).toEqual(["Poni Hopper", "Molsan Whisk"]);
});

test("older pages without eatenBy still load fine", () => {
  const kv = fakeKV();
  recordSighting(sighting(), kv); // sketched before forage links existed
  const entries = loadJournal(kv);
  expect(entries.length).toBe(1);
  expect(entries[0].eatenBy).toBeUndefined();
  recordForage(7, 2, "Poni Hopper", kv); // and such a page can still learn
  expect(loadJournal(kv)[0].eatenBy).toEqual(["Poni Hopper"]);
});
