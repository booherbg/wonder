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
