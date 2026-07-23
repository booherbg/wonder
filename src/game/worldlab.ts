// The World-Lab (?sim=1, the default door) — the construct-and-place bench.
//
// Task 4 stood up the scaffold: a real starter construct (playable-island /
// biome-sampler / single-biome), a headless SimKernel over it, and the SAME
// Renderer the island itself draws with — real tile art, no stand-in meadow.
// Task 5 (this file, now) makes it interactive: a palette of the seed's
// habitat-gated plant kinds + rolled critter kinds along the bottom, and a
// click on the construct drops the selected kind into the kernel. A `?demo`
// dev aid seeds a deterministic disperser→plant→feeder chain near the
// construct's centre, so a screenshot (or a quick manual check) shows
// populated life without a click.
//
// Chrome mirrors simulator.ts's codex voice and token usage, kept minimal:
// an eyebrow, a way back, a starter selector, and now the palette itself.

import { CritterSpecies, appetite, generateCritterSpecies } from "../life/fauna";
import { Flora } from "../life/flora";
import { chainLinks } from "../life/foodweb";
import { hsl } from "../life/genome";
import { Fidelity, SimKernel } from "../life/kernel";
import { PlantSpecies, generatePlantSpecies } from "../life/species";
import { Renderer, Scene } from "../render/renderer";
import { StarterKind, buildConstruct } from "../world/construct";
import { TILE_SIZE } from "../world/config";
import { Tile, WorldMap } from "../world/types";
import { habitatsOf, placeablePlants } from "./simRoster";

const STARTERS: { kind: StarterKind; name: string }[] = [
  { kind: "playable-island", name: "Playable Island" },
  { kind: "biome-sampler", name: "Biome Sampler" },
  { kind: "single-biome", name: "Single Biome" },
];

// The palette's current pick: a plant or critter kind by id, or null for the
// select tool (the default) — Task 7 wires a null-selection click into an
// inspect readout; this task only wires the placing half.
type Selected = { kind: "plant" | "critter"; id: number } | null;

// The way back: drop ?sim and the island resumes — it was saved on the way
// in, and its seed rides the URL, so the bench is never a one-way door.
function leaveBench(): void {
  const url = new URL(location.href);
  url.searchParams.delete("sim");
  location.href = url.toString();
}

function seedFromUrl(): number {
  const raw = new URL(location.href).searchParams.get("seed");
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 20260721;
}

// The kernel's current plants/critters, dressed as the minimal Scene the game
// Renderer wants — the same shape main.ts assembles for renderer.draw, minus
// everything that belongs to a played island (no player, no home, no beast,
// no weather). darkness stays 0: the bench is a workbench, always lit.
function sceneFor(kernel: SimKernel): Scene {
  return {
    player: null,
    flora: kernel.flora,
    plantSpecies: kernel.plantSpecies,
    critters: kernel.critters,
    critterSpecies: kernel.critterSpecies,
    darkness: 0,
  };
}

// World px at the centre of a tile — every placement (click or demo) snaps to
// this, so a plant lands square on the tile you meant, not some sub-tile
// jitter position.
function worldPxCenter(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 };
}

// The nearest tile of a given type to (cx, cy), by expanding Chebyshev rings.
// maxR spans the whole map, so from ANY interior start point this always
// finds a match that's known to exist somewhere on the map (habitatsOf
// already proved the tile type is present) — deterministic, no rng.
function nearestTileOf(map: WorldMap, tile: Tile, cx: number, cy: number): { x: number; y: number } | null {
  const maxR = Math.max(map.width, map.height);
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      const edgeRow = Math.abs(dy) === r;
      for (let dx = -r; dx <= r; dx++) {
        if (!edgeRow && Math.abs(dx) !== r) continue; // only the ring's perimeter, not its inside
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) continue;
        if (map.tiles[ty * map.width + tx] === tile) return { x: tx, y: ty };
      }
    }
  }
  return null;
}

