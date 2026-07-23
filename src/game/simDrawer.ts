// The drawer (species roster) — the Sim's cast list, kept as a pure model so
// its status arithmetic and delete/revive/daughter-capture are tested headless;
// the panel in worldlab.ts is only its view. Each entry holds a DEEP-CLONED
// full definition (the spec's "not just a live reference"), so a kind survives
// deletion and can be re-spawned. Daughters (flora's ✧ speciation) are
// auto-captured as first-class entries. Pure: no DOM, no rng, no wall clock.

import { CritterSpecies } from "../life/fauna";
import { PlantSpecies } from "../life/species";

export type EntryKind = "plant" | "critter";
export type EntryOrigin = "starter" | "rolled" | "daughter" | "cloned";

export interface DrawerEntry {
  key: string; // a stable UI key, unique per entry
  kind: EntryKind;
  speciesId: number; // index into kernel.plantSpecies / critterSpecies
  name: string;
  def: PlantSpecies | CritterSpecies; // a deep-cloned full definition, for revive
  origin: EntryOrigin;
  parentId?: number; // for a daughter: the species id it split from
  looksIterations: number; // iterate-looks applied to this kind (a variation count)
  peak: number; // highest population seen — so "extinct" means lived-then-lost
  deleted: boolean; // a delete tombstone; the def is preserved
  pinned: boolean; // curate: this phenotype is the one to re-seed from
}

export interface EntryStatus {
  count: number;
  extinct: boolean;
  variations: number;
}

// A deep clone of a plain species record (genome numbers, strings, a nested
// morph/palate/den — all JSON-safe). structuredClone where present, else a
// JSON round-trip. Optional-undefined fields simply drop, which is harmless.
export function cloneDef<T>(def: T): T {
  const sc = (globalThis as { structuredClone?: <U>(v: U) => U }).structuredClone;
  return sc ? sc(def) : (JSON.parse(JSON.stringify(def)) as T);
}

let keySeq = 0;

// exported so the sim slot can mint fresh, collision-free keys after a resume
export function nextDrawerKey(): string {
  return `e${keySeq++}`; // the file's existing format — an "e" prefix, no dash
}

// after restoring a saved roster, advance the shared counter past every restored
// key's numeric suffix, so new entries never collide with resumed ones (facts §4)
export function syncKeySeq(entries: DrawerEntry[]): void {
  for (const e of entries) {
    const suffix = Number(e.key.slice(1)); // strip the "e" prefix — real keys are "e0"/"e42", never dashed
    if (Number.isFinite(suffix) && suffix >= keySeq) keySeq = suffix + 1;
  }
}

export function makeEntry(args: {
  kind: EntryKind;
  speciesId: number;
  def: PlantSpecies | CritterSpecies;
  origin: EntryOrigin;
  parentId?: number;
}): DrawerEntry {
  return {
    key: nextDrawerKey(),
    kind: args.kind,
    speciesId: args.speciesId,
    name: args.def.name,
    def: cloneDef(args.def),
    origin: args.origin,
    parentId: args.parentId,
    looksIterations: 0,
    peak: 0,
    deleted: false,
    pinned: false,
  };
}

// The only mutation the model makes: track the high-water population so
// "extinct" can mean lived-then-lost, not merely never-placed. Called each
// refresh with the kind's live count.
export function bumpPeak(entry: DrawerEntry, count: number): void {
  if (count > entry.peak) entry.peak = count;
}

// Pure status for one entry against its live count. Extinct = it once lived
// (peak>0) and is now gone (count 0), and wasn't deliberately deleted (a
// tombstone reads as "removed", never "extinct"). Variations = iterated looks
// plus daughters captured under this kind.
export function statusOf(entry: DrawerEntry, count: number, entries: readonly DrawerEntry[]): EntryStatus {
  const daughters = entries.filter((e) => e.origin === "daughter" && e.parentId === entry.speciesId).length;
  return {
    count,
    extinct: !entry.deleted && entry.peak > 0 && count === 0,
    variations: entry.looksIterations + daughters,
  };
}

// The daughters flora has surfaced that the drawer hasn't captured yet: any
// plant species record carrying a `parent` whose id isn't already an entry.
// Daughter events (takeEvents) carry no id, but the daughter RECORD is appended
// to plantSpecies with `parent` set — so we scan the array. Returns the fresh
// entries to append; idempotent once they're in `entries`.
export function captureDaughters(
  plantSpecies: readonly PlantSpecies[],
  entries: readonly DrawerEntry[],
): DrawerEntry[] {
  const known = new Set(entries.filter((e) => e.kind === "plant").map((e) => e.speciesId));
  const fresh: DrawerEntry[] = [];
  for (const sp of plantSpecies) {
    if (sp.parent === undefined || known.has(sp.id)) continue;
    fresh.push(makeEntry({ kind: "plant", speciesId: sp.id, def: sp, origin: "daughter", parentId: sp.parent }));
    known.add(sp.id);
  }
  return fresh;
}

// Delete/revive: a tombstone toggle that PRESERVES the stored definition (the
// live instances are cleared by the kernel; the record and this def stay put so
// the id never moves). Immutable-style so callers swap the entry in their list.
export function deleteEntry(entry: DrawerEntry): DrawerEntry {
  return { ...entry, deleted: true };
}
export function reviveEntry(entry: DrawerEntry): DrawerEntry {
  return { ...entry, deleted: false };
}

// Curate: pin a phenotype to RE-SEED from it (the wild output becomes new
// input, spec §"The evolutionary layer"). A pin is a flag on the drawer entry;
// the bench re-places from the entry's STORED def through the seeded kernel.
// Immutable-style, like delete/revive, so callers swap the entry in their list.
export function pinEntry(entry: DrawerEntry): DrawerEntry {
  return { ...entry, pinned: true };
}
export function unpinEntry(entry: DrawerEntry): DrawerEntry {
  return { ...entry, pinned: false };
}
// The kinds curation should re-seed from: pinned, not cleared.
export function pinnedEntries(entries: readonly DrawerEntry[]): DrawerEntry[] {
  return entries.filter((e) => e.pinned && !e.deleted);
}

/** Live tab: kinds still on the roster (not tombstoned). */
export function livePartition(entries: readonly DrawerEntry[]): DrawerEntry[] {
  return entries.filter((e) => !e.deleted);
}

/** Archive tab: cleared kinds kept for restore. */
export function archivePartition(entries: readonly DrawerEntry[]): DrawerEntry[] {
  return entries.filter((e) => e.deleted);
}
