// The pressures panel's model + the richness/wildness meter — the evolutionary
// layer's two pure pieces (spec §"The evolutionary layer"). PURE: no DOM, no
// rng, no wall clock. The panel writes these onto the EXISTING kernel/Flora — a
// LIVE FloraTuning change (Flora reads this.tuning fresh every tick; see the
// plan's live-tuning finding) plus role flips for grazer-share (updateCritter
// reads sp.role live). The meter only READS, reusing foodweb's chainStats +
// richnessWord (the exact diversityScore arithmetic) — never re-scoring by hand.

import { CritterRole, CritterSpecies } from "../life/fauna";
import { FloraTuning } from "../life/flora";
import { ChainStats, chainStats, richnessWord } from "../life/foodweb";
import { PlantSpecies } from "../life/species";

export type PressureId =
  | "mutationAmount" // drift / mutation rate
  | "splitDistance"  // speciation threshold (how far a daughter must drift)
  | "grazerShare"    // grazer share / selection strength (a role-flip, not a tuning field)
  | "reproChance"    // reseed rate
  | "maxPerTile";    // per-tile cap (the richness ceiling)

export interface Pressure {
  id: PressureId;
  label: string;
  min: number;
  max: number;
  step: number;
  tuningKey?: keyof FloraTuning; // present for the four FloraTuning-backed pressures
}

// The five pressures, in panel order. Ranges bracket DEFAULT_TUNING so the
// default sits mid-slider and cranking a knob is a visible change.
export const PRESSURES: Pressure[] = [
  { id: "mutationAmount", label: "drift", min: 0, max: 0.3, step: 0.01, tuningKey: "mutationAmount" },
  { id: "splitDistance", label: "speciation", min: 0.08, max: 0.6, step: 0.01, tuningKey: "splitDistance" },
  { id: "grazerShare", label: "grazer share", min: 0, max: 1, step: 0.05 },
  { id: "reproChance", label: "reseed rate", min: 0, max: 0.4, step: 0.01, tuningKey: "reproChance" },
  { id: "maxPerTile", label: "per-tile cap", min: 1, max: 12, step: 1, tuningKey: "maxPerTile" },
];

// A FloraTuning patch for a tuning-backed pressure. Speciation is special: a
// LOWER threshold means "speciate more readily", but a lower splitDistance alone
// is silently blocked by the cluster/cooldown gates — so we open them in step
// (the same permissive direction ?split=1 uses), keeping the panel's one slider
// honest as "how wild speciation runs".
export function tuningPatchFor(id: PressureId, value: number): Partial<FloraTuning> {
  switch (id) {
    case "mutationAmount":
      return { mutationAmount: value };
    case "reproChance":
      return { reproChance: value };
    case "maxPerTile":
      return { maxPerTile: Math.round(value) };
    case "splitDistance":
      return {
        splitDistance: value,
        splitClusterMin: value < 0.2 ? 2 : value < 0.35 ? 4 : 6,
        splitCooldownTicks: value < 0.2 ? 0 : value < 0.35 ? 120 : 500,
      };
    default:
      return {}; // grazerShare is not a FloraTuning field
  }
}

// The grazer-share paint: given the critter kinds' ids and a target share 0..1,
// which become grazers. Deterministic (sort by id; the first ⌊share·N⌋ graze,
// the rest disperse) — no rng, so the same share always paints the same roster.
// updateCritter reads sp.role live, so writing these back lands on the next step.
export function grazerAssignment(ids: readonly number[], share: number): Map<number, CritterRole> {
  const sorted = [...ids].sort((a, b) => a - b);
  const clamped = Math.max(0, Math.min(1, share));
  const nGraze = Math.round(clamped * sorted.length);
  const out = new Map<number, CritterRole>();
  sorted.forEach((id, i) => out.set(id, i < nGraze ? "grazer" : "disperser"));
  return out;
}

// ── the richness / wildness meter ───────────────────────────────────────────

export interface Richness {
  score: number; // chains + 2*(redundancy-1) — the SAME formula diversityScore uses
  word: string; // richnessWord(score): flat/sparse/living/rich/lush/legendary
  chains: number;
  closable: number;
  redundancy: number;
}

// A live wildness reading for the WHOLE construct: the food web's standing
// chain-potential (chainStats over the construct's OWN species — never
// diversityScore(seed), which rebuilds a fresh world from a seed), scored by the
// exact diversityScore arithmetic and named by richnessWord. Display-only: it
// never mutates the sim.
export function richnessMeter(plants: PlantSpecies[], critters: CritterSpecies[]): Richness {
  const stats: ChainStats = chainStats(plants, critters);
  const score = stats.chains + 2 * (stats.redundancy - 1);
  return { score, word: richnessWord(score), chains: stats.chains, closable: stats.closable, redundancy: stats.redundancy };
}
