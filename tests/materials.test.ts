import { expect, test } from "vitest";
import { emptyInventory } from "../src/game/inventory";
import { BEDROLL_COST, FIRE_COST, isDiggable, isLayable, isTillable, placeMaterials } from "../src/game/materials";
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

test("soil is dug from soft, plain ground — not from water, rock, or cliff", () => {
  // the four kinds of plain earth a clod lifts from, matching where you settle home
  for (const t of [Tile.Grass, Tile.Marsh, Tile.Sand, Tile.Forest]) {
    expect(isDiggable(t), Tile[t]).toBe(true);
  }
  // water is for wading, bare rock and cliff are too hard, snow too cold
  for (const t of [Tile.DeepWater, Tile.ShallowWater, Tile.Rock, Tile.Cliff, Tile.Snow]) {
    expect(isDiggable(t), Tile[t]).toBe(false);
  }
});

test("a carried clod lays on any ground you can stand on but the sea", () => {
  // soil can amend even the barren heights — carry earth up and garden there
  for (const t of [Tile.Grass, Tile.Marsh, Tile.Sand, Tile.Forest, Tile.Scree, Tile.Highland]) {
    expect(isLayable(t), Tile[t]).toBe(true);
  }
  // never in the shallows (it would wash away), nor where you cannot stand
  for (const t of [Tile.ShallowWater, Tile.DeepWater, Tile.Rock, Tile.Cliff, Tile.Snow]) {
    expect(isLayable(t), Tile[t]).toBe(false);
  }
});

test("a hoe tills the soft, plain earth — not water, rock, cliff, snow, nor the barren heights", () => {
  // the four kinds of soft lowland ground, the same earth you settle a home on
  for (const t of [Tile.Grass, Tile.Marsh, Tile.Sand, Tile.Forest]) {
    expect(isTillable(t), Tile[t]).toBe(true);
  }
  // no clod to carry now, so the loose scree and alpine turf are off-limits too
  for (const t of [Tile.DeepWater, Tile.ShallowWater, Tile.Rock, Tile.Cliff, Tile.Snow, Tile.Scree, Tile.Highland]) {
    expect(isTillable(t), Tile[t]).toBe(false);
  }
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

test("carried soil rides the camp across the save, absent in older saves", () => {
  const packed = packWorld(
    5, 10, { x: 1, y: 2 }, { x: 3, y: 4 },
    emptyInventory(), [], 99, [], [],
    { wood: 2, stone: 1, rush: 3, soil: 5, taken: [], fire: false, bedroll: false },
  );
  const saved = JSON.parse(JSON.stringify(packed)) as SavedWorld;
  expect(saved.camp?.soil).toBe(5);
  // a camp saved before soil existed has none — the reader defaults it to zero
  const before = packWorld(
    5, 10, { x: 1, y: 2 }, { x: 3, y: 4 },
    emptyInventory(), [], 99, [], [],
    { wood: 2, stone: 1, rush: 3, taken: [], fire: false, bedroll: false },
  );
  const older = JSON.parse(JSON.stringify(before)) as SavedWorld;
  expect(older.camp?.soil ?? 0).toBe(0);
});
