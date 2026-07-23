// The World-Lab (?sim=1, the default door) — the construct-and-place bench.
//
// Task 4 stands up the scaffold: a real starter construct (playable-island /
// biome-sampler / single-biome), a headless SimKernel over it, and — the
// point of this task — the SAME Renderer the island itself draws with. No
// stand-in meadow, no flat green field: the bench shows real tile art,
// because it IS the game's rendering pipeline, just fed a construct instead
// of a played island and a null player. No placement or time yet (that's
// Tasks 5-6); this is the living, real-tile canvas you can see and pan.
//
// Chrome mirrors simulator.ts's codex voice and token usage, kept minimal:
// an eyebrow, a way back, and a starter selector along the bottom.

import { CritterSpecies, generateCritterSpecies } from "../life/fauna";
import { Flora } from "../life/flora";
import { SimKernel } from "../life/kernel";
import { PlantSpecies, generatePlantSpecies } from "../life/species";
import { Renderer, Scene } from "../render/renderer";
import { StarterKind, buildConstruct } from "../world/construct";
import { TILE_SIZE } from "../world/config";
import { WorldMap } from "../world/types";

const STARTERS: { kind: StarterKind; name: string }[] = [
  { kind: "playable-island", name: "Playable Island" },
  { kind: "biome-sampler", name: "Biome Sampler" },
  { kind: "single-biome", name: "Single Biome" },
];

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

export function startWorldLab(): void {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const seed = seedFromUrl();
  let starter: StarterKind =
    (new URL(location.href).searchParams.get("starter") as StarterKind) || "biome-sampler";

  let map!: WorldMap, kernel!: SimKernel, renderer!: Renderer;
  let camX = 0,
    camY = 0;

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
  function build(): void {
    map = buildConstruct(starter, seed);
    const species: PlantSpecies[] = generatePlantSpecies(seed);
    // An empty scratch Flora, just so generateCritterSpecies has something to
    // read (dens fall back to the construct's spawn point with no plants
    // placed) — the kernel gets its own real Flora; placement is Task 5's job.
    const scratch = new Flora(map, species, seed, {}, { tick: 0, plants: [] });
    const critterSpecies: CritterSpecies[] = generateCritterSpecies(seed, map, scratch, species);
    kernel = new SimKernel({ map, plantSpecies: species, critterSpecies, seed });
    if (!renderer) renderer = new Renderer(canvas, map);
    else renderer.setMap(map);
    fitCameraToConstruct();
  }
  build();

  // ── the codex chrome: eyebrow, back button, starter selector ────────────
  const ui = buildChrome(starter);
  ui.onStarter = (k) => {
    starter = k;
    build();
    ui.setStarter(starter);
  };

  // ── pan input: arrow keys nudge the camera (clamped); Esc leaves ────────
  const PAN_STEP = TILE_SIZE * 2;
  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      camX = clampX(camX - PAN_STEP);
      e.preventDefault();
    } else if (e.key === "ArrowRight") {
      camX = clampX(camX + PAN_STEP);
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

  // ── the loop: draw the construct + the kernel's current life every frame.
  // No stepping yet (Task 6) — a static-but-rendered bench, in real tile art.
  function frame(now: number): void {
    renderer.draw(camX, camY, sceneFor(kernel), now);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ── the DOM chrome: a codex-styled eyebrow + back button + starter selector,
// consuming only :root tokens (no hardcoded chrome hexes) — mirrors
// simulator.ts's buildChrome so the two benches read as one family.

interface Chrome {
  onStarter: (k: StarterKind) => void;
  setStarter: (k: StarterKind) => void;
}

function buildChrome(initial: StarterKind): Chrome {
  const MONO = "font: 11px var(--mono); letter-spacing: 0.06em;";
  const btn = (active: boolean): string =>
    `${MONO} text-transform: uppercase; color: ${active ? "rgb(var(--abyss))" : "rgba(228,236,242,0.72)"};` +
    ` background: ${active ? "rgb(var(--lumen))" : "rgba(23,42,54,0.72)"};` +
    ` border: 1px solid ${active ? "rgb(var(--lumen))" : "rgba(127,224,196,0.28)"};` +
    ` border-radius: 4px; padding: 6px 11px; cursor: pointer;`;

  const eyebrow = document.createElement("div");
  eyebrow.innerHTML =
    `<span style="font: 10px var(--mono); letter-spacing: 0.24em; text-transform: uppercase; color: rgb(var(--lumen));">Wonder · the Simulator</span>` +
    `<div style="font-family: var(--serif); font-variant: small-caps; letter-spacing: 0.04em; font-size: 22px; color: var(--ink-bright); margin-top: 2px;">the world-lab</div>` +
    `<div style="font: italic 12px var(--serif); color: rgba(228,236,242,0.55); margin-top: 2px;">a construct built to study — real tile art, a headless kernel underneath. Arrow keys pan; Esc sails you home.</div>`;
  eyebrow.style.cssText = "position: fixed; left: 18px; top: 16px; z-index: 5; pointer-events: none; user-select: none;";
  document.body.appendChild(eyebrow);

  // the way back, always visible in the header: the bench is a door, not a
  // trap — dropping the ?sim flag lands on the island saved on the way in
  const back = document.createElement("button");
  back.textContent = "back to the island ↩";
  back.style.cssText = btn(false) + " position: fixed; right: 18px; top: 18px; z-index: 6;";
  back.onclick = leaveBench;
  document.body.appendChild(back);

  const bar = document.createElement("div");
  bar.style.cssText =
    "position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 6;" +
    " display: flex; align-items: center; gap: 8px; padding: 9px 12px;" +
    " background: var(--panel); border-radius: var(--radius); box-shadow: var(--frame); user-select: none;";
  document.body.appendChild(bar);

  const label = (t: string): HTMLElement => {
    const el = document.createElement("span");
    el.textContent = t;
    el.style.cssText = `${MONO} text-transform: uppercase; color: rgba(228,236,242,0.4);`;
    return el;
  };
  bar.appendChild(label("construct"));

  const chrome = {} as Chrome;
  const starterBtns = STARTERS.map(({ kind, name }) => {
    const b = document.createElement("button");
    b.textContent = name;
    b.style.cssText = btn(kind === initial);
    b.onclick = () => chrome.onStarter(kind);
    bar.appendChild(b);
    return { kind, b };
  });

  chrome.setStarter = (k) => {
    for (const { kind, b } of starterBtns) b.style.cssText = btn(kind === k);
  };
  chrome.onStarter = () => {};
  return chrome;
}
