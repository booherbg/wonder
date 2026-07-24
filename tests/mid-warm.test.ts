import { expect, test, vi } from "vitest";
import { clampWarmTicks, MAX_MID_WARM, runWarmBatches, WARM_BATCH_SIZE } from "../src/game/midWarm";

test("clampWarmTicks rejects non-positive and caps at MAX_MID_WARM", () => {
  expect(clampWarmTicks(0)).toBe(0);
  expect(clampWarmTicks(-1)).toBe(0);
  expect(clampWarmTicks(NaN)).toBe(0);
  expect(clampWarmTicks(Infinity)).toBe(0);
  expect(clampWarmTicks(500)).toBe(500);
  expect(clampWarmTicks(99999)).toBe(MAX_MID_WARM);
  expect(clampWarmTicks(50000)).toBe(50000);
});

test("runWarmBatches invokes step once per tick and reports progress", async () => {
  vi.useFakeTimers();
  const step = vi.fn();
  const onProgress = vi.fn();
  const total = WARM_BATCH_SIZE * 2 + 10;
  const p = runWarmBatches({ total, batchSize: WARM_BATCH_SIZE, step, onProgress });
  await vi.runAllTimersAsync();
  await p;
  expect(step).toHaveBeenCalledTimes(total);
  expect(onProgress).toHaveBeenCalledTimes(3);
  expect(onProgress).toHaveBeenLastCalledWith(total, total);
  vi.useRealTimers();
});

test("runWarmBatches is a no-op for zero ticks", async () => {
  const step = vi.fn();
  await runWarmBatches({ total: 0, step });
  expect(step).not.toHaveBeenCalled();
});
