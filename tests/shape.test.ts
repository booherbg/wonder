import { expect, test } from "vitest";
import { DEFAULT_CONFIG } from "../src/world/config";
import { SHAPES, generate, rollShape } from "../src/world/generate";
import { Tile, WorldMap } from "../src/world/types";

test("every silhouette occurs, deterministically, across a spread of seeds", () => {
  const counts = new Map<string, number>();
  for (let seed = 1; seed <= 400; seed++) {
    const s = rollShape(seed);
    expect(s).toBe(rollShape(seed));
    expect(SHAPES).toContain(s);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  for (const s of SHAPES) {
    expect(counts.get(s) ?? 0).toBeGreaterThan(8); // none vanishingly rare
  }
});

test("generated islands carry their shape and all shapes generate viable worlds", () => {
  for (const shape of SHAPES) {
    const map = generate(17, DEFAULT_CONFIG, shape);
    expect(map.shape).toBe(shape);
    expect(map.rivers.length).toBeGreaterThan(0); // even gentle isles gather water
  }
});

test("a lowland weald never grows mountains", () => {
  const map = generate(42); // rolls lowland
  expect(map.shape).toBe("lowland");
  let rock = 0;
  for (const t of map.tiles) {
    expect(t).not.toBe(Tile.Snow);
    if (t === Tile.Rock) rock++;
  }
  expect(rock / map.tiles.length).toBeLessThan(0.005);
});

function landComponents(map: WorldMap): number {
  const seen = new Uint8Array(map.tiles.length);
  let comps = 0;
  for (let i = 0; i < map.tiles.length; i++) {
    if (seen[i] || map.tiles[i] <= Tile.ShallowWater) continue;
    const q = [i];
    seen[i] = 1;
    let size = 0;
    while (q.length) {
      const j = q.pop()!;
      size++;
      const x = j % map.width;
      const y = (j / map.width) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const k = ny * map.width + nx;
        if (!seen[k] && map.tiles[k] > Tile.ShallowWater) {
          seen[k] = 1;
          q.push(k);
        }
      }
    }
    if (size >= 12) comps++; // crumbs don't count as islets
  }
  return comps;
}

test("skerries really are a scatter", () => {
  const map = generate(27); // rolls skerries
  expect(map.shape).toBe("skerries");
  expect(landComponents(map)).toBeGreaterThanOrEqual(4);
});

test("a ridge isle is truly elongated", () => {
  const map = generate(18); // rolls ridge
  expect(map.shape).toBe("ridge");
  let n = 0;
  let mx = 0;
  let my = 0;
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] <= Tile.ShallowWater) continue;
    mx += i % map.width;
    my += (i / map.width) | 0;
    n++;
  }
  mx /= n;
  my /= n;
  let a = 0;
  let b = 0;
  let c = 0;
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] <= Tile.ShallowWater) continue;
    const dx = (i % map.width) - mx;
    const dy = ((i / map.width) | 0) - my;
    a += dx * dx;
    b += dx * dy;
    c += dy * dy;
  }
  const disc = Math.sqrt((a - c) ** 2 + 4 * b * b);
  const ratio = (a + c + disc) / (a + c - disc);
  expect(ratio).toBeGreaterThan(1.8); // long axis clearly dominates
});

// How much of the land's bounding box is water — concave coastlines score high.
function bayFraction(map: WorldMap): number {
  let x0 = map.width, y0 = map.height, x1 = 0, y1 = 0;
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] <= Tile.ShallowWater) continue;
    const x = i % map.width;
    const y = (i / map.width) | 0;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  let water = 0;
  let total = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      total++;
      if (map.tiles[y * map.width + x] <= Tile.ShallowWater) water++;
    }
  }
  return water / total;
}

test("a crescent isle wraps a real bay", () => {
  const crescent = generate(1, DEFAULT_CONFIG, "crescent");
  const highland = generate(1, DEFAULT_CONFIG, "highland");
  expect(bayFraction(crescent)).toBeGreaterThan(bayFraction(highland));
});
