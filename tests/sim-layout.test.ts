import { expect, test } from "vitest";
import { GUTTER, MIN_CANVAS, NARROW, canvasBoxFor } from "../src/game/simLayout";

// canvasBoxFor can compute reserved boxes when insets are supplied.
// World-Lab Overlay HUD uses zero insets so chrome overlays a full-bleed construct.

test("overlay policy: with zero insets the construct stays full-bleed even if chrome exists elsewhere", () => {
  // World-Lab will pass zero insets always; chrome may be tall but must not be measured in.
  const b = canvasBoxFor(1200, 800, { top: 0, right: 0, bottom: 0, left: 0 });
  expect(b).toEqual({ left: 0, top: 0, width: 1200, height: 800 });
});

test("canvasBoxFor still shrinks when insets are supplied (helper remains pure)", () => {
  const short = canvasBoxFor(1200, 800, { top: 0, right: 0, bottom: 80, left: 0 });
  const tall = canvasBoxFor(1200, 800, { top: 0, right: 0, bottom: 320, left: 0 });
  expect(tall.height).toBe(short.height - 240);
});

test("each occupied edge is reserved, plus a gutter", () => {
  const b = canvasBoxFor(1200, 800, { top: 60, right: 300, bottom: 120, left: 280 });
  expect(b.left).toBe(280 + GUTTER);
  expect(b.top).toBe(60 + GUTTER);
  expect(b.width).toBe(1200 - (280 + GUTTER) - (300 + GUTTER));
  expect(b.height).toBe(800 - (60 + GUTTER) - (120 + GUTTER));
});

test("an empty edge costs nothing, not even a gutter", () => {
  const b = canvasBoxFor(1000, 600, { top: 0, right: 0, bottom: 50, left: 0 });
  expect(b.left).toBe(0);
  expect(b.top).toBe(0);
  expect(b.width).toBe(1000);
  expect(b.height).toBe(600 - 50 - GUTTER);
});

test("collapsing a rail gives the width straight back to the construct", () => {
  const open = canvasBoxFor(1200, 800, { top: 0, right: 300, bottom: 0, left: 280 });
  const collapsed = canvasBoxFor(1200, 800, { top: 0, right: 0, bottom: 0, left: 280 });
  expect(collapsed.width).toBeGreaterThan(open.width);
  expect(collapsed.width - open.width).toBe(300 + GUTTER);
});

test("on a window too small to honour the reservation the construct keeps a floor", () => {
  const b = canvasBoxFor(600, 500, { top: 60, right: 300, bottom: 200, left: 280 });
  expect(b.width).toBeGreaterThanOrEqual(Math.min(600, MIN_CANVAS.width));
  expect(b.height).toBeGreaterThanOrEqual(Math.min(500, MIN_CANVAS.height));
});

test("the box never runs off the viewport", () => {
  const b = canvasBoxFor(400, 300, { top: 200, right: 200, bottom: 200, left: 200 });
  expect(b.left + b.width).toBeLessThanOrEqual(400);
  expect(b.top + b.height).toBeLessThanOrEqual(300);
  expect(b.left).toBeGreaterThanOrEqual(0);
  expect(b.top).toBeGreaterThanOrEqual(0);
});

test("negative insets are treated as absent, never as bonus space", () => {
  const b = canvasBoxFor(1000, 600, { top: -50, right: -10, bottom: 0, left: 0 });
  expect(b.width).toBe(1000);
  expect(b.height).toBe(600);
  expect(b.left).toBe(0);
  expect(b.top).toBe(0);
});

test("NARROW marks the overlay-rail breakpoint from the layout spec", () => {
  expect(NARROW).toBe(900);
});
