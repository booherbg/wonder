import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/world/config";
import { defaultForgeState, forgeArgs } from "../src/render/forgeArgs";

test("default state maps to DEFAULT_CONFIG with rolled shape/relief and no warmth", () => {
  const { seed, gen } = forgeArgs(defaultForgeState(42));
  expect(seed).toBe(42);
  expect(gen.shape).toBeUndefined();   // "roll" → let generate roll it
  expect(gen.relief).toBeUndefined();
  expect(gen.warm).toBe(0);
  expect(gen.config.width).toBe(DEFAULT_CONFIG.width);
  expect(gen.config.elevationScale).toBe(DEFAULT_CONFIG.elevationScale);
});

test("explicit shape/relief pass through; overrides merge onto the default config", () => {
  const s = defaultForgeState(7);
  s.shape = "crescent"; s.relief = "mesa"; s.width = 240; s.height = 260;
  s.cfg = { seaLevel: 0.42, riverCount: 12 };
  const { gen } = forgeArgs(s);
  expect(gen.shape).toBe("crescent");
  expect(gen.relief).toBe("mesa");
  expect(gen.config.width).toBe(240);
  expect(gen.config.height).toBe(260);
  expect(gen.config.seaLevel).toBeCloseTo(0.42);
  expect(gen.config.riverCount).toBe(12);
  expect(gen.config.elevationScale).toBe(DEFAULT_CONFIG.elevationScale); // untouched fields keep defaults
});

test("out-of-range knobs and warmth are clamped, never passed raw", () => {
  const s = defaultForgeState(1);
  s.warm = 999999;            // over the 50000 cap
  s.width = 5;                // below the min
  s.cfg = { seaLevel: 9 };    // absurd
  const { gen } = forgeArgs(s);
  expect(gen.warm).toBe(50000);
  expect(gen.config.width).toBeGreaterThanOrEqual(64);
  expect(gen.config.seaLevel).toBeLessThanOrEqual(1);
});
