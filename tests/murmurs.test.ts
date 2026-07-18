import { expect, test } from "vitest";
import { MURMURS, pickMurmur } from "../src/game/murmurs";

test("every murmur has text, an em-dash attribution, and a tag", () => {
  for (const m of MURMURS) {
    expect(m.text.length).toBeGreaterThan(10);
    expect(m.attribution.startsWith("—")).toBe(true);
    expect(m.tag.length).toBeGreaterThan(2);
  }
});

test("pickMurmur respects the cooldown", () => {
  expect(pickMurmur("island", new Set(), 0, 10_000)).toBeNull();
  expect(pickMurmur("island", new Set(), 0, 60_000)).not.toBeNull();
});

test("pickMurmur never repeats and eventually runs dry per tag", () => {
  const shown = new Set<string>();
  const islandMurmurs = MURMURS.filter((m) => m.tag === "island").length;
  for (let i = 0; i < islandMurmurs; i++) {
    const m = pickMurmur("island", shown, -Infinity, 0);
    expect(m).not.toBeNull();
    expect(shown.has(m!.text)).toBe(false);
    shown.add(m!.text);
  }
  expect(pickMurmur("island", shown, -Infinity, 0)).toBeNull();
});
