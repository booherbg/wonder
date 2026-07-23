import { Critter, CritterMood, CritterSpecies, CritterState } from "../life/fauna";
import { Flora, Plant } from "../life/flora";
import { Genome, NUMERIC_TRAITS, PlantForm } from "../life/genome";
import { PlantSpecies } from "../life/species";
import { Inventory } from "./inventory";

// A world is worth keeping because of what it has BECOME: the drifted
// genomes. Everything else regrows from the seed. Compact format: traits
// rounded to 3 decimals, form recovered from the species archetype
// (form never mutates).

export interface SavedWorld {
  v: 1;
  seed: number;
  tick: number;
  savedAt: number; // epoch ms — lets the island live while you're away
  name?: string; // a name the wanderer gave this world, if any
  playMs?: number; // real time spent here — so weighty saves are obvious
  player: [number, number];
  home: [number, number] | null;
  inv: number[][]; // [species, ...traits]
  plants: number[][]; // [species, x, y, born, ...traits]
  critters?: number[][]; // [species, x, y, energy] — the animals, where you left them
  crittersV2?: SavedCritterV2[]; // full behavioral state + rng-resumable meal; absent in saves from before slice 5a
  critterRngState?: number; // the sim critter rng stream position, so animals resume mid-thought; absent in saves from before slice 5a
  daughters?: SavedDaughter[]; // species that arose here after worldgen
  memories?: string[]; // weather memory: rare events this island has witnessed
  camp?: SavedCamp; // the wanderer's camp: materials carried, nodes taken, fire built
  soil?: number[]; // tiles the wanderer tilled with soil (row-major keys); absent before digging
}

export interface SavedCamp {
  wood: number;
  stone: number;
  rush?: number; // absent in saves from before the bedroll
  soil?: number; // clods of soil carried; absent in saves from before digging
  taken: number[]; // material node indices already gathered
  fire: boolean;
  bedroll?: boolean;
  companion?: SavedCompanion; // absent in saves from before companions
}

// The friend at your heel, kept across a reload. Individuals respawn each
// load, so what the save keeps is the kind: on return, the nearest of this
// species is re-designated your companion — waiting where you left it.
export interface SavedCompanion {
  species: number; // the kind that walks with you
  name: string; // its kind's name, so the welcome back can speak it plainly
}

