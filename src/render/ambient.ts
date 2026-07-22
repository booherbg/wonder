import { Rng, hash2d, makeRng } from "../core/rng";
import { Plant } from "../life/flora";
import { PlantForm, hsl } from "../life/genome";
import { TILE_SIZE } from "../world/config";
import { Tile, WorldMap } from "../world/types";

// The bloom rule — the plants that carry a flower worth working: flowers
// always, shrubs carry blossom among the berries, succulents only once the
// genome has sent up its bloom spike (the same rule the sprite uses). Trees,
// ferns, fungi and coral hold nothing to sip. Now the shared test the insect
// SWARMS (game/swarms.ts) home on — the real pollinators; the decorative
// butterflies that used to sip here have been retired in their favour.
export function isBloom(p: Plant): boolean {
  switch (p.genome.form) {
    case PlantForm.Flower:
    case PlantForm.Shrub:
      return true;
    case PlantForm.Succulent:
      return p.genome.petals >= 8 || p.genome.glow > 0.8;
    default:
      return false;
  }
}

interface Fish {
  x: number;
  y: number;
  heading: number;
  speed: number;
  turn: number;
  dart: number; // seconds of fleeing left
}

const MAX_FISH = 8;

// Dark little shapes gliding in the shallows; they scatter when you wade in.
export class FishSchool {
  private fish: Fish[] = [];
  private rng: Rng = makeRng(0xf15f);
  private lastMs = -1;

  update(
    map: WorldMap,
    viewX: number,
    viewY: number,
    viewW: number,
    viewH: number,
    player: { x: number; y: number } | null,
    timeMs: number,
  ): void {
    const dt = this.lastMs < 0 ? 0.016 : Math.min((timeMs - this.lastMs) / 1000, 0.1);
    this.lastMs = timeMs;

    this.fish = this.fish.filter(
      (f) =>
        f.x > viewX - 40 && f.x < viewX + viewW + 40 && f.y > viewY - 40 && f.y < viewY + viewH + 40,
    );

    if (this.fish.length < MAX_FISH) {
      const tx = Math.floor((viewX + this.rng() * viewW) / TILE_SIZE);
      const ty = Math.floor((viewY + this.rng() * viewH) / TILE_SIZE);
      if (
        tx >= 0 && ty >= 0 && tx < map.width && ty < map.height &&
        map.tiles[ty * map.width + tx] === Tile.ShallowWater
      ) {
        this.fish.push({
          x: (tx + 0.5) * TILE_SIZE,
          y: (ty + 0.5) * TILE_SIZE,
          heading: this.rng() * 6.28,
          speed: 8 + this.rng() * 8,
          turn: (this.rng() - 0.5) * 1.2,
          dart: 0,
        });
      }
    }

    for (const f of this.fish) {
      if (player && f.dart <= 0 && Math.hypot(player.x - f.x, player.y - f.y) < 26) {
        f.dart = 0.6;
        f.heading = Math.atan2(f.y - player.y, f.x - player.x);
      }
      f.dart -= dt;
      if (this.rng() < 0.008) f.turn = (this.rng() - 0.5) * 1.4;
      f.heading += f.turn * dt;
      const sp = f.dart > 0 ? 85 : f.speed;
      const nx = f.x + Math.cos(f.heading) * sp * dt;
      const ny = f.y + Math.sin(f.heading) * sp * dt;
      const t =
        map.tiles[Math.floor(ny / TILE_SIZE) * map.width + Math.floor(nx / TILE_SIZE)];
      if (t === Tile.ShallowWater || t === Tile.DeepWater) {
        f.x = nx;
        f.y = ny;
      } else {
        f.heading += Math.PI; // nose the bank, turn back
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const f of this.fish) {
      const cs = Math.cos(f.heading);
      const sn = Math.sin(f.heading);
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = k === 0 ? "rgba(10, 26, 52, 0.6)" : "rgba(12, 32, 64, 0.45)";
        ctx.fillRect(
          Math.round(f.x - cs * k * 1.4 - camX),
          Math.round(f.y - sn * k * 1.4 - camY),
          1,
          1,
        );
      }
    }
  }
}

interface Frog {
  x: number;
  y: number;
  hue: number; // greens mostly, the odd oddball
  sitTime: number;
  hop: number; // seconds left in current hop
  hopDx: number;
  hopDy: number;
  plop: number; // >0: mid-escape into water; ripple countdown
}

const MAX_FROGS = 6;

// Pond-edge sitters. They idle, hop a little, and plop into the water
// when the wanderer comes too close, leaving rings behind.
export class FrogPatch {
  private frogs: Frog[] = [];
  private rng: Rng = makeRng(0xf406);
  private lastMs = -1;

