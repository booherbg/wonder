import { EMPTY_CELL, TimelapseFrame } from "../life/timelapse";
import { OVERVIEW_COLORS } from "./palette";
import { speciesColor } from "./charts";

// ─────────────────────────────────────────────────────────────────────────────
// The species timelapse player: the recorded frames from `src/life/timelapse.ts`
// drawn as an animated map, with play/pause, a scrub bar and a readout of which
// point in the island's life is on screen.
//
// Definitions used below:
//
//   frame     — one recorded grid of dominant species (see src/life/timelapse.ts).
//   dominant  — the species with the most living plants in one 4×4-tile square
//               at the moment of the sample.
//   burn-in   — the 400 generations the island ran before the wanderer landed.
//   play      — everything after that, sampled while the island is being played.
//
// WHAT THE PICTURE MEANS. A coloured square says which KIND held the most
// ground there. It does not say anything about an individual plant suiting its
// own spot: the within-species light correlation is r ≈ 0, a measured null
// recorded in §12.3 of docs/03-ECOLOGY-DESIGN-SPACE.md. The UI strings here
// keep to composition for that reason.
//
// Pure over its TimelapseView except for the canvas it is handed; it builds
// HTML strings and paints a 2D context, and draws no randomness.
// ─────────────────────────────────────────────────────────────────────────────

export interface TimelapseSpecies {
  id: number;
  name: string;
  hue: number;
  sat: number;
  daughter: boolean;
}

export interface TimelapseView {
  frames: readonly TimelapseFrame[];
  /** Cells per side of a frame's grid. */
  cells: number;
  /** Tile ids, row-major, `mapWidth × mapHeight` — the faint coastline under the species. */
  tiles: Uint8Array;
  mapWidth: number;
  mapHeight: number;
  /** Colour and name for every species id that appears in a frame. */
  species: Map<number, TimelapseSpecies>;
  /** Sim ticks between play frames right now, for the caption. */
  playInterval: number;
  /** How many of `frames` are burn-in frames (they come first). */
  burnInCount: number;
}

/** Milliseconds one frame is held during playback. 12 frames a second. */
export const FRAME_MS = 84;

/** How opaque a species square is drawn over the terrain. */
const SPECIES_ALPHA = 0.82;

/** What the readout says for a frame. */
export function frameLabel(f: TimelapseFrame): string {
  return f.phase === "burnin"
    ? `burn-in generation ${f.stamp} of 400`
    : `play, sim tick ${f.stamp.toLocaleString("en-US")}`;
}

/** The line under the map: what is on screen, in numbers. */
export function frameCaption(f: TimelapseFrame): string {
  return `${frameLabel(f)} · ${f.plants.toLocaleString("en-US")} plants · ${f.species} kinds alive`;
}

/**
 * Paint one frame: the terrain at full map resolution first, then one square
 * per occupied cell in the dominant species' own colour at 82% opacity, so the
 * coastline still reads under the composition.
 */
export function paintFrame(
  ctx: CanvasRenderingContext2D,
  v: TimelapseView,
  frame: TimelapseFrame,
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  // Terrain underlay. Drawn dimmed (45% over black) so it anchors the shape of
  // the island without competing with the species colours on top of it.
  const tw = width / v.mapWidth;
  const th = height / v.mapHeight;
  ctx.fillStyle = "#05080c";
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.45;
  for (let ty = 0; ty < v.mapHeight; ty++) {
    for (let tx = 0; tx < v.mapWidth; tx++) {
      const t = v.tiles[ty * v.mapWidth + tx];
      ctx.fillStyle = OVERVIEW_COLORS[t] ?? "#111";
      ctx.fillRect(tx * tw, ty * th, tw + 1, th + 1);
    }
  }
  ctx.globalAlpha = SPECIES_ALPHA;
  const cw = width / v.cells;
  const ch = height / v.cells;
  for (let cy = 0; cy < v.cells; cy++) {
    for (let cx = 0; cx < v.cells; cx++) {
      const id = frame.cells[cy * v.cells + cx];
      if (id === EMPTY_CELL) continue;
      const sp = v.species.get(id);
      ctx.fillStyle = sp ? speciesColor(sp.hue, sp.sat, sp.daughter) : "#8a9099";
      ctx.fillRect(cx * cw, cy * ch, cw + 0.6, ch + 0.6);
    }
  }
  ctx.globalAlpha = 1;
}

