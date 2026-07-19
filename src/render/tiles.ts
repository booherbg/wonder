import { makeRng } from "../core/rng";
import { TILE_SIZE } from "../world/config";
import { Tile } from "../world/types";
import { PALETTE } from "./palette";

export const VARIANTS = 4; // variant columns per tile row (water uses them as animation frames)
export const SCALE = 3; // screen pixels per art pixel
const TILE_TYPES = 11;

// Tones the geology brought with it — ground textures only, so they live
// here beside the brushes that use them rather than in the world palette.
const GEO = {
  sandRippleLight: "#f2e4b8",
  sandRippleShade: "#c9b676",
  sandShell: "#f8f0d8",
  grassBlade: "#7fbb6c",
  grassBladeFoot: "#4a853d",
  forestRoot: "#5c3f28",
  forestDapple: "#6da75c",
  forestLitter: "#7a5c36",
  rockFacet: "#a2a6ab",
  rockLichen: "#7d8b68",
  snowSparkle: "#ffffff",
  snowHollow: "#c3d1e2",
  screeBase: "#8d8679",
  screeStones: ["#a29a88", "#7b7568", "#6a655a", "#b3ab97"],
  screeShadow: "#575349",
  highlandBase: "#7ea55d",
  highlandTint: ["#8db26d", "#6f954f", "#9cbf7d"],
  highlandStone: "#95958a",
  highlandFlower: "#eef2dc",
  cliffBase: "#63666d",
  cliffSeam: "#51545b",
  cliffDeep: "#43464d",
  cliffLight: "#84888f",
  cliffBrow: "#9ba0a8",
  cliffBaseFringe: "#383b41",
} as const;

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

// Wind-written sand: two rippled dune lines, a light crest over a shadow,
// wandering a pixel up and down as they cross the tile.
function drawSand(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.sandBase);
  speckle(ctx, ox, oy, 700 + v, PALETTE.sandSpeckle, 9);
  const rng = makeRng(740 + v);
  for (let i = 0; i < 2; i++) {
    let y = 2 + Math.floor(rng() * (TILE_SIZE - 5)) + i * 3;
    const phase = rng() * 6.28;
    for (let x = 0; x < TILE_SIZE; x++) {
      const yy = Math.min(TILE_SIZE - 2, y + Math.round(Math.sin(x / 3.1 + phase)));
      if (rng() < 0.82) {
        px(ctx, ox + x, oy + yy, GEO.sandRippleLight);
        px(ctx, ox + x, oy + yy + 1, GEO.sandRippleShade);
      }
    }
  }
  if (v % 2 === 1) {
    px(ctx, ox + Math.floor(rng() * TILE_SIZE), oy + Math.floor(rng() * TILE_SIZE), GEO.sandShell);
  }
}

// Meadow turf: mottled clumps of deeper green under a scatter of standing
// blades — each a lit tip over a darker foot, so the grass has nap.
function drawGrass(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.grassBase);
  const rng = makeRng(140 + v);
  for (let i = 0; i < 4; i++) {
    const cx = Math.floor(rng() * (TILE_SIZE - 3));
    const cy = Math.floor(rng() * (TILE_SIZE - 2));
    ctx.fillStyle = i % 2 === 0 ? PALETTE.grassSpeckle[0] : PALETTE.grassSpeckle[2];
    ctx.fillRect(ox + cx, oy + cy, 2 + Math.floor(rng() * 2), 2); // turf clumps
  }
  speckle(ctx, ox, oy, 100 + v, PALETTE.grassSpeckle, 8);
  for (let i = 0; i < 5; i++) {
    const bx = Math.floor(rng() * TILE_SIZE);
    const by = 1 + Math.floor(rng() * (TILE_SIZE - 3));
    px(ctx, ox + bx, oy + by, GEO.grassBlade);
    px(ctx, ox + bx, oy + by + 1, GEO.grassBladeFoot);
  }
}

