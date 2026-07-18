import { expect, test } from "vitest";
import { MURMURS } from "../src/game/murmurs";
import { generate } from "../src/world/generate";
import { Tile } from "../src/world/types";

test("confluences sit where two rivers truly meet, opened into a pool", () => {
  for (const seed of [6, 20]) {
    const map = generate(seed);
    const confluences = map.confluences ?? [];
    expect(confluences.length).toBeGreaterThan(0);
    expect(confluences.length).toBeLessThanOrEqual(4);
    for (const c of confluences) {
      const t = c.y * map.width + c.x;
      // the meeting is real: at least two rivers pass this tile
      expect(map.rivers.filter((r) => r.path.includes(t)).length).toBeGreaterThanOrEqual(2);
      // and the water opened: the pond's heart is shallow water
      expect(map.tiles[t]).toBe(Tile.ShallowWater);
    }
    // pools keep their distance from each other
    for (const a of confluences) {
      for (const b of confluences) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(6);
      }
    }
  }
});

test("some islands' rivers never meet", () => {
  expect(generate(2).confluences ?? []).toEqual([]);
});

test("hesse and maclean wait at the meeting of waters", () => {
  expect(MURMURS.filter((m) => m.tag === "confluence").length).toBeGreaterThanOrEqual(2);
});
