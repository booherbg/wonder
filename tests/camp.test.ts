import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import {
  CritterContext,
  generateCritterSpecies,
  homePoint,
  spawnCritters,
  updateCritter,
} from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { campLines, campMood } from "../src/render/inspect";
import { TILE_SIZE } from "../src/world/config";
import { generate } from "../src/world/generate";
import { Tile, WorldMap, isWalkable } from "../src/world/types";

const SEED = 42;

function world() {
  const map = generate(SEED);
  const plants = generatePlantSpecies(SEED);
  const flora = new Flora(map, plants, SEED);
  const critterSpecies = generateCritterSpecies(SEED, map, flora, plants);
  return { map, plants, flora, critterSpecies };
}

// ── the camp said in words ──────────────────────────────────────────────

const friend = (name: string, trust = 0.9) => ({ name, trust });

test("the camp's mood: quiet, a first friend, then a hum of company", () => {
  expect(campMood([])).toBe("quiet still — no one's settled yet");
  expect(campMood([friend("Poni Hopper")])).toBe("Poni Hopper has made a home here");
  expect(campMood([friend("Poni Hopper"), friend("Bulwis Puff")])).toBe(
    "your camp hums — two kinds live alongside you",
  );
  expect(campMood([friend("Poni Hopper"), friend("Bulwis Puff"), friend("Tamru Peep")])).toBe(
    "your camp hums — three kinds live alongside you",
  );
});

test("the camp lines read in order: mood, bed, shelter, friends", () => {
  const lines = campLines({
    bed: [
      { name: "Mosswort", count: 3 },
      { name: "Glimmercap", count: 1 },
    ],
    fire: true,
    bedroll: true,
    friends: [friend("Poni Hopper", 0.9), friend("Bulwis Puff", 0.15)],
  });
  expect(lines[0]).toBe("your camp hums — two kinds live alongside you");
  expect(lines[1]).toBe("in the bed: Mosswort ×3 · Glimmercap");
  expect(lines[2]).toBe("a fire, burning every night · a bedroll of woven rushes");
  expect(lines[3]).toContain("Poni Hopper — bonded");
  expect(lines[4]).toContain("Bulwis Puff — warming");
});

test("an empty, unbuilt camp still speaks gently", () => {
  const lines = campLines({ bed: [], fire: false, bedroll: false, friends: [] });
  expect(lines).toHaveLength(3);
  expect(lines[0]).toBe("quiet still — no one's settled yet");
  expect(lines[1]).toContain("bare");
  expect(lines[1]).toContain("space to sow"); // sowing is space with the pouch selected
  expect(lines[2]).toContain("a fire");
});

// ── where home is ───────────────────────────────────────────────────────

// an island of pure meadow: walkability never muddies the arithmetic
function grassMap(w = 40, h = 40): WorldMap {
  return {
    width: w,
    height: h,
    seed: 1,
    tiles: new Uint8Array(w * h).fill(Tile.Grass),
    elevation: new Float32Array(w * h),
    rivers: [],
    spawn: { x: 1, y: 1 },
  };
}

test("home is the den until trust is real; a bond leans it to the camp", () => {
  const map = grassMap();
  const den = { x: 5, y: 5 };
  const denPx = { x: 5.5 * TILE_SIZE, y: 5.5 * TILE_SIZE };
  const camp = { x: 25.5 * TILE_SIZE, y: 5.5 * TILE_SIZE };
  expect(homePoint(den, 0, camp, map)).toEqual(denPx); // wary: unchanged
  expect(homePoint(den, 0.15, camp, map)).toEqual(denPx); // warming: not yet
  expect(homePoint(den, 1, null, map)).toEqual(denPx); // no camp to lean to
  const full = homePoint(den, 1, camp, map);
  // a full bond moves home most of the way to the camp — never all of it
  const span = camp.x - denPx.x;
  expect(full.x - denPx.x).toBeGreaterThan(span * 0.7);
  expect(full.x - denPx.x).toBeLessThan(span);
  expect(full.y).toBe(denPx.y);
  // a half bond leans less than a full one — the lean grows with the bond
  const half = homePoint(den, 0.5, camp, map);
  expect(half.x).toBeGreaterThan(denPx.x);
  expect(half.x).toBeLessThan(full.x);
});

test("a lean that lands in the sea settles beside the camp instead", () => {
  const map = grassMap();
  // a band of deep water where the leaned point would fall
  for (let x = 18; x < 24; x++)
    for (let y = 0; y < 40; y++) map.tiles[y * 40 + x] = Tile.DeepWater;
  const den = { x: 5, y: 5 };
  const camp = { x: 27.5 * TILE_SIZE, y: 5.5 * TILE_SIZE };
  expect(homePoint(den, 0.75, camp, map)).toEqual(camp);
});

// ── bonded critters come home ───────────────────────────────────────────

// a walkable camp site a good walk from the kind's den: the first tile of
// a deterministic ring scan, so the test never rolls dice to place it
function campSite(map: WorldMap, den: { x: number; y: number }, r: number): { x: number; y: number } {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      if (isWalkable(map, den.x + dx, den.y + dy)) {
        return { x: (den.x + dx + 0.5) * TILE_SIZE, y: (den.y + dy + 0.5) * TILE_SIZE };
      }
    }
  }
  throw new Error("no walkable camp site on the ring");
}

// run one kind through a night beside a camp, bonded or not, and report
// how near the camp its members end up on average
function nightAtCamp(bonded: boolean): number {
  const { map, flora, critterSpecies } = world();
  const critters = spawnCritters(critterSpecies, map, SEED);
  const camp = campSite(map, critterSpecies[0].den, 14);
  for (const c of critters) c.energy = 0.6; // fed enough that night calls them home
  const ctx: CritterContext = {
    darkness: 0.75,
    trust: bonded ? new Map([[0, 1]]) : new Map(),
    camp,
  };
  const rng = makeRng(3);
  const dt = 1 / 30;
  for (let step = 0; step < 30 * 60; step++) {
    for (const c of critters) updateCritter(c, dt, map, flora, critterSpecies, null, rng, ctx);
  }
  const kind = critters.filter((c) => c.species === 0);
  expect(kind.length).toBeGreaterThan(0);
  const sum = kind.reduce((acc, c) => acc + Math.hypot(c.x - camp.x, c.y - camp.y), 0);
  return sum / kind.length;
}

test("a bonded kind dens in beside the camp; an unbonded twin keeps its old den", () => {
  const settled = nightAtCamp(true);
  const wild = nightAtCamp(false);
  // the payoff, measured: the bonded kind beds down markedly nearer the fire
  expect(settled).toBeLessThan(wild * 0.5);
  expect(settled).toBeLessThan(6 * TILE_SIZE); // truly at the camp, not just nearer
});

test("a camp alone changes nothing — only a bond moves a kind's home", () => {
  const run = (withCamp: boolean) => {
    const { map, flora, critterSpecies } = world();
    const critters = spawnCritters(critterSpecies, map, SEED);
    const camp = campSite(map, critterSpecies[0].den, 14);
    const ctx: CritterContext = withCamp ? { camp, trust: new Map() } : {};
    const rng = makeRng(11);
    const dt = 1 / 30;
    for (let step = 0; step < 30 * 30; step++) {
      for (const c of critters) updateCritter(c, dt, map, flora, critterSpecies, null, rng, ctx);
    }
    return critters.map((c) => ({ x: c.x, y: c.y, state: c.state, mood: c.mood }));
  };
  expect(run(true)).toEqual(run(false));
});