// A daughter species is the one thing besides genomes the seed can't regrow.
export interface SavedDaughter {
  name: string;
  habitat: number;
  parent: number;
  density: number;
  form: number;
  traits: number[]; // packGenome order
  born: number; // flora tick of the split
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function packGenome(g: Genome): number[] {
  return NUMERIC_TRAITS.map((k) => r3(g[k]));
}

export function unpackGenome(form: PlantForm, vals: number[]): Genome {
  const g = { form } as Genome;
  NUMERIC_TRAITS.forEach((k, i) => {
    g[k] = vals[i];
  });
  return g;
}

export function packWorld(
  seed: number,
  tick: number,
  player: { x: number; y: number },
  home: { x: number; y: number } | null,
  inventory: Inventory,
  plants: readonly Plant[],
  savedAt: number,
  daughters: readonly PlantSpecies[] = [],
  memories: readonly string[] = [],
  camp?: SavedCamp,
  critters: readonly Critter[] = [],
  extra: {
    name?: string;
    playMs?: number;
    soil?: number[];
    crittersV2?: SavedCritterV2[];
    critterRngState?: number;
  } = {},
): SavedWorld {
  return {
    v: 1,
    seed,
    tick,
    savedAt,
    name: extra.name,
    playMs: extra.playMs,
    soil: extra.soil && extra.soil.length > 0 ? [...extra.soil] : undefined,
    crittersV2: extra.crittersV2,
    critterRngState: extra.critterRngState,
    player: [r1(player.x), r1(player.y)],
    home: home ? [home.x, home.y] : null,
    inv: inventory.seeds.map((s) => [s.species, ...packGenome(s.genome)]),
    plants: plants.map((p) => [p.species, r1(p.x), r1(p.y), p.born, ...packGenome(p.genome)]),
    critters: critters.map((c) => [c.species, r1(c.x), r1(c.y), r3(c.energy)]),
    daughters: daughters.map((s) => ({
      name: s.name,
      habitat: s.habitat,
      parent: s.parent ?? 0,
      density: r3(s.density),
      form: s.archetype.form,
      traits: packGenome(s.archetype),
      born: s.bornTick ?? 0,
    })),
    memories: [...memories],
    camp,
  };
}

// Daughter species arose after worldgen, so the seed can't rebuild them:
// re-append them (in saved order, so plant indices resolve unchanged).
export function restoreDaughters(saved: SavedWorld, species: PlantSpecies[]): void {
  for (const d of saved.daughters ?? []) {
    if (d.parent < 0 || d.parent >= species.length) continue;
    species.push({
      id: species.length,
      name: d.name,
      habitat: d.habitat,
      archetype: unpackGenome(d.form, d.traits),
      density: d.density,
      sport: false,
      parent: d.parent,
      bornTick: d.born,
    });
  }
}

export function restorePlants(
  saved: SavedWorld,
  species: PlantSpecies[],
): { species: number; genome: Genome; x: number; y: number; born: number }[] {
  const out: { species: number; genome: Genome; x: number; y: number; born: number }[] = [];
  for (const row of saved.plants) {
    const sp = row[0];
    if (sp < 0 || sp >= species.length) continue;
    out.push({
      species: sp,
      x: row[1],
      y: row[2],
      born: row[3],
      genome: unpackGenome(species[sp].archetype.form, row.slice(4)),
    });
  }
  return out;
}

// The animals, restored where you left them — energy kept; momentary state
// (where it was headed, its hop) is let go, chosen fresh on the next tick.
export function restoreCritters(saved: SavedWorld, speciesList: CritterSpecies[]): Critter[] {
  const out: Critter[] = [];
  (saved.critters ?? []).forEach((row, i) => {
    const sp = row[0];
    if (sp < 0 || sp >= speciesList.length) return;
    const x = row[1];
    const y = row[2];
    out.push({
      species: sp,
      x,
      y,
      state: "idle",
      targetX: x,
      targetY: y,
      stateTime: (i % 5) * 0.4,
      hopPhase: (i * 1.7) % 6.28,
      facing: i % 2 === 0 ? 1 : -1,
      energy: row[3],
      curiosity: 0,
      mood: "content",
    });
  });
  return out;
}

// The full Critter state, losslessly — every field of the Critter interface
// (fauna.ts). Additive to the legacy 4-element `critters` rows; consulted only
// when present, so old saves are byte-for-byte unaffected. `meal` (a live Plant
// reference) is stored as its flora.all index and re-resolved after restore.
export interface SavedCritterV2 {
  species: number;
  x: number;
  y: number;
  state: CritterState;
  targetX: number;
  targetY: number;
  stateTime: number;
  hopPhase: number;
  facing: 1 | -1;
  energy: number;
  meal?: number | null; // absent = no meal field; null = explicitly none; number = index into flora.all at save
  treat?: boolean;
  // NOTE: no `companion` field, deliberately. The friend at your heel is
  // re-derived on load from SavedCamp.companion + takeCompanion (a per-KIND
  // designation, not a per-critter one), and the sim slot has no companion
  // concept at all. Persisting a per-critter companion:true here would risk
  // desyncing from SavedCamp.companion's re-derivation — omit it, preserving
  // today's re-derive-only behavior.
  curiosity: number;
  mood: CritterMood;
  stuck?: number;
  path?: number[];
  pathGoal?: number;
}

export function packCrittersV2(critters: Critter[]): SavedCritterV2[] {
  return critters.map((c) => {
    const row: SavedCritterV2 = {
      species: c.species,
      x: c.x, // LOSSLESS — no r1/r3; bit-identical replay depends on it
      y: c.y,
      state: c.state,
      targetX: c.targetX,
      targetY: c.targetY,
      stateTime: c.stateTime,
      hopPhase: c.hopPhase,
      facing: c.facing,
      energy: c.energy,
      curiosity: c.curiosity,
      mood: c.mood,
    };
    if (c.meal === null) row.meal = null;
    else if (c.meal) row.meal = c.meal.idx;
    if (c.treat !== undefined) row.treat = c.treat;
    // companion intentionally NOT serialized — re-derived on load, see SavedCritterV2's note
    if (c.stuck !== undefined) row.stuck = c.stuck;
    if (c.path !== undefined) row.path = c.path.slice();
    if (c.pathGoal !== undefined) row.pathGoal = c.pathGoal;
    return row;
  });
}

export function restoreCritterRows(
  rows: SavedCritterV2[],
  speciesList: CritterSpecies[],
  flora: Flora,
): Critter[] {
  const out: Critter[] = [];
  for (const row of rows) {
    const sp = row.species;
    if (sp < 0 || sp >= speciesList.length) continue; // drop out-of-range kinds (matches restoreCritters)
    const c: Critter = {
      species: sp,
      x: row.x,
      y: row.y,
      state: row.state,
      targetX: row.targetX,
      targetY: row.targetY,
      stateTime: row.stateTime,
      hopPhase: row.hopPhase,
      facing: row.facing,
      energy: row.energy,
      curiosity: row.curiosity,
      mood: row.mood,
    };
    if (row.meal === null) c.meal = null;
    else if (typeof row.meal === "number") {
      const p = flora.all[row.meal];
      if (p) c.meal = p; // re-resolve to the live plant; the tick guard re-validates anyway
    }
    if (row.treat !== undefined) c.treat = row.treat;
    // companion intentionally NOT restored from the row — re-derived by the
    // caller (takeCompanion against SavedCamp.companion), see SavedCritterV2's note
    if (row.stuck !== undefined) c.stuck = row.stuck;
    if (row.path !== undefined) c.path = row.path.slice();
    if (row.pathGoal !== undefined) c.pathGoal = row.pathGoal;
    out.push(c);
  }
  return out;
}

// The restore dispatcher: full state when a crittersV2 block is present,
// else today's exact restoreCritters defaults (the guard-tested legacy path).
export function restoreCrittersV2(
  saved: SavedWorld,
  speciesList: CritterSpecies[],
  flora: Flora,
): Critter[] {
  return saved.crittersV2
    ? restoreCritterRows(saved.crittersV2, speciesList, flora)
    : restoreCritters(saved, speciesList);
}

export function restoreInventory(saved: SavedWorld, species: PlantSpecies[]): Inventory {
  return {
    seeds: saved.inv
      .filter((row) => row[0] >= 0 && row[0] < species.length)
      .map((row) => ({
        species: row[0],
        genome: unpackGenome(species[row[0]].archetype.form, row.slice(1)),
      })),
  };
}

export function worldKey(seed: number): string {
  return `wander.world.${seed}`;
}

export const WORLD_INDEX_KEY = "wander.worlds";
export const MAX_SAVED_WORLDS = 8;
