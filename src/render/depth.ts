import { beastSegments } from "../life/beast";
import { Genome, PlantForm } from "../life/genome";
import { TILE_SIZE } from "../world/config";
import { Tile, WorldMap } from "../world/types";
import type { Scene } from "./renderer";

// ─────────────────────────────────────────────────────────────────────────────
// The depth pass. Soft ground shadows, deep-water shading, crown light, a
// quiet vignette, and the focus lens's easing. Everything here is additive:
// Renderer.draw calls these at a few seams and rewrites nothing — the world
// gains a floor, a far, and a near.
// ─────────────────────────────────────────────────────────────────────────────

// ── ground shadows ───────────────────────────────────────────────────────────

export interface ShadowSpec {
  w: number; // pool width in art px
  dx: number; // slip toward the lower-right — the light leans in from upper-left
}

// How much shade a plant pools at its feet: broad beneath canopies, a dab
// beneath rosettes, nothing underwater where the light scatters before it
// lands. Pure, so the shapes of shade are testable.
export function plantShadowSpec(g: Genome, aquatic: boolean): ShadowSpec | null {
  if (aquatic) return null;
  switch (g.form) {
    case PlantForm.Tree:
      return { w: 8 + g.spread * 5 + g.height * 3, dx: 1 + Math.round(g.height * 2) };
    case PlantForm.Shrub:
      return { w: 5 + g.spread * 6 + g.height * 2, dx: 1 };
    case PlantForm.Fern:
      return { w: 4 + g.spread * 4 + g.height * 2, dx: 1 + Math.round(g.height) };
    case PlantForm.Fungus:
      return { w: 3 + g.spread * 3, dx: 1 };
    case PlantForm.Flower:
      return { w: 3 + g.spread * 2, dx: 1 };
    case PlantForm.Succulent:
      return { w: 3 + g.spread * 3, dx: 0 };
    case PlantForm.Reed:
      return { w: 3 + g.spread * 2, dx: 1 }; // a thin stand, shade between the stalks
    case PlantForm.Vine:
      return { w: 4 + g.spread * 4, dx: 1 }; // the sprawl pools under its coils
    case PlantForm.Grass:
      return { w: 3 + g.spread * 3, dx: 1 };
    case PlantForm.Moss:
      return { w: 3 + g.spread * 2, dx: 0 }; // hugs the ground it shades
    case PlantForm.Bulb:
      return { w: 3 + g.spread * 2, dx: 1 };
    case PlantForm.Sporestalk:
      return { w: 3 + g.spread * 2, dx: 1 + Math.round(g.height) }; // tall spires throw long
    case PlantForm.Coral:
    case PlantForm.Kelp:
      return null; // corals and kelp keep below the waterline
  }
}

const SHADOW_CACHE = new Map<number, HTMLCanvasElement>();

// A pooled ellipse of shade, quantized to three pixel steps so it keeps the
// art's grain instead of going airbrush-soft.
function getShadowSprite(wRaw: number): HTMLCanvasElement {
  const w = Math.max(3, Math.min(18, Math.round(wRaw)));
  const hit = SHADOW_CACHE.get(w);
  if (hit) return hit;
  const h = Math.max(2, Math.round(w * 0.4));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "rgb(10, 14, 18)";
  const cx = (w - 1) / 2;
  const cy = (h - 1) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - cx) / (w / 2);
      const ny = (y - cy) / (h / 2);
      const d = nx * nx + ny * ny;
      if (d >= 1) continue;
      ctx.globalAlpha = d < 0.35 ? 0.5 : d < 0.7 ? 0.34 : 0.18;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
  SHADOW_CACHE.set(w, c);
  return c;
}

