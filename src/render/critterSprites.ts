import { makeRng } from "../core/rng";
import { CritterMorph, CritterSpecies, morphOf } from "../life/fauna";
import { hsl } from "../life/genome";

// Every critter is drawn from its morphology genome (fauna's morphOf): a
// body plan and independent features — legs, tail, crown, eyes, coat —
// shaded with a top light, an under-shadow and a rim so the little bodies
// read round and alive. The canvas stays 16×16 with the feet on row 13 and
// the ground shadow on row 14, because the renderer draws every sprite at
// (x-8, y-14) and flips mirror the whole square.

export const CRITTER_ANCHOR_X = 8;
export const CRITTER_ANCHOR_Y = 14;

const CX = 8; // masses span cx-hw .. cx+hw-1, symmetric under the flip
const FEET = 13; // the last row a body or leg may stand on
const GROUND = 14; // the contact-shadow row

export interface CritterSpriteSet {
  rest: HTMLCanvasElement;
  hop: HTMLCanvasElement;
  blink: HTMLCanvasElement;
  restFlip: HTMLCanvasElement;
  hopFlip: HTMLCanvasElement;
  blinkFlip: HTMLCanvasElement;
  den: HTMLCanvasElement;
}

const cache = new Map<number, CritterSpriteSet>();

export function getCritterSprites(sp: CritterSpecies): CritterSpriteSet {
  const hit = cache.get(sp.id);
  if (hit) return hit;
  const rest = drawCritter(sp, false);
  const hop = drawCritter(sp, true);
  const blink = drawCritter(sp, false, true);
  const set: CritterSpriteSet = {
    rest,
    hop,
    blink,
    restFlip: flip(rest),
    hopFlip: flip(hop),
    blinkFlip: flip(blink),
    den: drawDen(sp),
  };
  cache.set(sp.id, set);
  return set;
}

export function clearCritterSpriteCache(): void {
  cache.clear();
}

// The body a portrait needs — the subset of a species the journal can keep
// long after the living list is gone. The full genome grows back from these
// four numbers (morphOf hashes them), so a friend from three islands ago is
// drawn with exactly the body it wore.
export type CritterBody = Pick<CritterSpecies, "bodyHue" | "earLen" | "tailLen" | "size">;

// A portrait sketched from remembered body alone: how the journal draws a
// friend from a past island. Uncached — pages are drawn rarely, and memory
// must never collide with the island underfoot.
export function critterPortrait(body: CritterBody): HTMLCanvasElement {
  return drawCritter(body, false);
}

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 16;
  return [c, c.getContext("2d")!];
}

