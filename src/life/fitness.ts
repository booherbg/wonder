import { hash2d } from "../core/rng";
import { GENOME_BOUNDS, Genome, NUMERIC_TRAITS, NumericTrait } from "./genome";
import { MINERAL_COUNT, MineralVec } from "./minerals";

// ─────────────────────────────────────────────────────────────────────────────
// The NK fitness landscape. Each trait's contribution depends on its own value
// and on RUGGEDNESS_K other traits, so the landscape has many local optima
// rather than one global answer (K=0) or none reachable (K=N-1).
//
// K = 3 is bench 2's recommendation, usable band 2-4. At N=16 it gives 58 local
// optima among 65,536 genotypes, top-three basins holding 29%, and a population
// run ending on 4.0 distinct peaks with the dominant one at 87% — "one common
// form plus a few odd rare ones".
//
// Do NOT raise K as the genome grows. Bench 2's argmax across N = 10..20 is
// 4, 3, 2, 3, 3, 3 — a small constant. Genome size is safe to grow; K is not.
//
// This K is NOT the regulatory-network K (2, stage 2). Different models,
// different quantities; the numbers must never be pooled.
// ─────────────────────────────────────────────────────────────────────────────

export const RUGGEDNESS_K = 3;

/** What a place offers: what minerals are present, and how much light. */
export interface Niche {
  minerals: MineralVec;
  light: number; // 0 = deep shade, 1 = open sun
}

// Traits are scored in a fixed order so the epistasis wiring is stable.
const TRAITS: readonly NumericTrait[] = NUMERIC_TRAITS;
const N = TRAITS.length;

/** Normalise a trait to [0,1] using its declared bounds. */
function norm(g: Genome, t: NumericTrait): number {
  const [lo, hi] = GENOME_BOUNDS[t];
  const v = (g[t] - lo) / (hi - lo);
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class FitnessLandscape {
  // partners[i] = the k trait indices trait i's contribution also depends on.
  private readonly partners: Uint8Array;
  private readonly k: number;

  // `k` defaults to RUGGEDNESS_K and is injectable only so tests can compare
  // ruggedness levels directly; every shipped landscape uses the default via
  // landscapeFor. Do not call this constructor with a non-default k outside tests.
  constructor(private readonly seed: number, k: number = RUGGEDNESS_K) {
    this.k = k;
    this.partners = new Uint8Array(N * this.k);
    for (let i = 0; i < N; i++) {
      // Deterministic, distinct partners: walk forward by seeded strides,
      // skipping i itself. Fixed wiring per island.
      let picked = 0;
      let probe = 1;
      while (picked < this.k && probe < N * 4) {
        const j = (i + 1 + Math.floor(hash2d(i, probe, seed) * (N - 1))) % N;
        let dup = j === i;
        for (let q = 0; q < picked; q++) if (this.partners[i * this.k + q] === j) dup = true;
        if (!dup) this.partners[i * this.k + picked++] = j;
        probe++;
      }
      // Degenerate fallback for tiny genomes: pad with the next index along.
      while (picked < this.k) this.partners[i * this.k + picked++] = (i + 1) % N;
    }
  }

  /**
   * What this genome needs from the ground: six demands, each >= 0. Derived
   * from the genome so a bigger, showier plant costs more, and so which
   * minerals it wants depends on which traits it invests in.
   */
  demandOf(g: Genome): MineralVec {
    const out = new Float32Array(MINERAL_COUNT);
    for (let i = 0; i < N; i++) {
      const v = norm(g, TRAITS[i]);
      out[i % MINERAL_COUNT] += v / Math.ceil(N / MINERAL_COUNT);
    }
    for (let m = 0; m < MINERAL_COUNT; m++) if (out[m] > 1) out[m] = 1;
    return out;
  }

  /**
   * Fitness in [0, 1]: the mean of N per-trait contributions, each a function
   * of the trait, its K partners, and what the niche supplies.
   */
  score(g: Genome, niche: Niche): number {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      // Quantise the trait and its partners into a lookup coordinate. 8 levels
      // per trait keeps the table implicit (hashed) rather than allocated.
      let coord = Math.min(7, Math.floor(norm(g, TRAITS[i]) * 8));
      for (let k = 0; k < this.k; k++) {
        const j = this.partners[i * this.k + k];
        coord = coord * 8 + Math.min(7, Math.floor(norm(g, TRAITS[j]) * 8));
      }
      // The landscape value for this trait-and-partners combination.
      const base = hash2d(i, coord, this.seed);
      // What the ground actually supplies for the mineral this trait draws on,
      // and whether the light suits it. A trait scoring well on a landscape it
      // cannot afford does not count.
      const supply = niche.minerals[i % MINERAL_COUNT];
      const want = norm(g, TRAITS[i]);
      const afford = supply >= want * 0.9 ? 1 : supply / Math.max(1e-6, want * 0.9);
      sum += base * (0.35 + 0.65 * afford);
    }
    const mean = sum / N;
    // Light modulates the whole plant, not one trait: tall plants want sun,
    // low ones tolerate shade. Bounded so light alone never decides fitness.
    const wantsLight = norm(g, "height");
    const lightFit = 1 - Math.abs(niche.light - wantsLight) * 0.5;
    const f = mean * (0.7 + 0.3 * lightFit);
    return f < 0 ? 0 : f > 1 ? 1 : f;
  }
}

export function landscapeFor(seed: number): FitnessLandscape {
  return new FitnessLandscape(seed ^ 0x4e4b3300);
}

/**
 * Test-only: build a landscape at an explicit ruggedness k, bypassing
 * RUGGEDNESS_K. Used to compare K=3 against K=0 and pin the claim that the
 * NK wiring, not the mineral/light terms alone, produces the multi-peak
 * behavior. Never call from shipped island generation — use landscapeFor.
 */
export function landscapeForK(seed: number, k: number): FitnessLandscape {
  return new FitnessLandscape(seed ^ 0x4e4b3300, k);
}
