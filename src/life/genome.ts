import { Rng } from "../core/rng";

export enum PlantForm {
  Flower = 0,
  Shrub = 1,
  Tree = 2,
  Fungus = 3,
  Fern = 4,
  Coral = 5, // shallow-water branching colonies; polyps carry the glow
  Succulent = 6, // plump rosettes for the dry places; blooms are an event
}

// Every numeric trait a plant carries. `form` is structural and never mutates;
// everything else drifts generation by generation.
export interface Genome {
  form: PlantForm;
  hue: number; // 0..1 around the color wheel (wraps when mutating)
  hue2: number; // accent hue (petals' core, berries, cap spots) — wraps
  sat: number; // color saturation
  height: number; // 0..1 → pixel height within the form's range
  spread: number; // 0..1 width/bushiness
  petals: number; // petal count for flowers, berry count for shrubs, spot count for fungi
  leaves: number; // leaf pairs along the stem
  lean: number; // -1..1 stem tilt
  glow: number; // > 0.8 = luminous accents (the psychedelic tail)
}

export type NumericTrait = Exclude<keyof Genome, "form">;

export const GENOME_BOUNDS: Record<NumericTrait, readonly [number, number]> = {
  hue: [0, 1],
  hue2: [0, 1],
  sat: [0.3, 1],
  height: [0.05, 1],
  spread: [0.1, 1],
  petals: [3, 10],
  leaves: [0, 4],
  lean: [-1, 1],
  glow: [0, 1],
};

export const NUMERIC_TRAITS = Object.keys(GENOME_BOUNDS) as NumericTrait[];

// hues wrap around the color wheel instead of pinning at the bounds
const WRAP_TRAITS: ReadonlySet<NumericTrait> = new Set(["hue", "hue2"]);

export function clampTrait(key: NumericTrait, v: number): number {
  const [lo, hi] = GENOME_BOUNDS[key];
  if (WRAP_TRAITS.has(key)) {
    const span = hi - lo;
    return ((((v - lo) % span) + span) % span) + lo;
  }
  return Math.min(hi, Math.max(lo, v));
}

// One generation of drift: every numeric trait jitters a little.
export function mutate(g: Genome, rng: Rng, amount = 0.05): Genome {
  const out: Genome = { ...g };
  for (const key of NUMERIC_TRAITS) {
    const [lo, hi] = GENOME_BOUNDS[key];
    const jitter = (rng() * 2 - 1) * amount * (hi - lo);
    out[key] = clampTrait(key, g[key] + jitter);
  }
  return out;
}

// Two parents make a child: traits meet in the middle (hues along the
// shorter arc of the color wheel), plus a small jitter of drift.
export function cross(a: Genome, b: Genome, rng: Rng, amount = 0.04): Genome {
  const out: Genome = { ...a };
  for (const key of NUMERIC_TRAITS) {
    const [lo, hi] = GENOME_BOUNDS[key];
    const span = hi - lo;
    let mid: number;
    if (WRAP_TRAITS.has(key)) {
      const ta = (a[key] - lo) / span;
      const tb = (b[key] - lo) / span;
      const d = ((tb - ta + 1.5) % 1) - 0.5;
      mid = lo + ((((ta + d / 2) % 1) + 1) % 1) * span;
    } else {
      mid = (a[key] + b[key]) / 2;
    }
    const jitter = (rng() * 2 - 1) * amount * span;
    out[key] = clampTrait(key, mid + jitter);
  }
  return out;
}

// Normalized distance between genomes in trait space, 0 = identical, ~1 = far.
export function driftDistance(a: Genome, b: Genome): number {
  let sum = 0;
  for (const key of NUMERIC_TRAITS) {
    const [lo, hi] = GENOME_BOUNDS[key];
    const span = hi - lo;
    let d = Math.abs(a[key] - b[key]) / span;
    if (WRAP_TRAITS.has(key)) d = Math.min(d, 1 - d) * 2;
    sum += d * d;
  }
  return Math.sqrt(sum / NUMERIC_TRAITS.length);
}

// Quantized cache key: genomes that would render identically share a key.
export function phenoKey(g: Genome): string {
  return [
    g.form,
    Math.round(g.hue * 24) % 24,
    Math.round(g.hue2 * 12) % 12,
    Math.round(g.sat * 6),
    Math.round(g.height * 8),
    Math.round(g.spread * 6),
    Math.round(g.petals),
    Math.round(g.leaves),
    Math.round(g.lean * 3),
    g.glow > 0.8 ? 1 : 0,
  ].join("-");
}

export function hsl(h: number, s: number, l: number): string {
  return `hsl(${Math.round(((h % 1) + 1) % 1 * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}
