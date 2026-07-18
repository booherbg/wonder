import { expect, test } from "vitest";
import {
  CYCLE_MS,
  DAY_MS,
  DUSK_MS,
  MAX_DARKNESS,
  darknessAt,
  isBiolumeNight,
  isNight,
} from "../src/game/daynight";

test("daytime is fully lit and night holds max darkness", () => {
  expect(darknessAt(0)).toBe(0);
  expect(darknessAt(DAY_MS / 2)).toBe(0);
  expect(darknessAt(DAY_MS + DUSK_MS + 1000)).toBe(MAX_DARKNESS);
});

test("dusk ramps smoothly between day and night", () => {
  const mid = darknessAt(DAY_MS + DUSK_MS / 2);
  expect(mid).toBeGreaterThan(0.1);
  expect(mid).toBeLessThan(MAX_DARKNESS);
});

test("darkness is periodic and always within bounds", () => {
  for (let t = 0; t < CYCLE_MS * 2; t += 7919) {
    const d = darknessAt(t);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(MAX_DARKNESS);
    expect(darknessAt(t + CYCLE_MS)).toBeCloseTo(d, 10);
  }
});

test("isNight flags the dark stretch only", () => {
  expect(isNight(DAY_MS / 2)).toBe(false);
  expect(isNight(DAY_MS + DUSK_MS + 1000)).toBe(true);
});

test("biolume nights are deterministic and neither constant nor absent", () => {
  const results = new Set<boolean>();
  for (let night = 0; night < 30; night++) {
    const t = night * CYCLE_MS + DAY_MS + DUSK_MS + 1000;
    expect(isBiolumeNight(t, 42)).toBe(isBiolumeNight(t, 42));
    results.add(isBiolumeNight(t, 42));
  }
  expect(results.has(true)).toBe(true);
  expect(results.has(false)).toBe(true);
});
