// The world swarm layer — the plant/insect ecology bolted onto the REAL island
// as a purely additive life/visual layer (Plan 5a, v1). It reuses the tested
// ecology core untouched (src/life/idmap.ts, swarm.ts): the core feeds ONE swarm
// on ONE flower and evolves its pixel map toward it; this module is only the
// spatial glue over a living island — give a flowering plant SPECIES a flower
// map, scatter a bounded set of insect swarms near the blooms, and each sim
// heartbeat home each swarm on its nearest flowering plant and feed it there.
//
// It NEVER touches flora/critter/worldgen. Its whole life runs off a SEPARATE
// salted Rng, so a pinned seed's world stays byte-identical — swarms regenerate
// from seed each load (like critters do), no save format change.
//
// Which plants "flower" is the SAME rule the cosmetic Pollinators already work
// (ambient.isBloom): flowers always, shrubs, succulents once bloomed. Swarms
// therefore home on the very blooms the butterflies visit.

import { makeRng, Rng } from "../core/rng";
import { IdMap, MAP_CELLS, appearanceColors, metabolicEfficiency, resemblance } from "../life/idmap";
import {
  BehaviorGenes,
  Flower,
  Swarm,
  makeFlower,
  makeSwarm,
  stepSwarm,
  divergeSwarm,
  NECTAR_REGEN,
  NECTAR_DRAW,
  NectarStepConfig,
} from "../life/swarm";
import { InsectPlan, insectMorphOf } from "../render/insectSprites";
import { DEFAULT_POLLINATE_ASSIST, PollinateAssist } from "../life/pollinateAssist";
import { Flora, Plant } from "../life/flora";
import { PlantForm } from "../life/genome";
import { PlantSpecies } from "../life/species";
import { TILE_SIZE } from "../world/config";
import { isBloom } from "../render/ambient";

// separate salts — never a stream flora/critters/worldgen use, so nothing shifts
const FLOWER_SALT = 0xf10f5; // per-species flower map
const SWARM_SALT = 0x5a12b; // the swarm layer's own life (spawn + tick + adapt)

export const MIN_SWARMS = 4;
export const MAX_SWARMS = 8;
export const MOTES_MAX = 42; // flight bookkeeping slots per cloud (insects + the 1px dust of many-ness)
const SWARM_CAP = 96; // the size lever for a world swarm (near the core default)
const WARM_TICKS = 20; // heartbeats a swarm has already lived when the island loads
const LIVELY_POP = 38; // a swarm arrives already a lush cloud, not a lone speck
const HOME_SCAN_PX = 10 * TILE_SIZE; // how far a swarm looks for a flowering plant to work
const RING_MIN_PX = 1.5 * TILE_SIZE; // a well-adapted swarm hugs its bloom this close
const RING_RANGE_PX = 1.7 * TILE_SIZE; // a poorly-adapted one ranges out this much further
export const SPARSE_SWARMS = 2; // bloom-poor island: seed at least this many so the sky isn't empty

// ── predation (gentle ambient insectivory) ────────────────────────────────────
// A small, always-on predation pressure standing in for generic insectivores. It
// feeds through the tested core's applyPredation: cull ∝ conspicuousness, so a
// swarm well-camouflaged against its host flower is spared and a conspicuous one
// is gently thinned — camouflage/adaptation buys survival. Non-wiping by
// construction (the core caps the drain and an adapting swarm regrows), so no
// swarm is ever erased; it just presses the boom to stay honest.
export const WORLD_PREDATION = 0.6; // 0..1 ambient pressure in a real world (the Simulator toggles its own)

// ── divergence → cousins (bounded budding) ────────────────────────────────────
// When a swarm's internal gene pool is genuinely bimodal — part favouring its
// home flower, part a DIFFERENT nearby flowering species — the second cluster
// buds off as a cousin swarm on that other species (the tested core's
// divergeSwarm). Kept rare (attempted on a slow cadence) and bounded (a hard
// ceiling on total swarms), so a world grows a handful of cousins over time,
// never a runaway.
export const SWARM_COUNT_CAP = 24; // hard ceiling on total swarms (initial spawns + budded cousins)
const DIVERGE_INTERVAL = 50; // heartbeats between divergence attempts

// ── pollination (the reciprocal boom) ─────────────────────────────────────────
// The payoff the plant gets back. A well-matched, well-fed swarm now and then
// POLLINATES the flower it works — it trips that plant's ordinary propagation
// (the very drifted, same-species reseed a disperser critter triggers, via
// flora.propagate), so a faithful insect+flower pair spreads faster. It's a
// facultative accelerant, never a lifeline: flora keeps self-seeding on its own
// (flora.simTick), so a flower with no swarm still persists — just spreads
// slower. Gated three ways so it stays a gentle nudge, never a firehose:
//   • a metabolic-match floor — only a swarm genuinely adapted to its flower
//     pollinates; a crumbs-fed stray does not,
//   • a per-swarm chance that climbs with match quality (squared) × how full the
//     cloud is, so the best-fed, best-fit pairs boom and the rest barely nudge,
//   • an island-wide cap on pollination events per heartbeat.
// Bounded on the far side too: propagate routes through addPlant, so per-tile +
// global caps hold the ceiling — a saturated neighbourhood simply refuses.
const POLLINATE_MATCH_MIN = 0.3; // metabolic efficiency a swarm needs before it pollinates at all
const POLLINATE_CHANCE = 0.5; // scales the per-swarm, per-heartbeat pollination probability
const MAX_POLLINATIONS_PER_TICK = 3; // island-wide ceiling on pollination events each heartbeat
// The boom reads as natural SPREAD, not a tiled slab: a pollinated reseed drifts
// wider than flora's own self-seed radius and thins out under a per-cloud density
// cap set BELOW flora's per-tile cap — so a species fills a neighbourhood loosely
// (open, airy) rather than stacking a rigid single-species carpet. Still bounded:
// it routes through flora's addPlant, so per-tile + global caps hold on top.
// Defaults live in pollinateAssist (6 / 2 today); SwarmLayer.pollinateAssist overrides.

// ── events (the layer's notable moments, for the game to witness) ─────────────
// The layer's best beats — a flower visibly thickening under a well-matched
// cloud, a cousin budding off toward a second species — used to happen in
// silence. Now each is emitted once as a small event the game loop drains
// (takeEvents, mirroring flora's) and surfaces quietly. Pure bookkeeping on the
// side: no event ever draws from the seeded stream or touches the sim.
export interface SwarmEvent {
  kind: "boom" | "cousin";
  name: string; // the swarm at the centre of it
  hostSpecies: number; // boom: the flowering kind that thickened · cousin: its new host
  x: number; // world px — where the moment happened (the host bloom), so the
  y: number; // game can ask "was there a witness?" before it speaks
}
export const BOOM_POLLINATIONS = 3; // spreads before a swarm's work reads as a visible boom
const EVENT_QUEUE_CAP = 8; // undrained moments beyond this quietly age out

