import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { resemblance } from "../src/life/idmap";
import {
  makeFlower, makeSwarm, feedSwarm, applyPredation, mutateBehavior, divergeSwarm,
} from "../src/life/swarm";

test("mutateBehavior stays in 0..1 and shifts the genes", () => {
  const m = mutateBehavior({ range: 0.5, nerve: 0.5, cohesion: 0.5 }, makeRng(500), 0.3);
  for (const k of ["range", "nerve", "cohesion"] as const) {
    expect(m[k]).toBeGreaterThanOrEqual(0);
    expect(m[k]).toBeLessThanOrEqual(1);
  }
  const hi = mutateBehavior({ range: 1, nerve: 1, cohesion: 1 }, makeRng(501), 0.5);
  expect(hi.nerve).toBeLessThanOrEqual(1); // clamps, never escapes
});

test("a bold swarm feeds harder than a skittish one (same sensor)", () => {
  const bold = makeSwarm(makeRng(503)); bold.sensor = makeFlower(makeRng(502), 6).map.slice(); bold.behavior.nerve = 1;
  const shy = makeSwarm(makeRng(504)); shy.sensor = makeFlower(makeRng(502), 6).map.slice(); shy.behavior.nerve = 0;
  const fa = makeFlower(makeRng(502), 6);
  const fb = makeFlower(makeRng(502), 6); // identical flower, full nectar
  expect(feedSwarm(bold, fa)).toBeGreaterThan(feedSwarm(shy, fb));
});

test("a skittish swarm loses less to predators than a bold one (same exposure)", () => {
  const flower = makeFlower(makeRng(505), 6);
  const bold = makeSwarm(makeRng(506)); bold.sensor = new Uint8Array(flower.map.length); bold.population = 50; bold.behavior.nerve = 1;
  const shy = makeSwarm(makeRng(507)); shy.sensor = new Uint8Array(flower.map.length); shy.population = 50; shy.behavior.nerve = 0;
  applyPredation(bold, flower, 1);
  applyPredation(shy, flower, 1);
  expect(shy.population).toBeGreaterThan(bold.population);
});

test("a bimodal pool diverges into a cousin; a unimodal pool does not", () => {
  const A = makeFlower(makeRng(508), 6);
  const B = makeFlower(makeRng(509), 6);
  const sw = makeSwarm(makeRng(510));
  sw.pool = [A.map, A.map, A.map, A.map, A.map, B.map, B.map, B.map, B.map, B.map].map((m) => m.slice());
  sw.population = 100;
  const child = divergeSwarm(sw, A, B, makeRng(511));
  expect(child).not.toBeNull();
  expect(resemblance(child!.sensor, B.map)).toBeGreaterThan(resemblance(child!.sensor, A.map));
  expect(resemblance(sw.sensor, A.map)).toBeGreaterThan(resemblance(sw.sensor, B.map));
  expect(sw.population).toBeCloseTo(60, 5);
  expect(child!.population).toBeCloseTo(40, 5);

  const uni = makeSwarm(makeRng(512));
  uni.pool = Array.from({ length: 10 }, () => A.map.slice());
  expect(divergeSwarm(uni, A, B, makeRng(513))).toBeNull();
});