// The ?demo dev aid: seeds a deterministic disperser→source→feeder chain (the
// spec's own chainLinks — never reimplemented) a few tiles apart near the
// construct's centre, so a screenshot shows a populated bench with no click.
// Best-effort: not every seed/construct rolls a full CLOSABLE, PLACEABLE
// chain, so a seed that comes up empty falls back to one plant + the critter
// whose palate comes nearest to it, and says so on the console.
function seedDemoScenario(map: WorldMap, kernel: SimKernel, placeable: PlantSpecies[]): void {
  if (placeable.length === 0) {
    console.warn("world-lab demo: no placeable plant kinds on this construct — skipping the demo scenario");
    return;
  }
  const placeableIds = new Set(placeable.map((p) => p.id));
  // near the construct's centre, but nudged OFF its exact spawn point: every
  // still-unplaced critter species' den defaults there (fauna.ts's findDen
  // fallback, empty scratch flora), so a demo plant landing on that same
  // tile reads as "smothered by a hut," not a clean bloom. A few tiles off
  // keeps the "near the centre" spirit while staying legible in a screenshot.
  const cx = Math.min(map.width - 1, Math.floor(map.width / 2) + Math.min(8, Math.floor(map.width / 6)));
  const cy = Math.max(0, Math.floor(map.height / 2) - Math.min(6, Math.floor(map.height / 6)));

  const link = chainLinks(kernel.plantSpecies, kernel.critterSpecies).find(
    (l) => placeableIds.has(l.source.id) && placeableIds.has(l.feeder.id),
  );
  if (link) {
    const sourceTile = nearestTileOf(map, link.source.habitat, cx, cy)!;
    const sp = worldPxCenter(sourceTile.x, sourceTile.y);
    kernel.placePlant(link.source.id, sp.x, sp.y);

    const disperserTile = { x: Math.min(map.width - 1, sourceTile.x + 3), y: sourceTile.y };
    const dp = worldPxCenter(disperserTile.x, disperserTile.y);
    kernel.placeCritter(link.disperser.id, dp.x, dp.y);

    const feederTile = nearestTileOf(
      map,
      link.feeder.habitat,
      sourceTile.x,
      Math.min(map.height - 1, sourceTile.y + 3),
    )!;
    const fp = worldPxCenter(feederTile.x, feederTile.y);
    kernel.placePlant(link.feeder.id, fp.x, fp.y);
    return;
  }

  console.warn(
    "world-lab demo: no placeable disperser→plant→feeder chain for this seed/construct " +
      "— falling back to one plant + its nearest-palate critter",
  );
  const source = placeable[0];
  const sourceTile = nearestTileOf(map, source.habitat, cx, cy)!;
  const sp = worldPxCenter(sourceTile.x, sourceTile.y);
  kernel.placePlant(source.id, sp.x, sp.y);

  let best: CritterSpecies | null = null;
  let bestFit = -Infinity;
  for (const c of kernel.critterSpecies) {
    const fit = appetite(c.palate, source.archetype);
    if (fit > bestFit) {
      bestFit = fit;
      best = c;
    }
  }
  if (best) {
    const disperserTile = { x: Math.min(map.width - 1, sourceTile.x + 3), y: sourceTile.y };
    const dp = worldPxCenter(disperserTile.x, disperserTile.y);
    kernel.placeCritter(best.id, dp.x, dp.y);
  }
}

