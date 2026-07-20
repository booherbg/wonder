import { expect, test } from "vitest";
import { campActionRows, menuLaunchers } from "../src/render/menu";
import { BEDROLL_COST, FIRE_COST } from "../src/game/materials";

const cost = { fire: FIRE_COST, bedroll: BEDROLL_COST };

test("launchers name each tucked-away action and its key; toss only with seeds", () => {
  const none = menuLaunchers(0).map((a) => a.key);
  expect(none).toEqual(["C", "L", "?", "M", "J", "P", "N"]);
  expect(menuLaunchers(2).map((a) => a.key)).toContain("Q");
});

test("a fire action greys out until you carry enough, and quotes the true cost", () => {
  const broke = campActionRows({ wood: 0, stone: 0, rush: 0 }, false, false, cost)[0];
  expect(broke.id).toBe("fire");
  expect(broke.ready).toBe(false);
  expect(broke.label).toContain(`${FIRE_COST.wood} driftwood`);
  expect(broke.label).toContain(`${FIRE_COST.stone} stones`);
  const flush = campActionRows({ wood: 9, stone: 9, rush: 9 }, false, false, cost)[0];
  expect(flush.ready).toBe(true);
});

test("a built camp action reads as done, not as a recipe", () => {
  const rows = campActionRows({ wood: 9, stone: 9, rush: 9 }, true, true, cost);
  expect(rows.find((r) => r.id === "fire")!.done).toBe(true);
  expect(rows.find((r) => r.id === "fire")!.label).toContain("burning every night");
  expect(rows.find((r) => r.id === "bedroll")!.label).toContain("woven rushes");
});
