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

// ── the body plans: five FAMILIES, seventeen FORMS ──────────────────────
//
// Two axes, the way a critter has a body-plan AND a coat. The FAMILY is the
// coarse kind the codex names a swarm by (a coined word + a bug-epithet cut
// from the family); it stays the five the game layer has always known, so a
// swarm is still a Moth, Beetle, Hoverer, Damsel or Skipper by name. The FORM
// is the silhouette actually drawn — seventeen of them now, a dozen new kinds
// (wasp, bumblebee, ladybird, firefly, cicada, lacewing, mayfly, leafhopper,
// weevil, mantis, walkingstick, midge) folded into the five families they most
// resemble, so the name always fits the creature and the island's insect life
// reads as varied as its critters and its flora. Behaviour tilts which form a
// swarm grows exactly the way habitat tilts a critter's body plan.

export type InsectPlan = "moth" | "beetle" | "hoverer" | "damsel" | "skipper";

export const INSECT_PLANS: readonly InsectPlan[] = [
  "moth", // broad twin wing quads over a short dark body
  "beetle", // a domed shining elytra; wings only flare in flight
  "hoverer", // a banded 2px bee-body on stubby blurring wings
  "damsel", // a needle body along the heading, narrow wing flickers
  "skipper", // compact swept triangle wings, quick and darty
];

export type InsectForm =
  | "moth" // broad twin wing quads over a short dark body, antennae ahead
  | "cicada" // stout body under broad clear roof-wings — bigger than a moth
  | "beetle" // a domed shining elytra; wings only flare in flight
  | "ladybird" // a rounder dome split by a seam, two genome spots — the classic
  | "firefly" // a soft beetle with a warm lantern pip that pulses (glows at night)
  | "weevil" // a humped beetle with a long snout jutting past the head
  | "hoverer" // a banded 2px bee-body on stubby blurring wings
  | "wasp" // a thin waisted body, pointed sting, swept wings — bold
  | "bumblebee" // a fat round fuzzy body on stubby wings — a cluster-lover
  | "midge" // the tiniest speck, a haze of wing and dangling legs
  | "damsel" // a needle body along the heading, narrow wing flickers
  | "lacewing" // a slender body under long gauzy tent-wings — delicate
  | "mayfly" // a slender body, an upright wing-sail, three trailing tail threads
  | "skipper" // compact swept triangle wings, quick and darty
  | "leafhopper" // an angular wedge with a tight roof of wings, a jumping spur
  | "mantis" // a long thorax, a triangular head, raptorial forelegs raised
  | "walkingstick"; // a thin long twig, near-wingless, leg-nubs — mostly perched

export const INSECT_FORMS: readonly InsectForm[] = [
  "moth", "cicada",
  "beetle", "ladybird", "firefly", "weevil",
  "hoverer", "wasp", "bumblebee", "midge",
  "damsel", "lacewing", "mayfly",
  "skipper", "leafhopper", "mantis", "walkingstick",
];

// which family names each form — the codex epithet a swarm of this form wears.
// Every form sits under the family it most resembles, so the name never lies.
export const FORM_FAMILY: Record<InsectForm, InsectPlan> = {
  moth: "moth",
  cicada: "moth",
  beetle: "beetle",
  ladybird: "beetle",
  firefly: "beetle",
  weevil: "beetle",
  hoverer: "hoverer",
  wasp: "hoverer",
  bumblebee: "hoverer",
  midge: "hoverer",
  damsel: "damsel",
  lacewing: "damsel",
  mayfly: "damsel",
  skipper: "skipper",
  leafhopper: "skipper",
  mantis: "skipper",
  walkingstick: "skipper",
};

export interface InsectMorph {
  plan: InsectPlan; // the codex family (naming) — one of the five
  form: InsectForm; // the silhouette actually drawn — one of the seventeen
  broad: boolean; // an extra pixel of wingspan
  longBody: boolean; // an extra abdomen pixel (needle forms wear it best)
}

const r3 = (v: number): number => Math.round(v * 1000);

function mixHash(h: number, v: number): number {
  h = Math.imul(h ^ v, 0x85ebca6b);
  h ^= h >>> 13;
  return (Math.imul(h, 0xc2b2ae35) ^ (h >>> 16)) | 0;
}

