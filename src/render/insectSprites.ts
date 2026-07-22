import { hash2d, makeRng } from "../core/rng";
import { IdMap, MAP_CELLS, appearanceColors } from "../life/idmap";
import { BehaviorGenes } from "../life/swarm";

// Every swarm insect is drawn from its swarm's genome, the same way every
// critter is drawn from morphOf: a body plan rolled from a hash of the swarm's
// heritable behaviour genes (stable for a swarm's whole life — the sensor map
// evolves, but a moth never wakes up a beetle), coloured honestly from the
// SENSOR map the inspect card paints. Body = the map's dominant colour; wings =
// its second swatch; the 2–3 wing-pattern pixels sample ACTUAL sensor cells
// (0 / 24 / 48), so as the pool adapts toward its flower the wing patches drift
// to the flower's accent hue — camouflage landing on the insect pixel by pixel.
//
// The sprites are tiny (7×7 world px, insect ~5×4) — the ambient dragonfly
// proved tiny reads as insect — cached on a hash of the sensor bytes (+
// behaviour), so a sprite is rebuilt at most once per heartbeat as the pool
// evolves. Pure math (morph, palette, flight) is separated from the canvas
// work so it stays testable without a DOM.

// ── the five body plans ─────────────────────────────────────────────────

export type InsectPlan = "moth" | "beetle" | "hoverer" | "damsel" | "skipper";

export const INSECT_PLANS: readonly InsectPlan[] = [
  "moth", // broad twin wing quads over a short dark body
  "beetle", // a domed shining elytra; wings only flare in flight
  "hoverer", // a banded 2px bee-body on stubby blurring wings
  "damsel", // a needle body along the heading, narrow wing flickers
  "skipper", // compact swept triangle wings, quick and darty
];

// plans that read best rotated along their heading (needle bodies);
// the top-down radial plans draw axis-aligned and only flip.
export const ROTATING_PLANS: ReadonlySet<InsectPlan> = new Set(["damsel", "skipper"]);

export interface InsectMorph {
  plan: InsectPlan;
  broad: boolean; // an extra pixel of wingspan
  longBody: boolean; // an extra abdomen pixel (needle plans wear it best)
}

const r3 = (v: number): number => Math.round(v * 1000);

function mixHash(h: number, v: number): number {
  h = Math.imul(h ^ v, 0x85ebca6b);
  h ^= h >>> 13;
  return (Math.imul(h, 0xc2b2ae35) ^ (h >>> 16)) | 0;
}

// The insect genome from the swarm's heritable behaviour, the way morphOf
// grows a critter from its four remembered numbers: one hash, one frozen roll
// order. Behaviour tilts the dice the way habitat tilts critter body plans —
// a tight-cohesion swarm leans compact (beetle, hoverer), a wide-ranging one
// leans long-winged (moth, damsel), a bold one darts (skipper).
export function insectMorphOf(behavior: BehaviorGenes): InsectMorph {
  let h = 0x15ec7;
  h = mixHash(h, r3(behavior.range));
  h = mixHash(h, r3(behavior.nerve));
  h = mixHash(h, r3(behavior.cohesion));
  const r = makeRng(h >>> 0);
  const pool: InsectPlan[] = [...INSECT_PLANS];
  if (behavior.cohesion > 0.6) pool.push("beetle", "hoverer");
  if (behavior.range > 0.6) pool.push("moth", "damsel");
  if (behavior.nerve > 0.6) pool.push("skipper");
  if (behavior.nerve < 0.4) pool.push("hoverer");
  const plan = pool[Math.floor(r() * pool.length)];
  const broad = r() < 0.4 + behavior.range * 0.3;
  const longBody = r() < 0.35;
  return { plan, broad, longBody };
}

// ── genome → colour, honestly ───────────────────────────────────────────

export interface InsectPalette {
  body: string; // the sensor map's dominant colour — the very tint the card reads
  bodyLight: string;
  bodyDeep: string;
  wing: string; // the map's second swatch
  wingDeep: string;
  marks: (string | null)[]; // sensor cells 0 / 24 / 48 — null where neutral
  eye: string;
}

