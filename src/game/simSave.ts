// The Simulator slot — a saved World-Lab construct, in a key namespace STRICTLY
// separate from real worlds (simSlotKey/SIM_INDEX_KEY vs worldKey/WORLD_INDEX_KEY),
// so a sim slot can never collide with or evict a real wander.world.<seed> entry.
// Its own v:1 marker from day one (SavedWorld lacks a migration path — facts §6).
import type { StarterKind } from "../world/construct";
import { buildConstruct } from "../world/construct";
import type { PlantSpecies } from "../life/species";
import type { CritterSpecies } from "../life/fauna";
import type { Genome } from "../life/genome";
import type { FloraTuning, Substrate } from "../life/flora";
import { packCrittersV2, restoreCritterRows, type SavedCritterV2 } from "./save";
import type { DrawerEntry } from "./simDrawer";
import { cloneDef, syncKeySeq } from "./simDrawer";
import type { SpeciesTrace } from "../life/census";
import { SimKernel } from "../life/kernel";

export const SIM_INDEX_KEY = "wander.sims"; // parallel to WORLD_INDEX_KEY = "wander.worlds"
export const MAX_SAVED_SIMS = 8; // mirrors MAX_SAVED_WORLDS

export function simSlotKey(id: string): string {
  return `wander.sim.${id}`; // parallel to worldKey's `wander.world.${seed}` — never a shared prefix
}

export interface SimSlotMeta {
  id: string;
  name: string; // a sim slot names itself (not seed-derived); the user-chosen name is its only name
  savedAt: number; // epoch ms — UI metadata, never a sim input
}

export interface SavedSimPlant {
  species: number;
  genome: Genome; // stored wholesale (lossless) — bit-identical replay depends on it
  x: number;
  y: number;
  born: number;
}

export interface SavedSimFlora {
  tick: number;
  plants: SavedSimPlant[];
  soil?: number[];
  rngState: number;
  substrates?: Substrate[];
  suppressed?: number[];
  lastSplitTick?: number; // omitted when -Infinity (never split yet)
  // the LIVE FloraTuning (the pressures panel's setTuning may have mutated it
  // away from DEFAULT_TUNING) — captured wholesale so a resumed run doesn't
  // silently snap back to defaults; optional so a pre-Task-8 SavedSim (e.g.
  // the stub literals in this file's earlier tests) still typechecks.
  tuning?: FloraTuning;
}

export interface SavedSimControl {
  playing: boolean;
  fidelity: "plants" | "full";
  speedMul: number;
  stepN: number;
}

export interface SavedSim {
  v: 1;
  savedAt: number;
  name: string;
  starter: StarterKind;
  seed: number;
  width: number; // for a defensive dim check on restore
  height: number;
  tiles?: number[]; // the full tile grid, ONLY when painted (differs from buildConstruct(starter, seed))
  flora: SavedSimFlora;
  critters: SavedCritterV2[]; // full behavioral state (reuses save.ts's lossless rows)
  critterRngState: number;
  placeRngState: number;
  plantSpecies: PlantSpecies[]; // wholesale, INCLUDING runtime introduces + mutations
  critterSpecies: CritterSpecies[]; // wholesale, INCLUDING runtime den/role mutations (facts §4)
  drawer: DrawerEntry[]; // the roster/palette roster, plain data
  census?: SpeciesTrace[]; // optional — chart continuity only, feeds no rng
  control?: SavedSimControl; // optional — UI pacing continuity
}

export function readSimIndex(store: Storage): SimSlotMeta[] {
  const raw = store.getItem(SIM_INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SimSlotMeta[]) : [];
  } catch {
    return []; // defensive — a corrupt index reads as empty, never throws
  }
}

export function saveSimSlot(store: Storage, meta: SimSlotMeta, blob: SavedSim): void {
  store.setItem(simSlotKey(meta.id), JSON.stringify(blob));
  const index = readSimIndex(store).filter((m) => m.id !== meta.id); // drop any prior entry for this id
  index.unshift(meta); // most-recent-first
  while (index.length > MAX_SAVED_SIMS) {
    const evicted = index.pop()!;
    store.removeItem(simSlotKey(evicted.id)); // evict the oldest blob too, never orphan it
  }
  store.setItem(SIM_INDEX_KEY, JSON.stringify(index));
}

export function loadSimSlot(store: Storage, id: string): SavedSim | null {
  const raw = store.getItem(simSlotKey(id));
  if (!raw) return null;
  try {
    const blob = JSON.parse(raw) as SavedSim;
    return blob.v === 1 ? blob : null; // only the version we understand
  } catch {
    return null;
  }
}