// The insect genome from the swarm's heritable behaviour, the way morphOf
// grows a critter from its four remembered numbers: one hash, one frozen roll
// order (form, then broad, then longBody — every kind draws the same count, so
// a remembered swarm keeps its face). Behaviour tilts the dice the way habitat
// tilts critter body plans:
//   tight cohesion  → the clusterers: beetle, ladybird, bumblebee, hoverer
//   wide range      → the long-winged roamers: moth, cicada, damsel, lacewing, mayfly
//   bold nerve      → the darters & hunters: skipper, wasp, mantis, leafhopper
//   mild nerve      → the gentle drifters: hoverer, bumblebee, walkingstick
//   low everything  → the specks: midge (a swarm of nearly-dust)
// The rolled FORM decides the silhouette; its FAMILY (for the codex name)
// falls out of FORM_FAMILY, so a wasp is still named a Hoverer, honestly.
export function insectMorphOf(behavior: BehaviorGenes): InsectMorph {
  let h = 0x15ec7;
  h = mixHash(h, r3(behavior.range));
  h = mixHash(h, r3(behavior.nerve));
  h = mixHash(h, r3(behavior.cohesion));
  const r = makeRng(h >>> 0);
  const pool: InsectForm[] = [...INSECT_FORMS];
  if (behavior.cohesion > 0.6) pool.push("beetle", "ladybird", "bumblebee", "hoverer");
  if (behavior.cohesion < 0.4) pool.push("damsel", "lacewing", "skipper", "mayfly");
  if (behavior.range > 0.6) pool.push("moth", "cicada", "damsel", "lacewing", "mayfly");
  if (behavior.range < 0.4) pool.push("beetle", "weevil", "leafhopper");
  if (behavior.nerve > 0.6) pool.push("skipper", "wasp", "mantis", "leafhopper");
  if (behavior.nerve < 0.4) pool.push("hoverer", "bumblebee", "walkingstick");
  if (behavior.range < 0.4 && behavior.nerve < 0.4 && behavior.cohesion < 0.4)
    pool.push("midge", "midge");
  const form = pool[Math.floor(r() * pool.length)];
  const broad = r() < 0.4 + behavior.range * 0.3;
  const longBody = r() < 0.35;
  return { plan: FORM_FAMILY[form], form, broad, longBody };
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
  lantern: string; // a firefly's warm lantern (a fixed species tell, like the eye)
  lanternDim: string; // its off-beat — the two make the glow pulse
}

// the firefly's lantern: a warm yellow-green, fixed like the dark eye pixel, so
// the one glowing form reads as itself day or night while the rest of the body
// still wears the genome. The night-only ember-glow the world already lays over
// every insect makes it truly luminous after dark.
const LANTERN = "hsl(72, 92%, 66%)";
const LANTERN_DIM = "hsl(58, 74%, 42%)";

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
    lantern: LANTERN,
    lanternDim: LANTERN_DIM,
  };
}

// ── the sprite cache ────────────────────────────────────────────────────

export const INSECT_SPRITE = 7; // canvas edge, world px
export const INSECT_ANCHOR = 3; // the insect's centre within it

