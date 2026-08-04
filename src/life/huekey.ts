import { hash2d } from "../core/rng";
import { PlantSpecies } from "./species";

// ─────────────────────────────────────────────────────────────────────────────
// The Hollow's palette key: grounded split-complementary at bias 0.70.
//
// Bench 10's recommendation, and the only setting in its sweep where every
// measure improved at once over 14 islands per configuration: scene discord
// 26.1% -> 19.5%, flora discord 23.5% -> 18.8%, island difference
// 0.302 -> 0.380, character spread 10.4 -> 11.2 degrees.
//
// Two of that bench's findings decide the details here:
//
//   Grounding beats the choice of key. A key touching only the flora barely
//   moves the scene number — the plants agree with each other and go on
//   disagreeing with the dirt. Anchoring one hue to the terrain green took
//   grounded tetradic to 9.6% flora discord, a 63% reduction.
//
//   Split-complementary despite not scoring best, because tetradic and triadic
//   offsets are closed under their own rotation: grounding those yields ONE
//   identical anchor set for every island in the game, and the island
//   difference statistic is blind to that. 0/150/210 are not rotation
//   symmetric, so grounding still produces distinct chords per island.
//
// Bias 0.70 rather than 1.0 is arithmetic about arc width. groundHue pulls
// linearly toward the nearest anchor, so the reachable fraction of the wheel
// is (1 - bias): measured over 360 one-degree samples, bias 0.70 reaches
// 111/360 = 30.8%, bias 1.0 reaches 1/360 = 0.3% (it collapses every hue onto
// one of the three anchors). Variety improves under the constraint rather
// than suffering — island difference rises 0.302 -> 0.514, because an
// unbiased island has no character to differ in.
//
// This module applies ONLY to the Hollow. The classic island's colours are
// untouched, which is what keeps the byte-identical guarantee whole.
// ─────────────────────────────────────────────────────────────────────────────

/** Degrees around the wheel. Not rotation-symmetric — that is the point. */
export const SPLIT_COMPLEMENTARY_OFFSETS = [0, 150, 210] as const;

/** How hard a hue is pulled toward its anchor. 0.70 keeps 30.8% of the wheel reachable (see below), against 0.3% at 1.0. */
export const HUE_BIAS = 0.7;

/** The hue of PALETTE.grassBase (#68a557) — what "grounded" anchors to. */
export const TERRAIN_GREEN_HUE = 0.286;

/** Distance between two hues around the wheel, 0..0.5. */
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 1;
  return d > 0.5 ? 1 - d : d;
}

/**
 * Three anchor hues for an island. One is always the terrain green — that is
 * the grounding — and the chord is rotated per island so islands differ.
 */
export function hueKeyFor(seed: number): number[] {
  // Which of the three offsets lands on the ground colour varies per island,
  // which is what makes grounding produce distinct chords rather than one.
  const rootIndex = Math.floor(hash2d(seed, 1, 0x68a557) * 3) % 3;
  const root = TERRAIN_GREEN_HUE - SPLIT_COMPLEMENTARY_OFFSETS[rootIndex] / 360;
  return SPLIT_COMPLEMENTARY_OFFSETS.map((deg) => {
    const h = root + deg / 360;
    return ((h % 1) + 1) % 1;
  });
}

/** Pull a hue toward its nearest anchor by `bias` of the remaining distance. */
export function groundHue(hue: number, anchors: number[], bias: number): number {
  let best = anchors[0];
  let bestGap = hueGap(hue, anchors[0]);
  for (const a of anchors) {
    const g = hueGap(hue, a);
    if (g < bestGap) {
      best = a;
      bestGap = g;
    }
  }
  // Move along the short way around the wheel.
  let delta = best - hue;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  const moved = hue + delta * bias;
  return ((moved % 1) + 1) % 1;
}

/**
 * Roll the Hollow's species onto its key. Returns a new array; the input is
 * left alone so a caller can compare keyed against unkeyed.
 */
export function applyHueKey(species: PlantSpecies[], seed: number): PlantSpecies[] {
  const anchors = hueKeyFor(seed);
  return species.map((sp) => ({
    ...sp,
    archetype: {
      ...sp.archetype,
      hue: groundHue(sp.archetype.hue, anchors, HUE_BIAS),
      // The accent rides the key too, at half strength, so a flower's core
      // stays distinguishable from its petals rather than collapsing onto it.
      hue2: groundHue(sp.archetype.hue2, anchors, HUE_BIAS * 0.5),
    },
  }));
}
