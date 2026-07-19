import { Genome, PlantForm, hsl, phenoKey } from "../life/genome";

// All plant sprites share one canvas footprint; the plant's base (where it
// meets the ground) sits at the anchor.
export const PLANT_SPRITE_W = 16;
export const PLANT_SPRITE_H = 28;
export const PLANT_ANCHOR_X = 8;
export const PLANT_ANCHOR_Y = 26;

const CACHE_CAP = 512;
const cache = new Map<string, HTMLCanvasElement>();
const glowCache = new Map<number, HTMLCanvasElement>();

// Soft diamond of colored light, drawn additively at night around glowers.
export const GLOW_R = 12;
export function getGlowHalo(hue: number): HTMLCanvasElement {
  const key = Math.round(((hue % 1) + 1) % 1 * 24) % 24;
  const hit = glowCache.get(key);
  if (hit) return hit;
  const size = GLOW_R * 2;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = (Math.abs(x - GLOW_R) + Math.abs(y - GLOW_R)) / GLOW_R; // diamond falloff
      if (d >= 1) continue;
      const a = (1 - d) * (1 - d) * 0.5;
      ctx.fillStyle = hsl(key / 24, 0.9, 0.7);
      ctx.globalAlpha = a;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
  glowCache.set(key, c);
  return c;
}

// The few strokes of a 2D context the drawers actually use — every plant is
// pure fillRect, so a recording stub can stand in where no DOM exists.
export interface PixelCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  fillRect(x: number, y: number, w: number, h: number): void;
}

type Ctx = PixelCtx;

export function getPlantSprite(g: Genome, aquatic = false): HTMLCanvasElement {
  const key = (aquatic ? "w:" : "") + phenoKey(g);
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size >= CACHE_CAP) cache.clear();
  const c = document.createElement("canvas");
  c.width = PLANT_SPRITE_W;
  c.height = PLANT_SPRITE_H;
  const ctx = c.getContext("2d")!;
  drawPlantSprite(ctx, g, aquatic);
  cache.set(key, c);
  return c;
}

// One genome onto one context. Exposed so tests can watch a plant being
// painted without a canvas, and so other surfaces can bake sprites.
export function drawPlantSprite(ctx: Ctx, g: Genome, aquatic = false): void {
  if (aquatic && g.form === PlantForm.Flower) drawLily(ctx, g);
  else if (aquatic && g.form === PlantForm.Shrub) drawShrubReeds(ctx, g);
  else DRAWERS[g.form](ctx, g);
}

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

// ── the shared grammar of depth ──────────────────────────────────────────────
// The sun leans in from the upper-left (the same light the ground-shadow pass
// believes in): every form keeps a lit cheek and a turned one, and everything
// that stands gets a dark seat where it meets the soil.

// lightness clamped into the visible band, so depth shifts never blow out
function shade(h: number, s: number, l: number): string {
  return hsl(h, s, Math.max(0.06, Math.min(0.94, l)));
}

// how squarely an offset from center faces the upper-left light: 1 full sun,
// -1 full shade
function facing(dx: number, dy: number): number {
  const d = Math.hypot(dx, dy);
  return d === 0 ? 0 : (-dx - dy) / (d * Math.SQRT2);
}

// the dark seat where a plant meets the soil, pooled a step to the lower
// right — the sprite's own contact shadow, under the renderer's soft one
function anchor(ctx: Ctx, cx: number, w: number): void {
  const half = Math.max(1, Math.round(w / 2));
  for (let i = -half; i <= half; i++) {
    px(ctx, cx + i + 1, PLANT_ANCHOR_Y + 1, "rgb(10, 14, 10)", i === 0 ? 0.3 : 0.16);
  }
}

// stems keep a grounding leaf-green cast pulled slightly toward the genome hue
function stemColor(g: Genome): string {
  return hsl(0.3 + (g.hue - 0.3) * 0.25, g.sat * 0.5, 0.3);
}

function stemHueOf(g: Genome): number {
  return 0.3 + (g.hue - 0.3) * 0.25;
}

// Water flowers ride a lily pad: short stem, wide green disc at the waterline.
function drawLily(ctx: Ctx, g: Genome): void {
  const baseY = PLANT_ANCHOR_Y;
  const padW = 6 + Math.round(g.spread * 4);
  rect(ctx, PLANT_ANCHOR_X - padW / 2, baseY - 1, padW, 2, hsl(0.34, 0.5, 0.34));
  rect(ctx, PLANT_ANCHOR_X - padW / 2 + 1, baseY - 2, padW - 2, 1, hsl(0.34, 0.5, 0.42));
  px(ctx, PLANT_ANCHOR_X - padW / 2 + 1, baseY - 2, hsl(0.34, 0.55, 0.5)); // the sunward rim
  px(ctx, PLANT_ANCHOR_X + padW / 2 - 1, baseY, hsl(0.34, 0.45, 0.26)); // the far rim, dipping
  px(ctx, PLANT_ANCHOR_X + 2, baseY - 1, hsl(0.34, 0.5, 0.28)); // the pad's cut notch
  const shortened: Genome = { ...g, height: g.height * 0.45, leaves: 0 };
  drawFlower(ctx, shortened, true);
}

// Water shrubs become reeds: a stand of thin stalks with seed-head tips.
function drawShrubReeds(ctx: Ctx, g: Genome): void {
  const baseY = PLANT_ANCHOR_Y;
  const count = 3 + Math.round(g.spread * 3);
  for (let i = 0; i < count; i++) {
    const x = PLANT_ANCHOR_X - count + i * 2 + (i % 2);
    const h = Math.round(6 + g.height * 9 + ((i * 5) % 4) - 2 + g.lean * i);
    const sun = x < PLANT_ANCHOR_X ? 0.04 : -0.03;
    for (let s = 0; s <= h; s++) {
      px(ctx, x, baseY - s, shade(0.28 + (g.hue - 0.28) * 0.3, g.sat * 0.6, 0.3 + (s / h) * 0.09 + sun));
    }
    const tl = (g.glow > 0.8 ? 0.7 : 0.5) + sun;
    px(ctx, x, baseY - h - 1, shade(g.hue2, Math.min(1, g.sat + 0.15), tl));
    px(ctx, x, baseY - h - 2, shade(g.hue2, Math.min(1, g.sat + 0.15), tl + 0.06));
  }
}