export interface InsectSpriteSet {
  plan: InsectPlan; // the codex family
  form: InsectForm; // the silhouette these frames were drawn from
  wingA: HTMLCanvasElement; // wings spread
  wingB: HTMLCanvasElement; // mid-beat
  perch: HTMLCanvasElement; // wings folded, sitting on a bloom
  // the needle / twig forms fly along their heading; a hand-drawn 45° variant
  // keeps every octant on the pixel grid (90° turns are exact, so 4+4 covers 8)
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
    form: morph.form,
    wingA: drawInsect(morph, pal, "wingA"),
    wingB: drawInsect(morph, pal, "wingB"),
    perch: drawInsect(morph, pal, "perch"),
  };
  const diagDraw = DIAG_DRAWERS[morph.form];
  if (diagDraw) {
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
  DRAWERS[m.form](ctx, m, pal, frame);
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

// stout body under broad, clear roof-wings — bigger and glassier than a moth
function drawCicada(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  // the stout two-row body
  px(ctx, pal.bodyDeep, 2, 3);
  px(ctx, pal.body, 3, 3);
  px(ctx, pal.body, 4, 3);
  px(ctx, pal.bodyDeep, 3, 4); // a heavy belly
  px(ctx, pal.eye, 5, 3);
  px(ctx, pal.eye, 5, 4); // wide-set cicada eyes
  if (f === "perch") {
    // clear wings tented steep over the back
    px(ctx, pal.wing, 2, 2);
    px(ctx, pal.wing, 3, 2);
    px(ctx, pal.wingDeep, 4, 2);
    px(ctx, pal.marks[0], 3, 2);
    return;
  }
  // broad clear forewings — a glassy sheen over faint veins
  const spread = f === "wingA";
  for (const dy of [-1, 1]) {
    const yNear = 3 + dy;
    const yFar = 3 + dy * 2;
    px(ctx, pal.wing, 2, yNear);
    px(ctx, pal.wing, 3, yNear);
    px(ctx, pal.bodyLight, 2, yNear); // the clear-wing glint
    if (spread) {
      px(ctx, pal.wing, 1, yFar);
      px(ctx, pal.wingDeep, 1, yNear);
      if (m.broad) px(ctx, pal.wing, 0, yFar);
    }
  }
  px(ctx, pal.marks[0], 3, 1);
  px(ctx, pal.marks[0], 3, 5);
}

// a rounder dome split by a seam, two genome spots — the ladybird
function drawLadybird(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  if (f !== "perch") {
    px(ctx, pal.wing, f === "wingA" ? 2 : 3, 1);
    px(ctx, pal.wing, f === "wingA" ? 2 : 3, 5);
  }
  // the round dome: lit crown, body row, shaded skirt
  for (let x = 2; x <= 4; x++) {
    px(ctx, pal.bodyLight, x, 2);
    px(ctx, pal.body, x, 3);
    px(ctx, pal.bodyDeep, x, 4);
  }
  // the elytra seam, straight down the back
  px(ctx, pal.bodyDeep, 3, 2);
  px(ctx, pal.bodyDeep, 3, 3);
  px(ctx, pal.bodyDeep, 3, 4);
  // the spots — a symmetric pair from one genome cell reads unmistakably ladybird
  px(ctx, pal.marks[0], 2, 3);
  px(ctx, pal.marks[0], 4, 3);
  px(ctx, pal.marks[1], 3, 2); // and a crown spot when the cell is coloured
  // the little dark head poking out front
  px(ctx, pal.eye, 5, 3);
  px(ctx, pal.bodyDeep, 5, 2);
}

// a soft beetle with a warm lantern pip that pulses — glows after dark
function drawFirefly(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  // the soft elongate body under a pronotum hood that shades the head
  px(ctx, pal.bodyDeep, 2, 3);
  px(ctx, pal.body, 3, 3);
  px(ctx, pal.bodyLight, 4, 3);
  px(ctx, pal.bodyDeep, 5, 2); // the hood
  px(ctx, pal.bodyDeep, 5, 3);
  // the lantern at the abdomen tip — bright on the A beat, dim on the B beat,
  // so the wing flicker reads as a pulsing glow (the night ember-glow finishes it)
  const lit = f === "wingB" ? pal.lanternDim : pal.lantern;
  px(ctx, lit, 1, 3);
  if (f === "wingA") px(ctx, pal.lanternDim, 0, 3); // a longer flare at the peak
  if (f === "perch") {
    px(ctx, pal.wing, 3, 2);
    return;
  }
  // soft wing flares under the elytra
  px(ctx, pal.wing, f === "wingA" ? 2 : 3, 1);
  px(ctx, pal.wing, f === "wingA" ? 2 : 3, 5);
  px(ctx, pal.marks[0], 3, 2);
}

// a humped beetle with a long snout jutting past the head — the weevil
function drawWeevil(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  // the humped body
  px(ctx, pal.bodyLight, 2, 2);
  px(ctx, pal.bodyLight, 3, 2);
  px(ctx, pal.body, 2, 3);
  px(ctx, pal.body, 3, 3);
  px(ctx, pal.bodyDeep, 2, 4);
  px(ctx, pal.bodyDeep, 3, 4);
  px(ctx, pal.eye, 4, 3); // the small head
  // the long snout (rostrum) — the weevil's whole tell
  px(ctx, pal.bodyDeep, 5, 3);
  px(ctx, pal.bodyDeep, 6, 3);
  px(ctx, pal.bodyLight, 5, 2); // the elbowed antenna on the snout
  px(ctx, pal.marks[0], 2, 3);
  px(ctx, pal.marks[1], 3, 2);
  if (f !== "perch") {
    px(ctx, pal.wing, f === "wingA" ? 2 : 3, 1);
    px(ctx, pal.wing, f === "wingA" ? 2 : 3, 5);
  }
}

// a thin waisted body, a pointed sting, swept wings — the wasp
function drawWasp(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  px(ctx, pal.bodyDeep, 0, 3); // the pointed sting
  px(ctx, pal.body, 1, 3); // the abdomen
  px(ctx, pal.marks[0], 1, 3); // its band
  px(ctx, pal.bodyDeep, 2, 3); // the pinched waist — dark and thin
  px(ctx, pal.body, 3, 3); // the thorax
  px(ctx, pal.eye, 4, 3); // the head
  px(ctx, pal.bodyLight, 5, 2); // an antenna
  if (f === "perch") {
    // wings laid flat back along the abdomen
    px(ctx, pal.wing, 2, 2);
    px(ctx, pal.wing, 1, 2);
    px(ctx, pal.marks[1], 1, 2);
    return;
  }
  // long wings swept back over the abdomen
  if (f === "wingA") {
    px(ctx, pal.wing, 3, 1);
    px(ctx, pal.wing, 3, 5);
    px(ctx, pal.wingDeep, 2, 1);
    px(ctx, pal.wingDeep, 2, 5);
    if (m.broad) {
      px(ctx, pal.wingDeep, 1, 1);
      px(ctx, pal.wingDeep, 1, 5);
    }
  } else {
    px(ctx, pal.wing, 2, 2);
    px(ctx, pal.wing, 2, 4);
  }
}

// a fat round fuzzy body on stubby wings — the bumblebee, a cluster-lover
function drawBumblebee(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  // a round three-wide, three-tall body
  for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) px(ctx, pal.body, x, y);
  px(ctx, pal.body, 1, 3); // a fat rear
  // fuzzy dither on the shoulders and the underside
  px(ctx, pal.bodyLight, 2, 2);
  px(ctx, pal.bodyLight, 4, 4);
  px(ctx, pal.bodyDeep, 2, 4);
  // the broad band across the middle — its markings when the genome carries them
  px(ctx, pal.marks[0] ?? pal.bodyDeep, 2, 3);
  px(ctx, pal.marks[0] ?? pal.bodyDeep, 3, 3);
  px(ctx, pal.marks[1] ?? pal.bodyDeep, 4, 3);
  px(ctx, pal.eye, 5, 3); // the little head
  if (f === "perch") {
    px(ctx, pal.wing, 3, 1);
    return;
  }
  // stubby wings blurring close over the back
  const wx = f === "wingA" ? 3 : 4;
  px(ctx, pal.wing, wx, 1);
  px(ctx, pal.wing, wx - 1, 1);
}

