import { Genome, PlantForm } from "./genome";
import type { Flora, Plant } from "./flora";
import { TILE_SIZE } from "../world/config";

// ─────────────────────────────────────────────────────────────────────────────
// The canopy: shade cast by the plants that are actually standing there.
//
// The Hollow's first light model read shade off the tile type — every Forest
// tile 0.25, every Sand tile 1.0. Measured, that could not select for height:
// `PlantSpecies.habitat` pins a species to one tile, so a per-tile constant is
// also a per-species constant and there is no gradient inside a habitat for
// selection to sort along. Mean genome height on Tile.Forest at 400
// generations moved by -0.012 to +0.003 across three seeds, sign unstable.
//
// Shade cast by neighbours varies inside a habitat: a dense stand of tall
// trees is dark, a gap in the same forest is bright. That is the gradient, and
// it is also the forest-gap dynamic — clearings that fill in, tall plants
// shading out their own seedlings.
// ─────────────────────────────────────────────────────────────────────────────

/** Tiles out from a plant that its shade reaches. */
export const CANOPY_RADIUS = 2;

/**
 * Ticks between refreshes during burn-in. The canopy changes on the timescale
 * of plants being born and dying, not per examination, so recomputing it every
 * tick buys nothing. Measured at seed 2026 (8,234 plants, 19,600 tiles): 400
 * generations at this interval is 26 refreshes costing 15 ms in total, 0.6 ms
 * each — 0.24% of the 6.3 s burn-in. Refreshing every tick would be 0.23 s,
 * 3.7%, for a field that barely differs.
 */
export const CANOPY_REFRESH_TICKS = 15;

/**
 * How much canopy each form casts per unit of its genome `height`, relative to
 * a Tree at 1. A moss cushion at full height still shades almost nothing; a
 * tree at half height shades a great deal. Ordered by how much standing
 * structure the form has, not by how large it draws.
 */
const FORM_SHADE: Record<PlantForm, number> = {
  [PlantForm.Tree]: 1,
  [PlantForm.Kelp]: 0.8, // a submerged canopy, and the water is already dim
  [PlantForm.Shrub]: 0.55,
  [PlantForm.Vine]: 0.5, // hangs across whatever it climbs
  [PlantForm.Reed]: 0.4,
  [PlantForm.Fern]: 0.4,
  [PlantForm.Coral]: 0.35,
  [PlantForm.Sporestalk]: 0.25,
  [PlantForm.Grass]: 0.2,
  [PlantForm.Flower]: 0.15,
  [PlantForm.Bulb]: 0.15,
  [PlantForm.Succulent]: 0.1,
  [PlantForm.Fungus]: 0.05,
  [PlantForm.Moss]: 0.05,
};

/**
 * Shade summed over a tile is divided by this before the light curve is
 * applied. Calibrated at seed 2026 so the burned-in island spans a usable
 * range rather than saturating: see CanopyField.lightAt.
 */
const SHADE_NORM = 6;

// Distance weights, precomputed once: a plant CANOPY_RADIUS tiles away casts
// nothing, one on the same tile casts full weight, linear in between.
const OFFSETS: { dx: number; dy: number; w: number }[] = [];
for (let dy = -CANOPY_RADIUS; dy <= CANOPY_RADIUS; dy++) {
  for (let dx = -CANOPY_RADIUS; dx <= CANOPY_RADIUS; dx++) {
    const w = 1 - Math.hypot(dx, dy) / (CANOPY_RADIUS + 1);
    if (w > 0) OFFSETS.push({ dx, dy, w });
  }
}

/**
 * Per-tile shade cast by the plants actually standing on and around a tile.
 * A pure function of the flora it was refreshed from: no RNG, no time, so two
 * identical islands produce identical canopies.
 */
export class CanopyField {
  /** Summed shade weight per tile, row-major. */
  private readonly shade: Float32Array;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.shade = new Float32Array(width * height);
  }

  /** How much shade one plant contributes at its own tile, before distance. */
  static shadeOf(p: Plant): number {
    return CanopyField.shadeOfGenome(p.genome);
  }

  /** The same, from a genome alone — the selection callback has no Plant. */
  static shadeOfGenome(g: Genome): number {
    return FORM_SHADE[g.form] * g.height;
  }

  /** Rebuild the field from the flora's current population. */
  refresh(flora: Flora): void {
    this.shade.fill(0);
    for (const p of flora.all) {
      const s = CanopyField.shadeOf(p);
      if (s <= 0) continue;
      const px = Math.floor(p.x / TILE_SIZE);
      const py = Math.floor(p.y / TILE_SIZE);
      for (const o of OFFSETS) {
        const x = px + o.dx;
        const y = py + o.dy;
        if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
        this.shade[y * this.width + x] += s * o.w;
      }
    }
  }

  /** Raw summed shade weight on a tile, before the light curve. Diagnostic. */
  shadeAt(tx: number, ty: number): number {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return 0;
    return this.shade[ty * this.width + tx];
  }

  /**
   * The fraction of light that gets past the canopy to this tile: 1 on bare
   * ground, falling toward 0 under a dense stand. `1 / (1 + shade)` rather
   * than a linear falloff so the field never goes negative and so the first
   * few plants on an empty tile darken it much more than the twentieth does —
   * which is what makes a gap distinct from a thin patch.
   */
  lightAt(tx: number, ty: number): number {
    return this.lightExcluding(tx, ty, 0);
  }

  /**
   * The same, with `ownShade` (a CanopyField.shadeOfGenome value) removed
   * first. A plant is not shaded by itself, and leaving its own contribution
   * in makes the light it is scored against a function of its own height —
   * which turns the light term into a tax on being tall rather than a
   * gradient to sort along. Measured at seed 2026, LIGHT_WEIGHT 0.85: the
   * dark-versus-bright quartile height gap is -0.236 with self-shade left in
   * and -0.193 with it removed, against a -0.358 no-light-selection baseline.
   */
  lightExcluding(tx: number, ty: number, ownShade: number): number {
    const others = Math.max(0, this.shadeAt(tx, ty) - ownShade);
    return 1 / (1 + others / SHADE_NORM);
  }
}
