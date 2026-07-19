import { expect, test } from "vitest";
import { BEDROLL_COST, FIRE_COST } from "../src/game/materials";
import { HELP_WELCOME, helpSections } from "../src/render/help";

test("the guide keeps its three small chapters, in the quiet voice", () => {
  const sections = helpSections();
  expect(sections.map((s) => s.title)).toEqual(["the keys", "your camp", "things to seek"]);
  for (const s of sections) {
    expect(s.title).toBe(s.title.toLowerCase());
    expect(s.entries.length).toBeGreaterThan(0);
  }
});

test("every verb the game answers to has a line", () => {
  const keys = helpSections()[0].entries.map((e) => e.key);
  for (const k of ["E", "F", "G", "Q", "H", "J", "M", "L", "P", "R", "esc"]) {
    expect(keys).toContain(k);
  }
  expect(keys.some((k) => k?.includes("arrows"))).toBe(true);
});

test("the camp chapter quotes the true costs and says where to look", () => {
  const camp = helpSections()[1].entries.map((e) => e.text).join(" ");
  // costs come from materials.ts, so the card can never drift from the code
  expect(camp).toContain(`${FIRE_COST.wood} driftwood`);
  expect(camp).toContain(`${FIRE_COST.stone} stones`);
  expect(camp).toContain(`${BEDROLL_COST.wood} driftwood`);
  expect(camp).toContain(`${BEDROLL_COST.rush} rushes`);
  // and each material names its ground
  expect(camp).toContain("beach");
  expect(camp).toContain("rock");
  expect(camp).toContain("marsh");
});

test("things to seek leaves doors ajar: night, tide, drift, other islands", () => {
  const seek = helpSections()[2].entries.map((e) => e.text).join(" ");
  expect(seek).toContain("night");
  expect(seek).toContain("the sea breathes"); // the tide, named the island's way
  expect(seek).toContain("drift");
  expect(seek).toContain("R sails");
});

test("the welcome points at the first verb and the way back to the card", () => {
  expect(HELP_WELCOME).toContain("E");
  expect(HELP_WELCOME).toContain("?");
  expect(HELP_WELCOME).toContain("driftwood");
});
