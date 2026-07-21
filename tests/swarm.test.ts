import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { resemblance } from "../src/life/idmap";
import {
  makeFlower, makeSwarm, evolveSwarm, POOL_SIZE,
  regenNectar, feedSwarm, updatePopulation, stepSwarm, NECTAR_DRAW,
} from "../src/life/swarm";

test("a swarm adapts its sensor toward a flower over generations", () => {
  const rng = makeRng(100);
  const flower = makeFlower(makeRng(101), 6);
  const sw = makeSwarm(makeRng(102));
  const before = resemblance(sw.sensor, flower.map);
  for (let g = 0; g < 400; g++) evolveSwarm(sw, flower, rng);
  const after = resemblance(sw.sensor, flower.map);
  // clear adaptation: far above the ~0.14 random baseline (the flower accent is nailed
  // fast; the foliage fills in slowly). Not near-perfection — that isn't the point.
  expect(after).toBeGreaterThan(before + 0.3);
  expect(after).toBeGreaterThan(0.55);
});

test("the gene pool keeps its size across evolution", () => {
  const rng = makeRng(103);
  const flower = makeFlower(makeRng(104), 5);
  const sw = makeSwarm(makeRng(105));
  for (let g = 0; g < 10; g++) evolveSwarm(sw, flower, rng);
  expect(sw.pool.length).toBe(POOL_SIZE);
});

test("feeding depletes nectar and regen restores it (capped at 1)", () => {
  const flower = makeFlower(makeRng(200), 6);
  const sw = makeSwarm(makeRng(201));
  flower.nectar = 1;
  feedSwarm(sw, flower);
  expect(flower.nectar).toBeCloseTo(1 - NECTAR_DRAW, 5);
  for (let i = 0; i < 200; i++) regenNectar(flower);
  expect(flower.nectar).toBe(1);
});

test("a well-matched swarm gains more energy per feed than a mismatched one", () => {
  const flower = makeFlower(makeRng(202), 6);
  const good = makeSwarm(makeRng(203)); good.sensor = flower.map.slice();
  const bad = makeSwarm(makeRng(204)); bad.sensor = new Uint8Array(flower.map.length);
  flower.nectar = 1; const gGain = feedSwarm(good, flower);
  flower.nectar = 1; const bGain = feedSwarm(bad, flower);
  expect(gGain).toBeGreaterThan(bGain);
});

test("population grows when fed and shrinks when starved", () => {
  const sw = makeSwarm(makeRng(205)); sw.energy = 1; sw.population = 10;
  updatePopulation(sw);
  const grew = sw.population;
  expect(grew).toBeGreaterThan(10);
  sw.energy = 0;
  for (let i = 0; i < 50; i++) updatePopulation(sw);
  expect(sw.population).toBeLessThan(grew);
});

test("over a run, a swarm on a flower both adapts and grows its population", () => {
  const rng = makeRng(300);
  const flower = makeFlower(makeRng(301), 6);
  const sw = makeSwarm(makeRng(302));
  sw.population = 5; sw.energy = 0.3;
  const beforeMatch = resemblance(sw.sensor, flower.map);
  for (let t = 0; t < 500; t++) stepSwarm(sw, flower, rng);
  expect(resemblance(sw.sensor, flower.map)).toBeGreaterThan(beforeMatch);
  expect(resemblance(sw.sensor, flower.map)).toBeGreaterThan(0.6);
  expect(sw.population).toBeGreaterThan(5);
});

test("a swarm never exceeds its population cap", () => {
  const rng = makeRng(303);
  const flower = makeFlower(makeRng(304), 6);
  const sw = makeSwarm(makeRng(305));
  for (let t = 0; t < 500; t++) stepSwarm(sw, flower, rng);
  expect(sw.population).toBeLessThanOrEqual(sw.cap);
});
