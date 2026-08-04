import { describe, expect, it } from "vitest";
import { RUGGEDNESS_K, landscapeFor, landscapeForK } from "../src/life/fitness";
import { MINERAL_COUNT } from "../src/life/minerals";
import { GENOME_BOUNDS, Genome, NUMERIC_TRAITS, PlantForm, mutate } from "../src/life/genome";
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

  // The finding this whole layer exists to reproduce: K=3 has more local
  // optima than K=0. Bench 2 measured this by exhaustive enumeration (58
  // local optima among 65,536 genotypes at N=16), not by sampled hill
  // climbs — a sampled hill climb over 9 traits at 8 quantisation levels
  // (8^9 ~= 1.3e8 genotypes) can never collide across 40 walks regardless
  // of K, so it cannot discriminate. This instead reduces each of the 9
  // numeric traits to two levels (its bound minimum and maximum), giving
  // 2^9 = 512 genotypes — small enough to enumerate exhaustively and count
  // true local optima (no single-bit flip scores higher) directly.
  function genomeForBits(bits: number): Genome {
    const g: Genome = { ...G };
    NUMERIC_TRAITS.forEach((t, i) => {
      const [lo, hi] = GENOME_BOUNDS[t];
      (g as unknown as Record<string, number>)[t] = (bits >> i) & 1 ? hi : lo;
    });
    return g;
  }

  function countLocalOptima(L: ReturnType<typeof landscapeForK>, n: { minerals: Float32Array; light: number }): number {
    const score = new Float64Array(512);
    for (let b = 0; b < 512; b++) score[b] = L.score(genomeForBits(b), n);
    let optima = 0;
    for (let b = 0; b < 512; b++) {
      let best = true;
      for (let i = 0; i < 9; i++) if (score[b ^ (1 << i)] > score[b]) { best = false; break; }
      if (best) optima++;
    }
    return optima;
  }

  // Measured: k=0 -> 1 local optimum, k=3 -> 14 local optima (fixed niche,
  // seed 21). At k=0 each trait's contribution and its `afford` term depend
  // only on itself, and lightFit's coupling through `height` alone was not
  // enough here to break separability, so the landscape collapses to a
  // single peak — the pre-NK baseline the whole layer exists to move past.
  // k=3 produces far more ruggedness. The threshold below (k3 > k0*2) is
  // set well under the measured 14x gap.
  it("K=3 produces clearly more local optima than K=0 (exhaustive 512-genotype enumeration)", () => {
    const n = niche(0.6);
    const optimaAtK0 = countLocalOptima(landscapeForK(21, 0), n);
    const optimaAtK3 = countLocalOptima(landscapeForK(21, RUGGEDNESS_K), n);
    expect(optimaAtK3).toBeGreaterThan(optimaAtK0 * 2);
  });
});
