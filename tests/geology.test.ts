import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/world/config";
import {
  RELIEFS,
  buildElevation,
  generate,
  rollRelief,
} from "../src/world/generate";
import { OVERVIEW_COLORS } from "../src/render/palette";
import { Tile, WALKABLE, WorldMap } from "../src/world/types";

const cfg = DEFAULT_CONFIG;

test("every relief occurs, deterministically, across a spread of seeds", () => {
  const counts = new Map<string, number>();
  for (let seed = 1; seed <= 400; seed++) {
    const r = rollRelief(seed);
    expect(r).toBe(rollRelief(seed));
    expect(RELIEFS).toContain(r);
    counts.set(r, (counts.get(r) ?? 0) + 1);
  }
  for (const r of RELIEFS) {
    expect(counts.get(r) ?? 0).toBeGreaterThan(8); // none vanishingly rare
  }
});

test("generated islands carry their relief and all reliefs make viable worlds", () => {
  for (const relief of RELIEFS) {
    const map = generate(11, cfg, undefined, relief);
    expect(map.relief).toBe(relief);
    expect(map.rivers.length).toBeGreaterThan(0); // water still finds its way down
  }
});

// Elevation histogram over the terrace band, in fine bins: stepped ground
// piles its area onto the treads, so a few bins hold most of the land.
function bandConcentration(e: Float32Array): number {
  const bins = new Array(40).fill(0);
  let n = 0;
  for (const v of e) {
    if (v <= cfg.beachLevel || v >= cfg.rockLevel) continue;
    bins[Math.floor(((v - cfg.beachLevel) / (cfg.rockLevel - cfg.beachLevel)) * 40)]++;
    n++;
  }
  bins.sort((a, b) => b - a);
  return (bins[0] + bins[1] + bins[2] + bins[3] + bins[4] + bins[5]) / n;
}

test("terraced isles pile their ground onto the treads", () => {
  const seed = 11;
  const terraced = bandConcentration(buildElevation(seed, cfg, "highland", "terraced"));
  const rolling = bandConcentration(buildElevation(seed, cfg, "highland", "rolling"));
  expect(terraced).toBeGreaterThan(rolling * 1.5);
});

test("a mesa presses its summit flat and never reaches the snow", () => {
  const seed = 11;
  const mesa = buildElevation(seed, cfg, "highland", "mesa");
  const rolling = buildElevation(seed, cfg, "highland", "rolling");
  const near = (e: Float32Array) => {
    let max = 0;
    for (const v of e) max = Math.max(max, v);
    let n = 0;
    for (const v of e) if (v > max - 0.02) n++;
    return n;
  };
  expect(near(mesa)).toBeGreaterThan(near(rolling) * 3); // a broad tableland, not a peak
  let mesaMax = 0;
  for (const v of mesa) mesaMax = Math.max(mesaMax, v);
  expect(mesaMax).toBeLessThan(cfg.snowLevel);
});

// Count tiles sitting well below the ring of ground around them — the floor
// of a sunken channel. Gorge country has whole winding systems of them.
function sunkenTiles(e: Float32Array): number {
  let n = 0;
  for (let y = 2; y < cfg.height - 2; y++) {
    for (let x = 2; x < cfg.width - 2; x++) {
      const i = y * cfg.width + x;
      if (e[i] <= cfg.shoreLevel) continue;
      let ringMax = 0;
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]] as const) {
        ringMax = Math.max(ringMax, e[(y + dy) * cfg.width + (x + dx)]);
      }
      if (ringMax - e[i] > 0.07) n++;
    }
  }
  return n;
}

test("gorge country is truly cut: sunken floors under high walls", () => {
  const seed = 11;
  const gorges = sunkenTiles(buildElevation(seed, cfg, "highland", "gorges"));
  const rolling = sunkenTiles(buildElevation(seed, cfg, "highland", "rolling"));
  expect(gorges).toBeGreaterThan(rolling * 3 + 20);
});

test("crag-land is serrated: steeper on average than smooth country", () => {
  const slopeSum = (e: Float32Array) => {
    let sum = 0;
    let n = 0;
    for (let y = 1; y < cfg.height - 1; y++) {
      for (let x = 1; x < cfg.width - 1; x++) {
        const i = y * cfg.width + x;
        if (e[i] <= cfg.beachLevel) continue;
        sum += Math.abs(e[i] - e[i + 1]) + Math.abs(e[i] - e[i + cfg.width]);
        n++;
      }
    }
    return sum / n;
  };
  const crags = slopeSum(buildElevation(11, cfg, "highland", "crags"));
  const rolling = slopeSum(buildElevation(11, cfg, "highland", "rolling"));
  expect(crags).toBeGreaterThan(rolling * 1.3);
});

test("relief transforms keep every border at sea", () => {
  for (const relief of RELIEFS) {
    const e = buildElevation(7, cfg, undefined, relief);
    for (let x = 0; x < cfg.width; x++) {
      expect(e[x]).toBe(0);
      expect(e[(cfg.height - 1) * cfg.width + x]).toBe(0);
    }
    for (let y = 0; y < cfg.height; y++) {
      expect(e[y * cfg.width]).toBe(0);
      expect(e[y * cfg.width + cfg.width - 1]).toBe(0);
    }
  }
});

test("sculpted country raises real cliffs, and cliffs are walls", () => {
  expect(WALKABLE.has(Tile.Cliff)).toBe(false);
  expect(WALKABLE.has(Tile.Scree)).toBe(true);
  expect(WALKABLE.has(Tile.Highland)).toBe(true);
  // a forced gorge isle on a mountainous seed shows its walls
  const map = generate(11, cfg, "highland", "gorges");
  let cliffs = 0;
  for (const t of map.tiles) if (t === Tile.Cliff) cliffs++;
  expect(cliffs).toBeGreaterThan(30);
});

function stackSeed(): { seed: number; map: WorldMap } {
  for (let seed = 1; seed <= 40; seed++) {
    const map = generate(seed, cfg);
    if ((map.stacks?.length ?? 0) > 0) return { seed, map };
  }
  throw new Error("no island with sea stacks in 1..40");
}

test("sea stacks stand in open water, off the rivers, deterministic", () => {
  const { seed, map } = stackSeed();
  const again = generate(seed, cfg);
  expect(again.stacks).toEqual(map.stacks);
  const riverTiles = new Set(map.rivers.flatMap((r) => r.path));
  for (const s of map.stacks!) {
    const i = s.y * map.width + s.x;
    expect(map.tiles[i]).toBe(Tile.Cliff); // a sheer tooth of stone
    expect(riverTiles.has(i)).toBe(false); // never damming a river
    let deepNear = false;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (map.tiles[(s.y + dy) * map.width + (s.x + dx)] === Tile.DeepWater) deepNear = true;
      }
    }
    expect(deepNear).toBe(true); // truly offshore, the open sea at its back
  }
});

test("the overview palette knows every tile, hex for the woodcut's inks", () => {
  expect(OVERVIEW_COLORS.length).toBe(Tile.Cliff + 1);
  for (const c of OVERVIEW_COLORS) {
    expect(c).toMatch(/^#[0-9a-f]{6}$/);
  }
});