export function startWorldLab(): void {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const seed = seedFromUrl();
  const demoRequested = new URL(location.href).searchParams.has("demo");
  // The ?run=N dev aid: pre-steps the kernel N ticks on load (full fidelity),
  // so a screenshot lands on an already-evolved bench instead of a freshly
  // placed one. Bounded so a stray huge N can't hang the tab. Wall-clock never
  // enters here — this is just kernel.step() called N times up front, exactly
  // as deterministic as any other call to it.
  const runTicks = ((): number => {
    const raw = new URL(location.href).searchParams.get("run");
    if (raw === null) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.min(Math.floor(n), 5000) : 0;
  })();
  let starter: StarterKind =
    (new URL(location.href).searchParams.get("starter") as StarterKind) || "biome-sampler";

  let map!: WorldMap, kernel!: SimKernel, renderer!: Renderer;
  let camX = 0,
    camY = 0;
  let plantKinds: PlantSpecies[] = [];
  let critterKinds: CritterSpecies[] = [];
  let selected: Selected = null;
  let ui: Chrome | undefined;

  // Clamp a camera axis to the construct's bounds — UNLESS the fit zoom has
  // left this axis of the construct smaller than the view (a non-square
  // construct in a non-square window: one axis binds the fit, the other has
  // slack). Then there's nowhere useful to pan — hold the negative, centred
  // offset instead of flooring to 0, or the construct would hug one edge
  // rather than sit centred with even letterboxing on both sides.
  const clampAxis = (pos: number, worldSize: number, viewSize: number): number => {
    const maxOffset = worldSize - viewSize;
    return maxOffset <= 0 ? maxOffset / 2 : Math.max(0, Math.min(pos, maxOffset));
  };
  const clampX = (x: number): number => clampAxis(x, map.width * TILE_SIZE, renderer.viewWidth);
  const clampY = (y: number): number => clampAxis(y, map.height * TILE_SIZE, renderer.viewHeight);
  function centreCamera(): void {
    camX = clampX((map.width * TILE_SIZE - renderer.viewWidth) / 2);
    camY = clampY((map.height * TILE_SIZE - renderer.viewHeight) / 2);
  }

  // Zoom out (or in) until the WHOLE construct fits the window, then centre
  // on it — the swarm bench's fit-to-field (simulator.ts's `scale = Math.min
  // ((w-margin)/FIELD_W, (h-margin)/FIELD_H)`), done through the real
  // Renderer's focus lens instead of a hand-rolled scale. Reads viewWidth/
  // viewHeight at zoom 1 first (the lens's own unscaled unit), so the fit
  // math never has to know SCALE or TILE_SIZE's relationship directly.
  const FIT_MARGIN = 0.92; // a little breathing room around the construct's edges
  function fitCameraToConstruct(): void {
    renderer.setZoom(1);
    const baseW = renderer.viewWidth;
    const baseH = renderer.viewHeight;
    const worldW = map.width * TILE_SIZE;
    const worldH = map.height * TILE_SIZE;
    const zoom = Math.min(2, (baseW * FIT_MARGIN) / worldW, (baseH * FIT_MARGIN) / worldH);
    renderer.setZoom(zoom);
    centreCamera();
  }

  // (Re)builds the construct + kernel from the current starter/seed. Reused
  // on first boot and every time the starter selector is changed — the three
  // starters differ in size, so the fit is recomputed every time. The
  // renderer's atlas is expensive to rebuild, so it's made once and re-mapped.
  // The palette is rebuilt here too: a fresh construct may open or close
  // different habitats, so `plantKinds` is re-filtered every time, and the
  // selection resets to the select tool (a stale id shouldn't survive a
  // rebuild). ?demo re-seeds its scenario against the new kernel as well.
  function build(): void {
    map = buildConstruct(starter, seed);
    const species: PlantSpecies[] = generatePlantSpecies(seed);
    // An empty scratch Flora, just so generateCritterSpecies has something to
    // read (dens fall back to the construct's spawn point with no plants
    // placed) — the kernel gets its own real Flora; placement is this task's job.
    const scratch = new Flora(map, species, seed, {}, { tick: 0, plants: [] });
    const critterSpecies: CritterSpecies[] = generateCritterSpecies(seed, map, scratch, species);
    kernel = new SimKernel({ map, plantSpecies: species, critterSpecies, seed });
    if (!renderer) renderer = new Renderer(canvas, map);
    else renderer.setMap(map);
    fitCameraToConstruct();

    plantKinds = placeablePlants(kernel.plantSpecies, habitatsOf(map));
    critterKinds = kernel.critterSpecies;
    selected = null;
    if (demoRequested) seedDemoScenario(map, kernel, plantKinds);
    if (runTicks > 0) kernel.step(runTicks, "full");
    if (ui) {
      ui.setPalette(plantKinds, critterKinds);
      ui.setSelected(selected);
    }
  }
  build();

  // ── the codex chrome: eyebrow, back button, starter selector, palette ───
  ui = buildChrome(starter);
  ui.onStarter = (k) => {
    starter = k;
    build(); // rebuilds the palette + resets selection; setStarter just re-lights the buttons
    ui!.setStarter(starter);
  };
  ui.onSelect = (s) => {
    selected = s;
    ui!.setSelected(selected);
  };
  ui.setPalette(plantKinds, critterKinds);
  ui.setSelected(selected);

  // ── time controls: pause/play/step-1/step-N + fidelity ──────────────────
  // `playing` paces the frame loop's calls into kernel.step(); pausing simply
  // STOPS calling step() — rendering below never halts, so a paused world
  // still pans and can be inspected. Wall-clock (frame's `now`) only ever
  // decides WHEN/HOW MANY step() calls happen; it's never sim input, so play
  // is exactly as deterministic tick-for-tick as Step/Step N/`?run` — only
  // real-time pacing (not outcome) varies with the browser's frame rate.
  let playing = false;
  let fidelity: Fidelity = "full";
  let stepN = 20;
  function refreshTimeState(): void {
    ui!.setTimeState({ playing, fidelity, stepN });
  }
  ui.onPlay = () => {
    playing = !playing;
    refreshTimeState();
  };
  ui.onStep = () => {
    playing = false;
    kernel.step(1, fidelity);
    refreshTimeState();
  };
  ui.onStepN = () => {
    playing = false;
    kernel.step(stepN, fidelity);
    refreshTimeState();
  };
  ui.onStepNChange = (n) => {
    stepN = Math.max(1, Math.min(5000, Math.floor(n) || 1));
  };
  ui.onFidelity = (f) => {
    fidelity = f;
    refreshTimeState();
  };
  refreshTimeState();
  ui.setTick(kernel.tick);

  // ── pan input: arrow keys nudge the camera (clamped); Esc leaves ────────
  const PAN_STEP = TILE_SIZE * 2;
  window.addEventListener("keydown", (e) => {
    // the Step N number input handles its own arrow/typing keys (native
    // increment/decrement) — don't let the global bindings below steal them
    if (e.target instanceof HTMLElement && e.target.tagName === "INPUT") return;
    if (e.key === " ") {
      e.preventDefault();
      playing = !playing;
      refreshTimeState();
    } else if (e.key === "ArrowRight" && e.shiftKey) {
      // shift+→ steps N — → alone is claimed by stepping (below), so this
      // bench's camera pans on ←/↑/↓ only; the fit-to-window camera already
      // shows the whole construct in the common case, so the lost pan-right
      // axis costs little (see fitCameraToConstruct's comment)
      e.preventDefault();
      playing = false;
      kernel.step(stepN, fidelity);
      refreshTimeState();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      playing = false;
      kernel.step(1, fidelity);
      refreshTimeState();
    } else if (e.key === "ArrowLeft") {
      camX = clampX(camX - PAN_STEP);
      e.preventDefault();
    } else if (e.key === "ArrowUp") {
      camY = clampY(camY - PAN_STEP);
      e.preventDefault();
    } else if (e.key === "ArrowDown") {
      camY = clampY(camY + PAN_STEP);
      e.preventDefault();
    } else if (e.key === "Escape") {
      leaveBench();
    }
  });
  window.addEventListener("resize", () => {
    renderer.resize();
    fitCameraToConstruct();
  });

  // ── click-to-place: screen px → world px through the camera, minding both
  // the fit-to-window zoom AND the centred offset (the same lens the render
  // loop reads), then tile-snapped so a plant lands square on the tile you
  // clicked rather than some sub-tile jitter position. The select tool
  // (selected === null, the default) doesn't place anything here — Task 7
  // wires its click into the inspect readout.
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const wx = camX + (e.offsetX / rect.width) * renderer.viewWidth;
    const wy = camY + (e.offsetY / rect.height) * renderer.viewHeight;
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return; // off the construct — nothing to click
    if (!selected) return; // the select tool: Task 7's job, not this one
    const { x: px, y: py } = worldPxCenter(tx, ty);
    if (selected.kind === "plant") {
      const p = kernel.placePlant(selected.id, px, py);
      if (p === null && ui) ui.flashNote("won't root here — wrong habitat");
    } else {
      kernel.placeCritter(selected.id, px, py);
    }
  });

  // ── the loop: while playing, pace kernel.step() calls off the wall clock
  // (an accumulator, guard-capped as simulator.ts's own tick() loop is, so a
  // backgrounded tab can't unleash a huge catch-up burst on return); pausing
  // just stops calling step() — renderer.draw below always runs, so a paused
  // world still pans and renders. The tick readout tracks kernel.tick every
  // frame regardless of play state.
  const TICK_MS = 240; // sim heartbeat at 1× — brisk enough to watch, per Task 6's brief
  let acc = 0;
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(now - last, 100);
    last = now;
    if (playing) {
      acc += dt;
      let ticks = 0;
      while (acc >= TICK_MS && ticks < 8) {
        acc -= TICK_MS;
        ticks++;
      }
      if (ticks > 0) kernel.step(ticks, fidelity);
    }
    renderer.draw(camX, camY, sceneFor(kernel), now);
    ui!.setTick(kernel.tick);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ── the DOM chrome: a codex-styled eyebrow + back button + starter selector
