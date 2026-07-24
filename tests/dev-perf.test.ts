import { expect, test } from "vitest";
import { formatDevPerf, type DevPerfSnapshot } from "../src/game/devPerf";

const base: DevPerfSnapshot = {
  plants: 800,
  maxPlants: 10000,
  plantKindsLive: 12,
  plantSpeciesDefs: 40,
  critters: 30,
  critterKinds: 8,
  swarms: 6,
  swarmMotes: 252,
  flockBirds: 14,
  flocks: 3,
  censusTraces: 40,
  censusSamples: 1200,
  mapTiles: 65536,
  plantSprites: 120,
  plantSpriteCap: 512,
  insectSpriteSets: 8,
  insectSpriteCap: 160,
  critterSpriteSets: 8,
  critterSpriteCap: 64,
  heapUsedMb: 64.2,
  heapLimitMb: 2048,
};

test("formatDevPerf includes entity caps and heap", () => {
  const lines = formatDevPerf(base);
  expect(lines[0]).toContain("800/10000");
  expect(lines[0]).toContain("8%");
  expect(lines.some((l) => l.includes("clouds 6"))).toBe(true);
  expect(lines.some((l) => l.includes("js heap 64.2"))).toBe(true);
});

test("formatDevPerf notes missing heap API", () => {
  const { heapUsedMb: _u, heapLimitMb: _l, ...rest } = base;
  const lines = formatDevPerf(rest);
  expect(lines.at(-1)).toContain("js heap n/a");
});
