import { CritterRole, CritterSpecies } from "../life/fauna";
import { Genome } from "../life/genome";
import { IslandRelief, RELIEF_PHRASE } from "../world/generate";
import { Tile, WorldMap } from "../world/types";
import { KV } from "./murmurs";

// The field journal: a memoir that writes itself. Everything you lean close
// to (E) earns an entry — plants with their sketches and every color they've
// been caught wearing, critters with their portraits and what watching has
// taught — and the island itself opens the book: its grounds, its landforms,
// its remembered weather. Never a checklist; there is nothing to finish.

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
  eatenBy?: string[]; // grazer kinds seen consuming this kind, in first-seen order
  spreadBy?: string[]; // disperser kinds seen spreading this kind, in first-seen order
  varieties?: ColorVariety[]; // the distinct coats witnessed — one kind, many colors
}

// One species, many coats: same-species plants drift in hue, so each page
// keeps a small row of the truly-different colors it has been caught
// wearing. Enough to press a swatch, no more.
export interface ColorVariety {
  hue: number;
  hue2: number; // the accent — petal cores, berries, cap spots
  sat: number;
  glow: number; // > 0.8 and the swatch carries the light
}

export const VARIETY_CAP = 6; // a page holds at most six swatches
export const VARIETY_HUE_STEP = 0.05; // hues closer than this read as the same coat

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

const r3 = (n: number): number => Math.round(n * 1000) / 1000;

function toVariety(g: Genome): ColorVariety {
  return { hue: r3(g.hue), hue2: r3(g.hue2), sat: r3(g.sat), glow: r3(g.glow) };
}

// hues live on a wheel: the gap between two is the shorter way around
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

// A color earns a swatch only when it sits a clear step off every swatch
// already pressed; the row is small, and the first-witnessed coats keep
// their places.
function addVariety(row: ColorVariety[], g: Genome): void {
  if (row.length >= VARIETY_CAP) return;
  if (row.some((v) => hueGap(v.hue, g.hue) < VARIETY_HUE_STEP)) return;
  row.push(toVariety(g));
}

