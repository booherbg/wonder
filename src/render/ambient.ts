import { Rng, makeRng } from "../core/rng";
import { Flora, Plant } from "../life/flora";
import { PlantForm, hsl } from "../life/genome";
import { TILE_SIZE } from "../world/config";
import { Tile, WorldMap } from "../world/types";

const MAX_WISPS = 10;
const WISP_SPEED = 26;

interface Wisp {
  x: number;
  y: number;
  target: Plant | null;
  hue: number;
  phase: number;
}

// Butterflies by day, drawn to flowers; pale moths by night, drawn to
// whatever glows. Purely ambient — they are the pollination made visible.
export class Pollinators {
  private wisps: Wisp[] = [];
  private rng: Rng = makeRng(0xbf1);
  private lastMs = -1;

  update(
    flora: Flora | null,
    viewX: number,
    viewY: number,
    viewW: number,
    viewH: number,
    darkness: number,
    timeMs: number,
  ): void {
    const dt = this.lastMs < 0 ? 0.016 : Math.min((timeMs - this.lastMs) / 1000, 0.1);
    this.lastMs = timeMs;
    if (!flora) {
      this.wisps.length = 0;
      return;
    }
    const night = darkness > 0.4;
    const wants = (p: Plant) =>
      night ? p.genome.glow > 0.6 : p.genome.form === PlantForm.Flower;

    this.wisps = this.wisps.filter(
      (w) =>
        w.x > viewX - 40 &&
        w.x < viewX + viewW + 40 &&
        w.y > viewY - 40 &&
        w.y < viewY + viewH + 40 &&
        w.target !== null &&
        wants(w.target),
    );

    if (this.wisps.length < MAX_WISPS) {
      const tx = Math.floor((viewX + this.rng() * viewW) / TILE_SIZE);
      const ty = Math.floor((viewY + this.rng() * viewH) / TILE_SIZE);
      const candidates = flora.plantsInTile(tx, ty).filter(wants);
      if (candidates.length > 0) {
        const t = candidates[0];
        this.wisps.push({
          x: t.x + (this.rng() - 0.5) * 60,
          y: t.y - 10 - this.rng() * 30,
          target: t,
          hue: this.rng(),
          phase: this.rng() * 6.28,
        });
      }
    }

    for (const w of this.wisps) {
      w.phase += dt * 22;
      if (!w.target) continue;
      const gx = w.target.x;
      const gy = w.target.y - 8;
      const dx = gx - w.x;
      const dy = gy - w.y;
      const d = Math.hypot(dx, dy);
      if (d < 3) {
        if (this.rng() < 0.02) {
          const next = flora.plantsNear(w.x, w.y, 90).filter(wants);
          w.target = next.length > 0 ? next[Math.floor(this.rng() * next.length)] : null;
        }
      } else {
        w.x += (dx / d) * WISP_SPEED * dt + Math.sin(w.phase / 3) * 12 * dt;
        w.y += (dy / d) * WISP_SPEED * dt + Math.cos(w.phase / 4) * 10 * dt;
      }
    }
    this.wisps = this.wisps.filter((w) => w.target !== null);
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, darkness: number): void {
    const night = darkness > 0.4;
    for (const w of this.wisps) {
      const x = Math.round(w.x - camX);
      const y = Math.round(w.y - camY);
      const flap = Math.sin(w.phase) > 0 ? 1 : 0;
      ctx.fillStyle = night ? "rgba(255, 248, 225, 0.92)" : hsl(w.hue, 0.75, 0.62);
      ctx.fillRect(x - 1 - flap, y, 1, 1); // wings
      ctx.fillRect(x + 1 + flap, y, 1, 1);
      ctx.fillStyle = night ? "rgba(240, 230, 200, 0.9)" : "rgba(40, 30, 30, 0.9)";
      ctx.fillRect(x, y, 1, 1); // body
    }
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
