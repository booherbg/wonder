import { expect, test } from "vitest";
import { PLAYER_SPEED, Player } from "../src/game/player";
import { Tile, WorldMap } from "../src/world/types";

// '.' grass, '#' rock, '~' deep water — 16px tiles
function mapFrom(rows: string[]): WorldMap {
  const height = rows.length;
  const width = rows[0].length;
  const tiles = new Uint8Array(width * height);
  const chars: Record<string, Tile> = { ".": Tile.Grass, "#": Tile.Rock, "~": Tile.DeepWater };
  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) tiles[y * width + x] = chars[row[x]];
  });
  return {
    width, height, seed: 0, tiles,
    elevation: new Float32Array(width * height), rivers: [], spawn: { x: 1, y: 1 },
  };
}

const IDLE = { up: false, down: false, left: false, right: false };

test("walks right on open grass at PLAYER_SPEED", () => {
  const map = mapFrom(["....", "....", "....", "...."]);
  const p = new Player(32, 32);
  p.update(0.1, { ...IDLE, right: true }, map);
  expect(p.x).toBeCloseTo(32 + PLAYER_SPEED * 0.1, 5);
  expect(p.y).toBe(32);
});

test("diagonal movement is normalized (not faster)", () => {
  const map = mapFrom(["....", "....", "....", "...."]);
  const p = new Player(32, 32);
  p.update(0.1, { ...IDLE, right: true, down: true }, map);
  const dist = Math.hypot(p.x - 32, p.y - 32);
  expect(dist).toBeCloseTo(PLAYER_SPEED * 0.1, 5);
});

test("rock blocks movement", () => {
  const map = mapFrom(["....", "..#.", "....", "...."]);
  const p = new Player(24, 24); // feet box sits inside tile (1,1)
  p.update(0.1, { ...IDLE, right: true }, map); // tile (2,1) is rock
  expect(p.x).toBe(24);
});

test("deep water blocks movement", () => {
  const map = mapFrom(["....", "..~.", "....", "...."]);
  const p = new Player(24, 24);
  p.update(0.1, { ...IDLE, right: true }, map);
  expect(p.x).toBe(24);
});

test("slides along a wall (blocked axis stops, free axis moves)", () => {
  const map = mapFrom(["....", "..#.", "....", "...."]);
  const p = new Player(24, 24);
  p.update(0.1, { ...IDLE, right: true, down: true }, map);
  expect(p.x).toBe(24); // blocked by rock
  expect(p.y).toBeGreaterThan(24); // still slides down
});

test("map edge blocks movement (out of bounds is deep water)", () => {
  const map = mapFrom(["....", "....", "....", "...."]);
  const p = new Player(8, 8);
  p.update(1.0, { ...IDLE, left: true }, map);
  expect(p.x).toBe(8);
});