// Everything that stands gets a soft pool of shade at its feet — the single
// strongest cue that the world has a floor and things rise from it. Shade
// thins under rain-cloud and is gone by night, when the lanterns take over.
export function drawEntityShadows(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  camX: number,
  camY: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  viewW: number,
  viewH: number,
): void {
  const darkness = scene.darkness ?? 0;
  const rain = scene.rain ?? 0;
  const sun = (1 - darkness * 1.2) * (1 - rain * 0.45);
  if (sun <= 0.05) return;
  const strength = 0.5 * sun;
  if (scene.flora) {
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        for (const p of scene.flora.plantsInTile(tx, ty)) {
          const aquatic = scene.plantSpecies
            ? scene.plantSpecies[p.species].habitat === Tile.ShallowWater
            : false;
          const spec = plantShadowSpec(p.genome, aquatic);
          if (!spec) continue;
          const s = getShadowSprite(spec.w);
          ctx.globalAlpha = strength;
          ctx.drawImage(
            s,
            Math.round(p.x - s.width / 2 + spec.dx - camX),
            Math.round(p.y - s.height / 2 + 1 - camY),
          );
        }
      }
    }
  }
  if (scene.critters) {
    for (const c of scene.critters) {
      const sx = c.x - camX;
      const sy = c.y - camY;
      if (sx < -10 || sx > viewW + 10 || sy < -10 || sy > viewH + 10) continue;
      // mid-hop the body lifts but the shade stays on the ground, shrinking —
      // the oldest trick for reading height
      const bounce = Math.abs(Math.sin(c.hopPhase)) * 2;
      const s = getShadowSprite(7 - Math.round(bounce));
      ctx.globalAlpha = strength * (1 - bounce * 0.12);
      ctx.drawImage(s, Math.round(sx - s.width / 2 + 1), Math.round(sy + 1 - s.height / 2));
    }
  }
  if (scene.beast) {
    for (const seg of beastSegments(scene.beast)) {
      const sx = seg.x - camX;
      const sy = seg.y - camY;
      if (sx < -24 || sx > viewW + 24 || sy < -24 || sy > viewH + 24) continue;
      const s = getShadowSprite(seg.r * 2.6);
      ctx.globalAlpha = strength * 0.55; // it carries its own thin shadow; this softens the pool
      ctx.drawImage(s, Math.round(sx - s.width / 2 + 1), Math.round(sy - s.height / 2));
    }
  }
  if (scene.player) {
    const s = getShadowSprite(8);
    ctx.globalAlpha = strength;
    ctx.drawImage(
      s,
      Math.round(scene.player.x - s.width / 2 + 1 - camX),
      Math.round(scene.player.y - s.height / 2 - camY),
    );
  }
  ctx.globalAlpha = 1;
}

// ── deep water reads deeper ──────────────────────────────────────────────────

// Open sea cools and darkens the further it sits from any shore, banded by
// tile like depth contours — the island stands up out of a real deep.
export function drawWaterDepth(
  ctx: CanvasRenderingContext2D,
  map: WorldMap,
  camX: number,
  camY: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const deepAt = (tx: number, ty: number): boolean =>
    tx < 0 ||
    ty < 0 ||
    tx >= map.width ||
    ty >= map.height ||
    map.tiles[ty * map.width + tx] === Tile.DeepWater;
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (map.tiles[ty * map.width + tx] !== Tile.DeepWater) continue;
      // two rings of neighbors grade the depth over ~two tiles from shore
      let ring1 = 0;
      for (const [dx, dy] of RING1) if (deepAt(tx + dx, ty + dy)) ring1++;
      let ring2 = 0;
      for (const [dx, dy] of RING2) if (deepAt(tx + dx, ty + dy)) ring2++;
      const a = 0.03 + ring1 * 0.017 + ring2 * 0.02;
      ctx.fillStyle = `rgba(8, 16, 50, ${a.toFixed(3)})`;
      ctx.fillRect(
        Math.round(tx * TILE_SIZE - camX),
        Math.round(ty * TILE_SIZE - camY),
        TILE_SIZE,
        TILE_SIZE,
      );
    }
  }
}

const RING1: readonly [number, number][] = [
  [-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1],
];
const RING2: readonly [number, number][] = [
  [-2, 0], [2, 0], [0, -2], [0, 2],
];

// ── crown light ──────────────────────────────────────────────────────────────