// + palette, consuming only :root tokens (no hardcoded chrome hexes) —
// mirrors simulator.ts's buildChrome so the two benches read as one family.

interface Chrome {
  onStarter: (k: StarterKind) => void;
  setStarter: (k: StarterKind) => void;
  onSelect: (s: Selected) => void;
  setPalette: (plants: PlantSpecies[], critters: CritterSpecies[]) => void;
  setSelected: (s: Selected) => void;
  flashNote: (msg: string) => void;
  // time controls (Task 6)
  onPlay: () => void;
  onStep: () => void;
  onStepN: () => void;
  onStepNChange: (n: number) => void;
  onFidelity: (f: Fidelity) => void;
  setTimeState: (s: { playing: boolean; fidelity: Fidelity; stepN: number }) => void;
  setTick: (tick: number) => void;
}

function buildChrome(initial: StarterKind): Chrome {
  const MONO = "font: 11px var(--mono); letter-spacing: 0.06em;";
  const btn = (active: boolean): string =>
    `${MONO} text-transform: uppercase; color: ${active ? "rgb(var(--abyss))" : "rgba(228,236,242,0.72)"};` +
    ` background: ${active ? "rgb(var(--lumen))" : "rgba(23,42,54,0.72)"};` +
    ` border: 1px solid ${active ? "rgb(var(--lumen))" : "rgba(127,224,196,0.28)"};` +
    ` border-radius: 4px; padding: 6px 11px; cursor: pointer;`;
  // a palette chip keeps the codex button's chrome but tints its edge (and,
  // once selected, its whole face) with the plant's own archetype hue — the
  // row reads as a little box of swatches, not a flat list of names
  const plantBtn = (active: boolean, tint: string): string =>
    `${MONO} text-transform: none; color: ${active ? "rgb(var(--abyss))" : "rgba(228,236,242,0.82)"};` +
    ` background: ${active ? tint : "rgba(23,42,54,0.72)"};` +
    ` border: 1px solid ${tint}; border-left: 4px solid ${tint};` +
    ` border-radius: 4px; padding: 5px 10px 5px 8px; cursor: pointer; white-space: nowrap;`;

  const eyebrow = document.createElement("div");
  eyebrow.innerHTML =
    `<span style="font: 10px var(--mono); letter-spacing: 0.24em; text-transform: uppercase; color: rgb(var(--lumen));">Wonder · the Simulator</span>` +
    `<div style="font-family: var(--serif); font-variant: small-caps; letter-spacing: 0.04em; font-size: 22px; color: var(--ink-bright); margin-top: 2px;">the world-lab</div>` +
    `<div style="font: italic 12px var(--serif); color: rgba(228,236,242,0.55); margin-top: 2px;">a construct built to study — pick a kind below, click the construct to place it. space plays · → steps · shift+→ steps n; ← ↑ ↓ pan; Esc sails you home.</div>`;
  eyebrow.style.cssText = "position: fixed; left: 18px; top: 16px; z-index: 5; pointer-events: none; user-select: none;";
  document.body.appendChild(eyebrow);

  // the way back, always visible in the header: the bench is a door, not a
  // trap — dropping the ?sim flag lands on the island saved on the way in
  const back = document.createElement("button");
  back.textContent = "back to the island ↩";
  back.style.cssText = btn(false) + " position: fixed; right: 18px; top: 18px; z-index: 6;";
  back.onclick = leaveBench;
  document.body.appendChild(back);

  // The bottom stack: the starter/time bar and the palette panel both live
  // here now, as plain flow children laid out bottom-up (column-reverse) —
  // NOT two independently `position: fixed` panels at hardcoded offsets
  // (66px used to assume a short one-line bar; Task 6's wider bar can wrap
  // to two lines on a construct with a big palette, and a fixed offset would
  // then let the two panels collide). The flexbox does the stacking math
  // instead, so either panel can grow without colliding with the other.
  const stack = document.createElement("div");
  stack.style.cssText =
    "position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 6;" +
    " display: flex; flex-direction: column-reverse; align-items: center; gap: 8px; max-width: 92vw;";
  document.body.appendChild(stack);

  const bar = document.createElement("div");
  bar.style.cssText =
    "display: flex; align-items: center; gap: 8px; padding: 9px 12px; flex-wrap: wrap; justify-content: center;" +
    " max-width: 100%; background: var(--panel); border-radius: var(--radius); box-shadow: var(--frame); user-select: none;";
  stack.appendChild(bar);

  const label = (t: string): HTMLElement => {
    const el = document.createElement("span");
    el.textContent = t;
    el.style.cssText = `${MONO} text-transform: uppercase; color: rgba(228,236,242,0.4);`;
    return el;
  };
  const sep = (): HTMLElement => {
    const el = document.createElement("span");
    el.style.cssText = "width: 1px; height: 22px; background: rgba(127,224,196,0.18);";
    return el;
  };
  // bundles a label with its value/buttons into one flex item, so if the bar
  // wraps (a wide starter + time strip on a narrow window) a cluster wraps
  // as a whole rather than splitting a label from its value
  const group = (...children: HTMLElement[]): HTMLElement => {
    const el = document.createElement("div");
    el.style.cssText = "display: flex; align-items: center; gap: 6px; white-space: nowrap;";
    el.append(...children);
    return el;
  };

  const chrome = {} as Chrome;
  const starterBtns = STARTERS.map(({ kind, name }) => {
    const b = document.createElement("button");
    b.textContent = name;
    b.style.cssText = btn(kind === initial);
    b.onclick = () => chrome.onStarter(kind);
    return { kind, b };
  });
  bar.appendChild(group(label("construct"), ...starterBtns.map((s) => s.b)));

  chrome.setStarter = (k) => {
    for (const { kind, b } of starterBtns) b.style.cssText = btn(kind === k);
  };
  chrome.onStarter = () => {};

  // ── time controls: pause/play, step, step-N, fidelity, tick readout —
  // same bar as the starter selector (a sep() divides the two clusters), so
  // the strip reads as one control surface, per simulator.ts's own bar. ────
  bar.appendChild(sep());
  bar.appendChild(label("time"));
  const playBtn = document.createElement("button");
  playBtn.id = "play-btn";
  playBtn.textContent = "play";
  playBtn.style.cssText = btn(false);
  playBtn.onclick = () => chrome.onPlay();
  bar.appendChild(playBtn);

  const stepBtn = document.createElement("button");
  stepBtn.id = "step-btn";
  stepBtn.textContent = "step";
  stepBtn.style.cssText = btn(false);
  stepBtn.onclick = () => chrome.onStep();
  bar.appendChild(stepBtn);

  const stepNBtn = document.createElement("button");
  stepNBtn.id = "stepn-btn";
  stepNBtn.textContent = "step n";
  stepNBtn.style.cssText = btn(false);
  stepNBtn.onclick = () => chrome.onStepN();

  const stepNInput = document.createElement("input");
  stepNInput.id = "stepn-input";
  stepNInput.type = "number";
  stepNInput.min = "1";
  stepNInput.max = "5000";
  stepNInput.value = "20";
  stepNInput.style.cssText =
    `${MONO} width: 52px; color: var(--ink-bright); background: rgba(23,42,54,0.72);` +
    " border: 1px solid rgba(127,224,196,0.28); border-radius: 4px; padding: 5px 6px;";
  stepNInput.oninput = () => chrome.onStepNChange(Number(stepNInput.value));
  bar.appendChild(group(stepNBtn, stepNInput));

  bar.appendChild(sep());
  const fidelityDefs: { f: Fidelity; name: string }[] = [
    { f: "plants", name: "plants" },
    { f: "full", name: "full" },
  ];
  const fidelityBtns = fidelityDefs.map(({ f, name }) => {
    const b = document.createElement("button");
    b.textContent = name;
    b.style.cssText = btn(false);
    b.onclick = () => chrome.onFidelity(f);
    return { f, b };
  });
  bar.appendChild(group(label("fidelity"), ...fidelityBtns.map((f) => f.b)));

  bar.appendChild(sep());
  const tickValue = document.createElement("span");
  tickValue.id = "tick-readout"; // a stable hook: the codex plate has no other bare-number field
  tickValue.style.cssText = `${MONO} color: var(--ink-bright); min-width: 34px; text-align: right;`;
  tickValue.textContent = "0";
  bar.appendChild(group(label("tick"), tickValue));

  chrome.onPlay = () => {};
  chrome.onStep = () => {};
  chrome.onStepN = () => {};
  chrome.onStepNChange = () => {};
  chrome.onFidelity = () => {};
  chrome.setTimeState = ({ playing, fidelity, stepN }) => {
    playBtn.textContent = playing ? "pause" : "play";
    for (const { f, b } of fidelityBtns) b.style.cssText = btn(f === fidelity);
    if (Number(stepNInput.value) !== stepN) stepNInput.value = String(stepN);
  };
  chrome.setTick = (tick) => {
    tickValue.textContent = String(tick);
  };

  // ── the palette: a select tool + two rows (plants tinted by hue, critters
  // by name), docked just above the starter/time bar (both live in `stack`
  // now) so the two read as one strip of chrome. A third quiet row carries
  // the "won't root here" note. ────────────────────────────────────────────
  const palette = document.createElement("div");
  palette.style.cssText =
    "max-width: 88vw; display: flex; flex-direction: column; gap: 6px; padding: 9px 12px;" +
    " background: var(--panel); border-radius: var(--radius); box-shadow: var(--frame); user-select: none;";
  stack.appendChild(palette);

  const plantRow = document.createElement("div");
  plantRow.style.cssText = "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;";
  const critterRow = document.createElement("div");
  critterRow.style.cssText = "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;";
  const hint = document.createElement("div");
  hint.style.cssText = `${MONO} color: rgb(var(--rose)); min-height: 13px; opacity: 0; transition: opacity 0.15s;`;
  palette.append(plantRow, critterRow, hint);

  const selectBtn = document.createElement("button");
  selectBtn.textContent = "select";
  selectBtn.style.cssText = btn(true); // null selection is the default
  selectBtn.onclick = () => chrome.onSelect(null);
  plantRow.appendChild(selectBtn);
  plantRow.appendChild(label("plant"));
  critterRow.appendChild(label("critter"));

  let plantBtns: { id: number; b: HTMLButtonElement; tint: string }[] = [];
  let critterBtns: { id: number; b: HTMLButtonElement }[] = [];
  let hintTimer: number | undefined;

  chrome.setPalette = (plants, critters) => {
    for (const { b } of plantBtns) b.remove();
    for (const { b } of critterBtns) b.remove();
    plantBtns = plants.map((sp) => {
      const b = document.createElement("button");
      b.textContent = sp.name.toLowerCase();
      const tint = hsl(sp.archetype.hue, 0.62, 0.5);
      b.style.cssText = plantBtn(false, tint);
      b.onclick = () => chrome.onSelect({ kind: "plant", id: sp.id });
      plantRow.appendChild(b);
      return { id: sp.id, b, tint };
    });
    critterBtns = critters.map((c) => {
      const b = document.createElement("button");
      b.textContent = c.name.toLowerCase();
      b.style.cssText = btn(false);
      b.onclick = () => chrome.onSelect({ kind: "critter", id: c.id });
      critterRow.appendChild(b);
      return { id: c.id, b };
    });
  };
  chrome.setSelected = (sel) => {
    selectBtn.style.cssText = btn(sel === null);
    for (const { id, b, tint } of plantBtns) {
      b.style.cssText = plantBtn(sel !== null && sel.kind === "plant" && sel.id === id, tint);
    }
    for (const { id, b } of critterBtns) {
      b.style.cssText = btn(sel !== null && sel.kind === "critter" && sel.id === id);
    }
  };
  chrome.flashNote = (msg) => {
    hint.textContent = msg;
    hint.style.opacity = "1";
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      hint.style.opacity = "0";
    }, 1600);
  };
  chrome.onSelect = () => {};

  return chrome;
}
