import { TILE_SIZE } from "../world/config";
import { Flora } from "./flora";

// ─────────────────────────────────────────────────────────────────────────────
// The species timelapse: a bounded record of WHICH PLANT SPECIES HOLDS THE MOST
// GROUND in each square of a coarse grid over the island, sampled repeatedly so
// the record can be played back as an animation.
//
// Definitions, before anything below uses them:
//
//   cell        — one square of the recording grid. TIMELAPSE_CELLS × TIMELAPSE_CELLS
//                 cells cover the whole map, so on the Hollow's 140×140 tiles a
//                 cell is 4×4 tiles (64×64 world px).
//   dominant    — the species id with the most living plants standing in a cell
//                 at the moment of the sample. Ties go to the lower id, so a
//                 sample is a function of the population alone and not of array
//                 order. EMPTY_CELL (-1) when no plant stands in the cell.
//   frame       — one full grid of dominants, plus the phase and stamp below.
//   phase       — "burnin" for a frame taken during the 400 pre-play generations,
//                 "play" for one taken while the wanderer is on the island.
//   stamp       — generation number for a burn-in frame (0..400), sim tick for a
//                 play frame.
//
// WHAT THIS RECORDS AND WHAT IT DOES NOT. A frame is composition: which kind
// won a square of ground. It says nothing about any individual plant fitting
// its own spot — the within-species light gradient is a measured null (r ≈ 0),
// recorded as a failed claim in §12.3 of docs/03-ECOLOGY-DESIGN-SPACE.md. Any
// UI over these frames may say a species took ground; it may not say a plant
// adapted to where it stands.
//
// DETERMINISM. Nothing here draws from an Rng, allocates ids, or writes to
// Flora. `capture` reads `flora.all` and writes into its own array. An island
// recorded and an island not recorded are the same island.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Grid resolution: 35 cells per side, 1,225 cells per frame.
 *
 * Chosen against the Hollow's measured population. A burned-in Hollow carries
 * about 8,200 plants over about 8,400 land tiles — roughly one plant per tile.
 * At 35 cells a cell is 4×4 tiles and holds about 16 plants, so "which species
 * is dominant here" is decided by a margin over ~16 individuals. At 70 cells a
 * cell is 2×2 tiles and holds about 4 plants, where a single birth or death
 * flips the dominant and the animation reads as noise rather than as spread.
 * 35 also draws at 1,225 rectangles per frame, which repaints inside a frame
 * budget without tiling to an offscreen bitmap.
 */
export const TIMELAPSE_CELLS = 35;

/** A cell with no living plant in it. */
export const EMPTY_CELL = -1;

/** Generations between burn-in samples: 400 / 4 = 100 frames plus the founder frame. */
export const BURNIN_SAMPLE_EVERY = 4;

/** Burn-in frames kept. 400 generations at one sample per 4, plus generation 0. */
export const BURNIN_FRAME_CAP = 101;

/** Sim ticks between play samples, before any decimation. */
export const PLAY_SAMPLE_EVERY = 250;

/** Play frames kept. Beyond this the play segment halves (see `capturePlay`). */
export const PLAY_FRAME_CAP = 200;

export type TimelapsePhase = "burnin" | "play";

export interface TimelapseFrame {
  phase: TimelapsePhase;
  /** Generation for a burn-in frame, sim tick for a play frame. */
  stamp: number;
  /** TIMELAPSE_CELLS² dominant species ids, row-major; EMPTY_CELL where none. */
  cells: Int16Array;
  /** Living plants counted into this frame. */
  plants: number;
  /** Distinct species with at least one plant at this sample. */
  species: number;
}

/** Bytes one frame's grid costs. 1,225 cells × 2 bytes = 2,450. */
export const FRAME_BYTES = TIMELAPSE_CELLS * TIMELAPSE_CELLS * 2;

/**
 * Read the dominant species per cell out of a live Flora. Pure over its inputs;
 * allocates one Int16Array plus a scratch tally and touches nothing else.
 */