// the tiniest speck — a haze of wing and dangling legs, nearly dust itself
function drawMidge(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  px(ctx, pal.bodyDeep, 3, 3); // the whole body, one dark speck
  px(ctx, pal.eye, 4, 3); // and its head
  if (m.longBody) px(ctx, pal.bodyDeep, 2, 3);
  if (f === "perch") {
    px(ctx, pal.bodyLight, 3, 4); // legs tucked
    return;
  }
  // a faint wing haze flicking above then below, and long dangling legs
  px(ctx, pal.wing, 3, f === "wingA" ? 2 : 4);
  px(ctx, pal.bodyLight, 2, 4);
  px(ctx, pal.bodyLight, 4, 4);
}

// a slender body under long gauzy tent-wings — the lacewing, delicate
function drawLacewing(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  // a fine thread of a body
  px(ctx, pal.bodyDeep, 2, 3);
  px(ctx, pal.body, 3, 3);
  px(ctx, pal.eye, 5, 3);
  px(ctx, pal.marks[0], 5, 3); // lacewings' bright eye, when the genome tints it
  px(ctx, pal.bodyLight, 5, 2); // a long thread antenna
  if (f === "perch") {
    // wings folded to a delicate tent over the back
    px(ctx, pal.wing, 2, 2);
    px(ctx, pal.wing, 3, 2);
    px(ctx, pal.wing, 4, 2);
    px(ctx, pal.wingDeep, 3, 1);
    return;
  }
  // long gauzy wings — drawn as leading edges, hollow inside, so they read sheer
  if (f === "wingA") {
    px(ctx, pal.wing, 2, 1);
    px(ctx, pal.wing, 3, 1);
    px(ctx, pal.wing, 4, 2);
    px(ctx, pal.wing, 2, 5);
    px(ctx, pal.wing, 3, 5);
    px(ctx, pal.wing, 4, 4);
    px(ctx, pal.wingDeep, 3, 2);
    px(ctx, pal.wingDeep, 3, 4);
    if (m.broad) {
      px(ctx, pal.wing, 1, 2);
      px(ctx, pal.wing, 1, 4);
    }
  } else {
    px(ctx, pal.wing, 3, 1);
    px(ctx, pal.wing, 4, 2);
    px(ctx, pal.wing, 3, 5);
    px(ctx, pal.wing, 4, 4);
  }
}

