import { expect, test } from "vitest";
import { CYCLE_MS, isAuroraNight } from "../src/game/daynight";
import { emptyInventory } from "../src/game/inventory";
import { SavedWorld, packWorld } from "../src/game/save";

test("aurora nights are rare, deterministic, and differ per island", () => {
  const fractions: number[] = [];
  for (const seed of [1, 42, 777]) {
    let count = 0;
    const N = 3000;
    for (let night = 0; night < N; night++) {
      const a = isAuroraNight(night * CYCLE_MS + 1, seed);
      expect(a).toBe(isAuroraNight(night * CYCLE_MS + 1, seed));
      if (a) count++;
    }
    fractions.push(count / N);
  }
  for (const f of fractions) {
    expect(f).toBeGreaterThan(0.02); // rare
    expect(f).toBeLessThan(0.2); // but not mythical
  }
});

test("weather memories survive the save roundtrip", () => {
  const packed = packWorld(
    5,
    10,
    { x: 1, y: 2 },
    null,
    emptyInventory(),
    [],
    99,
    [],
    ["an aurora passed here once", "the glowing tide rose here once"],
  );
  const saved = JSON.parse(JSON.stringify(packed)) as SavedWorld;
  expect(saved.memories).toEqual([
    "an aurora passed here once",
    "the glowing tide rose here once",
  ]);
});

test("old saves without memories still restore", () => {
  const packed = packWorld(5, 10, { x: 1, y: 2 }, null, emptyInventory(), [], 99);
  const saved = JSON.parse(JSON.stringify(packed)) as SavedWorld;
  delete saved.memories;
  expect(saved.memories ?? []).toEqual([]);
});
