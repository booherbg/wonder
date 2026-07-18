import { expect, test } from "vitest";
import { hash2d, makeRng } from "../src/core/rng";

test("same seed produces the same sequence", () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 100; i++) expect(a()).toBe(b());
});

test("different seeds produce different sequences", () => {
  const a = makeRng(1);
  const b = makeRng(2);
  const seqA = Array.from({ length: 10 }, () => a());
  const seqB = Array.from({ length: 10 }, () => b());
  expect(seqA).not.toEqual(seqB);
});

test("values are in [0, 1)", () => {
  const rng = makeRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});

test("values are roughly uniform", () => {
  const rng = makeRng(1234);
  let sum = 0;
  for (let i = 0; i < 2000; i++) sum += rng();
  expect(sum / 2000).toBeGreaterThan(0.45);
  expect(sum / 2000).toBeLessThan(0.55);
});

test("hash2d is deterministic and in [0, 1)", () => {
  expect(hash2d(10, 20, 3)).toBe(hash2d(10, 20, 3));
  for (let x = -5; x < 5; x++) {
    for (let y = -5; y < 5; y++) {
      const v = hash2d(x, y, 99);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  }
});

test("hash2d differs across coordinates and seeds", () => {
  expect(hash2d(1, 2, 3)).not.toBe(hash2d(2, 1, 3));
  expect(hash2d(1, 2, 3)).not.toBe(hash2d(1, 2, 4));
});
