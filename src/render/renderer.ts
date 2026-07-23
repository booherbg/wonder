import { hash2d } from "../core/rng";
import { Beast, TRAIL_FADE_S, beastSegments } from "../life/beast";
import { Flock } from "../life/birds";
import { Critter, CritterSpecies } from "../life/fauna";
import { Flora } from "../life/flora";
import { PlantForm, hsl } from "../life/genome";
import { PlantSpecies } from "../life/species";
import { CYCLE_MS, DAY_MS, isBiolumeNight, skyGrade } from "../game/daynight";
import { TidePool, exposureAt } from "../game/tide";
import { resemblance } from "../life/idmap";
import { conspicuousness } from "../life/swarm";
import { SwarmLayer, dominantColor, tint } from "../game/swarms";
import { Dragonflies, FishSchool, FrogPatch, drawClouds, drawForegroundMotes } from "./ambient";
import { CALM, FlightField, blitInsect, getInsectSprites, insectPose } from "./insectSprites";
import { drawBeast } from "./beastSprite";
import { drawCrownLight, drawEntityShadows, drawVignette, drawWaterDepth } from "./depth";
import { TILE_SIZE } from "../world/config";
import { Tile, WorldMap } from "../world/types";
import { getCritterSprites } from "./critterSprites";
import { PALETTE } from "./palette";
import {
  GLOW_R,
  PLANT_ANCHOR_X,
  PLANT_ANCHOR_Y,
  getGlowHalo,
  getPlantSprite,
} from "./plantSprites";
import { SCALE, VARIANTS, buildTileAtlas, drawPlayerSprite } from "./tiles";

const WATER_FRAME_MS = 450;
const WATER_FRAME_SEQUENCE = [0, 1, 2, 1]; // gentle back-and-forth drift

// A far-carried seed, set down: how long the falling mote and the ground's
// answering shimmer last, from the sow frame to gone.
export const SOW_LINGER_MS = 1900;
const SOW_FALL_S = 0.55; // the mote's drift from flank to ground

export interface Scene {
  player: { x: number; y: number } | null;
  flora: Flora | null;
  plantSpecies?: PlantSpecies[] | null;
  critters?: Critter[] | null;
  critterSpecies?: CritterSpecies[] | null;
  beast?: Beast | null;
  flocks?: Flock[] | null;
  home?: { x: number; y: number } | null; // garden bed center, tile coords
  darkness?: number; // 0 = day .. MAX_DARKNESS at night
  aurora?: boolean; // tonight the sky carries ribbons of light
  rain?: number; // 0 = dry .. 1 at the heart of a shower
  materials?: { x: number; y: number; kind: string }[]; // ungathered driftwood/stones
  fire?: boolean; // the camp fire is built (burns beside the garden)
  bedroll?: boolean; // the woven bedroll on the garden's far side
  tide?: number; // 0 = full sea .. 1 = the sea drawn all the way back
  pools?: TidePool[]; // small gardens the low tide bares along the sand
  sows?: { x: number; y: number; hue: number; at: number }[]; // far-carried seeds the beast just set down
  overlay?: boolean; // the ecology overlay (V): critter drives + chain hotspots, drawn spatially
  swarms?: SwarmLayer | null; // the insect swarms homing on the island's flowering plants
}

const GLOW_THRESHOLD = 0.6; // genomes above this shine after dark

// The ecology overlay's exposure ramp for the insect swarms: cool where a
// cloud has come to hide in its flower's colours, warm where it stands plain.
// The rings and the DOM legend share these exact stops — one ramp, two places.
const SWARM_HIDDEN_RGB = [96, 196, 222] as const; // #60c4de — safe, sky-cool
const SWARM_EXPOSED_RGB = [244, 122, 92] as const; // #f47a5c — at-risk, ember-warm

// The swarm harmonizer. Genome swatches arrive at bench saturation
// (hsl(H, 62%, 58%)) — right for the Simulator's dark field, garish over the
// island's lit, muted terrain. Ease each swatch toward the naturalist codex: a
// touch less saturation and a hair more light (more into the dark, so a night
// cloud reads as embers). Hue is untouched — the appearance stays the tell.
function harmonizeSwatch(color: string, darkness: number): string {
  const m = color.match(/^hsl\((\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)%,\s*(\d+(?:\.\d+)?)%\)$/);
  if (!m) return color;
  const s = Math.round(Number(m[2]) * 0.78);
  const l = Math.min(80, Math.round(Number(m[3]) + 5 + darkness * 10));
  return `hsl(${m[1]}, ${s}%, ${l}%)`;
}