// Mossy shaded floor — actual trees are living plants placed by the flora
// system, each with its own genome. The ground under them keeps roots,
// leaf-litter, and small coins of dappled light.
function drawForest(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.forestFloor);
  speckle(ctx, ox, oy, 200 + v, PALETTE.grassSpeckle, 6);
  const rng = makeRng(300 + v);
  ctx.fillStyle = PALETTE.treeCanopyDark;
  for (let i = 0; i < 3; i++) {
    const mx = Math.floor(rng() * (TILE_SIZE - 2));
    const my = Math.floor(rng() * (TILE_SIZE - 1));
    ctx.fillRect(ox + mx, oy + my, 2, 1); // moss clumps
  }
  for (let i = 0; i < 2; i++) {
    // a root breaking the soil: a short elbowed stroke with an earth shadow
    const rx = Math.floor(rng() * (TILE_SIZE - 4));
    const ry = Math.floor(rng() * (TILE_SIZE - 3));
    const run = 2 + Math.floor(rng() * 2);
    ctx.fillStyle = GEO.forestRoot;
    ctx.fillRect(ox + rx, oy + ry, run, 1);
    px(ctx, ox + rx + run - 1, oy + ry + 1, GEO.forestRoot);
    px(ctx, ox + rx, oy + ry + 1, PALETTE.treeCanopyDark);
  }
  for (let i = 0; i < 3; i++) {
    px(ctx, ox + Math.floor(rng() * TILE_SIZE), oy + Math.floor(rng() * TILE_SIZE), GEO.forestDapple);
  }
  px(ctx, ox + Math.floor(rng() * TILE_SIZE), oy + Math.floor(rng() * TILE_SIZE), GEO.forestLitter);
  px(ctx, ox + Math.floor(rng() * TILE_SIZE), oy + Math.floor(rng() * TILE_SIZE), PALETTE.treeTrunk);
}

// Bare stone: the old crack-lines, now lit — a pale facet edge rides the
// upper side of each seam and lichen keeps to a few sheltered pixels.
function drawRock(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.rockBase);
  speckle(ctx, ox, oy, 400 + v, PALETTE.rockSpeckle, 12);
  const rng = makeRng(500 + v);
  for (let i = 0; i < 2; i++) {
    let x = Math.floor(rng() * TILE_SIZE);
    let y = Math.floor(rng() * 8);
    for (let s = 0; s < 5; s++) {
      const cx = Math.min(x, TILE_SIZE - 1);
      const cy = Math.min(y, TILE_SIZE - 1);
      px(ctx, ox + cx, oy + cy, PALETTE.rockShadow);
      if (cx > 0 && cy > 0) px(ctx, ox + cx - 1, oy + cy - 1, GEO.rockFacet); // the lit edge
      if (rng() < 0.5) x += 1;
      y += 1;
    }
  }
  if (v % 2 === 0) {
    const lx = Math.floor(rng() * (TILE_SIZE - 2));
    const ly = Math.floor(rng() * (TILE_SIZE - 1));
    px(ctx, ox + lx, oy + ly, GEO.rockLichen);
    px(ctx, ox + lx + 1, oy + ly, GEO.rockLichen);
  }
}

// High snow: wind-packed, with a blue hollow settling toward one corner
// and a few true-white sparks where the sun catches a crystal.
function drawSnow(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.snowBase);
  speckle(ctx, ox, oy, 600 + v, PALETTE.snowSpeckle, 8);
  const rng = makeRng(640 + v);
  for (let i = 0; i < 4; i++) {
    const hx = 8 + Math.floor(rng() * 7);
    const hy = 8 + Math.floor(rng() * 7);
    px(ctx, ox + Math.min(hx, TILE_SIZE - 2), oy + Math.min(hy, TILE_SIZE - 1), GEO.snowHollow);
    px(ctx, ox + Math.min(hx + 1, TILE_SIZE - 1), oy + Math.min(hy, TILE_SIZE - 1), GEO.snowHollow);
  }
  for (let i = 0; i < 2; i++) {
    px(ctx, ox + Math.floor(rng() * TILE_SIZE), oy + Math.floor(rng() * TILE_SIZE), GEO.snowSparkle);
  }
}

// Talus: a slope's worth of loose stones, every fourth one casting its own
// small shadow down-right — gravel you can hear underfoot.
function drawScree(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, GEO.screeBase);
  const rng = makeRng(1500 + v);
  for (let i = 0; i < 15; i++) {
    const sx = Math.floor(rng() * (TILE_SIZE - 1));
    const sy = Math.floor(rng() * (TILE_SIZE - 1));
    const tone = GEO.screeStones[Math.floor(rng() * GEO.screeStones.length)];
    px(ctx, ox + sx, oy + sy, tone);
    if (rng() < 0.4) px(ctx, ox + sx + 1, oy + sy, tone); // a longer slab
    if (i % 4 === 0) px(ctx, ox + sx + 1, oy + sy + 1, GEO.screeShadow);
  }
}

