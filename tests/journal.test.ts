import { expect, test } from "vitest";
import {
  JOURNAL_CAP,
  JOURNAL_KEY,
  Sighting,
  loadJournal,
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

test("a first meeting writes an entry; later meetings deepen it", () => {
  const kv = fakeKV();
  recordSighting(sighting(), kv);
  recordSighting(sighting({ drift: 31, at: 2000 }), kv);
  recordSighting(sighting({ drift: 8, at: 3000 }), kv);
  const entries = loadJournal(kv);
  expect(entries.length).toBe(1);
  expect(entries[0].sightings).toBe(3);
  expect(entries[0].maxDrift).toBe(31); // the furthest drift is remembered
  expect(entries[0].firstMetAt).toBe(1000); // the first meeting stays first
});

test("the same kind on different islands earns separate pages", () => {
  const kv = fakeKV();
  recordSighting(sighting(), kv);
  recordSighting(sighting({ seed: 9, island: "Fenor Holm" }), kv);
  recordSighting(sighting({ speciesId: 5, speciesName: "Vel Cap" }), kv);
  expect(loadJournal(kv).length).toBe(3);
});

test("names can gain their marks later", () => {
  const kv = fakeKV();
  recordSighting(sighting(), kv);
  recordSighting(sighting({ speciesName: "Luma Bell ✧", at: 2000 }), kv);
  expect(loadJournal(kv)[0].speciesName).toBe("Luma Bell ✧");
});

test("the journal is capped, keeping the most recent meetings", () => {
  const kv = fakeKV();
  for (let i = 0; i < JOURNAL_CAP + 20; i++) {
    recordSighting(sighting({ speciesId: i, at: i }), kv);
  }
  const entries = loadJournal(kv);
  expect(entries.length).toBe(JOURNAL_CAP);
  expect(entries.every((e) => e.firstMetAt >= 20)).toBe(true);
});

test("corrupt storage reads as an empty journal", () => {
  const kv = fakeKV();
  kv.map.set(JOURNAL_KEY, "]not json[");
  expect(loadJournal(kv)).toEqual([]);
});

// ── the insect clouds' shelf ───────────────────────────────────────────
// Leaning close to a swarm (or clicking one) writes it a page: its codex
// name, the bloom it works, the best match and fullest cloud ever witnessed.

import { SWARM_JOURNAL_KEY, SwarmMeeting, loadSwarmJournal, recordSwarmMeeting } from "../src/game/journal";

function swarmMeeting(overrides: Partial<SwarmMeeting> = {}): SwarmMeeting {
  return {
    seed: 7,
    island: "Dusil Skerry",
    swarmId: 2,
    name: "Lufer Dartwing",
    hostName: "Luma Bell",
    resemblance: 0.4,
    population: 38,
    at: 1000,
    ...overrides,
  };
}

test("meeting a swarm writes its page; later meetings deepen, never duplicate", () => {
  const kv = fakeKV();
  recordSwarmMeeting(swarmMeeting(), kv);
  recordSwarmMeeting(swarmMeeting({ resemblance: 0.8, population: 61, at: 2000 }), kv);
  recordSwarmMeeting(swarmMeeting({ resemblance: 0.5, population: 20, at: 3000 }), kv);
  const shelf = loadSwarmJournal(kv);
  expect(shelf.length).toBe(1);
  expect(shelf[0].name).toBe("Lufer Dartwing");
  expect(shelf[0].hostName).toBe("Luma Bell");
  expect(shelf[0].meetings).toBe(3);
  expect(shelf[0].bestResemblance).toBe(0.8); // the closest match ever witnessed holds
  expect(shelf[0].population).toBe(61); // and the fullest cloud
  expect(shelf[0].firstMetAt).toBe(1000); // the first meeting stays first
});

test("a swarm met again on a new bloom updates its host; other clouds keep their own pages", () => {
  const kv = fakeKV();
  recordSwarmMeeting(swarmMeeting(), kv);
  recordSwarmMeeting(swarmMeeting({ hostName: "Vel Cap", at: 2000 }), kv);
  recordSwarmMeeting(swarmMeeting({ swarmId: 5, name: "Mosa Hummer ✧", at: 3000 }), kv);
  recordSwarmMeeting(swarmMeeting({ seed: 9, island: "Fenor Holm", at: 4000 }), kv);
  const shelf = loadSwarmJournal(kv);
  expect(shelf.length).toBe(3); // same cloud twice, a cousin, and a far island's cloud
  expect(shelf[0].hostName).toBe("Vel Cap"); // a cloud may drift to a new bloom
  expect(shelf.some((e) => e.name === "Mosa Hummer ✧")).toBe(true); // cousins keep their ✧
});

test("the swarm shelf shrugs off corrupt or missing storage", () => {
  const kv = fakeKV();
  kv.map.set(SWARM_JOURNAL_KEY, "]not json[");
  expect(loadSwarmJournal(kv)).toEqual([]);
  recordSwarmMeeting(swarmMeeting(), null); // no storage: the meeting still happened
});
