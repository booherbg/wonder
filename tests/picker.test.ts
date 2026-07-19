import { expect, test } from "vitest";
import { agoPhrase, featurePhrase, isleRows } from "../src/render/picker";
import { islandName } from "../src/world/name";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

test("agoPhrase speaks in a wanderer's words, never a timestamp", () => {
  expect(agoPhrase(0)).toBe("moments ago");
  expect(agoPhrase(90 * 1000)).toBe("moments ago");
  expect(agoPhrase(30 * MIN)).toBe("within the hour");
  expect(agoPhrase(90 * MIN)).toBe("an hour ago");
  expect(agoPhrase(5 * HOUR)).toBe("5 hours ago");
  expect(agoPhrase(30 * HOUR)).toBe("a day ago");
  expect(agoPhrase(3 * DAY)).toBe("3 days ago");
  expect(agoPhrase(60 * DAY)).toBe("long ago");
});

test("a skewed clock reads as moments ago, never the future", () => {
  expect(agoPhrase(-5 * MIN)).toBe("moments ago");
});

test("featurePhrase names one standout, rarest first", () => {
  expect(featurePhrase({})).toBeNull();
  expect(featurePhrase({ falls: [], springs: [], confluences: [] })).toBeNull();
  expect(featurePhrase({ confluences: [{}] })).toBe("a meeting of rivers");
  expect(featurePhrase({ springs: [{}] })).toBe("a warm spring");
  expect(featurePhrase({ springs: [{}, {}], confluences: [{}] })).toBe("warm springs");
  expect(featurePhrase({ falls: [{}], springs: [{}] })).toBe("a waterfall");
  expect(featurePhrase({ falls: [{}, {}] })).toBe("waterfalls");
  expect(featurePhrase({ crater: { x: 1 }, falls: [{}, {}] })).toBe("a crater lake");
});

test("isleRows keeps the index order, marks here, dates the rest", () => {
  const now = 1000 + 3 * HOUR;
  const rows = isleRows(
    [7, 42, 99],
    7,
    now,
    (s) => (s === 42 ? 1000 : null),
    (s) => ({ shape: `shape of ${s}`, feature: s === 42 ? "a crater lake" : null }),
  );
  expect(rows.map((r) => r.seed)).toEqual([7, 42, 99]);
  // the island underfoot: named, marked, never dated
  expect(rows[0].current).toBe(true);
  expect(rows[0].lastSeen).toBe("you are here now");
  expect(rows[0].name).toBe(islandName(7));
  expect(rows[0].shape).toBe("shape of 7");
  // a far island: dated from its save, wearing its feature
  expect(rows[1].current).toBe(false);
  expect(rows[1].lastSeen).toBe("last seen 3 hours ago");
  expect(rows[1].feature).toBe("a crater lake");
  // its save has gone; its name remains
  expect(rows[2].lastSeen).toBe("last seen long ago");
});

test("an empty index makes an empty ledger, quietly", () => {
  expect(isleRows([], 7, 0, () => null, () => ({ shape: "s", feature: null }))).toEqual([]);
});
