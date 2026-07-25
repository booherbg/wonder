// The bench's readouts, derived from state the sim already computes.
//
// PURE: no DOM, no rng, no wall clock, and nothing here is ever fed back into
// the sim. These are measurements, not inputs — the instrument's dial, not its
// hand on the tiller.
//
// The arithmetic deliberately MIRRORS swarms.ts tick(). tests/sim-telemetry
// imports the same constants rather than restating their values, so if the sim
// changes and this does not, the mirror breaks loudly.

import { FEED_VALUE, LIVING_COST } from "../life/swarm";
import { POLLINATE_CHANCE, POLLINATE_MATCH_MIN } from "./swarms";

export interface SpreadOdds {
  /** Probability of a spread ATTEMPT per heartbeat. */
  perTick: number;
  /** 1 / perTick — expected heartbeats between attempts, or null if never. */
  expectedTicks: number | null;
  /** Whether the match clears POLLINATE_MATCH_MIN at all. */
  canSpread: boolean;
}

/**
 * How often this cloud tries to pollinate its host.
 *
 * swarms.ts: `if (match >= POLLINATE_MATCH_MIN)` then
 * `rng() < POLLINATE_CHANCE * match * match * fill`, where fill = population/cap.
 *
 * `expectedTicks` is the wait between ATTEMPTS. A spread also needs
 * flora.pollinateSpread to find room, and an island-wide per-tick cap applies,
 * so the real interval is this or longer — a readout should say "≈" and never
 * promise. `canSpread: false` is the single most useful thing the bench can
 * tell you: this pairing will never produce a seed, no matter how long you run.
 */
export function spreadOdds(match: number, population: number, cap: number): SpreadOdds {
  const canSpread = match >= POLLINATE_MATCH_MIN;
  if (!canSpread || cap <= 0 || population <= 0) {
    return { perTick: 0, expectedTicks: null, canSpread };
  }
  const fill = population / cap;
  const perTick = POLLINATE_CHANCE * match * match * fill;
  return { perTick, expectedTicks: perTick > 0 ? 1 / perTick : null, canSpread };
}

export interface EnergyBudget {
  /** Energy gained per heartbeat at the current nectar level and match. */
  intake: number;
  /** LIVING_COST × population — what the cloud burns simply existing. */
  burn: number;
  net: number;
}

/** What the cloud earns against what it costs to stay alive. */
export function energyBudget(
  population: number,
  cap: number,
  match: number,
  nectar: number,
): EnergyBudget {
  void cap; // present for symmetry with spreadOdds; the burn is per-head, not per-fill
  const intake = Math.max(0, nectar) * FEED_VALUE * Math.max(0, match);
  const burn = LIVING_COST * Math.max(0, population);
  return { intake, burn, net: intake - burn };
}

export interface NectarEconomy {
  level: number; // 0..1 now
  refillTicks: number; // heartbeats from empty to full at `regen`
  drainPerTick: number;
  sustainable: boolean; // regen keeps up with the draw
}

/** The flower's side of the trade: what it makes against what is taken. */
export function nectarEconomy(
  nectar: number,
  regen: number,
  draw: number,
  visitsPerTick: number,
): NectarEconomy {
  const drainPerTick = Math.max(0, draw) * Math.max(0, visitsPerTick);
  return {
    level: nectar,
    refillTicks: regen > 0 ? 1 / regen : Infinity,
    drainPerTick,
    sustainable: regen >= drainPerTick,
  };
}

/** A terse readout of the wait, in the bench's register. */
export function spreadEtaWord(odds: SpreadOdds, match: number): string {
  if (!odds.canSpread) return `never · match ${match.toFixed(2)} < ${POLLINATE_MATCH_MIN.toFixed(2)}`;
  if (odds.expectedTicks === null) return "never · empty cloud";
  return `≈ ${Math.round(odds.expectedTicks)} ticks`;
}