function flip(src: HTMLCanvasElement): HTMLCanvasElement {
  const [c, ctx] = makeCanvas();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(16, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(src, 0, 0);
  return c;
}

// ── palette ─────────────────────────────────────────────────────────────
// One pastel ramp per kind, cut from its body hue, plus an accent ramp for
// patterns, crests and inner ears — same wheel the flora spins on.

interface Coat {
  base: string;
  light: string; // the lit top of the body
  rim: string; // 1px crown highlight — the sun on fur
  shade: string; // the under-curve
  deep: string; // contact row, far legs
  belly: string;
  accent: string;
  accentLight: string;
  eye: string;
  nose: string;
  glow: string; // the rare luminous fleck
  white: string;
}

function makeCoat(hue: number, m: CritterMorph): Coat {
  return {
    base: hsl(hue, 0.48, 0.7),
    light: hsl(hue, 0.5, 0.79),
    rim: hsl(hue, 0.55, 0.87),
    shade: hsl(hue, 0.46, 0.58),
    deep: hsl(hue, 0.48, 0.45),
    belly: hsl(hue, 0.34, 0.86),
    accent: hsl(m.accentHue, 0.55, 0.62),
    accentLight: hsl(m.accentHue, 0.62, 0.78),
    eye: hsl(hue, 0.5, 0.16),
    nose: hsl(0.98, 0.6, 0.6),
    glow: hsl(m.accentHue, 0.95, 0.86),
    white: "hsl(0, 0%, 97%)",
  };
}

function rect(
  ctx: CanvasRenderingContext2D,
  color: string,
  x: number,
  y: number,
  w = 1,
  h = 1,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

// ── the rounded mass ────────────────────────────────────────────────────

// Half-width per row of a soft pixel ellipse.
function spans(W: number, H: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < H; i++) {
    const t = H <= 1 ? 0 : (i + 0.5 - H / 2) / (H / 2);
    out.push(Math.max(1, Math.round((W / 2) * Math.sqrt(Math.max(0.1, 1 - t * t)))));
  }
  return out;
}

// A shaded body mass: base fill, a lit dome leaning toward the face, a
// rim of sun on the crown, and shade gathering under the curve. Returns
// the row spans so coats and bellies can stay inside the silhouette.
function shadedMass(
  ctx: CanvasRenderingContext2D,
  c: Coat,
  cx: number,
  top: number,
  W: number,
  H: number,
): number[] {
  const sp = spans(W, H);
  for (let i = 0; i < H; i++) rect(ctx, c.base, cx - sp[i], top + i, sp[i] * 2, 1);
  // the lit dome, one size smaller, leaning toward the face side
  if (H >= 3 && W >= 4) {
    const shift = W >= 7 ? 1 : 0;
    const ls = spans(Math.max(2, W - 3), Math.max(2, H - 2));
    for (let i = 0; i < ls.length; i++) {
      rect(ctx, c.light, cx - ls[i] + shift, top + i, ls[i] * 2, 1);
    }
  }
  // shade gathers under the curve
  if (H >= 3) rect(ctx, c.shade, cx - sp[H - 2] + 1, top + H - 2, sp[H - 2] * 2 - 2, 1);
  rect(ctx, c.deep, cx - sp[H - 1], top + H - 1, sp[H - 1] * 2, 1);
  // a rim of sun along the crown
  if (W >= 5 && H >= 3) {
    const rw = Math.max(1, sp[0] * 2 - 3);
    rect(ctx, c.rim, cx - sp[0] + 2 + (W >= 7 ? 1 : 0), top, rw, 1);
  }
  return sp;
}

function paleBelly(
  ctx: CanvasRenderingContext2D,
  c: Coat,
  cx: number,
  top: number,
  H: number,
  sp: number[],
): void {
  if (H < 5) return;
  const from = Math.ceil(H * 0.55);
  for (let i = from; i < H - 2; i++) {
    const hw = Math.max(1, sp[i] - 2);
    rect(ctx, c.belly, cx - hw + 1, top + i, hw * 2 - 1, 1);
  }
}

// The coat pattern, clipped to the silhouette, painted translucent so the
// shading still breathes through it.
function coatPattern(
  ctx: CanvasRenderingContext2D,
  c: Coat,
  m: CritterMorph,
  cx: number,
  top: number,
  H: number,
  sp: number[],
  patSeed: number,
): void {
  if (m.pattern === "plain" || H < 3) return;
  const pr = makeRng(patSeed >>> 0);
  ctx.globalAlpha = 0.5;
  if (m.pattern === "spots") {
    const n = 2 + Math.floor(pr() * 4);
    for (let k = 0; k < n; k++) {
      const row = 1 + Math.floor(pr() * Math.max(1, H - 3));
      const hw = sp[row];
      if (hw < 2) continue;
      const x = cx - hw + 1 + Math.floor(pr() * Math.max(1, hw * 2 - 2));
      const big = hw >= 4 && pr() < 0.5;
      rect(ctx, c.accent, x, top + row, big ? 2 : 1, 1);
    }
  } else if (m.pattern === "stripes") {
    ctx.globalAlpha = 0.42;
    for (let i = 1; i < H - 1; i++) {
      for (let x = cx - sp[i] + 1; x < cx + sp[i] - 1; x++) {
        if ((((x - cx) % 3) + 3) % 3 === 0) rect(ctx, c.accent, x, top + i, 1, 1);
      }
    }
  } else if (m.pattern === "bands") {
    for (let i = 1; i < H - 1; i++) {
      if (i % 3 === 1) rect(ctx, c.accent, cx - sp[i] + 1, top + i, sp[i] * 2 - 2, 1);
    }
  } else {
    // saddle: a cape over the back half (the rear is the left, facing right)
    const rows = Math.max(1, Math.ceil(H * 0.4));
    for (let i = 0; i < rows; i++) rect(ctx, c.accent, cx - sp[i] + 1, top + i, sp[i], 1);
  }
  ctx.globalAlpha = 1;
}

// ── features ────────────────────────────────────────────────────────────

interface Head {
  hx: number; // head center x
  top: number; // head top y
  hw: number; // head half-width
  frontX: number; // first column past the face
  eyeY: number;
}

function drawFace(
  ctx: CanvasRenderingContext2D,
  c: Coat,
  m: CritterMorph,
  head: Head,
  blink: boolean,
  opts: { nose?: boolean; blush?: boolean } = {},
): void {
  const es = m.bigEyes ? 2 : 1;
  if (m.eyeCount === 1) {
    const w = Math.min(es + 1, Math.max(2, head.hw * 2 - 2));
    if (blink) {
      rect(ctx, c.shade, head.frontX - 1 - w, head.eyeY + w - 1 - (w > 2 ? 1 : 0), w, 1);
    } else {
      rect(ctx, c.eye, head.frontX - 1 - w, head.eyeY, w, w > 2 ? 2 : w);
      rect(ctx, c.white, head.frontX - 1 - w, head.eyeY, 1, 1);
    }
  } else {
    const frontEyeX = head.frontX - 1 - es;
    const positions: [number, number][] = [[frontEyeX, head.eyeY]];
    // the second eye sits back toward the crown — unless the head is too
    // small to hold it with a gap, and the profile keeps a single eye
    const backX = Math.max(head.hx - head.hw + 1, head.frontX - 2 - es * 2 - 1);
    if (backX + es < frontEyeX) positions.push([backX, head.eyeY]);
    // the third eye needs a real brow to sit on; tiny faces keep two
    if (m.eyeCount === 3 && head.hw >= 3 && head.eyeY - es - 1 >= head.top) {
      positions.push([head.frontX - 2 - es - 1, head.eyeY - es - 1]);
    }
    for (const [x, y] of positions) {
      if (blink) rect(ctx, c.shade, x, y + es - 1, es, 1);
      else {
        rect(ctx, c.eye, x, y, es, es);
        if (m.bigEyes) rect(ctx, c.white, x, y, 1, 1);
      }
    }
  }
  if (opts.nose !== false) rect(ctx, c.nose, head.frontX - 1, head.eyeY + es, 1, 1);
  if (opts.blush && !blink) {
    ctx.globalAlpha = 0.55;
    rect(ctx, c.accentLight, head.frontX - 2 - es, head.eyeY + es + 1, es, 1);
    ctx.globalAlpha = 1;
  }
}

// The crown — ears, horns, antennae or a crest — anchored on the head,
// scaled by the species' earLen, swept back a pixel mid-hop.
function drawCrown(
  ctx: CanvasRenderingContext2D,
  c: Coat,
  m: CritterMorph,
  earLen: number,
  head: Head,
  hop: boolean,
): void {
  if (m.crown === "none") return;
  const room = head.top; // rows of sky above the head
  const E = Math.max(1, Math.min(room, 1 + Math.round(earLen * 4) - (hop ? 1 : 0)));
  // features root at the head's edge columns, wide enough heads get 2px
  // ears with daylight kept between them (merged crowns read as lumps)
  const earW = head.hw >= 3 ? 2 : 1;
  const lx = head.hx - head.hw;
  const rx = head.hx + head.hw - earW;
  if (m.crown === "ears") {
    for (const x of [lx, rx]) {
      rect(ctx, c.base, x, head.top - E, earW, E + 1);
      if (E >= 2) rect(ctx, c.accent, x + earW - 1, head.top - E + 1, 1, 1);
      if (E >= 3) rect(ctx, c.light, x, head.top - E, 1, 1);
    }
  } else if (m.crown === "lop") {
    const L = Math.min(3, E + 1);
    rect(ctx, c.shade, lx - 1, head.top + 1, 2, L);
    rect(ctx, c.shade, rx + earW - 1, head.top + 1, 2, L);
    rect(ctx, c.accent, lx - 1, head.top + 2, 1, 1);
    rect(ctx, c.accent, rx + earW, head.top + 2, 1, 1);
  } else if (m.crown === "round") {
    for (const x of [lx, rx + earW - 2]) {
      rect(ctx, c.base, x, head.top - 2, 2, 2);
      rect(ctx, c.accent, x + 1, head.top - 1, 1, 1);
    }
  } else if (m.crown === "horns") {
    const hE = Math.max(1, Math.min(E, 3));
    rect(ctx, c.deep, lx, head.top - hE, 1, hE + 1);
    rect(ctx, c.deep, rx + earW - 1, head.top - hE, 1, hE + 1);
    rect(ctx, c.accentLight, lx - 1, head.top - hE, 1, 1);
    rect(ctx, c.accentLight, rx + earW, head.top - hE, 1, 1);
  } else if (m.crown === "antennae") {
    const aE = Math.max(2, E);
    for (const [x, kink] of [
      [head.hx - 1, -1],
      [head.hx + 1, 1],
    ] as const) {
      rect(ctx, c.shade, x, head.top - aE + 1, 1, aE);
      rect(ctx, m.glowMote ? c.glow : c.accentLight, x + kink, head.top - aE, 1, 1);
    }
  } else {
    // crest: a fan of rays in the accent color
    const mid = head.hx;
    rect(ctx, c.accent, mid, head.top - E, 1, E);
    rect(ctx, c.accentLight, mid, head.top - E, 1, 1);
    if (E >= 2) {
      rect(ctx, c.accent, mid - 1, head.top - E + 1, 1, E - 1);
      rect(ctx, c.accent, mid + 1, head.top - E + 1, 1, E - 1);
      rect(ctx, c.accentLight, mid - 1, head.top - E + 1, 1, 1);
      rect(ctx, c.accentLight, mid + 1, head.top - E + 1, 1, 1);
    }
  }
}

// The tail, drawn before the body so its root hides under the rump.
function drawTail(
  ctx: CanvasRenderingContext2D,
  c: Coat,
  m: CritterMorph,
  tailLen: number,
  exitX: number,
  exitY: number,
  hop: boolean,
  droop: boolean,
): void {
  const swing = hop ? 1 : 0;
  if (m.tail === "none") return;
  if (m.tail === "nub") {
    rect(ctx, c.shade, exitX - 2, exitY - swing, 2, 2);
    rect(ctx, c.light, exitX - 2, exitY - swing, 1, 1);
  } else if (m.tail === "sweep") {
    const T = 2 + Math.round(tailLen * 4);
    for (let t = 0; t < T; t++) {
      const dy = droop ? Math.floor(t / 2) : -Math.floor(t / 3) - swing;
      rect(ctx, t >= T - 2 ? c.deep : c.shade, exitX - 1 - t, exitY + dy, 1, 2);
    }
  } else if (m.tail === "curl") {
    const pts: [number, number][] = [
      [-1, 0],
      [-2, -1],
      [-2, -2],
      [-1, -3],
    ];
    for (const [dx, dy] of pts) rect(ctx, c.shade, exitX + dx, exitY + dy - swing, 1, 1);
    rect(ctx, c.accentLight, exitX - 1, exitY - 3 - swing, 1, 1);
  } else if (m.tail === "plume") {
    rect(ctx, c.shade, exitX - 1, exitY - swing, 1, 1);
    rect(ctx, c.shade, exitX - 2, exitY - 1 - swing, 1, 1);
    rect(ctx, c.accent, exitX - 4, exitY - 2 - swing, 3, 1);
    rect(ctx, c.accentLight, exitX - 4, exitY - 3 - swing, 2, 1);
  } else {
    // whip: a long thin line with a gentle S and an accent tip
    const T = 3 + Math.round(tailLen * 4);
    const wave = [0, 0, -1, -1, 0, 1, 1];
    for (let t = 0; t < T; t++) {
      rect(ctx, c.shade, exitX - 1 - t, exitY + wave[(t + swing) % wave.length], 1, 1);
    }
    rect(ctx, c.accentLight, exitX - T, exitY + wave[(T - 1 + swing) % wave.length], 1, 1);
  }
}

// A pair (or two) of legs under a body: near set in shade, far set in deep,
// gathered one row when mid-hop.
function drawLegs(
  ctx: CanvasRenderingContext2D,
  c: Coat,
  m: CritterMorph,
  bodyBottom: number,
  rearX: number,
  frontX: number,
  legPx: number,
  hop: boolean,
  wide: boolean,
): void {
  if (m.legPairs <= 0 || legPx <= 0) return;
  const w = wide ? 2 : 1;
  const top = bodyBottom + 1;
  const len = Math.max(1, legPx - (hop ? 1 : 0));
  const kick = hop ? 1 : 0;
  if (m.legPairs >= 2) {
    rect(ctx, c.deep, rearX + 1 + kick, top, w, len);
    rect(ctx, c.deep, frontX + 1 + kick, top, w, len);
  }
  rect(ctx, c.shade, rearX - kick, top, w, len);
  rect(ctx, c.shade, frontX + kick, top, w, len);
}

function contactShadow(ctx: CanvasRenderingContext2D, cx: number, hw: number): void {
  rect(ctx, "rgba(0,0,0,0.2)", cx - hw + 1, GROUND, Math.max(2, hw * 2 - 2), 1);
}

function glowFleck(
  ctx: CanvasRenderingContext2D,
  c: Coat,
  m: CritterMorph,
  x: number,
  y: number,
): void {
  if (!m.glowMote || m.crown === "antennae") return;
  rect(ctx, c.glow, x, y, 1, 1);
  ctx.globalAlpha = 0.4;
  rect(ctx, c.glow, x, y - 1, 1, 1);
  ctx.globalAlpha = 1;
}

// ── the eight body plans ────────────────────────────────────────────────

interface Pose {
  c: Coat;
  m: CritterMorph;
  sN: number; // 0 tiny .. 1 knee-high
  earLen: number;
  tailLen: number;
  hop: boolean;
  blink: boolean;
  patSeed: number;
}

type PlanDrawer = (ctx: CanvasRenderingContext2D, p: Pose) => void;

// a round dumpling, nearly all fur
function drawPuff(ctx: CanvasRenderingContext2D, p: Pose): void {
  const { c, m } = p;
  const W = 4 + Math.round(7 * p.sN);
  const H = Math.min(11, Math.max(3, W - 1));
  const legPx = m.legPairs > 0 ? 1 : 0;
  const drop = p.hop ? 1 : 0;
  const top = FEET - legPx - H + 1 + drop;
  const hw = Math.ceil(W / 2);
  contactShadow(ctx, CX, hw);
  drawTail(ctx, c, m, p.tailLen, CX - hw + 1, top + Math.round(H * 0.45), p.hop, false);
  const sp = shadedMass(ctx, c, CX, top, W, H);
  coatPattern(ctx, c, m, CX, top, H, sp, p.patSeed);
  if (m.paleBelly) paleBelly(ctx, c, CX, top, H, sp);
  drawLegs(ctx, c, m, top + H - 1, CX - hw + 1, CX + hw - 3, legPx, p.hop, true);
  const head: Head = {
    hx: CX,
    top,
    hw: sp[0],
    frontX: CX + sp[Math.max(0, Math.round(H * 0.3))],
    eyeY: top + Math.max(1, Math.round(H * 0.3)),
  };
  drawCrown(ctx, c, m, p.earLen, head, p.hop);
  drawFace(ctx, c, m, head, p.blink, { blush: true });
  glowFleck(ctx, c, m, CX - 2, top + 1);
}

// long and low on stumpy legs, an unhurried grazer shape
function drawLoaf(ctx: CanvasRenderingContext2D, p: Pose): void {
  const { c, m } = p;
  const W = 6 + Math.round(7 * p.sN);
  const H = 3 + Math.round(3.5 * p.sN);
  const legPx = 1 + Math.round(m.legLen + p.sN * 0.7);
  const drop = p.hop ? 1 : 0;
  const top = FEET - legPx - H + 1 + drop;
  const hw = Math.ceil(W / 2);
  contactShadow(ctx, CX, hw);
  drawTail(ctx, c, m, p.tailLen, CX - hw + 1, top + Math.round(H * 0.4), p.hop, true);
  const sp = shadedMass(ctx, c, CX, top, W, H);
  coatPattern(ctx, c, m, CX, top, H, sp, p.patSeed);
  if (m.paleBelly) paleBelly(ctx, c, CX, top, H, sp);
  drawLegs(ctx, c, m, top + H - 1, CX - hw + 1, CX + hw - 3, legPx, p.hop, true);
  // the head: a smaller mass leaning out front
  const hwHead = Math.max(2, Math.round(W * 0.22));
  const headH = Math.max(2, Math.min(H, 2 + Math.round(2 * p.sN)));
  const hx = Math.min(13, CX + hw - 1);
  const headTop = top - Math.max(1, Math.round(headH * 0.5));
  shadedMass(ctx, c, hx, headTop, hwHead * 2, headH);
  const head: Head = {
    hx,
    top: headTop,
    hw: hwHead,
    frontX: hx + hwHead,
    eyeY: headTop + Math.max(1, Math.round(headH * 0.4)),
  };
  drawCrown(ctx, c, m, p.earLen, head, p.hop);
  drawFace(ctx, c, m, head, p.blink);
  glowFleck(ctx, c, m, CX - 2, top + 1);
}

// haunches and spring — the heritage silhouette
function drawHopper(ctx: CanvasRenderingContext2D, p: Pose): void {
  const { c, m } = p;
  const W = 5 + Math.round(5 * p.sN);
  const H = 4 + Math.round(5 * p.sN);
  const drop = p.hop ? 1 : 0;
  const top = FEET - H + 1 + drop;
  const hw = Math.ceil(W / 2);
  contactShadow(ctx, CX, hw + 1);
  drawTail(ctx, c, m, p.tailLen, CX - hw, top + Math.round(H * 0.35), p.hop, false);
  // haunch: the big rear ball
  const sp = shadedMass(ctx, c, CX - 1, top, W, H);
  coatPattern(ctx, c, m, CX - 1, top, H, sp, p.patSeed);
  // chest and head: a smaller mass raised at the front — capped so a big
  // hopper keeps a round head instead of growing a wall
  const cw = Math.max(3, Math.min(6, W - 3));
  const chH = Math.max(3, Math.min(5, H - 2));
  const ccx = Math.min(12, CX - 1 + hw);
  const chTop = top - 1;
  const csp = shadedMass(ctx, c, ccx, chTop, cw, chH);
  if (m.paleBelly) paleBelly(ctx, c, CX - 1, top, H, sp);
  // paws tucked at the front, a long rear foot on the ground
  rect(ctx, c.deep, CX - hw + 1 + drop, FEET, 3, 1);
  rect(ctx, c.shade, ccx, FEET - (p.hop ? 1 : 0), 2, 1);
  const head: Head = {
    hx: ccx,
    top: chTop,
    hw: csp[0],
    frontX: ccx + csp[0],
    eyeY: chTop + Math.max(1, Math.round(chH * 0.35)),
  };
  drawCrown(ctx, c, m, p.earLen, head, p.hop);
  drawFace(ctx, c, m, head, p.blink);
  glowFleck(ctx, c, m, CX - 2, top + 1);
}

// a small body held high on long thin legs
function drawStrider(ctx: CanvasRenderingContext2D, p: Pose): void {
  const { c, m } = p;
  const W = 4 + Math.round(5 * p.sN);
  const H = 3 + Math.round(2 * p.sN);
  const legPx = Math.max(2, Math.min(10 - H, 3 + Math.round(m.legLen * 3 + 2 * p.sN)));
  const top = FEET - legPx - H + 1;
  const hw = Math.ceil(W / 2);
  contactShadow(ctx, CX, hw);
  drawTail(ctx, c, m, p.tailLen, CX - hw + 1, top + Math.round(H * 0.4), p.hop, false);
  const sp = shadedMass(ctx, c, CX, top, W, H);
  coatPattern(ctx, c, m, CX, top, H, sp, p.patSeed);
  // stilts: near in shade, far in deep, trotting apart mid-hop
  const bottom = top + H - 1;
  const splay = p.hop ? 1 : 0;
  const rearX = CX - hw + 1;
  const frontX = CX + hw - 2;
  if (m.legPairs >= 2) {
    rect(ctx, c.deep, rearX + 1 + splay, bottom + 1, 1, legPx - splay);
    rect(ctx, c.deep, frontX - 1 - splay, bottom + 1, 1, legPx - splay);
  }
  rect(ctx, c.shade, rearX - splay, bottom + 1, 1, legPx);
  rect(ctx, c.shade, frontX + splay, bottom + 1, 1, legPx);
  // a small keen head carried high at the front
  const hx = Math.min(12, CX + hw);
  const headH = Math.max(2, Math.min(3, Math.round(H * 0.6)));
  const headTop = top - headH + 1 + (p.hop ? 1 : 0);
  const hsp = shadedMass(ctx, c, hx, headTop, Math.max(3, Math.round(W * 0.55)), headH);
  const head: Head = {
    hx,
    top: headTop,
    hw: hsp[0],
    frontX: hx + hsp[0],
    eyeY: headTop + Math.max(0, Math.round(headH * 0.35)),
  };
  drawCrown(ctx, c, m, p.earLen, head, p.hop);
  drawFace(ctx, c, m, head, p.blink);
  glowFleck(ctx, c, m, CX - 1, top);
}

// a low undulating ribbon of segments
function drawSerpent(ctx: CanvasRenderingContext2D, p: Pose): void {
  const { c, m } = p;
  const L = 8 + Math.round(5 * p.sN);
  const thick = 2 + (p.sN > 0.55 ? 1 : 0);
  const x0 = CX - Math.ceil(L / 2);
  const phase = p.hop ? Math.PI : 0;
  contactShadow(ctx, CX, Math.ceil(L / 2));
  // the tail flourish rides the same wave the body does
  const tailY = 11 + Math.round(Math.sin((x0 - CX) / 2.2 + phase) * 0.9);
  drawTail(ctx, c, m, p.tailLen, x0 + 1, tailY, p.hop, false);
  // the body wave, tail thin to neck thick
  for (let i = 0; i < L; i++) {
    const x = x0 + i;
    const yOff = Math.round(Math.sin((x - CX) / 2.2 + phase) * 0.9);
    const t = i < 2 ? 1 : thick;
    const bottom = 12 + yOff;
    rect(ctx, c.base, x, bottom - t + 1, 1, t);
    rect(ctx, c.light, x, bottom - t + 1, 1, 1);
    if (t >= 2) rect(ctx, c.shade, x, bottom, 1, 1);
    if (m.pattern === "bands" && i % 3 === 1) {
      ctx.globalAlpha = 0.55;
      rect(ctx, c.accent, x, bottom - t + 1, 1, t);
      ctx.globalAlpha = 1;
    } else if (m.pattern !== "plain" && m.pattern !== "bands" && i % 4 === 2) {
      ctx.globalAlpha = 0.45;
      rect(ctx, c.accent, x, bottom - t + 1, 1, 1);
      ctx.globalAlpha = 1;
    }
    // a fringe of little feet, when the dice grew them
    if (m.legPairs > 0 && i % 2 === 0 && i < L - 1) {
      rect(ctx, c.deep, x, bottom + 1, 1, 1);
    }
  }
  // the head: raised at the front, with room for a face
  const headW = 3 + (p.sN > 0.4 ? 1 : 0);
  const headH = 3;
  const hx = Math.min(13, x0 + L - 1);
  const headTop = 12 - thick - headH + 1 + (p.hop ? 1 : 0);
  const hsp = shadedMass(ctx, c, hx, headTop, headW, headH);
  const head: Head = {
    hx,
    top: headTop,
    hw: hsp[0],
    frontX: hx + hsp[0],
    eyeY: headTop + 1,
  };
  drawCrown(ctx, c, m, p.earLen, head, p.hop);
  drawFace(ctx, c, m, head, p.blink, { nose: false });
  glowFleck(ctx, c, m, hx - 1, headTop - 1);
}

// a domed back over many quick little legs
function drawScuttler(ctx: CanvasRenderingContext2D, p: Pose): void {
  const { c, m } = p;
  const W = 5 + Math.round(7 * p.sN);
  const H = 3 + Math.round(3 * p.sN);
  const legPx = 1 + Math.round(m.legLen * 2);
  const top = FEET - legPx - H + 1 + (p.hop ? 1 : 0);
  const hw = Math.ceil(W / 2);
  contactShadow(ctx, CX, hw);
  drawTail(ctx, c, m, p.tailLen, CX - hw + 1, top + 1, p.hop, true);
  const sp = shadedMass(ctx, c, CX, top, W, H);
  coatPattern(ctx, c, m, CX, top, H, sp, p.patSeed);
  // the scuttle: legPairs legs spread under the dome, alternating rows
  // lifted mid-hop so the gait reads
  const bottom = top + H - 1;
  const n = Math.max(2, m.legPairs);
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0.5 : k / (n - 1);
    const x = Math.round(CX - hw + 1 + t * (hw * 2 - 3));
    const lift = p.hop && k % 2 === 0 ? 1 : 0;
    const lean = k < n / 2 ? -1 : 1;
    rect(ctx, c.deep, x + 1, bottom + 1, 1, Math.max(1, legPx - 1));
    rect(ctx, c.shade, x, bottom + 1, 1, Math.max(1, legPx - lift));
    if (legPx >= 2 && !lift) rect(ctx, c.shade, x + lean, FEET, 1, 1);
  }
  const head: Head = {
    hx: CX,
    top,
    hw: sp[0],
    frontX: CX + sp[Math.min(H - 1, Math.max(0, Math.round(H * 0.5)))],
    eyeY: top + Math.max(1, Math.round(H * 0.5)),
  };
  drawCrown(ctx, c, m, p.earLen, head, p.hop);
  drawFace(ctx, c, m, head, p.blink, { nose: false });
  glowFleck(ctx, c, m, CX - 2, top + 1);
}

