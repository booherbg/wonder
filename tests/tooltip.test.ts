import { expect, test } from "vitest";
import { tooltipPosition } from "../src/render/tooltip";

// Edge-aware placement for the shared tooltip layer (spec §3.6). Pure —
// no DOM, no Date.now. Default below-right; flip at the viewport edge;
// never return a negative coordinate.

const tip = { width: 160, height: 28 };
const viewport = { width: 800, height: 600 };

test("default placement is below-right of the anchor", () => {
  const anchor = { left: 100, top: 80, width: 40, height: 24 };
  expect(tooltipPosition(anchor, tip, viewport)).toEqual({
    left: 100,
    top: 80 + 24,
  });
});

test("flips left when the tip would overflow the right edge", () => {
  // Anchor near the right; tip at anchor.left would spill past 800.
  const anchor = { left: 700, top: 80, width: 40, height: 24 };
  const pos = tooltipPosition(anchor, tip, viewport);
  expect(pos.left).toBe(700 + 40 - 160); // right-align to anchor
  expect(pos.top).toBe(80 + 24);
  expect(pos.left + tip.width).toBeLessThanOrEqual(viewport.width);
});

test("flips above when the tip would overflow the bottom edge", () => {
  const anchor = { left: 100, top: 560, width: 40, height: 24 };
  const pos = tooltipPosition(anchor, tip, viewport);
  expect(pos.left).toBe(100);
  expect(pos.top).toBe(560 - 28); // above the anchor
  expect(pos.top + tip.height).toBeLessThanOrEqual(anchor.top);
});

test("never returns a negative coordinate", () => {
  // Tip wider/taller than the room above-left of a corner anchor.
  const anchor = { left: 4, top: 4, width: 20, height: 16 };
  const fat = { width: 200, height: 80 };
  const tiny = { width: 100, height: 50 };
  const pos = tooltipPosition(anchor, fat, tiny);
  expect(pos.left).toBeGreaterThanOrEqual(0);
  expect(pos.top).toBeGreaterThanOrEqual(0);
});