  update(
    map: WorldMap,
    viewX: number,
    viewY: number,
    viewW: number,
    viewH: number,
    player: { x: number; y: number } | null,
    timeMs: number,
  ): void {
    const dt = this.lastMs < 0 ? 0.016 : Math.min((timeMs - this.lastMs) / 1000, 0.1);
    this.lastMs = timeMs;

    this.frogs = this.frogs.filter(
      (f) =>
        f.plop > -0.7 && // ripples done = gone
        f.x > viewX - 40 && f.x < viewX + viewW + 40 &&
        f.y > viewY - 40 && f.y < viewY + viewH + 40,
    );

    if (this.frogs.length < MAX_FROGS) {
      const tx = Math.floor((viewX + this.rng() * viewW) / TILE_SIZE);
      const ty = Math.floor((viewY + this.rng() * viewH) / TILE_SIZE);
      if (tx > 0 && ty > 0 && tx < map.width - 1 && ty < map.height - 1) {
        const here = map.tiles[ty * map.width + tx];
        const bankside =
          (here === Tile.Marsh || here === Tile.Grass || here === Tile.Sand) &&
          [[1, 0], [-1, 0], [0, 1], [0, -1]].some(
            ([dx, dy]) => map.tiles[(ty + dy) * map.width + (tx + dx)] === Tile.ShallowWater,
          );
        if (bankside) {
          this.frogs.push({
            x: (tx + 0.5) * TILE_SIZE,
            y: (ty + 0.5) * TILE_SIZE,
            hue: this.rng() < 0.85 ? 0.3 + this.rng() * 0.12 : this.rng(),
            sitTime: 1 + this.rng() * 4,
            hop: 0,
            hopDx: 0,
            hopDy: 0,
            plop: 0,
          });
        }
      }
    }

    for (const f of this.frogs) {
      if (f.plop !== 0) {
        f.plop -= dt;
        if (f.plop > 0) {
          f.x += f.hopDx * dt * 3;
          f.y += f.hopDy * dt * 3;
        }
        continue;
      }
      if (player && Math.hypot(player.x - f.x, player.y - f.y) < 22) {
        // find the water and leap for it
        const tx = Math.floor(f.x / TILE_SIZE);
        const ty = Math.floor(f.y / TILE_SIZE);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (map.tiles[(ty + dy) * map.width + (tx + dx)] === Tile.ShallowWater) {
            f.hopDx = dx * TILE_SIZE * 0.4;
            f.hopDy = dy * TILE_SIZE * 0.4;
            break;
          }
        }
        f.plop = 0.35; // leap, then ripples while plop in (-0.7, 0)
        continue;
      }
      if (f.hop > 0) {
        f.hop -= dt;
        f.x += f.hopDx * dt;
        f.y += f.hopDy * dt;
      } else {
        f.sitTime -= dt;
        if (f.sitTime <= 0) {
          const a = this.rng() * 6.28;
          f.hopDx = Math.cos(a) * 20;
          f.hopDy = Math.sin(a) * 20;
          f.hop = 0.3;
          f.sitTime = 2 + this.rng() * 5;
        }
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const f of this.frogs) {
      const x = Math.round(f.x - camX);
      const y = Math.round(f.y - camY);
      if (f.plop < 0) {
        // rings spreading where it went under
        const r = Math.round((0.7 + f.plop) * 8) + 2;
        ctx.strokeStyle = `rgba(220, 240, 255, ${(0.5 * (1 + f.plop / 0.7)).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(x - r, y - Math.round(r * 0.6), r * 2, Math.round(r * 1.2));
        continue;
      }
      const lift = f.hop > 0 || f.plop > 0 ? 2 : 0;
      ctx.fillStyle = hsl(f.hue, 0.55, 0.4);
      ctx.fillRect(x - 1, y - 2 - lift, 3, 2);
      ctx.fillStyle = hsl(f.hue, 0.55, 0.55);
      ctx.fillRect(x - 1, y - 3 - lift, 1, 1); // eye bump
      ctx.fillRect(x + 1, y - 3 - lift, 1, 1);
    }
  }
}

interface Dragonfly {
  x: number;
  y: number;
  heading: number;
  hue: number; // jewel tones: teal through violet
  hover: number; // seconds left holding still in the air
  dart: number; // seconds left of the straight fast dash
  phase: number;
}

const MAX_DRAGONFLIES = 5;
const DART_SPEED = 85;

// Day hunters over the water: they hang motionless, then dash in a straight
// line and stop dead, wings flickering white. They sleep somewhere at night.
export class Dragonflies {
  private flies: Dragonfly[] = [];
  private rng: Rng = makeRng(0xd7a9);
  private lastMs = -1;

  update(
    map: WorldMap,
    viewX: number,
    viewY: number,
    viewW: number,
    viewH: number,
    darkness: number,
    timeMs: number,
  ): void {
    const dt = this.lastMs < 0 ? 0.016 : Math.min((timeMs - this.lastMs) / 1000, 0.1);
    this.lastMs = timeMs;
    if (darkness > 0.45) {
      this.flies.length = 0;
      return;
    }

    this.flies = this.flies.filter(
      (f) =>
        f.x > viewX - 40 && f.x < viewX + viewW + 40 && f.y > viewY - 40 && f.y < viewY + viewH + 40,
    );

    if (this.flies.length < MAX_DRAGONFLIES) {
      const tx = Math.floor((viewX + this.rng() * viewW) / TILE_SIZE);
      const ty = Math.floor((viewY + this.rng() * viewH) / TILE_SIZE);
      if (tx >= 0 && ty >= 0 && tx < map.width && ty < map.height) {
        const t = map.tiles[ty * map.width + tx];
        if (t === Tile.ShallowWater || t === Tile.Marsh) {
          this.flies.push({
            x: (tx + 0.5) * TILE_SIZE,
            y: (ty + 0.5) * TILE_SIZE,
            heading: this.rng() * 6.28,
            hue: 0.45 + this.rng() * 0.4,
            hover: 0.5 + this.rng() * 1.5,
            dart: 0,
            phase: this.rng() * 6.28,
          });
        }
      }
    }

    for (const f of this.flies) {
      f.phase += dt * 40; // wings are nearly a blur
      if (f.hover > 0) {
        f.hover -= dt;
        f.x += Math.sin(f.phase / 9) * 2 * dt; // holding, not frozen
        f.y += Math.cos(f.phase / 7) * 2 * dt;
        if (f.hover <= 0) {
          f.heading = this.rng() * 6.28;
          f.dart = 0.15 + this.rng() * 0.3;
        }
      } else {
        f.dart -= dt;
        const nx = f.x + Math.cos(f.heading) * DART_SPEED * dt;
        const ny = f.y + Math.sin(f.heading) * DART_SPEED * dt;
        const t =
          map.tiles[Math.floor(ny / TILE_SIZE) * map.width + Math.floor(nx / TILE_SIZE)];
        if (t === Tile.ShallowWater || t === Tile.Marsh || t === Tile.Grass || t === Tile.Sand) {
          f.x = nx;
          f.y = ny;
        } else {
          f.heading += Math.PI; // the water is home; turn back toward it
        }
        if (f.dart <= 0) f.hover = 0.5 + this.rng() * 1.5;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number): void {
    for (const f of this.flies) {
      const x = Math.round(f.x - camX);
      const y = Math.round(f.y - camY);
      const cs = Math.cos(f.heading);
      const sn = Math.sin(f.heading);
      // long body, three pixels along the heading
      ctx.fillStyle = hsl(f.hue, 0.85, 0.55);
      for (let k = -1; k <= 1; k++) {
        ctx.fillRect(Math.round(x + cs * k * 1.2), Math.round(y + sn * k * 1.2), 1, 1);
      }
      // wing pairs flicker perpendicular to the body
      const flick = Math.sin(f.phase) > 0 ? 1 : 2;
      ctx.fillStyle = "rgba(255, 255, 255, 0.65)";
      ctx.fillRect(Math.round(x - sn * flick), Math.round(y + cs * flick), 1, 1);
      ctx.fillRect(Math.round(x + sn * flick), Math.round(y - cs * flick), 1, 1);
    }
  }
}

// A few slow cloud shadows crossing the island; they fade out toward night.
const CLOUDS = [
  { r: 95, speed: 3.4, ox: 0, oy: 1200 },
  { r: 140, speed: 2.5, ox: 900, oy: 300 },
  { r: 75, speed: 4.1, ox: 2400, oy: 2000 },
  { r: 115, speed: 2.9, ox: 3600, oy: 3300 },
];

export function drawClouds(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  worldW: number,
  worldH: number,
  darkness: number,
  timeMs: number,
): void {
  const alpha = 0.09 * (1 - darkness);
  if (alpha < 0.01) return;
  for (const c of CLOUDS) {
    const wx = ((c.ox + (timeMs / 1000) * c.speed) % (worldW + 600)) - 300;
    const wy = ((c.oy + (timeMs / 1000) * c.speed * 0.35) % (worldH + 600)) - 300;
    const sx = wx - camX;
    const sy = wy - camY;
    if (sx < -c.r || sx > viewW + c.r || sy < -c.r || sy > viewH + c.r) continue;
    const grad = ctx.createRadialGradient(sx, sy, c.r * 0.2, sx, sy, c.r);
    grad.addColorStop(0, `rgba(10, 16, 28, ${alpha.toFixed(3)})`);
    grad.addColorStop(1, "rgba(10, 16, 28, 0)");
    ctx.fillStyle = grad;
    ctx.fillRect(sx - c.r, sy - c.r, c.r * 2, c.r * 2);
  }
}

// ── foreground parallax ──────────────────────────────────────────────────────
// The nearest layer of the air: seed-fluff adrift just in front of the lens,
// and a couple of truly out-of-focus blurs behind it. Both live on virtual
// planes that slide faster than the ground when the camera moves — the
// whisper of parallax that gives the island a front and a behind. Fully
// deterministic: positions hash from plane cells, drift comes from time.

const MOTE_PARALLAX = 1.35; // how much faster than the world the fluff slides
const MOTE_CELL = 120; // one possible fluff per cell of the near plane
const BLUR_PARALLAX = 1.75; // the blurs sit nearer still
const BLUR_CELL = 340;

let blurMote: HTMLCanvasElement | null = null;
function getBlurMote(): HTMLCanvasElement {
  if (blurMote) return blurMote;
  const r = 13;
  const c = document.createElement("canvas");
  c.width = r * 2;
  c.height = r * 2;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(r, r, 1, r, r, r);
  grad.addColorStop(0, "rgba(216, 236, 190, 0.13)");
  grad.addColorStop(1, "rgba(216, 236, 190, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, r * 2, r * 2);
  blurMote = c;
  return c;
}

export function drawForegroundMotes(
  ctx: CanvasRenderingContext2D,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  darkness: number,
  rain: number,
  timeMs: number,
): void {
  const lit = (1 - darkness * 0.55) * (1 - rain * 0.6);
  if (lit <= 0.05) return;
  // the soft blurs first — the deepest of the near layer
  {
    const px = camX * BLUR_PARALLAX;
    const py = camY * BLUR_PARALLAX;
    const cx0 = Math.floor(px / BLUR_CELL) - 1;
    const cx1 = Math.floor((px + viewW) / BLUR_CELL) + 1;
    const cy0 = Math.floor(py / BLUR_CELL) - 1;
    const cy1 = Math.floor((py + viewH) / BLUR_CELL) + 1;
    const sprite = getBlurMote();
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const h1 = hash2d(cx, cy, 0xb10b);
        if (h1 < 0.62) continue; // most cells stay empty
        const h2 = hash2d(cy, cx, 0xb10b);
        const wx = cx * BLUR_CELL + h1 * BLUR_CELL + Math.sin(timeMs / 5100 + h2 * 6.28) * 9;
        const wy = cy * BLUR_CELL + h2 * BLUR_CELL + Math.cos(timeMs / 6700 + h1 * 6.28) * 7;
        ctx.globalAlpha = lit * (0.55 + 0.45 * Math.sin(timeMs / 3900 + h1 * 9));
        ctx.drawImage(sprite, Math.round(wx - px - 13), Math.round(wy - py - 13));
      }
    }
    ctx.globalAlpha = 1;
  }
  // then the fluff: a bright grain wearing a one-pixel haze of near-focus
  const px = camX * MOTE_PARALLAX;
  const py = camY * MOTE_PARALLAX;
  const cx0 = Math.floor(px / MOTE_CELL) - 1;
  const cx1 = Math.floor((px + viewW) / MOTE_CELL) + 1;
  const cy0 = Math.floor(py / MOTE_CELL) - 1;
  const cy1 = Math.floor((py + viewH) / MOTE_CELL) + 1;
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      const h1 = hash2d(cx, cy, 0x0f1f);
      if (h1 < 0.55) continue; // sparse — never a snowstorm
      const h2 = hash2d(cy, cx, 0x0f1f);
      const wx =
        cx * MOTE_CELL + h1 * MOTE_CELL +
        Math.sin(timeMs / 2900 + h1 * 6.28) * 8 + Math.sin(timeMs / 800 + h2 * 6.28) * 1.5;
      const wy =
        cy * MOTE_CELL + h2 * MOTE_CELL +
        Math.cos(timeMs / 3600 + h2 * 6.28) * 6 + Math.cos(timeMs / 950 + h1 * 6.28) * 1.2;
      const sx = Math.round(wx - px);
      const sy = Math.round(wy - py);
      if (sx < -2 || sx > viewW + 2 || sy < -2 || sy > viewH + 2) continue;
      const tw = 0.55 + 0.45 * Math.sin(timeMs / 1300 + h2 * 9);
      ctx.fillStyle = `rgba(255, 250, 233, ${(0.55 * tw * lit).toFixed(3)})`;
      ctx.fillRect(sx, sy, 1, 1);
      ctx.fillStyle = `rgba(255, 250, 233, ${(0.18 * tw * lit).toFixed(3)})`;
      ctx.fillRect(sx - 1, sy, 1, 1);
      ctx.fillRect(sx + 1, sy, 1, 1);
      ctx.fillRect(sx, sy - 1, 1, 1);
      ctx.fillRect(sx, sy + 1, 1, 1);
    }
  }
}