// a tiny ball on stick legs under an oversized plume
function drawTuft(ctx: CanvasRenderingContext2D, p: Pose): void {
  const { c, m } = p;
  const W = 3 + Math.round(4 * p.sN);
  const H = Math.max(3, W - 1);
  const legPx = 2 + Math.round(m.legLen * 2);
  const drop = p.hop ? 1 : 0;
  const top = FEET - legPx - H + 1 + drop;
  const hw = Math.ceil(W / 2);
  contactShadow(ctx, CX, hw);
  drawTail(ctx, c, m, p.tailLen, CX - hw + 1, top + Math.round(H * 0.5), p.hop, false);
  const sp = shadedMass(ctx, c, CX, top, W, H);
  coatPattern(ctx, c, m, CX, top, H, sp, p.patSeed);
  // stick legs with little back-toes
  const bottom = top + H - 1;
  const len = Math.max(1, legPx - drop);
  rect(ctx, c.shade, CX - 2, bottom + 1, 1, len);
  rect(ctx, c.shade, CX + 1, bottom + 1, 1, len);
  if (!p.hop) {
    rect(ctx, c.deep, CX - 3, FEET, 1, 1);
    rect(ctx, c.deep, CX, FEET, 1, 1);
  }
  const head: Head = {
    hx: CX,
    top,
    hw: sp[0],
    frontX: CX + sp[Math.max(0, Math.round(H * 0.35))],
    eyeY: top + Math.max(1, Math.round(H * 0.35)),
  };
  drawCrown(ctx, c, m, p.earLen, head, p.hop);
  drawFace(ctx, c, m, head, p.blink, { blush: true });
  glowFleck(ctx, c, m, CX - 1, top);
}

