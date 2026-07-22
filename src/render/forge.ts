// The forge: shape a new island before you sail it. Headline knobs (seed,
// shape, relief, size, warmth) sit in the open; the rest of WorldConfig
// folds away under "fine grain" for anyone who wants to reach further in.
// The panel binds to a LOCAL MUTABLE COPY of the state handed to it — every
// input writes back into that copy, never the caller's object, so nothing
// here can leak a half-edited state back out except through the handlers.

import { ForgeState, FORGE_BOUNDS } from "./forgeArgs";
import { IslandRelief, IslandShape, RELIEF_PHRASE, RELIEFS, SHAPE_PHRASE, SHAPES } from "../world/generate";
import { DEFAULT_CONFIG, WorldConfig } from "../world/config";

export interface ForgeHandlers {
  preview: (state: ForgeState) => void;
  generate: (state: ForgeState) => void;
  rerollSeed: () => number;
}

// integer WorldConfig/ForgeState fields — these get step="1"; every other
// numeric field is either a [0,1] level/probability (fine step) or a scale
// (step of 1, but fractional values are still legal — just not spun to by
// the native stepper).
const INTEGER_FIELDS = new Set<string>([
  "width", "height",
  "elevationOctaves", "moistureOctaves",
  "riverCount", "riverMaxSteps", "fallMaxCount", "fallMinSpacing",
  "minWalkableRegion", "maxGenerationAttempts",
]);

function stepFor(field: string, bounds: readonly [number, number]): string {
  if (INTEGER_FIELDS.has(field)) return "1";
  if (bounds[1] - bounds[0] <= 1.0001) return "0.005"; // a [0,1] level/probability
  return "1"; // a scale (elevationScale, moistureScale, falloffSharpness, ...)
}