// Lab-only: below this nectar a free-roaming cloud refuses a bloom and picks another.
export const NECTAR_EMPTY_THRESHOLD = 0.15;

export interface SwarmLayerOptions {
  /** Each plant instance carries its own nectar meter (World-Lab default). */
  perPlantNectar?: boolean;
  /** Seed initial swarms on load — off on the construct bench. */
  autoSpawn?: boolean;
  /** Ambient insectivory pressure (0 on the bench). */
  predation?: number;
  /** Free-roam skips blooms below this nectar (per-plant mode). */
  emptyNectarThreshold?: number;
}

export interface PollinationLogEntry {
  speciesId: number;
  speciesName: string;
  count: number;
  lastTick: number;
  flowerMap: IdMap;
  accent: Uint8Array;
}

// ── save/restore (World-Lab sim slots) ──────────────────────────────────────
// Pure snapshot types for packSim/restoreSim. Motes are animation-only and
// regenerate on restore; everything else needed for bit-identical continuation
// is captured here.

export interface SavedSwarmCore {
  pool: number[][];
  sensor: number[];
  population: number;
  energy: number;
  cap: number;
  behavior: BehaviorGenes;
}

export interface SavedPollinationLogEntry {
  speciesId: number;
  count: number;
  lastTick: number;
}

export interface SavedWorldSwarm {
  id: number;
  name: string;
  x: number;
  y: number;
  orbit: number;
  pinned: boolean;
  visitPlantIdx: number | null;
  pollinated: number;
  pollinationLog: SavedPollinationLogEntry[];
  home: { x: number; y: number; species: number } | null;
  sw: SavedSwarmCore;
}

export interface SavedFlower {
  map: number[];
  accent: number[];
  nectar: number;
}

export interface SavedSwarmLayer {
  rngState: number;
  ticks: number;
  swarms: SavedWorldSwarm[];
  flowers: { speciesId: number; flower: SavedFlower }[];
  plantNectar?: { idx: number; nectar: number }[];
}

function packMap(m: IdMap): number[] {
  return Array.from(m);
}

function unpackMap(a: number[]): IdMap {
  return Uint8Array.from(a);
}

function packSwarm(sw: Swarm): SavedSwarmCore {
  return {
    pool: sw.pool.map(packMap),
    sensor: packMap(sw.sensor),
    population: sw.population,
    energy: sw.energy,
    cap: sw.cap,
    behavior: { ...sw.behavior },
  };
}

function unpackSwarm(saved: SavedSwarmCore): Swarm {
  return {
    pool: saved.pool.map(unpackMap),
    sensor: unpackMap(saved.sensor),
    population: saved.population,
    energy: saved.energy,
    cap: saved.cap,
    behavior: { ...saved.behavior },
  };
}

function packFlower(flower: Flower): SavedFlower {
  return { map: packMap(flower.map), accent: packMap(flower.accent), nectar: flower.nectar };
}

function unpackFlower(saved: SavedFlower): Flower {
  return { map: unpackMap(saved.map), accent: unpackMap(saved.accent), nectar: saved.nectar };
}

// A mote is one slot of render bookkeeping (the gene pool is the sim): the
// renderer draws the first few as full generative insects and the rest as the
// faint 1px dust that says "many" without clutter. Wall-clock animation only.
export type MotePhase = "orbit" | "outbound" | "visit" | "inbound";

export interface Mote {
  a: number; // orbit angle around the cloud centre
  r: number; // 0..1 radial offset within the cloud
  spd: number; // angular drift speed
  z: number; // 0..1 depth, for size/alpha variation
  phase: MotePhase;
  prog: number; // 0..1 within outbound/visit/inbound
  cooldown: number; // orbit dwell before another forage (seconds)
}

const MOTE_OUTBOUND_S = 1.1;
const MOTE_VISIT_S = 0.5;
const MOTE_INBOUND_S = 0.95;

function freshMote(a: number, r: number, spd: number, z: number): Mote {
  return { a, r, spd, z, phase: "orbit", prog: 0, cooldown: z * 2.2 };
}

/** How lively foraging looks — scales with cloud fill and energy. Pure. */
export function moteActivity(population: number, cap: number, energy: number): number {
  const fill = cap > 0 ? population / cap : 0;
  return Math.max(0, Math.min(1, fill * Math.max(0, Math.min(1, energy))));
}

export interface MoteAdvanceInput {
  dt: number;
  activity: number;
  hasHome: boolean;
  slot: number;
  orbit: number;
}

/** Advance one mote's forage phase — animation-only, wall-clock. Pure. */
export function advanceMote(m: Mote, input: MoteAdvanceInput): void {
  const { dt, activity, hasHome, slot, orbit } = input;
  m.a += m.spd * dt;

  if (!hasHome || activity < 0.06) {
    if (m.phase !== "orbit") {
      m.phase = "orbit";
      m.prog = 0;
    }
    m.cooldown = Math.max(0, m.cooldown - dt);
    return;
  }

  const activeSlots = Math.max(1, Math.floor(MOTES_MAX * activity * 0.38));
  const cycle = 4.8 - activity * 2.2;
  const gate = Math.sin(orbit * 0.85 + slot * 0.41 + m.z * 4.1);
  const canForage = slot < activeSlots;

  switch (m.phase) {
    case "orbit":
      m.cooldown = Math.max(0, m.cooldown - dt);
      if (canForage && m.cooldown <= 0 && gate > 0.55 - activity * 0.45) {
        m.phase = "outbound";
        m.prog = 0;
      }
      break;
    case "outbound":
      m.prog += dt / MOTE_OUTBOUND_S;
      if (m.prog >= 1) {
        m.phase = "visit";
        m.prog = 0;
      }
      break;
    case "visit":
      m.prog += dt / MOTE_VISIT_S;
      if (m.prog >= 1) {
        m.phase = "inbound";
        m.prog = 0;
      }
      break;
    case "inbound":
      m.prog += dt / MOTE_INBOUND_S;
      if (m.prog >= 1) {
        m.phase = "orbit";
        m.prog = 0;
        m.cooldown = 1.2 + m.z * cycle * 0.35;
      }
      break;
  }
}

function moteBloomOffset(m: Mote): { dx: number; dy: number } {
  const j = ((m.z * 17.3 + m.a * 0.07) % 1 + 1) % 1;
  const k = ((m.z * 9.1 + m.r * 0.11) % 1 + 1) % 1;
  return { dx: (j - 0.5) * 7, dy: -3 - k * 4 };
}

