import { expect, test } from "vitest";
import { CritterMood } from "../src/life/fauna";
import { moodLine } from "../src/render/inspect";

test("every mood has a gentle line, and hunger/ease name the plant", () => {
  const moods: CritterMood[] = ["content", "hungry", "drowsy", "weary", "curious", "wary"];
  for (const m of moods) {
    const line = moodLine(m, "Luma Bell");
    expect(line.length).toBeGreaterThan(3);
    expect(line).not.toContain("undefined");
  }
  // the two moods tied to appetite carry the plant's name; the rest don't need it
  expect(moodLine("hungry", "Luma Bell")).toContain("Luma Bell");
  expect(moodLine("content", "Luma Bell")).toContain("Luma Bell");
  expect(moodLine("curious", "Luma Bell")).toBe("watching you back");
});

test("an unknown mood still yields a line, never a blank card", () => {
  // defensively, a value outside the union falls through to the at-ease line
  const line = moodLine("mystery" as CritterMood, "Fern");
  expect(line).toContain("Fern");
});
