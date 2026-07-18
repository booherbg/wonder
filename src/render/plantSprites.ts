import { Genome, PlantForm, hsl, phenoKey } from "../life/genome";

// All plant sprites share one canvas footprint; the plant's base (where it
// meets the ground) sits at the anchor.
export const PLANT_SPRITE_W = 16;
export const PLANT_SPRITE_H = 28;
export const PLANT_ANCHOR_X = 8;
export const PLANT_ANCHOR_Y = 26;

const CACHE_CAP = 512;
const cache = new Map<string, HTMLCanvasElement>();

export function getPlantSprite(g: Genome): HTMLCanvasElement {
  const key = phenoKey(g);
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size >= CACHE_CAP) cache.clear();
  const c = document.createElement("canvas");
  c.width = PLANT_SPRITE_W;
  c.height = PLANT_SPRITE_H;
  const ctx = c.getContext("2d")!;
  DRAWERS[g.form](ctx, g);
  cache.set(key, c);
  return c;
}

type Ctx = CanvasRenderingContext2D;

function px(ctx: Ctx, x: number, y: number, color: string, a = 1): void {
  ctx.globalAlpha = a;
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  ctx.globalAlpha = 1;
}

function rect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

// stems keep a grounding leaf-green cast pulled slightly toward the genome hue
function stemColor(g: Genome): string {
  return hsl(0.3 + (g.hue - 0.3) * 0.25, g.sat * 0.5, 0.3);
}

function drawFlower(ctx: Ctx, g: Genome): void {
  const stemH = 4 + g.height * 11;
  const baseX = PLANT_ANCHOR_X;
  const baseY = PLANT_ANCHOR_Y;
  const topX = baseX + g.lean * 3;
  const topY = baseY - stemH;
  const stem = stemColor(g);
  for (let i = 0; i <= stemH; i++) {
    px(ctx, baseX + (topX - baseX) * (i / stemH), baseY - i, stem);
  }
  const leaves = Math.round(g.leaves);
  for (let i = 0; i < leaves; i++) {
    const f = (i + 1) / (leaves + 1);
    const ly = baseY - stemH * f;
    const lx = baseX + (topX - baseX) * f;
    px(ctx, lx - 1, ly, stem);
    px(ctx, lx + 1, ly, stem);
    if (g.spread > 0.5) {
      px(ctx, lx - 2, ly + 1, stem, 0.8);
      px(ctx, lx + 2, ly + 1, stem, 0.8);
    }
  }
  const r = 1.5 + g.spread * 2.5;
  const petals = Math.round(g.petals);
  const petalColor = hsl(g.hue, g.sat, 0.55 + g.glow * 0.15);
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 - Math.PI / 2;
    px(ctx, topX + Math.cos(a) * r, topY + Math.sin(a) * r, petalColor);
    if (r > 2.6) px(ctx, topX + Math.cos(a) * (r - 1), topY + Math.sin(a) * (r - 1), petalColor, 0.85);
  }
  rect(ctx, topX - 0.5, topY - 0.5, 2, 2, hsl(g.hue2, g.sat, 0.5));
  if (g.glow > 0.8) {
    const halo = hsl(g.hue, g.sat, 0.82);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      px(ctx, topX + Math.cos(a) * (r + 1.6), topY + Math.sin(a) * (r + 1.6), halo, 0.55);
    }
  }
}

function drawShrub(ctx: Ctx, g: Genome): void {
  const h = 4 + g.height * 8;
  const w = 5 + g.spread * 7;
  const baseY = PLANT_ANCHOR_Y;
  const dark = hsl(g.hue, g.sat * 0.85, 0.3);
  const mid = hsl(g.hue, g.sat * 0.9, 0.38);
  const light = hsl(g.hue, g.sat, 0.47);
  // mounded blob: widest at the bottom, rounded top
  for (let row = 0; row < h; row++) {
    const f = row / h; // 0 top .. 1 bottom
    const rw = Math.max(2, w * Math.sqrt(f) * (0.8 + 0.2 * Math.sin(row * 2.1)));
    const color = f < 0.35 ? light : f < 0.7 ? mid : dark;
    rect(ctx, PLANT_ANCHOR_X - rw / 2 + g.lean * (1 - f) * 2, baseY - h + row, rw, 1, color);
  }
  const berries = Math.round(g.petals / 2);
  const berry = hsl(g.hue2, Math.min(1, g.sat + 0.2), g.glow > 0.8 ? 0.72 : 0.55);
  for (let i = 0; i < berries; i++) {
    const a = (i / berries) * Math.PI * 2 + g.hue * 7;
    const bx = PLANT_ANCHOR_X + Math.cos(a) * (w * 0.28);
    const by = baseY - h * (0.35 + 0.4 * ((Math.sin(a * 2) + 1) / 2));
    px(ctx, bx, by, berry);
  }
}

