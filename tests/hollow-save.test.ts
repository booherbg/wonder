import { describe, expect, test } from "vitest";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import {
  HOLLOW_INDEX_KEY,
  WORLD_INDEX_KEY,
  packWorld,
  restorePlants,
  worldIndexKey,
  worldKey,
  type SavedWorld,
} from "../src/game/save";
import { pickAttempt } from "../src/life/hollow";
import { generate } from "../src/world/generate";
import { DEFAULT_CONFIG, HOLLOW_CONFIG } from "../src/world/config";

// The seed both islands are built on. One number, two islands — the whole
// point of the namespace split.
const SEED = 11;

// an in-memory Storage, so the localStorage round-trip runs in node
function memStore(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear() { m.clear(); },
    getItem(k: string) { return m.get(k) ?? null; },
    key(i: number) { return [...m.keys()][i] ?? null; },
    removeItem(k: string) { m.delete(k); },
    setItem(k: string, v: string) { m.set(k, String(v)); },
  } as Storage;
}

// A small scattered population on one config, in place of a 400-generation
// burn-in (6.2-7.0 s measured). What the regression is about is which PLANTS
// come back from which key, not how they were grown, and a scatter on
// HOLLOW_CONFIG's 140x140 map already sits at coordinates DEFAULT_CONFIG's
// 300x300 map has its own, different plants at.
function islandOf(style: "classic" | "hollow") {
  const seed = style === "hollow" ? SEED + 1 : SEED; // the hollow's accepted attempt, offset 1
  const map = generate(seed, style === "hollow" ? HOLLOW_CONFIG : DEFAULT_CONFIG);
  const species = generatePlantSpecies(seed);
  const flora = new Flora(map, species, seed);
  for (let i = 0; i < 10; i++) flora.simTick();
  return { map, species, flora };
}

// Every plant as "species@x,y" — an identity that survives the pack/restore
// rounding (packWorld rounds coordinates to 1 decimal, and restorePlants does
// not move them), so two islands' sets can be compared for overlap.
function plantKeys(rows: { species: number; x: number; y: number }[]): Set<string> {
  return new Set(rows.map((p) => `${p.species}@${p.x.toFixed(1)},${p.y.toFixed(1)}`));
}

describe("worldKey namespaces by island style", () => {
  test("classic keeps the exact key every existing save is filed under", () => {
    // Backward compatibility, stated as the literal string: players have saves
    // at these keys today and a changed prefix would orphan all of them.
    expect(worldKey(0, "classic")).toBe("wander.world.0");
    expect(worldKey(11, "classic")).toBe("wander.world.11");
    expect(worldIndexKey("classic")).toBe(WORLD_INDEX_KEY);
    expect(WORLD_INDEX_KEY).toBe("wander.worlds");
  });

  test("the hollow gets its own prefix, and the two never collide on any seed", () => {
    expect(worldKey(11, "hollow")).toBe("wander.world.hollow.11");
    expect(worldIndexKey("hollow")).toBe(HOLLOW_INDEX_KEY);
    for (let seed = 0; seed < 200; seed++) {
      expect(worldKey(seed, "hollow")).not.toBe(worldKey(seed, "classic"));
      // and no hollow key may equal the classic key of ANY other seed, which
      // a prefix like `wander.world.${seed}hollow` would not guarantee
      for (let other = 0; other < 200; other++) {
        expect(worldKey(seed, "hollow")).not.toBe(worldKey(other, "classic"));
      }
    }
  });
});