// "elevationScale" -> "elevation scale"
function humanize(field: string): string {
  return field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

// the fine-grain fold, grouped exactly as the brief lays out WorldConfig
const FINE_GROUPS: { title: string; fields: (keyof WorldConfig)[] }[] = [
  { title: "elevation", fields: ["elevationScale", "elevationOctaves", "falloffSharpness"] },
  { title: "moisture", fields: ["moistureScale", "moistureOctaves"] },
  { title: "sea & land bands", fields: ["seaLevel", "shoreLevel", "beachLevel", "rockLevel", "snowLevel"] },
  { title: "biomes", fields: ["forestMoisture", "marshMoisture"] },
  {
    title: "rivers & falls",
    fields: [
      "riverCount",
      "riverMinSpringElevation",
      "riverMaxSteps",
      "fallMinDrop",
      "fallMaxCount",
      "fallMinSpacing",
    ],
  },
  { title: "rarities", fields: ["craterChance"] },
  { title: "guards", fields: ["minLandFraction", "minWalkableRegion", "maxGenerationAttempts"] },
];

function panel(): HTMLElement {
  return document.getElementById("forge")!;
}

export function isForgeOpen(): boolean {
  return panel().classList.contains("on");
}

export function closeForge(): void {
  panel().classList.remove("on");
}

function cloneState(s: ForgeState): ForgeState {
  return { ...s, cfg: { ...s.cfg } };
}

function randomInRange(field: string, bounds: readonly [number, number]): number {
  const [lo, hi] = bounds;
  const v = lo + Math.random() * (hi - lo);
  if (INTEGER_FIELDS.has(field)) return Math.round(v);
  if (hi - lo <= 1.0001) return Math.round(v * 1000) / 1000;
  return Math.round(v);
}

// order-sensitive band fields and the viability guards: randomizing these
// independently is how a random roll used to produce an unviable island (a
// snowLevel below seaLevel, a minWalkableRegion no map could satisfy, ...).
// Randomize-all leaves them unset so forgeArgs() falls back to DEFAULT_CONFIG,
// which is known-viable, while everything else still rolls freely.
const RANDOMIZE_SKIP = new Set([
  "minLandFraction",
  "minWalkableRegion",
  "maxGenerationAttempts",
  "seaLevel",
  "shoreLevel",
  "beachLevel",
  "rockLevel",
  "snowLevel",
]);

let live: ForgeState | null = null;
let liveHandlers: ForgeHandlers | null = null;
let noticeEl: HTMLElement | null = null; // the "no island took shape" line under the actions

// Sets (or clears, with "") the forge's notice line — the error net's mouthpiece:
// a bad config re-opens/stays in the forge with a word about it instead of
// throwing uncaught into a white screen. A no-op if the panel isn't mounted.
export function forgeNotice(msg: string): void {
  if (noticeEl) noticeEl.textContent = msg;
}

function row(parent: HTMLElement, cls = "forge-row"): HTMLElement {
  const r = document.createElement("div");
  r.className = cls;
  parent.appendChild(r);
  return r;
}

function label(parent: HTMLElement, text: string): HTMLElement {
  const l = document.createElement("span");
  l.className = "forge-label";
  l.textContent = text;
  parent.appendChild(l);
  return l;
}

// a fine-grain WorldConfig field, bound to live.cfg[field] with bounds/step
// pulled from FORGE_BOUNDS; shown at its DEFAULT_CONFIG value until touched
function fineInput(field: keyof WorldConfig): HTMLInputElement {
  const bounds = FORGE_BOUNDS[field] ?? [0, 1];
  const input = document.createElement("input");
  input.type = "number";
  input.className = "forge-num";
  input.min = String(bounds[0]);
  input.max = String(bounds[1]);
  input.step = stepFor(field, bounds);
  const current = live!.cfg[field];
  input.value = String(current !== undefined ? current : DEFAULT_CONFIG[field]);
  input.addEventListener("change", () => {
    const n = Number(input.value);
    if (Number.isFinite(n)) (live!.cfg as any)[field] = n;
  });
  return input;
}

function render(): void {
  const el = panel();
  el.innerHTML = "";
  noticeEl = null; // the old element (if any) just left the DOM with el.innerHTML
  const state = live!;
  const handlers = liveHandlers!;

  const title = document.createElement("div");
  title.className = "forge-title";
  title.textContent = "shape a new island";
  el.appendChild(title);

  const epigraph = document.createElement("div");
  epigraph.className = "forge-epigraph";
  epigraph.textContent = "roll the dice, or reach in for exact numbers below.";
  el.appendChild(epigraph);

  // ── preview area ──────────────────────────────────────────────────────
  const preview = document.createElement("div");
  preview.className = "forge-preview";
  const canvas = document.createElement("canvas");
  canvas.className = "forge-mini";
  canvas.width = 180;
  canvas.height = 180;
  preview.appendChild(canvas);
  el.appendChild(preview);

  // ── headline controls ────────────────────────────────────────────────
  const head = document.createElement("div");
  head.className = "forge-head";
  el.appendChild(head);

  // seed
  {
    const r = row(head);
    label(r, "seed");
    const group = document.createElement("div");
    group.className = "forge-inline";
    const input = document.createElement("input");
    input.type = "number";
    input.className = "forge-num forge-seed";
    input.step = "1";
    input.value = String(state.seed);
    input.addEventListener("change", () => {
      const n = Number(input.value);
      if (Number.isFinite(n)) state.seed = Math.trunc(n);
    });
    const reroll = document.createElement("button");
    reroll.type = "button";
    reroll.className = "forge-btn forge-reroll";
    reroll.textContent = "⟳";
    reroll.title = "roll a new seed";
    reroll.addEventListener("click", () => {
      state.seed = handlers.rerollSeed();
      input.value = String(state.seed);
    });
    group.append(input, reroll);
    r.appendChild(group);
  }

  // shape
  {
    const r = row(head);
    label(r, "shape");
    const select = document.createElement("select");
    select.className = "forge-select";
    const roll = document.createElement("option");
    roll.value = "roll";
    roll.textContent = "roll";
    select.appendChild(roll);
    for (const shape of SHAPES) {
      const opt = document.createElement("option");
      opt.value = shape;
      opt.textContent = SHAPE_PHRASE[shape];
      select.appendChild(opt);
    }
    select.value = state.shape;
    select.addEventListener("change", () => {
      state.shape = select.value as IslandShape | "roll";
    });
    r.appendChild(select);
  }

  // relief
  {
    const r = row(head);
    label(r, "relief");
    const select = document.createElement("select");
    select.className = "forge-select";
    const roll = document.createElement("option");
    roll.value = "roll";
    roll.textContent = "roll";
    select.appendChild(roll);
    for (const relief of RELIEFS) {
      const opt = document.createElement("option");
      opt.value = relief;
      opt.textContent = RELIEF_PHRASE[relief];
      select.appendChild(opt);
    }
    select.value = state.relief;
    select.addEventListener("change", () => {
      state.relief = select.value as IslandRelief | "roll";
    });
    r.appendChild(select);
  }

  // size (width × height)
  {
    const r = row(head);
    label(r, "size");
    const group = document.createElement("div");
    group.className = "forge-inline";
    const wBounds = FORGE_BOUNDS.width;
    const wInput = document.createElement("input");
    wInput.type = "number";
    wInput.className = "forge-num forge-size";
    wInput.min = String(wBounds[0]);
    wInput.max = String(wBounds[1]);
    wInput.step = "1";
    wInput.value = String(state.width);
    wInput.addEventListener("change", () => {
      const n = Number(wInput.value);
      if (Number.isFinite(n)) state.width = Math.trunc(n);
    });
    const by = document.createElement("span");
    by.className = "forge-by";
    by.textContent = "×";
    const hBounds = FORGE_BOUNDS.height;
    const hInput = document.createElement("input");
    hInput.type = "number";
    hInput.className = "forge-num forge-size";
    hInput.min = String(hBounds[0]);
    hInput.max = String(hBounds[1]);
    hInput.step = "1";
    hInput.value = String(state.height);
    hInput.addEventListener("change", () => {
      const n = Number(hInput.value);
      if (Number.isFinite(n)) state.height = Math.trunc(n);
    });
    group.append(wInput, by, hInput);
    r.appendChild(group);
  }

  // warmth
  {
    const r = row(head);
    label(r, "warmth");
    const group = document.createElement("div");
    group.className = "forge-inline";
    const range = document.createElement("input");
    range.type = "range";
    range.className = "forge-range";
    const warmBounds = FORGE_BOUNDS.warm;
    range.min = String(warmBounds[0]);
    range.max = String(warmBounds[1]);
    range.step = "100";
    range.value = String(state.warm);
    const readout = document.createElement("span");
    readout.className = "forge-readout";
    readout.textContent = `${state.warm} ticks`;
    range.addEventListener("input", () => {
      readout.textContent = `${range.value} ticks`;
    });
    range.addEventListener("change", () => {
      const n = Number(range.value);
      if (Number.isFinite(n)) state.warm = n;
    });
    group.append(range, readout);
    r.appendChild(group);
  }

  // ── the fine-grain fold ──────────────────────────────────────────────
  const details = document.createElement("details");
  details.className = "forge-fine";
  const summary = document.createElement("summary");
  summary.textContent = "fine grain";
  details.appendChild(summary);
  for (const group of FINE_GROUPS) {
    const groupTitle = document.createElement("div");
    groupTitle.className = "forge-fine-title";
    groupTitle.textContent = group.title;
    details.appendChild(groupTitle);
    for (const field of group.fields) {
      const r = row(details, "forge-row forge-fine-row");
      label(r, humanize(field));
      r.appendChild(fineInput(field));
    }
  }
  el.appendChild(details);

  // ── actions ──────────────────────────────────────────────────────────
  const actions = document.createElement("div");
  actions.className = "forge-actions";
  el.appendChild(actions);

  const randomizeAll = document.createElement("button");
  randomizeAll.type = "button";
  randomizeAll.className = "forge-btn forge-act";
  randomizeAll.textContent = "⟳ randomize all";
  randomizeAll.addEventListener("click", () => {
    state.seed = handlers.rerollSeed();
    state.shape = "roll"; // let the fresh seed roll shape/relief at generation
    state.relief = "roll";
    state.cfg = {}; // drop any previously-rolled band/guard overrides — back to DEFAULT_CONFIG for those
    for (const [field, bounds] of Object.entries(FORGE_BOUNDS)) {
      if (field === "warm") continue; // handled below — it's ForgeState.warm, not a cfg field
      if (RANDOMIZE_SKIP.has(field)) continue; // left unset ⇒ forgeArgs() uses the viable DEFAULT_CONFIG value
      const v = randomInRange(field, bounds);
      if (field === "width" || field === "height") (state as any)[field] = v;
      else (state.cfg as any)[field] = v;
    }
    state.warm = randomInRange("warm", FORGE_BOUNDS.warm);
    render(); // knobs moved out from under the panel — rebuild it in place
  });
  actions.appendChild(randomizeAll);

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "forge-btn forge-act";
  previewBtn.textContent = "preview";
  previewBtn.addEventListener("click", () => handlers.preview(state));
  actions.appendChild(previewBtn);

  const generateBtn = document.createElement("button");
  generateBtn.type = "button";
  generateBtn.className = "forge-btn forge-act forge-generate";
  generateBtn.textContent = "generate";
  generateBtn.addEventListener("click", () => handlers.generate(state));
  actions.appendChild(generateBtn);

  const hint = document.createElement("div");
  hint.className = "forge-hint";
  hint.textContent = "esc to close";
  actions.appendChild(hint);

  // the error net's mouthpiece — empty until forgeNotice() has something to
  // say (a config that couldn't take shape); cleared fresh on every re-render
  noticeEl = document.createElement("div");
  noticeEl.className = "forge-notice";
  noticeEl.textContent = "";
  el.appendChild(noticeEl);

  el.scrollTop = 0;
}

// The forge, opened: a local mutable copy of the given state, bound into a
// fresh panel. Nothing here touches the caller's ForgeState except through
// the handlers (preview/generate read the live copy; rerollSeed hands back
// a fresh seed for the copy to adopt).
export function openForge(state: ForgeState, handlers: ForgeHandlers): void {
  live = cloneState(state);
  liveHandlers = handlers;
  render();
  panel().classList.add("on");
}
