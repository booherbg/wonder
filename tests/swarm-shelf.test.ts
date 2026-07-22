import { expect, test } from "vitest";
import { SwarmEntry } from "../src/game/journal";
import { swarmPageLines } from "../src/render/journal";

// The almanac's swarm shelf: each cloud met earns a page, and the page's
// lines are pure — a test can read a whole page exactly as a wanderer would.

function entry(overrides: Partial<SwarmEntry> = {}): SwarmEntry {
  return {
    key: "7:swarm:2",
    seed: 7,
    island: "Dusil Skerry",
    swarmId: 2,
    name: "Lufer Dartwing",
    hostName: "Luma Bell",
    bestResemblance: 0.42,
    population: 61,
    firstMetAt: 1000,
    meetings: 3,
    sensor: Array.from({ length: 49 }, (_, i) => (i % 5 === 0 ? 3 : 0)),
    behavior: { range: 0.2, nerve: 0.7, cohesion: 0.5 },
    ...overrides,
  };
}

test("a cloud's page reads its bloom, its meetings, and the best ever witnessed", () => {
  expect(swarmPageLines(entry())).toEqual([
    "works Luma Bell",
    "met 3 times",
    "42% come to match its flower, at its closest",
    "the fullest cloud seen: 61 aloft",
  ]);
});

test("a single meeting says so, gently", () => {
  expect(swarmPageLines(entry({ meetings: 1 }))[1]).toBe("met once");
});

test("a page from before the shelf learned to draw still reads in full", () => {
  // older journals carry no sketch — the words must never depend on it
  const bare = entry({ sensor: undefined, behavior: undefined });
  expect(swarmPageLines(bare)).toHaveLength(4);
});