// Where the light catches a tall crown, offset from the plant's base. Low
// forms return null — the sun only singles out what stands into it.
export function crownLightSpec(g: Genome): { dx: number; dy: number } | null {
  let dx: number;
  let dy: number;
  if (g.form === PlantForm.Tree && g.height > 0.45) {
    const trunkH = 5 + g.height * 9;
    const canopyH = 7 + g.height * 9;
    dx = g.lean * 2 - (3.5 + g.spread * 4) * 0.3;
    dy = -(trunkH + canopyH * 0.75);
  } else if (g.form === PlantForm.Shrub && g.height > 0.6) {
    dx = g.lean - (5 + g.spread * 7) * 0.15;
    dy = -(3 + g.height * 8);
  } else if (g.form === PlantForm.Fern && g.height > 0.6) {
    dx = g.lean;
    dy = -(2 + g.height * 9);
  } else {
    return null;
  }
  return { dx: Math.round(dx), dy: Math.max(-25, Math.round(dy)) };
}

// A faint breath of sunlight on the tallest crowns, riding the same breeze
// as the sway — height made legible by what the light touches first.
export function drawCrownLight(
  ctx: CanvasRenderingContext2D,
  scene: Scene,
  camX: number,
  camY: number,
  x0: number,
  y0: number,
  x1: number,
  yLast: number,
  timeMs: number,
): void {
  if (!scene.flora) return;
  const darkness = scene.darkness ?? 0;
  const sun = (1 - darkness * 1.4) * (1 - (scene.rain ?? 0) * 0.6);
  if (sun <= 0.05) return;
  for (let ty = y0; ty <= yLast; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      for (const p of scene.flora.plantsInTile(tx, ty)) {
        const spec = crownLightSpec(p.genome);
        if (!spec) continue;
        const sway = p.genome.height > 0.3 ? crownSway(timeMs, p.x, p.y) : 0;
        const breathe = 0.5 + 0.5 * Math.sin(timeMs / 1900 + ((p.x * 11 + p.y * 5) % 40) / 6.4);
        ctx.fillStyle = `rgba(255, 246, 214, ${(sun * (0.12 + 0.16 * breathe)).toFixed(3)})`;
        const lx = Math.round(p.x + spec.dx - camX) + sway;
        const ly = Math.round(p.y + spec.dy - camY);
        ctx.fillRect(lx, ly, 1, 1);
        ctx.fillRect(lx + 1, ly + 1, 1, 1);
      }
    }
  }
}

// Matches the renderer's swayOffset, so the crown light rides the same breeze
// as the sprite it sits on.
function crownSway(timeMs: number, x: number, y: number): number {
  const s = Math.sin(timeMs / 900 + ((x * 7 + y * 13) % 63) / 10);
  return s > 0.8 ? 1 : s < -0.8 ? -1 : 0;
}

// ── vignette ─────────────────────────────────────────────────────────────────

// The screen's edges ease darker — a quiet lens that cups the middle of the
// view. Leaning in (the focus lens) draws the cup a little tighter.
export function drawVignette(
  ctx: CanvasRenderingContext2D,
  viewW: number,
  viewH: number,
  darkness: number,
  focus: number,
): void {
  const cx = viewW / 2;
  const cy = viewH / 2;
  const inner = Math.min(viewW, viewH) * (0.52 - 0.1 * focus);
  const outer = Math.hypot(cx, cy) * 1.05;
  const edge = (0.19 + 0.14 * focus) * (1 - darkness * 0.35);
  const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  grad.addColorStop(0, "rgba(10, 12, 24, 0)");
  grad.addColorStop(1, `rgba(10, 12, 24, ${edge.toFixed(3)})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, viewW, viewH);
}

// ── the focus lens's easing ──────────────────────────────────────────────────

// Exponential ease toward a target: frame-rate independent (two half-steps
// land exactly where one full step does) and it settles rather than hunts.
// Z's lean-in and stand-back both ride this.
export function easeToward(value: number, target: number, dt: number, rate: number): number {
  const next = value + (target - value) * (1 - Math.exp(-rate * dt));
  return Math.abs(target - next) < 0.0005 ? target : next;
}
