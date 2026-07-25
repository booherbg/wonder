import { expect, test } from "vitest";
import { RING_HORIZON_TICKS, workingReadings } from "../src/render/working";
import { POLLINATE_MATCH_MIN } from "../src/game/swarms";

const swarm = (over: Record<string, unknown> = {}) =>
  ({
    x: 10,
    y: 20,
    sw: { population: 50, cap: 100, energy: 0.6 },
    home: { x: 12, y: 22, species: 1 },
    motes: [{ phase: "inbound" }, { phase: "orbit" }, { phase: "inbound" }, { phase: "visit" }],
    ...over,
  }) as never;

const flower = (nectar = 0.5) => () => ({ nectar }) as never;

test("counts only the motes carrying pollen home", () => {
  const [r] = workingReadings([swarm()], flower(), () => 0.6);
  expect(r.carrying).toBe(2); // two inbound; orbit and visit do not carry
});

test("reads hunger straight off the metabolic reserve", () => {
  const [r] = workingReadings([swarm()], flower(), () => 0.6);
  expect(r.hunger).toBeCloseTo(0.4, 6); // energy 0.6 -> hunger 0.4
});

test("a starving cloud reads full hunger, a fed one none", () => {
  const [a] = workingReadings([swarm({ sw: { population: 5, cap: 100, energy: 0 } })], flower(), () => 0.6);
  const [b] = workingReadings([swarm({ sw: { population: 5, cap: 100, energy: 1 } })], flower(), () => 0.6);
  expect(a.hunger).toBe(1);
  expect(b.hunger).toBe(0);
});

test("a below-threshold match cannot spread and its ring stays empty", () => {
  const [r] = workingReadings([swarm()], flower(), () => POLLINATE_MATCH_MIN - 0.01);
  expect(r.canSpread).toBe(false);
  expect(r.ringFill).toBe(0);
});

test("a better-matched pairing fills more of the ring than a marginal one", () => {
  const [good] = workingReadings([swarm()], flower(), () => 0.95);
  const [poor] = workingReadings([swarm()], flower(), () => 0.35);
  expect(good.ringFill).toBeGreaterThan(poor.ringFill);
  expect(good.ringFill).toBeLessThanOrEqual(1);
  expect(poor.ringFill).toBeGreaterThanOrEqual(0);
});

test("the ring is clamped to 0..1 however fast the pairing spreads", () => {
  const [r] = workingReadings(
    [swarm({ sw: { population: 100, cap: 100, energy: 1 } })],
    flower(),
    () => 1,
  );
  expect(r.ringFill).toBeGreaterThan(0);
  expect(r.ringFill).toBeLessThanOrEqual(1);
  expect(RING_HORIZON_TICKS).toBeGreaterThan(0);
});

test("a homeless cloud is skipped — nothing to draw a host arc against", () => {
  expect(workingReadings([swarm({ home: null })], () => null, () => 0.6)).toEqual([]);
});

test("a cloud whose host species has no flower map is skipped", () => {
  expect(workingReadings([swarm()], () => null, () => 0.6)).toEqual([]);
});

test("carries the host position and nectar through for the bloom arc", () => {
  const [r] = workingReadings([swarm()], flower(0.25), () => 0.6);
  expect(r.hostX).toBe(12);
  expect(r.hostY).toBe(22);
  expect(r.hostNectar).toBeCloseTo(0.25, 6);
});

test("nectar is clamped to 0..1 even if the sim hands over something odd", () => {
  const [hi] = workingReadings([swarm()], flower(9), () => 0.6);
  const [lo] = workingReadings([swarm()], flower(-3), () => 0.6);
  expect(hi.hostNectar).toBe(1);
  expect(lo.hostNectar).toBe(0);
});
