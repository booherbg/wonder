import { expect, test } from "vitest";
import { fbm, valueNoise } from "../src/core/noise";
import { hash2d } from "../src/core/rng";

test("valueNoise is deterministic", () => {
  expect(valueNoise(1.5, 2.7, 42)).toBe(valueNoise(1.5, 2.7, 42));
});

test("valueNoise equals the lattice hash at integer coordinates", () => {
  expect(valueNoise(3, 4, 42)).toBeCloseTo(hash2d(3, 4, 42), 10);
  expect(valueNoise(0, 0, 7)).toBeCloseTo(hash2d(0, 0, 7), 10);
});

test("valueNoise stays in [0, 1)", () => {
  for (let i = 0; i < 500; i++) {
    const v = valueNoise(i * 0.37, i * 0.71, 9);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

test("valueNoise is continuous (tiny step, tiny change)", () => {
  for (let i = 0; i < 100; i++) {
    const x = i * 0.31;
    const y = i * 0.17;
    expect(Math.abs(valueNoise(x, y, 5) - valueNoise(x + 0.01, y, 5))).toBeLessThan(0.15);
  }
});

test("fbm is deterministic and in [0, 1)", () => {
  expect(fbm(1.1, 2.2, 3, 5)).toBe(fbm(1.1, 2.2, 3, 5));
  for (let i = 0; i < 500; i++) {
    const v = fbm(i * 0.13, i * 0.29, 11, 5);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

test("fbm octaves add detail (octave 1 differs from octave 5)", () => {
  let differs = false;
  for (let i = 0; i < 20; i++) {
    if (Math.abs(fbm(i * 0.4, i * 0.6, 2, 1) - fbm(i * 0.4, i * 0.6, 2, 5)) > 1e-9) differs = true;
  }
  expect(differs).toBe(true);
});
