import { hash2d } from "../core/rng";
import { Tile, WorldMap, tileAt } from "../world/types";

// ─────────────────────────────────────────────────────────────────────────────
// The mineral field. Six quantities per land tile, each in [0, 1]. Plants draw
// what their genome demands, deplete it, and return a different vector at
// death. Scarcity is the whole point: no tile carries enough of everything for
// one genome to be good at everything, which is what converts drift into
// specialization.
// ─────────────────────────────────────────────────────────────────────────────

export const MINERAL_COUNT = 6;

/** Six mineral quantities, each in [0, 1]. Length is always MINERAL_COUNT. */
export type MineralVec = Float32Array;

// Each mineral gets its own noise lattice, at its own scale, so the six do not
// co-vary. Scales are coprime-ish so their patches do not align into one map.
const SCALES = [23, 31, 37, 43, 53, 61] as const;

function lattice(tx: number, ty: number, seed: number, mineral: number): number {
  const s = SCALES[mineral];
  const gx = Math.floor(tx / s);
  const gy = Math.floor(ty / s);
  const fx = tx / s - gx;
  const fy = ty / s - gy;
  const salt = seed ^ (mineral * 0x9e3779b1);
  const a = hash2d(gx, gy, salt);
  const b = hash2d(gx + 1, gy, salt);
  const c = hash2d(gx, gy + 1, salt);
  const d = hash2d(gx + 1, gy + 1, salt);
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export class MineralField {
  // Depletion deltas only. A tile absent from this map reads its lattice value
  // directly, so an untouched island costs no memory.
  private delta = new Map<number, Float32Array>();

  constructor(
    private readonly width: number,
    private readonly height: number,
    private readonly seed: number,
    private readonly barren: (tx: number, ty: number) => boolean,
  ) {}

  private key(tx: number, ty: number): number {
    return ty * this.width + tx;
  }

  sample(tx: number, ty: number): MineralVec {
    const out = new Float32Array(MINERAL_COUNT);
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return out;
    if (this.barren(tx, ty)) return out;
    const d = this.delta.get(this.key(tx, ty));
    for (let m = 0; m < MINERAL_COUNT; m++) {
      const base = lattice(tx, ty, this.seed, m);
      const v = base - (d ? d[m] : 0);
      out[m] = v < 0 ? 0 : v > 1 ? 1 : v;
    }
    return out;
  }

  totalAt(tx: number, ty: number): number {
    let sum = 0;
    const v = this.sample(tx, ty);
    for (let m = 0; m < MINERAL_COUNT; m++) sum += v[m];
    return sum;
  }

  /**
   * Take up to `amount` × demand[m] of each mineral. Returns the total actually
   * obtained, which is less than the total demanded wherever the tile is short —
   * that shortfall is the selective pressure.
   */
  draw(tx: number, ty: number, demand: MineralVec, amount: number): number {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return 0;
    if (this.barren(tx, ty)) return 0;
    const have = this.sample(tx, ty);
    const k = this.key(tx, ty);
    let d = this.delta.get(k);
    if (!d) {
      d = new Float32Array(MINERAL_COUNT);
      this.delta.set(k, d);
    }
    let got = 0;
    for (let m = 0; m < MINERAL_COUNT; m++) {
      const want = demand[m] * amount;
      const take = want < have[m] ? want : have[m];
      d[m] += take;
      got += take;
    }
    return got;
  }

  /** Return minerals to a tile — what a plant leaves when it dies. */
  deposit(tx: number, ty: number, vec: MineralVec, amount: number): void {
    if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return;
    const k = this.key(tx, ty);
    const d = this.delta.get(k);
    if (!d) return; // nothing was ever taken; the lattice is already at full
    for (let m = 0; m < MINERAL_COUNT; m++) {
      d[m] -= vec[m] * amount;
      if (d[m] < 0) d[m] = 0;
    }
  }
}

const BARREN: ReadonlySet<Tile> = new Set([
  Tile.DeepWater,
  Tile.ShallowWater,
  Tile.Snow,
  Tile.Cliff,
]);

export function mineralFieldFor(map: WorldMap, seed: number): MineralField {
  return new MineralField(map.width, map.height, seed ^ 0x6d316e33, (tx, ty) =>
    BARREN.has(tileAt(map, tx, ty)),
  );
}
