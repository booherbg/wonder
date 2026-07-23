// The pressures panel's model + the richness/wildness meter — the evolutionary
// layer's two pure pieces (spec §"The evolutionary layer"). PURE: no DOM, no
// rng, no wall clock. The panel writes these onto the EXISTING kernel/Flora — a
// LIVE FloraTuning change (Flora reads this.tuning fresh every tick; see the
// plan's live-tuning finding) plus role flips for grazer-share (updateCritter
// reads sp.role live). The meter only READS, reusing foodweb's chainStats +
// richnessWord (the exact diversityScore arithmetic) — never re-scoring by hand.

import { CritterRole, CritterSpecies } from "../life/fauna";
import { FloraTuning } from "../life/flora";
import { DEFAULT_POLLINATE_ASSIST, PollinateAssist } from "../life/pollinateAssist";
import { NECTAR_DRAW, NECTAR_REGEN } from "../life/swarm";
import { NECTAR_EMPTY_THRESHOLD } from "./swarms";
import { ChainStats, chainStats, richnessWord } from "../life/foodweb";
import { PlantSpecies } from "../life/species";

export type PressureId =
  | "mutationAmount" // drift / mutation rate
  | "splitDistance"  // speciation threshold (how far a daughter must drift)
  | "grazerShare"    // grazer share / selection strength (a role-flip, not a tuning field)
  | "reproChance"    // reseed rate
  | "maxPerTile"     // per-tile cap (the richness ceiling)
  | "reseedRadius"   // spread distance (natural + disperser landing)
  | "pollinationRadius" // cross distance (same-species partner search)
  | "pollinatorReach"   // shared pollinateSpread radius (ambient + swarm)
  | "pollinatorDensity" // shared pollinateSpread maxSame (ambient + swarm)
  | "lifespan"          // plant age-death threshold
  | "nectarRegen"      // swarm feed: species/plant nectar refill per tick
  | "nectarDraw"        // swarm feed: max drawn per visit
  | "emptyThreshold";   // free-roam skips blooms below this nectar

export interface Pressure {
  id: PressureId;
  label: string;
  min: number;
  max: number;
  step: number;
  tuningKey?: keyof FloraTuning; // present for the four FloraTuning-backed pressures
  // true when a HIGHER raw field value is the TAMER end — splitDistance is the
  // one pressure where the sim's own field runs backwards vs. the other four
  // (lower splitDistance = wilder speciation). Every OTHER pressure has
  // right-slider = wilder for free; this flag routes splitDistance's raw
  // field through fieldValueFor (below) so its slider agrees with its
  // siblings without the field's own real meaning changing at all.
  reversed?: boolean;
}

// The pressures, in panel order. Ranges bracket DEFAULT_TUNING so the
// default sits mid-slider and cranking a knob is a visible change.
export const PRESSURES: Pressure[] = [
  { id: "mutationAmount", label: "drift", min: 0, max: 0.3, step: 0.01, tuningKey: "mutationAmount" },
  { id: "splitDistance", label: "speciation", min: 0.08, max: 0.6, step: 0.01, tuningKey: "splitDistance", reversed: true },
  { id: "grazerShare", label: "grazer share", min: 0, max: 1, step: 0.05 },
  { id: "reproChance", label: "reseed rate", min: 0, max: 0.4, step: 0.01, tuningKey: "reproChance" },
  { id: "maxPerTile", label: "per-tile cap", min: 1, max: 12, step: 1, tuningKey: "maxPerTile" },
  { id: "reseedRadius", label: "spread distance", min: 1, max: 8, step: 1, tuningKey: "reseedRadius" },
  { id: "pollinationRadius", label: "cross distance", min: 0, max: 6, step: 1, tuningKey: "pollinationRadius" },
  { id: "pollinatorReach", label: "pollinator reach", min: 1, max: 10, step: 1 },
  { id: "pollinatorDensity", label: "pollinator density", min: 1, max: 4, step: 1 },
  { id: "lifespan", label: "plant lifespan", min: 100, max: 2000, step: 50, tuningKey: "lifespan" },
  { id: "nectarRegen", label: "nectar regen", min: 0.01, max: 0.2, step: 0.01 },
  { id: "nectarDraw", label: "nectar draw", min: 0.05, max: 0.5, step: 0.01 },
  { id: "emptyThreshold", label: "empty threshold", min: 0, max: 0.5, step: 0.01 },
];

// Clamp a raw slider value to the named pressure's own [min, max] — the panel
// SHOULD only ever hand us an in-range value, but tuningPatchFor must not
// trust that: a caller sourcing value some other way (a save file, a typed
// query param, a future macro) is a wild slider too, and the global
// constraint is that no slider can break the sim.
function clampToRange(id: PressureId, value: number): number {
  const p = PRESSURES.find((pr) => pr.id === id);
  return p ? Math.max(p.min, Math.min(p.max, value)) : value;
}