// a slender body, an upright wing-sail, three trailing tail threads — the mayfly
function drawMayfly(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  // the slender body
  px(ctx, pal.bodyDeep, 2, 3);
  px(ctx, pal.body, 3, 3);
  px(ctx, pal.body, 4, 3);
  px(ctx, pal.eye, 5, 3);
  // the three long tail filaments trailing behind — the mayfly's signature
  px(ctx, pal.bodyLight, 1, 2);
  px(ctx, pal.bodyLight, 1, 3);
  px(ctx, pal.bodyLight, 1, 4);
  px(ctx, pal.bodyLight, 0, 3); // the centre thread, longest
  px(ctx, pal.marks[0], 3, 3); // the abdomen wears its flower-patch
  if (f === "perch") {
    // wings held straight up, sail folded together
    px(ctx, pal.wing, 3, 2);
    px(ctx, pal.wing, 3, 1);
    return;
  }
  // the upright wing-sail rising over the thorax
  px(ctx, pal.wing, 3, 2);
  px(ctx, pal.wing, 3, 1);
  if (f === "wingA") {
    px(ctx, pal.wingDeep, 4, 1);
    if (m.broad) px(ctx, pal.wing, 4, 2);
  } else {
    px(ctx, pal.wing, 2, 2); // the sail dips forward on the beat
  }
}

// an angular wedge with a tight roof of wings and a jumping spur — the leafhopper
function drawLeafhopper(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  // the wedge: broad at the tail, narrowing to a pointed head
  px(ctx, pal.bodyDeep, 2, 2);
  px(ctx, pal.body, 2, 3);
  px(ctx, pal.bodyDeep, 2, 4);
  px(ctx, pal.body, 3, 3);
  px(ctx, pal.body, 4, 3);
  px(ctx, pal.eye, 5, 3); // the pointed face
  px(ctx, pal.bodyDeep, 2, 5); // the jumping spur below the tail
  px(ctx, pal.marks[0], 3, 3);
  if (f === "perch") {
    // a steep tight roof of wings, a bright keel line
    px(ctx, pal.wing, 3, 2);
    px(ctx, pal.wingDeep, 3, 1);
    px(ctx, pal.marks[1], 3, 2);
    return;
  }
  // the roof lifts a little to beat
  if (f === "wingA") {
    px(ctx, pal.wing, 2, 1);
    px(ctx, pal.wing, 3, 2);
    px(ctx, pal.wing, 3, 4);
    if (m.broad) px(ctx, pal.wingDeep, 1, 1);
  } else {
    px(ctx, pal.wing, 3, 2);
    px(ctx, pal.wing, 3, 4);
  }
}

