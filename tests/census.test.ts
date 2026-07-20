import { expect, test } from "vitest";
import { CensusLog, downsample, sparkline, trend } from "../src/life/census";

test("sparkline scales a series to its own shape", () => {
  // a clean rise fills bottom to top; a flat line reads as all-low
  expect(sparkline([0, 1, 2, 3, 4, 5, 6, 7], 8)).toBe("▁▂▃▄▅▆▇█");
  expect(sparkline([5, 5, 5, 5], 4)).toBe("▁▁▁▁"); // no range → all floor
  const fall = sparkline([7, 6, 5, 4, 3, 2, 1, 0], 8);
  expect(fall[0]).toBe("█");
  expect(fall[fall.length - 1]).toBe("▁");
});

test("downsample averages a long series into fewer buckets", () => {
  expect(downsample([0, 2, 4, 6], 2)).toEqual([1, 5]); // (0,2)->1, (4,6)->5
  expect(downsample([1, 2, 3], 5)).toEqual([1, 2, 3]); // shorter than width: untouched
});

test("trend reads recent third against the third before", () => {
  expect(trend([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe("rising");
  expect(trend([9, 8, 7, 6, 5, 4, 3, 2, 1])).toBe("falling");
  expect(trend([5, 5, 5, 5, 5, 5])).toBe("steady");
  expect(trend([5, 5])).toBe("steady"); // too short to tell
});

test("the census log samples on cadence and tracks per-kind history", () => {
  const log = new CensusLog(10, 100); // sample every 10 ticks
  log.sample(0, new Map([[1, 100]]));
  log.sample(5, new Map([[1, 200]])); // too soon — ignored
  log.sample(10, new Map([[1, 150]]));
  const tr = log.trace(1)!;
  expect(tr.counts).toEqual([100, 150]); // the t=5 sample was skipped
  expect(tr.peak).toBe(150);
});

test("a kind that vanishes records zeros, then is forgotten", () => {
  const log = new CensusLog(1, 3); // window of 3 samples
  log.sample(0, new Map([[1, 10]]));
  log.sample(1, new Map()); // gone
  expect(log.trace(1)?.counts).toEqual([10, 0]); // decline shows as a zero
  log.sample(2, new Map());
  log.sample(3, new Map()); // three straight zeros push the 10 out of the window
  expect(log.trace(1)).toBeUndefined(); // fully forgotten, a clean slate
});

test("summary counts live, arisen, and lost kinds", () => {
  const log = new CensusLog(1, 100);
  log.sample(0, new Map([[1, 10]])); // kind 1 present from the start
  log.sample(1, new Map([[1, 12], [2, 5]])); // kind 2 arises after logging began
  log.sample(2, new Map([[1, 14]])); // kind 2 gone to zero
  const s = log.summary();
  expect(s.live).toBe(1); // only kind 1 still alive
  expect(s.arose).toBe(1); // kind 2 arose during the log
  expect(s.lost).toBe(1); // kind 2 is now at zero
});
