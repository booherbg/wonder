import { describe, expect, it } from "vitest";
import { RUGGEDNESS_K, landscapeFor } from "../src/life/fitness";
import { MINERAL_COUNT } from "../src/life/minerals";
import { PlantForm, mutate } from "../src/life/genome";
import { makeRng } from "../src/core/rng";

const G = {
  form: PlantForm.Flower,
  hue: 0.3, hue2: 0.5, sat: 0.7, height: 0.5, spread: 0.5,
  petals: 5, leaves: 2, lean: 0, glow: 0.1,
};

function niche(fill: number, light = 0.5) {
  return { minerals: new Float32Array(MINERAL_COUNT).fill(fill), light };
}

describe("FitnessLandscape", () => {
  it("uses K = 3", () => {
    expect(RUGGEDNESS_K).toBe(3);
  });

  it("scores into [0,1]", () => {
    const L = landscapeFor(42);
    const rng = makeRng(1);
    for (let i = 0; i < 200; i++) {
      const g = mutate(G, rng, 0.5);
      const s = L.score(g, niche(rng()));
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic for a seed", () => {
    expect(landscapeFor(8).score(G, niche(0.5))).toBe(landscapeFor(8).score(G, niche(0.5)));
  });

  it("gives different islands different landscapes", () => {
    expect(landscapeFor(8).score(G, niche(0.5))).not.toBe(landscapeFor(9).score(G, niche(0.5)));
  });

  it("rewards a genome more in the niche it demands than in a starved one", () => {
    const L = landscapeFor(11);
    expect(L.score(G, niche(0.9))).toBeGreaterThan(L.score(G, niche(0.02)));
  });

  it("demandOf returns six non-negative demands", () => {
    const d = landscapeFor(3).demandOf(G);
    expect(d.length).toBe(MINERAL_COUNT);
    for (const x of d) expect(x).toBeGreaterThanOrEqual(0);
  });

  // The finding this whole layer exists to reproduce: a hill climb at K=3
  // lands on a menu of optima, not one answer and not noise. Bench 2 measured
  // 4.0 distinct peaks per population run; this asserts only the direction
  // (more than one, far fewer than the number of walks) so it is not brittle.
  it("produces multiple local optima rather than one", () => {
    const L = landscapeFor(21);
    const n = niche(0.6);
    const peaks = new Set<string>();
    for (let w = 0; w < 40; w++) {
      const rng = makeRng(w + 1);
      let best = mutate(G, rng, 0.5);
      let bestScore = L.score(best, n);
      for (let step = 0; step < 60; step++) {
        const cand = mutate(best, rng, 0.05);
        const s = L.score(cand, n);
        if (s > bestScore) { best = cand; bestScore = s; }
      }
      peaks.add(bestScore.toFixed(2));
    }
    expect(peaks.size).toBeGreaterThan(1);
    expect(peaks.size).toBeLessThan(40);
  });
});
