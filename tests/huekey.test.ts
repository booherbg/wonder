import { describe, expect, it } from "vitest";
import {
  HUE_BIAS,
  SPLIT_COMPLEMENTARY_OFFSETS,
  TERRAIN_GREEN_HUE,
  applyHueKey,
  groundHue,
  hueKeyFor,
} from "../src/life/huekey";
import { generatePlantSpecies } from "../src/life/species";

function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 1;
  return d > 0.5 ? 1 - d : d;
}

describe("the Hollow's hue key", () => {
  it("ships bench 10's recommended constants", () => {
    expect(SPLIT_COMPLEMENTARY_OFFSETS).toEqual([0, 150, 210]);
    expect(HUE_BIAS).toBe(0.7);
  });

  it("grounds one anchor on the terrain green", () => {
    const anchors = hueKeyFor(42);
    expect(anchors.some((a) => hueGap(a, TERRAIN_GREEN_HUE) < 0.001)).toBe(true);
  });

  it("gives three anchors, all in [0,1)", () => {
    const anchors = hueKeyFor(7);
    expect(anchors.length).toBe(3);
    for (const a of anchors) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(1);
    }
  });

  // Bench 10 declined the best-scoring keys because tetradic and triadic
  // offsets are closed under their own rotation, so grounding them yields one
  // identical anchor set for every island. Split-complementary's 0/150/210 are
  // not rotation-symmetric, so distinct islands must still produce distinct
  // chords. This is the property that choice was made for.
  it("produces different chords on different islands", () => {
    const seen = new Set<string>();
    for (let s = 1; s <= 12; s++) {
      seen.add(hueKeyFor(s).map((h) => h.toFixed(4)).sort().join(","));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("pulls a hue toward its nearest anchor without collapsing onto it", () => {
    const anchors = [0.0, 0.25, 0.5];
    const moved = groundHue(0.2, anchors, HUE_BIAS);
    expect(hueGap(moved, 0.25)).toBeLessThan(hueGap(0.2, 0.25));
    expect(hueGap(moved, 0.25)).toBeGreaterThan(0);
  });

  it("leaves far more of the wheel reachable at bias 0.70 than at 1.0", () => {
    // groundHue is a linear pull: moved = hue + (anchor - hue) * bias. That
    // makes the reachable fraction of output hues exactly (1 - bias),
    // independent of anchor placement, because each anchor's input domain of
    // width w maps onto an output arc of width w * (1 - bias), and the
    // domains partition the whole wheel. Measured over 360 one-degree
    // samples: bias 1.0 collapses onto the 3 anchors, 1/360 = 0.3% reachable;
    // bias 0.70 reaches 111/360 = 30.8%, a 111x increase, matching the
    // (1 - bias) prediction of 30%.
    const anchors = hueKeyFor(3);
    const reachedFraction = (bias: number) => {
      const reached = new Set<number>();
      for (let i = 0; i < 360; i++) {
        reached.add(Math.round(groundHue(i / 360, anchors, bias) * 360));
      }
      return reached.size / 360;
    };
    const atBias = reachedFraction(HUE_BIAS);
    const atFull = reachedFraction(1.0);
    expect(atBias).toBeGreaterThan(0.25);
    expect(atBias).toBeLessThan(0.35);
    expect(atFull).toBeLessThan(0.02);
    expect(atBias).toBeGreaterThan(atFull * 10);
  });

  it("returns a new species array and does not mutate the input", () => {
    const base = generatePlantSpecies(11);
    const before = base.map((s) => s.archetype.hue);
    const keyed = applyHueKey(base, 11);
    expect(keyed).not.toBe(base);
    expect(base.map((s) => s.archetype.hue)).toEqual(before);
  });

  it("moves species hues toward the key", () => {
    const base = generatePlantSpecies(5);
    const keyed = applyHueKey(base, 5);
    const anchors = hueKeyFor(5);
    const near = (list: typeof base) =>
      list.reduce((sum, s) => sum + Math.min(...anchors.map((a) => hueGap(s.archetype.hue, a))), 0) /
      list.length;
    expect(near(keyed)).toBeLessThan(near(base));
  });

  it("is deterministic for a seed", () => {
    expect(applyHueKey(generatePlantSpecies(8), 8).map((s) => s.archetype.hue)).toEqual(
      applyHueKey(generatePlantSpecies(8), 8).map((s) => s.archetype.hue),
    );
  });
});
