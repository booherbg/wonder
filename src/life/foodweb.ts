// Pure food-web scoring for byproduct chains. No DOM, no globals, no dice of
// its own — everything derives from the seed through the same deterministic
// generators the game uses. `chainStats` reads a generated species set the way
// the study harness does; `diversityScore` turns a seed into one scalar; and
// `pickNewSeed` rejection-samples the "sail to a new island" roll to a floor.
//
// A link is trait-windowed, never a named species (spec §Resilience): a
// disperser eats plant P, and a substrate-feeder S in P's hue-window can
// germinate on P's byproduct. Many species can fill each role, so the floor
// rewards redundancy — chains WITH backup, not a fragile count.
//
// This is the generation-time HEURISTIC the spec calls for ("chain-potential
// exactly as the study harness does"): hue-windowed, habitat-blind — a fast
// ranking proxy, calibrated so the pinned seeds land where the study put them
// (2438 legendary, 42 flat) and the floor of ~5 rejects the barren tail. It is
// deliberately NOT the in-sim germination rule (which additionally requires the
// feeder share the byproduct's habitat tile); real emergence, habitat and all,
// is proven separately by the seed-2438 emergence test.

import { APPETITE_MIN, appetite, generateCritterSpecies, CritterSpecies } from "./fauna";
import { Flora, SUBSTRATE_HUE_MATCH, hueGap } from "./flora";
import { PlantSpecies, generateCraterEndemics, generatePlantSpecies } from "./species";
import { generate } from "../world/generate";

// Seed-search defaults (study: floor 5 rejects the barren ~20-22% at ~1.3
// rolls on average; only ~1.5% of seeds are truly flat). Frontier opts out.
export const DIVERSITY_FLOOR = 5;
export const SEED_CANDIDATES = 8;

export interface ChainStats {
  chains: number; // disperser→P→feeder(S) links: S a feeder in P's hue-window
  closable: number; // links whose feeder S is itself eaten by some disperser (chain continues)
  redundancy: number; // average feeders filling a source-plant's slot (≥1; higher = more backup)
}

// Count the emergent chain-links latent in a generated species set. Pure over
// its inputs — the same (plants, critters) always score identically.
export function chainStats(plants: PlantSpecies[], critters: CritterSpecies[]): ChainStats {
  const dispersers = critters.filter((c) => c.role === "disperser");
  const feeders = plants.filter((p) => p.substrateFeeder);
  const eatenBySomeDisperser = (sp: PlantSpecies): boolean =>
    dispersers.some((d) => appetite(d.palate, sp.archetype) > APPETITE_MIN);

  let chains = 0;
  let closable = 0;
  let filledSlots = 0; // source-plants that have at least one qualifying feeder

  for (const p of plants) {
    if (!eatenBySomeDisperser(p)) continue; // P must be a real byproduct source
    const qualifying = feeders.filter(
      (s) => hueGap(s.archetype.hue, p.archetype.hue) <= SUBSTRATE_HUE_MATCH,
    );
    if (qualifying.length === 0) continue;
    filledSlots++;
    chains += qualifying.length; // each feeder in the band is one (P, S) link
    for (const s of qualifying) if (eatenBySomeDisperser(s)) closable++;
  }

  const redundancy = filledSlots > 0 ? chains / filledSlots : 1;
  return { chains, closable, redundancy };
}

// A score said in a word — so "is this island viable?" has a plain answer,
// and the dev readout's number carries meaning. Calibrated to the study's
// distribution: median ~9 ("living"), the floor at 5, ≥40 legendary (~0.6%).
export function richnessWord(score: number): string {
  if (score <= 1) return "flat";
  if (score < 5) return "sparse"; // below the viability floor
  if (score < 15) return "living";
  if (score < 30) return "rich";
  if (score < 40) return "lush";
  return "legendary";
}

// The emergent chains named, for the insight surface: each a disperser that
// spreads a source plant, and a feeder that wakes on its byproduct — with
// whether that feeder is itself eaten, so the loop closes and the chain runs
// on. Loop-closers lead (they're the interesting ones). Same trait-window
// logic as chainStats, but it keeps the names so a watcher can read the web.
export interface ChainLink {
  disperser: string; // the spreader's kind
  source: string; // the plant it spreads
  feeder: string; // the plant that wakes on the byproduct
  closes: boolean; // the feeder is itself eaten → the loop continues
}

export function chainLinks(plants: PlantSpecies[], critters: CritterSpecies[]): ChainLink[] {
  const dispersers = critters.filter((c) => c.role === "disperser");
  const feeders = plants.filter((p) => p.substrateFeeder);
  const eaterOf = (sp: PlantSpecies): CritterSpecies | undefined =>
    dispersers.find((d) => appetite(d.palate, sp.archetype) > APPETITE_MIN);
  const out: ChainLink[] = [];
  for (const p of plants) {
    const eater = eaterOf(p);
    if (!eater) continue;
    for (const s of feeders) {
      if (hueGap(s.archetype.hue, p.archetype.hue) > SUBSTRATE_HUE_MATCH) continue;
      out.push({ disperser: eater.name, source: p.name, feeder: s.name, closes: !!eaterOf(s) });
    }
  }
  return out.sort((a, b) => Number(b.closes) - Number(a.closes)); // loops first (stable)
}

// One scalar for a seed's chain-potential, computed at generation time (no
// sim). Rewards redundancy over raw count so the default island is resilient,
// not fragile (spec §Resilience). Builds the species exactly as loadWorld
// does — base flora, plus crater endemics when the seed has a caldera — then a
// throwaway Flora for dens so the critters (and their roles) match the ones the
// player will actually meet.
export function diversityScore(seed: number): number {
  const map = generate(seed);
  const plants = generatePlantSpecies(seed);
  if (map.crater) plants.push(...generateCraterEndemics(seed, map.crater, plants.length));
  const flora = new Flora(map, plants, seed); // throwaway — only its dens are read
  const critters = generateCritterSpecies(seed, map, flora, plants);
  const { chains, redundancy } = chainStats(plants, critters);
  return chains + 2 * (redundancy - 1);
}

// The "new random island" roll, floored. Given a seed roller (injected so this
// stays pure and testable), keep the first candidate that clears the floor,
// else the best of `candidates` rolls. Frontier opts out of the floor entirely
// — one roll, whatever it is: the builder's deliberately-sparse canvas. Only
// the R / random-island path routes through here; explicit ?seed=, the picker,
// and saved worlds load exactly.
export function pickNewSeed(
  rollSeed: () => number,
  opts: { floor: number; candidates: number; frontier: boolean },
): number {
  if (opts.frontier) return rollSeed();
  let best = rollSeed();
  let bestScore = diversityScore(best);
  if (bestScore >= opts.floor) return best;
  for (let i = 1; i < opts.candidates; i++) {
    const seed = rollSeed();
    const score = diversityScore(seed);
    if (score >= opts.floor) return seed;
    if (score > bestScore) {
      bestScore = score;
      best = seed;
    }
  }
  return best;
}
