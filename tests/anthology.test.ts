import { expect, test } from "vitest";
import {
  ANTHOLOGY_CAP,
  ANTHOLOGY_KEY,
  KV,
  MURMURS,
  MurmurEngine,
  loadAnthology,
  recordInAnthology,
} from "../src/game/murmurs";

function fakeKV(): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

test("the anthology keeps every offering in order", () => {
  const kv = fakeKV();
  recordInAnthology(MURMURS[0], "Dusil Skerry", 1, kv);
  recordInAnthology(MURMURS[1], "Fenor Holm", 2, kv);
  const entries = loadAnthology(kv);
  expect(entries.length).toBe(2);
  expect(entries[0].text).toBe(MURMURS[0].text);
  expect(entries[0].place).toBe("Dusil Skerry");
  expect(entries[1].at).toBe(2);
});

test("the anthology is capped, dropping the oldest words first", () => {
  const kv = fakeKV();
  for (let i = 0; i < ANTHOLOGY_CAP + 25; i++) {
    recordInAnthology({ ...MURMURS[0], text: `murmur ${i}` }, "x", i, kv);
  }
  const entries = loadAnthology(kv);
  expect(entries.length).toBe(ANTHOLOGY_CAP);
  expect(entries[0].text).toBe("murmur 25");
});

test("corrupt storage reads as an empty anthology", () => {
  const kv = fakeKV();
  kv.map.set(ANTHOLOGY_KEY, "{not json");
  expect(loadAnthology(kv)).toEqual([]);
});

test("the engine records what it offers, with the place it was heard", () => {
  const kv = fakeKV();
  const engine = new MurmurEngine(kv);
  engine.setPlace("Lulu Holm");
  engine.offer("island", 60_000);
  const entries = loadAnthology(kv);
  expect(entries.length).toBe(1);
  expect(entries[0].place).toBe("Lulu Holm");
  expect(entries[0].attribution.startsWith("—")).toBe(true);
});
