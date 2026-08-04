import { describe, expect, it } from "vitest";
import { MINERAL_COUNT, mineralFieldFor } from "../src/life/minerals";
import { generate } from "../src/world/generate";
import { DEFAULT_CONFIG } from "../src/world/config";

function land(map: ReturnType<typeof generate>): { tx: number; ty: number } {
  return { tx: map.spawn.x, ty: map.spawn.y };
}

describe("MineralField", () => {
  it("gives every land tile six minerals in [0,1]", () => {
    const map = generate(1234, DEFAULT_CONFIG);
    const f = mineralFieldFor(map, 1234);
    const { tx, ty } = land(map);
    const v = f.sample(tx, ty);
    expect(v.length).toBe(MINERAL_COUNT);
    for (const x of v) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for a seed", () => {
    const map = generate(99, DEFAULT_CONFIG);
    const a = mineralFieldFor(map, 99).sample(map.spawn.x, map.spawn.y);
    const b = mineralFieldFor(map, 99).sample(map.spawn.x, map.spawn.y);
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  it("varies across the island rather than being flat", () => {
    const map = generate(7, DEFAULT_CONFIG);
    const f = mineralFieldFor(map, 7);
    const seen = new Set<string>();
    for (let ty = 0; ty < map.height; ty += 17) {
      for (let tx = 0; tx < map.width; tx += 17) {
        seen.add(Array.from(f.sample(tx, ty), (v) => Math.round(v * 10)).join(","));
      }
    }
    expect(seen.size).toBeGreaterThan(20);
  });

  it("draw takes at most what is present and reports what it got", () => {
    const map = generate(3, DEFAULT_CONFIG);
    const f = mineralFieldFor(map, 3);
    const { tx, ty } = land(map);
    const demand = new Float32Array(MINERAL_COUNT).fill(1);
    const before = f.totalAt(tx, ty);
    const got = f.draw(tx, ty, demand, 1);
    expect(got).toBeGreaterThanOrEqual(0);
    expect(got).toBeLessThanOrEqual(MINERAL_COUNT);
    expect(f.totalAt(tx, ty)).toBeLessThanOrEqual(before);
    for (const x of f.sample(tx, ty)) expect(x).toBeGreaterThanOrEqual(0);
  });

  it("deposit clamps an overshoot back to the untouched sample, never above 1", () => {
    const map = generate(5, DEFAULT_CONFIG);
    const f = mineralFieldFor(map, 5);
    const { tx, ty } = land(map);
    const original = f.totalAt(tx, ty);

    // Draw a known amount first, so a delta entry exists to deposit against.
    const demand = new Float32Array(MINERAL_COUNT).fill(1);
    f.draw(tx, ty, demand, 0.1);
    expect(f.totalAt(tx, ty)).toBeLessThan(original);

    // Deposit back far more than was drawn. The overshoot must clamp at the
    // tile's original, untouched level — this is what `if (d[m] < 0) d[m] = 0`
    // in MineralField.deposit exists to enforce.
    const vec = new Float32Array(MINERAL_COUNT).fill(1);
    f.deposit(tx, ty, vec, 10);
    for (const x of f.sample(tx, ty)) expect(x).toBeLessThanOrEqual(1);
    expect(f.totalAt(tx, ty)).toBeLessThanOrEqual(original);
  });

  it("deposit on a never-drawn tile is a no-op", () => {
    const map = generate(5, DEFAULT_CONFIG);
    const f = mineralFieldFor(map, 5);
    const { tx, ty } = land(map);
    const before = Array.from(f.sample(tx, ty));
    const vec = new Float32Array(MINERAL_COUNT).fill(1);
    f.deposit(tx, ty, vec, 10);
    expect(Array.from(f.sample(tx, ty))).toEqual(before);
  });
});
