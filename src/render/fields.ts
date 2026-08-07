// ─────────────────────────────────────────────────────────────────────────────
// Field washes: how an invisible per-tile number is turned into a colour.
//
// TERMS, before they are used below.
//
//   field       A function (tx, ty) -> number defined on every tile of the
//               island. Two are drawn today: the canopy LIGHT field, in [0, 1],
//               and the MINERAL TOTAL field, the sum of six mineral quantities
//               each in [0, 1], so in [0, 6].
//   ladder      The pair {lo, hi} of the smallest and largest value the field
//               takes anywhere on this island. Every colour below is chosen
//               from `(v - lo) / (hi - lo)`, not from `v` itself.
//   wash        The translucent per-tile fill the renderer draws from a ladder.
//
// WHY A PER-ISLAND LADDER RATHER THAN THE FIELD'S DECLARED RANGE. The canopy
// light field is measured at standard deviation 0.05-0.12 against a declared
// range of 0.27-0.9 (docs/03-ECOLOGY-DESIGN-SPACE.md §12.3). Drawn against
// [0, 1] the whole island would be one flat tone and the structure that is
// there would be invisible. Rescaling to the island's own {lo, hi} spends the
// full value ramp on the variation that exists. The cost is that two islands'
// washes are not comparable to each other, which is why `ladderCaption` prints
// the endpoints: the legend always says what the two ends of the ramp are
// worth.
//
// WHY VALUE CARRIES THE QUANTITY AND HUE ONLY NAMES A CATEGORY. Bench 8 (the
// palette bench) found six categories cannot be separated by hue alone when the
// available hue spread is narrow, and that a per-world value ladder with hue
// riding on top is what stays readable. So: lightness = how much, hue = which
// mineral is largest here. Never the reverse.
// ─────────────────────────────────────────────────────────────────────────────

/** The smallest and largest value a field takes on this island. hi > lo always. */
export interface Ladder {
  lo: number;
  hi: number;
}

/**
 * Scan every tile once and return the field's {lo, hi} on this island. Called
 * when an overlay mode is entered, not per frame: 140 x 140 is 19,600 samples.
 *
 * `hi` is nudged above `lo` when the field is constant, so `rung` never divides
 * by zero — a constant field then draws as one flat mid tone, which is the
 * truthful picture of a field with no variation.
 */
export function ladderOf(
  width: number,
  height: number,
  sample: (tx: number, ty: number) => number,
): Ladder {
  let lo = Infinity;
  let hi = -Infinity;
  for (let ty = 0; ty < height; ty++) {
    for (let tx = 0; tx < width; tx++) {
      const v = sample(tx, ty);
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { lo: 0, hi: 1 };
  return hi - lo < 1e-6 ? { lo, hi: lo + 1e-6 } : { lo, hi };
}

/** Where `v` sits on the ladder: 0 at its darkest tile, 1 at its brightest. */
export function rung(v: number, l: Ladder): number {
  const t = (v - l.lo) / (l.hi - l.lo);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * The wash colour for one tile. `t` is a rung in [0, 1]; `hue` is a degree on
 * the colour wheel, or null for the neutral single-hue ramp the light field
 * uses. Lightness runs 9% at the darkest rung to 90% at the brightest, so the
 * ramp is read as value in both themes and over any terrain.
 */
export function washColor(t: number, hue: number | null, alpha: number): string {
  const light = 9 + t * 81;
  const h = hue ?? 48; // 48deg: daylight, for the light field's single-hue ramp
  const sat = hue === null ? 26 : 62;
  return `hsla(${h}, ${sat}%, ${light.toFixed(1)}%, ${alpha})`;
}

/**
 * The six minerals have no names in the model — `MineralField.sample` returns a
 * Float32Array of six unlabelled quantities — so the legend numbers them rather
 * than inventing lore the simulation does not carry.
 */
export const MINERAL_LABELS = [
  "mineral 1",
  "mineral 2",
  "mineral 3",
  "mineral 4",
  "mineral 5",
  "mineral 6",
] as const;

/**
 * One hue per mineral, 60 degrees apart. The full wheel is available here
 * because these hues are chosen, not rolled off a world's palette key — the
 * narrow-spread failure bench 8 recorded applies to generated palettes.
 */
export const MINERAL_HUES = [8, 46, 96, 176, 232, 300] as const;

/** Which mineral is largest on a tile, and how much of it there is. */
export function dominantMineral(v: ArrayLike<number>): { index: number; amount: number } {
  let index = 0;
  let amount = v[0] ?? 0;
  for (let m = 1; m < v.length; m++) {
    if (v[m] > amount) {
      amount = v[m];
      index = m;
    }
  }
  return { index, amount };
}

/** "0.31 dark → 0.88 bright" — what the two ends of the drawn ramp are worth. */
export function ladderCaption(l: Ladder, digits = 2): string {
  return `${l.lo.toFixed(digits)} dark → ${l.hi.toFixed(digits)} bright`;
}