function ease(u: number): number {
  const t = Math.max(0, Math.min(1, u));
  return t * t * (3 - 2 * t);
}

/** World position of one mote — orbit, or eased leave/visit/return. Pure. */
export function moteWorldPosition(
  m: Mote,
  cx: number,
  cy: number,
  homeX: number,
  homeY: number,
  scatterR: number,
): { x: number; y: number } {
  const rr = scatterR * (0.3 + m.r * 0.7);
  const orbitX = cx + Math.cos(m.a) * rr;
  const orbitY = cy + Math.sin(m.a) * rr * 0.82;
  const { dx, dy } = moteBloomOffset(m);
  const bloomX = homeX + dx;
  const bloomY = homeY + dy;

  switch (m.phase) {
    case "orbit":
      return { x: orbitX, y: orbitY };
    case "outbound": {
      const e = ease(m.prog);
      return { x: orbitX + (bloomX - orbitX) * e, y: orbitY + (bloomY - orbitY) * e };
    }
    case "visit":
      return { x: bloomX, y: bloomY };
    case "inbound": {
      const e = ease(m.prog);
      return { x: bloomX + (orbitX - bloomX) * e, y: bloomY + (orbitY - bloomY) * e };
    }
  }
}

// A single spatial swarm: the tested core Swarm (cloud + gene pool) given a spot
// on the island and a flowering plant it's homing on.
export interface WorldSwarm {
  sw: Swarm;
  id: number; // creation order — a stable identity (names, per-swarm flight salt)
  name: string; // the codex name its kind wears — every species here is named
  x: number; // world px — the cloud centre, drifting to orbit its home bloom
  y: number;
  orbit: number; // slow orbit phase around the home flower
  motes: Mote[];
  home: { x: number; y: number; species: number } | null; // the bloom it works
  pollinated: number; // successful spreads so far — crossing BOOM_POLLINATIONS emits its boom
  /** Pin holds this host; free-roam re-homes on nearest viable bloom. */
  pinned: boolean;
  /** Concrete plant fed this heartbeat — drives truthful motion. */
  visitPlantIdx: number | null;
  /** Successful pollinateSpread by target species (lab Details log). */
  pollinationLog: Map<number, { count: number; lastTick: number }>;
}

// ── names, in the codex voice ─────────────────────────────────────────────────
// The game names every species (Silvelash Bell, Pomo Hopper); the swarms wear
// the same register — a coined word and a bug-epithet cut from the insect's own
// body plan (the plan is stable for a swarm's life, so the name always fits the
// creature you see). Seeded off the island seed + creation index on a PRIVATE
// rng, so naming never draws from the layer's seeded stream. A budded cousin
// carries the ✧ the flora's island-born daughters wear.

const BUG_SYLLABLES = [
  "thi", "mo", "vel", "sa", "lu", "pi", "fer", "ola", "da", "myr",
  "cin", "ra", "eth", "um", "bre", "os", "ni", "tal", "wis", "ke",
];

const PLAN_EPITHETS: Record<InsectPlan, readonly string[]> = {
  moth: ["moth", "duskwing", "silkwing", "flit"],
  beetle: ["beetle", "domeback", "shieldwing", "lacquerwing"],
  hoverer: ["hummer", "hoverling", "nectarwhirr", "bee"],
  damsel: ["darner", "needlewing", "threadwing", "damsel"],
  skipper: ["skipper", "flickerwing", "dartwing", "glancer"],
};

/** A deterministic codex name for the swarm created `index`-th on this island.
 *  Pure — its own hash-seeded rng, never a draw from the layer's stream. */
