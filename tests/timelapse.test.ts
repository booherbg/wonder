import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { HOLLOW_CONFIG } from "../src/world/config";
import { generate } from "../src/world/generate";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { BURN_IN_SIM_BUDGET, burnIn } from "../src/life/burnin";
import {
  BURNIN_FRAME_CAP,
  BURNIN_SAMPLE_EVERY,
  EMPTY_CELL,
  PLAY_FRAME_CAP,
  PLAY_SAMPLE_EVERY,
  SpeciesTimelapse,
  TIMELAPSE_CELLS,
  dominantGrid,
} from "../src/life/timelapse";
import { frameCaption, frameLabel, legendFor } from "../src/render/timelapse";
import type { TimelapseView } from "../src/render/timelapse";

const TILE = 16;

// A stand-in for the parts of Flora the recorder reads. `dominantGrid` takes
// `all` and nothing else, so a literal is enough and no burn-in has to run.
function floraOf(plants: { species: number; x: number; y: number }[]): Flora {
  return { all: plants } as unknown as Flora;
}

describe("dominantGrid", () => {
  it("marks a cell with the species holding the most plants in it", () => {
    // 4×4-tile cells at 8 cells over a 32-tile map. Cell (0,0) covers world px
    // 0..63; put three of species 5 and one of species 2 in it.
    const g = dominantGrid(
      floraOf([
        { species: 5, x: 4, y: 4 },
        { species: 5, x: 20, y: 20 },
        { species: 5, x: 40, y: 40 },
        { species: 2, x: 8, y: 8 },
      ]),
      32,
      32,
      8,
    );
    expect(g.cells[0]).toBe(5);
    expect(g.plants).toBe(4);
    expect(g.species).toBe(2);
  });

  it("leaves a cell with no plants EMPTY_CELL", () => {
    const g = dominantGrid(floraOf([{ species: 3, x: 4, y: 4 }]), 32, 32, 8);
    expect(g.cells[0]).toBe(3);
    expect(g.cells[1]).toBe(EMPTY_CELL);
    expect([...g.cells].filter((c) => c !== EMPTY_CELL)).toHaveLength(1);
  });

  it("breaks a tie by lower species id, not by plant order", () => {
    const a = dominantGrid(
      floraOf([
        { species: 9, x: 4, y: 4 },
        { species: 4, x: 8, y: 8 },
      ]),
      32,
      32,
      8,
    );
    const b = dominantGrid(
      floraOf([
        { species: 4, x: 8, y: 8 },
        { species: 9, x: 4, y: 4 },
      ]),
      32,
      32,
      8,
    );
    expect(a.cells[0]).toBe(4);
    expect(b.cells[0]).toBe(4);
  });

  it("clamps a plant standing past the last cell into the last cell", () => {
    const g = dominantGrid(floraOf([{ species: 1, x: 32 * TILE, y: 32 * TILE }]), 32, 32, 8);
    expect(g.cells[8 * 8 - 1]).toBe(1);
  });
});