export function dominantGrid(
  flora: Flora,
  mapWidth: number,
  mapHeight: number,
  cells: number = TIMELAPSE_CELLS,
): { cells: Int16Array; plants: number; species: number } {
  const grid = new Int16Array(cells * cells).fill(EMPTY_CELL);
  // Per-cell tallies, allocated lazily: most cells on a 140×140 island hold
  // plants of two or three kinds, so a dense cells×species matrix would be
  // mostly zeroes.
  const tally = new Map<number, Map<number, number>>();
  const cellW = (mapWidth * TILE_SIZE) / cells;
  const cellH = (mapHeight * TILE_SIZE) / cells;
  const live = new Set<number>();
  for (const p of flora.all) {
    live.add(p.species);
    const cx = Math.min(cells - 1, Math.max(0, Math.floor(p.x / cellW)));
    const cy = Math.min(cells - 1, Math.max(0, Math.floor(p.y / cellH)));
    const k = cy * cells + cx;
    let m = tally.get(k);
    if (!m) tally.set(k, (m = new Map()));
    m.set(p.species, (m.get(p.species) ?? 0) + 1);
  }
  for (const [k, m] of tally) {
    let best = EMPTY_CELL;
    let bestN = 0;
    for (const [id, n] of m) {
      // Ties to the lower id, so the grid depends on the population and not on
      // the order plants happen to sit in `flora.all`.
      if (n > bestN || (n === bestN && id < best)) {
        best = id;
        bestN = n;
      }
    }
    grid[k] = best;
  }
  return { cells: grid, plants: flora.all.length, species: live.size };
}

/**
 * The recording itself: burn-in frames and play frames, each segment bounded.
 *
 * The two segments are kept apart on purpose. Burn-in is 400 generations and
 * play runs to hundreds of thousands of ticks, so one uniformly-spaced ring
 * over both would spend nearly all its frames on play and compress the whole
 * colonisation of the island into one or two of them. Burn-in therefore gets a
 * fixed 101 frames that are never dropped, and play gets its own 200-frame ring
 * that halves its resolution as the island gets older.
 *
 * Memory at the caps: (101 + 200) × 2,450 bytes = 737 KB, plus about 40 bytes
 * of per-frame bookkeeping.
 */
export class SpeciesTimelapse {
  private readonly burninFrames: TimelapseFrame[] = [];
  private readonly playFrames: TimelapseFrame[] = [];
  /** Current spacing of play samples in sim ticks; doubles on each halving. */
  private playEvery = PLAY_SAMPLE_EVERY;
  private lastPlayStamp = -Infinity;
  private lastBurninStamp = -Infinity;

  constructor(
    readonly mapWidth: number,
    readonly mapHeight: number,
    readonly cells: number = TIMELAPSE_CELLS,
  ) {}

  /** Every frame, oldest first: burn-in then play. */
  get frames(): readonly TimelapseFrame[] {
    return [...this.burninFrames, ...this.playFrames];
  }

  get burnInCount(): number {
    return this.burninFrames.length;
  }

  get playCount(): number {
    return this.playFrames.length;
  }

  /** Sim ticks between the play frames currently held. */
  get playInterval(): number {
    return this.playEvery;
  }

  /** Bytes the held grids occupy. */
  get bytes(): number {
    return (this.burninFrames.length + this.playFrames.length) * this.cells * this.cells * 2;
  }

  private snap(flora: Flora, phase: TimelapsePhase, stamp: number): TimelapseFrame {
    const g = dominantGrid(flora, this.mapWidth, this.mapHeight, this.cells);
    return { phase, stamp, cells: g.cells, plants: g.plants, species: g.species };
  }

  /**
   * Record a burn-in frame if `generation` is due one. Called once per burn-in
   * generation; samples every BURNIN_SAMPLE_EVERY, and refuses past the cap so
   * a caller running more than BURN_IN_GENERATIONS cannot grow this without
   * bound.
   */
  captureBurnIn(flora: Flora, generation: number): void {
    if (this.burninFrames.length >= BURNIN_FRAME_CAP) return;
    if (generation !== 0 && generation - this.lastBurninStamp < BURNIN_SAMPLE_EVERY) return;
    this.lastBurninStamp = generation;
    this.burninFrames.push(this.snap(flora, "burnin", generation));
  }

  /**
   * Record a play frame if `tick` is due one. Called from the same places the
   * census is sampled, so a tick the census logged is a tick this saw.
   *
   * At the cap the segment HALVES: every second frame is dropped and the
   * interval doubles, so the play frames still span the whole of play at half
   * the time resolution. The first halving happens after 200 × 250 = 50,000
   * ticks; the second after 100,000, and so on. Old detail is lost before old
   * history is.
   */
  capturePlay(flora: Flora, tick: number): void {
    if (tick - this.lastPlayStamp < this.playEvery) return;
    this.lastPlayStamp = tick;
    this.playFrames.push(this.snap(flora, "play", tick));
    if (this.playFrames.length > PLAY_FRAME_CAP) {
      const kept = this.playFrames.filter((_, i) => i % 2 === 0);
      this.playFrames.length = 0;
      this.playFrames.push(...kept);
      this.playEvery *= 2;
    }
  }

  /** Every species id that is dominant somewhere in some frame. */
  speciesSeen(): number[] {
    const seen = new Set<number>();
    for (const f of this.frames) {
      for (const id of f.cells) if (id !== EMPTY_CELL) seen.add(id);
    }
    return [...seen].sort((a, b) => a - b);
  }
}