function drawTree(ctx: Ctx, g: Genome): void {
  const trunkH = 5 + g.height * 9;
  const canopyH = 7 + g.height * 9;
  const radius = 3.5 + g.spread * 4;
  const baseX = PLANT_ANCHOR_X;
  const baseY = PLANT_ANCHOR_Y;
  const topX = baseX + g.lean * 2;
  rect(ctx, baseX - 1, baseY - trunkH, 2, trunkH + 1, hsl(0.07 + g.hue * 0.04, 0.35, 0.28));
  px(ctx, baseX - 2, baseY, hsl(0.07, 0.3, 0.24));
  px(ctx, baseX + 1, baseY, hsl(0.07, 0.3, 0.24));
  const dark = hsl(g.hue, g.sat * 0.9, 0.26);
  const mid = hsl(g.hue, g.sat * 0.95, 0.35);
  const light = hsl(g.hue, g.sat, 0.46);
  const canopyBottom = baseY - trunkH;
  for (let row = 0; row < canopyH; row++) {
    const f = row / (canopyH - 1); // 0 = bottom of canopy, 1 = top
    const rw = Math.max(1.6, radius * 2 * Math.sin(Math.acos(2 * f - 1) / 1)); // circle-ish
    const y = canopyBottom - row;
    const color = f > 0.72 ? light : f > 0.3 ? mid : dark;
    rect(ctx, topX - rw / 2, y, rw, 1, color);
  }
  // light catches the upper-left shoulder
  px(ctx, topX - radius * 0.6, canopyBottom - canopyH * 0.75, hsl(g.hue, g.sat, 0.58), 0.9);
  px(ctx, topX - radius * 0.3, canopyBottom - canopyH * 0.85, hsl(g.hue, g.sat, 0.58), 0.9);
  if (g.petals > 6.5) {
    const fruit = hsl(g.hue2, 1, 0.6);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.4 + g.hue2 * 9;
      px(ctx, topX + Math.cos(a) * radius * 0.55, canopyBottom - canopyH * (0.3 + 0.35 * ((Math.sin(a) + 1) / 2)), fruit);
    }
  }
}

function drawFungus(ctx: Ctx, g: Genome): void {
  const stemH = 2 + g.height * 6;
  const capW = 4 + g.spread * 8;
  const capH = 2 + g.height * 3;
  const baseX = PLANT_ANCHOR_X + g.lean * 1.5;
  const baseY = PLANT_ANCHOR_Y;
  const glowing = g.glow > 0.8;
  rect(ctx, baseX - 1, baseY - stemH, 2, stemH + 1, hsl(g.hue, g.sat * 0.25, 0.68));
  const capColor = hsl(g.hue, g.sat, glowing ? 0.6 : 0.48);
  const capTopY = baseY - stemH - capH;
  for (let row = 0; row < capH; row++) {
    const f = (row + 1) / capH;
    const rw = capW * Math.sqrt(f);
    rect(ctx, baseX - rw / 2, capTopY + row, rw, 1, capColor);
  }
  rect(ctx, baseX - capW / 2 + 1, baseY - stemH - 1, capW - 2, 1, hsl(g.hue, g.sat, 0.32));
  const spots = Math.round(g.petals / 2);
  const spot = hsl(g.hue2, g.sat * 0.7, 0.8);
  for (let i = 0; i < spots; i++) {
    const f = (i + 0.5) / spots;
    px(ctx, baseX - capW / 2 + capW * f, capTopY + 1 + (i % 2), spot);
  }
  if (glowing) {
    const halo = hsl(g.hue, g.sat, 0.8);
    px(ctx, baseX - capW / 2 - 1, capTopY + capH - 1, halo, 0.5);
    px(ctx, baseX + capW / 2 + 1, capTopY + capH - 1, halo, 0.5);
    px(ctx, baseX, capTopY - 1, halo, 0.5);
  }
}

const DRAWERS: Record<PlantForm, (ctx: Ctx, g: Genome) => void> = {
  [PlantForm.Flower]: drawFlower,
  [PlantForm.Shrub]: drawShrub,
  [PlantForm.Tree]: drawTree,
  [PlantForm.Fungus]: drawFungus,
};
