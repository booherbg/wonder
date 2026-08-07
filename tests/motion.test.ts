import { describe, expect, it } from "vitest";
import { gaitFeatures, gaitFor, motionOffset } from "../src/life/motion";

describe("motion signature", () => {
  it("is deterministic per species", () => {
    expect(gaitFor(7)).toEqual(gaitFor(7));
  });

  it("gives different species different gaits", () => {
    expect(gaitFor(7)).not.toEqual(gaitFor(8));
  });

  it("exposes twelve features", () => {
    expect(gaitFeatures(gaitFor(1)).length).toBe(12);
  });

  it("offsets stay small enough not to teleport a sprite", () => {
    const g = gaitFor(3);
    for (let t = 0; t < 20000; t += 37) {
      const { dx, dy } = motionOffset(g, t, 0.3);
      expect(Math.abs(dx)).toBeLessThanOrEqual(4);
      expect(Math.abs(dy)).toBeLessThanOrEqual(4);
    }
  });

  it("two species are separable by their feature vectors", () => {
    // Bench 11 measured 89.1% separability against a 12.5% chance level over
    // eight genomes. This asserts only that distinct species produce distinct
    // vectors, which is the property the renderer depends on.
    const seen = new Set<string>();
    for (let s = 0; s < 8; s++) seen.add(gaitFeatures(gaitFor(s)).map((v) => v.toFixed(3)).join(","));
    expect(seen.size).toBe(8);
  });

  it("phase decorrelates individuals of one species", () => {
    const g = gaitFor(5);
    const a = motionOffset(g, 1000, 0.0);
    const b = motionOffset(g, 1000, 0.5);
    expect(a.dx === b.dx && a.dy === b.dy).toBe(false);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Real separability: leave-one-out nearest-neighbour classification over
  // simulated flights, echoing bench 11's method rather than merely checking
  // that feature vectors are distinct floats (guaranteed by construction).
  //
  // Eight species, 24 ten-second flights each (fixed 50ms timestep, 200
  // samples per flight), each flight given its own `phase` so individuals of
  // one species don't look identical. Each flight is reduced to a 4-feature
  // summary of its `motionOffset` trajectory alone (mean/stdev of dx and dy)
  // — deliberately excluding gaitFeatures, which are phase-invariant and
  // would let the test pass even if motionOffset were disabled. Leave-one-out
  // 1-NN classification is run over all 8*24 = 192 flights.
  // ───────────────────────────────────────────────────────────────────────
  it("species are separable by nearest-neighbour classification on simulated flights", () => {
    const NUM_SPECIES = 8;
    const RUNS_PER_SPECIES = 24;
    const DURATION_MS = 10_000;
    const STEP_MS = 50;

    function flightSummary(speciesSeed: number, runIndex: number): number[] {
      const g = gaitFor(speciesSeed);
      const phase = ((speciesSeed * 97 + runIndex * 131) % 1000) / 1000;
      let sumDx = 0;
      let sumDy = 0;
      let sumDx2 = 0;
      let sumDy2 = 0;
      let n = 0;
      for (let t = 0; t < DURATION_MS; t += STEP_MS) {
        const { dx, dy } = motionOffset(g, t, phase);
        sumDx += dx;
        sumDy += dy;
        sumDx2 += dx * dx;
        sumDy2 += dy * dy;
        n++;
      }
      const meanDx = sumDx / n;
      const meanDy = sumDy / n;
      const stdDx = Math.sqrt(Math.max(0, sumDx2 / n - meanDx * meanDx));
      const stdDy = Math.sqrt(Math.max(0, sumDy2 / n - meanDy * meanDy));
      return [meanDx, meanDy, stdDx, stdDy];
    }

    type Sample = { label: number; features: number[] };
    const samples: Sample[] = [];
    for (let s = 0; s < NUM_SPECIES; s++) {
      for (let r = 0; r < RUNS_PER_SPECIES; r++) {
        samples.push({ label: s, features: flightSummary(s, r) });
      }
    }

    function dist(a: number[], b: number[]): number {
      let sum = 0;
      for (let i = 0; i < a.length; i++) {
        const d = a[i] - b[i];
        sum += d * d;
      }
      return sum;
    }

    let correct = 0;
    for (let i = 0; i < samples.length; i++) {
      let bestJ = -1;
      let bestD = Infinity;
      for (let j = 0; j < samples.length; j++) {
        if (j === i) continue;
        const d = dist(samples[i].features, samples[j].features);
        if (d < bestD) {
          bestD = d;
          bestJ = j;
        }
      }
      if (samples[bestJ].label === samples[i].label) correct++;
    }

    const accuracy = correct / samples.length;
    const chance = 1 / NUM_SPECIES;
    // eslint-disable-next-line no-console
    console.log(`motion separability: ${(accuracy * 100).toFixed(1)}% vs ${(chance * 100).toFixed(1)}% chance (n=${samples.length})`);

    // Must clear chance by a wide margin — this is the property the whole
    // design leans on (bench 11: 89.1% vs 12.5% chance, 7x).
    expect(accuracy).toBeGreaterThan(chance * 3);
  });
});