export function recordSighting(s: Sighting, kv: KV | null = defaultKV()): void {
  if (!kv) return;
  try {
    const all = loadJournal(kv);
    const key = `${s.seed}:${s.speciesId}`;
    const existing = all.find((e) => e.key === key);
    if (existing) {
      // pages sketched before varieties existed seed their row from the
      // sketch they already carry, then consider the newcomer's coat
      const row = existing.varieties ?? [toVariety(existing.genome)];
      addVariety(row, s.genome);
      existing.varieties = row;
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
        varieties: [toVariety(s.genome)],
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

// A link learned only by watching: stand still, see a critter visit a plant,
// and the plant's page quietly notes the critter — under "spread by" if it
// disperses this kind, "grazed by" if it grazes it. No page yet, no note —
// you only learn about a kind you've already met, so two journals may
// disagree and both be right. Same dedup and cap on either shelf.
function recordVisit(
  field: "eatenBy" | "spreadBy",
  seed: number,
  plantSpeciesId: number,
  critterName: string,
  kv: KV | null,
): void {
  if (!kv) return;
  try {
    const all = loadJournal(kv);
    const entry = all.find((e) => e.key === `${seed}:${plantSpeciesId}`);
    if (!entry) return;
    const names = entry[field] ?? [];
    if (names.includes(critterName) || names.length >= EATEN_BY_CAP) return;
    names.push(critterName);
    entry[field] = names;
    kv.setItem(JOURNAL_KEY, JSON.stringify(all));
  } catch {
    // storage full or unavailable: the watching still happened
  }
}

// A grazer was witnessed consuming this kind → "grazed by".
export function recordForage(
  seed: number,
  plantSpeciesId: number,
  critterName: string,
  kv: KV | null = defaultKV(),
): void {
  recordVisit("eatenBy", seed, plantSpeciesId, critterName, kv);
}

// A disperser was witnessed spreading this kind → "spread by".
export function recordSpread(
  seed: number,
  plantSpeciesId: number,
  critterName: string,
  kv: KV | null = defaultKV(),
): void {
  recordVisit("spreadBy", seed, plantSpeciesId, critterName, kv);
}

// ── creatures ──────────────────────────────────────────────────────────
// The journal's other half: the critters you've leaned close to. Each page
// keeps enough body to draw the portrait from memory on any later island,
// plus how the kind carries itself — a tender or a grazer. What it eats is
// learned separately, by watching, and lives on the plants' pages. Kept on
// its own shelf so plant-only journals from before load untouched.

export interface CritterEntry {
  key: string; // `${seed}:critter:${critterId}` — one entry per kind per island
  seed: number;
  island: string;
  critterId: number;
  name: string;
  role: CritterRole; // a disperser tends; a grazer takes true bites
  bodyHue: number; // enough body to sketch the portrait from memory
  earLen: number;
  tailLen: number;
  size: number;
  firstMetAt: number; // epoch ms
  meetings: number;
}

export const CRITTER_JOURNAL_KEY = "wander.journal.critters";
export const CRITTER_JOURNAL_CAP = 200;

export function loadCritterJournal(kv: KV | null = defaultKV()): CritterEntry[] {
  try {
    const raw = kv?.getItem(CRITTER_JOURNAL_KEY);
    const arr = raw ? (JSON.parse(raw) as CritterEntry[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export interface CritterMeeting {
  seed: number;
  island: string;
  critter: Pick<
    CritterSpecies,
    "id" | "name" | "role" | "bodyHue" | "earLen" | "tailLen" | "size"
  >;
  at: number; // epoch ms
}

// Leaning close (E) with a critter in reach is how a creature page begins;
// meeting the same kind again only deepens it. Met means inspected — a kind
// you've never stood beside has no page, so two journals may differ.
export function recordCritterMeeting(m: CritterMeeting, kv: KV | null = defaultKV()): void {
  if (!kv) return;
  try {
    const all = loadCritterJournal(kv);
    const key = `${m.seed}:critter:${m.critter.id}`;
    const existing = all.find((e) => e.key === key);
    if (existing) {
      existing.meetings++;
    } else {
      all.push({
        key,
        seed: m.seed,
        island: m.island,
        critterId: m.critter.id,
        name: m.critter.name,
        role: m.critter.role,
        bodyHue: r3(m.critter.bodyHue),
        earLen: r3(m.critter.earLen),
        tailLen: r3(m.critter.tailLen),
        size: r3(m.critter.size),
        firstMetAt: m.at,
        meetings: 1,
      });
    }
    const kept =
      all.length > CRITTER_JOURNAL_CAP
        ? [...all].sort((a, b) => b.firstMetAt - a.firstMetAt).slice(0, CRITTER_JOURNAL_CAP)
        : all;
    kv.setItem(CRITTER_JOURNAL_KEY, JSON.stringify(kept));
  } catch {
    // storage full or unavailable: the meeting still happened
  }
}

// ── the island itself ──────────────────────────────────────────────────
// What makes THIS island itself: which grounds it holds, which landforms it
// was born with. Nothing here is witnessed or earned — the place simply is —
// so the almanac may always say it.

export interface IslandCharacter {
  biomes: string[]; // the grounds present, shore to heights
  features: string[]; // born landforms, worded once each
}

export const BIOME_MIN_TILES = 6; // a biome is a place, not a stray pixel

const BIOME_WORDS: ReadonlyArray<readonly [Tile, string]> = [
  [Tile.ShallowWater, "shallows"],
  [Tile.Sand, "beach"],
  [Tile.Grass, "meadow"],
  [Tile.Forest, "forest"],
  [Tile.Marsh, "marsh"],
  [Tile.Scree, "scree"],
  [Tile.Rock, "bare rock"],
  [Tile.Cliff, "cliffs"],
  [Tile.Highland, "high turf"],
  [Tile.Snow, "high snow"],
];

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const few = (n: number): string => NUMBER_WORDS[n] ?? String(n);

export function islandCharacter(map: WorldMap): IslandCharacter {
  const counts = new Map<Tile, number>();
  for (const t of map.tiles) counts.set(t as Tile, (counts.get(t as Tile) ?? 0) + 1);
  const biomes = BIOME_WORDS.filter(([t]) => (counts.get(t) ?? 0) >= BIOME_MIN_TILES).map(
    ([, word]) => word,
  );
  const features: string[] = [];
  if (map.crater) features.push("a crater lake at its heart");
  const rivers = map.rivers.length;
  if (rivers > 0) features.push(rivers === 1 ? "one river" : `${few(rivers)} rivers`);
  const falls = map.falls?.length ?? 0;
  if (falls > 0) features.push(falls === 1 ? "a waterfall" : `${few(falls)} waterfalls`);
  const confluences = map.confluences?.length ?? 0;
  if (confluences > 0) {
    features.push(confluences === 1 ? "a pool where rivers meet" : "pools where rivers meet");
  }
  const springs = map.springs?.length ?? 0;
  if (springs > 0) {
    features.push(
      springs === 1 ? "a warm spring at the rock's edge" : "warm springs at the rock's edge",
    );
  }
  const pockets = map.pockets?.length ?? 0;
  if (pockets > 0) {
    features.push(pockets === 1 ? "a hidden clearing, somewhere" : "hidden clearings, somewhere");
  }
  // the island's overall geology leads the landforms, unless it's plainly
  // rolling (the unremarkable default earns no line)
  if (map.relief && map.relief !== "rolling") {
    const phrase = RELIEF_PHRASE[map.relief as IslandRelief];
    if (phrase) features.unshift(phrase);
  }
  return { biomes, features };
}
