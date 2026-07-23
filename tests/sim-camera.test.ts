import { expect, test } from "vitest";
import {
  clampCameraAxis,
  fitZoomFor,
  nextZoomMul,
  wheelCameraMode,
  wheelPanDelta,
  wheelZoomFactor,
  zoomPercent,
  ZOOM_MUL_MAX,
  ZOOM_MUL_MIN,
  ZOOM_WHEEL_IN,
} from "../src/game/simCamera";

test("clampCameraAxis centres when the world fits inside the view", () => {
  expect(clampCameraAxis(999, 400, 800)).toBe(-200);
});

test("clampCameraAxis clamps pan within bounds when the world is larger", () => {
  expect(clampCameraAxis(-50, 1600, 800)).toBe(0);
  expect(clampCameraAxis(900, 1600, 800)).toBe(800);
});

test("fitZoomFor scales down wide constructs", () => {
  const z = fitZoomFor(2000, 1000, 800, 600);
  expect(z).toBeLessThan(1);
  expect(z).toBeCloseTo(Math.min(2, (800 * 0.92) / 2000, (600 * 0.92) / 1000));
});

test("wheel defaults to pan; modifier or pinch zooms", () => {
  expect(wheelCameraMode({ ctrlKey: false, metaKey: false })).toBe("pan");
  expect(wheelCameraMode({ ctrlKey: true, metaKey: false })).toBe("zoom");
  expect(wheelCameraMode({ ctrlKey: false, metaKey: true })).toBe("zoom");
});

test("wheelPanDelta maps screen deltas into view space", () => {
  expect(wheelPanDelta(100, 50, 800, 400, 400, 200)).toEqual({ dx: 200, dy: 100 });
});

test("wheelZoomFactor uses a soft step", () => {
  expect(wheelZoomFactor(-1)).toBe(ZOOM_WHEEL_IN);
  expect(wheelZoomFactor(1)).toBeCloseTo(1 / ZOOM_WHEEL_IN);
});

test("nextZoomMul clamps within sensible bounds", () => {
  expect(nextZoomMul(1, "in")).toBeCloseTo(ZOOM_WHEEL_IN);
  expect(nextZoomMul(ZOOM_MUL_MAX, "in")).toBe(ZOOM_MUL_MAX);
  expect(nextZoomMul(ZOOM_MUL_MIN, "out")).toBe(ZOOM_MUL_MIN);
});

test("zoomPercent reads relative to fit baseline", () => {
  expect(zoomPercent(1)).toBe(100);
  expect(zoomPercent(1.5)).toBe(150);
});
