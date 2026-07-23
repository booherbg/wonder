import { Rng } from "../core/rng";
import { IdMap, randomSensorMap, makeFlowerSignature, mutateMap, matchReward, metabolicEfficiency, resemblance } from "./idmap";

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
export const PREDATION_RATE = 0.02; // fractional population loss per tick at full exposure × pressure

export interface Flower {
  map: IdMap; // full appearance signature (base + flower accent)
  accent: Uint8Array; // 1 where a cell is flower-accent (the jackpot)
  nectar: number; // 0..1 available now
}

export function makeFlower(rng: Rng, flowerSize: number): Flower {
  const { map, accent } = makeFlowerSignature(rng, flowerSize);
  return { map, accent, nectar: 1 };
}

/** A swarm's personality — heritable, mutable, and (in the game) read straight off how
 *  the cloud moves. Selection acts on these at the multi-swarm layer; here we hold + evolve
 *  them, and `nerve` already trades feeding against exposure below. */
export interface BehaviorGenes {
  range: number; // 0 homebody .. 1 wanderer (spatial foraging reach — expressed in the render layer)
  nerve: number; // 0 skittish .. 1 bold (bold feeds more but is exposed more)
  cohesion: number; // 0 loose .. 1 tight cloud (expressed in the render layer)
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function randomBehavior(rng: Rng): BehaviorGenes {
  return { range: rng(), nerve: rng(), cohesion: rng() };
}

export function mutateBehavior(b: BehaviorGenes, rng: Rng, amount = 0.1): BehaviorGenes {
  const nudge = () => (rng() * 2 - 1) * amount;
  return { range: clamp01(b.range + nudge()), nerve: clamp01(b.nerve + nudge()), cohesion: clamp01(b.cohesion + nudge()) };
}

export interface Swarm {
  pool: IdMap[]; // ~POOL_SIZE varied sensor maps
  sensor: IdMap; // the current best (representative body/appearance)
  population: number; // 0..cap
  energy: number; // 0..1 metabolic reserve
  cap: number; // the size lever — how large this swarm can grow
  behavior: BehaviorGenes; // personality (nerve trades feeding vs. exposure)
}

export function makeSwarm(rng: Rng, poolSize = POOL_SIZE, cap = SWARM_CAP): Swarm {
  const pool: IdMap[] = [];
  for (let i = 0; i < poolSize; i++) pool.push(randomSensorMap(rng));
  return { pool, sensor: pool[0], population: 10, energy: 0.5, cap, behavior: randomBehavior(rng) };
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

export interface NectarStepConfig {
  regen?: number;
  draw?: number;
}

export function regenNectar(flower: Flower, regen = NECTAR_REGEN): void {
  flower.nectar = Math.min(1, flower.nectar + regen);
}

/** Draw available nectar (capped) and convert it by the swarm's metabolic efficiency. */
export function feedSwarm(sw: Swarm, flower: Flower, draw = NECTAR_DRAW): number {
  const drawn = Math.min(flower.nectar, draw);
  flower.nectar -= drawn;
  const boldness = 0.6 + 0.4 * sw.behavior.nerve; // a bold swarm works the flower harder
  const gain = drawn * metabolicEfficiency(sw.sensor, flower.map, flower.accent) * FEED_VALUE * boldness;
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

/** How much a swarm stands out on the plant it's on (0 hidden .. 1 exposed).
 *  Camouflage is free from the same map: matching the flower it feeds on hides it. */
export function conspicuousness(sw: Swarm, flower: Flower): number {
  return 1 - resemblance(sw.sensor, flower.map);
}

/** Gentle, non-wiping predation: an insectivore thins the *conspicuous* fraction.
 *  `pressure` (0..1) is local predator presence. A camouflaged swarm is spared;
 *  no discrete kills — the population dips and (fed + hidden) regrows. Returns the loss. */
export function applyPredation(sw: Swarm, flower: Flower, pressure: number): number {
  const exposure = 0.4 + 0.6 * sw.behavior.nerve; // a skittish swarm flees, a bold one lingers exposed
  const taken = sw.population * conspicuousness(sw, flower) * pressure * PREDATION_RATE * exposure;
  sw.population = Math.max(0, sw.population - taken);
  return taken;
}

/** One tick: nectar refreshes, the swarm feeds, its pool evolves, it lives, and — if
 *  predators are present — the conspicuous fraction is thinned. */
export function stepSwarm(sw: Swarm, flower: Flower, rng: Rng, predation = 0, nectar?: NectarStepConfig): void {
  regenNectar(flower, nectar?.regen);
  feedSwarm(sw, flower, nectar?.draw);
  evolveSwarm(sw, flower, rng);
  updatePopulation(sw);
  if (predation > 0) applyPredation(sw, flower, predation);
}

function refill(pool: IdMap[], rng: Rng): IdMap[] {
  const out = pool.slice();
  while (out.length < POOL_SIZE) out.push(mutateMap(out[Math.floor(rng() * out.length)], rng, MUTATE_FLIPS));
  return out;
}

/** Divergence → cousins. When a swarm's gene pool has split into two clusters, one
 *  favouring flower A and one flower B, the B-cluster buds off as a new swarm. Returns the
 *  new swarm, or null if the pool isn't genuinely bimodal (no forced split). */
export function divergeSwarm(sw: Swarm, flowerA: Flower, flowerB: Flower, rng: Rng): Swarm | null {
  const forA: IdMap[] = [], forB: IdMap[] = [];
  for (const g of sw.pool) {
    const ra = matchReward(g, flowerA.map, flowerA.accent);
    const rb = matchReward(g, flowerB.map, flowerB.accent);
    (rb > ra ? forB : forA).push(g);
  }
  if (forA.length < 2 || forB.length < 2) return null; // not bimodal — nothing to split
  sw.pool = refill(forA, rng);
  sw.sensor = sw.pool[0];
  const child: Swarm = {
    pool: refill(forB, rng),
    sensor: forB[0],
    population: sw.population * 0.4,
    energy: sw.energy,
    cap: sw.cap,
    behavior: mutateBehavior(sw.behavior, rng, 0.15),
  };
  sw.population *= 0.6;
  return child;
}
