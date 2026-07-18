import { expect, test } from "vitest";
import { MURMURS } from "../src/game/murmurs";
import { generate } from "../src/world/generate";
import { Tile, WALKABLE, WorldMap } from "../src/world/types";

const CRATER_SEEDS = [20, 39, 59];
const PLAIN_SEEDS = [1, 42];

function reachesLake(map: WorldMap): boolean {
  const { x, y, lakeRadius } = map.crater!;
  const seen = new Uint8Array(map.tiles.length);
  const q = [map.spawn.y * map.width + map.spawn.x];
  seen[q[0]] = 1;
  while (q.length > 0) {
    const i = q.pop()!;
    const ix = i % map.width;
    const iy = (i / map.width) | 0;
    if (Math.hypot(ix - x, iy - y) <= lakeRadius) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = ix + dx;
      const ny = iy + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const j = ny * map.width + nx;
      if (!seen[j] && WALKABLE.has(map.tiles[j] as Tile)) {
        seen[j] = 1;
        q.push(j);
      }
    }
  }
  return false;
}

test("crater islands hold an earth's eye a wanderer can actually reach", () => {
  for (const seed of CRATER_SEEDS) {
    const map = generate(seed);
    const c = map.crater;
    expect(c).toBeDefined();
    // the pupil: deep water at the very center
    expect(map.tiles[c!.y * map.width + c!.x]).toBe(Tile.DeepWater);
    // the rim: mostly rock (sampled inside the ring), pierced by the one cut
    let rock = 0;
    let samples = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = Math.round(c!.x + Math.cos(a) * (c!.rimRadius - 1));
      const y = Math.round(c!.y + Math.sin(a) * (c!.rimRadius - 1));
      samples++;
      if (map.tiles[y * map.width + x] === Tile.Rock) rock++;
    }
    expect(rock / samples).toBeGreaterThan(0.5);
    // the inner shore: sand somewhere on the lake's ring
    let sand = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const x = Math.round(c!.x + Math.cos(a) * c!.lakeRadius);
      const y = Math.round(c!.y + Math.sin(a) * c!.lakeRadius);
      if (map.tiles[y * map.width + x] === Tile.Sand) sand++;
    }
    expect(sand).toBeGreaterThan(0);
    // the promise: reachable from spawn through the one river-cut
    expect(reachesLake(map)).toBe(true);
  }
});

test("most islands keep their hearts of stone", () => {
  for (const seed of PLAIN_SEEDS) {
    expect(generate(seed).crater).toBeUndefined();
  }
});

test("thoreau waits at the caldera", () => {
  expect(MURMURS.filter((m) => m.tag === "crater").length).toBeGreaterThanOrEqual(2);
});
