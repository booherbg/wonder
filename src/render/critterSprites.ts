import { CritterSpecies } from "../life/fauna";
import { hsl } from "../life/genome";

export const CRITTER_ANCHOR_X = 8;
export const CRITTER_ANCHOR_Y = 14;

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
// long after the living list is gone.
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

// A round pastel friend: body, belly, ears, tail, dot eyes. Faces right.
function drawCritter(sp: CritterBody, hop: boolean, blink = false): HTMLCanvasElement {
  const [c, ctx] = makeCanvas();
  const s = sp.size;
  const bodyW = Math.round(7 * s) + 2;
  const bodyH = Math.round(5 * s) + 2;
  const bodyX = 8 - Math.floor(bodyW / 2);
  const squash = hop ? 1 : 0;
  const bodyY = 14 - bodyH + squash;
  const body = hsl(sp.bodyHue, 0.45, 0.72);
  const bodyDark = hsl(sp.bodyHue, 0.45, 0.6);
  const belly = hsl(sp.bodyHue, 0.35, 0.86);
  const dark = hsl(sp.bodyHue, 0.5, 0.25);

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.fillRect(bodyX + 1, 14, bodyW - 2, 1);
  // tail (behind, to the left)
  const tailLen = 1 + Math.round(sp.tailLen * 3);
  ctx.fillStyle = bodyDark;
  ctx.fillRect(bodyX - tailLen, bodyY + 1 + (hop ? 1 : 0), tailLen, 2);
  // body with rounded corners
  ctx.fillStyle = body;
  ctx.fillRect(bodyX + 1, bodyY - squash, bodyW - 2, bodyH);
  ctx.fillRect(bodyX, bodyY + 1 - squash, bodyW, bodyH - 2);
  // belly
  ctx.fillStyle = belly;
  ctx.fillRect(bodyX + 2, bodyY + Math.floor(bodyH / 2), bodyW - 4, Math.ceil(bodyH / 2) - 1);
  // ears
  const earH = 1 + Math.round(sp.earLen * 4) - (hop ? 1 : 0);
  const earY = bodyY - Math.max(1, earH) - squash;
  ctx.fillStyle = body;
  ctx.fillRect(bodyX + 2, earY, 2, Math.max(1, earH) + 1);
  ctx.fillRect(bodyX + bodyW - 4, earY, 2, Math.max(1, earH) + 1);
  ctx.fillStyle = hsl(0.98, 0.5, 0.8);
  ctx.fillRect(bodyX + 2, earY + 1, 1, 1);
  ctx.fillRect(bodyX + bodyW - 4, earY + 1, 1, 1);
  // face (right side); blinking critters close their eyes for a frame
  if (!blink) {
    ctx.fillStyle = dark;
    ctx.fillRect(bodyX + bodyW - 3, bodyY + 2 - squash, 1, 1); // eye
    ctx.fillRect(bodyX + Math.floor(bodyW / 2), bodyY + 2 - squash, 1, 1); // other eye
  }
  ctx.fillStyle = hsl(0.98, 0.6, 0.6);
  ctx.fillRect(bodyX + bodyW - 1, bodyY + 3 - squash, 1, 1); // nose
  // feet
  ctx.fillStyle = bodyDark;
  ctx.fillRect(bodyX + 2, 13 + squash, 2, 1);
  ctx.fillRect(bodyX + bodyW - 4, 13 + squash, 2, 1);
  return c;
}

// A little earthen burrow mound with a dark doorway.
function drawDen(sp: CritterSpecies): HTMLCanvasElement {
  const [c, ctx] = makeCanvas();
  const earth = "hsl(28, 30%, 38%)";
  const earthDark = "hsl(28, 32%, 30%)";
  for (let row = 0; row < 6; row++) {
    const w = 12 * Math.sqrt((row + 1) / 6);
    ctx.fillStyle = row < 2 ? earthDark : earth;
    ctx.fillRect(Math.round(8 - w / 2), 8 + row, Math.round(w), 1);
  }
  ctx.fillStyle = "hsl(20, 30%, 12%)";
  ctx.fillRect(6, 11, 4, 3); // doorway
  ctx.fillStyle = hsl(sp.bodyHue, 0.4, 0.6);
  ctx.fillRect(5, 9, 1, 1); // a tuft of fur caught on the mound
  return c;
}
