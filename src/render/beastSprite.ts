import { Beast, beastSegments } from "../life/beast";
import { hsl } from "../life/genome";

// The beast is drawn directly (no cached sprite): a chain of soft round
// segments trailing the head, undulating because the path itself curves.
export function drawBeast(
  ctx: CanvasRenderingContext2D,
  b: Beast,
  camX: number,
  camY: number,
): void {
  const segs = beastSegments(b);
  const body = hsl(b.hue, 0.55, 0.62);
  const bodyDark = hsl(b.hue, 0.55, 0.5);
  const shadow = "rgba(0,0,0,0.18)";
  // shadow first, back to front
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    ctx.fillStyle = shadow;
    ctx.fillRect(
      Math.round(s.x - s.r - camX),
      Math.round(s.y - 1 - camY),
      Math.round(s.r * 2),
      2,
    );
  }
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i];
    const r = Math.max(1.5, s.r);
    const x = Math.round(s.x - r - camX);
    const y = Math.round(s.y - r * 2 - camY);
    const w = Math.round(r * 2);
    const h = Math.round(r * 1.7);
    ctx.fillStyle = i % 2 === 0 ? body : bodyDark;
    ctx.fillRect(x + 1, y, w - 2, h);
    ctx.fillRect(x, y + 1, w, h - 2);
  }
  // burrs riding in its coat: one bright fleck per carried seed, in the
  // seed's own color — visible the whole way, pickup to sowing
  for (let ci = 0; ci < b.cargo.length && ci + 1 < segs.length; ci++) {
    const s = segs[ci + 1];
    ctx.fillStyle = hsl(b.cargo[ci].genome.hue, 0.75, 0.7);
    ctx.fillRect(Math.round(s.x - camX), Math.round(s.y - s.r * 2 - camY) + 1, 1, 1);
  }
  // face on the head segment
  const head = segs[0];
  const hx = Math.round(head.x - camX);
  const hy = Math.round(head.y - head.r * 2 - camY);
  ctx.fillStyle = hsl(b.hue, 0.6, 0.2);
  ctx.fillRect(hx - 2, hy + 2, 1, 1);
  ctx.fillRect(hx + 1, hy + 2, 1, 1);
}
