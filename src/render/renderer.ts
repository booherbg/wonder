import { hash2d } from "../core/rng";
import { Critter, CritterSpecies } from "../life/fauna";
import { Flora } from "../life/flora";
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

export interface Scene {
  player: { x: number; y: number } | null;
  flora: Flora | null;
  critters?: Critter[] | null;
  critterSpecies?: CritterSpecies[] | null;
  darkness?: number; // 0 = day .. MAX_DARKNESS at night
}

const GLOW_THRESHOLD = 0.6; // genomes above this shine after dark

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private atlas: HTMLCanvasElement;
  private playerSprite: HTMLCanvasElement;

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

  get viewWidth(): number {
    return this.canvas.width / SCALE;
  }

  get viewHeight(): number {
    return this.canvas.height / SCALE;
  }

  draw(camX: number, camY: number, scene: Scene, timeMs: number): void {
    const { ctx, map } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
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

    // pocket shimmer: a slow hue-cycling wash breathing over hidden clearings
    if (map.pockets) {
      for (const p of map.pockets) {
        const cx = (p.x + 0.5) * TILE_SIZE - camX;
        const cy = (p.y + 0.5) * TILE_SIZE - camY;
        const r = (p.radius + 1.5) * TILE_SIZE;
        if (cx < -r || cx > this.viewWidth + r || cy < -r || cy > this.viewHeight + r) continue;
        const hue = Math.round((timeMs / 55) % 360);
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
        grad.addColorStop(0, `hsla(${hue}, 85%, 65%, 0.17)`);
        grad.addColorStop(1, "hsla(0, 0%, 0%, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }

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
            const sprite = getPlantSprite(p.genome);
            ctx.drawImage(
              sprite,
              Math.round(p.x - PLANT_ANCHOR_X - camX),
              Math.round(p.y - PLANT_ANCHOR_Y - camY),
            );
            if (darkness > 0.05 && p.genome.glow > GLOW_THRESHOLD) {
              glowers.push({ x: p.x, y: p.y, hue: p.genome.hue, genome: p.genome });
            }
          }
        }
      }
      if (scene.critters && scene.critterSpecies) {
        for (const c of scene.critters) {
          if (Math.floor(c.y / TILE_SIZE) !== ty) continue;
          const cx = c.x - camX;
          if (cx < -16 || cx > this.viewWidth + 16) continue;
          const set = getCritterSprites(scene.critterSpecies[c.species]);
          const hopping = Math.sin(c.hopPhase) > 0;
          const sprite =
            c.facing === 1 ? (hopping ? set.hop : set.rest) : hopping ? set.hopFlip : set.restFlip;
          const bounce = Math.round(Math.abs(Math.sin(c.hopPhase)) * 2);
          ctx.drawImage(sprite, Math.round(cx - 8), Math.round(c.y - 14 - camY - bounce));
        }
      }
      if (scene.player && ty === playerRow) {
        ctx.drawImage(
          this.playerSprite,
          Math.round(scene.player.x - 8 - camX),
          Math.round(scene.player.y - 15 - camY),
        );
      }
    }

    if (darkness > 0.01) this.nightPass(camX, camY, scene, darkness, glowers);
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
  ): void {
    const { ctx } = this;
    ctx.fillStyle = `rgba(8, 14, 34, ${(darkness * 0.62).toFixed(3)})`;
    ctx.fillRect(0, 0, this.viewWidth, this.viewHeight);

    ctx.globalCompositeOperation = "lighter";
    for (const g of glowers) {
      ctx.globalAlpha = darkness * 0.9;
      ctx.drawImage(
        getGlowHalo(g.hue),
        Math.round(g.x - GLOW_R - camX),
        Math.round(g.y - GLOW_R - 8 - camY),
      );
    }
    ctx.globalCompositeOperation = "source-over";
    for (const g of glowers) {
      ctx.globalAlpha = darkness * 0.85; // the plant itself stays lit
      ctx.drawImage(
        getPlantSprite(g.genome),
        Math.round(g.x - PLANT_ANCHOR_X - camX),
        Math.round(g.y - PLANT_ANCHOR_Y - camY),
      );
    }
    ctx.globalAlpha = 1;

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
