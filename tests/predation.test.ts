import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import {
  makeFlower, makeSwarm, stepSwarm, conspicuousness, applyPredation,
} from "../src/life/swarm";

test("conspicuousness is high for a mismatched swarm, low for a camouflaged one", () => {
  const flower = makeFlower(makeRng(400), 6);
  const matched = makeSwarm(makeRng(401)); matched.sensor = flower.map.slice();
  const exposed = makeSwarm(makeRng(402)); exposed.sensor = new Uint8Array(flower.map.length);
  expect(conspicuousness(matched, flower)).toBeLessThan(0.1);
  expect(conspicuousness(exposed, flower)).toBeGreaterThan(0.9);
});

test("predation thins an exposed swarm but spares a camouflaged one", () => {
  const flower = makeFlower(makeRng(403), 6);
  const matched = makeSwarm(makeRng(404)); matched.sensor = flower.map.slice(); matched.population = 50;
  const exposed = makeSwarm(makeRng(405)); exposed.sensor = new Uint8Array(flower.map.length); exposed.population = 50;
  applyPredation(matched, flower, 1);
  applyPredation(exposed, flower, 1);
  expect(exposed.population).toBeLessThan(matched.population);
  expect(matched.population).toBeGreaterThan(49); // near-fully spared
});

test("under constant predation a swarm adapts toward camouflage and is not wiped out", () => {
  const rng = makeRng(406);
  const flower = makeFlower(makeRng(407), 6);
  const sw = makeSwarm(makeRng(408)); sw.population = 30; sw.energy = 0.5;
  const startCon = conspicuousness(sw, flower);
  for (let t = 0; t < 600; t++) stepSwarm(sw, flower, rng, 1); // full pressure the whole run
  expect(sw.population).toBeGreaterThan(1); // survives by adapting, never wiped
  expect(conspicuousness(sw, flower)).toBeLessThan(startCon); // became more camouflaged
});

test("a swarm under heavy predation stays smaller than the same swarm with none", () => {
  const flowerA = makeFlower(makeRng(409), 6);
  const flowerB = makeFlower(makeRng(409), 6); // same seed → identical flower
  const hunted = makeSwarm(makeRng(410)); hunted.population = 40; hunted.energy = 0.5;
  const safe = makeSwarm(makeRng(410)); safe.population = 40; safe.energy = 0.5; // identical start
  for (let t = 0; t < 120; t++) { stepSwarm(hunted, flowerA, makeRng(411), 1); stepSwarm(safe, flowerB, makeRng(411), 0); }
  expect(hunted.population).toBeLessThan(safe.population);
});