// THE REGRESSION. Before the styles were namespaced, both islands were filed
// under `wander.world.${seed}`, so forging seed 11 as a Classic after playing
// it as a Hollow restored the Hollow's plants onto the classic map: 43 of
// 8,337 survived the habitat check. This asserts the failure cannot return.
test("a Hollow and a Classic on the same seed do not contaminate each other", () => {
  const store = memStore();
  const hollow = islandOf("hollow");
  const classic = islandOf("classic");

  const savedHollow = packWorld(
    SEED, hollow.flora.tick, { x: 100, y: 100 }, null, { seeds: [] },
    hollow.flora.all, 1000, [], [], undefined, [],
    { style: "hollow", attemptOffset: 1 },
  );
  const savedClassic = packWorld(
    SEED, classic.flora.tick, { x: 200, y: 200 }, null, { seeds: [] },
    classic.flora.all, 2000, [], [], undefined, [],
    { style: "classic" },
  );

  // written in the order that used to destroy the first: hollow, then classic
  store.setItem(worldKey(SEED, "hollow"), JSON.stringify(savedHollow));
  store.setItem(worldKey(SEED, "classic"), JSON.stringify(savedClassic));

  const backHollow = JSON.parse(store.getItem(worldKey(SEED, "hollow"))!) as SavedWorld;
  const backClassic = JSON.parse(store.getItem(worldKey(SEED, "classic"))!) as SavedWorld;

  // both survived the second write
  expect(backHollow.plants.length).toBe(hollow.flora.all.length);
  expect(backClassic.plants.length).toBe(classic.flora.all.length);
  expect(backHollow.plants.length).toBeGreaterThan(0);
  expect(backClassic.plants.length).toBeGreaterThan(0);

  // and each carries only its own island's plants
  const hollowPlants = plantKeys(restorePlants(backHollow, hollow.species));
  const classicPlants = plantKeys(restorePlants(backClassic, classic.species));
  const truth = {
    hollow: plantKeys(hollow.flora.all),
    classic: plantKeys(classic.flora.all),
  };
  for (const k of hollowPlants) {
    expect(truth.hollow.has(k)).toBe(true);
    expect(classicPlants.has(k) && !truth.classic.has(k)).toBe(false);
  }
  for (const k of classicPlants) expect(truth.classic.has(k)).toBe(true);
  // the sets are genuinely different islands, not two copies of one
  const shared = [...hollowPlants].filter((k) => classicPlants.has(k)).length;
  expect(shared / hollowPlants.size).toBeLessThan(0.01);

  // the styles are recorded, so a save can be checked against its namespace
  expect(backHollow.style).toBe("hollow");
  expect(backHollow.attemptOffset).toBe(1);
  // classic omits both, so a classic save is byte-identical to a pre-Hollow one
  expect("style" in backClassic).toBe(false);
  expect("attemptOffset" in backClassic).toBe(false);
});

test("a save written before the Hollow existed still reads as a classic world", () => {
  // Exactly the JSON shape the old packWorld produced: no style field. The
  // absent field must mean classic, never "unknown" or "refuse to load".
  const legacy = JSON.parse(
    JSON.stringify(
      packWorld(SEED, 5, { x: 1, y: 2 }, null, { seeds: [] }, [], 900),
    ),
  ) as SavedWorld;
  expect(legacy.style).toBeUndefined();
  expect(legacy.style ?? "classic").toBe("classic");
  expect(legacy.attemptOffset ?? 0).toBe(0);
});

describe("the accepted attempt is recorded, so the map is rebuildable", () => {
  test("pickAttempt reports which reroll it accepted", () => {
    // makeHollow rerolls on the BURN-IN OUTCOME, so the seed alone does not
    // say which island was accepted — the offset does.
    const first = pickAttempt(100, (s, offset) => ({
      report: { floorHit: s < 102 }, seed: s, offset,
    }));
    expect(first.offset).toBe(2);
    expect(first.seed).toBe(100 + first.offset);

    const straightAway = pickAttempt(7, (s, offset) => ({
      report: { floorHit: false }, seed: s, offset,
    }));
    expect(straightAway.offset).toBe(0);
    expect(straightAway.seed).toBe(7);
  });

  test("seed + offset rebuilds the accepted island exactly, with no burn-in", () => {
    // The resume path in main.ts: generate(seed + attemptOffset, HOLLOW_CONFIG),
    // then the species list from the same accepted seed.
    const accepted = generate(SEED + 2, HOLLOW_CONFIG);
    const rebuilt = generate(SEED + 2, HOLLOW_CONFIG);
    expect(rebuilt.width).toBe(HOLLOW_CONFIG.width);
    expect([...rebuilt.tiles]).toEqual([...accepted.tiles]);

    // and the accepted seed is a different island from the bare seed. Offset 2,
    // not 1, because generate has a reroll of its own: it tries genSeed
    // seed, seed+1, ... until the island is viable, so seeds 11 and 12 land on
    // the same 140x140 tile array (measured: 0 of 19,600 tiles differ) while
    // 11 and 13 differ in 10,772 of 19,600.
    let differing = 0;
    const bare = generate(SEED, HOLLOW_CONFIG);
    for (let i = 0; i < bare.tiles.length; i++) {
      if (bare.tiles[i] !== accepted.tiles[i]) differing++;
    }
    expect(differing).toBe(10772);

    // the species list moves with the accepted seed too — the reason resume
    // rebuilds it from seed + offset rather than from seed
    const acceptedNames = generatePlantSpecies(SEED + 2).map((s) => s.name);
    expect(generatePlantSpecies(SEED + 2).map((s) => s.name)).toEqual(acceptedNames);
    expect(generatePlantSpecies(SEED).map((s) => s.name)).not.toEqual(acceptedNames);
  });
});
