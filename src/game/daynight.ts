import { hash2d } from "../core/rng";

// A slow, gentle day: ~4 minutes of light, a real night you can wait out.
// Darkness is 0 all day, eases up through dusk, holds at MAX_DARKNESS
// through the night, and eases back down at dawn.

export const DAY_MS = 240_000;
export const DUSK_MS = 40_000;
export const NIGHT_MS = 120_000;
export const DAWN_MS = 40_000;
export const CYCLE_MS = DAY_MS + DUSK_MS + NIGHT_MS + DAWN_MS;
export const MAX_DARKNESS = 0.75;

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function darknessAt(nowMs: number): number {
  const t = ((nowMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  if (t < DAY_MS) return 0;
  if (t < DAY_MS + DUSK_MS) return smooth((t - DAY_MS) / DUSK_MS) * MAX_DARKNESS;
  if (t < DAY_MS + DUSK_MS + NIGHT_MS) return MAX_DARKNESS;
  return (1 - smooth((t - DAY_MS - DUSK_MS - NIGHT_MS) / DAWN_MS)) * MAX_DARKNESS;
}

export function isNight(nowMs: number): boolean {
  return darknessAt(nowMs) > 0.6;
}

// The sky's colour cast for the hour — the golden hour the flat blue multiply
// never had. Dusk warms to gold and cools into the deep blue of night; night
// holds that blue; dawn lifts through a rosy glow back to clear day. Returns the
// overlay colour + its alpha (0 by day); the renderer lays it over the scene.
export interface SkyGrade {
  r: number;
  g: number;
  b: number;
  a: number;
}

const NIGHT_BLUE: readonly [number, number, number] = [8, 14, 34];
const DUSK_GOLD: readonly [number, number, number] = [238, 126, 44]; // low warm sun
const DAWN_ROSE: readonly [number, number, number] = [220, 130, 140]; // soft coral dawn

function mix(
  c1: readonly [number, number, number],
  c2: readonly [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
  ];
}

export function skyGrade(nowMs: number): SkyGrade {
  const t = ((nowMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  const dk = darknessAt(nowMs);
  if (t < DAY_MS) return { r: 0, g: 0, b: 0, a: 0 }; // clear day, no cast
  if (t < DAY_MS + DUSK_MS) {
    // dusk: a golden hour that holds warm, then cools into night-blue
    const d = (t - DAY_MS) / DUSK_MS;
    const [r, g, b] = mix(DUSK_GOLD, NIGHT_BLUE, smooth(Math.max(0, (d - 0.32) / 0.68)));
    const golden = 0.42 * Math.sin(Math.PI * d); // peaks mid-dusk
    return { r, g, b, a: Math.max(dk * 0.62, golden) };
  }
  const nightStart = DAY_MS + DUSK_MS;
  if (t < nightStart + NIGHT_MS) {
    return { r: NIGHT_BLUE[0], g: NIGHT_BLUE[1], b: NIGHT_BLUE[2], a: dk * 0.62 };
  }
  // dawn: night-blue lifting through a rosy glow to the clear day
  const d = (t - nightStart - NIGHT_MS) / DAWN_MS;
  const [r, g, b] = mix(NIGHT_BLUE, DAWN_ROSE, smooth(Math.min(1, d / 0.6)));
  const rosy = 0.38 * Math.sin(Math.PI * d); // peaks mid-dawn
  return { r, g, b, a: Math.max(dk * 0.62, rosy) };
}

// How long until the next daybreak — the top of the cycle, darkness zero.
export function msUntilDawn(nowMs: number): number {
  const t = ((nowMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  return CYCLE_MS - t;
}

// Roughly one night in three, the sea's edge lights up where it is stirred.
export function isBiolumeNight(nowMs: number, seed: number): boolean {
  const nightIndex = Math.floor(nowMs / CYCLE_MS);
  return hash2d(nightIndex, 7, seed) < 0.35;
}

// One night in twelve or so, ribbons of light cross the sky — rare enough
// that witnessing one is an event an island remembers.
export function isAuroraNight(nowMs: number, seed: number): boolean {
  const nightIndex = Math.floor(nowMs / CYCLE_MS);
  return hash2d(nightIndex, 11, seed) < 0.085;
}

// Rain: roughly three day-cycles in ten carry one shower, arriving at a
// seeded hour — it eases in, soaks, and eases off. Returns intensity 0..1.
export const RAIN_MS = 70_000;
const RAIN_CHANCE = 0.3;

export function rainAt(nowMs: number, seed: number): number {
  const cycle = Math.floor(nowMs / CYCLE_MS);
  if (hash2d(cycle, 3, seed) >= RAIN_CHANCE) return 0;
  const t = ((nowMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  const start = hash2d(cycle, 5, seed) * (CYCLE_MS - RAIN_MS);
  const f = (t - start) / RAIN_MS;
  if (f < 0 || f > 1) return 0;
  return Math.sin(f * Math.PI);
}

// Rain pays off later, not instantly: the day after a shower, the fungi
// answer. True through the whole cycle following a rainy one.
export function isBloomDay(nowMs: number, seed: number): boolean {
  const cycle = Math.floor(nowMs / CYCLE_MS);
  return hash2d(cycle - 1, 3, seed) < RAIN_CHANCE;
}
