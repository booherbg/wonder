// The Simulator slot — a saved World-Lab construct, in a key namespace STRICTLY
// separate from real worlds (simSlotKey/SIM_INDEX_KEY vs worldKey/WORLD_INDEX_KEY),
// so a sim slot can never collide with or evict a real wander.world.<seed> entry.
// Its own v:1 marker from day one (SavedWorld lacks a migration path — facts §6).
import type { StarterKind } from "../world/construct";
import type { PlantSpecies } from "../life/species";
import type { CritterSpecies } from "../life/fauna";
import type { Genome } from "../life/genome";
import type { Substrate } from "../life/flora";
import type { SavedCritterV2 } from "./save";
import type { DrawerEntry } from "./simDrawer";
import type { SpeciesTrace } from "../life/census";

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
