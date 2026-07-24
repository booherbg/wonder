import { expect, test } from "vitest";
import {
  CHART_WINDOWS,
  axisTicks,
  formatTickLabel,
  samplesForWindow,
  sliceRight,
  tickAtIndex,
  ticksForWindow,
} from "../src/render/chartWindow";

test("ledger window tick spans match the buttons", () => {
  expect(ticksForWindow("5k")).toBe(5_000);
  expect(ticksForWindow("10k")).toBe(10_000);
  expect(ticksForWindow("50k")).toBe(50_000);
  expect(ticksForWindow("100k")).toBe(100_000);
  expect(ticksForWindow("all")).toBeNull();
  expect(CHART_WINDOWS.map((w) => w.id)).toEqual(["5k", "10k", "50k", "100k", "all"]);
});

test("samplesForWindow converts ticks to a right-aligned sample count", () => {
  expect(samplesForWindow(5_000, 40, 2500)).toBe(125); // 5000/40
  expect(samplesForWindow(10_000, 40, 100)).toBe(100); // clamps to available
  expect(samplesForWindow(null, 40, 800)).toBe(800); // All
  expect(samplesForWindow(5_000, 40, 0)).toBe(0);
});

test("sliceRight keeps the newest samples", () => {
  expect(sliceRight([1, 2, 3, 4, 5], 3)).toEqual([3, 4, 5]);
  expect(sliceRight([1, 2], 5)).toEqual([1, 2]);
  expect(sliceRight([], 3)).toEqual([]);
});

test("tickAtIndex reconstructs sample times from the ring end", () => {
  // length 5, lastTick 200, interval 10 → ticks 160,170,180,190,200
  expect(tickAtIndex(200, 10, 5, 0)).toBe(160);
  expect(tickAtIndex(200, 10, 5, 4)).toBe(200);
  expect(tickAtIndex(200, 10, 1, 0)).toBe(200);
});

test("axisTicks labels the visible window ends (and mid when wide)", () => {
  expect(axisTicks(160, 200)).toEqual([
    { at: 0, label: "tick 160" },
    { at: 1, label: "tick 200" },
  ]);
  const mid = axisTicks(0, 1000, true);
  expect(mid).toHaveLength(3);
  expect(mid[1]).toEqual({ at: 0.5, label: "tick 500" });
});

test("formatTickLabel uses grouped tick numbers", () => {
  expect(formatTickLabel(46000)).toBe("tick 46,000");
  expect(formatTickLabel(0)).toBe("tick 0");
});

test("viewForWindow slices series to the recent tick span", async () => {
  const { viewForWindow } = await import("../src/render/charts");
  const full = {
    name: "t",
    timeLabel: "tick 400",
    sampleInterval: 40,
    lastTick: 400,
    totals: { plants: 1, kinds: 1, arose: 0, lost: 0 },
    richness: { score: 0, word: "sparse" },
    chains: { chains: 0, closable: 0, redundancy: 1 },
    links: [],
    series: [
      {
        id: 0,
        name: "A",
        hue: 0.3,
        sat: 0.5,
        counts: Array.from({ length: 20 }, (_, i) => i), // 20 samples = 800 ticks
        peak: 19,
      },
    ],
    totalCounts: Array.from({ length: 20 }, (_, i) => i),
    biomes: [],
    substrates: 0,
    germinations: 0,
    pollinators: { swarms: 0, population: 0, species: 0 },
    swarmSeries: [],
  };
  // 5k ticks → ceil(5000/40)=125 samples, but only 20 available → unchanged
  expect(viewForWindow(full, "5k").series[0].counts.length).toBe(20);
  // narrower: use a custom check via  samples — force by asking All vs a window that fits
  const short = viewForWindow(
    {
      ...full,
      series: [{ ...full.series[0], counts: Array.from({ length: 200 }, (_, i) => i), peak: 199 }],
      totalCounts: Array.from({ length: 200 }, (_, i) => i),
    },
    "5k",
  );
  expect(short.series[0].counts.length).toBe(125);
  expect(short.series[0].counts[0]).toBe(75); // 200-125
  expect(short.series[0].counts.at(-1)).toBe(199);
});
