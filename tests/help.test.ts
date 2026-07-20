import { expect, test } from "vitest";
import { BEDROLL_COST, FIRE_COST } from "../src/game/materials";
import { HELP_WELCOME, helpSections } from "../src/render/help";

test("the guide keeps its three small chapters, in the quiet voice", () => {
  const sections = helpSections();
  expect(sections.map((s) => s.title)).toEqual(["the keys", "your camp", "the living web", "things to seek"]);
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

test("the guide names the Tab menu", () => {
  const tab = helpSections()[0].entries.find((e) => e.key === "Tab");
  expect(tab).toBeDefined();
  expect(tab!.text).toContain("menu");
});

test("G gathers and F sows — G is the gather key (the mnemonic rebind)", () => {
  const keys = helpSections()[0].entries;
  const gather = keys.find((e) => e.text.startsWith("gather"));
  const sow = keys.find((e) => e.text.startsWith("sow"));
  expect(gather?.key).toBe("G");
  expect(sow?.key).toBe("F");
});

test("the camp chapter names G for the gather that feeds a fire", () => {
  const camp = helpSections()[1].entries.map((e) => e.text).join(" ");
  expect(camp).toContain("G gathers each");
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

test("the guide teaches digging and laying soil, and why", () => {
  const keys = helpSections()[0].entries;
  const dig = keys.find((e) => e.key === "T");
  const lay = keys.find((e) => e.key === "B");
  expect(dig?.text).toContain("soil");
  expect(lay?.text.toLowerCase()).toContain("till");
  // the camp chapter says the point: garden anywhere, off the usual habitat
  const camp = helpSections()[1].entries.map((e) => e.text).join(" ").toLowerCase();
  expect(camp).toContain("dig");
  expect(camp).toContain("tilled");
  expect(camp).toContain("habitat");
});

test("things to seek leaves doors ajar: night, tide, drift, other islands", () => {
  const seek = helpSections().find((s) => s.title === "things to seek")!.entries.map((e) => e.text).join(" ");
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
