import { expect, test } from "vitest";
import {
  EXPLORED_BOOK_CAP,
  EXPLORED_KEY,
  HOLLOW_EXPLORED_KEY,
  SIGHT,
  decodeExplored,
  emptyExplored,
  encodeExplored,
  isSeen,
  loadExplored,
  markSeen,
  saveExplored,
  seenFraction,
} from "../src/game/explored";
import { KV } from "../src/game/murmurs";

function fakeKV(): KV & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

test("a step inks the tile underfoot and the round glance about it", () => {
  const seen = emptyExplored(20, 20);
  expect(isSeen(seen, 20, 10, 10)).toBe(false); // fog first
  expect(markSeen(seen, 20, 20, 10, 10)).toBe(true);
  expect(isSeen(seen, 20, 10, 10)).toBe(true);
  expect(isSeen(seen, 20, 10 + SIGHT, 10)).toBe(true); // the glance reaches SIGHT tiles out
  expect(isSeen(seen, 20, 10 + SIGHT, 10 + SIGHT)).toBe(false); // rounded, not square
  expect(isSeen(seen, 20, 15, 10)).toBe(false); // far ground stays under fog
  expect(markSeen(seen, 20, 20, 10, 10)).toBe(false); // standing still inks nothing new
});

test("the island's edge clips the glance without complaint", () => {
  const seen = emptyExplored(8, 8);
  expect(markSeen(seen, 8, 8, 0, 0)).toBe(true);
  expect(isSeen(seen, 8, 0, 0)).toBe(true);
  // only the in-bounds quarter of the glance lands: 8 of the disc's 21 tiles
  expect(seenFraction(seen, 8, 8)).toBeCloseTo(8 / 64, 6);
});

test("seenFraction counts the ink, all fog 0 .. fully walked 1", () => {
  const seen = emptyExplored(10, 10);
  expect(seenFraction(seen, 10, 10)).toBe(0);
  markSeen(seen, 10, 10, 5, 5);
  expect(seenFraction(seen, 10, 10)).toBeCloseTo(21 / 100, 6); // the whole disc fits
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) markSeen(seen, 10, 10, x, y);
  expect(seenFraction(seen, 10, 10)).toBe(1);
});

test("the paper map survives the round trip, ink exactly where ink was", () => {
  const seen = emptyExplored(30, 20);
  markSeen(seen, 30, 20, 4, 4);
  markSeen(seen, 30, 20, 29, 19); // the far corner too
  markSeen(seen, 30, 20, 0, 0); // and ink on the very first tile (a leading "0" run)
  const back = decodeExplored(encodeExplored(seen, 30, 20), 30, 20);
  expect(back).not.toBeNull();
  expect([...back!]).toEqual([...seen]);
});

test("a torn or wrong-sized paper map starts a fresh sheet", () => {
  expect(decodeExplored("not runs!", 10, 10)).toBeNull();
  expect(decodeExplored("50.9000", 10, 10)).toBeNull(); // more island than there is
  expect(decodeExplored("50", 10, 10)).toBeNull(); // less island than there is
  // a map drawn for another size of island never fits this one
  expect(decodeExplored(encodeExplored(emptyExplored(8, 8), 8, 8), 10, 10)).toBeNull();
});

test("each island keeps its own map in the one book", () => {
  const kv = fakeKV();
  const a = emptyExplored(12, 12);
  markSeen(a, 12, 12, 3, 3);
  saveExplored(7, "classic", a, 12, 12, kv);
  const b = emptyExplored(12, 12);
  markSeen(b, 12, 12, 9, 9);
  saveExplored(42, "classic", b, 12, 12, kv); // a different island shares the one book
  const backA = loadExplored(7, "classic", 12, 12, kv);
  expect(isSeen(backA, 12, 3, 3)).toBe(true);
  expect(isSeen(backA, 12, 9, 9)).toBe(false); // island 42's ink never bleeds over
  expect([...loadExplored(42, "classic", 12, 12, kv)]).toEqual([...b]);
});