// Taller plants lean a pixel in a slow breeze, each on its own phase.
function swayOffset(timeMs: number, x: number, y: number): number {
  const s = Math.sin(timeMs / 900 + ((x * 7 + y * 13) % 63) / 10);
  return s > 0.8 ? 1 : s < -0.8 ? -1 : 0;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private atlas: HTMLCanvasElement;
  private playerSprite: HTMLCanvasElement;
  private fishes = new FishSchool();
  private frogs = new FrogPatch();
  private dragonflies = new Dragonflies();
  private prints: { x: number; y: number; at: number }[] = [];
  private lastPrintX = -999;
  private lastPrintY = -999;
  private zoomLevel = 1; // the focus lens: 1 = the wide world, 2 = leaned in close, <1 = pulled back (the World-Lab's fit-to-window)

  constructor(
    private canvas: HTMLCanvasElement,
    private map: WorldMap,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.atlas = buildTileAtlas();
    this.playerSprite = drawPlayerSprite();
    this.resize();
  }

  setMap(map: WorldMap): void {
    this.map = map;
  }

  resize(): void {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  // The focus lens (Z): main's frame loop eases this toward its target, and
  // the whole pipeline — camera math included — sees only the smaller view.
  // The floor is a hair above zero, not 1: the played island only ever eases
  // z UP from 1 toward FOCUS_ZOOM, but the World-Lab bench zooms OUT below 1
  // to fit a whole construct in the window — the same lens, pulled back.
  setZoom(z: number): void {
    this.zoomLevel = Math.max(0.05, z);
  }

  get viewWidth(): number {
    return this.canvas.width / (SCALE * this.zoomLevel);
  }

  get viewHeight(): number {
    return this.canvas.height / (SCALE * this.zoomLevel);
  }

  draw(camX: number, camY: number, scene: Scene, timeMs: number): void {
    const { ctx, map } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(SCALE * this.zoomLevel, 0, 0, SCALE * this.zoomLevel, 0, 0);
    ctx.fillStyle = PALETTE.background;
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    const waterFrame =
      WATER_FRAME_SEQUENCE[Math.floor(timeMs / WATER_FRAME_MS) % WATER_FRAME_SEQUENCE.length];
    const x0 = Math.max(0, Math.floor(camX / TILE_SIZE));
    const y0 = Math.max(0, Math.floor(camY / TILE_SIZE));
    const x1 = Math.min(map.width - 1, Math.ceil((camX + this.viewWidth) / TILE_SIZE));
    const y1 = Math.min(map.height - 1, Math.ceil((camY + this.viewHeight) / TILE_SIZE));

    // ground pass
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = map.tiles[ty * map.width + tx] as Tile;
        const h = Math.floor(hash2d(tx, ty, map.seed) * VARIANTS);
        const isWater = tile === Tile.DeepWater || tile === Tile.ShallowWater;
        const variant = isWater ? (h + waterFrame) % VARIANTS : h;
        ctx.drawImage(
          this.atlas,
          variant * TILE_SIZE,
          tile * TILE_SIZE,
          TILE_SIZE,
          TILE_SIZE,
          Math.round(tx * TILE_SIZE - camX),
          Math.round(ty * TILE_SIZE - camY),
          TILE_SIZE,
          TILE_SIZE,
        );
      }
    }

    // depth pass: the open sea cools and darkens away from shore
    drawWaterDepth(ctx, map, camX, camY, x0, y0, x1, y1);

    // low water: the sea pulls back from the sand and the flats stand bare,
    // still wet enough to hold a darker sheen
    const exposure = exposureAt(scene.tide ?? 0);
    if (exposure > 0.02) {
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (map.tiles[ty * map.width + tx] !== Tile.ShallowWater) continue;
          const nearSand =
            map.tiles[ty * map.width + Math.min(map.width - 1, tx + 1)] === Tile.Sand ||
            map.tiles[ty * map.width + Math.max(0, tx - 1)] === Tile.Sand ||
            map.tiles[Math.min(map.height - 1, ty + 1) * map.width + tx] === Tile.Sand ||
            map.tiles[Math.max(0, ty - 1) * map.width + tx] === Tile.Sand;
          if (!nearSand) continue;
          const h = Math.floor(hash2d(tx, ty, map.seed) * VARIANTS);
          const dx = Math.round(tx * TILE_SIZE - camX);
          const dy = Math.round(ty * TILE_SIZE - camY);
          ctx.globalAlpha = exposure;
          ctx.drawImage(
            this.atlas,
            h * TILE_SIZE,
            Tile.Sand * TILE_SIZE,
            TILE_SIZE,
            TILE_SIZE,
            dx,
            dy,
            TILE_SIZE,
            TILE_SIZE,
          );
          ctx.globalAlpha = 1;
          ctx.fillStyle = `rgba(52, 66, 74, ${(0.2 * exposure).toFixed(3)})`;
          ctx.fillRect(dx, dy, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // tide pools: what the sea forgets when it leaves — a puddle, a dweller
    if (scene.pools && exposure > 0.35) {
      const poolAlpha = Math.min(1, (exposure - 0.35) / 0.4);
      for (const p of scene.pools) {
        const px = p.x * TILE_SIZE - camX;
        const py = p.y * TILE_SIZE - camY;
        if (px < -16 || px > this.viewWidth || py < -16 || py > this.viewHeight) continue;
        ctx.globalAlpha = poolAlpha;
        ctx.fillStyle = "hsl(192, 45%, 28%)";
        ctx.fillRect(Math.round(px + 4), Math.round(py + 6), 8, 5);
        ctx.fillRect(Math.round(px + 5), Math.round(py + 5), 6, 7);
        ctx.fillStyle = "hsl(186, 50%, 40%)";
        ctx.fillRect(Math.round(px + 6), Math.round(py + 7), 4, 3);
        const glint = Math.sin(timeMs / 800 + p.x * 3.1 + p.y * 1.7);
        if (glint > 0.55) {
          ctx.fillStyle = `rgba(235, 250, 255, ${(0.5 * (glint - 0.55)).toFixed(3)})`;
          ctx.fillRect(Math.round(px + 6 + (p.x % 3)), Math.round(py + 7), 1, 1);
        }
        if (p.dweller === "star") {
          ctx.fillStyle = `hsl(${Math.round(340 + p.hue * 65) % 360}, 62%, 56%)`;
          ctx.fillRect(Math.round(px + 6), Math.round(py + 8), 3, 1); // arms across
          ctx.fillRect(Math.round(px + 7), Math.round(py + 7), 1, 3); // arms down
        } else if (p.dweller === "anemone") {
          // petals breathe: open wide, then folded nearly shut
          const open = Math.sin(timeMs / 1600 + p.hue * 6.28) > -0.35;
          ctx.fillStyle = `hsl(${Math.round(290 + p.hue * 60)}, 55%, 58%)`;
          ctx.fillRect(Math.round(px + 7), Math.round(py + 8), 1, 1);
          if (open) {
            ctx.fillStyle = "hsl(168, 55%, 52%)";
            ctx.fillRect(Math.round(px + 6), Math.round(py + 7), 1, 1);
            ctx.fillRect(Math.round(px + 8), Math.round(py + 7), 1, 1);
            ctx.fillRect(Math.round(px + 6), Math.round(py + 9), 1, 1);
            ctx.fillRect(Math.round(px + 8), Math.round(py + 9), 1, 1);
          }
        } else {
          ctx.fillStyle = "hsl(272, 32%, 24%)";
          ctx.fillRect(Math.round(px + 6), Math.round(py + 8), 2, 2); // the dome
          ctx.fillStyle = "hsl(272, 24%, 38%)";
          ctx.fillRect(Math.round(px + 5), Math.round(py + 7), 1, 1);
          ctx.fillRect(Math.round(px + 8), Math.round(py + 7), 1, 1);
          ctx.fillRect(Math.round(px + 5), Math.round(py + 10), 1, 1);
          ctx.fillRect(Math.round(px + 8), Math.round(py + 10), 1, 1);
        }
        ctx.globalAlpha = 1;
      }
    }

    // pocket shimmer: a slow hue-cycling wash breathing over hidden clearings
    if (map.pockets) {
      for (const p of map.pockets) {
        const cx = (p.x + 0.5) * TILE_SIZE - camX;
        const cy = (p.y + 0.5) * TILE_SIZE - camY;
        const r = (p.radius + 1.5) * TILE_SIZE;
        if (cx < -r || cx > this.viewWidth + r || cy < -r || cy > this.viewHeight + r) continue;
        const hue = Math.round((timeMs / (p.deep ? 40 : 55)) % 360);
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
        grad.addColorStop(0, `hsla(${hue}, 85%, 65%, ${p.deep ? 0.24 : 0.17})`);
        grad.addColorStop(1, "hsla(0, 0%, 0%, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
        // spore motes on slow drifting orbits
        for (let k = 0; k < (p.deep ? 9 : 5); k++) {
          const mx = cx + Math.sin(timeMs / 4700 + k * 1.7) * r * 0.55;
          const my = cy + Math.cos(timeMs / 6100 + k * 2.3) * r * 0.45;
          const pulse = 0.3 + 0.25 * Math.sin(timeMs / 900 + k * 2.1);
          ctx.fillStyle = `hsla(${(hue + k * 40) % 360}, 90%, 75%, ${pulse.toFixed(3)})`;
          ctx.fillRect(Math.round(mx), Math.round(my), 1, 1);
        }
      }
    }

    // fish glide beneath everything that grows
    this.fishes.update(map, camX, camY, this.viewWidth, this.viewHeight, scene.player, timeMs);
    this.fishes.draw(ctx, camX, camY);
    this.frogs.update(map, camX, camY, this.viewWidth, this.viewHeight, scene.player, timeMs);
    this.frogs.draw(ctx, camX, camY);

    // driftwood on the beaches, loose stones at the rock's edge
    if (scene.materials) {
      for (const m of scene.materials) {
        const mx = m.x * TILE_SIZE - camX;
        const my = m.y * TILE_SIZE - camY;
        if (mx < -16 || mx > this.viewWidth || my < -16 || my > this.viewHeight) continue;
        const h = hash2d(m.x, m.y, 7);
        const ox = 3 + h * 8;
        const oy = 4 + hash2d(m.y, m.x, 9) * 8;
        // a soft warm halo — the "something to take" tell; reads on dark/mid ground
        const hcx = mx + ox + 2;
        const hcy = my + oy + 2;
        const warm = m.kind === "stone" ? "220, 231, 245" : "255, 223, 158";
        const halo = ctx.createRadialGradient(hcx, hcy, 0, hcx, hcy, 10);
        halo.addColorStop(0, `rgba(${warm}, 0.6)`);
        halo.addColorStop(1, `rgba(${warm}, 0)`);
        ctx.fillStyle = halo;
        ctx.fillRect(Math.round(mx + ox - 8), Math.round(my + oy - 8), 20, 20);
        // a dark rim so a pale piece still reads on pale sand (halo covers dark ground)
        const rim = "rgba(28, 21, 15, 0.82)";
        if (m.kind === "wood") {
          const lie = h < 0.5;
          const bw = lie ? 6 : 3;
          const bh = lie ? 3 : 6;
          ctx.fillStyle = rim;
          ctx.fillRect(Math.round(mx + ox - 1), Math.round(my + oy - 1), bw + 2, bh + 2);
          ctx.fillStyle = "hsl(34, 45%, 63%)"; // sun-bleached driftwood
          ctx.fillRect(Math.round(mx + ox), Math.round(my + oy), bw, bh);
          ctx.fillStyle = "hsl(26, 34%, 40%)"; // grain
          if (lie) ctx.fillRect(Math.round(mx + ox + bw - 1), Math.round(my + oy), 1, bh);
          else ctx.fillRect(Math.round(mx + ox), Math.round(my + oy + bh - 1), bw, 1);
          ctx.fillStyle = "hsl(44, 62%, 89%)"; // glint
          ctx.fillRect(Math.round(mx + ox), Math.round(my + oy), lie ? 2 : 1, lie ? 1 : 2);
        } else if (m.kind === "rush") {
          // bright stems over a dark shadow-stem, gold heads — reads over water & marsh
          ctx.fillStyle = rim;
          ctx.fillRect(Math.round(mx + ox - 1), Math.round(my + oy - 6), 2, 9);
          ctx.fillRect(Math.round(mx + ox + 2), Math.round(my + oy - 5), 2, 8);
          ctx.fillStyle = "hsl(100, 46%, 56%)"; // bright stems
          ctx.fillRect(Math.round(mx + ox), Math.round(my + oy - 4), 1, 6);
          ctx.fillRect(Math.round(mx + ox + 3), Math.round(my + oy - 3), 1, 5);
          ctx.fillStyle = "hsl(40, 72%, 56%)"; // gold cattail heads
          ctx.fillRect(Math.round(mx + ox), Math.round(my + oy - 6), 1, 2);
          ctx.fillRect(Math.round(mx + ox + 3), Math.round(my + oy - 5), 1, 2);
        } else {
          // loose cobbles, sun-warm — pale grey, dark rim, a bright facet
          ctx.fillStyle = rim;
          ctx.fillRect(Math.round(mx + ox - 1), Math.round(my + oy - 1), 5, 5);
          ctx.fillStyle = "hsl(212, 12%, 65%)";
          ctx.fillRect(Math.round(mx + ox), Math.round(my + oy), 3, 3);
          ctx.fillStyle = "hsl(210, 18%, 87%)"; // bright facet
          ctx.fillRect(Math.round(mx + ox), Math.round(my + oy), 1, 1);
        }
      }
    }

    // the camp fire beside the garden: stone ring, crossed wood, and after
    // dusk a live flame with rising sparks
    if (scene.home && scene.fire) {
      const fx = (scene.home.x + 2) * TILE_SIZE + TILE_SIZE / 2 - camX;
      const fy = scene.home.y * TILE_SIZE + TILE_SIZE / 2 - camY;
      ctx.fillStyle = "hsl(220, 8%, 55%)";
      for (const [ox, oy] of [[-3, 0], [3, 0], [0, -2], [0, 2], [-2, 2], [2, -2]]) {
        ctx.fillRect(Math.round(fx + ox), Math.round(fy + oy), 1, 1);
      }
      ctx.fillStyle = "hsl(25, 40%, 30%)";
      ctx.fillRect(Math.round(fx - 2), Math.round(fy - 1), 4, 1);
      ctx.fillRect(Math.round(fx - 1), Math.round(fy), 2, 1);
      const dk = scene.darkness ?? 0;
      if (dk > 0.15) {
        const flames = ["rgba(255, 214, 120, 0.95)", "rgba(255, 150, 60, 0.9)", "rgba(255, 90, 40, 0.85)"];
        for (let k = 0; k < 3; k++) {
          const h = 1 + ((Math.sin(timeMs / 130 + k * 2.1) + 1) / 2) * 3;
          ctx.fillStyle = flames[k];
          ctx.fillRect(Math.round(fx - 1 + k), Math.round(fy - 1 - h), 1, Math.round(h));
        }
        for (let k = 0; k < 2; k++) {
          const phase = (timeMs / 1100 + k / 2) % 1;
          ctx.fillStyle = `rgba(255, 200, 110, ${(0.7 * (1 - phase)).toFixed(3)})`;
          ctx.fillRect(
            Math.round(fx + Math.sin(phase * 9 + k * 3) * 2),
            Math.round(fy - 3 - phase * 12),
            1,
            1,
          );
        }
      } else {
        for (let k = 0; k < 2; k++) {
          const phase = (timeMs / 2400 + k / 2) % 1;
          ctx.fillStyle = `rgba(190, 190, 190, ${(0.25 * (1 - phase)).toFixed(3)})`;
          ctx.fillRect(
            Math.round(fx + Math.sin(phase * 5 + k * 2) * 2),
            Math.round(fy - 2 - phase * 14),
            1,
            1,
          );
        }
      }
    }

    // the bedroll on the garden's far side: woven rushes, a driftwood head
    if (scene.home && scene.bedroll) {
      const bx = (scene.home.x - 2) * TILE_SIZE + 4 - camX;
      const by = scene.home.y * TILE_SIZE + 2 - camY;
      ctx.fillStyle = "hsl(48, 38%, 44%)";
      ctx.fillRect(Math.round(bx), Math.round(by), 7, 11);
      ctx.fillStyle = "hsla(45, 45%, 28%, 0.55)";
      for (let d = 2; d < 11; d += 3) {
        ctx.fillRect(Math.round(bx), Math.round(by + d), 7, 1); // the weave
      }
      ctx.fillStyle = "hsl(24, 35%, 32%)";
      ctx.fillRect(Math.round(bx - 1), Math.round(by - 2), 9, 2); // driftwood headboard
    }

    // the wanderer's garden bed: tilled soil and corner stones, 3x3
    if (scene.home) {
      const gx = (scene.home.x - 1) * TILE_SIZE - camX;
      const gy = (scene.home.y - 1) * TILE_SIZE - camY;
      const size = 3 * TILE_SIZE;
      // rich, cleared earth the wanderer keeps — a TENDED home plot, not raked
      // furrows (you never hoed it): a soft dapple of turned soil and pebbles,
      // deterministic so it holds still, and plainly not a hand-tilled bed.
      for (let ty = 0; ty < 3; ty++) {
        for (let tx = 0; tx < 3; tx++) {
          const dx = Math.round(gx + tx * TILE_SIZE);
          const dy = Math.round(gy + ty * TILE_SIZE);
          ctx.fillStyle = "rgba(74, 52, 32, 0.42)"; // rich tended earth
          ctx.fillRect(dx + 1, dy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
          for (let s = 0; s < 4; s++) {
            const hx = hash2d(scene.home.x + tx * 3 + s * 5, scene.home.y + ty * 7 + s, 5);
            const hy = hash2d(scene.home.y + ty * 4 + s * 3, scene.home.x + tx * 2 + s, 9);
            const px = dx + 2 + Math.floor(hx * (TILE_SIZE - 4));
            const py = dy + 2 + Math.floor(hy * (TILE_SIZE - 4));
            ctx.fillStyle = s % 2 === 0 ? "rgba(98, 76, 50, 0.5)" : "rgba(38, 26, 15, 0.5)"; // pebble / clod
            ctx.fillRect(px, py, 1, 1);
          }
        }
      }
      ctx.fillStyle = "hsl(28, 32%, 34%)";
      for (const [ox, oy] of [[0, 0], [size - 2, 0], [0, size - 2], [size - 2, size - 2]]) {
        ctx.fillRect(Math.round(gx + ox), Math.round(gy + oy), 2, 2); // corner stones
      }
      ctx.fillStyle = "hsla(28, 32%, 34%, 0.6)";
      for (let d = 6; d < size - 4; d += 8) {
        ctx.fillRect(Math.round(gx + d), Math.round(gy), 2, 1); // fence dashes
        ctx.fillRect(Math.round(gx + d), Math.round(gy + size - 1), 2, 1);
        ctx.fillRect(Math.round(gx), Math.round(gy + d), 1, 2);
        ctx.fillRect(Math.round(gx + size - 1), Math.round(gy + d), 1, 2);
      }
    }

    // the camp's growing body: a lean-to when you first settle, a tent once the
    // fire burns, a cabin once the bedroll's woven — the base made to look like
    // the home it is. Sits at the garden's back, behind the life standing in front.
    if (scene.home) {
      const level = scene.bedroll ? 2 : scene.fire ? 1 : 0;
      const sx = Math.round(scene.home.x * TILE_SIZE + TILE_SIZE / 2 - camX);
      const baseY = Math.round(scene.home.y * TILE_SIZE - 1 - camY);
      const wood = "hsl(28, 30%, 36%)";
      const woodDark = "hsl(26, 32%, 25%)";
      const roof = "hsl(38, 30%, 46%)";
      const thatch = "hsl(44, 34%, 44%)";
      const opening = "rgba(18, 12, 9, 0.78)";
      if (level === 0) {
        // lean-to: a single-slope plank roof on two posts
        ctx.fillStyle = wood;
        ctx.fillRect(sx - 8, baseY - 8, 1, 8);
        ctx.fillRect(sx + 6, baseY - 4, 1, 4);
        ctx.fillStyle = roof;
        for (let x = -8; x <= 7; x++) ctx.fillRect(sx + x, baseY - 9 + Math.round((x + 8) * 0.33), 1, 2);
      } else if (level === 1) {
        // tent: an A-frame of thatch with a dark doorway
        for (let x = -9; x <= 9; x++) {
          const h = Math.round(11 - Math.abs(x) * 1.05);
          if (h > 0) {
            ctx.fillStyle = thatch;
            ctx.fillRect(sx + x, baseY - h, 1, h);
          }
        }
        ctx.fillStyle = opening;
        for (let x = -2; x <= 2; x++) {
          const h = Math.round(8 - Math.abs(x) * 1.4);
          if (h > 0) ctx.fillRect(sx + x, baseY - h, 1, h);
        }
      } else {
        // cabin: log walls, a lit window, a door, a pitched roof
        ctx.fillStyle = wood;
        ctx.fillRect(sx - 9, baseY - 10, 18, 10);
        ctx.fillStyle = woodDark;
        for (let y = baseY - 8; y < baseY; y += 3) ctx.fillRect(sx - 9, y, 18, 1);
        ctx.fillStyle = opening;
        ctx.fillRect(sx - 2, baseY - 7, 5, 7);
        ctx.fillStyle = scene.fire && (scene.darkness ?? 0) > 0.15 ? "hsl(44, 80%, 66%)" : "hsl(46, 45%, 55%)";
        ctx.fillRect(sx + 4, baseY - 8, 3, 3);
        ctx.fillStyle = roof;
        for (let x = -11; x <= 11; x++) {
          const h = Math.round(8 - Math.abs(x) * 0.6);
          if (h > 0) ctx.fillRect(sx + x, baseY - 10 - h, 1, h);
        }
        ctx.fillStyle = woodDark;
        ctx.fillRect(sx - 11, baseY - 11, 23, 1);
      }
    }

    // tilled soil: each tile the wanderer worked a clod into reads as turned,
    // furrowed earth — dark enough to tell over any ground it was laid on, so
    // a feeding patch by the fire looks worked by hand. Over the ground but
    // under all sprites (like the garden bed), so life always stands on top.
    if (scene.flora && scene.flora.soilTiles.size > 0) {
      for (const key of scene.flora.soilTiles) {
        const tx = key % map.width;
        const ty = (key / map.width) | 0;
        if (tx < x0 || tx > x1 || ty < y0 || ty > y1) continue;
        const dx = Math.round(tx * TILE_SIZE - camX);
        const dy = Math.round(ty * TILE_SIZE - camY);
        ctx.fillStyle = "rgba(58, 38, 22, 0.55)"; // turned earth
        ctx.fillRect(dx + 1, dy + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        ctx.fillStyle = "rgba(32, 20, 11, 0.5)"; // furrows raked across it
        for (let fy = dy + 4; fy < dy + TILE_SIZE - 2; fy += 4) {
          ctx.fillRect(dx + 2, fy, TILE_SIZE - 4, 1);
        }
      }
    }

    // the wanderer's own footprints press into sand and marsh, fading soon
    const PRINT_FADE_MS = 9000;
    if (scene.player) {
      const p = scene.player;
      const ptile = map.tiles[
        Math.floor((p.y + 2) / TILE_SIZE) * map.width + Math.floor(p.x / TILE_SIZE)
      ] as Tile;
      if (
        (ptile === Tile.Sand || ptile === Tile.Marsh) &&
        Math.hypot(p.x - this.lastPrintX, p.y - this.lastPrintY) > 7
      ) {
        this.prints.push({ x: p.x + (this.prints.length % 2 === 0 ? -2 : 1), y: p.y + 2, at: timeMs });
        this.lastPrintX = p.x;
        this.lastPrintY = p.y;
      }
    }
    if (this.prints.length > 0) {
      for (const fp of this.prints) {
        const age = (timeMs - fp.at) / PRINT_FADE_MS;
        if (age >= 1) continue;
        ctx.fillStyle = `rgba(58, 44, 26, ${(0.32 * (1 - age)).toFixed(3)})`;
        ctx.fillRect(Math.round(fp.x - camX), Math.round(fp.y - camY), 2, 1);
      }
      this.prints = this.prints.filter((fp) => timeMs - fp.at < PRINT_FADE_MS);
    }

    // the beast's trail: pressed grass, fading over a minute
    if (scene.beast) {
      for (const tp of scene.beast.trail) {
        const a = 0.13 * Math.max(0, 1 - (scene.beast.ageSec - tp.age) / TRAIL_FADE_S);
        if (a <= 0.015) continue;
        ctx.fillStyle = `rgba(15, 25, 15, ${a.toFixed(3)})`;
        ctx.fillRect(Math.round(tp.x - camX) - 1, Math.round(tp.y - camY), 2, 1);
      }
    }

    // hot springs: warm-tinted water and rising steam
    if (map.springs) {
      for (const s of map.springs) {
        const cx = (s.x + 0.5) * TILE_SIZE - camX;
        const cy = (s.y + 0.5) * TILE_SIZE - camY;
        if (cx < -40 || cx > this.viewWidth + 40 || cy < -40 || cy > this.viewHeight + 40) continue;
        ctx.fillStyle = "rgba(120, 230, 210, 0.28)";
        ctx.fillRect(Math.round(cx - TILE_SIZE / 2), Math.round(cy - TILE_SIZE / 2), TILE_SIZE, TILE_SIZE);
        for (let k = 0; k < 3; k++) {
          const phase = (timeMs / 1600 + k / 3) % 1;
          const wy = cy - 2 - phase * 16;
          const wx = cx - 4 + k * 4 + Math.sin(phase * 5 + k * 2.1) * 3;
          ctx.fillStyle = `rgba(255, 255, 255, ${(0.3 * (1 - phase)).toFixed(3)})`;
          ctx.fillRect(Math.round(wx), Math.round(wy), 2, 1);
        }
      }
    }

    // waterfalls: white water sliding down the drop, churn and mist at the base
    if (map.falls) {
      for (const f of map.falls) {
        const cx = (f.x + 0.5) * TILE_SIZE - camX;
        const cy = (f.y + 0.5) * TILE_SIZE - camY;
        if (cx < -40 || cx > this.viewWidth + 40 || cy < -40 || cy > this.viewHeight + 40) continue;
        const bx = cx + f.dx * TILE_SIZE;
        const by = cy + f.dy * TILE_SIZE;
        for (let k = 0; k < 4; k++) {
          const phase = (timeMs / 650 + k * 0.27 + ((f.x * 7 + f.y * 13) % 5) / 5) % 1;
          const along = phase * TILE_SIZE;
          const px = cx + f.dx * along + (f.dy !== 0 ? (k - 1.5) * 3 : 0);
          const py = cy + f.dy * along + (f.dx !== 0 ? (k - 1.5) * 3 : 0);
          ctx.fillStyle = `rgba(235, 248, 255, ${(0.7 - 0.4 * phase).toFixed(3)})`;
          ctx.fillRect(Math.round(px), Math.round(py), f.dy !== 0 ? 1 : 2, f.dx !== 0 ? 1 : 2);
        }
        for (let k = 0; k < 3; k++) {
          ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
          ctx.fillRect(
            Math.round(bx + Math.sin(timeMs / 310 + k * 2.1 + f.x) * 3),
            Math.round(by + Math.cos(timeMs / 350 + k * 1.3 + f.y) * 2),
            1,
            1,
          );
        }
        for (let k = 0; k < 2; k++) {
          const phase = (timeMs / 2300 + k / 2 + (f.y % 7) / 7) % 1;
          ctx.fillStyle = `rgba(255, 255, 255, ${(0.26 * (1 - phase)).toFixed(3)})`;
          ctx.fillRect(
            Math.round(bx + Math.sin(phase * 4 + k * 3) * 4),
            Math.round(by - 2 - phase * 10),
            2,
            1,
          );
        }
      }
    }

    // the morning after a glowing tide, the wet sand keeps a little of it —
    // glints that fade as the day wears on
    const darknessForResidue = scene.darkness ?? 0;
    if (isBiolumeNight(timeMs - CYCLE_MS, map.seed) && darknessForResidue < 0.3) {
      const t = ((timeMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
      const fade = Math.max(0, 1 - t / DAY_MS);
      if (fade > 0.02) {
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            if (map.tiles[ty * map.width + tx] !== Tile.Sand) continue;
            const nearWater =
              map.tiles[ty * map.width + Math.min(map.width - 1, tx + 1)] <= Tile.ShallowWater ||
              map.tiles[ty * map.width + Math.max(0, tx - 1)] <= Tile.ShallowWater ||
              map.tiles[Math.min(map.height - 1, ty + 1) * map.width + tx] <= Tile.ShallowWater ||
              map.tiles[Math.max(0, ty - 1) * map.width + tx] <= Tile.ShallowWater;
            if (!nearWater) continue;
            for (let k = 0; k < 2; k++) {
              const h = hash2d(tx * 3 + k, ty, map.seed ^ 0x71de);
              const tw = Math.sin(timeMs / 900 + h * 6.28);
              if (tw < 0.35) continue;
              ctx.fillStyle = `rgba(140, 245, 215, ${(0.3 * fade * tw).toFixed(3)})`;
              ctx.fillRect(
                Math.round(tx * TILE_SIZE + 2 + h * 12 - camX),
                Math.round(ty * TILE_SIZE + 2 + hash2d(ty, tx * 3 + k, map.seed) * 12 - camY),
                1,
                1,
              );
            }
          }
        }
      }
    }

    // byproduct chains: a faint tinted patch on the ground where a disperser
    // fed and a matching feeder may sprout — the tell that makes a chain
    // watchable (moss creeping from where a critter ate). Drawn above every
    // ground/water overlay but under all sprites, so it never occludes life.
    // Glowing byproducts read a touch brighter, carrying the tell into night.
    if (scene.flora && scene.flora.substrates.length) {
      const r = 7; // ~a tile across; soft-edged so it says "something here", not "a dot"
      for (const s of scene.flora.substrates) {
        const sx = Math.round(s.x - camX);
        const sy = Math.round(s.y - camY);
        if (sx < -r || sx > this.viewWidth + r || sy < -r || sy > this.viewHeight + r) continue;
        const deg = Math.round(((((s.hue % 1) + 1) % 1) * 360));
        const lit = s.glow > 0.6;
        const grad = ctx.createRadialGradient(sx, sy, 0.5, sx, sy, r);
        grad.addColorStop(0, `hsla(${deg}, 72%, ${lit ? 68 : 58}%, ${lit ? 0.42 : 0.34})`);
        grad.addColorStop(0.55, `hsla(${deg}, 72%, ${lit ? 62 : 54}%, ${lit ? 0.2 : 0.15})`);
        grad.addColorStop(1, "hsla(0, 0%, 0%, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
      }
    }

    // depth pass: soft pools of shade beneath everything that stands
    drawEntityShadows(ctx, scene, camX, camY, x0, y0, x1, y1, this.viewWidth, this.viewHeight);

    // entity pass, top row to bottom so taller things overlap what's behind them
    const playerRow = scene.player ? Math.floor(scene.player.y / TILE_SIZE) : -1;
    const yPad = 2; // rows below the view whose tall plants still reach into it
    const darkness = scene.darkness ?? 0;
    const glowers: { x: number; y: number; hue: number; genome: Parameters<typeof getPlantSprite>[0] }[] = [];
    for (let ty = y0; ty <= Math.min(map.height - 1, y1 + yPad); ty++) {
      if (scene.critterSpecies) {
        for (const sp of scene.critterSpecies) {
          if (sp.den.y === ty && sp.den.x >= x0 - 1 && sp.den.x <= x1 + 1) {
            ctx.drawImage(
              getCritterSprites(sp).den,
              Math.round(sp.den.x * TILE_SIZE - camX),
              Math.round(sp.den.y * TILE_SIZE - camY),
            );
          }
        }
      }
      if (scene.flora) {
        for (let tx = x0; tx <= x1; tx++) {
          for (const p of scene.flora.plantsInTile(tx, ty)) {
            const aquatic = scene.plantSpecies
              ? scene.plantSpecies[p.species].habitat === Tile.ShallowWater
              : false;
            const sprite = getPlantSprite(p.genome, aquatic);
            const sway = p.genome.height > 0.3 ? swayOffset(timeMs, p.x, p.y) : 0;
            // per-instance variation so a field of one kind never reads "stamped":
            // a deterministic mirror on ~2 in 5, and a pixel or two of side jitter
            // on all. Keyed to position, so it's stable frame-to-frame and reload
            // to reload — and it never lifts a plant off the ground.
            const gx = Math.round(p.x);
            const gy = Math.round(p.y);
            const jx = Math.round((hash2d(gx, gy, 0x31f7) - 0.5) * 3);
            const dx = Math.round(p.x - PLANT_ANCHOR_X - camX) + sway + jx;
            const dy = Math.round(p.y - PLANT_ANCHOR_Y - camY);
            if (hash2d(gx, gy, 0x5eed1) < 0.42) {
              ctx.save();
              ctx.translate(dx + sprite.width, dy);
              ctx.scale(-1, 1);
              ctx.drawImage(sprite, 0, 0);
              ctx.restore();
            } else {
              ctx.drawImage(sprite, dx, dy);
            }
            if (darkness > 0.05 && p.genome.glow > GLOW_THRESHOLD) {
              glowers.push({ x: p.x, y: p.y, hue: p.genome.hue, genome: p.genome });
            }
          }
        }
      }
      if (scene.critters && scene.critterSpecies) {
        for (let ci = 0; ci < scene.critters.length; ci++) {
          const c = scene.critters[ci];
          if (Math.floor(c.y / TILE_SIZE) !== ty) continue;
          const cx = c.x - camX;
          if (cx < -16 || cx > this.viewWidth + 16) continue;
          const set = getCritterSprites(scene.critterSpecies[c.species]);
          const hopping = Math.sin(c.hopPhase) > 0;
          const blinking = !hopping && (Math.floor(timeMs / 130) + ci * 7) % 41 === 0;
          const sprite =
            c.facing === 1
              ? blinking ? set.blink : hopping ? set.hop : set.rest
              : blinking ? set.blinkFlip : hopping ? set.hopFlip : set.restFlip;
          const bounce = Math.round(Math.abs(Math.sin(c.hopPhase)) * 2);
          ctx.drawImage(sprite, Math.round(cx - 8), Math.round(c.y - 14 - camY - bounce));
        }
      }
      if (scene.beast && Math.floor(scene.beast.y / TILE_SIZE) === ty) {
        this.drawBeastWake(scene.beast, camX, camY, timeMs);
        drawBeast(ctx, scene.beast, camX, camY);
      }
      if (scene.player && ty === playerRow) {
        ctx.drawImage(
          this.playerSprite,
          Math.round(scene.player.x - 8 - camX),
          Math.round(scene.player.y - 15 - camY),
        );
      }
    }

    // depth pass: sunlight breathes on the tallest crowns
    drawCrownLight(ctx, scene, camX, camY, x0, y0, x1, Math.min(map.height - 1, y1 + yPad), timeMs);

    // the beast's sowing, made visible: a seed-colored mote drifts down from
    // its flank, and the ground answers — soft sparks settling outward around
    // the fresh sprout it planted, gone again in a couple of breaths
    if (scene.sows) {
      for (const s of scene.sows) {
        const t = (timeMs - s.at) / 1000;
        if (t < 0 || t * 1000 > SOW_LINGER_MS) continue;
        const sx = s.x - camX;
        const sy = s.y - camY;
        if (sx < -24 || sx > this.viewWidth + 24 || sy < -24 || sy > this.viewHeight + 24)
          continue;
        if (t < SOW_FALL_S) {
          const f = t / SOW_FALL_S;
          const mx = sx + Math.sin(t * 7 + s.hue * 6.28) * 1.5; // swaying as it falls
          const my = sy - 12 * (1 - f * f);
          ctx.fillStyle = hsl(s.hue, 0.7, 0.72);
          ctx.fillRect(Math.round(mx), Math.round(my) - 1, 1, 2);
        } else {
          const g = 1 - (t - SOW_FALL_S) / (SOW_LINGER_MS / 1000 - SOW_FALL_S); // 1 → 0
          const r = 2.5 + (1 - g) * 4; // the ring breathes outward as it fades
          const hue = Math.round(s.hue * 360);
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2 + s.hue * 6.28;
            ctx.fillStyle = `hsla(${hue}, 80%, 75%, ${(0.5 * g).toFixed(3)})`;
            ctx.fillRect(
              Math.round(sx + Math.cos(a) * r),
              Math.round(sy - 1 + Math.sin(a) * r * 0.55),
              1,
              1,
            );
          }
          // the sprout's own small light, brightest the moment it lands
          ctx.fillStyle = `rgba(240, 255, 235, ${(0.45 * g).toFixed(3)})`;
          ctx.fillRect(Math.round(sx), Math.round(sy) - 2, 1, 2);
        }
      }
    }

    // birds ride above the canopy
    if (scene.flocks) {
      for (const f of scene.flocks) {
        for (let i = 0; i < f.offsets.length; i++) {
          const o = f.offsets[i];
          let bx: number;
          let by: number;
          if (f.state === "perched") {
            bx = f.x + o.px;
            by = f.y + o.py;
          } else {
            const orbit = Math.min(1, f.alt * 1.2);
            bx = f.x + Math.cos(timeMs / 900 + o.a) * o.r * orbit + o.px * (1 - orbit);
            by = f.y + Math.sin(timeMs / 700 + o.a * 1.3) * o.r * 0.55 * orbit + o.py * (1 - orbit);
          }
          const sx = Math.round(bx - camX);
          if (sx < -8 || sx > this.viewWidth + 8) continue;
          if (f.alt > 0.05) {
            ctx.fillStyle = `rgba(0, 0, 0, ${(0.12 * f.alt).toFixed(3)})`;
            ctx.fillRect(sx, Math.round(by - camY), 2, 1);
          }
          const sy = Math.round(by - f.alt * 14 - camY);
          ctx.fillStyle = hsl(f.species.hue, 0.35, 0.22);
          if (f.state === "perched") {
            ctx.fillRect(sx - 1, sy - 2, 2, 2);
            ctx.fillRect(sx + 1, sy - 3, 1, 1); // head up, watching
          } else {
            const up = Math.sin((timeMs / 1000) * f.species.wingRate * 6.28 + i * 1.7) > 0;
            ctx.fillRect(sx, sy, 1, 1);
            ctx.fillRect(sx - 1, sy + (up ? -1 : 0), 1, 1);
            ctx.fillRect(sx + 1, sy + (up ? -1 : 0), 1, 1);
          }
        }
      }
    }

    drawClouds(
      ctx,
      camX,
      camY,
      this.viewWidth,
      this.viewHeight,
      map.width * TILE_SIZE,
      map.height * TILE_SIZE,
      darkness,
      timeMs,
    );

    if (darkness > 0.01) this.nightPass(camX, camY, scene, darkness, glowers, timeMs);

    // rain: the world darkens a shade, then silver streaks lean with the wind
    const rain = scene.rain ?? 0;
    if (rain > 0.01) {
      ctx.fillStyle = `rgba(30, 42, 60, ${(rain * 0.18).toFixed(3)})`;
      ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);
      const drops = Math.floor(rain * 90);
      const span = this.viewHeight + 12;
      for (let i = 0; i < drops; i++) {
        const h = hash2d(i, 13, 997);
        const speed = 190 + h * 110;
        const y = (h * 5077 + (timeMs / 1000) * speed) % span;
        const x = (hash2d(i, 29, 991) * (this.viewWidth + 40) - y * 0.22) % (this.viewWidth + 8);
        ctx.fillStyle = `rgba(205, 222, 240, ${(0.22 + rain * 0.2).toFixed(3)})`;
        ctx.fillRect(Math.round(x), Math.round(y), 1, 3);
      }
    }

    // dragonflies hunt over the water while the light lasts
    this.dragonflies.update(map, camX, camY, this.viewWidth, this.viewHeight, darkness, timeMs);
    this.dragonflies.draw(ctx, camX, camY);

    // the insect swarms ARE the island's pollinators now — the cosmetic
    // butterflies that used to ride above the blooms have been retired so the
    // world shows one kind of pollinator, the real one: little generative
    // insects grown from each swarm's own genome, flitting and perching on
    // the blooms they work, their wing patches drifting toward the flower's
    // hues as the pool adapts. Above the scene with the other aerial life,
    // under the foreground fluff and lens.
    this.drawSwarms(scene, camX, camY, darkness, timeMs);

    // depth pass: the nearest air — drifting fluff with true parallax — and
    // then the lens itself, its edges easing dark
    drawForegroundMotes(ctx, camX, camY, this.viewWidth, this.viewHeight, darkness, rain, timeMs);
    drawVignette(ctx, this.viewWidth, this.viewHeight, darkness, Math.min(1, this.zoomLevel - 1));
    if (scene.overlay) this.drawEcologyOverlay(scene, camX, camY, timeMs);
  }

  // The insect swarms — ACTUAL little generative insects now, not a cloud of
  // dots. The "swarm" is only the mechanic; what you watch is a handful of
  // moths / beetles / hoverers / damsels / skippers grown from the swarm's own
  // genome (getInsectSprites: body = the sensor map's dominant, wing patches =
  // real sensor cells), flitting with the dragonfly's dart-and-hover loop and
  // PERCHING on the host bloom's crown with folded wings — the bond read as
  // nature, no thread, no ring. Behaviour genes drive the motion: range = dart
  // length, cohesion = scatter radius, bold nerve = longer perches. A faint
  // 1px dust layer scales with population ("many" without clutter), and the
  // additive ember-glow is gated by darkness — day reads crisp, night keeps
  // its magic. prefers-reduced-motion holds a folded-wing constellation.
  private drawSwarms(scene: Scene, camX: number, camY: number, darkness: number, timeMs: number): void {
    const layer = scene.swarms;
    if (!layer) return;
    const ctx = this.ctx;
    const t = timeMs / 1000;
    for (const ent of layer.swarms) {
      const cx = ent.x - camX;
      const cy = ent.y - camY;
      const sw = ent.sw;
      const cohesion = sw.behavior.cohesion;
      const baseR = (1.5 - cohesion * 0.6) * TILE_SIZE * 0.8; // world-px scatter radius
      const margin = baseR * 2 + TILE_SIZE * 2;
      if (cx < -margin || cx > this.viewWidth + margin || cy < -margin || cy > this.viewHeight + margin)
        continue;
      const dom = harmonizeSwatch(dominantColor(sw.sensor), darkness);
      const frac = Math.max(0, Math.min(1, sw.population / sw.cap));
      // the worked bloom: at night a whisper of the swarm's light gathers on
      // it (brighter as the genome comes to match); by day the perching
      // insects carry the bond on their own
      if (ent.home && darkness > 0.08) {
        const hx = ent.home.x - camX;
        const hy = ent.home.y - camY;
        const flower = layer.flowerFor(ent.home.species);
        const res = flower ? resemblance(sw.sensor, flower.map) : 0;
        const r = TILE_SIZE * 0.9;
        const glow = ctx.createRadialGradient(hx, hy - 3, 0, hx, hy - 3, r);
        glow.addColorStop(0, tint(dom, darkness * (0.1 + res * 0.22)));
        glow.addColorStop(1, tint(dom, 0));
        ctx.fillStyle = glow;
        ctx.fillRect(hx - r, hy - 3 - r, r * 2, r * 2);
      }
      // the dust of many-ness: 1px flecks on the old orbital drift, faint and
      // population-scaled, behind the full insects (held still under CALM)
      const insects = Math.round(6 + frac * 10); // 6..16 full generative insects
      const dust = Math.min(ent.motes.length - insects, Math.round(frac * 16));
      for (let i = 0; i < dust; i++) {
        const m = ent.motes[insects + i];
        const a = m.a + (CALM ? 0 : t * m.spd * (1 + (i % 3) * 0.15));
        const rr = baseR * (0.3 + m.r * (1 + (1 - cohesion) * 0.8));
        ctx.fillStyle = tint(dom, 0.22 + 0.2 * darkness);
        ctx.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr * 0.82), 1, 1);
      }
      // the insects themselves — the same sprites the codex card portraits
      const sprites = getInsectSprites(sw);
      const field: FlightField = {
        cx: ent.x,
        cy: ent.y,
        homeX: ent.home?.x,
        homeY: ent.home ? ent.home.y - 5 : undefined, // the bloom's crown
        baseR,
        range: sw.behavior.range,
        nerve: sw.behavior.nerve,
        calm: CALM,
        salt: ent.id * 0x9e37 + 1,
      };
      const emberA = darkness * 0.32; // the night-only additive under-glow
      for (let i = 0; i < insects; i++) {
        const pose = insectPose(i, t, field);
        const ix = pose.x - camX;
        const iy = pose.y - camY;
        if (emberA > 0.02) {
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          const g = ctx.createRadialGradient(ix, iy, 0, ix, iy, 3.5);
          g.addColorStop(0, tint(dom, emberA));
          g.addColorStop(1, tint(dom, 0));
          ctx.fillStyle = g;
          ctx.fillRect(ix - 3.5, iy - 3.5, 7, 7);
          ctx.restore();
        }
        blitInsect(ctx, sprites, ix, iy, pose.frame, pose.heading);
      }
    }
  }

  // The ecology overlay (V): the sim's spatial "why" made visible — each critter
  // ringed in the colour of the drive it wears right now, the chain hotspots
  // (a disperser's byproduct, where a matching feeder can wake) pulsing on the
  // ground, and each insect swarm ringed in the colour of its EXPOSURE — warm
  // where the cloud stands plain against its bloom (an insectivore's easy meal),
  // cool where the genome has come to hide in the flower's own colours — with a
  // faint dashed thread to the bloom it works, the pollination bond said
  // spatially. A toggle, so the world reads plainly the rest of the time.
  private drawEcologyOverlay(scene: Scene, camX: number, camY: number, timeMs: number): void {
    const ctx = this.ctx;
    const mood: Record<string, string> = {
      content: "rgba(127,224,196,0.9)",
      hungry: "rgba(244,169,76,0.95)",
      drowsy: "rgba(138,159,224,0.95)",
      weary: "rgba(176,146,196,0.95)",
      curious: "rgba(244,201,121,1)",
      wary: "rgba(231,154,162,0.95)",
    };
    const pulse = 0.5 + 0.5 * Math.sin(timeMs / 480);
    if (scene.flora) {
      for (const s of scene.flora.substrates) {
        const sx = Math.round(s.x - camX);
        const sy = Math.round(s.y - camY);
        if (sx < -8 || sx > this.viewWidth + 8 || sy < -8 || sy > this.viewHeight + 8) continue;
        ctx.fillStyle = `hsla(${Math.round(s.hue * 360)}, 72%, 62%, ${(0.3 + 0.35 * pulse).toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 2.5 + pulse * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (scene.critters) {
      ctx.lineWidth = 1.5;
      for (const c of scene.critters) {
        const cx = Math.round(c.x - camX);
        const cy = Math.round(c.y - 8 - camY);
        if (cx < -12 || cx > this.viewWidth + 12 || cy < -12 || cy > this.viewHeight + 12) continue;
        ctx.strokeStyle = mood[c.mood] ?? "rgba(255,255,255,0.7)";
        ctx.beginPath();
        ctx.arc(cx, cy, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // the pollinators join the reading: each swarm a dashed ring (a cloud, not
    // a body) in its exposure colour — conspicuousness against the very flower
    // it works, the number predation actually reads — sized gently by how many
    // fly, and seated on a dark underlay so the dashes hold over pale sand as
    // well as grass. The dashed thread to the home bloom appears ONLY when the
    // cloud has genuinely drifted off it (re-homing, ranging to a far bloom):
    // orbiting its own flower the thread was a few unreadable px tangled in the
    // ring, but a far cloud's thread actually says "that one belongs to this bloom".
    if (scene.swarms) {
      const layer = scene.swarms;
      // past the widest orbit a cloud ever keeps around its own bloom
      const THREAD_MIN_PX = 3.6 * TILE_SIZE;
      const UNDERLAY = "rgba(10, 14, 12, 0.75)"; // the dark seat under ring + thread
      for (const ent of layer.swarms) {
        const sx = Math.round(ent.x - camX);
        const sy = Math.round(ent.y - camY);
        if (sx < -48 || sx > this.viewWidth + 48 || sy < -48 || sy > this.viewHeight + 48) continue;
        const flower = ent.home ? layer.flowerFor(ent.home.species) : null;
        const exposed = flower ? conspicuousness(ent.sw, flower) : 1; // homeless = fully plain
        const mix = (a: number, b: number): number => Math.round(a + (b - a) * exposed);
        const ring = `rgba(${mix(SWARM_HIDDEN_RGB[0], SWARM_EXPOSED_RGB[0])}, ${mix(
          SWARM_HIDDEN_RGB[1],
          SWARM_EXPOSED_RGB[1],
        )}, ${mix(SWARM_HIDDEN_RGB[2], SWARM_EXPOSED_RGB[2])}, 0.95)`;
        if (ent.home && Math.hypot(ent.x - ent.home.x, ent.y - ent.home.y) > THREAD_MIN_PX) {
          const hx = Math.round(ent.home.x - camX);
          const hy = Math.round(ent.home.y - 5 - camY); // the bloom's crown, as the perch line
          ctx.setLineDash([3, 4]);
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(hx, hy);
          ctx.strokeStyle = UNDERLAY; // the dark seat first, so the dashes read on sand
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.strokeStyle = `rgba(${mix(SWARM_HIDDEN_RGB[0], SWARM_EXPOSED_RGB[0])}, ${mix(
            SWARM_HIDDEN_RGB[1],
            SWARM_EXPOSED_RGB[1],
          )}, ${mix(SWARM_HIDDEN_RGB[2], SWARM_EXPOSED_RGB[2])}, ${(0.55 + 0.25 * pulse).toFixed(3)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
        const frac = Math.max(0, Math.min(1, ent.sw.population / ent.sw.cap));
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(sx, sy, 8 + frac * 3, 0, Math.PI * 2);
        ctx.strokeStyle = UNDERLAY; // dark outline under the colour — contrast on any ground
        ctx.lineWidth = 3.5;
        ctx.stroke();
        ctx.strokeStyle = ring;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.setLineDash([]);
      }
      this.ensureSwarmLegendRows();
    }
  }

  // The overlay legend is a small DOM card the game rebuilds when V toggles;
  // the swarm rows are appended here, idempotently, so the legend teaches the
  // pollinator reading too (rebuilds wipe them; the next frame restores them).
  private ensureSwarmLegendRows(): void {
    const legend = document.getElementById("ovlegend");
    if (!legend || legend.style.display === "none" || legend.querySelector("[data-swarm-rows]")) return;
    const hex = (c: readonly [number, number, number]): string =>
      "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
    const warm = hex(SWARM_EXPOSED_RGB);
    const cool = hex(SWARM_HIDDEN_RGB);
    const rows = document.createElement("div");
    rows.setAttribute("data-swarm-rows", "");
    rows.innerHTML =
      `<div class="ovl-row"><i style="color:${warm};background:${warm}"></i>swarm, plain to see</div>` +
      `<div class="ovl-row"><i style="color:${cool};background:${cool}"></i>swarm, hidden in its bloom</div>` +
      `<div class="ovl-row"><i style="color:${cool};background:linear-gradient(90deg,${cool},${warm})"></i>thread: a far cloud, homing on its bloom</div>`;
    legend.appendChild(rows);
  }

  // Wading, not floating: any segment standing in shallow water rings the
  // surface with a small spreading ripple, drawn under the body. Subtle —
  // the shallows are part of its range, and it crosses them on its feet.
  private drawBeastWake(b: Beast, camX: number, camY: number, timeMs: number): void {
    const { ctx, map } = this;
    const segs = beastSegments(b);
    for (let i = 0; i < segs.length; i += 2) {
      const s = segs[i];
      const tx = Math.floor(s.x / TILE_SIZE);
      const ty = Math.floor(s.y / TILE_SIZE);
      if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
      if (map.tiles[ty * map.width + tx] !== Tile.ShallowWater) continue;
      const phase = (timeMs / 900 + i * 0.37) % 1;
      const r = s.r + 1 + phase * 4;
      const y = Math.round(s.y - camY);
      ctx.fillStyle = `rgba(225, 244, 250, ${(0.3 * (1 - phase)).toFixed(3)})`;
      ctx.fillRect(Math.round(s.x - r - camX), y, 2, 1); // rings spreading either side
      ctx.fillRect(Math.round(s.x + r - 1 - camX), y, 2, 1);
    }
  }

  // Night falls over everything already drawn; then the things that make
  // their own light — glow plants and the wanderer's small lantern —
  // are painted back on top of the dark.
  private nightPass(
    camX: number,
    camY: number,
    scene: Scene,
    darkness: number,
    glowers: { x: number; y: number; hue: number; genome: Parameters<typeof getPlantSprite>[0] }[],
    timeMs: number,
  ): void {
    const { ctx } = this;
    // the sky's colour for the hour — a golden dusk, a blue night, a rosy dawn —
    // in place of the old flat night-blue. timeMs is the sky clock, so the cast
    // matches the darkness the scene was lit with.
    const grade = skyGrade(timeMs);
    ctx.fillStyle = `rgba(${grade.r}, ${grade.g}, ${grade.b}, ${grade.a.toFixed(3)})`;
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    ctx.globalCompositeOperation = "lighter";

    // mycelium: nearby glowing fungi join in faint pulsing threads
    const fungi = glowers.filter((g) => g.genome.form === PlantForm.Fungus);
    ctx.lineWidth = 1;
    for (let i = 0; i < fungi.length; i++) {
      for (let j = i + 1; j < fungi.length; j++) {
        const a = fungi[i];
        const b = fungi[j];
        if ((a.x - b.x) ** 2 + (a.y - b.y) ** 2 > 48 * 48) continue;
        const pulse = 0.5 + 0.5 * Math.sin(timeMs / 1300 + ((i * 13 + j * 7) % 6));
        ctx.globalAlpha = darkness * (0.1 + 0.22 * pulse);
        ctx.strokeStyle = `hsl(${Math.round((((a.hue + b.hue) / 2) % 1) * 360)}, 90%, 70%)`;
        ctx.beginPath();
        ctx.moveTo(a.x - camX, a.y - camY);
        ctx.quadraticCurveTo(
          (a.x + b.x) / 2 - camX + Math.sin(timeMs / 2000 + i + j) * 2,
          (a.y + b.y) / 2 + 3 - camY,
          b.x - camX,
          b.y - camY,
        );
        ctx.stroke();
      }
    }

    // on a lucky night, the sea's edge sparks blue-green where it laps the shore
    if (isBiolumeNight(timeMs, this.map.seed)) {
      const x0 = Math.max(0, Math.floor(camX / TILE_SIZE));
      const y0 = Math.max(0, Math.floor(camY / TILE_SIZE));
      const x1 = Math.min(this.map.width - 1, Math.ceil((camX + this.viewWidth) / TILE_SIZE));
      const y1 = Math.min(this.map.height - 1, Math.ceil((camY + this.viewHeight) / TILE_SIZE));
      for (let ty = y0; ty <= y1; ty++) {
        for (let tx = x0; tx <= x1; tx++) {
          if (this.map.tiles[ty * this.map.width + tx] !== Tile.ShallowWater) continue;
          const nearSea =
            this.map.tiles[ty * this.map.width + Math.min(this.map.width - 1, tx + 1)] === Tile.DeepWater ||
            this.map.tiles[ty * this.map.width + Math.max(0, tx - 1)] === Tile.DeepWater ||
            this.map.tiles[Math.min(this.map.height - 1, ty + 1) * this.map.width + tx] === Tile.DeepWater ||
            this.map.tiles[Math.max(0, ty - 1) * this.map.width + tx] === Tile.DeepWater;
          if (!nearSea) continue;
          for (let k = 0; k < 2; k++) {
            const h = hash2d(tx * 2 + k, ty, this.map.seed);
            const tw = Math.sin(timeMs / 700 + h * 6.28);
            if (tw < 0.2) continue;
            ctx.globalAlpha = darkness * 0.5 * tw;
            ctx.fillStyle = "rgb(110, 255, 215)";
            ctx.fillRect(
              Math.round(tx * TILE_SIZE + 2 + h * 12 - camX),
              Math.round(ty * TILE_SIZE + 2 + hash2d(ty, tx * 2 + k, this.map.seed) * 12 - camY),
              1,
              1,
            );
          }
        }
      }
    }

    // at low water on a glowing night, the pools keep what the sea spilled
    if (scene.pools && isBiolumeNight(timeMs, this.map.seed)) {
      const poolExposure = exposureAt(scene.tide ?? 0);
      if (poolExposure > 0.35) {
        for (const p of scene.pools) {
          const px = p.x * TILE_SIZE + 8 - camX;
          const py = p.y * TILE_SIZE + 8 - camY;
          if (px < -20 || px > this.viewWidth + 20 || py < -20 || py > this.viewHeight + 20)
            continue;
          const tw = 0.5 + 0.5 * Math.sin(timeMs / 900 + p.hue * 6.28);
          ctx.globalAlpha = darkness * 0.5 * tw * poolExposure;
          ctx.fillStyle = "rgb(110, 255, 215)";
          ctx.fillRect(Math.round(px - 1), Math.round(py), 2, 1);
          ctx.fillRect(Math.round(px), Math.round(py - 1), 1, 3);
        }
      }
    }

    // on the rarest nights, an aurora: slow ribbons of light across the sky,
    // green shading to teal, the highest band leaning violet
    if (scene.aurora) {
      for (let band = 0; band < 3; band++) {
        const baseY = this.viewHeight * (0.1 + band * 0.09);
        const drift = Math.sin(timeMs / 9000 + band * 2.1) * 14;
        const hueBase = band === 2 ? 230 : 150;
        for (let x = 0; x < this.viewWidth; x += 2) {
          const t = x / this.viewWidth;
          const wave =
            Math.sin(t * 6.28 * (1.1 + band * 0.35) + timeMs / (1700 + band * 500)) * 9 +
            Math.sin(t * 6.28 * 3.7 + timeMs / 2600 + band * 4) * 3;
          const envelope =
            Math.sin(t * Math.PI) * (0.55 + 0.45 * Math.sin(t * 9 + timeMs / 1400 + band));
          if (envelope <= 0.05) continue;
          const hue = hueBase + 70 * Math.sin(t * 3.1 + timeMs / 5200 + band * 1.9);
          const y = Math.round(baseY + drift + wave);
          ctx.globalAlpha = darkness * 0.16 * envelope;
          ctx.fillStyle = `hsl(${Math.round(hue)}, 90%, 65%)`;
          ctx.fillRect(x, y, 2, 2);
          ctx.globalAlpha = darkness * 0.07 * envelope;
          ctx.fillRect(x, y + 2, 2, 5); // the soft skirt hanging below
        }
      }
    }

    // hot springs hold a faint teal shine after dark
    for (const s of this.map.springs ?? []) {
      ctx.globalAlpha = darkness * 0.4;
      ctx.drawImage(
        getGlowHalo(0.47),
        Math.round((s.x + 0.5) * TILE_SIZE - GLOW_R - camX),
        Math.round((s.y + 0.5) * TILE_SIZE - GLOW_R - camY),
      );
    }
    for (const g of glowers) {
      ctx.globalAlpha = darkness * 0.9;
      ctx.drawImage(
        getGlowHalo(g.hue),
        Math.round(g.x - GLOW_R - camX),
        Math.round(g.y - GLOW_R - 8 - camY),
      );
    }
    if (scene.beast?.glows) {
      ctx.globalAlpha = darkness * 0.5;
      ctx.drawImage(
        getGlowHalo(scene.beast.hue),
        Math.round(scene.beast.x - GLOW_R - camX),
        Math.round(scene.beast.y - GLOW_R - 4 - camY),
      );
    }
    ctx.globalCompositeOperation = "source-over";
    if (scene.beast?.glows) {
      ctx.globalAlpha = darkness * 0.8;
      drawBeast(ctx, scene.beast, camX, camY); // the beast itself stays lit
      ctx.globalAlpha = 1;
    }
    for (const g of glowers) {
      ctx.globalAlpha = darkness * 0.85; // the plant itself stays lit
      ctx.drawImage(
        getPlantSprite(g.genome),
        Math.round(g.x - PLANT_ANCHOR_X - camX),
        Math.round(g.y - PLANT_ANCHOR_Y - camY),
      );
    }
    ctx.globalAlpha = 1;

    // the camp fire throws a warm breathing circle
    if (scene.home && scene.fire) {
      const fx = (scene.home.x + 2) * TILE_SIZE + TILE_SIZE / 2 - camX;
      const fy = scene.home.y * TILE_SIZE + TILE_SIZE / 2 - camY;
      const flick = 1 + Math.sin(timeMs / 170) * 0.08 + Math.sin(timeMs / 47) * 0.04;
      const r = 46 * flick;
      const glow = ctx.createRadialGradient(fx, fy, 3, fx, fy, r);
      glow.addColorStop(0, `rgba(255, 175, 90, ${(darkness * 0.5).toFixed(3)})`);
      glow.addColorStop(1, "rgba(255, 175, 90, 0)");
      ctx.fillStyle = glow;
      ctx.fillRect(fx - r, fy - r, r * 2, r * 2);
    }

    if (scene.player) {
      const px = scene.player.x - camX;
      const py = scene.player.y - 8 - camY;
      const lantern = ctx.createRadialGradient(px, py, 4, px, py, 52);
      lantern.addColorStop(0, `rgba(255, 220, 150, ${(darkness * 0.3).toFixed(3)})`);
      lantern.addColorStop(1, "rgba(255, 220, 150, 0)");
      ctx.fillStyle = lantern;
      ctx.fillRect(px - 52, py - 52, 104, 104);
    }
  }
}