// The slider-position → real-field translation: for every pressure but
// splitDistance this is plain clamping (identity beyond the range guard).
// splitDistance is `reversed`, so its slider position gets mirrored across
// [min, max] here — the ONE place that reversal lives — so the slider itself
// can read "right = wilder" like its four siblings while the field
// tuningPatchFor writes (and its own tests) stay exactly the real
// splitDistance→gates mapping, untouched.
export function fieldValueFor(id: PressureId, sliderValue: number): number {
  const p = PRESSURES.find((pr) => pr.id === id);
  const clamped = clampToRange(id, sliderValue);
  return p?.reversed ? p.min + p.max - clamped : clamped;
}

// A FloraTuning patch for a tuning-backed pressure. Speciation is special: a
// LOWER threshold means "speciate more readily", but a lower splitDistance alone
// is silently blocked by the cluster/cooldown gates — so we open them in step
// (the same permissive direction ?split=1 uses), keeping the panel's one slider
// honest as "how wild speciation runs".
export function tuningPatchFor(id: PressureId, value: number): Partial<FloraTuning> {
  const clamped = clampToRange(id, value);
  switch (id) {
    case "mutationAmount":
      return { mutationAmount: clamped };
    case "reproChance":
      return { reproChance: clamped };
    case "maxPerTile":
      return { maxPerTile: Math.max(1, Math.round(clamped)) }; // never freeze a tile at 0
    case "reseedRadius":
      return { reseedRadius: Math.max(1, Math.round(clamped)) };
    case "pollinationRadius":
      return { pollinationRadius: Math.max(0, Math.round(clamped)) };
    case "lifespan":
      return { lifespan: Math.max(1, Math.round(clamped)) };
    case "splitDistance":
      return {
        splitDistance: clamped,
        splitClusterMin: clamped < 0.2 ? 2 : clamped < 0.35 ? 4 : 6,
        splitCooldownTicks: clamped < 0.2 ? 0 : clamped < 0.35 ? 120 : 500,
      };
    default:
      return {}; // grazerShare / pollinator* / nectar* are not FloraTuning fields
  }
}

// Shared pollinator-assist levers (ambient critter + SwarmLayer) — not FloraTuning.
export function pollinateAssistFor(reach: number, density: number): PollinateAssist {
  const reachClamped = Math.round(clampToRange("pollinatorReach", reach));
  const densityClamped = Math.round(clampToRange("pollinatorDensity", density));
  return { radius: reachClamped, maxSame: densityClamped };
}

export const DEFAULT_PRESSURE_POLLINATOR_REACH = DEFAULT_POLLINATE_ASSIST.radius;
export const DEFAULT_PRESSURE_POLLINATOR_DENSITY = DEFAULT_POLLINATE_ASSIST.maxSame;
export const DEFAULT_PRESSURE_NECTAR_REGEN = NECTAR_REGEN;
export const DEFAULT_PRESSURE_NECTAR_DRAW = NECTAR_DRAW;
export const DEFAULT_PRESSURE_EMPTY_THRESHOLD = NECTAR_EMPTY_THRESHOLD;

export interface NectarBenchTuning {
  regen: number;
  draw: number;
  emptyThreshold: number;
}

export function nectarBenchTuningFor(regen: number, draw: number, emptyThreshold: number): NectarBenchTuning {
  return {
    regen: clampToRange("nectarRegen", regen),
    draw: clampToRange("nectarDraw", draw),
    emptyThreshold: clampToRange("emptyThreshold", emptyThreshold),
  };
}

// The bench-only ambient roles a player sets by hand in the ambient tray.
// grazerShare must NOT stomp these: dragging the slider would otherwise silently
// revert a fish/pollinator/shuttle back to a plain grazer/disperser (and a fish
// reverted mid-water inherits the land walk rule). See grazerAssignment (qa
// consistency #4). Kept in sync with AMBIENT_ROLES' bench entries.
const BENCH_ROLES: ReadonlySet<CritterRole> = new Set(["pollinator", "nutrient-shuttle", "aquatic-grazer"]);

// The grazer-share paint: given the critter kinds' ids and a target share 0..1,
// which become grazers. Deterministic (sort by id; the first ⌊share·N⌋ graze,
// the rest disperse) — no rng, so the same share always paints the same roster.
// updateCritter reads sp.role live, so writing these back lands on the next step.
// A kind currently wearing a bench role (looked up through the optional roleOf) is
// SKIPPED entirely — left off the returned map so the caller never touches it —
// preserving a hand-set fish/pollinator/shuttle (qa consistency #4). Without
// roleOf every kind is eligible, so existing callers/tests are unchanged.
export function grazerAssignment(
  ids: readonly number[],
  share: number,
  roleOf?: (id: number) => CritterRole,
): Map<number, CritterRole> {
  const eligible = (roleOf ? ids.filter((id) => !BENCH_ROLES.has(roleOf(id))) : [...ids]).sort((a, b) => a - b);
  const clamped = Math.max(0, Math.min(1, share));
  const nGraze = Math.round(clamped * eligible.length);
  const out = new Map<number, CritterRole>();
  eligible.forEach((id, i) => out.set(id, i < nGraze ? "grazer" : "disperser"));
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
