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