function drawFlower(ctx: Ctx, g: Genome, afloat = false): void {
  const stemH = 4 + g.height * 11;
  const baseX = PLANT_ANCHOR_X;
  const baseY = PLANT_ANCHOR_Y;
  const topX = baseX + g.lean * 3;
  const topY = baseY - stemH;
  if (!afloat) anchor(ctx, baseX, 2 + g.spread);
  const sh = stemHueOf(g);
  for (let i = 0; i <= stemH; i++) {
    // the stem climbs out of its own shade toward the light
    px(ctx, baseX + (topX - baseX) * (i / stemH), baseY - i, shade(sh, g.sat * 0.5, 0.24 + (i / stemH) * 0.1));
  }
  const leaves = Math.round(g.leaves);
  for (let i = 0; i < leaves; i++) {
    const f = (i + 1) / (leaves + 1);
    const ly = baseY - stemH * f;
    const lx = baseX + (topX - baseX) * f;
    px(ctx, lx - 1, ly, shade(sh, g.sat * 0.55, 0.37)); // the sunward leaf
    px(ctx, lx + 1, ly, shade(sh, g.sat * 0.5, 0.22)); // its shaded twin
    if (g.spread > 0.5) {
      px(ctx, lx - 2, ly + 1, shade(sh, g.sat * 0.55, 0.33), 0.85);
      px(ctx, lx + 2, ly + 1, shade(sh, g.sat * 0.5, 0.19), 0.85);
    }
  }
  const r = 1.5 + g.spread * 2.5;
  const petals = Math.round(g.petals);
  const baseL = 0.53 + g.glow * 0.15;
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2 - Math.PI / 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const l = baseL + facing(dx, dy) * 0.09; // each petal turns its face to the light
    px(ctx, topX + dx * r, topY + dy * r, shade(g.hue, g.sat, l));
    if (r > 2.6) px(ctx, topX + dx * (r - 1), topY + dy * (r - 1), shade(g.hue, g.sat, l - 0.06), 0.9);
  }
  // the heart: a lit crown pixel over a shaded throat
  px(ctx, topX, topY, shade(g.hue2, g.sat, 0.6));
  px(ctx, topX + 1, topY, shade(g.hue2, g.sat, 0.5), 0.95);
  px(ctx, topX, topY + 1, shade(g.hue2, g.sat, 0.48), 0.95);
  px(ctx, topX + 1, topY + 1, shade(g.hue2, g.sat, 0.36), 0.95);
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
  anchor(ctx, PLANT_ANCHOR_X, w * 0.7);
  // mounded blob: widest at the bottom, rounded top, one cheek in the sun
  for (let row = 0; row < h; row++) {
    const f = row / h; // 0 top .. 1 bottom
    const rw = Math.max(2, Math.round(w * Math.sqrt(f) * (0.8 + 0.2 * Math.sin(row * 2.1))));
    const l = f < 0.35 ? 0.47 : f < 0.7 ? 0.38 : 0.29;
    const x0 = Math.round(PLANT_ANCHOR_X - rw / 2 + g.lean * (1 - f) * 2);
    rect(ctx, x0, baseY - h + row, rw, 1, shade(g.hue, g.sat * 0.9, l));
    px(ctx, x0, baseY - h + row, shade(g.hue, g.sat, l + 0.08), 0.9); // sunward cheek
    px(ctx, x0 + rw - 1, baseY - h + row, shade(g.hue, g.sat * 0.85, l - 0.07), 0.9); // turned cheek
  }
  // leaf-clusters dappling the lit shoulder
  px(ctx, PLANT_ANCHOR_X - w * 0.22 + g.lean, baseY - h + 1, shade(g.hue, g.sat, 0.55), 0.7);
  px(ctx, PLANT_ANCHOR_X - w * 0.02 + g.lean, baseY - h + 2, shade(g.hue, g.sat, 0.52), 0.55);
  const berries = Math.round(g.petals / 2);
  for (let i = 0; i < berries; i++) {
    const a = (i / berries) * Math.PI * 2 + g.hue * 7;
    const bx = PLANT_ANCHOR_X + Math.cos(a) * (w * 0.28);
    const by = baseY - h * (0.35 + 0.4 * ((Math.sin(a * 2) + 1) / 2));
    const l = (g.glow > 0.8 ? 0.72 : 0.55) + facing(Math.cos(a), 0) * 0.05;
    px(ctx, bx, by, shade(g.hue2, Math.min(1, g.sat + 0.2), l));
    px(ctx, bx + 1, by + 1, shade(g.hue2, g.sat * 0.8, 0.2), 0.45); // each berry seats in its own shade
  }
}