export function swarmName(seed: number, index: number, behavior: BehaviorGenes, cousin = false): string {
  const r = makeRng((seed ^ 0xb0661e ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  const syl = () => BUG_SYLLABLES[Math.floor(r() * BUG_SYLLABLES.length)];
  let word = syl() + syl();
  if (r() < 0.35) word += syl();
  const pool = PLAN_EPITHETS[insectMorphOf(behavior).plan];
  const epithet = pool[Math.floor(r() * pool.length)];
  const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
  return `${cap(word)} ${cap(epithet)}${cousin ? " ✧" : ""}`;
}

// The inspect readout for one swarm — the codex card's data (built here so the
// idmap math stays out of the render layer). resemblance is 0..1.
export interface SwarmInspect {
  name: string; // the codex name the kind wears
  sensor: IdMap; // the 7×7 appearance genome (rendered via appearanceColors)
  population: number;
  energy: number;
  cap: number;
  hostName: string; // the flowering plant it works
  resemblance: number; // 0..1 — how close its map has come to that flower
  matchEfficiency: number; // metabolic efficiency 0..1
  nectar: number; // host bloom's nectar now (per-plant or species-shared)
  pinned: boolean;
  behavior: { range: number; nerve: number; cohesion: number };
  flowerMap: IdMap; // the host flower's map — to ring the jackpot cells it matches
  accent: Uint8Array; // 1 where a cell is flower-accent
  pollinationLog: PollinationLogEntry[];
}

// Which plant forms can carry a flower map — exactly the forms ambient.isBloom
// can answer true for (flowers, shrubs, succulents). Trees/ferns/fungi/coral/…
// hold no blossom, so they never host a swarm.
export function canFlower(form: PlantForm): boolean {
  return form === PlantForm.Flower || form === PlantForm.Shrub || form === PlantForm.Succulent;
}

// A species' flower size (accent-cell count) — the jackpot's size, scaled off
// its bloom: showy on true flowers, a smaller signal on shrubs and succulents.
// Deterministic in the archetype, so the same species always wears the same
// flower. Bounded well under the 7×7 grid so a base colour always shows too.
export function flowerSizeFor(sp: PlantSpecies): number {
  const petals = sp.archetype.petals; // ~3..12
  const base =
    sp.archetype.form === PlantForm.Flower
      ? petals * 1.7
      : sp.archetype.form === PlantForm.Shrub
        ? petals * 0.85
        : petals * 1.1; // succulent
  return Math.max(3, Math.min(MAP_CELLS - 6, Math.round(base)));
}

// One deterministic flower map per FLOWERING species, keyed by species id and
// seeded off the flower salt + the id — so adding a species (a daughter, later)
// never shifts an earlier map. Built once per island.
export function buildFlowerMaps(seed: number, species: readonly PlantSpecies[]): Map<number, Flower> {
  const out = new Map<number, Flower>();
  for (const sp of species) {
    if (!canFlower(sp.archetype.form)) continue;
    const rng = makeRng((seed ^ FLOWER_SALT ^ Math.imul(sp.id + 1, 0x9e3779b1)) >>> 0);
    out.set(sp.id, makeFlower(rng, flowerSizeFor(sp)));
  }
  return out;
}

export class SwarmLayer {
  readonly flowers: Map<number, Flower>;
  readonly swarms: WorldSwarm[] = [];
  readonly perPlantNectar: boolean;
  predation = WORLD_PREDATION; // gentle ambient insectivory; the sim swaps its own value in
  pollinateAssist: PollinateAssist = DEFAULT_POLLINATE_ASSIST;
  private readonly events: SwarmEvent[] = []; // notable moments awaiting a witness
  private readonly plantNectar = new Map<number, number>(); // per-plant nectar when perPlantNectar
  emptyThreshold: number;
  nectarTuning: NectarStepConfig = { regen: NECTAR_REGEN, draw: NECTAR_DRAW };
  private rng: Rng;
  private readonly seed: number;
  private readonly species: readonly PlantSpecies[]; // the SHARED list — grows as daughters speciate
  private ticks = 0; // sim heartbeats elapsed (drives the divergence cadence)

  constructor(
    seed: number,
    species: readonly PlantSpecies[],
    flora: Flora,
    focus?: { x: number; y: number }, // world px — the arrival point; some swarms gather here
    options: SwarmLayerOptions = {},
  ) {
    this.seed = seed;
    this.species = species;
    this.perPlantNectar = options.perPlantNectar ?? false;
    this.emptyThreshold = options.emptyNectarThreshold ?? NECTAR_EMPTY_THRESHOLD;
    this.flowers = buildFlowerMaps(seed, species);
    this.rng = makeRng((seed ^ SWARM_SALT) >>> 0);
    if (options.predation !== undefined) this.predation = options.predation;
    if (options.autoSpawn !== false) this.spawn(flora, focus);
  }

  // The flower map for a flowering SPECIES, built lazily and cached. Daughters that
  // speciate DURING play (flora.speciateFrom appends to the shared species list)
  // get their own map the first time a swarm meets them — so an evolved flowering
  // kind can host swarms too, not just the species present at load. Deterministic:
  // seeded off the flower salt + the species id exactly as buildFlowerMaps does, so
  // when it is built never changes what it is. Null for a non-flowering kind.
  flowerFor(speciesId: number): Flower | null {
    const cached = this.flowers.get(speciesId);
    if (cached) return cached;
    const sp = this.species[speciesId];
    if (!sp || !canFlower(sp.archetype.form)) return null;
    const rng = makeRng((this.seed ^ FLOWER_SALT ^ Math.imul(speciesId + 1, 0x9e3779b1)) >>> 0);
    const flower = makeFlower(rng, flowerSizeFor(sp));
    this.flowers.set(speciesId, flower);
    return flower;
  }

  // The flowering plants a swarm can actually work: the isBloom rule (the same
  // one the cosmetic pollinators use) AND a species we hold (or can build) a
  // flower map for.
  private bloomCandidates(flora: Flora): Plant[] {
    return flora.all.filter((p) => isBloom(p) && this.flowerFor(p.species) !== null);
  }

  // Any plant of a flowering species, whether or not it is CURRENTLY in bloom —
  // the fallback pool for a bloom-poor island (trees/ferns/fungi/kelp with only a
  // few shrubs/succulents not yet blossoming), so the sky still carries a little
  // life. If this is empty too, the island truly has no flowering plants → no swarms.
  private floweringPlants(flora: Flora): Plant[] {
    return flora.all.filter((p) => this.flowerFor(p.species) !== null);
  }

  // Scatter a bounded set of swarms, each anchored beside a flowering plant, and
  // let each already live a short while against that bloom — so an island loads
  // with clouds that are already colouring toward their flowers, not blank.
  private makeMotesForRestore(moteSalt: number): Mote[] {
    const r = makeRng((this.seed ^ Math.imul(moteSalt + 1, 0x9e3779b1) ^ 0xa073e) >>> 0);
    const motes: Mote[] = [];
    for (let m = 0; m < MOTES_MAX; m++) {
      motes.push(freshMote(r() * Math.PI * 2, 0.32 + r() * 0.68, 0.2 + r() * 0.5, r()));
    }
    return motes;
  }

  private bootstrapEnt(
    sw: Swarm,
    x: number,
    y: number,
    anchor: Plant | null,
    lively = false,
    pinned = false,
  ): WorldSwarm {
    const motes: Mote[] = [];
    for (let m = 0; m < MOTES_MAX; m++) {
      motes.push(
        freshMote(
          this.rng() * Math.PI * 2,
          0.32 + this.rng() * 0.68,
          0.2 + this.rng() * 0.5,
          this.rng(),
        ),
      );
    }
    const ang = this.rng() * Math.PI * 2;
    const id = this.swarms.length;
    const ent: WorldSwarm = {
      sw,
      id,
      name: swarmName(this.seed, id, sw.behavior),
      x,
      y,
      orbit: ang,
      motes,
      home: anchor ? { x: anchor.x, y: anchor.y, species: anchor.species } : null,
      pollinated: 0,
      pinned,
      visitPlantIdx: anchor?.idx ?? null,
      pollinationLog: new Map(),
    };
    if (lively) {
      sw.population = LIVELY_POP;
      if (anchor) {
        const flower = this.flowerFor(anchor.species)!;
        for (let w = 0; w < WARM_TICKS; w++) this.stepEntOnHost(ent, anchor, flower);
      }
    }
    return ent;
  }

  private spawn(flora: Flora, focus?: { x: number; y: number }): void {
    // Prefer plants actually in bloom; on a bloom-poor island fall back to any
    // flowering-species plant island-wide, so every island with SOME flowering
    // plant gets a little life (only a truly flowerless island stays empty).
    const inBloom = this.bloomCandidates(flora);
    const sparse = inBloom.length === 0;
    const blooms = sparse ? this.floweringPlants(flora) : inBloom;
    if (blooms.length === 0) return; // no flowering plants at all — an empty sky is right here
    const count = sparse
      ? Math.min(blooms.length, SPARSE_SWARMS) // just a couple of clouds on the nearest flowering plants
      : MIN_SWARMS + Math.floor(this.rng() * (MAX_SWARMS - MIN_SWARMS + 1));
    // a "near pool": the blooms closest to the arrival point, so the island reads
    // alive right where the wanderer lands. Roughly half the swarms gather here;
    // the rest scatter island-wide. Deterministic (a stable sort off the seed).
    const nearPool = focus
      ? [...blooms]
          .sort(
            (a, b) =>
              (a.x - focus.x) ** 2 + (a.y - focus.y) ** 2 - ((b.x - focus.x) ** 2 + (b.y - focus.y) ** 2),
          )
          .slice(0, Math.min(blooms.length, 60))
      : blooms;
    const nearCount = focus ? Math.ceil(count / 2) : 0;
    for (let i = 0; i < count; i++) {
      // the very first swarm settles on the single closest bloom to the arrival
      // point, so the island always greets the wanderer with a cloud at hand;
      // the next few draw from the near pool, the rest scatter island-wide
      const anchor =
        focus && i === 0
          ? nearPool[0]
          : (i < nearCount ? nearPool : blooms)[Math.floor(this.rng() * (i < nearCount ? nearPool : blooms).length)];
      const sw = makeSwarm(this.rng, undefined, SWARM_CAP);
      const ang = this.rng() * Math.PI * 2;
      const ent = this.bootstrapEnt(
        sw,
        anchor.x + Math.cos(ang) * RING_MIN_PX,
        anchor.y + Math.sin(ang) * RING_MIN_PX,
        anchor,
        true,
        false,
      );
      this.swarms.push(ent);
    }
  }

  /** Nectar available on one plant instance (lab) or its species pool (main). */
  nectarOf(p: Plant): number {
    if (this.perPlantNectar) return this.plantNectar.get(p.idx) ?? 1;
    return this.flowerFor(p.species)?.nectar ?? 0;
  }

  /** Register a custom flower signature (clone-with-mutation on the bench). */
  setFlower(speciesId: number, flower: Flower): void {
    this.flowers.set(speciesId, {
      map: flower.map.slice(),
      accent: flower.accent.slice(),
      nectar: flower.nectar,
    });
  }

  /** Feed + evolve one swarm on a concrete host plant — per-plant or species nectar. */
  private stepEntOnHost(ent: WorldSwarm, host: Plant, flower: Flower): void {
    if (this.perPlantNectar) {
      const nectar = this.plantNectar.get(host.idx) ?? 1;
      const proxy: Flower = { map: flower.map, accent: flower.accent, nectar };
      stepSwarm(ent.sw, proxy, this.rng, this.predation, this.nectarTuning);
      this.plantNectar.set(host.idx, proxy.nectar);
    } else {
      stepSwarm(ent.sw, flower, this.rng, this.predation, this.nectarTuning);
    }
  }

  // visitPlantIdx goes stale when flora compacts indices on removePlant — resolve
  // the pinned host by its saved home coordinates instead.
  private plantAtHome(ent: WorldSwarm, flora: Flora): Plant | null {
    if (!ent.home) return null;
    const { x: hx, y: hy, species } = ent.home;
    for (const p of flora.plantsNear(hx, hy, TILE_SIZE * 0.75)) {
      if (
        p.species === species &&
        Math.abs(p.x - hx) < 1 &&
        Math.abs(p.y - hy) < 1 &&
        isBloom(p) &&
        this.flowerFor(p.species) !== null
      ) {
        return p;
      }
    }
    return null;
  }

  // Pick the bloom this swarm feeds this heartbeat — pin holds the plant
  // (even when nectar is spent); free-roam skips spent blooms and prefers
  // fuller nectar nearby.
  private chooseFeedPlant(ent: WorldSwarm, flora: Flora): Plant | null {
    if (ent.pinned) {
      const pinned = this.plantAtHome(ent, flora);
      ent.visitPlantIdx = pinned?.idx ?? null;
      return pinned;
    }
    const hx = ent.home?.x ?? ent.x;
    const hy = ent.home?.y ?? ent.y;
    if (!this.perPlantNectar) {
      let best: Plant | null = null;
      let bd = Infinity;
      for (const p of flora.plantsNear(hx, hy, HOME_SCAN_PX)) {
        if (!isBloom(p) || this.flowerFor(p.species) === null) continue;
        const d = (p.x - hx) ** 2 + (p.y - hy) ** 2;
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      return best;
    }
    let best: Plant | null = null;
    let bestScore = -Infinity;
    for (const p of flora.plantsNear(hx, hy, HOME_SCAN_PX)) {
      if (!isBloom(p) || this.flowerFor(p.species) === null) continue;
      const nectar = this.nectarOf(p);
      if (nectar < this.emptyThreshold) continue;
      const dist = Math.sqrt((p.x - hx) ** 2 + (p.y - hy) ** 2);
      const score = nectar - (dist / HOME_SCAN_PX) * 0.25;
      if (score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    return best;
  }

  private nearestBloomTo(wx: number, wy: number, flora: Flora): Plant | null {
    let best: Plant | null = null;
    let bd = Infinity;
    for (const p of flora.plantsNear(wx, wy, HOME_SCAN_PX)) {
      if (!isBloom(p) || this.flowerFor(p.species) === null) continue;
      const d = (p.x - wx) ** 2 + (p.y - wy) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  /** Place a naïve cloud — homes on the nearest bloom; free-roams by default. */
  placeCloud(flora: Flora, wx: number, wy: number): WorldSwarm {
    const sw = makeSwarm(this.rng, undefined, SWARM_CAP);
    sw.population = 12;
    const anchor = this.nearestBloomTo(wx, wy, flora);
    const ent = this.bootstrapEnt(sw, wx, wy, anchor, false, false);
    this.swarms.push(ent);
    return ent;
  }

  /** Snap a cloud onto one bloom — pinned until toggled or retargeted. */
  inviteCloud(_flora: Flora, plant: Plant): WorldSwarm | null {
    if (!isBloom(plant) || this.flowerFor(plant.species) === null) return null;
    const sw = makeSwarm(this.rng, undefined, SWARM_CAP);
    sw.population = 18;
    const ang = this.rng() * Math.PI * 2;
    const ent = this.bootstrapEnt(
      sw,
      plant.x + Math.cos(ang) * RING_MIN_PX,
      plant.y + Math.sin(ang) * RING_MIN_PX,
      plant,
      false,
      true,
    );
    this.swarms.push(ent);
    return ent;
  }

  /** God-retarget: pin this cloud on a flowering plant. */
  retarget(ent: WorldSwarm, plant: Plant): boolean {
    if (!isBloom(plant) || this.flowerFor(plant.species) === null) return false;
    ent.home = { x: plant.x, y: plant.y, species: plant.species };
    ent.visitPlantIdx = plant.idx;
    ent.pinned = true;
    return true;
  }

  setPinned(ent: WorldSwarm, pinned: boolean): void {
    ent.pinned = pinned;
  }

  /** Remove clouds whose home tile (or centre tile) falls in the patch. */
  removeCloudsInTiles(tiles: { x: number; y: number }[]): number {
    const set = new Set(tiles.map((t) => `${t.x},${t.y}`));
    const before = this.swarms.length;
    for (let i = this.swarms.length - 1; i >= 0; i--) {
      const ent = this.swarms[i];
      const tx = Math.floor(ent.x / TILE_SIZE);
      const ty = Math.floor(ent.y / TILE_SIZE);
      const htx = ent.home ? Math.floor(ent.home.x / TILE_SIZE) : tx;
      const hty = ent.home ? Math.floor(ent.home.y / TILE_SIZE) : ty;
      if (set.has(`${tx},${ty}`) || set.has(`${htx},${hty}`)) {
        if (ent.visitPlantIdx !== null) this.plantNectar.delete(ent.visitPlantIdx);
        this.swarms.splice(i, 1);
      }
    }
    return before - this.swarms.length;
  }

  // One island heartbeat: each swarm homes on its nearest flowering plant and
  // feeds + adapts there via the tested core — with a gentle ambient predation
  // pressure, so a conspicuous (poorly camouflaged) cloud is thinned and matching
  // its host buys safety. A well-matched, well-fed swarm now and then POLLINATES
  // that plant, spreading its seed wide and airy (the reciprocal boom, read as
  // spread not a slab). And, on a slow cadence, a bimodal swarm may bud a cousin
  // onto a second nearby flowering species (divergence). Deterministic: every
  // decision draws only from the swarm salt's Rng and the SIM-OWNED home — never
  // the animated cloud position — so the sequence is frame-rate-independent.
  // Bounded + facultative throughout (see the constants) — flora self-seeds
  // without us, caps hold on the far side, and predation never wipes.
  tick(flora: Flora): void {
    let pollinations = 0; // island-wide events this heartbeat, held under the cap
    for (const ent of this.swarms) {
      const feedHost = this.chooseFeedPlant(ent, flora);
      if (!feedHost) continue;
      ent.home = { x: feedHost.x, y: feedHost.y, species: feedHost.species };
      ent.visitPlantIdx = feedHost.idx;
      const flower = this.flowerFor(feedHost.species);
      if (!flower) continue;
      this.stepEntOnHost(ent, feedHost, flower);
      if (pollinations < MAX_POLLINATIONS_PER_TICK) {
        const match = metabolicEfficiency(ent.sw.sensor, flower.map, flower.accent);
        if (match >= POLLINATE_MATCH_MIN) {
          const fill = ent.sw.population / ent.sw.cap;
          if (this.rng() < POLLINATE_CHANCE * match * match * fill) {
            if (flora.pollinateSpread(feedHost, this.pollinateAssist.radius, this.pollinateAssist.maxSame)) {
              pollinations++;
              const log = ent.pollinationLog.get(feedHost.species) ?? { count: 0, lastTick: this.ticks };
              log.count++;
              log.lastTick = this.ticks;
              ent.pollinationLog.set(feedHost.species, log);
              if (++ent.pollinated === BOOM_POLLINATIONS) {
                this.emit({ kind: "boom", name: ent.name, hostSpecies: feedHost.species, x: feedHost.x, y: feedHost.y });
              }
            }
          }
        }
      }
    }
    this.ticks++;
    if (this.ticks % DIVERGE_INTERVAL === 0 && this.swarms.length < SWARM_COUNT_CAP) {
      for (const ent of [...this.swarms]) {
        if (this.budCousin(ent, flora)) break;
      }
    }
  }

  // Try to bud a cousin off `ent`: when its internal pool is genuinely bimodal —
  // part favouring its home flower, part a DIFFERENT nearby flowering species — the
  // tested core's divergeSwarm splits the second cluster off as a new swarm homed
  // on that other species. Bounded by SWARM_COUNT_CAP; returns the cousin, or null
  // when at the cap, no second species is near, or the pool isn't truly bimodal
  // (no forced split). Public so the divergence path is directly exercisable.
  budCousin(ent: WorldSwarm, flora: Flora): WorldSwarm | null {
    if (this.swarms.length >= SWARM_COUNT_CAP || !ent.home) return null;
    const homeFlower = this.flowerFor(ent.home.species);
    if (!homeFlower) return null;
    // the nearest flowering plant of a DIFFERENT species to home on
    let other: Plant | null = null;
    let bd = Infinity;
    for (const p of flora.plantsNear(ent.home.x, ent.home.y, HOME_SCAN_PX)) {
      if (p.species === ent.home.species || !isBloom(p) || this.flowerFor(p.species) === null) continue;
      const d = (p.x - ent.home.x) ** 2 + (p.y - ent.home.y) ** 2;
      if (d < bd) {
        bd = d;
        other = p;
      }
    }
    if (!other) return null;
    const otherFlower = this.flowerFor(other.species)!;
    const child = divergeSwarm(ent.sw, homeFlower, otherFlower, this.rng);
    if (!child) return null;
    const ang = this.rng() * Math.PI * 2;
    const cousin = this.bootstrapEnt(
      child,
      other.x + Math.cos(ang) * RING_MIN_PX,
      other.y + Math.sin(ang) * RING_MIN_PX,
      other,
      false,
      false,
    );
    cousin.name = swarmName(this.seed, cousin.id, child.behavior, true);
    this.swarms.push(cousin);
    this.emit({ kind: "cousin", name: cousin.name, hostSpecies: other.species, x: other.x, y: other.y });
    return cousin;
  }

  // Queue a notable moment for the game loop to witness; bounded, so a layer
  // ticked without a drain (a warm fast-forward) never hoards stale news.
  private emit(ev: SwarmEvent): void {
    this.events.push(ev);
    if (this.events.length > EVENT_QUEUE_CAP) this.events.shift();
  }

  /** Drain the notable moments since the last drain — the game loop's witness
   *  path (murmur / HUD / journal), exactly like flora.takeEvents. */
  takeEvents(): SwarmEvent[] {
    return this.events.splice(0);
  }

  // Per-frame drift: cloud centre eases toward the plant it actually fed this tick —
  // a truthful readout of forage, not a decorative orbit around a stale anchor.
  animate(dt: number): void {
    for (const ent of this.swarms) {
      ent.orbit += dt * 0.6;
      let tx = ent.x;
      let ty = ent.y;
      if (ent.visitPlantIdx !== null && ent.home) {
        const flower = this.flowerFor(ent.home.species);
        const res = flower ? resemblance(ent.sw.sensor, flower.map) : 0;
        const ring = RING_MIN_PX * 0.35 + (1 - res) * RING_RANGE_PX * 0.25;
        tx = ent.home.x + Math.cos(ent.orbit) * ring;
        ty = ent.home.y + Math.sin(ent.orbit) * ring * 0.8;
      } else if (ent.home) {
        const flower = this.flowerFor(ent.home.species);
        const res = flower ? resemblance(ent.sw.sensor, flower.map) : 0;
        const ring = RING_MIN_PX + (1 - res) * RING_RANGE_PX;
        tx = ent.home.x + Math.cos(ent.orbit) * ring;
        ty = ent.home.y + Math.sin(ent.orbit) * ring * 0.8;
      }
      const k = Math.min(1, dt * 1.8);
      ent.x += (tx - ent.x) * k;
      ent.y += (ty - ent.y) * k;
      const activity = moteActivity(ent.sw.population, ent.sw.cap, ent.sw.energy);
      const hasHome = ent.visitPlantIdx !== null && ent.home !== null;
      for (let i = 0; i < ent.motes.length; i++) {
        advanceMote(ent.motes[i], { dt, activity, hasHome, slot: i, orbit: ent.orbit });
      }
    }
  }

  // The nearest swarm to a world point within `rPx` — for the click-to-inspect.
  pick(x: number, y: number, rPx: number): WorldSwarm | null {
    let best: WorldSwarm | null = null;
    let bd = rPx * rPx;
    for (const ent of this.swarms) {
      const d = (ent.x - x) ** 2 + (ent.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = ent;
      }
    }
    return best;
  }

  // Every swarm whose cloud centre is within `rPx` of a point — for the lean-in
  // (E) examine, which lists what's drifting close.
  near(x: number, y: number, rPx: number): WorldSwarm[] {
    const r2 = rPx * rPx;
    return this.swarms
      .filter((e) => (e.x - x) ** 2 + (e.y - y) ** 2 <= r2)
      .sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));
  }

  // The codex readout for one swarm — its map, population, host bloom, how far it
  // has come to resemble it, and its personality. Always returns a card (even with
  // no host yet) so the lab select tool never looks "broken" on a click.
  inspect(ent: WorldSwarm, species: readonly PlantSpecies[]): SwarmInspect {
    const emptyMap = new Uint8Array(MAP_CELLS);
    const emptyAccent = new Uint8Array(MAP_CELLS);
    const pollinationLog: PollinationLogEntry[] = [];
    for (const [sid, row] of ent.pollinationLog) {
      const sp = species[sid];
      const f = this.flowerFor(sid);
      if (!sp || !f) continue;
      pollinationLog.push({
        speciesId: sid,
        speciesName: sp.name,
        count: row.count,
        lastTick: row.lastTick,
        flowerMap: f.map,
        accent: f.accent,
      });
    }
    pollinationLog.sort((a, b) => b.count - a.count || b.lastTick - a.lastTick);

    if (!ent.home) {
      return {
        name: ent.name,
        sensor: ent.sw.sensor,
        population: ent.sw.population,
        energy: ent.sw.energy,
        cap: ent.sw.cap,
        hostName: "no host yet",
        resemblance: 0,
        matchEfficiency: 0,
        nectar: 0,
        pinned: ent.pinned,
        behavior: ent.sw.behavior,
        flowerMap: emptyMap,
        accent: emptyAccent,
        pollinationLog,
      };
    }
    const flower = this.flowerFor(ent.home.species);
    const host = species[ent.home.species];
    if (!flower || !host) {
      return {
        name: ent.name,
        sensor: ent.sw.sensor,
        population: ent.sw.population,
        energy: ent.sw.energy,
        cap: ent.sw.cap,
        hostName: "lost host",
        resemblance: 0,
        matchEfficiency: 0,
        nectar: 0,
        pinned: ent.pinned,
        behavior: ent.sw.behavior,
        flowerMap: emptyMap,
        accent: emptyAccent,
        pollinationLog,
      };
    }
    let nectar = flower.nectar;
    if (ent.visitPlantIdx !== null) {
      const pNectar = this.plantNectar.get(ent.visitPlantIdx);
      if (pNectar !== undefined) nectar = pNectar;
      else if (this.perPlantNectar) nectar = 1;
    }
    const matchEfficiency = metabolicEfficiency(ent.sw.sensor, flower.map, flower.accent);
    return {
      name: ent.name,
      sensor: ent.sw.sensor,
      population: ent.sw.population,
      energy: ent.sw.energy,
      cap: ent.sw.cap,
      hostName: host.name,
      resemblance: resemblance(ent.sw.sensor, flower.map),
      matchEfficiency,
      nectar,
      pinned: ent.pinned,
      behavior: ent.sw.behavior,
      flowerMap: flower.map,
      accent: flower.accent,
      pollinationLog,
    };
  }

  /** Capture the layer for a sim-slot save — deterministic sim state only. */
  snapshot(): SavedSwarmLayer {
    const flowers: SavedSwarmLayer["flowers"] = [];
    for (const [speciesId, flower] of this.flowers) {
      flowers.push({ speciesId, flower: packFlower(flower) });
    }
    const plantNectar: SavedSwarmLayer["plantNectar"] = [];
    if (this.perPlantNectar) {
      for (const [idx, nectar] of this.plantNectar) plantNectar.push({ idx, nectar });
    }
    return {
      rngState: this.rng.state!(),
      ticks: this.ticks,
      swarms: this.swarms.map((ent) => ({
        id: ent.id,
        name: ent.name,
        x: ent.x,
        y: ent.y,
        orbit: ent.orbit,
        pinned: ent.pinned,
        visitPlantIdx: ent.visitPlantIdx,
        pollinated: ent.pollinated,
        pollinationLog: [...ent.pollinationLog.entries()].map(([speciesId, row]) => ({
          speciesId,
          count: row.count,
          lastTick: row.lastTick,
        })),
        home: ent.home ? { ...ent.home } : null,
        sw: packSwarm(ent.sw),
      })),
      flowers,
      plantNectar: plantNectar.length ? plantNectar : undefined,
    };
  }

  /** Rebuild sim state from a saved snapshot into this (empty) bench layer. */
  restore(snapshot: SavedSwarmLayer): void {
    this.rng = makeRng(snapshot.rngState);
    this.ticks = snapshot.ticks;
    this.swarms.length = 0;
    this.flowers.clear();
    for (const { speciesId, flower } of snapshot.flowers) {
      this.flowers.set(speciesId, unpackFlower(flower));
    }
    this.plantNectar.clear();
    if (snapshot.plantNectar) {
      for (const { idx, nectar } of snapshot.plantNectar) this.plantNectar.set(idx, nectar);
    }
    for (const saved of snapshot.swarms) {
      const ent: WorldSwarm = {
        sw: unpackSwarm(saved.sw),
        id: saved.id,
        name: saved.name,
        x: saved.x,
        y: saved.y,
        orbit: saved.orbit,
        motes: this.makeMotesForRestore(saved.id),
        home: saved.home ? { ...saved.home } : null,
        pollinated: saved.pollinated,
        pinned: saved.pinned,
        visitPlantIdx: saved.visitPlantIdx,
        pollinationLog: new Map(
          saved.pollinationLog.map((row) => [row.speciesId, { count: row.count, lastTick: row.lastTick }]),
        ),
      };
      this.swarms.push(ent);
    }
  }
}

// ── witnessing (pure; the game loop asks before it speaks) ────────────────────

/** Whether a layer moment happened where the wanderer could actually SEE it —
 *  the witness gate for boom/cousin surfacing. A HUD line about a bloom
 *  thickening three bays away points at nothing; the game flashes only what is
 *  on (or a breath beyond) the screen and leaves a lasting trace for the rest.
 *  Pure camera math, so it is directly testable. */
export function eventInView(
  ev: { x: number; y: number },
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  marginPx: number = 2 * TILE_SIZE,
): boolean {
  return (
    ev.x >= camX - marginPx &&
    ev.x <= camX + viewW + marginPx &&
    ev.y >= camY - marginPx &&
    ev.y <= camY + viewH + marginPx
  );
}

// ── the pollination web (the C panel's and G ledger's shared data) ────────────
// The island's swarms grouped by the flowering kind they work. Pure over the
// layer — no DOM, no draw — so both surfaces read the same truth. A bloom worked
// by ONE cloud carries that cloud's codex NAME and its live genome (sensor +
// behaviour, enough to draw the very insect the world flies); a bloom worked by
// several stays a group row but still carries the most-populous cloud's insect.
// This is the cross-reference a wanderer wants: the web names what the sky flies.

export interface PollinationLink {
  host: PlantSpecies; // the flowering plant the swarm works (drawn as its sprite)
  hostName: string;
  hostCount: number; // plants of this flowering kind on the island now
  swarmCount: number; // clouds working this bloom
  population: number; // insects across those clouds
  colors: string[]; // the swarm's palette — its adaptation, rendered as colour
  matched: boolean; // well-adapted (pollinates, hugs the bloom) vs still ranging (only feeds)
  name: string | null; // the cloud's codex name — carried only when ONE cloud works this bloom
  insect: { sensor: IdMap; behavior: BehaviorGenes }; // the leading cloud, drawable via getInsectSprites
}

export interface PollenView {
  links: PollinationLink[];
  cloudsTotal: number;
  population: number;
  species: number;
}

/** Group the layer's swarms by the flowering kind they work — matched-first,
 *  then the biggest booms. `countOf` answers how many plants of a kind stand on
 *  the island now (the game hands in flora.speciesCounts). */
export function buildPollen(
  layer: SwarmLayer,
  species: readonly PlantSpecies[],
  countOf: (speciesId: number) => number,
): PollenView {
  interface Group {
    host: PlantSpecies;
    population: number;
    swarmCount: number;
    resSum: number;
    bestPop: number;
    rep: WorldSwarm; // the most-populous cloud — it carries the row's name/insect/palette
  }
  const groups = new Map<number, Group>();
  let population = 0;
  for (const ent of layer.swarms) {
    population += ent.sw.population;
    // inspect gives us the resemblance + population + a live host in one call
    const info = layer.inspect(ent, species);
    if (!info || !ent.home) continue;
    const sid = ent.home.species;
    const host = species[sid];
    if (!host) continue;
    let g = groups.get(sid);
    if (!g) {
      g = { host, population: 0, swarmCount: 0, resSum: 0, bestPop: -1, rep: ent };
      groups.set(sid, g);
    }
    g.population += info.population;
    g.swarmCount++;
    g.resSum += info.resemblance;
    if (info.population > g.bestPop) {
      g.bestPop = info.population;
      g.rep = ent;
    }
  }
  const links: PollinationLink[] = [...groups.values()].map((g) => ({
    host: g.host,
    hostName: g.host.name,
    hostCount: countOf(g.host.id),
    swarmCount: g.swarmCount,
    population: Math.round(g.population),
    colors: swarmPalette(g.rep.sw, 5),
    matched: g.resSum / g.swarmCount >= 0.5, // visibly like the flower → pollinates
    name: g.swarmCount === 1 ? g.rep.name : null, // one cloud, one name — a group stays a group
    insect: { sensor: g.rep.sw.sensor, behavior: g.rep.sw.behavior },
  }));
  // matched-first, then the biggest booms — the living headline leads
  links.sort((a, b) => Number(b.matched) - Number(a.matched) || b.population - a.population);
  return {
    links,
    cloudsTotal: layer.swarms.length,
    population: Math.round(population),
    species: links.length,
  };
}

// ── the courted cloud (a planted bloom drawing a swarm) ───────────────────────
// The loop's one big player verb — sow a flower, and a cloud may take it for
// home — used to close in silence. The game keeps the identity of every bloom
// the wanderer's own hand set down; these two helpers let it notice, purely and
// testably, the first cloud found working one of them.

/** The identity of one planted bloom, as the swarm layer's `home` would name it. */
export function sowKey(species: number, x: number, y: number): string {
  return `${species}:${x}:${y}`;
}

/** The first cloud whose home bloom is one the player sowed — null when none
 *  has come courting (or nothing has been planted). */
export function courtingSwarm(
  swarms: readonly WorldSwarm[],
  sown: ReadonlySet<string>,
): WorldSwarm | null {
  if (sown.size === 0) return null;
  for (const ent of swarms) {
    if (ent.home && sown.has(sowKey(ent.home.species, ent.home.x, ent.home.y))) return ent;
  }
  return null;
}

// ── render helpers (pure; the camera transform lives in the Renderer) ─────────

/** The dominant visible colour of a map — its most common coloured cell, through
 *  the same appearanceColors the portrait uses. All-neutral falls back to a faint
 *  mint (a naive generalist reads as mint, not a void). */
export function dominantColor(map: IdMap): string {
  const cols = appearanceColors(map);
  const tally = new Map<string, number>();
  for (let i = 0; i < MAP_CELLS; i++) {
    if (map[i] === 0) continue;
    tally.set(cols[i], (tally.get(cols[i]) ?? 0) + 1);
  }
  let best = "";
  let bv = -1;
  for (const [c, n] of tally) {
    if (n > bv) {
      bv = n;
      best = c;
    }
  }
  return best || "rgb(127, 224, 196)";
}

/** A small spread of a swarm's genome colours (from its internal gene pool), so a
 *  cloud reads as many related individuals, not one flat tint — and the palette
 *  visibly shifts toward the flower as the pool adapts. Recompute per frame. */
export function swarmPalette(sw: Swarm, k = 4): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.min(k, sw.pool.length); i++) out.push(dominantColor(sw.pool[i]));
  return out.length ? out : [dominantColor(sw.sensor)];
}

/** Turn an `rgb(...)`/`hsl(...)` swatch into the same colour at a given alpha. */
export function tint(color: string, alpha: number): string {
  const h = color.match(/hsl\(([^)]+)\)/);
  if (h) return `hsla(${h[1]}, ${alpha})`;
  const r = color.match(/rgb\(([^)]+)\)/);
  if (r) return `rgba(${r[1]}, ${alpha})`;
  return color;
}
