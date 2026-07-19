import { Genome } from "../life/genome";
import { KV } from "./murmurs";

// The field journal: a memoir that writes itself. Every species you lean
// close to (E) earns an entry — its sketch, where you first met it, and how
// far you've watched it drift. Never a checklist; there is nothing to finish.

export interface JournalEntry {
  key: string; // `${seed}:${speciesId}` — one entry per kind per island
  seed: number;
  island: string;
  speciesName: string;
  genome: Genome; // the freshest sketch of the kind
  aquatic: boolean;
  firstMetAt: number; // epoch ms
  maxDrift: number; // the furthest drift (%) ever witnessed in this kind
  sightings: number;
  eatenBy?: string[]; // critter kinds seen grazing this kind, in first-seen order
}

export const JOURNAL_KEY = "wander.journal";
export const JOURNAL_CAP = 400;
export const EATEN_BY_CAP = 6;

function defaultKV(): KV | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadJournal(kv: KV | null = defaultKV()): JournalEntry[] {
  try {
    const raw = kv?.getItem(JOURNAL_KEY);
    const arr = raw ? (JSON.parse(raw) as JournalEntry[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export interface Sighting {
  seed: number;
  island: string;
  speciesId: number;
  speciesName: string;
  genome: Genome;
  aquatic: boolean;
  drift: number; // percent
  at: number; // epoch ms
}

export function recordSighting(s: Sighting, kv: KV | null = defaultKV()): void {
  if (!kv) return;
  try {
    const all = loadJournal(kv);
    const key = `${s.seed}:${s.speciesId}`;
    const existing = all.find((e) => e.key === key);
    if (existing) {
      existing.genome = s.genome;
      existing.speciesName = s.speciesName; // names can gain marks (✧)
      existing.maxDrift = Math.max(existing.maxDrift, s.drift);
      existing.sightings++;
    } else {
      all.push({
        key,
        seed: s.seed,
        island: s.island,
        speciesName: s.speciesName,
        genome: s.genome,
        aquatic: s.aquatic,
        firstMetAt: s.at,
        maxDrift: s.drift,
        sightings: 1,
      });
    }
    const kept =
      all.length > JOURNAL_CAP
        ? [...all].sort((a, b) => b.firstMetAt - a.firstMetAt).slice(0, JOURNAL_CAP)
        : all;
    kv.setItem(JOURNAL_KEY, JSON.stringify(kept));
  } catch {
    // storage full or unavailable: the meeting still happened
  }
}

// A link learned only by watching: stand still, see a critter chew, and the
// plant's page quietly notes who eats it. No page yet, no note — you only
// learn what eats a kind you've already met, so two journals may disagree
// and both be right.
export function recordForage(
  seed: number,
  plantSpeciesId: number,
  critterName: string,
  kv: KV | null = defaultKV(),
): void {
  if (!kv) return;
  try {
    const all = loadJournal(kv);
    const entry = all.find((e) => e.key === `${seed}:${plantSpeciesId}`);
    if (!entry) return;
    const eatenBy = entry.eatenBy ?? [];
    if (eatenBy.includes(critterName) || eatenBy.length >= EATEN_BY_CAP) return;
    eatenBy.push(critterName);
    entry.eatenBy = eatenBy;
    kv.setItem(JOURNAL_KEY, JSON.stringify(all));
  } catch {
    // storage full or unavailable: the watching still happened
  }
}