// nudge an `hsl(H, S%, L%)` swatch by saturation/lightness deltas (in points)
function shade(color: string, ds: number, dl: number): string {
  const m = color.match(/^hsl\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)%,\s*(\d+(?:\.\d+)?)%\)$/);
  if (!m) return color;
  const s = Math.max(0, Math.min(100, Math.round(Number(m[2]) + ds)));
  const l = Math.max(0, Math.min(96, Math.round(Number(m[3]) + dl)));
  return `hsl(${m[1]}, ${s}%, ${l}%)`;
}

const NAIVE_BODY = "hsl(168, 40%, 60%)"; // an all-neutral generalist reads as faint mint

// the cells the wing pattern samples — corners and the heart of the 7×7 map
export const MARK_CELLS: readonly number[] = [0, 24, 48];

/** The whole look from the sensor map: dominant colour = body, second swatch =
 *  wings, and the wing-pattern pixels sampled straight off cells 0/24/48 — so
 *  the sprite drifts toward its flower exactly as the genome does. Pure. */
export function insectPalette(sensor: IdMap): InsectPalette {
  const cols = appearanceColors(sensor);
  const tally = new Map<string, number>();
  for (let i = 0; i < MAP_CELLS; i++) {
    if (sensor[i] === 0) continue;
    tally.set(cols[i], (tally.get(cols[i]) ?? 0) + 1);
  }
  const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
  const body = ranked[0]?.[0] ?? NAIVE_BODY;
  const wing = ranked[1]?.[0] ?? shade(body, -14, 16);
  return {
    body,
    bodyLight: shade(body, -6, 14),
    bodyDeep: shade(body, 2, -20),
    wing: shade(wing, -10, 12),
    wingDeep: shade(wing, -6, -6),
    marks: MARK_CELLS.map((i) => (sensor[i] === 0 ? null : cols[i])),
    eye: "hsl(206, 32%, 13%)",
  };
}

// ── the sprite cache ────────────────────────────────────────────────────

export const INSECT_SPRITE = 7; // canvas edge, world px
export const INSECT_ANCHOR = 3; // the insect's centre within it

export interface InsectSpriteSet {
  plan: InsectPlan;
  wingA: HTMLCanvasElement; // wings spread
  wingB: HTMLCanvasElement; // mid-beat
  perch: HTMLCanvasElement; // wings folded, sitting on a bloom
  // the needle plans fly along their heading; a hand-drawn 45° variant keeps
  // every octant on the pixel grid (90° turns are exact, so 4+4 covers all 8)
  diag?: { wingA: HTMLCanvasElement; wingB: HTMLCanvasElement; perch: HTMLCanvasElement };
}

/** The cache key: sensor bytes + quantized behaviour. The pool evolving changes
 *  the key (a rebuild, at most once per heartbeat); a quiet heartbeat reuses. */
export function insectSpriteKey(sensor: IdMap, behavior: BehaviorGenes): number {
  let h = 0xb5297a4d | 0;
  for (let i = 0; i < sensor.length; i++) h = mixHash(h, sensor[i]);
  h = mixHash(h, r3(behavior.range));
  h = mixHash(h, r3(behavior.nerve));
  h = mixHash(h, r3(behavior.cohesion));
  return h >>> 0;
}

const cache = new Map<number, InsectSpriteSet>();
const CACHE_CAP = 160; // a couple dozen swarms × a few heartbeats of history

export function getInsectSprites(sw: { sensor: IdMap; behavior: BehaviorGenes }): InsectSpriteSet {
  const key = insectSpriteKey(sw.sensor, sw.behavior);
  const hit = cache.get(key);
  if (hit) return hit;
  const morph = insectMorphOf(sw.behavior);
  const pal = insectPalette(sw.sensor);
  const set: InsectSpriteSet = {
    plan: morph.plan,
    wingA: drawInsect(morph, pal, "wingA"),
    wingB: drawInsect(morph, pal, "wingB"),
    perch: drawInsect(morph, pal, "perch"),
  };
  if (ROTATING_PLANS.has(morph.plan)) {
    const diagDraw = morph.plan === "damsel" ? drawDamselDiag : drawSkipperDiag;
    const make = (f: InsectFrame): HTMLCanvasElement => {
      const [c, ctx] = makeCanvas();
      diagDraw(ctx, morph, pal, f);
      return c;
    };
    set.diag = { wingA: make("wingA"), wingB: make("wingB"), perch: make("perch") };
  }
  if (cache.size >= CACHE_CAP) cache.clear();
  cache.set(key, set);
  return set;
}

