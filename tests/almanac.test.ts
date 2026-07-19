import { expect, test } from "vitest";
import {
  BIOME_MIN_TILES,
  CRITTER_JOURNAL_CAP,
  CRITTER_JOURNAL_KEY,
  CritterMeeting,
  JOURNAL_KEY,
  JournalEntry,
  Sighting,
  VARIETY_CAP,
  islandCharacter,
  loadCritterJournal,
  loadJournal,
  recordCritterMeeting,
  recordSighting,
} from "../src/game/journal";
import { KV } from "../src/game/murmurs";
import { Genome, PlantForm } from "../src/life/genome";
import { Tile, WorldMap } from "../src/world/types";

function fakeKV(): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const GENOME: Genome = {
  form: PlantForm.Flower,
  hue: 0.3, hue2: 0.6, sat: 0.8, height: 0.4, spread: 0.5,
  petals: 5, leaves: 2, lean: 0, glow: 0.1,
};

function sighting(overrides: Partial<Sighting> = {}): Sighting {
  return {
    seed: 7,
    island: "Dusil Skerry",
    speciesId: 2,
    speciesName: "Luma Bell",
    genome: { ...GENOME },
    aquatic: false,
    drift: 12,
    at: 1000,
    ...overrides,
  };
}

function meeting(overrides: Partial<CritterMeeting> = {}): CritterMeeting {
  return {
    seed: 7,
    island: "Dusil Skerry",
    critter: {
      id: 0, name: "Poni Hopper", role: "grazer",
      bodyHue: 0.41, earLen: 0.5, tailLen: 0.3, size: 1,
    },
    at: 1000,
    ...overrides,
  };
}

// ── creatures you've met ───────────────────────────────────────────────

test("meeting a critter writes its page; meeting again only deepens it", () => {
  const kv = fakeKV();
  recordCritterMeeting(meeting(), kv);
  recordCritterMeeting(meeting({ at: 2000 }), kv);
  const entries = loadCritterJournal(kv);
  expect(entries.length).toBe(1);
  expect(entries[0].key).toBe("7:critter:0");
  expect(entries[0].meetings).toBe(2);
  expect(entries[0].firstMetAt).toBe(1000); // the first meeting stays first
  expect(entries[0].role).toBe("grazer");
  expect(entries[0].bodyHue).toBe(0.41); // enough body to draw from memory
});

test("the same kind on another island earns its own creature page", () => {
  const kv = fakeKV();
  recordCritterMeeting(meeting(), kv);
  recordCritterMeeting(meeting({ seed: 9, island: "Fenor Holm" }), kv);
  recordCritterMeeting(
    meeting({
      critter: {
        id: 2, name: "Wisket Puff", role: "disperser",
        bodyHue: 0.7, earLen: 0.9, tailLen: 0.1, size: 0.8,
      },
    }),
    kv,
  );
  const keys = loadCritterJournal(kv).map((e) => e.key);
  expect(keys).toEqual(["7:critter:0", "9:critter:0", "7:critter:2"]);
});

test("the creature shelf is capped, keeping the most recent meetings", () => {
  const kv = fakeKV();
  for (let i = 0; i < CRITTER_JOURNAL_CAP + 10; i++) {
    recordCritterMeeting(meeting({ seed: i, at: i }), kv);
  }
  const entries = loadCritterJournal(kv);
  expect(entries.length).toBe(CRITTER_JOURNAL_CAP);
  expect(entries.every((e) => e.firstMetAt >= 10)).toBe(true);
});

test("a journal with no creature shelf reads as empty, not an error", () => {
  const kv = fakeKV();
  expect(loadCritterJournal(kv)).toEqual([]); // a journal from before critters
  kv.map.set(CRITTER_JOURNAL_KEY, "]not json[");
  expect(loadCritterJournal(kv)).toEqual([]);
});

// ── one kind, many coats ───────────────────────────────────────────────

test("a first sighting presses the first swatch", () => {
  const kv = fakeKV();
  recordSighting(sighting(), kv);
  const e = loadJournal(kv)[0];
  expect(e.varieties?.length).toBe(1);
  expect(e.varieties?.[0]).toEqual({ hue: 0.3, hue2: 0.6, sat: 0.8, glow: 0.1 });
});

test("a coat earns a swatch only when its hue truly moves", () => {
  const kv = fakeKV();
  recordSighting(sighting({ genome: { ...GENOME, hue: 0.3 } }), kv);
  recordSighting(sighting({ genome: { ...GENOME, hue: 0.31 }, at: 2000 }), kv); // the same coat
  recordSighting(sighting({ genome: { ...GENOME, hue: 0.5 }, at: 3000 }), kv); // a new coat
  const e = loadJournal(kv)[0];
  expect(e.sightings).toBe(3); // every meeting counts, even in an old coat
  expect(e.varieties?.map((v) => v.hue)).toEqual([0.3, 0.5]);
});

test("hue distance wraps the wheel: 0.99 sits beside 0.01", () => {
  const kv = fakeKV();
  recordSighting(sighting({ genome: { ...GENOME, hue: 0.01 } }), kv);
  recordSighting(sighting({ genome: { ...GENOME, hue: 0.99 }, at: 2000 }), kv);
  expect(loadJournal(kv)[0].varieties?.length).toBe(1);
});