// mostly head, mostly eyes
function drawGazer(ctx: CanvasRenderingContext2D, p: Pose): void {
  const { c, m } = p;
  const W = 5 + Math.round(6 * p.sN);
  const H = Math.min(11, Math.max(4, W - 1));
  const legPx = m.legPairs > 0 ? 1 : 0;
  const drop = p.hop ? 1 : 0;
  const top = FEET - legPx - H + 1 + drop;
  const hw = Math.ceil(W / 2);
  contactShadow(ctx, CX, hw);
  drawTail(ctx, c, m, p.tailLen, CX - hw + 1, top + Math.round(H * 0.55), p.hop, false);
  const sp = shadedMass(ctx, c, CX, top, W, H);
  coatPattern(ctx, c, m, CX, top, H, sp, p.patSeed);
  if (m.paleBelly) paleBelly(ctx, c, CX, top, H, sp);
  drawLegs(ctx, c, m, top + H - 1, CX - hw + 1, CX + hw - 3, legPx, p.hop, true);
  // the huge forward eyes are the whole face
  const es = 2;
  const eyeY = top + Math.max(1, Math.round(H * 0.32));
  const lx = CX - es - 1;
  const rx = CX + 1 + (W >= 8 ? 1 : 0);
  if (m.eyeCount === 1) {
    // one huge round eye, tall enough that it never reads as a mouth
    const w = Math.min(3, W - 2);
    const eh = H >= 7 ? w : Math.max(2, w - 1);
    if (p.blink) rect(ctx, c.shade, CX - 1, eyeY + 1, w, 1);
    else {
      rect(ctx, c.eye, CX - 1, eyeY - 1, w, eh);
      rect(ctx, c.white, CX - 1, eyeY - 1, 1, 1);
    }
  } else {
    // a third eye only when the brow has room for it to sit apart
    const three = m.eyeCount === 3 && W >= 8 && eyeY - es - 1 >= top + 1;
    for (const x of three ? [lx, rx, CX - 1] : [lx, rx]) {
      const y = x === CX - 1 ? eyeY - es - 1 : eyeY;
      if (p.blink) rect(ctx, c.shade, x, y + es - 1, es, 1);
      else {
        rect(ctx, c.eye, x, y, es, es);
        rect(ctx, c.white, x, y, 1, 1);
      }
    }
  }
  rect(ctx, c.nose, CX, eyeY + es + 1, 1, 1);
  if (!p.blink) {
    // a blush on each cheek, kept inside the silhouette
    const row = Math.min(H - 1, eyeY + es - top);
    ctx.globalAlpha = 0.55;
    rect(ctx, c.accentLight, Math.max(CX - sp[row] + 1, lx - 1), eyeY + es, 1, 1);
    rect(ctx, c.accentLight, Math.min(CX + sp[row] - 2, rx + es), eyeY + es, 1, 1);
    ctx.globalAlpha = 1;
  }
  const head: Head = { hx: CX, top, hw: sp[0], frontX: CX + sp[0], eyeY };
  drawCrown(ctx, c, m, p.earLen, head, p.hop);
  glowFleck(ctx, c, m, CX - 2, top + 1);
}