describe("SpeciesTimelapse bounds", () => {
  const flora = floraOf([{ species: 1, x: 8, y: 8 }]);

  it("samples burn-in every BURNIN_SAMPLE_EVERY generations and stops at the cap", () => {
    const tl = new SpeciesTimelapse(140, 140);
    tl.captureBurnIn(flora, 0);
    for (let g = 1; g <= 400; g++) tl.captureBurnIn(flora, g);
    expect(tl.burnInCount).toBe(BURNIN_FRAME_CAP);
    expect(tl.frames[0].stamp).toBe(0);
    expect(tl.frames[1].stamp).toBe(BURNIN_SAMPLE_EVERY);
    expect(tl.frames[BURNIN_FRAME_CAP - 1].stamp).toBe(400);
    // 101 frames × 1,225 cells × 2 bytes
    expect(tl.bytes).toBe(BURNIN_FRAME_CAP * TIMELAPSE_CELLS * TIMELAPSE_CELLS * 2);
  });

  it("halves the play segment instead of growing past PLAY_FRAME_CAP", () => {
    const tl = new SpeciesTimelapse(140, 140);
    // 251 samples' worth of ticks at the starting cadence — one halving past
    // the 200-frame cap, which doubles the interval to 500 ticks.
    for (let t = 0; t <= PLAY_SAMPLE_EVERY * 250; t++) tl.capturePlay(flora, t);
    expect(tl.playCount).toBeLessThanOrEqual(PLAY_FRAME_CAP);
    expect(tl.playInterval).toBe(PLAY_SAMPLE_EVERY * 2);
    // Still spans the whole of play: first play frame at tick 0, last near the end.
    const play = tl.frames.filter((f) => f.phase === "play");
    expect(play[0].stamp).toBe(0);
    expect(play[play.length - 1].stamp).toBeGreaterThan(PLAY_SAMPLE_EVERY * 240);
  });

  it("never exceeds 737 KB at both caps", () => {
    const tl = new SpeciesTimelapse(140, 140);
    tl.captureBurnIn(flora, 0);
    for (let g = 1; g <= 400; g++) tl.captureBurnIn(flora, g);
    for (let t = 0; t <= PLAY_SAMPLE_EVERY * 200; t++) tl.capturePlay(flora, t);
    expect(tl.bytes).toBeLessThanOrEqual(737 * 1024);
  });
});

// The constraint that matters most: an island recorded and an island not
// recorded must be the same island. Stub the observer out and the fingerprint
// must be identical — if this ever fails, recording has become a simulation
// input rather than an observation.
describe("recording does not perturb the simulation", () => {
  function fingerprint(seed: number, observe: boolean): string {
    const map = generate(seed, HOLLOW_CONFIG);
    const flora = new Flora(map, generatePlantSpecies(seed), seed, {
      simBudget: BURN_IN_SIM_BUDGET,
    });
    const tl = observe ? new SpeciesTimelapse(map.width, map.height) : null;
    burnIn(flora, 40, undefined, undefined, tl ? (f, g) => tl.captureBurnIn(f, g) : undefined);
    const body = flora.all
      .map((p) => `${p.species}:${p.x.toFixed(2)}:${p.y.toFixed(2)}`)
      .join("|");
    return `${createHash("sha256").update(body).digest("hex").slice(0, 16)}:${flora.all.length}`;
  }

  it("burns in to the same population with and without an observer", () => {
    for (const seed of [3, 21]) {
      expect(fingerprint(seed, true)).toBe(fingerprint(seed, false));
    }
  });
});

describe("the player's readout", () => {
  const cells = new Int16Array(TIMELAPSE_CELLS * TIMELAPSE_CELLS).fill(EMPTY_CELL);
  cells[0] = 4;
  cells[1] = 4;
  cells[2] = 7;

  it("names burn-in by generation and play by tick", () => {
    expect(frameLabel({ phase: "burnin", stamp: 128, cells, plants: 10, species: 2 })).toBe(
      "burn-in generation 128 of 400",
    );
    expect(frameLabel({ phase: "play", stamp: 12500, cells, plants: 10, species: 2 })).toBe(
      "play, sim tick 12,500",
    );
  });

  it("carries the plant count and living kinds in the caption", () => {
    expect(frameCaption({ phase: "play", stamp: 0, cells, plants: 8231, species: 18 })).toContain(
      "8,231 plants · 18 kinds alive",
    );
  });

  it("orders the legend by how many cells a species holds", () => {
    const view = {
      cells: TIMELAPSE_CELLS,
      species: new Map([
        [4, { id: 4, name: "four", hue: 0.1, sat: 0.6, daughter: false }],
        [7, { id: 7, name: "seven", hue: 0.5, sat: 0.6, daughter: true }],
      ]),
    } as unknown as TimelapseView;
    const legend = legendFor(view, { phase: "play", stamp: 0, cells, plants: 3, species: 2 });
    expect(legend.map((s) => s.name)).toEqual(["four", "seven"]);
  });
});
