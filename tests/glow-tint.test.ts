import { describe, expect, it } from "vitest";
import { DAY_MS, DUSK_MS, darknessAt, skyGrade, tintStrength } from "../src/game/daynight";

describe("tintStrength", () => {
  it("is zero in clear day", () => {
    expect(tintStrength(DAY_MS / 2)).toBe(0);
  });

  it("stays within [0,1] across a whole cycle", () => {
    for (let t = 0; t < 500_000; t += 1000) {
      const v = tintStrength(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("tracks the sky cast's alpha", () => {
    const t = DAY_MS + DUSK_MS * 0.5;
    expect(tintStrength(t)).toBeCloseTo(skyGrade(t).a, 5);
  });

  // The finding: at the twilight peak the tint is already doing its damage
  // while darkness is still low. Glow gated on darkness therefore fires late.
  it("leads darkness at the dusk peak, which is why glow must key off it", () => {
    const peak = DAY_MS + DUSK_MS * 0.5;
    expect(tintStrength(peak)).toBeGreaterThan(darknessAt(peak) * 0.62);
  });

  // Guards against tintStrength being wired to darknessAt: early dusk is where
  // the two diverge most. At 12% into dusk the tint is 0.152 and darkness is
  // 0.0311 — a factor of 4.9. Returning darknessAt here would fail.
  it("is well above darkness in early dusk, so glow fires while the sky is warm", () => {
    const early = DAY_MS + DUSK_MS * 0.12;
    expect(tintStrength(early)).toBeGreaterThan(darknessAt(early) * 3);
    // and glow's 0.05 gate is already open there, while a darkness gate is not
    expect(tintStrength(early)).toBeGreaterThan(0.05);
    expect(darknessAt(early)).toBeLessThan(0.05);
  });
});
