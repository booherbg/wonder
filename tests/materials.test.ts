import { expect, test } from "vitest";
import { emptyInventory } from "../src/game/inventory";
import { FIRE_COST, placeMaterials } from "../src/game/materials";
import { SavedWorld, packWorld } from "../src/game/save";
import { generate } from "../src/world/generate";
import { Tile, WALKABLE } from "../src/world/types";

test("driftwood beaches and stony rock-edges, deterministic per seed", () => {
  for (const seed of [1, 20, 42]) {
    const map = generate(seed);
    const nodes = placeMaterials(map, seed);
    expect(JSON.stringify(nodes)).toBe(JSON.stringify(placeMaterials(map, seed)));
    const wood = nodes.filter((n) => n.kind === "wood");
    expect(wood.length).toBeGreaterThan(5); // every island's sea leaves driftwood
    for (const n of nodes) {
      const t = map.tiles[n.y * map.width + n.x] as Tile;
      const sides = [
        map.tiles[n.y * map.width + n.x + 1],
        map.tiles[n.y * map.width + n.x - 1],
        map.tiles[(n.y + 1) * map.width + n.x],
        map.tiles[(n.y - 1) * map.width + n.x],
      ];
      if (n.kind === "wood") {
        expect(t).toBe(Tile.Sand);
        expect(sides.some((s) => s === Tile.ShallowWater || s === Tile.DeepWater)).toBe(true);
      } else {
        expect(WALKABLE.has(t)).toBe(true);
        expect(sides.some((s) => s === Tile.Rock)).toBe(true);
      }
    }
    // indices are stable handles for the save's taken-list
    nodes.forEach((n, i) => expect(n.idx).toBe(i));
  }
});

test("mountainous islands shed plenty of stones", () => {
  const map = generate(20);
  const stones = placeMaterials(map, 20).filter((n) => n.kind === "stone");
  expect(stones.length).toBeGreaterThan(FIRE_COST.stone);
});

test("the camp survives the save roundtrip", () => {
  const packed = packWorld(
    5, 10, { x: 1, y: 2 }, { x: 3, y: 4 },
    emptyInventory(), [], 99, [], [],
    { wood: 2, stone: 1, taken: [4, 9, 17], fire: true },
  );
  const saved = JSON.parse(JSON.stringify(packed)) as SavedWorld;
  expect(saved.camp).toEqual({ wood: 2, stone: 1, taken: [4, 9, 17], fire: true });
  const old = JSON.parse(JSON.stringify(packWorld(5, 10, { x: 1, y: 2 }, null, emptyInventory(), [], 99))) as SavedWorld;
  expect(old.camp ?? null).toBeNull(); // old saves simply have no camp yet
});
