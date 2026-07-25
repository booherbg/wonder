import { expect, test } from "vitest";
import { energyBudget, nectarEconomy, spreadOdds } from "../src/game/simTelemetry";
import { POLLINATE_CHANCE, POLLINATE_MATCH_MIN } from "../src/game/swarms";
import { LIVING_COST, NECTAR_REGEN } from "../src/life/swarm";

// These are MEASUREMENTS of the running sim, so they must mirror swarms.ts
// tick() exactly. The tests import the same constants rather than restating
// their values, so a change to the sim breaks the mirror loudly.

test("spreadOdds mirrors the sim's own per-heartbeat probability", () => {
  // swarms.ts tick(): rng() < POLLINATE_CHANCE * match * match * fill
  const match = 0.6, pop = 50, cap = 100;
  const expected = POLLINATE_CHANCE * match * match * (pop / cap);
  expect(spreadOdds(match, pop, cap).perTick).toBeCloseTo(expected, 10);
});

test("spreadOdds reports the expected wait as the reciprocal of the rate", () => {
  const out = spreadOdds(0.6, 50, 100);
  expect(out.expectedTicks).toBeCloseTo(1 / out.perTick, 6);
});

test("a match below the threshold can NEVER spread — the reading that matters most", () => {
  const out = spreadOdds(POLLINATE_MATCH_MIN - 0.01, 100, 100);
  expect(out.canSpread).toBe(false);
  expect(out.perTick).toBe(0);
  expect(out.expectedTicks).toBeNull();
});

test("a match exactly at the threshold can spread", () => {
  expect(spreadOdds(POLLINATE_MATCH_MIN, 100, 100).canSpread).toBe(true);
});

test("an empty swarm has no odds, and a zero cap never divides", () => {
  expect(spreadOdds(0.9, 0, 100).expectedTicks).toBeNull();
  expect(() => spreadOdds(0.9, 10, 0)).not.toThrow();
  expect(spreadOdds(0.9, 10, 0).expectedTicks).toBeNull();
});

test("a fuller swarm spreads more often than a sparse one at the same match", () => {
  expect(spreadOdds(0.6, 90, 100).perTick).toBeGreaterThan(spreadOdds(0.6, 20, 100).perTick);
});

test("energyBudget nets intake against the cost of simply living", () => {
  const out = energyBudget(50, 100, 0.5, 0.8);
  expect(out.burn).toBeCloseTo(LIVING_COST * 50, 10);
  expect(out.net).toBeCloseTo(out.intake - out.burn, 10);
});

test("a big swarm on a dry flower runs at a loss", () => {
  expect(energyBudget(100, 100, 0.9, 0).net).toBeLessThan(0);
});

test("a small well-matched swarm on a full flower runs at a profit", () => {
  expect(energyBudget(5, 100, 0.9, 1).net).toBeGreaterThan(0);
});

test("nectarEconomy knows whether regen keeps up with the draw", () => {
  expect(nectarEconomy(0.5, NECTAR_REGEN, 0.25, 0.1).sustainable).toBe(true);
  expect(nectarEconomy(0.5, NECTAR_REGEN, 0.25, 1).sustainable).toBe(false);
});

test("nectarEconomy reports how long a drained flower needs to refill", () => {
  expect(nectarEconomy(0, 0.05, 0.25, 0).refillTicks).toBeCloseTo(20, 6);
});

test("nectarEconomy never divides by a zero regen", () => {
  expect(nectarEconomy(0.5, 0, 0.25, 0).refillTicks).toBe(Infinity);
});
