import { expect, test } from "vitest";
import { emptyInventory } from "../src/game/inventory";
import { BEDROLL_COST, FIRE_COST, placeMaterials } from "../src/game/materials";
import { SavedWorld, packWorld } from "../src/game/save";
import { generate } from "../src/world/generate";
import { Tile, WALKABLE } from "../src/world/types";

test("materials sit where the island offers them, deterministic per seed", () => {
  for (const seed of [1, 20, 42]) {
    const map = generate(seed);
    const nodes = placeMaterials(map, seed);
    expect(JSON.stringify(nodes)).toBe(JSON.stringify(placeMaterials(map, seed)));
    for (const n of nodes) {
      const t = map.tiles[n.y * map.width + n.x] as Tile;
      const sides = [
        map.tiles[n.y * map.width + n.x + 1],
        map.tiles[n.y * map.width + n.x - 1],
        map.tiles[(n.y + 1) * map.width + n.x],
        map.tiles[(n.y - 1) * map.width + n.x],
      ];
      if (n.kind === "wood") {
        // driftwood on the shore, or fallen wood on the forest floor
        const driftwood = t === Tile.Sand && sides.some((s) => s === Tile.ShallowWater || s === Tile.DeepWater);
        expect(driftwood || t === Tile.Forest).toBe(true);
      } else if (n.kind === "rush") {
        expect(t).toBe(Tile.Marsh);
      } else {
        // stone always stands on walkable ground you can reach
        expect(WALKABLE.has(t)).toBe(true);
      }
    }
    // indices are stable handles for the save's taken-list
    nodes.forEach((n, i) => expect(n.idx).toBe(i));
  }
});

test("every island can raise a fire — wood AND stone are both findable", () => {
  // the bug this guards: a low-rock island where stone couldn't be found at all,
  // so a fire could never be built. Stone now comes from shores/scree/falls too.
  for (const seed of [1, 20, 42, 7, 13, 3, 11, 27, 40]) {
    const nodes = placeMaterials(generate(seed), seed);
    const wood = nodes.filter((n) => n.kind === "wood").length;
    const stone = nodes.filter((n) => n.kind === "stone").length;
    expect(wood, `seed ${seed} wood`).toBeGreaterThanOrEqual(FIRE_COST.wood);
    expect(stone, `seed ${seed} stone`).toBeGreaterThanOrEqual(FIRE_COST.stone);
  }
});

test("forests carry fallen wood, not just beaches", () => {
  const map = generate(20);
  const nodes = placeMaterials(map, 20);
  const forestWood = nodes.filter(
    (n) => n.kind === "wood" && (map.tiles[n.y * map.width + n.x] as Tile) === Tile.Forest,
  );
  expect(forestWood.length).toBeGreaterThan(0);
});

test("mountainous islands shed plenty of stones", () => {
  const map = generate(20);
  const stones = placeMaterials(map, 20).filter((n) => n.kind === "stone");
  expect(stones.length).toBeGreaterThan(FIRE_COST.stone);
});

test("marshy islands stand thick with rushes", () => {
  const map = generate(20); // confluence pools ring themselves in marsh
  const rushes = placeMaterials(map, 20).filter((n) => n.kind === "rush");
  expect(rushes.length).toBeGreaterThan(BEDROLL_COST.rush);
});

test("the camp survives the save roundtrip", () => {
  const packed = packWorld(
    5, 10, { x: 1, y: 2 }, { x: 3, y: 4 },
    emptyInventory(), [], 99, [], [],
    { wood: 2, stone: 1, rush: 3, taken: [4, 9, 17], fire: true, bedroll: true },
  );
  const saved = JSON.parse(JSON.stringify(packed)) as SavedWorld;
  expect(saved.camp).toEqual({ wood: 2, stone: 1, rush: 3, taken: [4, 9, 17], fire: true, bedroll: true });
  const old = JSON.parse(JSON.stringify(packWorld(5, 10, { x: 1, y: 2 }, null, emptyInventory(), [], 99))) as SavedWorld;
  expect(old.camp ?? null).toBeNull(); // old saves simply have no camp yet
});
