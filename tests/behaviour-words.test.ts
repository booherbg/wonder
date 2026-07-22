import { expect, test } from "vitest";
import { behaviourLine, behaviourWords } from "../src/render/inspect";

// The gene→word bridge: the world's examine card and the Simulator bench both
// speak these words at these cutoffs (simulator.ts imports behaviourWords), so
// "a homebody" means the same number everywhere a wanderer meets it.

test("the three genes earn their words at the shared cutoffs", () => {
  expect(behaviourWords({ range: 0.12, nerve: 0.81, cohesion: 0.2 })).toEqual({
    range: "a homebody",
    nerve: "bold",
    cohesion: "a loose cloud",
  });
  expect(behaviourWords({ range: 0.92, nerve: 0.23, cohesion: 0.7 })).toEqual({
    range: "a wanderer",
    nerve: "skittish",
    cohesion: "a tight cloud",
  });
});

test("the middle band holds its middle words, cutoffs included", () => {
  expect(behaviourWords({ range: 0.34, nerve: 0.5, cohesion: 0.66 })).toEqual({
    range: "roams middling",
    nerve: "steady",
    cohesion: "an easy cloud",
  });
});

test("the world card's line is built from the very same words", () => {
  const b = { range: 0.1, nerve: 0.9, cohesion: 0.9 };
  const w = behaviourWords(b);
  expect(behaviourLine(b)).toBe(`${w.range} · ${w.nerve} · ${w.cohesion}`);
  expect(behaviourLine(b)).toBe("a homebody · bold · a tight cloud");
});