export function forgetSimSlot(store: Storage, id: string): void {
  store.removeItem(simSlotKey(id));
  const index = readSimIndex(store).filter((m) => m.id !== id);
  store.setItem(SIM_INDEX_KEY, JSON.stringify(index));
}

// ── packSim / restoreSim ──────────────────────────────────────────────────
// The whole-slot round trip: every determinism-critical crumb of a running
// SimKernel + its drawer, gathered into (or rebuilt from) a SavedSim. Field
// names below MUST mirror each other exactly — this is why both live in one
// function pair rather than being split across files.

export interface PackSimInput {
  kernel: SimKernel;
  drawer: DrawerEntry[];
  starter: StarterKind;
  seed: number;
  name: string;
  savedAt: number;
  control?: SavedSimControl;
}

// The tile grid ONLY when it has been hand-painted away from the pure
// buildConstruct(starter, seed) baseline; else undefined (buildConstruct
// reproduces it on restore). Small: width*height bytes when painted.
function tilesIfPainted(tiles: Uint8Array, starter: StarterKind, seed: number): number[] | undefined {
  const base = buildConstruct(starter, seed).tiles;
  if (base.length !== tiles.length) return Array.from(tiles); // defensive: any dim drift → persist wholesale
  for (let i = 0; i < tiles.length; i++) if (tiles[i] !== base[i]) return Array.from(tiles);
  return undefined;
}

export function packSim(input: PackSimInput): SavedSim {
  const { kernel, drawer, starter, seed, name, savedAt, control } = input;
  const lastSplit = kernel.flora.lastSplitTickValue();
  return {
    v: 1,
    savedAt,
    name,
    starter,
    seed,
    width: kernel.map.width,
    height: kernel.map.height,
    tiles: tilesIfPainted(kernel.map.tiles, starter, seed),
    flora: {
      tick: kernel.flora.tick,
      plants: kernel.flora.all.map((p) => ({ species: p.species, genome: cloneDef(p.genome), x: p.x, y: p.y, born: p.born })),
      soil: kernel.flora.soilTileKeys(),
      rngState: kernel.flora.rngState(),
      substrates: kernel.flora.substratesSnapshot(),
      suppressed: [...kernel.flora.suppressedSpecies],
      lastSplitTick: Number.isFinite(lastSplit) ? lastSplit : undefined, // -Infinity is not JSON-safe
      tuning: cloneDef(kernel.flora.tuning), // the LIVE tuning (carry-forward #2) — not a fresh default
    },
    critters: packCrittersV2(kernel.critters, kernel.flora),
    critterRngState: kernel.critterRngState(),
    placeRngState: kernel.placeRngState(),
    plantSpecies: cloneDef(kernel.plantSpecies), // wholesale, incl. runtime introduces (carry-forward #1)
    critterSpecies: cloneDef(kernel.critterSpecies), // wholesale, incl. den/role mutations (carry-forward #1)
    drawer: cloneDef(drawer),
    // captured for a future chart-continuity nicety only — restoreSim has no path
    // to rebuild it yet (deferred; not determinism-critical, feeds no rng).
    census: kernel.census.list(),
    control,
  };
}

export interface RestoredSim {
  kernel: SimKernel;
  drawer: DrawerEntry[];
  starter: StarterKind;
  control?: SavedSimControl;
}

export function restoreSim(saved: SavedSim): RestoredSim {
  const map = buildConstruct(saved.starter, saved.seed);
  if (saved.tiles) {
    if (saved.tiles.length !== map.tiles.length) {
      throw new Error(`sim slot dim mismatch: ${saved.tiles.length} vs ${map.tiles.length}`);
    }
    map.tiles.set(saved.tiles); // overlay the painted grid
  }
  const plantSpecies = cloneDef(saved.plantSpecies);
  const critterSpecies = cloneDef(saved.critterSpecies);
  const kernel = new SimKernel({
    map,
    plantSpecies,
    critterSpecies,
    seed: saved.seed,
    tuning: saved.flora.tuning ? cloneDef(saved.flora.tuning) : undefined, // carry-forward #2
    restoredFlora: {
      tick: saved.flora.tick,
      plants: saved.flora.plants,
      soil: saved.flora.soil,
      rngState: saved.flora.rngState,
      substrates: saved.flora.substrates,
      suppressed: saved.flora.suppressed,
      lastSplitTick: saved.flora.lastSplitTick,
    },
    critterRngState: saved.critterRngState,
    placeRngState: saved.placeRngState,
  });
  // critters restored after the kernel exists so meal re-resolves against kernel.flora
  kernel.critters = restoreCritterRows(saved.critters, critterSpecies, kernel.flora);
  const drawer = cloneDef(saved.drawer);
  syncKeySeq(drawer); // new entries won't collide with resumed keys
  return { kernel, drawer, starter: saved.starter, control: saved.control };
}