test("an island never visited, or an unreadable book, waits under full fog", () => {
  const kv = fakeKV();
  expect(seenFraction(loadExplored(5, "classic", 12, 12, kv), 12, 12)).toBe(0);
  kv.map.set(EXPLORED_KEY, "{ not json ]");
  expect(seenFraction(loadExplored(5, "classic", 12, 12, kv), 12, 12)).toBe(0);
  // a map saved before the world grew (another config) reads as fresh fog
  const old = emptyExplored(8, 8);
  markSeen(old, 8, 8, 4, 4);
  const kv2 = fakeKV();
  saveExplored(7, "classic", old, 8, 8, kv2);
  expect(seenFraction(loadExplored(7, "classic", 12, 12, kv2), 12, 12)).toBe(0);
});

test("the book stays small: the longest-untouched islands let go first", () => {
  const kv = fakeKV();
  const seen = emptyExplored(8, 8);
  markSeen(seen, 8, 8, 4, 4);
  for (let s = 0; s < EXPLORED_BOOK_CAP + 3; s++) saveExplored(s, "classic", seen, 8, 8, kv);
  const book = JSON.parse(kv.map.get(EXPLORED_KEY)!) as Record<string, string>;
  expect(Object.keys(book).length).toBe(EXPLORED_BOOK_CAP);
  expect(book["0:map"]).toBeUndefined(); // the first-drawn maps have been let go
  expect(book["2:map"]).toBeUndefined();
  expect(book[`${EXPLORED_BOOK_CAP + 2}:map`]).toBeDefined(); // the freshest keeps
  // re-touching an old island moves its map back to the freshest end
  saveExplored(3, "classic", seen, 8, 8, kv);
  const after = JSON.parse(kv.map.get(EXPLORED_KEY)!) as Record<string, string>;
  expect(Object.keys(after)[EXPLORED_BOOK_CAP - 1]).toBe("3:map");
});

test("the two styles keep separate fog books at one seed", () => {
  const kv = fakeKV();
  // classic is 300x300 and the Hollow 140x140 (DEFAULT_CONFIG / HOLLOW_CONFIG);
  // 12x12 and 6x6 stand in for the two sizes here
  const classic = emptyExplored(12, 12);
  markSeen(classic, 12, 12, 3, 3);
  saveExplored(11, "classic", classic, 12, 12, kv);
  const hollow = emptyExplored(6, 6);
  markSeen(hollow, 6, 6, 1, 1);
  saveExplored(11, "hollow", hollow, 6, 6, kv);
  // each book holds exactly its own style's page — neither evicted the other
  expect(Object.keys(JSON.parse(kv.map.get(EXPLORED_KEY)!) as object)).toEqual(["11:map"]);
  expect(Object.keys(JSON.parse(kv.map.get(HOLLOW_EXPLORED_KEY)!) as object)).toEqual(["11:map"]);
  expect([...loadExplored(11, "classic", 12, 12, kv)]).toEqual([...classic]);
  expect([...loadExplored(11, "hollow", 6, 6, kv)]).toEqual([...hollow]);
});

test("classic writes the exact key and page shape it always wrote", () => {
  const kv = fakeKV();
  const seen = emptyExplored(8, 8);
  markSeen(seen, 8, 8, 4, 4);
  saveExplored(7, "classic", seen, 8, 8, kv);
  // the byte-for-byte contract: builds before the Hollow wrote this key, with
  // this entry name and this encoding, and they must keep loading
  expect(kv.map.get(HOLLOW_EXPLORED_KEY)).toBeUndefined();
  const book = JSON.parse(kv.map.get(EXPLORED_KEY)!) as Record<string, string>;
  expect(book["7:map"]).toBe(encodeExplored(seen, 8, 8));
  // and a page written by such a build reads back unchanged
  const old = fakeKV();
  old.map.set(EXPLORED_KEY, JSON.stringify({ "7:map": encodeExplored(seen, 8, 8) }));
  expect([...loadExplored(7, "classic", 8, 8, old)]).toEqual([...seen]);
});

test("a page of the wrong size is refused, never applied to another map", () => {
  const kv = fakeKV();
  const hollowSized = emptyExplored(6, 6);
  markSeen(hollowSized, 6, 6, 1, 1);
  // hand the Hollow's page to the classic book by force, then load a 12x12 map
  kv.map.set(EXPLORED_KEY, JSON.stringify({ "11:map": encodeExplored(hollowSized, 6, 6) }));
  expect(seenFraction(loadExplored(11, "classic", 12, 12, kv), 12, 12)).toBe(0);
});
