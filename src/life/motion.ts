import { hash2d } from "../core/rng";

// ─────────────────────────────────────────────────────────────────────────────
// Motion signature — how a species moves, derived from its seed rather than
// hand-animated.
//
// Bench 11 measured motion separability at 89.1% against a 12.5% chance level
// (eight genomes drawn uniformly at random, 24 ten-second flights each, twelve
// features), and put motion ahead of colour below 8.5px of sprite size:
//
//   sprite size   2px    5px     14px
//   motion        51%    88.9%   99%
//   colour        24%    58.3%   100%
//
// So at gameplay zoom a critter is identified by its gait, and colour only
// takes over on leaning in. The crossing point moved between 5.2 and 11.2px
// across the bench's sweep, so the Hollow's default zoom must be checked
// against it rather than assumed.
// ─────────────────────────────────────────────────────────────────────────────

export interface Gait {
  period: number; // ms for one full cycle
  amplitude: number; // art px of lateral sway
  pauseFraction: number; // 0..0.6 of each cycle spent still
  drift: number; // art px of slow vertical wander
  bobPhase: number; // 0..1 offset between the lateral and vertical components
  darting: number; // 0 = smooth, 1 = sharp starts and stops
}

export function gaitFor(speciesSeed: number): Gait {
  const h = (k: number) => hash2d(speciesSeed, k, 0x9017104);
  return {
    period: 700 + h(1) * 2600,
    amplitude: 0.6 + h(2) * 2.6,
    pauseFraction: h(3) * 0.6,
    drift: h(4) * 1.6,
    bobPhase: h(5),
    darting: h(6),
  };
}

/** The twelve-feature description bench 11 classified on. */
export function gaitFeatures(g: Gait): number[] {
  return [
    g.period / 3300,
    g.amplitude / 3.2,
    g.pauseFraction,
    g.drift / 1.6,
    g.bobPhase,
    g.darting,
    g.amplitude / Math.max(1, g.period / 1000), // sway per second
    g.pauseFraction * g.darting, // stop-and-start sharpness
    Math.sin(g.bobPhase * Math.PI * 2),
    Math.cos(g.bobPhase * Math.PI * 2),
    g.drift / Math.max(0.1, g.amplitude), // vertical-to-lateral ratio
    1 - g.pauseFraction, // duty cycle
  ];
}

/**
 * Where this individual sits relative to its base position, in art px.
 * `phase` in [0,1) decorrelates individuals of one species so a group does
 * not move as a block.
 */
export function motionOffset(g: Gait, tMs: number, phase: number): { dx: number; dy: number } {
  const cycle = (((tMs / g.period + phase) % 1) + 1) % 1;
  // The pause sits at the head of each cycle; motion occupies the remainder.
  if (cycle < g.pauseFraction) return { dx: 0, dy: 0 };
  const run = (cycle - g.pauseFraction) / (1 - g.pauseFraction);
  // Darting species ease sharply; smooth ones ride a plain sine.
  const eased =
    g.darting > 0.5
      ? Math.sign(Math.sin(run * Math.PI * 2)) * Math.abs(Math.sin(run * Math.PI * 2)) ** (1 - g.darting * 0.7)
      : Math.sin(run * Math.PI * 2);
  const dx = eased * g.amplitude;
  const dy = Math.sin((run + g.bobPhase) * Math.PI * 2) * g.drift;
  return { dx: clamp4(dx), dy: clamp4(dy) };
}

function clamp4(v: number): number {
  return v < -4 ? -4 : v > 4 ? 4 : v;
}
