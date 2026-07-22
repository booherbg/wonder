import { Rng } from "../core/rng";
import { hsl } from "./genome";

// The identity map: a small pixel grid that is the shared "tag" space plants and
// insects match in. A plant presents a flower map (a base/foliage colour + a
// flower accent); an insect carries a sensor map that adapts toward it. Matching
// a flower's accent is the jackpot; matching its base colour is generic (and, in
// later plans, camouflage). Pure math — no state, all randomness via an injected Rng.

export const MAP_G = 7;
export const MAP_CELLS = MAP_G * MAP_G;
export const MAP_NCOL = 6; // colours 1..6; value 0 = neutral / unpainted

export type IdMap = Uint8Array;

// hue per colour index (1..6); index 0 (neutral) renders as a dim ground tone.
const HUES = [0, 8, 44, 168, 276, 192, 338]; // ember, gold, mint, violet, teal, rose

const randColor = (rng: Rng): number => 1 + Math.floor(rng() * MAP_NCOL);

// Reward weights. A base-colour match must out-pay its upkeep (so generic
// matching / camouflage is worth holding), while a flower-accent match is the
// big specialised payoff. A coloured cell that matches nothing is wasted upkeep.
export const UPKEEP = 0.1; // cost of holding any coloured sensor cell
export const BASE_HIT = 0.2; // matching a foliage/base cell: generic, small (net +0.1)
export const FLOWER_HIT = 0.9; // matching a flower accent cell: the jackpot (net +0.8)
export const GENERIC = 0.02; // a neutral cell's tiny income: generic pollination feeds a little anywhere

/** A fresh insect sensor map: biased toward neutral so a naive swarm is a cheap generalist. */
export function randomSensorMap(rng: Rng): IdMap {
  const g = new Uint8Array(MAP_CELLS);
  for (let i = 0; i < MAP_CELLS; i++) g[i] = rng() < 0.6 ? 0 : randColor(rng);
  return g;
}

/** A plant's appearance signature: a base/foliage colour fills every cell, with
 *  `flowerSize` accent cells (the flower) overlaid in a distinct colour.
 *  `accent[i]` marks the jackpot cells. */
export function makeFlowerSignature(rng: Rng, flowerSize: number): { map: IdMap; accent: Uint8Array } {
  const base = randColor(rng);
  let flower = randColor(rng);
  if (flower === base) flower = 1 + (flower % MAP_NCOL); // ensure the flower reads against the foliage
  const map = new Uint8Array(MAP_CELLS).fill(base);
  const accent = new Uint8Array(MAP_CELLS);
  const size = Math.max(0, Math.min(MAP_CELLS, Math.floor(flowerSize)));
  const idx = [...Array(MAP_CELLS).keys()];
  for (let k = 0; k < size; k++) {
    const j = k + Math.floor(rng() * (MAP_CELLS - k)); // partial Fisher–Yates: pick `size` distinct cells
    [idx[k], idx[j]] = [idx[j], idx[k]];
    map[idx[k]] = flower;
    accent[idx[k]] = 1;
  }
  return { map, accent };
}

/** Return a copy with `flips` cells randomly re-rolled (neutral or a colour). */
export function mutateMap(src: IdMap, rng: Rng, flips = 2): IdMap {
  const g = src.slice();
  const n = Math.max(1, flips);
  for (let k = 0; k < n; k++) {
    const i = Math.floor(rng() * MAP_CELLS);
    g[i] = rng() < 0.4 ? 0 : randColor(rng);
  }
  return g;
}

/** Reward for a sensor working a flower: coloured cells cost upkeep and pay on a
 *  match (accent cells pay the jackpot, base cells pay a little). Neutral cells are
 *  free and inert. This graded reward is the insect's "adaptive metabolism". */
export function matchReward(sensor: IdMap, flowerMap: IdMap, accent: Uint8Array): number {
  let r = 0;
  for (let i = 0; i < MAP_CELLS; i++) {
    if (sensor[i] === 0) { r += GENERIC; continue; } // neutral: the generalist trickle, no cost
    r -= UPKEEP;
    if (sensor[i] === flowerMap[i]) r += accent[i] ? FLOWER_HIT : BASE_HIT;
  }
  return r;
}

/** The best reward possible against this flower (colour every cell to match it). */
export function maxReward(flowerMap: IdMap, accent: Uint8Array): number {
  let m = 0;
  for (let i = 0; i < MAP_CELLS; i++) if (flowerMap[i] !== 0) m += (accent[i] ? FLOWER_HIT : BASE_HIT) - UPKEEP;
  return Math.max(1e-6, m);
}

/** How efficiently a sensor feeds on a flower, 0..1 — the metabolic efficiency. */
export function metabolicEfficiency(sensor: IdMap, flowerMap: IdMap, accent: Uint8Array): number {
  const r = matchReward(sensor, flowerMap, accent);
  return Math.max(0, Math.min(1, r / maxReward(flowerMap, accent)));
}

/** Fraction of a map's coloured cells the sensor reproduces — resemblance (used for
 *  adaptation readouts now, and camouflage/conspicuousness in the predation plan). */
export function resemblance(sensor: IdMap, flowerMap: IdMap): number {
  let need = 0, got = 0;
  for (let i = 0; i < MAP_CELLS; i++) if (flowerMap[i] !== 0) { need++; if (sensor[i] === flowerMap[i]) got++; }
  return need ? got / need : 0;
}

/** Render a map to per-cell CSS colours (neutral = a dim ground tone). The creature's
 *  visible colours are derived from its map — genome → look. `hsl` takes 0..1 for every
 *  channel, so hues (kept in degrees for readability above) divide down by 360. */
export function appearanceColors(map: IdMap): string[] {
  const out: string[] = new Array(MAP_CELLS);
  for (let i = 0; i < MAP_CELLS; i++)
    out[i] = map[i] === 0 ? hsl(200 / 360, 0.12, 0.14) : hsl(HUES[map[i]] / 360, 0.62, 0.58);
  return out;
}