test("the swatch row is capped; first-witnessed coats keep their places", () => {
  const kv = fakeKV();
  for (let i = 0; i < VARIETY_CAP + 3; i++) {
    recordSighting(sighting({ genome: { ...GENOME, hue: i * 0.07 }, at: 1000 + i }), kv);
  }
  const varieties = loadJournal(kv)[0].varieties!;
  expect(varieties.length).toBe(VARIETY_CAP);
  expect(varieties[0].hue).toBe(0);
});

// ── back-compat: older journals still load and still learn ─────────────

test("an old page without varieties loads, then its old sketch seeds the row", () => {
  const kv = fakeKV();
  const old: JournalEntry[] = [{
    key: "7:2", seed: 7, island: "Dusil Skerry", speciesName: "Luma Bell",
    genome: { ...GENOME, hue: 0.3 }, aquatic: false,
    firstMetAt: 1000, maxDrift: 12, sightings: 3,
  }];
  kv.map.set(JOURNAL_KEY, JSON.stringify(old));
  expect(loadJournal(kv)[0].varieties).toBeUndefined(); // loads untouched
  recordSighting(sighting({ genome: { ...GENOME, hue: 0.6 }, at: 2000 }), kv);
  const e = loadJournal(kv)[0];
  expect(e.sightings).toBe(4);
  expect(e.firstMetAt).toBe(1000);
  expect(e.varieties?.map((v) => v.hue)).toEqual([0.3, 0.6]);
});

// ── this island ────────────────────────────────────────────────────────

function tinyMap(overrides: Partial<WorldMap> = {}): WorldMap {
  const width = 16;
  const height = 16;
  const tiles = new Uint8Array(width * height).fill(Tile.DeepWater);
  const paint = (t: Tile, n: number, from: number): void => {
    for (let i = 0; i < n; i++) tiles[from + i] = t;
  };
  paint(Tile.Sand, BIOME_MIN_TILES, 16);
  paint(Tile.Grass, BIOME_MIN_TILES, 48);
  paint(Tile.Forest, BIOME_MIN_TILES, 80);
  paint(Tile.Marsh, BIOME_MIN_TILES, 112);
  paint(Tile.Snow, BIOME_MIN_TILES - 1, 144); // a stray patch, too small to be a place
  return {
    width, height, seed: 7, tiles,
    elevation: new Float32Array(width * height),
    rivers: [], spawn: { x: 1, y: 1 },
    ...overrides,
  };
}

test("the island's character reads its grounds off the map", () => {
  const c = islandCharacter(tinyMap());
  // shore to heights; the stray snow patch and the sea go unlisted
  expect(c.biomes).toEqual(["beach", "meadow", "forest", "marsh"]);
});

test("the island's character names its born landforms", () => {
  const c = islandCharacter(
    tinyMap({
      crater: { x: 8, y: 8, lakeRadius: 2, rimRadius: 4 },
      rivers: [{ path: [0, 1], reachedSea: true }],
      falls: [
        { x: 1, y: 1, dx: 0, dy: 1, drop: 0.2 },
        { x: 3, y: 3, dx: 0, dy: 1, drop: 0.3 },
      ],
      springs: [{ x: 2, y: 2 }],
      pockets: [{ x: 5, y: 5, radius: 2, deep: false }],
    }),
  );
  expect(c.features).toEqual([
    "a crater lake at its heart",
    "one river",
    "two waterfalls",
    "a warm spring at the rock's edge",
    "a hidden clearing, somewhere",
  ]);
});

test("a plain island keeps a plain page", () => {
  expect(islandCharacter(tinyMap()).features).toEqual([]);
});

test("the character names the new high grounds, shore to heights", () => {
  const width = 16;
  const height = 16;
  const tiles = new Uint8Array(width * height).fill(Tile.DeepWater);
  const paint = (t: Tile, n: number, from: number): void => {
    for (let i = 0; i < n; i++) tiles[from + i] = t;
  };
  paint(Tile.Scree, BIOME_MIN_TILES, 0);
  paint(Tile.Rock, BIOME_MIN_TILES, 16);
  paint(Tile.Cliff, BIOME_MIN_TILES, 32);
  paint(Tile.Highland, BIOME_MIN_TILES, 48);
  paint(Tile.Snow, BIOME_MIN_TILES, 64);
  const c = islandCharacter({
    width,
    height,
    seed: 1,
    tiles,
    elevation: new Float32Array(width * height),
    rivers: [],
    spawn: { x: 1, y: 1 },
  } as WorldMap);
  expect(c.biomes).toEqual(["scree", "bare rock", "cliffs", "high turf", "high snow"]);
});

test("a sculpted island leads its landforms with its relief", () => {
  const c = islandCharacter(
    tinyMap({ relief: "gorges", crater: { x: 8, y: 8, lakeRadius: 2, rimRadius: 4 } }),
  );
  expect(c.features[0]).toBe("country cut by gorges");
  expect(c.features).toContain("a crater lake at its heart");
});

test("a rolling island earns no relief line", () => {
  expect(islandCharacter(tinyMap({ relief: "rolling" })).features).toEqual([]);
});
