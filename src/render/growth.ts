// src/render/growth.ts

// A plant appearing at full size reads as placed; a plant easing up from a
// sprout reads as alive. The floor of 0.18 keeps a new sprout visible rather
// than a subpixel nothing, and the ease is smoothstep so growth is quickest in
// the middle of a plant's youth.
const SPROUT_FLOOR = 0.18;

export function growthScale(ageTicks: number, matureAge: number): number {
  if (matureAge <= 0) return 1;
  const t = ageTicks / matureAge;
  if (t >= 1) return 1;
  if (t <= 0) return SPROUT_FLOOR;
  const eased = t * t * (3 - 2 * t);
  return SPROUT_FLOOR + (1 - SPROUT_FLOOR) * eased;
}