function drawTree(ctx: Ctx, g: Genome): void {
  const trunkH = 5 + g.height * 9;
  const canopyH = 7 + g.height * 9;
  const radius = 3.5 + g.spread * 4;
  const baseX = PLANT_ANCHOR_X;
  const baseY = PLANT_ANCHOR_Y;
  const topX = baseX + g.lean * 2;
  anchor(ctx, baseX, radius);
  const bark = 0.07 + g.hue * 0.04;
  for (let i = 0; i <= trunkH; i++) {
    px(ctx, baseX - 1, baseY - i, shade(bark, 0.35, 0.33)); // the trunk's lit flank
    px(ctx, baseX, baseY - i, shade(bark, 0.35, 0.22)); // and its turned one
  }
  px(ctx, baseX - 2, baseY, shade(bark, 0.3, 0.27)); // root flare
  px(ctx, baseX + 1, baseY, shade(bark, 0.3, 0.18));
  const canopyBottom = baseY - trunkH;
  px(ctx, baseX - 1, canopyBottom + 1, shade(bark, 0.35, 0.14), 0.8); // the canopy shades its own trunk
  px(ctx, baseX, canopyBottom + 1, shade(bark, 0.35, 0.12), 0.8);
  const rows = Math.round(canopyH); // whole rows: the old fractional top row was acos(>1) = NaN
  for (let row = 0; row < rows; row++) {
    const f = row / (rows - 1); // 0 = bottom of canopy, 1 = top
    const rw = Math.max(2, Math.round(radius * 2 * Math.sin(Math.acos(2 * f - 1))));
    const y = canopyBottom - row;
    const l = row === 0 ? 0.2 : f > 0.72 ? 0.46 : f > 0.3 ? 0.35 : 0.26; // dark under-rim up to a lit crown
    const x0 = Math.round(topX - rw / 2);
    rect(ctx, x0, y, rw, 1, shade(g.hue, g.sat * 0.95, l));
    if (rw > 2) {
      px(ctx, x0, y, shade(g.hue, g.sat, l + 0.09), 0.9); // sunward edge
      px(ctx, x0 + rw - 1, y, shade(g.hue, g.sat * 0.9, l - 0.07), 0.9); // far edge
      if (f > 0.15 && f < 0.85 && rw > 4) {
        // a leaf-clump's shadow tucked into the mass
        const cx = x0 + 1 + Math.abs(Math.round(Math.sin(row * 2.7 + g.hue * 9) * (rw - 3)));
        px(ctx, cx, y, shade(g.hue, g.sat, l - 0.06), 0.55);
      }
    }
  }
  // light catches the upper-left shoulder
  const lit = shade(g.hue, g.sat, 0.58);
  px(ctx, topX - radius * 0.6, canopyBottom - canopyH * 0.75, lit, 0.9);
  px(ctx, topX - radius * 0.3, canopyBottom - canopyH * 0.85, lit, 0.9);
  px(ctx, topX - radius * 0.45, canopyBottom - canopyH * 0.62, lit, 0.6);
  if (g.petals >= 8) {
    // a blossoming crown: sprays of bloom across the sunward half
    for (let i = 0; i < 5; i++) {
      const a = i * 1.7 + g.hue2 * 11;
      const bx = topX - radius * 0.15 + Math.cos(a) * radius * 0.55;
      const by = canopyBottom - canopyH * (0.35 + 0.4 * ((Math.sin(a * 1.3) + 1) / 2));
      px(ctx, bx, by, shade(g.hue2, Math.min(1, g.sat + 0.15), 0.68), 0.95);
      px(ctx, bx + 1, by, shade(g.hue2, g.sat, 0.55), 0.5);
    }
  } else if (g.petals > 6.5) {
    // fruiting: bright drops hung in the shade, each with its own dark seat
    for (let i = 0; i < 3; i++) {
      const a = i * 2.4 + g.hue2 * 9;
      const bx = topX + Math.cos(a) * radius * 0.55;
      const by = canopyBottom - canopyH * (0.3 + 0.35 * ((Math.sin(a) + 1) / 2));
      px(ctx, bx, by, shade(g.hue2, 1, 0.6));
      px(ctx, bx, by + 1, shade(g.hue2, 0.7, 0.25), 0.5);
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
  anchor(ctx, baseX, capW * 0.45);
  for (let i = 0; i <= stemH; i++) {
    px(ctx, baseX - 1, baseY - i, shade(g.hue, g.sat * 0.25, 0.74)); // the pale stalk, lit
    px(ctx, baseX, baseY - i, shade(g.hue, g.sat * 0.3, 0.58)); // and turned away
  }
  px(ctx, baseX - 1, baseY - Math.round(stemH * 0.45), shade(g.hue, g.sat * 0.3, 0.5), 0.7); // the ring the veil left
  const capTopY = baseY - stemH - capH;
  for (let row = 0; row < capH; row++) {
    const f = (row + 1) / capH;
    const rw = Math.max(2, Math.round(capW * Math.sqrt(f)));
    const x0 = Math.round(baseX - rw / 2);
    const l = (glowing ? 0.6 : 0.48) + (1 - f) * 0.06; // the dome lightens toward its crown
    rect(ctx, x0, capTopY + row, rw, 1, shade(g.hue, g.sat, l));
    if (rw > 2) {
      px(ctx, x0, capTopY + row, shade(g.hue, g.sat, l + 0.09), 0.9);
      px(ctx, x0 + rw - 1, capTopY + row, shade(g.hue, g.sat, l - 0.09), 0.9);
    }
  }
  rect(ctx, baseX - capW / 2 + 1, baseY - stemH - 1, capW - 2, 1, shade(g.hue, g.sat, 0.3)); // gills in shadow
  const spots = Math.round(g.petals / 2);
  for (let i = 0; i < spots; i++) {
    const f = (i + 0.5) / spots;
    px(ctx, baseX - capW / 2 + capW * f, capTopY + 1 + (i % 2), shade(g.hue2, g.sat * 0.7, 0.8 - f * 0.12)); // spots dim into the far side
  }
  if (glowing) {
    const halo = hsl(g.hue, g.sat, 0.8);
    px(ctx, baseX - capW / 2 - 1, capTopY + capH - 1, halo, 0.5);
    px(ctx, baseX + capW / 2 + 1, capTopY + capH - 1, halo, 0.5);
    px(ctx, baseX, capTopY - 1, halo, 0.5);
  }
}

// Fronds fan out from a rootstock and droop at the tips, leaflets along
// each rib — and nothing says a fern must be green.
function drawFern(ctx: Ctx, g: Genome): void {
  const baseX = PLANT_ANCHOR_X + g.lean;
  const baseY = PLANT_ANCHOR_Y;
  const fronds = Math.max(3, Math.round(g.petals * 0.8));
  const len = 4 + g.height * 9;
  anchor(ctx, baseX, 2 + g.spread * 2);
  rect(ctx, Math.round(baseX) - 1, baseY - 2, 2, 3, stemColor(g)); // rootstock
  px(ctx, baseX - 1, baseY - 2, shade(stemHueOf(g), g.sat * 0.5, 0.38)); // its lit crown
  for (let i = 0; i < fronds; i++) {
    const t = fronds === 1 ? 0.5 : i / (fronds - 1);
    const a = (t - 0.5) * (1.0 + g.spread * 1.2); // fan angle from vertical
    const sun = -Math.sin(a) * 0.07; // fronds fanned toward the light stay brighter
    for (let s = 2; s < len; s++) {
      const f = s / len;
      const x = baseX + Math.sin(a) * s;
      const y = baseY - 2 - Math.cos(a) * s + f * f * 3; // tips droop
      const l = (f > 0.7 ? (g.glow > 0.8 ? 0.68 : 0.55) : f > 0.35 ? 0.42 : 0.3) + sun;
      px(ctx, x, y, shade(g.hue, g.sat, l));
      if (s % 2 === 0 && s > 3 && Math.round(g.leaves) > 0) {
        px(ctx, x - Math.cos(a), y + Math.sin(a), shade(g.hue, g.sat, 0.46 + sun), 0.85);
        px(ctx, x + Math.cos(a), y - Math.sin(a), shade(g.hue, g.sat, 0.37 + sun), 0.85);
      }
    }
  }
}

// Coral: a colony of branching arms reaching up from a holdfast, each tipped
// with polyps in the accent hue. Glow corals carry the biolume tide nights.
function drawCoral(ctx: Ctx, g: Genome): void {
  const baseX = PLANT_ANCHOR_X + g.lean * 1.5;
  const baseY = PLANT_ANCHOR_Y;
  const arms = Math.max(2, Math.round(g.petals * 0.5));
  const len = 4 + g.height * 9;
  const polyp = (l: number) => shade(g.hue2, Math.min(1, g.sat + 0.2), l);
  rect(ctx, baseX - 2, baseY - 1, 4, 2, shade(g.hue, g.sat * 0.85, 0.26)); // holdfast on the seabed
  px(ctx, baseX - 2, baseY - 1, shade(g.hue, g.sat * 0.85, 0.34)); // its lit corner
  for (let i = 0; i < arms; i++) {
    const t = arms === 1 ? 0.5 : i / (arms - 1);
    const a = (t - 0.5) * (0.7 + g.spread * 1.1); // fan angle from vertical
    const sun = -Math.sin(a) * 0.06; // arms reaching sunward hold more light
    const armLen = len * (0.75 + 0.25 * Math.sin(i * 2.7 + g.hue * 9));
    let x = baseX;
    let y = baseY - 1;
    for (let s = 1; s <= armLen; s++) {
      const f = s / armLen;
      x = baseX + Math.sin(a) * s * (0.5 + f * 0.5) + Math.sin(f * 2.2) * g.lean;
      y = baseY - 1 - Math.cos(a * 0.6) * s;
      const l = (f > 0.66 ? 0.56 : f > 0.33 ? 0.44 : 0.32) + sun;
      px(ctx, x, y, shade(g.hue, g.sat, l));
      if (f < 0.6) px(ctx, x + (a < 0 ? -1 : 1), y, shade(g.hue, g.sat * 0.9, l - 0.08), 0.55); // the arm's turned cheek
      if (i % 2 === 0 && armLen > 6 && s === Math.floor(armLen * 0.55)) {
        for (let q = 1; q <= 3; q++) px(ctx, x - Math.cos(a) - q * 0.6, y - q, shade(g.hue, g.sat, 0.44 + sun), 0.9);
        px(ctx, x - Math.cos(a) - 2.4, y - 4, polyp(g.glow > 0.8 ? 0.78 : 0.62)); // side branch, tipped
      }
    }
    px(ctx, x, y, polyp(g.glow > 0.8 ? 0.78 : 0.62));
    px(ctx, x, y - 1, polyp(g.glow > 0.8 ? 0.84 : 0.68), 0.9);
  }
  if (g.glow > 0.8) {
    const halo = hsl(g.hue2, 0.9, 0.8);
    px(ctx, baseX - 3, baseY - len * 0.8, halo, 0.5);
    px(ctx, baseX + 3, baseY - len * 0.9, halo, 0.5);
    px(ctx, baseX, baseY - len - 2, halo, 0.5);
  }
}

// Succulent: rings of plump leaves seen at an angle, lighter toward the
// heart, each leaf's cheek turned to or from the sun. When the genome
// insists (many petals or true glow) it sends up a bloom spike — in a dry
// place, a flower is an event.
function drawSucculent(ctx: Ctx, g: Genome): void {
  const baseX = PLANT_ANCHOR_X + g.lean;
  const baseY = PLANT_ANCHOR_Y;
  const rings = Math.max(1, Math.round(g.leaves));
  const maxR = 2 + g.spread * 4;
  anchor(ctx, baseX, maxR * 1.1);
  for (let ring = rings; ring >= 1; ring--) {
    const r = (maxR * ring) / rings;
    const dabs = Math.round(g.petals) + ring;
    const base = 0.3 + 0.09 * (rings - ring);
    for (let i = 0; i < dabs; i++) {
      const a = (i / dabs) * Math.PI * 2 + ring * 0.4 + g.hue * 6;
      const dx = Math.cos(a);
      const dy = Math.sin(a) * 0.55;
      const l = base + facing(dx, dy) * 0.06; // the rosette turns each leaf through the light
      const x = baseX + dx * r;
      const y = baseY - 1 + dy * r; // the rosette, foreshortened
      px(ctx, x, y, shade(g.hue, g.sat, l));
      px(ctx, x, y - 1, shade(g.hue, g.sat, l + 0.09), 0.9);
    }
  }
  px(ctx, baseX, baseY - 2, shade(g.hue2, g.sat, 0.62)); // the heart
  px(ctx, baseX + 1, baseY - 1, shade(g.hue, g.sat, 0.2), 0.5); // tucked in its own shade
  if (g.petals >= 8 || g.glow > 0.8) {
    const h = 4 + g.height * 8;
    for (let i = 0; i < h; i++) px(ctx, baseX, baseY - 2 - i, shade(stemHueOf(g), g.sat * 0.5, 0.28 + (i / h) * 0.08));
    const bl = g.glow > 0.8 ? 0.75 : 0.6;
    px(ctx, baseX, baseY - 2 - h, shade(g.hue2, Math.min(1, g.sat + 0.2), bl));
    px(ctx, baseX - 1, baseY - 1 - h, shade(g.hue2, Math.min(1, g.sat + 0.2), bl + 0.05), 0.85);
    px(ctx, baseX + 1, baseY - 1 - h, shade(g.hue2, Math.min(1, g.sat + 0.2), bl - 0.07), 0.85);
  }
}

// Cattails: a stand of straight stalks with arcing blades, the chosen few
// wearing velvet seed-heads with a lit crown and a spike above.
function drawReed(ctx: Ctx, g: Genome): void {
  const baseX = PLANT_ANCHOR_X;
  const baseY = PLANT_ANCHOR_Y;
  const count = 3 + Math.round(g.spread * 3); // 3-6 stalks
  const heads = Math.max(1, Math.min(count, Math.round(g.petals / 3)));
  const step = Math.max(1, Math.round(count / heads));
  anchor(ctx, baseX, count);
  const sh = 0.26 + (g.hue - 0.26) * 0.5;
  // two blades arc from the root, one to the light and one away
  const bladeLen = 5 + g.height * 5;
  for (let s = 1; s <= bladeLen; s++) {
    const f = s / bladeLen;
    px(ctx, baseX - 1 - s * 0.55, baseY - s + f * f * 2.5, shade(sh, g.sat * 0.6, 0.34 + f * 0.1), 0.9);
    if (s > 1) px(ctx, baseX + 1 + s * 0.5, baseY - s * 0.9 + f * f * 2.5, shade(sh, g.sat * 0.55, 0.24 + f * 0.05), 0.9);
  }
  let headed = 0;
  for (let i = 0; i < count; i++) {
    const x = baseX - count + i * 2 + (i % 2);
    const h = Math.round(7 + g.height * 12 + Math.sin(i * 2.6 + g.hue * 9) * 2 + g.lean * i);
    const sun = x < baseX ? 0.05 : -0.03; // stalks on the sun side hold the light
    for (let s = 0; s <= h; s++) {
      px(ctx, x, baseY - s, shade(sh, g.sat * 0.6, 0.27 + (s / h) * 0.12 + sun));
    }
    if (i % step === 0 && headed < heads) {
      headed++;
      // the cattail: a velvet head over the stalk's top, a thin spike above
      const hl = (g.glow > 0.8 ? 0.62 : 0.4) + sun;
      px(ctx, x, baseY - h, shade(g.hue2, g.sat * 0.85, hl + 0.1)); // its lit crown
      px(ctx, x, baseY - h + 1, shade(g.hue2, g.sat * 0.85, hl));
      px(ctx, x, baseY - h + 2, shade(g.hue2, g.sat * 0.85, hl - 0.06));
      if (headed === 1) px(ctx, x + 1, baseY - h + 1, shade(g.hue2, g.sat * 0.8, hl + 0.04), 0.6); // the fattest head catches sideways light
      px(ctx, x, baseY - h - 1, shade(sh, g.sat * 0.5, 0.42), 0.9);
      px(ctx, x, baseY - h - 2, shade(sh, g.sat * 0.5, 0.46), 0.6);
      if (g.glow > 0.8) px(ctx, x - 1, baseY - h, shade(g.hue2, 0.9, 0.8), 0.5);
    }
  }
}

// A creeper climbing its own invisible trellis: the stem winds, heart
// leaves alternate sides, trumpet blossoms open sunward, and the growing
// tip curls on, still looking for a hold.
function drawVine(ctx: Ctx, g: Genome): void {
  const baseX = PLANT_ANCHOR_X;
  const baseY = PLANT_ANCHOR_Y;
  const len = Math.round(9 + g.height * 13);
  const amp = 1.5 + g.spread * 2.5;
  anchor(ctx, baseX, 2 + g.spread);
  const sh = stemHueOf(g);
  const wind = (s: number): number =>
    baseX + Math.sin(s * 0.55 + g.hue * 6.28) * amp * (0.35 + (0.65 * s) / len) + (g.lean * s * 2) / len;
  let lx = baseX;
  for (let s = 0; s <= len; s++) {
    const x = wind(s);
    const y = baseY - s;
    px(ctx, x, y, shade(sh, g.sat * 0.55, 0.27 + (s / len) * 0.12));
    if (Math.abs(x - lx) >= 1) px(ctx, (x + lx) / 2, y + 0.5, shade(sh, g.sat * 0.5, 0.22), 0.7); // the rope thickens where it turns
    lx = x;
    if (s % 3 === 1 && s > 1 && s < len - 1 && Math.round(g.leaves) > 0) {
      const side = Math.floor(s / 3) % 2 === 0 ? -1 : 1;
      const ll = side < 0 ? 0.38 : 0.24; // sunward leaves against shaded ones
      px(ctx, x + side, y, shade(sh, g.sat * 0.6, ll));
      px(ctx, x + side * 2, y + 1, shade(sh, g.sat * 0.6, ll - 0.04), 0.8);
    }
  }
  // trumpet blossoms along the climb: tube, flared mouth, a lip in the
  // light and a throat in the dark
  const blooms = Math.max(2, Math.round(g.petals / 2) - 1);
  for (let b = 0; b < blooms; b++) {
    const s = Math.round(((b + 1) / (blooms + 1)) * len);
    const x = wind(s);
    const y = baseY - s;
    const side = b % 2 === 0 ? -1 : 1;
    const bl = (g.glow > 0.8 ? 0.72 : 0.56) + (side < 0 ? 0.05 : -0.04);
    px(ctx, x + side, y, shade(g.hue, g.sat, bl - 0.08));
    px(ctx, x + side * 2, y, shade(g.hue, g.sat, bl));
    px(ctx, x + side * 2, y - 1, shade(g.hue, Math.min(1, g.sat + 0.1), bl + 0.06), 0.9);
    px(ctx, x + side * 2, y + 1, shade(g.hue2, g.sat, 0.35), 0.9);
    if (g.glow > 0.8 && b % 2 === 0) px(ctx, x + side * 3, y, shade(g.hue, 0.9, 0.82), 0.5);
  }
  const tx = wind(len);
  px(ctx, tx + 1, baseY - len - 1, shade(sh, g.sat * 0.6, 0.42), 0.95); // the tip curls
  px(ctx, tx + 2, baseY - len, shade(sh, g.sat * 0.6, 0.38), 0.8);
}

// A tussock: blades fountain from one root, banded root-dark to tip-light,
// the sunward side brighter. High-petal kinds nod seed plumes.
function drawGrass(ctx: Ctx, g: Genome): void {
  const baseX = PLANT_ANCHOR_X;
  const baseY = PLANT_ANCHOR_Y;
  const blades = 5 + Math.round(g.spread * 4); // 5-9
  const len = 5 + g.height * 10;
  anchor(ctx, baseX, 2 + g.spread * 2);
  for (let i = 0; i < blades; i++) {
    const t = blades === 1 ? 0.5 : i / (blades - 1);
    const a = (t - 0.5) * (0.9 + g.spread * 0.9) + g.lean * 0.35;
    const bl = len * (0.72 + 0.28 * ((Math.sin(i * 2.3 + g.hue * 7) + 1) / 2));
    const sun = -Math.sin(a) * 0.06; // blades bowing sunward stay lighter
    for (let s = 1; s <= bl; s++) {
      const f = s / bl;
      const x = baseX + Math.sin(a) * s * (0.6 + f * 0.5);
      const y = baseY - s + f * f * 2; // tips bow outward
      px(ctx, x, y, shade(g.hue, g.sat * (0.7 + f * 0.3), 0.24 + f * 0.24 + sun));
    }
    if (g.petals >= 7 && Math.abs(t - 0.5) < 0.18) {
      // seed plumes nod from the most upright blades
      const pl = g.glow > 0.8 ? 0.72 : 0.55;
      const tipX = baseX + Math.sin(a) * bl * 1.05;
      px(ctx, tipX, baseY - bl + 1, shade(g.hue2, g.sat * 0.8, pl));
      px(ctx, tipX + 1, baseY - bl, shade(g.hue2, g.sat * 0.8, pl - 0.06), 0.9);
    }
  }
}

// A cushion hugging the ground: lit from the upper-left, crusted with pale
// lichen discs, sending up pin sporophytes — the floor's smallest lanterns.
function drawMoss(ctx: Ctx, g: Genome): void {
  const baseX = PLANT_ANCHOR_X + g.lean;
  const baseY = PLANT_ANCHOR_Y;
  const w = Math.round(6 + g.spread * 5); // 6-11
  const hh = 2 + Math.round(g.height * 8); // a 2-4 px pillow
  anchor(ctx, baseX, w * 0.6);
  for (let row = 0; row < hh; row++) {
    const fy = hh === 1 ? 1 : row / (hh - 1); // 0 top .. 1 bottom
    const rw = Math.max(2, Math.round(w * Math.sqrt(0.3 + fy * 0.7)));
    const x0 = Math.round(baseX - rw / 2);
    const y = baseY - hh + 1 + row;
    const l = 0.34 - fy * 0.12;
    rect(ctx, x0, y, rw, 1, shade(g.hue, g.sat * 0.8, l));
    px(ctx, x0, y, shade(g.hue, g.sat * 0.85, l + 0.08), 0.9);
    px(ctx, x0 + rw - 1, y, shade(g.hue, g.sat * 0.75, l - 0.06), 0.9);
    for (let x = x0 + 1; x < x0 + rw - 1; x++) {
      // the nap of the moss: a sparse lit stipple on the sunward crown
      if ((x * 3 + row * 5 + Math.round(g.hue * 24)) % 4 === 0 && fy < 0.6 && x < baseX + 1) {
        px(ctx, x, y, shade(g.hue, g.sat * 0.9, l + 0.1), 0.7);
      }
    }
  }
  // lichen: pale discs crusting the cushion, each seated in its own shade
  const discs = Math.max(1, Math.round(g.petals / 3));
  for (let i = 0; i < discs; i++) {
    const a = (i / discs) * Math.PI * 2 + g.hue2 * 8;
    const dx = Math.cos(a) * (w * 0.3);
    const dy = -Math.abs(Math.sin(a)) * (hh - 1);
    px(ctx, baseX + dx, baseY - 1 + dy, shade(g.hue2, g.sat * 0.55, 0.6));
    px(ctx, baseX + dx + 1, baseY + dy, shade(g.hue2, g.sat * 0.5, 0.3), 0.6);
  }
  // sporophytes: pin stalks lifting tiny capsules into the light
  const pins = Math.round(g.leaves);
  for (let i = 0; i < pins; i++) {
    const xo = Math.round((i - (pins - 1) / 2) * 2.2 + Math.sin(i * 3.1 + g.hue * 9));
    const ph = 2 + ((i * 7 + Math.round(g.petals)) % 3);
    for (let s = 0; s < ph; s++) px(ctx, baseX + xo, baseY - hh - s, shade(g.hue, g.sat * 0.4, 0.4), 0.9);
    px(ctx, baseX + xo, baseY - hh - ph, shade(g.hue2, g.sat * 0.8, g.glow > 0.8 ? 0.78 : 0.58));
  }
  if (g.glow > 0.8) {
    px(ctx, baseX - w * 0.35, baseY - hh - 1, shade(g.hue2, 0.9, 0.8), 0.5);
    px(ctx, baseX + w * 0.3, baseY - hh, shade(g.hue2, 0.9, 0.8), 0.5);
  }
}

// A lantern-blossom: strap leaves at the root, a pale half-buried bulb, an
// arched neck, and a bell hung into the air — lit kinds burn like held lamps.
function drawBulb(ctx: Ctx, g: Genome): void {
  const baseX = PLANT_ANCHOR_X;
  const baseY = PLANT_ANCHOR_Y;
  const dir = g.lean >= 0 ? 1 : -1;
  const stemH = Math.round(6 + g.height * 11);
  const arc = (1 + g.spread * 0.8) * dir;
  anchor(ctx, baseX, 2 + g.spread);
  px(ctx, baseX - 1, baseY, shade(0.09, 0.3, 0.5)); // the bulb's pale dome, half-buried
  px(ctx, baseX, baseY, shade(0.09, 0.3, 0.36));
  px(ctx, baseX - 1, baseY - 1, shade(0.09, 0.35, 0.56), 0.9);
  const sh = stemHueOf(g);
  const ll = 3 + Math.round(g.leaves);
  for (let s = 1; s <= ll; s++) {
    const f = s / ll;
    px(ctx, baseX - 1 - s * 0.7, baseY - s + f * f * 1.5, shade(sh, g.sat * 0.6, 0.36 + f * 0.08), 0.95); // the sunward strap leaf
    px(ctx, baseX + 1 + s * 0.6, baseY - s + f * f * 1.5, shade(sh, g.sat * 0.55, 0.24), 0.95); // its shaded twin
  }
  let tx = baseX;
  let ty = baseY - stemH;
  for (let i = 1; i <= stemH; i++) {
    const f = i / stemH;
    const x = baseX + arc * f * f * 3.5; // the neck rises, then bows over
    px(ctx, x, baseY - i, shade(sh, g.sat * 0.5, 0.28 + f * 0.1));
    tx = x;
    ty = baseY - i;
  }
  const bellX = Math.round(tx + dir);
  const lit = g.glow > 0.8;
  const bl = lit ? 0.68 : 0.52;
  px(ctx, bellX, ty, shade(g.hue, g.sat, bl + 0.08)); // the shoulder in the light
  px(ctx, bellX + dir, ty, shade(g.hue, g.sat, bl - 0.02), 0.9);
  px(ctx, bellX - 1, ty + 1, shade(g.hue, g.sat, bl + 0.05));
  px(ctx, bellX, ty + 1, shade(g.hue, g.sat, bl));
  px(ctx, bellX + 1, ty + 1, shade(g.hue, g.sat, bl - 0.07));
  px(ctx, bellX - 1, ty + 2, shade(g.hue, g.sat, bl - 0.12), 0.95); // the mouth's rim
  px(ctx, bellX, ty + 2, shade(g.hue2, g.sat, lit ? 0.8 : 0.42), 0.95); // the mouth itself
  px(ctx, bellX + 1, ty + 2, shade(g.hue, g.sat, bl - 0.16), 0.95);
  px(ctx, bellX, ty + 3, shade(g.hue2, Math.min(1, g.sat + 0.2), lit ? 0.85 : 0.6), 0.9); // the clapper
  if (g.petals >= 8) {
    // twin-belled kinds hang a second, smaller, lower on the neck
    const x2 = Math.round(baseX + arc * 0.3025 * 3.5 - dir);
    const y2 = baseY - Math.round(stemH * 0.55);
    px(ctx, x2, y2 + 1, shade(g.hue, g.sat, bl));
    px(ctx, x2 - dir, y2 + 1, shade(g.hue, g.sat, bl - 0.06), 0.9);
    px(ctx, x2, y2 + 2, shade(g.hue2, g.sat, lit ? 0.78 : 0.5), 0.9);
  }
  if (lit) {
    // lamplight spills downward out of the bell's mouth
    px(ctx, bellX, ty + 4, shade(g.hue2, 0.9, 0.82), 0.5);
    px(ctx, bellX - 1, ty + 3, shade(g.hue, 0.9, 0.8), 0.4);
    px(ctx, bellX + 1, ty + 3, shade(g.hue, 0.9, 0.8), 0.4);
  }
}

// Spore-stalks: slender ringed spires, each lifting a true shaded sphere —
// lit cheek to the upper-left, dark under-curve — dusting the air with spores.
function drawSporestalk(ctx: Ctx, g: Genome): void {
  const baseX = PLANT_ANCHOR_X;
  const baseY = PLANT_ANCHOR_Y;
  const stalks = 2 + Math.round(g.spread * 2); // 2-4
  anchor(ctx, baseX, stalks + 1);
  const glowing = g.glow > 0.8;
  for (let i = 0; i < stalks; i++) {
    const xo = (i - (stalks - 1) / 2) * 3;
    const h = Math.round(8 + g.height * 11 + Math.sin(i * 2.9 + g.hue * 8) * 2);
    const bend = g.lean * 2 + xo * 0.25;
    let topX = baseX;
    for (let s = 0; s <= h; s++) {
      const f = s / h;
      const x = baseX + xo * (0.25 + 0.75 * f) + bend * f * f;
      px(ctx, x, baseY - s, shade(g.hue, g.sat * 0.45, 0.3 + f * 0.08 - (s % 3 === 0 ? 0.05 : 0))); // ringed as it rises
      topX = x;
    }
    const oy = baseY - h - 1;
    const big = i === Math.floor(stalks / 2); // the middle spire carries the great orb
    const ol = glowing ? 0.64 : 0.48;
    px(ctx, topX - 1, oy - 1, shade(g.hue, g.sat, ol + 0.12)); // the sphere's lit cheek
    px(ctx, topX, oy - 1, shade(g.hue, g.sat, ol + 0.03));
    px(ctx, topX - 1, oy, shade(g.hue, g.sat, ol - 0.02));
    px(ctx, topX, oy, shade(g.hue, g.sat, ol - 0.12)); // and its dark under-curve
    if (big) {
      px(ctx, topX + 1, oy - 1, shade(g.hue, g.sat, ol - 0.04), 0.95);
      px(ctx, topX + 1, oy, shade(g.hue, g.sat, ol - 0.15), 0.95);
      px(ctx, topX - 2, oy, shade(g.hue, g.sat, ol + 0.05), 0.9);
      px(ctx, topX - 1, oy - 2, shade(g.hue, g.sat, ol + 0.08), 0.9);
    }
    px(ctx, topX + (big ? 1 : 0), oy - (big ? 2 : 1) - 0, shade(g.hue2, g.sat * 0.8, 0.7), 0.9); // a spore-window
    // spores adrift above the orb
    const motes = glowing ? 3 : 1;
    for (let m = 0; m < motes; m++) {
      const mx = topX + Math.sin(i * 5 + m * 2.4 + g.petals) * 2;
      px(ctx, mx, oy - 3 - m - (i % 2), shade(g.hue2, 0.85, 0.75), glowing ? 0.55 : 0.3);
    }
  }
}

// Kelp: ribbons anchored to a holdfast, swaying wider as they rise, hung
// with bladder-floats; the tallest tip pales toward the skin of the sea.
function drawKelp(ctx: Ctx, g: Genome): void {
  const baseX = PLANT_ANCHOR_X;
  const baseY = PLANT_ANCHOR_Y;
  const ribbons = 2 + (g.spread > 0.55 ? 1 : 0);
  const len = Math.round(10 + g.height * 13);
  rect(ctx, baseX - 2, baseY - 1, 4, 2, shade(g.hue, g.sat * 0.7, 0.22)); // the holdfast gripping the seabed
  px(ctx, baseX - 2, baseY - 1, shade(g.hue, g.sat * 0.7, 0.3));
  for (let r = 0; r < ribbons; r++) {
    const xo = (r - (ribbons - 1) / 2) * 3;
    const phase = r * 2.1 + g.hue * 6.28;
    const rl = Math.round(len * (0.7 + 0.3 * ((Math.sin(r * 3.7 + g.hue2 * 9) + 1) / 2)));
    const at = (s: number): number =>
      baseX + xo * (0.3 + (0.7 * s) / rl) + Math.sin(s * 0.38 + phase) * (0.8 + g.spread * 1.4) * (s / rl) + (g.lean * s * 2) / rl;
    let tipX = baseX;
    let tipY = baseY;
    for (let s = 0; s <= rl; s++) {
      const f = s / rl;
      const x = at(s);
      const y = baseY - 1 - s;
      const l = 0.24 + f * 0.2 + Math.sin(s * 0.38 + phase + 1.1) * 0.05; // light ripples down the ribbon
      px(ctx, x, y, shade(g.hue, g.sat, l));
      if (f < 0.45) px(ctx, x + 1, y, shade(g.hue, g.sat * 0.9, l - 0.07), 0.7); // broad-bladed near the base
      if (s % 4 === 2 && s > 2) {
        const side = (Math.floor(s / 4) % 2) * 2 - 1;
        px(ctx, x + side, y, shade(g.hue, g.sat, l + 0.04), 0.8); // side blades
      }
      tipX = x;
      tipY = y;
    }
    const fs = Math.round(rl * 0.7);
    px(ctx, at(fs), baseY - 1 - fs, shade(g.hue2, Math.min(1, g.sat + 0.15), g.glow > 0.8 ? 0.78 : 0.58)); // the bladder-float
    px(ctx, tipX, tipY, shade(g.hue, g.sat, 0.55)); // the tip pales
    if (r === 0 && g.height > 0.7) px(ctx, tipX, tipY - 1, "hsl(190, 40%, 88%)", 0.55); // breaking the skin of the sea
  }
  if (g.glow > 0.8) {
    px(ctx, baseX - 3, baseY - len * 0.75, shade(g.hue2, 0.9, 0.8), 0.5);
    px(ctx, baseX + 3, baseY - len * 0.85, shade(g.hue2, 0.9, 0.8), 0.5);
  }
}

const DRAWERS: Record<PlantForm, (ctx: Ctx, g: Genome) => void> = {
  [PlantForm.Flower]: drawFlower,
  [PlantForm.Shrub]: drawShrub,
  [PlantForm.Tree]: drawTree,
  [PlantForm.Fungus]: drawFungus,
  [PlantForm.Fern]: drawFern,
  [PlantForm.Coral]: drawCoral,
  [PlantForm.Succulent]: drawSucculent,
  [PlantForm.Reed]: drawReed,
  [PlantForm.Vine]: drawVine,
  [PlantForm.Grass]: drawGrass,
  [PlantForm.Moss]: drawMoss,
  [PlantForm.Bulb]: drawBulb,
  [PlantForm.Sporestalk]: drawSporestalk,
  [PlantForm.Kelp]: drawKelp,
};