/** Which species cover the most cells in a frame, most first — the legend order. */
export function legendFor(v: TimelapseView, frame: TimelapseFrame, max = 8): TimelapseSpecies[] {
  const counts = new Map<number, number>();
  for (const id of frame.cells) {
    if (id === EMPTY_CELL) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .slice(0, max)
    .map(([id]) => v.species.get(id))
    .filter((s): s is TimelapseSpecies => s !== undefined);
}

/** The section's markup. Wired up by `mountTimelapse`, which needs the same root. */
export function timelapseSectionHtml(v: TimelapseView): string {
  if (v.frames.length === 0) {
    return (
      `<div class="ch-section">species timelapse</div>` +
      `<div class="ch-chain muted">no timelapse on this island — the recording is made during a Hollow's 400-generation burn-in, and this island did not run one</div>`
    );
  }
  const last = v.frames.length - 1;
  const playFrames = v.frames.length - v.burnInCount;
  const span =
    playFrames > 0
      ? `400 burn-in generations at 1 frame per 4, then play at 1 frame per ${v.playInterval.toLocaleString("en-US")} ticks`
      : `400 burn-in generations at 1 frame per 4`;
  return `<div class="ch-section">species timelapse</div>
    <div class="tl-note">which kind holds the most ground in each 4×4-tile square, over the island's life. ${v.frames.length} frames — ${span}. Composition only: this does not show a plant fitting its own spot.</div>
    <div class="tl-wrap">
      <canvas id="tl-canvas" class="tl-canvas" width="560" height="560" role="img" aria-label="map of which plant species dominates each square of the island, over time"></canvas>
    </div>
    <div class="tl-controls">
      <button type="button" class="tl-play" id="tl-play" aria-label="play or pause the timelapse">▶ play</button>
      <input type="range" class="tl-scrub" id="tl-scrub" min="0" max="${last}" value="0" step="1" aria-label="frame">
    </div>
    <div class="tl-readout" id="tl-readout">${frameCaption(v.frames[0])}</div>
    <div class="tl-legend" id="tl-legend"></div>`;
}

/** Stop whatever playback is running. Safe to call when none is. */
export type TimelapseHandle = { stop(): void };

/**
 * Attach behaviour to the markup `timelapseSectionHtml` produced inside `root`.
 * Returns a handle whose `stop` cancels playback — the caller MUST call it
 * before replacing the panel's innerHTML, or the animation frame callback keeps
 * running against detached elements.
 *
 * Returns null when there is nothing to play or the canvas has no 2D context
 * (a test DOM), so neither case throws.
 */
export function mountTimelapse(root: ParentNode, v: TimelapseView): TimelapseHandle | null {
  if (v.frames.length === 0) return null;
  const canvas = root.querySelector<HTMLCanvasElement>("#tl-canvas");
  const scrub = root.querySelector<HTMLInputElement>("#tl-scrub");
  const playBtn = root.querySelector<HTMLButtonElement>("#tl-play");
  const readout = root.querySelector<HTMLElement>("#tl-readout");
  const legend = root.querySelector<HTMLElement>("#tl-legend");
  if (!canvas || !scrub || !playBtn || !readout || !legend) return null;
  const ctx = canvas.getContext ? canvas.getContext("2d") : null;
  if (!ctx) return null;

  let index = 0;
  let playing = false;
  let raf = 0;
  let lastMs = 0;
  let stopped = false;

  const draw = (): void => {
    const frame = v.frames[index];
    paintFrame(ctx, v, frame, canvas.width, canvas.height);
    readout.textContent = frameCaption(frame);
    legend.innerHTML = legendFor(v, frame)
      .map(
        (s) =>
          `<span class="ch-sl"><i style="background:${speciesColor(s.hue, s.sat, s.daughter)}"></i>${escapeText(s.name)}</span>`,
      )
      .join("");
    if (scrub.valueAsNumber !== index) scrub.value = String(index);
  };

  const step = (ms: number): void => {
    if (stopped) return;
    if (playing && ms - lastMs >= FRAME_MS) {
      lastMs = ms;
      // Loops back to the founder frame, so the animation runs without anyone
      // pressing anything twice.
      index = (index + 1) % v.frames.length;
      draw();
    }
    raf = requestAnimationFrame(step);
  };

  playBtn.addEventListener("click", () => {
    playing = !playing;
    playBtn.textContent = playing ? "❚❚ pause" : "▶ play";
  });
  scrub.addEventListener("input", () => {
    index = Math.max(0, Math.min(v.frames.length - 1, Math.round(scrub.valueAsNumber)));
    draw();
  });

  draw();
  if (typeof requestAnimationFrame === "function") raf = requestAnimationFrame(step);
  return {
    stop(): void {
      stopped = true;
      playing = false;
      if (raf && typeof cancelAnimationFrame === "function") cancelAnimationFrame(raf);
    },
  };
}

function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}
