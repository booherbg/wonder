import { expect, test } from "vitest";
import {
  clampCameraAxis,
  fitZoomFor,
  nextZoomMul,
  wheelCameraMode,
  wheelPanDelta,
  wheelZoomFactor,
  zoomAboutPoint,
  zoomPercent,
  ZOOM_MUL_MAX,
  ZOOM_MUL_MIN,
  ZOOM_WHEEL_IN,
} from "../src/game/simCamera";

test("clampCameraAxis clamps pan within bounds when the world is larger", () => {
  expect(clampCameraAxis(-50, 1600, 800)).toBe(0);
  expect(clampCameraAxis(900, 1600, 800)).toBe(800);
});

test("clampCameraAxis allows sliding within letterbox when the world fits", () => {
  // world 400, view 800 → maxOffset -400; may sit anywhere in [-400, 0]
  expect(clampCameraAxis(-200, 400, 800)).toBe(-200);
  expect(clampCameraAxis(50, 400, 800)).toBe(0);
  expect(clampCameraAxis(-999, 400, 800)).toBe(-400);
  // centreCamera uses maxOffset/2 — still a valid point inside the range
  expect(clampCameraAxis((400 - 800) / 2, 400, 800)).toBe(-200);
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

test("wheelPanDelta maps shift+vertical wheel to horizontal pan", () => {
  expect(wheelPanDelta(0, 40, 800, 400, 400, 200, { shiftKey: true })).toEqual({ dx: 80, dy: 0 });
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

// ── zoom about the pointer ──────────────────────────────────────────────────
// The bench used to zoom about the camera origin, so whatever you were looking
// at slid away as you zoomed. The invariant: the world point under the pointer
// does not move. world = cam + f * view, and view' = view / ratio, so
// cam' = world - f * view'.

test("zoomAboutPoint holds the world point under the pointer fixed, zooming in", () => {
  const camX = 100, camY = 200, viewW = 400, viewH = 300;
  const fx = 0.25, fy = 0.75, ratio = 2;
  const worldX = camX + fx * viewW; // 200
  const worldY = camY + fy * viewH; // 425
  const out = zoomAboutPoint(camX, camY, viewW, viewH, fx, fy, ratio);
  expect(out.camX + fx * (viewW / ratio)).toBeCloseTo(worldX, 6);
  expect(out.camY + fy * (viewH / ratio)).toBeCloseTo(worldY, 6);
});

test("zoomAboutPoint holds the world point fixed, zooming out", () => {
  const out = zoomAboutPoint(100, 200, 400, 300, 0.5, 0.5, 0.5);
  expect(out.camX + 0.5 * (400 / 0.5)).toBeCloseTo(300, 6);
  expect(out.camY + 0.5 * (300 / 0.5)).toBeCloseTo(350, 6);
});

test("zoomAboutPoint is identity at ratio 1", () => {
  const out = zoomAboutPoint(100, 200, 400, 300, 0.3, 0.7, 1);
  expect(out.camX).toBeCloseTo(100, 6);
  expect(out.camY).toBeCloseTo(200, 6);
});

test("zoomAboutPoint anchored at the centre keeps the centre fixed", () => {
  const out = zoomAboutPoint(0, 0, 400, 300, 0.5, 0.5, 2);
  expect(out.camX + 0.5 * 200).toBeCloseTo(200, 6);
  expect(out.camY + 0.5 * 150).toBeCloseTo(150, 6);
});

test("the wheel zoom step crosses the whole range in about twenty events", () => {
  // ZOOM_MUL_MIN 0.4 → ZOOM_MUL_MAX 4 is a 10x span. At 1.05 that was ~48
  // events end to end, which is why zooming felt like grinding.
  const events = Math.log(ZOOM_MUL_MAX / ZOOM_MUL_MIN) / Math.log(ZOOM_WHEEL_IN);
  expect(events).toBeGreaterThan(15);
  expect(events).toBeLessThan(25);
});
