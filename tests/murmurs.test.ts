import { expect, test } from "vitest";
import {
  COOLDOWN_MS,
  KV,
  MURMURS,
  SWARM_MET_CAP,
  markSwarmMet,
  pickMurmur,
  swarmMetOn,
} from "../src/game/murmurs";

test("every murmur has text, an em-dash attribution, and a tag", () => {
  for (const m of MURMURS) {
    expect(m.text.length).toBeGreaterThan(10);
    expect(m.attribution.startsWith("—")).toBe(true);
    expect(m.tag.length).toBeGreaterThan(2);
  }
});

test("pickMurmur respects the cooldown", () => {
  expect(pickMurmur("island", new Set(), 0, COOLDOWN_MS - 1)).toBeNull();
  expect(pickMurmur("island", new Set(), 0, COOLDOWN_MS + 1)).not.toBeNull();
});

test("pickMurmur never repeats and eventually runs dry per tag", () => {
  const shown = new Set<string>();
  const islandMurmurs = MURMURS.filter((m) => m.tag === "island").length;
  for (let i = 0; i < islandMurmurs; i++) {
    const m = pickMurmur("island", shown, -Infinity, 0);
    expect(m).not.toBeNull();
    expect(shown.has(m!.text)).toBe(false);
    shown.add(m!.text);
  }
  expect(pickMurmur("island", shown, -Infinity, 0)).toBeNull();
});

test("the swarms have murmurs of their own — words for the flower-and-bee bond", () => {
  const swarm = MURMURS.filter((m) => m.tag === "swarm");
  expect(swarm.length).toBeGreaterThanOrEqual(2);
  // among them, darwin's co-adaptation line — the very mechanic the clouds live
  expect(swarm.some((m) => m.text.includes("a flower and a bee"))).toBe(true);
});

// the first-meeting cue: once per island, remembered across sittings
function fakeKV(): KV {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

test("the first-meeting guard speaks once per island and remembers across sittings", () => {
  const kv = fakeKV();
  expect(swarmMetOn(7, kv)).toBe(false); // a fresh island: the cue may speak
  markSwarmMet(7, kv);
  expect(swarmMetOn(7, kv)).toBe(true); // and then never again there
  expect(swarmMetOn(9, kv)).toBe(false); // another island keeps its own introduction
  markSwarmMet(7, kv); // marking twice is harmless
  expect(swarmMetOn(7, kv)).toBe(true);
});

test("the guard's memory is bounded — the oldest islands are quietly forgotten", () => {
  const kv = fakeKV();
  for (let s = 0; s < SWARM_MET_CAP + 5; s++) markSwarmMet(s, kv);
  expect(swarmMetOn(0, kv)).toBe(false); // aged out
  expect(swarmMetOn(SWARM_MET_CAP + 4, kv)).toBe(true); // the newest hold
});

test("the guard shrugs off a missing or corrupt store", () => {
  expect(swarmMetOn(7, null)).toBe(false);
  markSwarmMet(7, null); // no storage: a quiet no-op, never a throw
  const kv = fakeKV();
  kv.setItem("wander.swarmMet", "not json");
  expect(swarmMetOn(7, kv)).toBe(false);
  markSwarmMet(7, kv); // a corrupt store is simply rewritten
  expect(swarmMetOn(7, kv)).toBe(true);
});