export function clearInsectSpriteCache(): void {
  cache.clear();
}

// ── drawing (facing +x; head to the right) ──────────────────────────────

export type InsectFrame = "wingA" | "wingB" | "perch";

function makeCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = INSECT_SPRITE;
  c.height = INSECT_SPRITE;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

function px(ctx: CanvasRenderingContext2D, color: string | null, x: number, y: number): void {
  if (!color) return;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

function drawInsect(m: InsectMorph, pal: InsectPalette, frame: InsectFrame): HTMLCanvasElement {
  const [c, ctx] = makeCanvas();
  DRAWERS[m.plan](ctx, m, pal, frame);
  return c;
}

type Drawer = (
  ctx: CanvasRenderingContext2D,
  m: InsectMorph,
  pal: InsectPalette,
  frame: InsectFrame,
) => void;

// broad twin wing quads over a short dark body — the classic bloom visitor
function drawMoth(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  // antennae ahead of the eye — the moth's tell
  px(ctx, pal.bodyLight, 5, 2);
  px(ctx, pal.bodyLight, 5, 4);
  if (f === "perch") {
    // wings folded to a narrow tent over the back
    px(ctx, pal.wingDeep, 1, 3);
    px(ctx, pal.wing, 2, 3);
    px(ctx, pal.wing, 3, 3);
    px(ctx, pal.wing, 2, 2);
    px(ctx, pal.wing, 2, 4);
    px(ctx, pal.marks[0], 2, 2);
    px(ctx, pal.marks[1], 2, 4);
    px(ctx, pal.eye, 4, 3);
    return;
  }
  // the dark body under the wings
  px(ctx, pal.bodyDeep, 2, 3);
  px(ctx, pal.body, 3, 3);
  px(ctx, pal.eye, 4, 3);
  if (f === "wingA") {
    // spread: forewing quads, a hindwing pixel trailing
    for (const dy of [-1, 1]) {
      const y1 = 3 + dy;
      const y2 = 3 + dy * 2;
      px(ctx, pal.wing, 2, y2);
      px(ctx, pal.wing, 3, y2);
      px(ctx, pal.wing, 2, y1);
      px(ctx, pal.wing, 3, y1);
      px(ctx, pal.wingDeep, 1, y1);
      if (m.broad) px(ctx, pal.wingDeep, 1, y2);
    }
    px(ctx, pal.marks[0], 3, 1);
    px(ctx, pal.marks[0], 3, 5);
    px(ctx, pal.marks[1], 2, 2);
    px(ctx, pal.marks[1], 2, 4);
  } else {
    // mid-beat: wings gathered to a single row each side
    for (const dy of [-1, 1]) {
      px(ctx, pal.wing, 2, 3 + dy);
      px(ctx, pal.wing, 3, 3 + dy);
      if (m.broad) px(ctx, pal.wingDeep, 1, 3 + dy);
    }
    px(ctx, pal.marks[0], 3, 2);
    px(ctx, pal.marks[0], 3, 4);
  }
}

// a domed shining elytra over a hidden body; wings only flare in flight
function drawBeetle(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  if (f !== "perch") {
    // flight: pale wing blurs flare from under the dome
    px(ctx, pal.wing, f === "wingA" ? 2 : 3, 1);
    px(ctx, pal.wing, f === "wingA" ? 2 : 3, 5);
  }
  // the dome: lit crown row, seam along the travel axis, shaded skirt
  for (let x = 2; x <= 4; x++) {
    px(ctx, pal.bodyLight, x, 2);
    px(ctx, pal.body, x, 3);
    px(ctx, pal.bodyDeep, x, 4);
  }
  px(ctx, pal.bodyDeep, 3, 3); // the seam pixel
  px(ctx, pal.marks[0], 2, 2);
  px(ctx, pal.marks[1], 4, 2);
  px(ctx, pal.marks[2], 3, 4);
  px(ctx, pal.eye, 5, 3);
}

// a banded bee-body hovering on stubby blurred wings
function drawHoverer(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  // abdomen · band · thorax · head
  px(ctx, pal.body, 1, 2);
  px(ctx, pal.body, 1, 3);
  px(ctx, pal.bodyDeep, 2, 2);
  px(ctx, pal.bodyDeep, 2, 3);
  px(ctx, pal.body, 3, 2);
  px(ctx, pal.body, 3, 3);
  px(ctx, pal.eye, 4, 2);
  px(ctx, pal.bodyDeep, 4, 3);
  px(ctx, pal.marks[0], 1, 2);
  px(ctx, pal.marks[1], 1, 3);
  if (f === "perch") {
    // wings folded flat along the back
    px(ctx, pal.wing, 2, 1);
    px(ctx, pal.wing, 3, 1);
  } else {
    // the blur: the wing pair snaps between two positions
    const wx = f === "wingA" ? 2 : 3;
    px(ctx, pal.wing, wx, 1);
    px(ctx, pal.wing, wx, 4);
    if (m.broad) {
      px(ctx, pal.wingDeep, wx - 1, 1);
      px(ctx, pal.wingDeep, wx - 1, 4);
    }
  }
}

// a needle body along the heading — kin to the pond dragonflies
function drawDamsel(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  if (m.longBody) px(ctx, pal.bodyDeep, 0, 3);
  px(ctx, pal.bodyDeep, 1, 3);
  px(ctx, pal.bodyDeep, 2, 3);
  px(ctx, pal.body, 3, 3);
  px(ctx, pal.bodyDeep, 4, 3);
  px(ctx, pal.eye, 5, 3);
  px(ctx, pal.marks[0], 2, 3); // the abdomen wears its flower-patch
  if (f === "perch") {
    // wings folded back over the abdomen
    px(ctx, pal.wing, 2, 2);
    px(ctx, pal.wing, 3, 2);
  } else if (f === "wingA") {
    px(ctx, pal.wing, 3, 2);
    px(ctx, pal.wing, 3, 4);
  } else {
    px(ctx, pal.wing, 3, 1);
    px(ctx, pal.wing, 3, 5);
    px(ctx, pal.wingDeep, 3, 2);
    px(ctx, pal.wingDeep, 3, 4);
  }
}

// compact swept triangle wings — quick and darty
function drawSkipper(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  px(ctx, pal.bodyDeep, 3, 3);
  px(ctx, pal.body, 4, 3);
  px(ctx, pal.eye, 5, 3);
  if (f === "perch") {
    // skippers hold their wings up together — a little flag over the back
    px(ctx, pal.wing, 3, 1);
    px(ctx, pal.wing, 3, 2);
    px(ctx, pal.marks[0], 3, 2);
    return;
  }
  const swept = f === "wingB";
  for (const dy of [-1, 1]) {
    px(ctx, pal.wing, 3, 3 + dy);
    px(ctx, pal.wing, 2, 3 + dy);
    if (!swept) px(ctx, pal.wingDeep, 2, 3 + dy * 2);
    if (m.broad && !swept) px(ctx, pal.wing, 1, 3 + dy);
  }
  px(ctx, pal.marks[0], 2, 2);
  px(ctx, pal.marks[1], 2, 4);
}

const DRAWERS: Record<InsectPlan, Drawer> = {
  moth: drawMoth,
  beetle: drawBeetle,
  hoverer: drawHoverer,
  damsel: drawDamsel,
  skipper: drawSkipper,
};

// ── the 45° variants (heading ↘) — every pixel still on the grid ────────

function drawDamselDiag(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  if (m.longBody) px(ctx, pal.bodyDeep, 0, 0);
  px(ctx, pal.bodyDeep, 1, 1);
  px(ctx, pal.bodyDeep, 2, 2);
  px(ctx, pal.body, 3, 3);
  px(ctx, pal.bodyDeep, 4, 4);
  px(ctx, pal.eye, 5, 5);
  px(ctx, pal.marks[0], 2, 2); // the abdomen patch, as on the straight frame
  if (f === "perch") {
    px(ctx, pal.wing, 2, 1);
    px(ctx, pal.wing, 3, 2);
  } else if (f === "wingA") {
    px(ctx, pal.wing, 4, 2);
    px(ctx, pal.wing, 2, 4);
  } else {
    px(ctx, pal.wing, 5, 1);
    px(ctx, pal.wing, 1, 5);
    px(ctx, pal.wingDeep, 4, 2);
    px(ctx, pal.wingDeep, 2, 4);
  }
}

function drawSkipperDiag(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  px(ctx, pal.bodyDeep, 3, 3);
  px(ctx, pal.body, 4, 4);
  px(ctx, pal.eye, 5, 5);
  if (f === "perch") {
    px(ctx, pal.wing, 4, 2);
    px(ctx, pal.wing, 5, 1);
    px(ctx, pal.marks[0], 4, 2);
    return;
  }
  const swept = f === "wingB";
  px(ctx, pal.wing, 4, 2);
  px(ctx, pal.wing, 3, 2);
  px(ctx, pal.wing, 2, 4);
  px(ctx, pal.wing, 2, 3);
  if (!swept) {
    px(ctx, pal.wingDeep, 4, 1);
    px(ctx, pal.wingDeep, 1, 4);
    if (m.broad) {
      px(ctx, pal.wing, 3, 1);
      px(ctx, pal.wing, 1, 3);
    }
  }
  px(ctx, pal.marks[0], 3, 2);
  px(ctx, pal.marks[1], 2, 3);
}

// ── the one blit both the island and the bench use ──────────────────────
// Rotating plans snap to 8 headings: cardinals turn the straight frame by
// exact 90° steps, diagonals turn the hand-drawn 45° frame — so every pose
// stays pixel-true. Radial plans just face their flight (a horizontal flip).

const QUARTER = Math.PI / 2;

export function blitInsect(
  ctx: CanvasRenderingContext2D,
  set: InsectSpriteSet,
  x: number,
  y: number,
  frame: InsectFrame,
  heading: number,
  k = 1,
): void {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  let spr = set[frame];
  if (set.diag) {
    const oct = ((Math.round(heading / (Math.PI / 4)) % 8) + 8) % 8;
    if (oct % 2 === 1) {
      spr = set.diag[frame]; // the ↘ frame, turned to the other diagonals
      ctx.rotate(Math.floor(oct / 2) * QUARTER);
    } else {
      ctx.rotate((oct / 2) * QUARTER);
    }
  } else if (Math.cos(heading) < 0) {
    ctx.scale(-1, 1);
  }
  ctx.drawImage(spr, -INSECT_ANCHOR * k, -INSECT_ANCHOR * k, INSECT_SPRITE * k, INSECT_SPRITE * k);
  ctx.restore();
}

// ── the flight: dart-and-hover, with perching (pure math) ───────────────
// The dragonfly's loop, generalised: an insect dwells at a point, then darts
// (0.15–0.4 s) to the next, orbit-biased around the cloud centre. A fraction
// of each cloud are PERCHERS: every other beat they land on the host bloom's
// crown, fold their wings (the perch frame), then lift off — the thing that
// says "these visit flowers". Stateless and deterministic in (i, t), so the
// world, the bench and any test see the same insect at the same instant.

export interface FlightField {
  cx: number; // cloud centre (world/screen px — the caller's space)
  cy: number;
  homeX?: number; // the worked bloom's crown; enables perching
  homeY?: number;
  baseR: number; // scatter radius (cohesion already folded in by the caller)
  range: number; // 0..1 — how far the darts roam
  nerve: number; // 0..1 — bold insects perch longer
  calm?: boolean; // prefers-reduced-motion: hold a folded-wing pose
  salt?: number; // per-swarm identity so neighbouring clouds don't sync
}

export interface InsectPose {
  x: number;
  y: number;
  frame: InsectFrame;
  heading: number; // radians — the direction of the current/last dart
}

const PERCH_FRACTION = 0.34; // roughly a third of a cloud visits the bloom itself
const WING_HZ = 22; // wingbeats — a flicker, like the dragonfly's

function anchorOf(
  i: number,
  seg: number,
  f: FlightField,
  percher: boolean,
): { x: number; y: number } {
  const salt = f.salt ?? 0;
  if (percher && f.homeX !== undefined && f.homeY !== undefined && seg % 2 === 1) {
    // the perch: the bloom's crown, each insect on its own spot
    return {
      x: f.homeX + (hash2d(i, seg, salt ^ 0x9e11) - 0.5) * 5,
      y: f.homeY - 1 - hash2d(i, seg, salt ^ 0x9e12) * 3,
    };
  }
  const a = hash2d(i, seg, salt ^ 0x51a1) * Math.PI * 2;
  const r = f.baseR * (0.35 + hash2d(i, seg, salt ^ 0x51a2) * 0.65) * (0.7 + 0.6 * f.range);
  return { x: f.cx + Math.cos(a) * r, y: f.cy + Math.sin(a) * r * 0.82 };
}

export function insectPose(i: number, tS: number, f: FlightField): InsectPose {
  const salt = f.salt ?? 0;
  const canPerch = f.homeX !== undefined && f.homeY !== undefined;
  const percher = canPerch && hash2d(i, 0, salt ^ 0x9e10) < PERCH_FRACTION;
  const T = 0.9 + hash2d(i, 1, salt ^ 0x7071) * 1.1; // a flight beat
  const dart = 0.15 + hash2d(i, 2, salt ^ 0x7072) * 0.25; // the dash itself
  const perchT = percher ? T * (1.5 + 2.5 * f.nerve) : 0; // bold = a longer sit
  const period = T + perchT || T;

  if (f.calm) {
    // reduced motion: the cloud holds as a constellation — perchers seated on
    // the bloom, the rest resting at their stations, wings folded, no flicker
    const at = anchorOf(i, percher ? 1 : 0, f, percher);
    const next = anchorOf(i, percher ? 3 : 2, f, percher);
    return { x: at.x, y: at.y, frame: "perch", heading: Math.atan2(next.y - at.y, next.x - at.x) };
  }

  const t = tS + hash2d(i, 3, salt ^ 0x7073) * period; // desynchronise the cloud
  const cyc = Math.floor(t / period);
  const local = t - cyc * period;
  // two segments per period: flight (T), then — for perchers — the perch (perchT)
  const inFlight = !percher || local < T;
  const seg = cyc * 2 + (inFlight ? 0 : 1);
  const segDur = inFlight ? T : perchT;
  const phase = inFlight ? local : local - T;
  const cur = anchorOf(i, seg, f, percher);
  const nxt = anchorOf(i, seg + 1, f, percher);
  const heading = Math.atan2(nxt.y - cur.y, nxt.x - cur.x);
  const dwell = segDur - dart;
  let x: number;
  let y: number;
  let frame: InsectFrame;
  if (phase < dwell) {
    // dwelling: a hover-bob in the air, a stone-still fold on the bloom
    const perched = percher && !inFlight;
    x = cur.x + (perched ? 0 : Math.sin(t * 2.6 + i * 1.7) * 0.6);
    y = cur.y + (perched ? 0 : Math.cos(t * 2.1 + i * 2.3) * 0.5);
    frame = perched ? "perch" : Math.sin(t * WING_HZ + i) > 0 ? "wingA" : "wingB";
  } else {
    // the dart: a fast eased dash to the next station
    const u = (phase - dwell) / dart;
    const e = u * u * (3 - 2 * u);
    x = cur.x + (nxt.x - cur.x) * e;
    y = cur.y + (nxt.y - cur.y) * e;
    frame = Math.sin(t * WING_HZ * 1.5 + i) > 0 ? "wingA" : "wingB";
  }
  return { x, y, frame, heading };
}

// The one reduced-motion flag the swarm layers share (renderer + simulator).
export const CALM =
  typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
