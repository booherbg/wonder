import { Rng } from "../core/rng";
import { IdMap, randomSensorMap, makeFlowerSignature, mutateMap, matchReward, metabolicEfficiency } from "./idmap";

// The ecology entities. A Flower is a plant's identity map + a nectar meter. A
// Swarm is a single spatial cloud carrying a small internal gene pool (bookkeeping,
// not spatial agents) that evolves toward a flower. Feeding is an adaptive
// metabolism: pulsed by nectar, converted by match quality. Peaceful — population
// rises and falls, nothing dies as an event.

export const POOL_SIZE = 10; // internal gene pool per swarm
export const MUTATE_FLIPS = 3;
export const NECTAR_REGEN = 0.05; // per tick — a flower's productivity
export const NECTAR_DRAW = 0.25; // most an insect can take in one feed
export const FEED_VALUE = 4; // energy per unit nectar at full metabolic efficiency
export const LIVING_COST = 0.02; // energy burned per tick just living
export const SWARM_CAP = 100; // default population ceiling; per-swarm `cap` is the size lever

export interface Flower {
  map: IdMap; // full appearance signature (base + flower accent)
  accent: Uint8Array; // 1 where a cell is flower-accent (the jackpot)
  nectar: number; // 0..1 available now
}

export function makeFlower(rng: Rng, flowerSize: number): Flower {
  const { map, accent } = makeFlowerSignature(rng, flowerSize);
  return { map, accent, nectar: 1 };
}

export interface Swarm {
  pool: IdMap[]; // ~POOL_SIZE varied sensor maps
  sensor: IdMap; // the current best (representative body/appearance)
  population: number; // 0..cap
  energy: number; // 0..1 metabolic reserve
  cap: number; // the size lever — how large this swarm can grow
}

export function makeSwarm(rng: Rng, poolSize = POOL_SIZE, cap = SWARM_CAP): Swarm {
  const pool: IdMap[] = [];
  for (let i = 0; i < poolSize; i++) pool.push(randomSensorMap(rng));
  return { pool, sensor: pool[0], population: 10, energy: 0.5, cap };
}

/** One generation: score the pool against the flower, keep the top half, refill by mutation. */
export function evolveSwarm(sw: Swarm, flower: Flower, rng: Rng): void {
  sw.pool.sort((a, b) => matchReward(b, flower.map, flower.accent) - matchReward(a, flower.map, flower.accent));
  const keep = Math.max(1, Math.floor(sw.pool.length / 2));
  const survivors = sw.pool.slice(0, keep);
  const next = survivors.slice();
  while (next.length < sw.pool.length) next.push(mutateMap(survivors[Math.floor(rng() * survivors.length)], rng, MUTATE_FLIPS));
  sw.pool = next;
  sw.sensor = survivors[0];
}

export function regenNectar(flower: Flower): void {
  flower.nectar = Math.min(1, flower.nectar + NECTAR_REGEN);
}

/** Draw available nectar (capped) and convert it by the swarm's metabolic efficiency. */
export function feedSwarm(sw: Swarm, flower: Flower): number {
  const drawn = Math.min(flower.nectar, NECTAR_DRAW);
  flower.nectar -= drawn;
  const gain = drawn * metabolicEfficiency(sw.sensor, flower.map, flower.accent) * FEED_VALUE;
  sw.energy = Math.min(1, sw.energy + gain);
  return gain;
}

/** Living costs energy; population eases toward what the current energy can support (bounded by cap). */
export function updatePopulation(sw: Swarm): void {
  sw.energy = Math.max(0, sw.energy - LIVING_COST);
  const target = sw.energy * sw.cap;
  sw.population += (target - sw.population) * 0.05;
  sw.population = Math.max(0, Math.min(sw.cap, sw.population));
}

/** One tick: the flower refreshes a little nectar, the swarm feeds, its pool evolves, it lives. */
export function stepSwarm(sw: Swarm, flower: Flower, rng: Rng): void {
  regenNectar(flower);
  feedSwarm(sw, flower);
  evolveSwarm(sw, flower, rng);
  updatePopulation(sw);
}