// a long thorax, a triangular head, raptorial forelegs raised — the mantis
function drawMantis(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  // the long thorax and abdomen
  px(ctx, pal.bodyDeep, 1, 3);
  px(ctx, pal.body, 2, 3);
  px(ctx, pal.body, 3, 3);
  if (m.longBody) px(ctx, pal.bodyDeep, 0, 3);
  // the triangular head with its wide eyes, tilted up and forward
  px(ctx, pal.body, 4, 3);
  px(ctx, pal.eye, 5, 3);
  px(ctx, pal.eye, 5, 2);
  // the raptorial forelegs, folded and raised toward the head — the tell
  px(ctx, pal.bodyLight, 4, 2);
  px(ctx, pal.body, 4, 1);
  px(ctx, pal.marks[0], 3, 2);
  if (f === "perch") {
    // wings folded sleek along the back — how a mantis is nearly always seen
    px(ctx, pal.wing, 2, 2);
    px(ctx, pal.wing, 3, 2);
    return;
  }
  // the rarer flight: broad wings flaring under the long body
  if (f === "wingA") {
    px(ctx, pal.wing, 2, 1);
    px(ctx, pal.wing, 3, 1);
    px(ctx, pal.wing, 2, 5);
    px(ctx, pal.wing, 3, 5);
  } else {
    px(ctx, pal.wing, 2, 2);
    px(ctx, pal.wing, 2, 4);
  }
}

// a thin long twig, near-wingless, with leg-nubs — the walkingstick, a rotating
// form so its long body always lies along the heading (drawn ↘ in the diag)
function drawWalkingstick(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  // the twig body, a long thin line along the travel axis
  if (m.longBody) px(ctx, pal.bodyDeep, 0, 3);
  px(ctx, pal.bodyDeep, 1, 3);
  px(ctx, pal.body, 2, 3);
  px(ctx, pal.body, 3, 3);
  px(ctx, pal.body, 4, 3);
  px(ctx, pal.eye, 5, 3);
  // spindly leg-nubs, splayed fore and aft
  px(ctx, pal.bodyLight, 1, 2);
  px(ctx, pal.bodyLight, 2, 4);
  px(ctx, pal.bodyLight, 3, 2);
  px(ctx, pal.bodyLight, 4, 4);
  px(ctx, pal.marks[0], 3, 3);
  // near-wingless: only a whisper of wing while it beats along
  if (f === "wingA") px(ctx, pal.wing, 2, 2);
  else if (f === "wingB") px(ctx, pal.wing, 3, 4);
}

const DRAWERS: Record<InsectForm, Drawer> = {
  moth: drawMoth,
  cicada: drawCicada,
  beetle: drawBeetle,
  ladybird: drawLadybird,
  firefly: drawFirefly,
  weevil: drawWeevil,
  hoverer: drawHoverer,
  wasp: drawWasp,
  bumblebee: drawBumblebee,
  midge: drawMidge,
  damsel: drawDamsel,
  lacewing: drawLacewing,
  mayfly: drawMayfly,
  skipper: drawSkipper,
  leafhopper: drawLeafhopper,
  mantis: drawMantis,
  walkingstick: drawWalkingstick,
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

// the walkingstick laid along the ↘ diagonal — the twig turned onto the grid
function drawWalkingstickDiag(ctx: CanvasRenderingContext2D, m: InsectMorph, pal: InsectPalette, f: InsectFrame): void {
  if (m.longBody) px(ctx, pal.bodyDeep, 0, 0);
  px(ctx, pal.bodyDeep, 1, 1);
  px(ctx, pal.body, 2, 2);
  px(ctx, pal.body, 3, 3);
  px(ctx, pal.body, 4, 4);
  px(ctx, pal.eye, 5, 5);
  // leg-nubs splayed to either side of the twig
  px(ctx, pal.bodyLight, 2, 1);
  px(ctx, pal.bodyLight, 1, 2);
  px(ctx, pal.bodyLight, 4, 3);
  px(ctx, pal.bodyLight, 3, 4);
  px(ctx, pal.marks[0], 3, 3);
  if (f === "wingA") px(ctx, pal.wing, 3, 1);
  else if (f === "wingB") px(ctx, pal.wing, 4, 2);
}

// the rotating forms (needle / twig bodies) and their hand-drawn 45° twins.
// This map is the single source of truth: a form rotates along its heading iff
// it has a diagonal drawer here; the radial forms draw axis-aligned and flip.
const DIAG_DRAWERS: Partial<Record<InsectForm, Drawer>> = {
  damsel: drawDamselDiag,
  skipper: drawSkipperDiag,
  walkingstick: drawWalkingstickDiag,
};

// derived so it can never drift from the map above
export const ROTATING_FORMS: ReadonlySet<InsectForm> = new Set(
  Object.keys(DIAG_DRAWERS) as InsectForm[],
);

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
