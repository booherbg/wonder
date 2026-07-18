import { makeRng } from "../core/rng";
import { TILE_SIZE } from "../world/config";
import { Tile } from "../world/types";
import { PALETTE } from "./palette";

export const VARIANTS = 4; // variant columns per tile row (water uses them as animation frames)
export const SCALE = 3; // screen pixels per art pixel
const TILE_TYPES = 7;

type Ctx = CanvasRenderingContext2D;

function fill(ctx: Ctx, ox: number, oy: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(ox, oy, TILE_SIZE, TILE_SIZE);
}

function px(ctx: Ctx, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function speckle(
  ctx: Ctx,
  ox: number,
  oy: number,
  rngSeed: number,
  colors: readonly string[],
  count: number,
): void {
  const rng = makeRng(rngSeed);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng() * TILE_SIZE);
    const y = Math.floor(rng() * TILE_SIZE);
    px(ctx, ox + x, oy + y, colors[Math.floor(rng() * colors.length)]);
  }
}

// Water: same glint rows every variant, x shifted by variant index — cycling
// variants 0→1→2→1 makes the glints drift gently back and forth.
function drawWater(
  ctx: Ctx,
  ox: number,
  oy: number,
  v: number,
  base: string,
  glint: string,
  rngSeed: number,
): void {
  fill(ctx, ox, oy, base);
  const rng = makeRng(rngSeed);
  for (let i = 0; i < 3; i++) {
    const y = Math.floor(rng() * TILE_SIZE);
    const w = 2 + Math.floor(rng() * 3);
    const x = (Math.floor(rng() * TILE_SIZE) + v) % (TILE_SIZE - w);
    ctx.fillStyle = glint;
    ctx.fillRect(ox + x, oy + y, w, 1);
  }
}

function drawSand(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.sandBase);
  speckle(ctx, ox, oy, 700 + v, PALETTE.sandSpeckle, 12);
}

function drawGrass(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.grassBase);
  speckle(ctx, ox, oy, 100 + v, PALETTE.grassSpeckle, 14);
}

// Mossy shaded floor — actual trees are living plants placed by the flora
// system, each with its own genome.
function drawForest(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.forestFloor);
  speckle(ctx, ox, oy, 200 + v, PALETTE.grassSpeckle, 8);
  const rng = makeRng(300 + v);
  ctx.fillStyle = PALETTE.treeCanopyDark;
  for (let i = 0; i < 3; i++) {
    const mx = Math.floor(rng() * (TILE_SIZE - 2));
    const my = Math.floor(rng() * (TILE_SIZE - 1));
    ctx.fillRect(ox + mx, oy + my, 2, 1); // moss clumps
  }
  px(ctx, ox + Math.floor(rng() * TILE_SIZE), oy + Math.floor(rng() * TILE_SIZE), PALETTE.treeTrunk);
}

function drawRock(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.rockBase);
  speckle(ctx, ox, oy, 400 + v, PALETTE.rockSpeckle, 12);
  const rng = makeRng(500 + v);
  for (let i = 0; i < 2; i++) {
    let x = Math.floor(rng() * TILE_SIZE);
    let y = Math.floor(rng() * 8);
    for (let s = 0; s < 5; s++) {
      px(ctx, ox + Math.min(x, TILE_SIZE - 1), oy + Math.min(y, TILE_SIZE - 1), PALETTE.rockShadow);
      if (rng() < 0.5) x += 1;
      y += 1;
    }
  }
}

function drawSnow(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.snowBase);
  speckle(ctx, ox, oy, 600 + v, PALETTE.snowSpeckle, 10);
}

export function buildTileAtlas(): HTMLCanvasElement {
  const atlas = document.createElement("canvas");
  atlas.width = VARIANTS * TILE_SIZE;
  atlas.height = TILE_TYPES * TILE_SIZE;
  const ctx = atlas.getContext("2d")!;
  for (let v = 0; v < VARIANTS; v++) {
    const ox = v * TILE_SIZE;
    drawWater(ctx, ox, Tile.DeepWater * TILE_SIZE, v, PALETTE.deepWaterBase, PALETTE.deepWaterGlint, 800);
    drawWater(ctx, ox, Tile.ShallowWater * TILE_SIZE, v, PALETTE.shallowWaterBase, PALETTE.shallowWaterGlint, 900);
    drawSand(ctx, ox, Tile.Sand * TILE_SIZE, v);
    drawGrass(ctx, ox, Tile.Grass * TILE_SIZE, v);
    drawForest(ctx, ox, Tile.Forest * TILE_SIZE, v);
    drawRock(ctx, ox, Tile.Rock * TILE_SIZE, v);
    drawSnow(ctx, ox, Tile.Snow * TILE_SIZE, v);
  }
  return atlas;
}

// 16x16 wanderer; feet + shadow occupy the bottom rows, anchor is (8, 15).
export function drawPlayerSprite(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = TILE_SIZE;
  c.height = TILE_SIZE;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = PALETTE.playerShadow;
  ctx.fillRect(5, 14, 6, 2);
  ctx.fillStyle = PALETTE.playerCloak;
  ctx.fillRect(5, 8, 6, 6);
  ctx.fillStyle = PALETTE.playerSkin;
  ctx.fillRect(6, 4, 4, 4);
  ctx.fillStyle = PALETTE.playerHair;
  ctx.fillRect(6, 3, 4, 2);
  return c;
}
