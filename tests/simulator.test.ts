import { expect, test } from "vitest";
import { nearestFlowerIndex } from "../src/game/simulator";

// The Simulator's one bit of spatial glue over the tested core: each tick a swarm
// feeds on its NEAREST flower. That selection is pure and worth pinning down.

test("nearestFlowerIndex picks the closest flower", () => {
  const flowers = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 5, y: 5 },
  ];
  expect(nearestFlowerIndex(9, 0, flowers)).toBe(1); // hugging the second
  expect(nearestFlowerIndex(1, 1, flowers)).toBe(0); // hugging the first
  expect(nearestFlowerIndex(5, 4, flowers)).toBe(2); // hugging the third
});

test("nearestFlowerIndex returns -1 when there are no flowers", () => {
  expect(nearestFlowerIndex(3, 3, [])).toBe(-1);
});

test("nearestFlowerIndex breaks ties by first-seen", () => {
  const flowers = [
    { x: 2, y: 0 },
    { x: -2, y: 0 },
  ]; // both distance 2 from origin
  expect(nearestFlowerIndex(0, 0, flowers)).toBe(0);
});