// Above the treeline: short cool turf, a stone poking through here and
// there, and once in a while a single tiny hard-weather flower.
function drawHighland(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, GEO.highlandBase);
  speckle(ctx, ox, oy, 1600 + v, GEO.highlandTint, 12);
  const rng = makeRng(1650 + v);
  for (let i = 0; i < 3; i++) {
    px(ctx, ox + Math.floor(rng() * TILE_SIZE), oy + 1 + Math.floor(rng() * (TILE_SIZE - 2)), GEO.highlandTint[2]);
  }
  for (let i = 0; i < 2; i++) {
    const sx = Math.floor(rng() * (TILE_SIZE - 1));
    const sy = Math.floor(rng() * (TILE_SIZE - 1));
    px(ctx, ox + sx, oy + sy, GEO.highlandStone);
    if (rng() < 0.5) px(ctx, ox + sx + 1, oy + sy, GEO.highlandStone);
  }
  if (v % 2 === 0) {
    px(ctx, ox + 2 + Math.floor(rng() * (TILE_SIZE - 4)), oy + 2 + Math.floor(rng() * (TILE_SIZE - 4)), GEO.highlandFlower);
  }
}

// An escarpment face: fractured dark stone with a vertical grain — broken
// seam segments, shadowed ledges, sparse catches of light. No per-tile
// framing, so a run of cliff knits into one continuous wall.
function drawCliff(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, GEO.cliffBase);
  const rng = makeRng(1700 + v);
  // broad tonal facets first, so the face isn't one flat slab
  for (let i = 0; i < 3; i++) {
    const fx = Math.floor(rng() * (TILE_SIZE - 4));
    const fy = Math.floor(rng() * (TILE_SIZE - 3));
    ctx.fillStyle = i === 0 ? GEO.cliffLight : GEO.cliffSeam;
    ctx.fillRect(ox + fx, oy + fy, 3 + Math.floor(rng() * 3), 2 + Math.floor(rng() * 2));
  }
  // broken vertical seams: short falls of shadow with a lit left lip
  for (let s = 0; s < 4; s++) {
    let x = Math.floor(rng() * TILE_SIZE);
    const y0 = Math.floor(rng() * (TILE_SIZE - 5));
    const len = 4 + Math.floor(rng() * 6);
    for (let y = y0; y < Math.min(TILE_SIZE, y0 + len); y++) {
      px(ctx, ox + x, oy + y, GEO.cliffDeep);
      if (y === y0 && x > 0) px(ctx, ox + x - 1, oy + y, GEO.cliffLight); // the lip
      if (rng() < 0.25) x = Math.max(0, Math.min(TILE_SIZE - 1, x + (rng() < 0.5 ? -1 : 1)));
    }
  }
  // bedding cracks: short horizontal shadows where the strata parted
  for (let i = 0; i < 2; i++) {
    const cx = Math.floor(rng() * (TILE_SIZE - 4));
    const cy = Math.floor(rng() * TILE_SIZE);
    ctx.fillStyle = GEO.cliffBaseFringe;
    ctx.fillRect(ox + cx, oy + cy, 2 + Math.floor(rng() * 3), 1);
  }
  for (let i = 0; i < 3; i++) {
    px(ctx, ox + Math.floor(rng() * TILE_SIZE), oy + Math.floor(rng() * TILE_SIZE), GEO.cliffBrow);
  }
}

// Squelchy wet ground: dark greens, standing-water pools, reed stubble.
function drawMarsh(ctx: Ctx, ox: number, oy: number, v: number): void {
  fill(ctx, ox, oy, PALETTE.marshBase);
  speckle(ctx, ox, oy, 1000 + v, PALETTE.marshSpeckle, 16);
  const rng = makeRng(1100 + v);
  for (let i = 0; i < 2; i++) {
    const x = Math.floor(rng() * (TILE_SIZE - 3));
    const y = Math.floor(rng() * (TILE_SIZE - 1));
    ctx.fillStyle = PALETTE.marshPool;
    ctx.fillRect(ox + x, oy + y, 2 + Math.floor(rng() * 2), 1);
  }
  ctx.fillStyle = PALETTE.marshReed;
  for (let i = 0; i < 3; i++) {
    const x = Math.floor(rng() * TILE_SIZE);
    const y = 2 + Math.floor(rng() * (TILE_SIZE - 4));
    ctx.fillRect(ox + x, oy + y, 1, 2);
  }
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
    drawMarsh(ctx, ox, Tile.Marsh * TILE_SIZE, v);
    drawScree(ctx, ox, Tile.Scree * TILE_SIZE, v);
    drawHighland(ctx, ox, Tile.Highland * TILE_SIZE, v);
    drawCliff(ctx, ox, Tile.Cliff * TILE_SIZE, v);
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
