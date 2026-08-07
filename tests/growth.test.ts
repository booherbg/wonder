// tests/growth.test.ts
import { describe, expect, it } from "vitest";
import { growthScale } from "../src/render/growth";

describe("growthScale", () => {
  it("starts visible but small", () => {
    const s = growthScale(0, 20);
    expect(s).toBeGreaterThanOrEqual(0.18);
    expect(s).toBeLessThan(0.35);
  });

  it("reaches full size at maturity and stays there", () => {
    expect(growthScale(20, 20)).toBeCloseTo(1, 5);
    expect(growthScale(900, 20)).toBeCloseTo(1, 5);
  });

  it("is monotonic up to maturity", () => {
    let prev = -1;
    for (let a = 0; a <= 20; a++) {
      const s = growthScale(a, 20);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
  });

  it("handles a zero maturity age without dividing by zero", () => {
    expect(growthScale(0, 0)).toBe(1);
  });

  it("never returns a scale outside [0.18, 1]", () => {
    for (let a = -5; a < 100; a++) {
      const s = growthScale(a, 20);
      expect(s).toBeGreaterThanOrEqual(0.18);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});
