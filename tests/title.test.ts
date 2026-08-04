import { expect, test } from "vitest";
import { titleRows } from "../src/render/title";

test("a returning wanderer sees all five rows in order", () => {
  const rows = titleRows({ lastSeed: 42, lastName: "Orka Cay", savedCount: 3 });
  expect(rows.map((r) => r.id)).toEqual(["continue", "new", "isles", "sim", "guide"]);
  expect(rows[0].label).toBe("continue — Orka Cay");
  expect(rows[1].label).toBe("a new island");
});

test("no last island: 'continue' is hidden", () => {
  const rows = titleRows({ lastSeed: null, lastName: null, savedCount: 2 });
  expect(rows.map((r) => r.id)).toEqual(["new", "isles", "sim", "guide"]);
});

test("no saved isles: 'the isles you've known' is hidden", () => {
  const rows = titleRows({ lastSeed: 42, lastName: "Orka Cay", savedCount: 0 });
  expect(rows.map((r) => r.id)).toEqual(["continue", "new", "sim", "guide"]);
});

test("a true first visit: only new, simulator, guide", () => {
  const rows = titleRows({ lastSeed: null, lastName: null, savedCount: 0 });
  expect(rows.map((r) => r.id)).toEqual(["new", "sim", "guide"]);
});

test("a last island with no remembered name falls back to 'your island'", () => {
  const rows = titleRows({ lastSeed: 42, lastName: null, savedCount: 0 });
  const continueRow = rows.find((r) => r.id === "continue");
  expect(continueRow?.label).toBe("continue — your island");
});

test("continue names a Hollow as a Hollow, since the seed's name is shared", () => {
  const hollow = titleRows({ lastSeed: 42, lastName: "Orka Cay", lastStyle: "hollow", savedCount: 1 });
  expect(hollow[0].label).toBe("continue — Orka Cay, a Hollow");
  // absent style reads as classic: the row is exactly what it was
  const classic = titleRows({ lastSeed: 42, lastName: "Orka Cay", savedCount: 1 });
  expect(classic[0].label).toBe("continue — Orka Cay");
});
