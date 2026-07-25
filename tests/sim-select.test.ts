import { expect, test } from "vitest";
import { RADIUS_FOR, cycleIndex, rankCandidates } from "../src/game/simSelect";

const at = (x: number, y: number) => ({ x, y });

// The bug this replaces: selection was hard class priority (swarm > critter >
// plant) and the swarm's radius was 2.3x the plant's, so the flower under a
// cloud could never be selected — the one pairing the bench exists to study.

test("rankCandidates prefers the nearer thing even when a swarm is in reach", () => {
  const out = rankCandidates({
    wx: 0,
    wy: 0,
    swarms: [at(40, 0)],
    critters: [],
    plants: [at(4, 0)],
  });
  expect(out[0].kind).toBe("plant");
  expect(out[1].kind).toBe("swarm");
});

test("rankCandidates normalises by each kind's own radius, so clouds keep their reach", () => {
  // The swarm sits at half its radius, the plant at 0.9 of its own: the swarm
  // is relatively nearer and leads, though it is further away in raw pixels.
  const out = rankCandidates({
    wx: 0,
    wy: 0,
    swarms: [at(RADIUS_FOR.swarm * 0.5, 0)],
    critters: [],
    plants: [at(RADIUS_FOR.plant * 0.9, 0)],
  });
  expect(out[0].kind).toBe("swarm");
  expect(RADIUS_FOR.swarm).toBeGreaterThan(RADIUS_FOR.plant);
});

test("rankCandidates drops anything out of its own reach", () => {
  const out = rankCandidates({
    wx: 0,
    wy: 0,
    swarms: [at(RADIUS_FOR.swarm + 1, 0)],
    critters: [],
    plants: [at(2, 0)],
  });
  expect(out).toHaveLength(1);
  expect(out[0].kind).toBe("plant");
});

test("rankCandidates returns nothing when nothing is in reach", () => {
  expect(rankCandidates({ wx: 0, wy: 0, swarms: [], critters: [], plants: [] })).toEqual([]);
});

test("rankCandidates lists every in-reach candidate, so the caller can cycle and label", () => {
  // Scores are distance / own radius, NOT raw distance — that is the whole
  // point. With TILE_SIZE 16: plant 3/24 = 0.125, swarm 10/56 = 0.179,
  // critter 6/24 = 0.25. So the swarm outranks a critter that is nearer in
  // raw pixels, because a drifting cloud is allowed a wider target.
  const out = rankCandidates({
    wx: 0,
    wy: 0,
    swarms: [at(10, 0)],
    critters: [at(6, 0)],
    plants: [at(3, 0)],
  });
  expect(out).toHaveLength(3);
  expect(out.map((c) => c.kind)).toEqual(["plant", "swarm", "critter"]);
  expect(out.map((c) => c.score)).toEqual([...out.map((c) => c.score)].sort((a, b) => a - b));
});

test("rankCandidates hands back the original object, so the caller can inspect it", () => {
  const plant = { x: 3, y: 0, species: 7 };
  const out = rankCandidates({ wx: 0, wy: 0, swarms: [], critters: [], plants: [plant] });
  expect(out[0].ref).toBe(plant);
});

test("cycleIndex starts at the nearest on a new spot", () => {
  expect(cycleIndex(null, "a", 3, 2)).toBe(0);
  expect(cycleIndex("a", "b", 1, 3)).toBe(0);
});

test("cycleIndex advances on a repeat click at the same spot", () => {
  expect(cycleIndex("a", "a", 0, 3)).toBe(1);
  expect(cycleIndex("a", "a", 1, 3)).toBe(2);
});

test("cycleIndex wraps back to the first candidate", () => {
  expect(cycleIndex("a", "a", 2, 3)).toBe(0);
});

test("cycleIndex stays put when there is only one candidate", () => {
  expect(cycleIndex("a", "a", 0, 1)).toBe(0);
});

test("cycleIndex never returns a bad index when the stack empties", () => {
  expect(cycleIndex("a", "a", 2, 0)).toBe(0);
});
