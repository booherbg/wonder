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
  for (const k of ["E", "space", "Q", "H", "J", "M", "L", "P", "R", "esc"]) {
    expect(keys).toContain(k);
  }
  expect(keys.some((k) => k?.includes("arrows"))).toBe(true);
});

test("the guide names the Tab menu", () => {
  const tab = helpSections()[0].entries.find((e) => e.key === "Tab");
  expect(tab).toBeDefined();
  expect(tab!.text).toContain("menu");
});

test("space is the one action, resolved by the held slot", () => {
  const act = helpSections()[0].entries.find((e) => e.key === "space");
  expect(act).toBeDefined();
  const t = act!.text.toLowerCase();
  expect(t).toContain("gather"); // the hand
  expect(t).toContain("till"); // the hoe
  expect(t).toContain("plant"); // the pouch
});

test("the camp chapter names the hand-gather that feeds a fire", () => {
  const camp = helpSections()[1].entries.map((e) => e.text).join(" ");
  expect(camp).toContain("press space to gather");
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

test("the guide teaches tilling and planting, and why", () => {
  // the camp chapter says the point: work a tilled bed, garden off the usual habitat
  const camp = helpSections()[1].entries.map((e) => e.text).join(" ").toLowerCase();
  expect(camp).toContain("hoe");
  expect(camp).toContain("tilled");
  expect(camp).toContain("habitat");
});

test("the living web teaches the insect clouds: what they do and how to meet one", () => {
  const web = helpSections().find((s) => s.title === "the living web")!.entries.map((e) => e.text).join(" ");
  // the swarms are named, their adaptation and the reciprocal boom said plainly
  expect(web).toContain("clouds of insects");
  expect(web).toContain("swarm");
  expect(web).toContain("colour of the flower");
  expect(web).toContain("thickens");
  // and both ways to meet one are taught: the lean-in and the click
  expect(web).toContain("lean close (E)");
  expect(web).toContain("click");
});

test("the guide no longer lies about predation — insectivory presses the exposed, gently", () => {
  const web = helpSections().find((s) => s.title === "the living web")!.entries.map((e) => e.text).join(" ");
  // the old line ("nothing hunts here") is gone…
  expect(web).not.toContain("nothing hunts");
  // …and the truth holds the peaceful register: nothing dies, numbers ebb and refill,
  // a conspicuous cloud is thinned and a matched one is spared
  expect(web).toContain("nothing dies");
  expect(web).toContain("thinned");
  expect(web).toContain("fills again");
  expect(web).toContain("passed over");
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

test("the guide teaches the swarm verbs: lean the view in (Z), and court a cloud with a sown flower", () => {
  const web = helpSections().find((s) => s.title === "the living web")!.entries.map((e) => e.text).join(" ");
  // the 17 insect forms only differentiate up close — the Z lean is where to look
  expect(web).toContain("(Z)");
  expect(web).toContain("insects themselves");
  // and the one big player verb is finally written down: plant a flower, draw a cloud
  expect(web).toContain("sow a flower");
  expect(web).toContain("planted bloom");
});
