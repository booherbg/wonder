import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import {
  MAP_CELLS, MAP_NCOL, randomSensorMap, makeFlowerSignature, mutateMap, appearanceColors,
  matchReward, metabolicEfficiency, resemblance,
} from "../src/life/idmap";

test("a random sensor map is the right length with values in range", () => {
  const g = randomSensorMap(makeRng(1));
  expect(g.length).toBe(MAP_CELLS);
  for (const v of g) {
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(MAP_NCOL);
  }
});

test("a flower signature stamps exactly flowerSize accent cells over a base fill", () => {
  const { map, accent } = makeFlowerSignature(makeRng(2), 6);
  expect(map.length).toBe(MAP_CELLS);
  expect(accent.length).toBe(MAP_CELLS);
  let accentCount = 0, baseFilled = 0;
  for (let i = 0; i < MAP_CELLS; i++) {
    if (accent[i]) accentCount++;
    if (map[i] !== 0) baseFilled++;
  }
  expect(accentCount).toBe(6);
  expect(baseFilled).toBe(MAP_CELLS); // base colour fills every cell; accent overlays some
});

test("mutateMap changes at least one cell and stays in range", () => {
  const src = randomSensorMap(makeRng(3));
  const out = mutateMap(src, makeRng(4), 3);
  expect(out).not.toBe(src);
  let diffs = 0;
  for (let i = 0; i < MAP_CELLS; i++) {
    if (out[i] !== src[i]) diffs++;
    expect(out[i]).toBeLessThanOrEqual(MAP_NCOL);
  }
  expect(diffs).toBeGreaterThanOrEqual(1);
});

test("appearanceColors returns a colour string per cell", () => {
  const cols = appearanceColors(randomSensorMap(makeRng(5)));
  expect(cols.length).toBe(MAP_CELLS);
  expect(typeof cols[0]).toBe("string");
});

test("a perfect sensor beats a partial one, which beats a neutral one", () => {
  const { map, accent } = makeFlowerSignature(makeRng(10), 6);
  const perfect = map.slice();
  const neutral = new Uint8Array(map.length);
  const partial = map.slice();
  partial[0] = 0; // drop one matched cell
  expect(matchReward(perfect, map, accent)).toBeGreaterThan(matchReward(partial, map, accent));
  expect(matchReward(partial, map, accent)).toBeGreaterThan(matchReward(neutral, map, accent));
});

test("flower (accent) matches are worth more than base matches", () => {
  const { map, accent } = makeFlowerSignature(makeRng(11), 4);
  const baseCell = accent.indexOf(0);
  const flowerCell = accent.indexOf(1);
  const onlyBase = new Uint8Array(map.length); onlyBase[baseCell] = map[baseCell];
  const onlyFlower = new Uint8Array(map.length); onlyFlower[flowerCell] = map[flowerCell];
  expect(matchReward(onlyFlower, map, accent)).toBeGreaterThan(matchReward(onlyBase, map, accent));
});

test("metabolicEfficiency is 0..1 and near 1 for a perfect match", () => {
  const { map, accent } = makeFlowerSignature(makeRng(12), 6);
  const eff = metabolicEfficiency(map.slice(), map, accent);
  expect(eff).toBeGreaterThan(0.9);
  expect(eff).toBeLessThanOrEqual(1);
  // a neutral generalist still gets a small trickle, not zero (feeds a little anywhere)
  const neutralEff = metabolicEfficiency(new Uint8Array(map.length), map, accent);
  expect(neutralEff).toBeGreaterThan(0);
  expect(neutralEff).toBeLessThan(0.25);
});

test("resemblance is the fraction of flower-colored cells matched", () => {
  const { map } = makeFlowerSignature(makeRng(13), 6);
  expect(resemblance(map.slice(), map)).toBe(1);
  expect(resemblance(new Uint8Array(map.length), map)).toBe(0);
});