const PLAN_DRAWERS: Record<CritterMorph["plan"], PlanDrawer> = {
  puff: drawPuff,
  loaf: drawLoaf,
  hopper: drawHopper,
  strider: drawStrider,
  serpent: drawSerpent,
  scuttler: drawScuttler,
  tuft: drawTuft,
  gazer: drawGazer,
};

// ── assembly ────────────────────────────────────────────────────────────

function resolveMorph(body: CritterBody & { morph?: CritterMorph }): CritterMorph {
  return body.morph ?? morphOf(body);
}

// Coat-pattern placement needs dice that roll the same for every frame of
// the same kind — seeded from the same quantized numbers the genome hashes.
function patternSeed(body: CritterBody): number {
  const q = (v: number): number => Math.round(v * 1000) | 0;
  let h = 0x9e37;
  for (const v of [q(body.bodyHue), q(body.earLen), q(body.tailLen), q(body.size)]) {
    h = Math.imul(h ^ v, 0x27d4eb2d);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

function drawCritter(
  body: CritterBody & { morph?: CritterMorph },
  hop: boolean,
  blink = false,
): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas();
  const m = resolveMorph(body);
  const pose: Pose = {
    c: makeCoat(body.bodyHue, m),
    m,
    sN: Math.min(1, Math.max(0, (body.size - 0.35) / 1.25)),
    earLen: body.earLen,
    tailLen: body.tailLen,
    hop,
    blink,
    patSeed: patternSeed(body),
  };
  PLAN_DRAWERS[m.plan](ctx, pose);
  return canvas;
}

// A little earthen burrow mound with a dark doorway, sized to the kind
// that sleeps inside it.
function drawDen(sp: CritterSpecies): HTMLCanvasElement {
  const [c, ctx] = makeCanvas();
  const sN = Math.min(1, Math.max(0, (sp.size - 0.35) / 1.25));
  const mound = 10 + Math.round(3 * sN);
  const rows = 5 + Math.round(sN);
  const earth = "hsl(28, 30%, 38%)";
  const earthDark = "hsl(28, 32%, 30%)";
  const top = 14 - rows;
  for (let row = 0; row < rows; row++) {
    const w = mound * Math.sqrt((row + 1) / rows);
    ctx.fillStyle = row < 2 ? earthDark : earth;
    ctx.fillRect(Math.round(8 - w / 2), top + row, Math.round(w), 1);
  }
  const doorW = 3 + (sN > 0.5 ? 1 : 0);
  const doorH = 2 + (sN > 0.25 ? 1 : 0);
  ctx.fillStyle = "hsl(20, 30%, 12%)";
  ctx.fillRect(8 - Math.floor(doorW / 2) - 1, 14 - doorH, doorW, doorH);
  ctx.fillStyle = hsl(sp.bodyHue, 0.4, 0.6);
  ctx.fillRect(8 - Math.floor(mound / 2), top + 1, 1, 1); // a tuft of fur caught on the mound
  return c;
}
