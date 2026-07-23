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

import { makeRng } from "../core/rng";
import { CensusLog, sparkline } from "../life/census";
import {
  Critter,
  CritterRole,
  CritterSpecies,
  DriveName,
  Drives,
  Palate,
  appetite,
  critterDrives,
  dominantDrive,
  generateCritterSpecies,
} from "../life/fauna";
import { DEFAULT_TUNING, Flora, Plant, nearestPlant } from "../life/flora";
import { chainLinks } from "../life/foodweb";
import { Genome, PlantForm, hsl } from "../life/genome";
import { Fidelity, SimKernel } from "../life/kernel";
import {
  PROVISIONAL_ID,
  RollKind,
  nudgeCritterLooks,
  nudgePlantLooks,
  rollCritterBatch,
  rollPlantBatch,
  rollSeedFor,
  setCritterTraits,
  setPlantTraits,
} from "../life/roll";
import { WebChain, rollWeb } from "../life/rollweb";
import { PlantSpecies, generatePlantSpecies } from "../life/species";
import { critterPortrait } from "../render/critterSprites";
import { BIOME_WORDS, moodLine, roleLine } from "../render/inspect";
import { getPlantSprite } from "../render/plantSprites";
import { Renderer, Scene } from "../render/renderer";
import { OVERVIEW_COLORS } from "../render/palette";
import { StarterKind, buildConstruct } from "../world/construct";
import { TILE_SIZE } from "../world/config";
import { Tile, WorldMap, tileAt } from "../world/types";
import {
  DrawerEntry,
  EntryKind,
  bumpPeak,
  captureDaughters,
  deleteEntry,
  makeEntry,
  pinEntry,
  pinnedEntries,
  reviveEntry,
  statusOf,
  unpinEntry,
} from "./simDrawer";
import { habitatsOf, placeablePlants } from "./simRoster";
import { BRUSH_SIZES, BrushSize, paintBiome, stampCells } from "./simBrush";
import { PRESSURES, Pressure, PressureId, fieldValueFor, grazerAssignment, richnessMeter, tuningPatchFor } from "./simPressures";
import { AMBIENT_ROLES, ambientRoleEnabled, roleBadge } from "./simAmbient";
import {
  RestoredSim,
  SavedSimControl,
  forgetSimSlot,
  loadSimSlot,
  packSim,
  readSimIndex,
  restoreSim,
  saveSimSlot,
} from "./simSave";
import { agoPhrase } from "../render/picker";

// The biome brush's palette: real tiles you can paint, each swatched with its
// own OVERVIEW_COLORS entry (the island-at-a-glance color, indexed by the enum
// — not an invented hex). Covers every plant habitat plus open water/terrain;
// trivially extended with any other Tile.
const BIOME_TILES: { tile: Tile; name: string }[] = [
  { tile: Tile.DeepWater, name: "deep water" },
  { tile: Tile.ShallowWater, name: "shallow water" },
  { tile: Tile.Sand, name: "sand" },
  { tile: Tile.Grass, name: "grass" },
  { tile: Tile.Forest, name: "forest" },
  { tile: Tile.Marsh, name: "marsh" },
  { tile: Tile.Rock, name: "rock" },
  { tile: Tile.Highland, name: "highland" },
];

const STARTERS: { kind: StarterKind; name: string }[] = [
  { kind: "playable-island", name: "playable island" },
  { kind: "biome-sampler", name: "biome sampler" },
  { kind: "single-biome", name: "single biome" },
];

// The palette's current pick: a plant or critter kind by id, a real Tile for
// the biome brush, or null for the select tool (the default) — a
// null-selection click inspects whatever stands nearest it instead of placing
// or painting anything (see `Inspected` below).
type Selected = { kind: "plant" | "critter"; id: number } | { kind: "tile"; tile: Tile } | null;

// The select tool's own pick: the critter or plant currently read out on the
// codex plate, or null when nothing's chosen. A direct object reference, not
// an id — this bench never removes a critter, and while a plant CAN be
// removed by the sim (age, crowding, a grazer's bite), a stale reference
// after that is harmless for a raw-internals plate: its fields simply stop
// changing, a fair "gone quiet" reading, not a bug to guard against.
type Inspected = { kind: "critter"; ref: Critter } | { kind: "plant"; ref: Plant } | null;

const PICK_RADIUS_PX = 1.5 * TILE_SIZE; // the select tool's hit-test reach

// The roll pane's batch size (the spec's 9–12) and thumbnail zoom — a grid
// cell stays legible at 16×~28px source art scaled up, same spirit as
// inspect.ts's own ZOOM-scaled sprite cards.
const ROLL_COUNT = 10;
const THUMB_ZOOM = 3;

// Roll-a-web's own batch sizes: a starter web (roll a web) vs. a denser one
// (seed it richer) — both handed straight to rollWeb's own `size` (a chain
// count, never a species count), so "richer" simply asks for more chains.
const WEB_SIZE = 3;
const WEB_SIZE_RICH = 6;

// The iterate strip's own tuning: a bigger zoom for the focused candidate's
// enlarged thumbnail than the grid's own cells wear, a size stepper's
// increment (setCritterTraits clamps into the legal band, so this never
// needs its own clamp), a palate nudge's hueCenter shift (wrapped 0..1), and
// the "re-roll looks" amount — a visibly bigger jump than a plain "nudge"
// (which uses roll.ts's own defaults, so the two read as distinct gestures).
const FOCUS_ZOOM = 3.5;
const SIZE_STEP = 0.15;
const PALATE_STEP = 0.12;
const REROLL_LOOKS_AMOUNT: Record<RollKind, number> = { plant: 0.4, critter: 0.4 };

// A tiny local blit: scale a real sprite canvas (plant or critter, already
// drawn by getPlantSprite/critterPortrait — never redrawn here) into a fresh
// display canvas, nearest-neighbor. Mirrors inspect.ts's own sprite-thumbnail
// pattern (imageSmoothingEnabled=false + a scaled drawImage) without its
// alpha-bounds cropping, which this grid's fixed-size cells don't need.
function drawThumb(src: HTMLCanvasElement, zoom: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width * zoom;
  c.height = src.height * zoom;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

// The select tool's critter half of the hit-test: nearest critter within
// reach, else null. No fauna.ts helper does this (flora.ts's own
// `nearestPlant`, reused below, is the plant half) — a small, local, pure
// spatial search, not a reimplementation of anything the readout itself owns.
function pickCritterNear(critters: readonly Critter[], wx: number, wy: number, radiusPx: number): Critter | null {
  let best: Critter | null = null;
  let bestD = radiusPx * radiusPx;
  for (const c of critters) {
    const d = (c.x - wx) ** 2 + (c.y - wy) ** 2;
    if (d <= bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

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

// ── the readout's view-builders — pure, so the plate's numbers are exactly
// what the kernel holds, nothing re-derived or guessed. Reuses
// critterDrives/dominantDrive (the drives themselves, never re-computed
// here) and inspect.ts's moodLine/roleLine/BIOME_WORDS (the very words the
// player-facing card speaks), but skips inspect.ts's word-ified plant
// description (FORM_WORDS/featureWord, both private to that file anyway) —
// this plate wants the RAW genome, not a reading of it. ─────────────────────

interface CritterInspectView {
  name: string;
  role: string;
  roleLine: string;
  size: number;
  palate: Palate;
  state: string;
  mood: string;
  moodLine: string;
  energy: number;
  curiosity: number;
  targetX: number;
  targetY: number;
  mealName: string; // its species name, or "—"
  drives: Drives;
  dominant: DriveName | null;
}

function critterInspectView(c: Critter, sp: CritterSpecies, plantSpecies: PlantSpecies[]): CritterInspectView {
  const drives = critterDrives(c);
  const favSp = plantSpecies[sp.favoriteSpecies];
  return {
    name: sp.name,
    role: sp.role,
    // the ambient bench's own copy wins over the shared roleLine: real play's
    // roleLine only tells "grazer" from everything else and reads any bench
    // role as a generic "spreader" (render/inspect.ts:309-313) — wrong for a
    // fish, which never spreads a seed. AMBIENT_ROLES carries evocative,
    // role-correct help for every role it lists (now including "grazer", whose
    // help matches roleLine's own words); the `?? roleLine` fall-back covers any
    // future/unlisted role. Simulator-only: the shared roleLine() stays untouched.
    roleLine: AMBIENT_ROLES.find((r) => r.id === sp.role)?.help ?? roleLine(sp.role),
    size: sp.size,
    palate: sp.palate,
    state: c.state,
    mood: c.mood,
    moodLine: moodLine(c.mood, favSp.name),
    energy: c.energy,
    curiosity: c.curiosity,
    targetX: c.targetX,
    targetY: c.targetY,
    mealName: c.meal ? plantSpecies[c.meal.species].name : "—",
    drives,
    dominant: dominantDrive(drives),
  };
}

interface PlantInspectView {
  name: string;
  habitat: string;
  substrateFeeder: boolean;
  genome: Genome;
  age: number; // kernel ticks since it took root
}

function plantInspectView(p: Plant, sp: PlantSpecies, tick: number): PlantInspectView {
  return {
    name: sp.name,
    habitat: BIOME_WORDS[sp.habitat] ?? "the island",
    substrateFeeder: !!sp.substrateFeeder,
    genome: p.genome,
    age: tick - p.born,
  };
}

interface CensusWebView {
  summary: { live: number; arose: number; lost: number };
  species: { name: string; spark: string; count: number }[];
  chains: { chains: number; closable: number; redundancy: number };
  richness: string; // richnessWord(score) — flat/sparse/living/rich/lush/legendary
  richnessScore: number; // the same numeric score the word names
}

// The drawer's per-entry view: a finished row, live off statusOf/bumpPeak —
// `extinct`/`deleted` are the model's own three-way state (deleted → cleared;
// extinct → lived, now gone; else alive), Chrome only ever picks the label.
interface DrawerRow {
  key: string;
  name: string;
  sub: string;
  count: number;
  variations: number;
  extinct: boolean;
  deleted: boolean;
  pinned: boolean; // curate: this phenotype is the one to re-seed from
}

// The slot panel's per-row view (Task 9): a finished row, pre-phrased —
// startWorldLab formats the "last saved" text (agoPhrase, the isle picker's
// own relative-time helper, picker.ts) so Chrome stays a dumb view, same
// split as DrawerRow above.
interface SlotRowView {
  id: string;
  name: string;
  when: string; // "last saved 3 hours ago" (or similar), pre-phrased
}

// The living-web strip's data: the census exactly as CensusLog keeps it
// (summary/list/sparkline never re-derived) paired with the food web's
// static chain-potential — population is the live proof a chain closed; the
// chain count is the standing potential for one to. The chain-potential
// itself is now the shared richnessMeter (simPressures.ts) — the SAME score
// arithmetic diversityScore uses, over the construct's own live roster
// (never a rebuilt-from-seed world), so this recomputes fresh every refresh.
function censusWebView(
  census: CensusLog,
  plantSpecies: PlantSpecies[],
  critterSpecies: CritterSpecies[],
  speciesCounts: ReadonlyMap<number, number>,
  critterCountOf: (id: number) => number,
): CensusWebView {
  const species = census
    .list()
    .slice()
    .sort((a, b) => b.peak - a.peak)
    .map((tr) => ({
      name: plantSpecies[tr.id]?.name ?? `species #${tr.id}`,
      spark: sparkline(tr.counts),
      count: tr.counts[tr.counts.length - 1] ?? 0,
    }));
  // FIX 4: score only species with a LIVE population — richness is "how wild
  // is what you've actually MADE", not every introduced definition (incl.
  // unplaced starters, which used to score an empty construct as "living").
  const livePlants = plantSpecies.filter((sp) => (speciesCounts.get(sp.id) ?? 0) > 0);
  const liveCritters = critterSpecies.filter((sp) => critterCountOf(sp.id) > 0);
  const r = richnessMeter(livePlants, liveCritters);
  return {
    summary: census.summary(),
    species,
    chains: { chains: r.chains, closable: r.closable, redundancy: r.redundancy },
    richness: r.word,
    richnessScore: r.score,
  };
}

// The iterate strip's view of the focused batch candidate: an enlarged
// thumbnail (re-rendered live off the mutated def) plus whichever trait
// fields its kind actually carries — Chrome shows the kind-appropriate
// controls off which fields are present, never re-deriving anything the
// candidate's own def doesn't already hold.
interface FocusView {
  kind: RollKind;
  name: string;
  thumb: HTMLCanvasElement;
  tint: string;
  role?: CritterRole; // critter
  size?: number; // critter
  palate?: Palate; // critter
  form?: PlantForm; // plant
  hue?: number; // plant
  habitat?: Tile; // plant
  substrateFeeder?: boolean; // plant
}

// A trait patch the iterate strip can ask for — the union of everything
// setPlantTraits/setCritterTraits accept; worldlab.ts routes it to whichever
// setter matches the focused candidate's kind.
type TraitPatch = {
  role?: CritterRole;
  size?: number;
  palate?: Partial<Palate>;
  habitat?: Tile;
  substrateFeeder?: boolean;
};

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

// The construct's "near centre, but nudged OFF its exact spawn point" anchor:
// every still-unplaced critter species' den defaults to the spawn point
// (fauna.ts's findDen fallback, empty scratch flora), so a plant landing on
// that same tile reads as "smothered by a hut," not a clean bloom. Shared by
// seedDemoScenario and seedWeb (Task 4's roll-a-web), so a demo scenario and
// a rolled web anchor to the exact same point.
function constructCentre(map: WorldMap): { cx: number; cy: number } {
  return {
    cx: Math.min(map.width - 1, Math.floor(map.width / 2) + Math.min(8, Math.floor(map.width / 6))),
    cy: Math.max(0, Math.floor(map.height / 2) - Math.min(6, Math.floor(map.height / 6))),
  };
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
  const { cx, cy } = constructCentre(map);

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
  // reassignable: a loaded sim slot carries its own seed (rebuildFromSim,
  // Task 9), which must overwrite this construct's so a later re-save
  // re-derives the SAME buildConstruct baseline the slot was loaded from.
  let seed = seedFromUrl();
  const demoRequested = new URL(location.href).searchParams.has("demo");
  // The ?inspect=critter|plant dev aid: auto-selects the first placed
  // critter/plant so a screenshot can show the readout plate without a real
  // click — same spirit as ?demo/?run, display-only, no rng anywhere near it.
  const inspectAid = new URL(location.href).searchParams.get("inspect");
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
  // The ?brushdemo=stamp dev aid: a deterministic block-stamp for the size
  // picker's own screenshot — display-only, rng-free, same spirit as ?demo.
  const brushDemo = new URL(location.href).searchParams.get("brushdemo");
  // The roll pane's dev aids: ?roll=plant|critter opens the pane pre-rolled
  // (any other truthy value, e.g. ?roll=1, defaults to critter) so a shot
  // shows a populated grid with no click; ?rollpick=0,3 additionally
  // introduces those batch indices for real, so a shot can show the
  // picked-onto-the-palette state too. Both display-only, rng-free beyond
  // the seeded roll itself.
  const rollAid = new URL(location.href).searchParams.get("roll");
  const rollPickAid = new URL(location.href).searchParams.get("rollpick");
  // ?iterate=looks|traits: focus batch cell 0 and apply one deterministic
  // looks-nudge or traits-change, so a shot shows the strip open with a
  // re-rendered thumbnail. Any other truthy value (e.g. ?iterate=1) reads as
  // "looks" — the same "unrecognized value falls back to the common case"
  // convention ?roll already uses. Display-only, off iterateRng.
  const iterateAid = new URL(location.href).searchParams.get("iterate");
  // Task 6's dev aids: ?drawerdemo=1 rolls+picks a plant and a critter kind
  // (the SAME roll→pick path a click takes) and stamps a small patch of each
  // near the construct's centre, so the drawer shows real, non-zero "in
  // play" counts without a manual click; ?split=1 constructs the kernel with
  // permissive speciation tuning, so ?drawerdemo=1's dense same-kind stamp
  // plus a long &run= has a real shot at surfacing a captured ✧ daughter;
  // ?drawerdel=<index-or-key> deletes that drawer entry deterministically,
  // so a shot can show the cleared badge + bring-back button. All
  // display-only / rng-free beyond the ordinary seeded paths they reuse.
  const drawerDemoAid = new URL(location.href).searchParams.has("drawerdemo");
  const splitAid = new URL(location.href).searchParams.has("split");
  const drawerDelAid = new URL(location.href).searchParams.get("drawerdel");
  // Curate's own dev aids (Task 6): ?pin=<index-or-key> pins that drawer
  // entry deterministically (the SAME pinDrawerEntry a click on the drawer's
  // own pin button runs), so a shot can show the pinned ⭑ state without a
  // manual click; ?reseed=1 calls reseedPinned() once on load, so a shot can
  // show the re-seeded fresh instances too. Combine with ?drawerdemo=1 so
  // there's a real kind at index 0 to pin. Display-only, rng-free beyond the
  // seeded placement reseedPinned already draws from.
  const pinAid = new URL(location.href).searchParams.get("pin");
  const reseedAid = new URL(location.href).searchParams.has("reseed");
  // Slice-4's roll-a-web dev aids: ?web=1 rolls+introduces+auto-places one
  // matched web (source/feeder/disperser), the SAME seedWeb a "roll a web"
  // click runs; ?rich=1 runs the denser "seed it richer" batch instead. Both
  // fire in build() ahead of the ?run=N pre-step (the same tier ?demo/
  // ?drawerdemo already fire at), so &run=N composes to show an
  // already-closing chain. Display-only, rng-free beyond seedWeb's own
  // seeded roll + seeded placement.
  const webAid = new URL(location.href).searchParams.has("web");
  const richAid = new URL(location.href).searchParams.has("rich");
  // The pressures panel's own dev aids (Task 5, slice 4): ?evo=1 opens the
  // evolution tray so a shot shows the five sliders at their defaults;
  // ?pressures=wild ALSO cranks every pressure to its wild end — applied
  // inside build(), ahead of the ?run=N pre-step above, so a pre-stepped
  // shot actually RUNS wild rather than just showing wild-looking knobs.
  // Both display-only, rng-free — setPressure adds no rng draws.
  const evoAid = new URL(location.href).searchParams.has("evo");
  const pressuresAid = new URL(location.href).searchParams.get("pressures");
  // The slot panel's own dev aid (Task 9): ?slots=1 opens the save/load
  // picker on load, so a shot can show it with no manual click. Display-
  // only — readSimIndex/agoPhrase draw no rng.
  const slotsAid = new URL(location.href).searchParams.has("slots");
  let starter: StarterKind =
    (new URL(location.href).searchParams.get("starter") as StarterKind) || "biome-sampler";

  let map!: WorldMap, kernel!: SimKernel, renderer!: Renderer;
  let camX = 0,
    camY = 0;
  let plantKinds: PlantSpecies[] = [];
  let critterKinds: CritterSpecies[] = [];
  let selected: Selected = null;
  let brushSize: BrushSize = 1;
  let inspected: Inspected = null;
  let ui: Chrome | undefined;
  // the slot this construct was loaded from (or last saved to), if any — a
  // re-save on the SAME construct overwrites its own slot rather than
  // minting a fresh one every time (Task 9).
  let currentSlotId: string | null = null;
  let currentSlotName: string | null = null;
  // the roll pane's own state: which kind the toggle shows, the seeded
  // stream's cursor (re-roll advances it), the current batch of candidates
  // (PROVISIONAL_ID until picked), and the drawer roster — every introduced
  // kind (starter/rolled/captured daughter), the palette's own single
  // source of truth (see refreshPalette below).
  let rollKind: RollKind = "critter";
  let rollCursor = 0;
  let batch: (PlantSpecies | CritterSpecies)[] = [];
  let drawer: DrawerEntry[] = [];
  // roll-a-web's own cursor: the seeded stream's slice, advanced once per
  // seedWeb() call — same "deterministic advance" spirit as rollCursor, kept
  // separate so rolling a web never perturbs the roll pane's own batch stream.
  let webCursor = 0;
  // the iterate strip's own state: which batch index is focused (null = the
  // strip is closed) and the seeded rng that drives its looks nudges —
  // reset off rollSeedFor whenever a candidate is (re-)focused or the batch
  // is (re-)rolled, so a shot's single nudge is byte-reproducible.
  let focus: number | null = null;
  let iterateRng = makeRng(0);
  // The pressures panel's own live state (Task 5, slice 4): one value per
  // PRESSURES entry, seeded from DEFAULT_TUNING for the four FloraTuning-
  // backed pressures (mutationAmount/splitDistance/reproChance/maxPerTile).
  // grazerShare seeds 0 — critterKinds is still empty this early in
  // construction (build() hasn't run yet), so there's no real roster to
  // read a fraction off yet; the first real value is whatever a slider drag
  // (or the ?pressures=wild dev aid) sets. Just bookkeeping for the tray's
  // own readout — setPressure below is what actually reaches the kernel.
  let pressureValues: Record<PressureId, number> = {
    mutationAmount: DEFAULT_TUNING.mutationAmount,
    // speciation's slider is reversed (right = wilder, FIX 2), so its stored
    // POSITION is the mirror of the raw field default — else the untouched
    // handle sits left-of-centre while the field value (0.3) is wilder-than-
    // median, the exact confusion the flip exists to remove.
    splitDistance: fieldValueFor("splitDistance", DEFAULT_TUNING.splitDistance),
    grazerShare: 0,
    reproChance: DEFAULT_TUNING.reproChance,
    maxPerTile: DEFAULT_TUNING.maxPerTile,
  };

  // A biome brush label for flash copy — the same words the palette swatches use
  // (not the inspect card's evocative "the meadow"), so a refusal names a tile
  // the player can actually click.
  function biomeBrushName(t: Tile): string {
    return BIOME_TILES.find((b) => b.tile === t)?.name ?? "this ground";
  }

  // Why a plant refused the centre cell — habitat mismatch vs density cap.
  // addPlant returns null for both; the old "wrong habitat" flash lied when the
  // tile was simply full (default maxPerTile = 4; a fifth click on the same
  // pixel looked like a biome error). Plants may overlap on a tile up to the
  // cap — past that the tile is full, not the wrong ground.
  function plantRefuseNote(speciesId: number, wx: number, wy: number): string {
    const sp = kernel.plantSpecies[speciesId];
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    const here = tileAt(map, tx, ty);
    if (here !== sp.habitat) {
      return `needs ${biomeBrushName(sp.habitat)} — this is ${biomeBrushName(here)}`;
    }
    const cap = kernel.flora.tuning.maxPerTile;
    return `tile full (${cap} plants) — they can overlap, but each tile only holds so many`;
  }

  // Lay the selected KIND across an N×N block centred on (tx, ty). Plants stay
  // habitat-gated per cell (kernel.placePlant returns null off-habitat / full),
  // so a 3×3 on a biome edge roots only where it legally can — one flash if the
  // CENTRE cell refused, matching slice 1's single-place feedback. Critters
  // place on every cell. No-op for the select tool (selected === null) and the
  // tile tool (paintTileAt/repaintRefresh below own that path instead).
  // Returns whether the centre cell accepted a plant/critter (drag-place uses
  // this to avoid spamming the same refusal flash every move).
  function stampKindAt(tx: number, ty: number, opts?: { quiet?: boolean }): boolean {
    if (!selected || selected.kind === "tile") return false;
    const cells = stampCells(tx, ty, brushSize, map);
    let centreOk = false;
    let centreRefused = false;
    for (const { x, y } of cells) {
      const { x: px, y: py } = worldPxCenter(x, y);
      if (selected.kind === "plant") {
        const p = kernel.placePlant(selected.id, px, py);
        if (x === tx && y === ty) {
          if (p) centreOk = true;
          else centreRefused = true;
        }
      } else {
        // a fish (aquatic-grazer) only takes to ShallowWater — the critter mirror
        // of placePlant's habitat gate (§4/§5). Every other critter places on any
        // cell, exactly as before.
        if (kernel.critterSpecies[selected.id].role === "aquatic-grazer" && tileAt(map, x, y) !== Tile.ShallowWater) {
          if (x === tx && y === ty) centreRefused = true;
          continue;
        }
        kernel.placeCritter(selected.id, px, py);
        if (x === tx && y === ty) centreOk = true;
      }
    }
    if (centreRefused && ui && !opts?.quiet) {
      if (selected.kind === "critter") {
        ui.flashNote("a fish needs shallow water");
      } else {
        const { x: px, y: py } = worldPxCenter(tx, ty);
        ui.flashNote(plantRefuseNote(selected.id, px, py));
      }
    }
    refreshCensusStrip(); // a fresh block can add latent chain links
    return centreOk;
  }

  // paint the selected tile across an N×N block; mutate map.tiles IN PLACE (the
  // array Flora + the Renderer share), so the running frame loop shows it next
  // draw — no setMap, no atlas rebuild. Returns whether anything changed, so the
  // stroke knows to refresh the palette on pointerup.
  function paintTileAt(tx: number, ty: number): boolean {
    if (selected?.kind !== "tile") return false;
    return paintBiome(map, stampCells(tx, ty, brushSize, map), selected.tile) > 0;
  }

  // The drawer's own non-deleted entries of one kind — the palette's raw
  // material (see refreshPalette, just below).
  function drawerLive(kind: EntryKind): DrawerEntry[] {
    return drawer.filter((e) => e.kind === kind && !e.deleted);
  }

  // The palette's SINGLE source of truth (Task 6): plantKinds/critterKinds
  // are the drawer's own non-deleted entries (plants further intersected with
  // placeablePlants' habitat gate, the exact slice-1 filter — a newly-painted
  // habitat unlocks its plants, a painted-away one drops them, same as
  // before). So a deleted kind leaves the palette and a revived one returns,
  // with no separate bookkeeping to keep in sync. Called after every paint
  // stroke, pick, delete, and revive. If the current selection's kind just
  // left the palette (painted away, or deleted), fall back to the select
  // tool so no stale id survives.
  function refreshPalette(): void {
    const livePlantIds = new Set(drawerLive("plant").map((e) => e.speciesId));
    plantKinds = placeablePlants(kernel.plantSpecies, habitatsOf(map)).filter((sp) => livePlantIds.has(sp.id));
    const liveCritterIds = new Set(drawerLive("critter").map((e) => e.speciesId));
    critterKinds = kernel.critterSpecies.filter((sp) => liveCritterIds.has(sp.id));
    if (selected?.kind === "plant") {
      const id = selected.id; // hoisted out of the closure below: TS can't narrow a captured `let`
      if (!plantKinds.some((s) => s.id === id)) selected = null;
    } else if (selected?.kind === "critter") {
      const id = selected.id;
      if (!critterKinds.some((s) => s.id === id)) selected = null;
    }
    if (ui) {
      ui.setPalette(plantKinds, critterKinds);
      ui.setSelected(selected);
      // keep the ambient tray in lockstep with the roster + each kind's live role
      ui.setAmbient(
        critterKinds.map((c) => ({ id: c.id, name: c.name, role: c.role })),
        habitatsOf(map).has(Tile.ShallowWater),
      );
    }
  }

  // After a paint stroke, re-filter the plant palette: a newly-painted
  // habitat unlocks its plants; a painted-away one drops them — handled by
  // refreshPalette's own habitat gate above.
  function repaintRefresh(): void {
    refreshPalette();
  }

  // ── the roll pane: seeded batch → live thumbnails → pick onto the palette
  // (Simulator slice 3). rollBatch() draws (or re-draws) the current kind's
  // batch at the current cursor — a bare "roll" and a construct rebuild both
  // call it at cursor 0; "re-roll" bumps the cursor first, so the stream
  // advances deterministically instead of repeating the same draw. ─────────
  function rollBatch(): void {
    batch =
      rollKind === "plant"
        ? rollPlantBatch(seed, rollCursor, ROLL_COUNT, { habitats: habitatsOf(map) })
        : rollCritterBatch(seed, rollCursor, ROLL_COUNT, kernel.plantSpecies, map);
    focus = null; // a fresh batch invalidates whatever candidate was focused
    resetIterateRng();
    renderGrid();
    renderFocus();
  }

  // Off `rollSeedFor` (the SAME per-(kind,cursor) seed the batch itself was
  // drawn from), salted so the iterate stream is its own — never the batch
  // draw's own rng replayed. Re-focusing or re-rolling calls this, so a shot
  // that focuses cell 0 and applies one nudge always lands on the same coat.
  function resetIterateRng(): void {
    iterateRng = makeRng(rollSeedFor(seed, rollKind, rollCursor) ^ 0x17e7);
  }

  // Rebuilds the grid's thumbnails from the current batch. Plants render via
  // the cached getPlantSprite (keyed on the genome's phenoKey — distinct
  // archetypes never collide, and a repeated archetype is legitimately the
  // same look). Critters render via the UNCACHED critterPortrait — seam #2:
  // getCritterSprites caches by species id, and every candidate in a batch
  // still carries the shared PROVISIONAL_ID (-1), so an id-keyed cache would
  // paint the whole grid with whichever candidate rendered first. Guarded for
  // `ui` not yet existing (build()'s first call, ahead of buildChrome()) —
  // the main flow re-calls this once `ui` is ready.
  function renderGrid(): void {
    if (!ui) return;
    const cells = batch.map((m) => {
      if (rollKind === "plant") {
        const sp = m as PlantSpecies;
        return {
          thumb: drawThumb(getPlantSprite(sp.archetype, sp.habitat === Tile.ShallowWater), THUMB_ZOOM),
          name: sp.name.toLowerCase(),
          tint: hsl(sp.archetype.hue, 0.62, 0.5),
        };
      }
      const sp = m as CritterSpecies;
      return {
        thumb: drawThumb(critterPortrait(sp), THUMB_ZOOM),
        name: sp.name.toLowerCase(),
        tint: hsl(sp.bodyHue, 0.55, 0.55),
      };
    });
    ui.setBatch(cells);
  }

  // Introduces a plant/critter def into the kernel FOR REAL (kernel.
  // introduce*Species assigns the real id === array index) and records a
  // "rolled" drawer entry off the kernel's own now-stored record. The exact
  // two-line body pickBatch and seedWeb (below) both need, factored once so
  // a pick and a rolled-web member land on the drawer/palette identically.
  function introducePlantDef(def: PlantSpecies): number {
    const id = kernel.introducePlantSpecies({ ...def, id: PROVISIONAL_ID });
    drawer.push(makeEntry({ kind: "plant", speciesId: id, def: kernel.plantSpecies[id], origin: "rolled" }));
    return id;
  }
  function introduceCritterDef(def: CritterSpecies): number {
    const id = kernel.introduceCritterSpecies({ ...def });
    drawer.push(makeEntry({ kind: "critter", speciesId: id, def: kernel.critterSpecies[id], origin: "rolled" }));
    return id;
  }

  // Pick: introduces the batch member at `index` via introducePlantDef/
  // introduceCritterDef above. The freshly-picked kind becomes the
  // selection, so the very next click on the construct places it.
  // Kernel-side effects run regardless of `ui` (so ?rollpick/?drawerdemo can
  // fire from build()'s first call, ahead of buildChrome()); the UI refresh
  // is guarded and re-synced by the main flow once `ui` exists.
  function pickBatch(index: number): void {
    const member = batch[index];
    if (!member) return;
    let id: number;
    if (rollKind === "plant") {
      id = introducePlantDef(member as PlantSpecies);
      selected = { kind: "plant", id };
    } else {
      id = introduceCritterDef(member as CritterSpecies);
      selected = { kind: "critter", id };
    }
    refreshPalette(); // the drawer just grew — plant/critterKinds re-source from it
    refreshDrawer();
    focus = null; // the pick is made; the iterate strip's job here is done
    if (ui) {
      ui.flashNote(`picked ${member.name.toLowerCase()} — now on the palette`);
      ui.setFocus(null);
    }
  }

  // Roll-a-web: rolls a matched, closable web (rollWeb — a synthesized
  // source/feeder/disperser set; never reimplemented here) and auto-places a
  // seed of it. Every chain's three members are introduced for real via
  // introducePlantDef/introduceCritterDef above (so the drawer + palette pick
  // them up exactly as a roll-pane pick would), then one instance of each is
  // dropped near the construct's centre in the exact seedDemoScenario pattern
  // (nearestTileOf + worldPxCenter + kernel.placePlant/placeCritter), spread
  // a few tiles apart — so stepping actually closes the chain: the disperser
  // seeks the source → nibbles it → propagate + addSubstrate(hue H) → the
  // feeder germinates on the shared-habitat byproduct.
  //
  // The disperser's favoriteSpecies is re-pointed at the chain's OWN
  // introduced source id (never the base roster's placeholder) — the inspect
  // card's "born loving" line then names a real, present kind.
  //
  // Feeder-name guard: rollChain's own fallback (no distinct same-form
  // candidate in the batch) clones the source for the feeder, so the two can
  // share a name — a legible pair in the food math (one form/hue family) but
  // a confusing one on a drawer/palette row ("two Fenmoss?"). A same-name
  // feeder gets a "· feeder" suffix here, display-only — it never touches the
  // archetype/hue the chain math keys on.
  //
  // "roll a web" and "seed it richer" both call this, differing only in
  // `size` (rollWeb's own chain count — never a species count).
  function seedWeb(size: number): void {
    const cursor = webCursor;
    webCursor++; // the deterministic advance: same construct, next slice of the stream
    const web = rollWeb(seed, cursor, size, habitatsOf(map), map);
    const { cx: cx0, cy: cy0 } = constructCentre(map);
    web.chains.forEach((chain: WebChain, i) => {
      const srcId = introducePlantDef(chain.source);
      const feederDef: PlantSpecies =
        chain.feeder.name === chain.source.name
          ? { ...chain.feeder, name: `${chain.feeder.name} · feeder` }
          : chain.feeder;
      const feedId = introducePlantDef(feederDef);
      const dspId = introduceCritterDef({ ...chain.disperser, favoriteSpecies: srcId });

      // each chain (and each successive roll — `cursor` advances every call)
      // anchors a few tiles from the last, so multiple chains/rolls never
      // keep stacking onto the very same tile
      const cx = Math.min(map.width - 1, cx0 + i * 5);
      const cy = Math.min(map.height - 1, cy0 + cursor * 4);

      const sourceTile = nearestTileOf(map, chain.source.habitat, cx, cy) ?? { x: cx, y: cy };
      const sp = worldPxCenter(sourceTile.x, sourceTile.y);
      kernel.placePlant(srcId, sp.x, sp.y);

      const disperserTile = { x: Math.min(map.width - 1, sourceTile.x + 3), y: sourceTile.y };
      const dp = worldPxCenter(disperserTile.x, disperserTile.y);
      kernel.placeCritter(dspId, dp.x, dp.y);

      const feederTile =
        nearestTileOf(map, chain.feeder.habitat, sourceTile.x, Math.min(map.height - 1, sourceTile.y + 3)) ??
        sourceTile;
      const fp = worldPxCenter(feederTile.x, feederTile.y);
      kernel.placePlant(feedId, fp.x, fp.y);
    });
    refreshPalette();
    refreshDrawer();
    refreshCensusStrip();
    if (ui) ui.flashNote(`rolled a web — ${web.chains.length} chains introduced + seeded`);
  }

  // ── the iterate strip: focus a batch candidate (before it's picked) and
  // reshape it in place — looks (nudge/re-roll the genome or morph; the
  // thumbnail re-renders) and traits (a critter's palate/role/size; a
  // plant's habitat/reseed). Whatever the candidate looks like when you
  // finally pick it is exactly what pickBatch introduces. ──────────────────

  // Focuses (or, with null, closes) a batch index. Re-focusing resets the
  // iterate rng — see resetIterateRng's own note on why that's the seam that
  // keeps a dev-aid shot reproducible regardless of which cell it focuses.
  function focusBatch(i: number | null): void {
    focus = i !== null && batch[i] ? i : null;
    if (focus !== null) resetIterateRng();
    renderFocus();
  }

  // Rebuilds the iterate strip's view from the currently focused candidate —
  // called after every focus change and every looks/traits mutation, so the
  // strip never shows a stale thumbnail or trait value. A harmless no-op
  // before `ui` exists, mirroring renderGrid/refreshInspect.
  function renderFocus(): void {
    if (!ui) return;
    const member = focus !== null ? batch[focus] : undefined;
    if (!member) {
      ui.setFocus(null);
      return;
    }
    if (rollKind === "plant") {
      const sp = member as PlantSpecies;
      ui.setFocus({
        kind: "plant",
        name: sp.name.toLowerCase(),
        thumb: drawThumb(getPlantSprite(sp.archetype, sp.habitat === Tile.ShallowWater), FOCUS_ZOOM),
        tint: hsl(sp.archetype.hue, 0.62, 0.5),
        form: sp.archetype.form,
        hue: sp.archetype.hue,
        habitat: sp.habitat,
        substrateFeeder: !!sp.substrateFeeder,
      });
    } else {
      const sp = member as CritterSpecies;
      ui.setFocus({
        kind: "critter",
        name: sp.name.toLowerCase(),
        thumb: drawThumb(critterPortrait(sp), FOCUS_ZOOM),
        tint: hsl(sp.bodyHue, 0.55, 0.55),
        role: sp.role,
        size: sp.size,
        palate: sp.palate,
      });
    }
  }

  // Looks: nudge (small, roll.ts's own default amount) or re-roll (a bigger,
  // explicit amount) — both draw from the SAME iterateRng, so consecutive
  // nudges keep advancing it (never reset mid-stream) while a re-focus/
  // re-roll starts the stream fresh (resetIterateRng, above). Re-renders
  // both the grid cell (so the batch reads consistently) and the strip.
  function nudgeFocused(amount?: number): void {
    if (focus === null) return;
    const member = batch[focus];
    if (!member) return;
    batch[focus] =
      rollKind === "plant"
        ? nudgePlantLooks(member as PlantSpecies, iterateRng, amount)
        : nudgeCritterLooks(member as CritterSpecies, iterateRng, amount);
    renderGrid();
    renderFocus();
  }

  // Traits: a critter's role/size/palate, a plant's habitat/reseed — routed
  // to whichever setter matches the focused candidate's kind. A size change
  // re-derives the critter's morph (setCritterTraits' own job), so the
  // re-render below shows the body actually scale.
  function setFocusedTrait(patch: TraitPatch): void {
    if (focus === null) return;
    const member = batch[focus];
    if (!member) return;
    batch[focus] =
      rollKind === "plant"
        ? setPlantTraits(member as PlantSpecies, patch)
        : setCritterTraits(member as CritterSpecies, patch);
    renderGrid();
    renderFocus();
  }

  // The strip's own pick button: introduces the focused candidate exactly as
  // it now stands (pickBatch itself closes the strip once the pick lands).
  function pickFocused(): void {
    if (focus === null) return;
    pickBatch(focus);
  }

  // ── the drawer (species roster): live status, daughter ✧ auto-capture,
  // delete/bring-back. Task 6. ─────────────────────────────────────────────

  // Refreshes the drawer roster: auto-captures any emergent daughters
  // (flora's own ✧ speciation — a plant record appended with `parent` set,
  // scanned off kernel.plantSpecies, idempotent per simDrawer's own note),
  // paired with flora's OWN witnessed speciation events for a human-legible
  // flash (the scan gives the id the drawer needs; the event gives the name
  // worth saying out loud). Then bumps each entry's peak against its live
  // count and renders the finished rows. A harmless no-op before `ui` exists
  // (build()'s first call, ahead of buildChrome()) — called from
  // refreshCensusStrip (so it fires everywhere that already does: after
  // every kernel.step() batch and every placement) and directly after
  // pick/delete/revive.
  function refreshDrawer(): void {
    if (!ui) return;
    const events = kernel.flora.takeEvents();
    const fresh = captureDaughters(kernel.plantSpecies, drawer);
    if (fresh.length) drawer.push(...fresh);
    for (const ev of events) ui.flashNote(`✧ a daughter arose: ${ev.name.toLowerCase()}`);
    const rows = drawer.map((e) => {
      const count =
        e.kind === "plant" ? kernel.speciesCounts().get(e.speciesId) ?? 0 : kernel.critterCountOf(e.speciesId);
      bumpPeak(e, count);
      const status = statusOf(e, count, drawer);
      const parent =
        e.parentId !== undefined ? drawer.find((p) => p.kind === "plant" && p.speciesId === e.parentId) : undefined;
      return {
        key: e.key,
        name: e.name.toLowerCase(),
        sub: e.origin === "daughter" ? `daughter of ${(parent?.name ?? "an unknown kind").toLowerCase()}` : `${e.origin} ${e.kind}`,
        count: status.count,
        variations: status.variations,
        extinct: status.extinct,
        deleted: e.deleted,
        pinned: e.pinned,
      };
    });
    ui.setDrawer(rows);
  }

  // Delete: the kernel's own peaceful tombstone clear (population → 0, the
  // species RECORD kept at its id — never a splice, so ids never move), then
  // the drawer's own tombstone swap, and a palette + drawer refresh (drops it
  // from the palette).
  function deleteDrawerEntry(key: string): void {
    const i = drawer.findIndex((e) => e.key === key);
    if (i < 0) return;
    const e = drawer[i];
    if (e.kind === "plant") kernel.clearPlantInstances(e.speciesId);
    else kernel.clearCritterInstances(e.speciesId);
    drawer[i] = deleteEntry(e);
    refreshPalette();
    // refreshCensusStrip (not bare refreshDrawer) — since FIX 4 the richness
    // reading depends on LIVE population, so clearing a chain-critical kind
    // must re-score the living-web strip too, not just the drawer (else it
    // reads stale while paused). refreshCensusStrip refreshes the drawer too.
    refreshCensusStrip();
    if (ui) ui.flashNote(`cleared ${e.name.toLowerCase()} — its definition is kept; bring it back any time`);
  }

  // Bring back: the drawer's own tombstone swap, then a few fresh instances
  // re-spawned near the construct's centre through the ordinary placePlant/
  // placeCritter path — delete only ever cleared LIVE instances, the species
  // record never moved, so placing at the same id just works (the drawer's
  // stored def is the conceptual source of truth; the kernel's own record at
  // that id is, byte for byte, still it) — and a palette + drawer refresh
  // (re-adds it).
  function reviveDrawerEntry(key: string): void {
    const i = drawer.findIndex((e) => e.key === key);
    if (i < 0) return;
    const e = drawer[i];
    drawer[i] = reviveEntry(e);
    const cx = Math.floor(map.width / 2);
    const cy = Math.floor(map.height / 2);
    if (e.kind === "plant") {
      // lift clearPlantInstances' own germination ban (FIX 3) BEFORE
      // re-placing, so a brought-back substrate feeder can grow through
      // every route again — the fresh instances placed just below, AND any
      // future byproduct germination — not just this one direct re-place.
      kernel.unsuppressPlantSpecies(e.speciesId);
      const sp = kernel.plantSpecies[e.speciesId];
      const tile = nearestTileOf(map, sp.habitat, cx, cy) ?? { x: cx, y: cy };
      for (let n = 0; n < 3; n++) {
        const { x, y } = worldPxCenter(Math.min(map.width - 1, tile.x + n), tile.y);
        kernel.placePlant(e.speciesId, x, y);
      }
    } else {
      for (let n = 0; n < 2; n++) {
        const { x, y } = worldPxCenter(Math.min(map.width - 1, cx + n), cy);
        kernel.placeCritter(e.speciesId, x, y);
      }
    }
    refreshPalette();
    // refreshCensusStrip — reviving re-places live instances, which changes
    // the population-dependent richness reading (FIX 4); re-score the strip,
    // not just the drawer, so the living-web numbers don't lag while paused.
    refreshCensusStrip();
    if (ui) ui.flashNote(`brought back ${e.name.toLowerCase()}`);
  }

  // Curate — pin/unpin: a pure flag toggle on the drawer entry (pinEntry/
  // unpinEntry, immutable like delete/revive), swapped into `drawer` and
  // re-rendered. Never touches the kernel or the stored def — pinning only
  // marks a phenotype as the one `place pinned` should draw from. A pin used
  // to point nowhere (no feedback, no hint where "place pinned" even lives) —
  // both toggles now flash a note.
  function pinDrawerEntry(key: string): void {
    const i = drawer.findIndex((e) => e.key === key);
    if (i < 0) return;
    drawer[i] = pinEntry(drawer[i]);
    refreshDrawer();
    if (ui) ui.flashNote("pinned ⭑ — place pinned kinds from the roll pane, top-left");
  }
  function unpinDrawerEntry(key: string): void {
    const i = drawer.findIndex((e) => e.key === key);
    if (i < 0) return;
    drawer[i] = unpinEntry(drawer[i]);
    refreshDrawer();
    if (ui) ui.flashNote("unpinned");
  }

  // Curate — reseed: for every pinned, non-deleted kind, re-place a few fresh
  // instances from its STORED def near the construct's centre — the SAME
  // nearestTileOf + worldPxCenter placement loop reviveDrawerEntry uses,
  // through the ordinary placePlant/placeCritter path (the species record
  // still sits at its id, so placing just works; the drawer's deep-cloned
  // def is the conceptual source of truth). Placement draws only from the
  // kernel's own seeded placeRng, off the step stream — deterministic. Only
  // ever ADDS instances; nothing pinned or otherwise is cleared.
  function reseedPinned(): void {
    const cx = Math.floor(map.width / 2);
    const cy = Math.floor(map.height / 2);
    const pinned = pinnedEntries(drawer);
    for (const e of pinned) {
      if (e.kind === "plant") {
        const sp = kernel.plantSpecies[e.speciesId];
        const tile = nearestTileOf(map, sp.habitat, cx, cy) ?? { x: cx, y: cy };
        for (let n = 0; n < 3; n++) {
          const { x, y } = worldPxCenter(Math.min(map.width - 1, tile.x + n), tile.y);
          kernel.placePlant(e.speciesId, x, y);
        }
      } else {
        for (let n = 0; n < 2; n++) {
          const { x, y } = worldPxCenter(Math.min(map.width - 1, cx + n), cy);
          kernel.placeCritter(e.speciesId, x, y);
        }
      }
    }
    refreshPalette();
    refreshDrawer();
    refreshCensusStrip();
    if (ui) {
      ui.flashNote(
        pinned.length === 0
          ? "nothing pinned to place"
          : `placed ${pinned.length} pinned ${pinned.length === 1 ? "kind" : "kinds"} from their stored definitions`,
      );
    }
  }

  // ?drawerdemo=1: rolls+picks one plant kind and one critter kind (the SAME
  // roll→pick path a click takes) and stamps a small patch of each near the
  // construct's centre via stampKindAt (also the same path a click takes),
  // so the drawer shows real, non-zero "in play" counts without a manual
  // click. The plant patch is a dense same-kind 3×3 (stampCells' own block —
  // ?split=1's own "dense same-kind stamp"). Best-effort, same spirit as
  // ?demo: a seed that rolls nothing placeable simply leaves the drawer
  // showing the starter kinds alone. Leaves the roll pane / brush / selection
  // back at their neutral defaults when done.
  function seedDrawerDemo(): void {
    const cx = Math.floor(map.width / 2);
    const cy = Math.floor(map.height / 2);
    rollKind = "plant";
    rollCursor = 0;
    rollBatch();
    if (batch.length > 0) {
      pickBatch(0);
      if (selected?.kind === "plant") {
        brushSize = 3;
        const sp = kernel.plantSpecies[selected.id];
        const tile = nearestTileOf(map, sp.habitat, cx, cy) ?? { x: cx, y: cy };
        stampKindAt(tile.x, tile.y);
      }
    }
    rollKind = "critter";
    rollCursor = 1; // a different slice of the seeded stream than the plant draw above
    rollBatch();
    if (batch.length > 0) {
      pickBatch(0);
      if (selected?.kind === "critter") {
        brushSize = 2;
        stampKindAt(Math.min(map.width - 1, cx + 5), Math.min(map.height - 1, cy + 5));
      }
    }
    rollKind = "critter"; // the app's own default toggle state
    rollCursor = 0;
    batch = [];
    brushSize = 1;
    selected = null;
  }

  // Re-renders the readout plate from the current `inspected` pick — called
  // after every kernel.step() batch (play, step, step-n) and after a fresh
  // pick, so the numbers are always the kernel's actual current state, never
  // a stale snapshot. A harmless no-op before `ui` exists (build()'s first
  // call, ahead of buildChrome()).
  function refreshInspect(): void {
    if (!ui) return;
    // a plant the sim has since removed (grazed young, aged out, or thinned
    // by crowding — all ordinary live behavior, not a future erase tool)
    // must not linger as a ghost with a forever-climbing age (age = kernel.tick
    // - plant.born, and tick never stops) — drop it, matching fauna.ts:811's
    // own held-ref liveness guard (`flora.all[c.meal.idx] === c.meal`).
    // Critters never need this: placeCritter only ever adds, and nothing in
    // this bench removes a critter, so a critter ref can't go stale.
    if (inspected?.kind === "plant" && kernel.flora.all[inspected.ref.idx] !== inspected.ref) {
      inspected = null;
    }
    if (!inspected) {
      ui.hideInspect();
      return;
    }
    if (inspected.kind === "critter") {
      ui.showCritterInspect(
        critterInspectView(inspected.ref, kernel.critterSpecies[inspected.ref.species], kernel.plantSpecies),
      );
    } else {
      ui.showPlantInspect(plantInspectView(inspected.ref, kernel.plantSpecies[inspected.ref.species], kernel.tick));
    }
  }

  // Re-renders the always-on census + living-web strip, AND the drawer
  // (Task 6 — the same call sites that already keep the census live are
  // exactly the ones the drawer's "in play" counts need too). Called after
  // every kernel.step() batch AND after a placement (a fresh kind can add a
  // latent chain link even before anything's stepped). This is where a chain
  // is actually WATCHED closing: a feeder species' row climbs out of the
  // census from zero once the source→disperser→feeder loop first resolves.
  function refreshCensusStrip(): void {
    if (!ui) return;
    ui.setCensusWeb(
      censusWebView(kernel.census, kernel.plantSpecies, kernel.critterSpecies, kernel.speciesCounts(), (id) =>
        kernel.critterCountOf(id),
      ),
    );
    refreshDrawer();
  }

  // The pressures panel's one lever (Task 5, slice 4 — "crank a pressure,
  // watch evolution change"): a slider write straight onto the RUNNING
  // kernel. The four FloraTuning-backed pressures go through kernel.
  // setTuning(tuningPatchFor(...)) — live, no rebuild, Flora reads
  // this.tuning fresh every tick, so the very next step() evolves under the
  // new pressure with the current tick/plants/critters untouched. Grazer-
  // share is a role-flip instead: grazerAssignment's own deterministic
  // per-species paint over the CURRENT critterKinds roster, written back via
  // kernel.setCritterRole (peaceful — a role flip thins by dispersal, never
  // a kill). Neither branch draws any rng, so the same seed + placements +
  // slider-at-tick + step count always reaches the identical census.
  // refreshCensusStrip reflects the new potential (the richness meter) right
  // away; the population itself only moves as you step. `if (ui)` mirrors
  // every other bench setter here (refreshPalette, chrome.setBrushSize's own
  // call site, etc.) — a harmless no-op when a dev aid calls this ahead of
  // buildChrome().
  function setPressure(id: PressureId, value: number): void {
    pressureValues[id] = value;
    const pressure = PRESSURES.find((p) => p.id === id);
    if (pressure?.tuningKey) {
      // fieldValueFor un-reverses speciation's slider position before it
      // reaches tuningPatchFor — the ONE place the reversal lives (identity
      // for the other three tuning-backed pressures); pressureValues[id]
      // itself keeps the raw slider position, so the readout still counts up
      // left→right the same as every sibling.
      kernel.setTuning(tuningPatchFor(id, fieldValueFor(id, value)));
    } else if (id === "grazerShare") {
      const ids = critterKinds.map((c) => c.id);
      // skip kinds wearing a bench role (fish/pollinator/shuttle set in the
      // ambient tray): grazer-share leaves those untouched rather than silently
      // reverting them (qa consistency #4).
      const roles = grazerAssignment(ids, value, (id) => kernel.critterSpecies[id].role);
      let changed = 0;
      for (const [cid, role] of roles) {
        if (kernel.critterSpecies[cid].role !== role) changed++;
        kernel.setCritterRole(cid, role);
      }
      refreshPalette();
      refreshDrawer();
      // FIX 5: grazer share used to silently repaint every kind's role with
      // no feedback — a hand-set role (from the iterate strip, or a rolled
      // web's disperser) could vanish without a trace. Now every touch
      // names exactly what changed.
      const sharePct = Math.round(value * 100);
      if (ui) {
        ui.flashNote(
          changed === 0
            ? `grazer share ${sharePct}% — roster unchanged`
            : `grazer share ${sharePct}% — repainted ${changed} ${changed === 1 ? "kind" : "kinds"}`,
        );
      }
    }
    refreshCensusStrip();
    if (ui) ui.setPressure(id, value);
  }

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
  function clampCamera(): void {
    camX = clampX(camX);
    camY = clampY(camY);
  }

  // Zoom out (or in) until the WHOLE construct fits the window, then centre
  // on it — the swarm bench's fit-to-field (simulator.ts's `scale = Math.min
  // ((w-margin)/FIELD_W, (h-margin)/FIELD_H)`), done through the real
  // Renderer's focus lens instead of a hand-rolled scale. Reads viewWidth/
  // viewHeight at zoom 1 first (the lens's own unscaled unit), so the fit
  // math never has to know SCALE or TILE_SIZE's relationship directly.
  // `fitZoom` is the baseline; `zoomMul` is the user's wheel nudge on top
  // (1 = fitted; scroll in/out from there without losing the fit math).
  const FIT_MARGIN = 0.92; // a little breathing room around the construct's edges
  let fitZoom = 1;
  let zoomMul = 1;
  function applyCameraZoom(): void {
    renderer.setZoom(Math.max(0.05, fitZoom * zoomMul));
    clampCamera();
  }
  function fitCameraToConstruct(): void {
    renderer.setZoom(1);
    const baseW = renderer.viewWidth;
    const baseH = renderer.viewHeight;
    const worldW = map.width * TILE_SIZE;
    const worldH = map.height * TILE_SIZE;
    fitZoom = Math.min(2, (baseW * FIT_MARGIN) / worldW, (baseH * FIT_MARGIN) / worldH);
    zoomMul = 1;
    applyCameraZoom();
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
    // Every unplaced species dens at the scratch Flora's fallback (map.spawn,
    // since no plants are placed yet) — park them off-map so a fresh bench
    // doesn't stack ~17 den mounds on the spawn tile. placeCritter (kernel.ts)
    // overwrites the real den to the drop tile on placement, so a PLACED
    // critter still dens where you dropped it. chainStats/chainLinks (foodweb.ts)
    // never read species.den — only role/palate/archetype — so this is safe.
    for (const sp of critterSpecies) sp.den = { x: -1, y: -1 };
    kernel = new SimKernel({
      map,
      plantSpecies: species,
      critterSpecies,
      seed,
      // ?split=1: permissive speciation tuning, so a dense same-kind stamp
      // (?drawerdemo=1's own 3×3 plant patch) plus a long &run= has a real
      // shot at founding a daughter within a screenshot-sized run.
      ...(splitAid
        ? { tuning: { splitDistance: 0.12, splitClusterMin: 2, splitCooldownTicks: 0, splitKinDistance: 0.4 } }
        : {}),
    });
    if (!renderer) renderer = new Renderer(canvas, map);
    else renderer.setMap(map);
    fitCameraToConstruct();

    selected = null;
    // the drawer's roster resets with the construct — seeded with every
    // starter kind (origin "starter") so the roster (and, from here on, the
    // palette itself — refreshPalette sources it FROM the drawer) is never
    // empty, even before a single kind is rolled.
    drawer = [
      ...kernel.plantSpecies.map((sp) => makeEntry({ kind: "plant", speciesId: sp.id, def: sp, origin: "starter" })),
      ...kernel.critterSpecies.map((sp) =>
        makeEntry({ kind: "critter", speciesId: sp.id, def: sp, origin: "starter" }),
      ),
    ];
    refreshPalette(); // plantKinds/critterKinds now sourced from the drawer's non-deleted entries
    rollCursor = 0;
    webCursor = 0;
    batch = [];
    if (demoRequested) seedDemoScenario(map, kernel, plantKinds);
    if (drawerDemoAid) seedDrawerDemo();
    // ?web=/?rich=: seeded ahead of the ?run=N pre-step below (same tier as
    // ?demo/?drawerdemo just above), so &run=N composes to show an
    // already-closing web, not an unstepped one.
    if (webAid) seedWeb(WEB_SIZE);
    if (richAid) seedWeb(WEB_SIZE_RICH);
    // FIX 5: seed grazerShare from the roster's ACTUAL current grazer mix,
    // not the placeholder 0 pressureValues was constructed with — this is
    // the first point critterKinds reflects the FULLY assembled roster
    // (starters plus whatever ?demo/?drawerdemo/?web/?rich just introduced),
    // so the pressures tray's slider starts truthful instead of silently
    // claiming "no grazers" on a roster that already has some.
    // ?pressures=wild, just below, still cranks this to 0.5 afterward — it
    // runs later and setPressure always overwrites pressureValues outright.
    {
      const liveGrazers = critterKinds.filter((sp) => sp.role === "grazer").length;
      pressureValues.grazerShare = critterKinds.length > 0 ? liveGrazers / critterKinds.length : 0;
    }
    // ?pressures=wild: crank every pressure to its wild end BEFORE the
    // ?run=N pre-step just below, so a pre-stepped shot actually RUNS wild
    // rather than just showing wild-looking knobs over a defaults-evolved
    // construct. Placed after ?web=/?rich= (both already refreshPalette()'d
    // the roster) so grazerShare's role-flip reaches any web-introduced
    // disperser too. `ui` doesn't exist yet on the very first build() call —
    // setPressure's own `if (ui)` guard skips the slider sync here; the
    // post-buildChrome loop (outside build(), below) re-lights the sliders
    // to match once `ui` does.
    if (pressuresAid === "wild") {
      setPressure("mutationAmount", 0.28);
      // speciation's slider is now right=wilder like its four siblings (FIX
      // 2) — 0.6 is its slider MAX, which fieldValueFor mirrors down to the
      // wild real splitDistance (0.08), the same wild field value this dev
      // aid always cranked to.
      setPressure("splitDistance", 0.6);
      setPressure("grazerShare", 0.5);
      setPressure("reproChance", 0.35);
      setPressure("maxPerTile", 10);
    }
    if (runTicks > 0) kernel.step(runTicks, "full");
    if (brushDemo === "stamp") {
      // a 3×3 of the first placeable plant kind near the construct's centre,
      // then a 2×2 of the first critter kind a few tiles off — real sprites,
      // laid through stampKindAt itself (so the screenshot proves the SAME
      // path a click takes, not a bespoke placement).
      const cx = Math.floor(map.width / 2);
      const cy = Math.floor(map.height / 2);
      const plantSp = plantKinds[0];
      if (plantSp) {
        brushSize = 3;
        selected = { kind: "plant", id: plantSp.id };
        const tile = nearestTileOf(map, plantSp.habitat, cx, cy) ?? { x: cx, y: cy };
        stampKindAt(tile.x, tile.y);
      }
      const critterSp = critterKinds[0];
      if (critterSp) {
        brushSize = 2;
        selected = { kind: "critter", id: critterSp.id };
        stampKindAt(Math.min(map.width - 1, cx + 5), Math.min(map.height - 1, cy + 5));
      }
      brushSize = 3; // leaves the picker showing 3× lit — the size behind the plant block above
    }
    if (brushDemo === "biome") {
      // pick a plant kind whose habitat this starter's construct does NOT
      // have — excluded from the initial palette, the same "off" search
      // sim-brush.test.ts's unlock test uses — then paint that habitat in
      // near the centre (the raw mutation a hand-drag makes) and run it
      // through the REAL repaintRefresh path (proving the unlock, not just
      // asserting it), before stamping the now-unlocked plant onto the patch.
      const cx = Math.floor(map.width / 2);
      const cy = Math.floor(map.height / 2);
      const off = kernel.plantSpecies.find((s) => !habitatsOf(map).has(s.habitat));
      if (off) {
        paintBiome(map, stampCells(cx, cy, 3, map), off.habitat);
        repaintRefresh(); // re-filters plantKinds — off's kind is now placeable
        brushSize = 3;
        selected = { kind: "plant", id: off.id };
        stampKindAt(cx, cy); // roots on the freshly-painted patch, proving Flora agrees
      } else {
        console.warn(
          "world-lab biome demo: every habitat is already present on this construct " +
            "— painting a ShallowWater patch instead (nothing new to unlock)",
        );
        paintBiome(map, stampCells(cx, cy, 3, map), Tile.ShallowWater);
        repaintRefresh();
      }
    }
    // ?roll=plant|critter pre-rolls the pane's grid for a shot (any other
    // truthy value, e.g. ?roll=1, defaults to critter); ?rollpick=0,3
    // additionally introduces those batch indices for real, so a shot can
    // also show the picked-onto-the-palette state.
    if (rollAid !== null) {
      rollKind = rollAid === "plant" || rollAid === "critter" ? rollAid : "critter";
      rollBatch();
    }
    if (rollPickAid) {
      for (const raw of rollPickAid.split(",")) {
        const idx = Number(raw.trim());
        if (Number.isInteger(idx) && idx >= 0) pickBatch(idx);
      }
    }
    // ?iterate=looks|traits (any other truthy value reads as "looks"):
    // deterministically focuses batch cell 0 and applies one looks-nudge or
    // one traits-change (off iterateRng), so a shot shows the strip open
    // with a live-re-rendered thumbnail. Needs a populated batch (?roll=
    // alongside it) — a no-op otherwise.
    if (iterateAid !== null && batch.length > 0) {
      focusBatch(0);
      if (iterateAid === "traits") {
        const cand = batch[0];
        if (rollKind === "plant") {
          const sp = cand as PlantSpecies;
          const alt = BIOME_TILES.find((t) => t.tile !== sp.habitat)?.tile ?? sp.habitat;
          setFocusedTrait({ habitat: alt, substrateFeeder: !sp.substrateFeeder });
        } else {
          const sp = cand as CritterSpecies;
          setFocusedTrait({ role: sp.role === "grazer" ? "disperser" : "grazer", size: sp.size + SIZE_STEP });
        }
      } else {
        nudgeFocused();
      }
    }
    // ?drawerdel=<index-or-key>: deletes that drawer entry deterministically
    // (the SAME deleteDrawerEntry a click on the drawer's own delete button
    // runs), so a shot can show the cleared badge + bring-back button, and
    // that kind gone from the palette.
    if (drawerDelAid !== null) {
      const idx = Number(drawerDelAid);
      const target =
        Number.isInteger(idx) && idx >= 0 && idx < drawer.length
          ? drawer[idx]
          : drawer.find((e) => e.key === drawerDelAid);
      if (target) deleteDrawerEntry(target.key);
    }
    // ?pin=<index-or-key>: pins that drawer entry deterministically (the SAME
    // pinDrawerEntry a click on the drawer's own pin button runs); ?reseed=1
    // then calls reseedPinned() once, so a shot can show the pinned kind
    // re-placed from its stored def.
    if (pinAid !== null) {
      const idx = Number(pinAid);
      const target =
        Number.isInteger(idx) && idx >= 0 && idx < drawer.length ? drawer[idx] : drawer.find((e) => e.key === pinAid);
      if (target) pinDrawerEntry(target.key);
    }
    if (reseedAid) reseedPinned();
    inspected =
      inspectAid === "critter" && kernel.critters.length > 0
        ? { kind: "critter", ref: kernel.critters[0] }
        : inspectAid === "plant" && kernel.flora.all.length > 0
          ? { kind: "plant", ref: kernel.flora.all[0] }
          : null;
    if (ui) {
      ui.setPalette(plantKinds, critterKinds);
      ui.setSelected(selected);
      ui.setRollKind(rollKind);
      renderGrid();
      renderFocus();
    }
    refreshInspect();
    refreshCensusStrip();
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
  ui.onBrushSize = (s) => {
    brushSize = s;
    ui!.setBrushSize(s);
  };
  ui.onRollKind = (k) => {
    rollKind = k;
    batch = []; // a stale batch of the OTHER kind can't render under the new one
    focus = null; // and whatever it had focused goes with it
    ui!.setRollKind(k);
    ui!.setBatch([]);
    ui!.setFocus(null);
  };
  ui.onRoll = () => rollBatch();
  ui.onReRoll = () => {
    rollCursor++; // the deterministic advance: same kind, next slice of the stream
    rollBatch();
  };
  ui.onPickBatch = (i) => pickBatch(i);
  ui.onRollWeb = () => seedWeb(WEB_SIZE);
  ui.onSeedRicher = () => seedWeb(WEB_SIZE_RICH);
  ui.onFocusBatch = (i) => focusBatch(i);
  ui.onNudgeLooks = () => nudgeFocused();
  ui.onRerollLooks = () => nudgeFocused(REROLL_LOOKS_AMOUNT[rollKind]);
  ui.onSetTrait = (patch) => setFocusedTrait(patch);
  ui.onPickFocused = () => pickFocused();
  ui.onDeleteEntry = (key) => deleteDrawerEntry(key);
  ui.onReviveEntry = (key) => reviveDrawerEntry(key);
  ui.onPinEntry = (key) => pinDrawerEntry(key);
  ui.onUnpinEntry = (key) => unpinDrawerEntry(key);
  ui.onReseedPinned = () => reseedPinned();
  ui.onPressure = (id, value) => setPressure(id, value);
  ui.onAmbientRole = (id, role) => {
    const was = kernel.critterSpecies[id].role;
    kernel.setCritterRole(id, role); // the same live role-flip grazerShare uses
    refreshPalette(); // repaints the chip badge AND the tray (refreshPalette feeds setAmbient)
    refreshDrawer();
    // speak the tray's own vocabulary ("fish", "shuttle"), not the raw kebab-case
    // CritterRole id ("aquatic-grazer", "nutrient-shuttle") the button never showed
    // (qa consistency #3 / coherence Important #2). Raw id only for a role the tray
    // doesn't list.
    const roleName = AMBIENT_ROLES.find((r) => r.id === role)?.label ?? role;
    ui?.flashNote(was === role ? `${roleName} — unchanged` : `role → ${roleName}`);
  };
  // a dev-aid so the tray can be screenshot open without a mouse click
  if (new URLSearchParams(location.search).has("ambient")) {
    refreshPalette(); // ensure setAmbient has the current roster
    ui.openAmbient(true);
  }
  ui.setPalette(plantKinds, critterKinds);
  ui.setSelected(selected);
  ui.setBrushSize(brushSize);
  ui.setRollKind(rollKind);
  // the boot-time twin of refreshPalette's own ui.setAmbient call (Step 5):
  // build() (just above) ran refreshPalette() before `ui` existed, so that
  // first call's if (ui) {...} guard never fired for setAmbient either.
  // Without this, the ambient tray opens BLANK on an ordinary first use.
  ui.setAmbient(
    critterKinds.map((c) => ({ id: c.id, name: c.name, role: c.role })),
    habitatsOf(map).has(Tile.ShallowWater),
  );
  // re-light the tray's sliders to whatever pressureValues actually holds —
  // buildChrome() itself only knows DEFAULT_TUNING (it has no access to this
  // closure's state), so if ?pressures=wild already cranked pressureValues
  // inside build() above (ahead of `ui` existing), the sliders would
  // otherwise still show the defaults they were built with.
  for (const p of PRESSURES) ui.setPressure(p.id, pressureValues[p.id]);
  if (evoAid || pressuresAid === "wild") ui.openPressures(true);
  // ?roll=… shots expect the roll pane visible — open it when the aid is on
  if (rollAid) ui.openRoll(true);
  // the first real render: build()'s own call above ran before `ui` existed
  renderGrid();
  renderFocus();
  refreshInspect();
  refreshCensusStrip();

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
  // FIX 6: the spec names pause/play/SPEED — play used to pace off a single
  // fixed TICK_MS. speedMul only ever changes how many kernel.step() calls
  // the wall clock pumps per frame (the frame loop below divides TICK_MS by
  // it) — never a sim input, so it stays exactly as deterministic as before.
  let speedMul = 1;
  function refreshTimeState(): void {
    ui!.setTimeState({ playing, fidelity, stepN, speedMul });
  }
  ui.onPlay = () => {
    playing = !playing;
    refreshTimeState();
  };
  ui.onStep = () => {
    playing = false;
    kernel.step(1, fidelity);
    refreshTimeState();
    refreshCensusStrip();
    refreshInspect();
  };
  ui.onStepN = () => {
    playing = false;
    kernel.step(stepN, fidelity);
    refreshTimeState();
    refreshCensusStrip();
    refreshInspect();
  };
  ui.onStepNChange = (n) => {
    stepN = Math.max(1, Math.min(5000, Math.floor(n) || 1));
  };
  ui.onFidelity = (f) => {
    fidelity = f;
    refreshTimeState();
  };
  ui.onSpeed = () => {
    speedMul = speedMul >= 4 ? 1 : speedMul * 2;
    refreshTimeState();
  };
  refreshTimeState();
  ui.setTick(kernel.tick);

  // ── save/load a construct to a named slot (Task 9): packSim/restoreSim +
  // the slot storage (simSave.ts, Tasks 7–8) wired into the bench itself. A
  // sim slot names itself (mirrors nameWorld's window.prompt, main.ts) —
  // currentSlotId/currentSlotName remember which slot (if any) this
  // construct came from or was last saved to, so a re-save on the SAME
  // construct overwrites its own slot rather than minting a fresh one every
  // time. ───────────────────────────────────────────────────────────────────
  ui.onSaveSlot = () => {
    const name = window.prompt("name this construct", currentSlotName ?? "construct")?.trim();
    if (!name) return; // empty/cancel → no save (mirrors nameWorld's null/empty guard)
    const savedAt = Date.now(); // UI metadata only — never a sim input
    const id = currentSlotId ?? `${savedAt.toString(36)}-${Math.floor(savedAt % 1000)}`;
    const control: SavedSimControl = { playing, fidelity, speedMul, stepN };
    const blob = packSim({ kernel, drawer, starter, seed, name, savedAt, control });
    saveSimSlot(localStorage, { id, name, savedAt }, blob);
    currentSlotId = id;
    currentSlotName = name;
    ui!.flashNote(`saved · ${name}`);
  };
  ui.onLoadSlot = () => openSlotPicker();
  ui.onPickSlot = (id) => {
    const blob = loadSimSlot(localStorage, id);
    if (!blob) return;
    rebuildFromSim(restoreSim(blob), blob.seed, id, blob.name);
    ui!.openSlotPanel(false);
  };
  ui.onForgetSlot = (id) => {
    forgetSimSlot(localStorage, id);
    openSlotPicker(); // re-open with the entry gone (mirrors the isle picker's forget → re-open)
  };

  // Fills the slot panel from readSimIndex, most-recent-first, each row's
  // "last saved" phrase off agoPhrase (picker.ts) — the SAME relative-time
  // voice the isle picker already uses, so a sim slot and a real world read
  // alike.
  function openSlotPicker(): void {
    const rows: SlotRowView[] = readSimIndex(localStorage).map((m) => ({
      id: m.id,
      name: m.name,
      when: `last saved ${agoPhrase(Date.now() - m.savedAt)}`,
    }));
    ui!.setSlotRows(rows);
    ui!.openSlotPanel(true);
  }

  // Swaps the bench over to a restored construct: a NEW kernel + drawer
  // (never the one just left running), the construct's own starter/seed kept
  // in sync (so a later re-save re-derives the SAME buildConstruct baseline
  // this slot was loaded from), and every panel refreshed from the restored
  // state — palette, drawer, census + richness (one call — censusWebView's
  // own richnessMeter), the renderer's map, and the camera re-fit (a
  // restored construct may be a different size than the one just left).
  // Whatever the OLD kernel had picked/inspected/rolled cannot survive a
  // kernel swap (its refs point into a now-discarded object graph), so those
  // reset exactly as a fresh build() would.
  function rebuildFromSim(r: RestoredSim, restoredSeed: number, id: string, name: string): void {
    kernel = r.kernel;
    map = kernel.map;
    drawer = r.drawer;
    starter = r.starter;
    seed = restoredSeed;
    if (r.control) {
      playing = r.control.playing;
      fidelity = r.control.fidelity;
      speedMul = r.control.speedMul;
      stepN = r.control.stepN;
    }
    currentSlotId = id;
    currentSlotName = name;
    selected = null;
    inspected = null;
    batch = [];
    focus = null;
    rollCursor = 0;
    webCursor = 0;
    renderer.setMap(map);
    fitCameraToConstruct();
    ui!.setStarter(starter);
    refreshPalette();
    refreshTimeState();
    refreshCensusStrip(); // drawer + census + richness — one call
    refreshInspect(); // inspected is now null → the readout plate hides
    renderGrid();
    renderFocus();
    ui!.flashNote(`loaded · ${name}`);
  }

  // The slot panel's own dev aid (Task 9, mirrors ?evo=1 above): opens the
  // picker on load, so a shot can show it with no manual click. Display-
  // only — readSimIndex/agoPhrase draw no rng.
  if (slotsAid) openSlotPicker();

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
      refreshCensusStrip();
      refreshInspect();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      playing = false;
      kernel.step(1, fidelity);
      refreshTimeState();
      refreshCensusStrip();
      refreshInspect();
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
      // Esc closes the current thing: a readout first (simulator.ts's own
      // rule); with nothing inspected, the bench itself — back to the island
      if (inspected) {
        inspected = null;
        refreshInspect();
      } else {
        leaveBench();
      }
    }
  });
  window.addEventListener("resize", () => {
    renderer.resize();
    fitCameraToConstruct();
  });

  // Wheel zooms in/out around the fitted baseline. preventDefault so the page
  // doesn't scroll under the canvas while the user is leaning into the construct.
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.11;
      zoomMul = Math.min(4, Math.max(0.4, zoomMul * factor));
      applyCameraZoom();
    },
    { passive: false },
  );

  // ── pointer-to-place / pointer-to-paint / click-to-inspect: screen px →
  // world px through the SAME camera math either way (the fit-to-window zoom
  // AND the centred offset — the lens the render loop reads), then
  // tile-snapped for placement/painting so a plant or a tile lands square on
  // the tile under the pointer rather than some sub-tile jitter position.
  // These lines are the slice-1 click handler's own mapping, unchanged —
  // pulled into a helper only so pointerdown/pointermove can share it. With
  // the select tool active (selected === null), the raw (untile-snapped)
  // world point instead hit-tests the kernel's placed critters, then plants,
  // within PICK_RADIUS_PX — a click near nothing quietly clears the readout
  // rather than leaving a stale one. A placement click hands the tile straight
  // to stampKindAt, which lays the brush's current N×N block (size 1 =
  // exactly slice 1's single placement). Dragging with a plant/critter
  // selected stamps on each NEW tile the pointer crosses (same stroke model
  // as the biome brush). A tile pick instead begins a paint stroke, dragged
  // live via pointermove and refreshed once on pointerup.
  function pointerTile(e: PointerEvent): { tx: number; ty: number; wx: number; wy: number } | null {
    const rect = canvas.getBoundingClientRect();
    const wx = camX + (e.offsetX / rect.width) * renderer.viewWidth;
    const wy = camY + (e.offsetY / rect.height) * renderer.viewHeight;
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null; // off the construct
    return { tx, ty, wx, wy };
  }

  // The paint / place stroke's own state: `painting` for biome brush, `placing`
  // for plant/critter stamps. Both skip re-stamping the same tile on every
  // mousemove within it. `strokeChanged` only matters for biome (palette may
  // unlock); for kinds we always refresh census inside stampKindAt.
  let painting = false;
  let placing = false;
  let strokeChanged = false;
  let lastStrokeKey = -1;

  function endStroke(): void {
    if (painting && strokeChanged) repaintRefresh(); // once per stroke, not per cell
    painting = false;
    placing = false;
    strokeChanged = false;
  }

  canvas.addEventListener("pointerdown", (e) => {
    const hit = pointerTile(e);
    if (!hit) return;
    const { tx, ty, wx, wy } = hit;
    if (!selected) {
      const c = pickCritterNear(kernel.critters, wx, wy, PICK_RADIUS_PX);
      const p = c ? null : nearestPlant(kernel.flora.plantsNear(wx, wy, PICK_RADIUS_PX), wx, wy);
      inspected = c ? { kind: "critter", ref: c } : p ? { kind: "plant", ref: p } : null;
      refreshInspect();
      return;
    }
    if (selected.kind === "tile") {
      painting = true;
      strokeChanged = paintTileAt(tx, ty) || strokeChanged;
      lastStrokeKey = ty * map.width + tx;
      return;
    }
    // plant or critter — stamp now, then drag across tiles to lay a path/patch
    placing = true;
    lastStrokeKey = ty * map.width + tx;
    stampKindAt(tx, ty);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!painting && !placing) return;
    const hit = pointerTile(e);
    if (!hit) return;
    const { tx, ty } = hit;
    const key = ty * map.width + tx;
    if (key === lastStrokeKey) return; // already handled this tile this stroke's last step
    lastStrokeKey = key;
    if (painting && selected?.kind === "tile") {
      strokeChanged = paintTileAt(tx, ty) || strokeChanged;
      return;
    }
    if (placing && selected && selected.kind !== "tile") {
      // quiet: don't flash a refuse on every dragged full/wrong tile — the
      // pointerdown already named the problem once if the start cell failed.
      stampKindAt(tx, ty, { quiet: true });
    }
  });
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointerleave", endStroke);
  canvas.addEventListener("pointercancel", endStroke);

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
      const stepMs = TICK_MS / speedMul; // speed only re-paces the ACCUMULATOR — never a sim input
      while (acc >= stepMs && ticks < 8) {
        acc -= stepMs;
        ticks++;
      }
      if (ticks > 0) {
        kernel.step(ticks, fidelity);
        refreshCensusStrip();
        refreshInspect();
      }
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
  onBrushSize: (s: BrushSize) => void;
  setBrushSize: (s: BrushSize) => void;
  flashNote: (msg: string) => void;
  // the roll pane: kind toggle + roll/re-roll + a grid of live thumbnails →
  // pick onto the palette (Simulator slice 3)
  onRollKind: (k: RollKind) => void;
  setRollKind: (k: RollKind) => void;
  onRoll: () => void;
  onReRoll: () => void;
  setBatch: (cells: { thumb: HTMLCanvasElement; name: string; tint: string }[]) => void;
  onPickBatch: (index: number) => void;
  // roll-a-web (Task 4, slice 4): rolls + introduces + auto-places a matched,
  // closable source/feeder/disperser set — "roll a web" a starter batch,
  // "seed it richer" a denser one
  onRollWeb: () => void;
  onSeedRicher: () => void;
  // the iterate strip: focus a batch candidate → looks (nudge/re-roll) +
  // trait controls (kind-appropriate) + a pick button (Simulator slice 3)
  onFocusBatch: (index: number | null) => void;
  setFocus: (view: FocusView | null) => void;
  onNudgeLooks: () => void;
  onRerollLooks: () => void;
  onSetTrait: (patch: TraitPatch) => void;
  onPickFocused: () => void;
  // time controls (Task 6)
  onPlay: () => void;
  onStep: () => void;
  onStepN: () => void;
  onStepNChange: (n: number) => void;
  onFidelity: (f: Fidelity) => void;
  // speed (Task 6/QA FIX 6 — the spec names pause/play/speed; play used to
  // pace off a single fixed TICK_MS): cycles ×1→×2→×4, read out on the SAME
  // button whose label reflects the current multiplier.
  onSpeed: () => void;
  setTimeState: (s: { playing: boolean; fidelity: Fidelity; stepN: number; speedMul: number }) => void;
  setTick: (tick: number) => void;
  // the readout plate + living-web strip (Task 7)
  showCritterInspect: (v: CritterInspectView) => void;
  showPlantInspect: (v: PlantInspectView) => void;
  hideInspect: () => void;
  setCensusWeb: (v: CensusWebView) => void;
  // the drawer (species roster): live status + delete/bring-back (Task 6)
  setDrawer: (rows: DrawerRow[]) => void;
  onDeleteEntry: (key: string) => void;
  onReviveEntry: (key: string) => void;
  // curate: pin a phenotype to re-seed from it (Task 6)
  onPinEntry: (key: string) => void;
  onUnpinEntry: (key: string) => void;
  onReseedPinned: () => void;
  // the evolution tray (Task 5, slice 4): five LIVE pressure sliders, toggled
  // open/closed. An in-flow child of the bottom-center `stack` (appended
  // last, so it grows the stack upward without disturbing the bar/palette
  // below it) — not an independent `position: fixed` overlay, and not a
  // leftStack/rightStack child either.
  onPressure: (id: PressureId, value: number) => void;
  setPressure: (id: PressureId, value: number) => void;
  openPressures: (open?: boolean) => void;
  // map-first side panels (closed by default) — roll kinds / living web / drawer
  openRoll: (open?: boolean) => void;
  openWeb: (open?: boolean) => void;
  openDrawer: (open?: boolean) => void;
  // the ambient bench (Simulator slice 5b): opt-in experimental roles for placed
  // critter KINDS, toggled live through kernel.setCritterRole. Same in-flow
  // child-of-`stack` tray shape as the pressures tray above — NOT a
  // position:fixed overlay. Bench-only; nothing graduates to real worlds.
  onAmbientRole: (id: number, role: CritterRole) => void;
  // hasShallow gates the fish (aquatic-grazer) button: on a waterless construct
  // (no Tile.ShallowWater) a flipped fish would freeze forever, so the tray
  // disables that one button with an explaining title (P2).
  setAmbient: (kinds: { id: number; name: string; role: CritterRole }[], hasShallow: boolean) => void;
  openAmbient: (open?: boolean) => void;
  // save/load a construct to a named slot (Task 9): a save-prompt button + a
  // load picker whose rows startWorldLab fills in from readSimIndex — Chrome
  // only draws what it's given and dispatches picks/forgets, the SAME split
  // the drawer's own onDeleteEntry/onReviveEntry already keep (storage
  // knowledge stays in startWorldLab; Chrome stays a dumb view).
  onSaveSlot: () => void;
  onLoadSlot: () => void;
  setSlotRows: (rows: SlotRowView[]) => void;
  onPickSlot: (id: string) => void;
  onForgetSlot: (id: string) => void;
  openSlotPanel: (open?: boolean) => void;
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
  // a biome swatch: the same chrome as a palette chip, but the FACE (not just
  // the edge) always carries the tile's OVERVIEW_COLORS tint — a swatch reads
  // as a little square of that ground even before it's picked. Some tiles
  // (sand, highland) are light enough that white text goes muddy, so the
  // label color is picked from the swatch's own luminance, not hardcoded.
  const luminanceOf = (hex: string): number => {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const tileBtn = (active: boolean, color: string): string => {
    const legibleDark = luminanceOf(color) > 0.55; // light swatch → dark text
    const ink = legibleDark ? "rgb(var(--abyss))" : "rgba(228,236,242,0.92)";
    return (
      `${MONO} text-transform: none; color: ${ink}; background: ${color};` +
      ` border: 1px solid ${color}; border-radius: 4px; padding: 5px 10px; cursor: pointer;` +
      ` white-space: nowrap; box-shadow: ${active ? "0 0 0 2px rgb(var(--lumen)) inset" : "none"};`
    );
  };

  const eyebrow = document.createElement("div");
  eyebrow.innerHTML =
    `<span style="font: 10px var(--mono); letter-spacing: 0.24em; text-transform: uppercase; color: rgb(var(--lumen));">Wonder · the Simulator</span>` +
    `<div style="font-family: var(--serif); font-variant: small-caps; letter-spacing: 0.04em; font-size: 20px; color: var(--ink-bright); margin-top: 2px;">the world-lab</div>` +
    `<div style="font: italic 11px var(--serif); color: rgba(228,236,242,0.55); margin-top: 2px; max-width: min(520px, 46vw);">` +
    `wheel zooms · ←↑↓ pan · select+click reads a genome · roll / web / drawer open the side panels · brush 1–4 stamps a patch · drag to sow a path · space plays · Esc home` +
    `</div>`;
  eyebrow.style.cssText = "position: fixed; left: 18px; top: 14px; z-index: 5; pointer-events: none; user-select: none;";
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
  // Capped to the viewport with its OWN scroll. Each child self-caps (palette
  // 40vh, evoTray/ambientTray 46vh), but nothing bounded the stack's TOTAL
  // height — bar + palette + a third open tray could exceed 100vh, and since the
  // stack is bottom-anchored + column-reverse with no cap, the overflow went off
  // the TOP of the viewport, unreachable by mouse or scroll (the ambient tray's
  // heading + first kind row vanished at laptop heights — qa coherence Blocking /
  // ux #1). A max-height + overflow-y here keeps the bottom anchor and the
  // reverse stacking, but now the top overflow SCROLLS into reach instead.
  stack.style.cssText =
    "position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 6;" +
    " display: flex; flex-direction: column-reverse; align-items: center; gap: 8px; max-width: 92vw;" +
    " max-height: calc(100vh - 36px); overflow-y: auto;";
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

  // speed (Task 6/QA FIX 6 — the spec names pause/play/speed): one button,
  // its own label the readout, cycling ×1→×2→×4→×1. Still inside the "time"
  // cluster, before the next sep() breaks into fidelity.
  const speedBtn = document.createElement("button");
  speedBtn.id = "speed-btn";
  speedBtn.textContent = "×1";
  speedBtn.style.cssText = btn(false);
  speedBtn.onclick = () => chrome.onSpeed();
  bar.appendChild(speedBtn);

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

  // ── the stamp brush's size picker: 1×–4× — one click (or drag step) lays
  // that many tiles square of the selected palette kind (size 1 is slice 1's
  // own single placement). Same active/inactive btn() chrome as fidelity. ──
  bar.appendChild(sep());
  const brushBtns = BRUSH_SIZES.map((size) => {
    const b = document.createElement("button");
    b.textContent = `${size}×`;
    b.title = size === 1 ? "place one" : `stamp a ${size}×${size} patch · drag to sow a path`;
    b.style.cssText = btn(false);
    b.onclick = () => chrome.onBrushSize(size);
    return { size, b };
  });
  bar.appendChild(group(label("brush"), ...brushBtns.map((s) => s.b)));

  // ── side-panel toggles (map-first): roll / living-web / drawer stay CLOSED
  // by default so the construct stays visible on a laptop. Open them from
  // here — same btn() chrome as pressures/ambient. ─────────────────────────
  bar.appendChild(sep());
  const panelRollBtn = document.createElement("button");
  panelRollBtn.id = "panel-roll-btn";
  panelRollBtn.textContent = "roll";
  panelRollBtn.title = "roll new kinds onto the palette";
  panelRollBtn.style.cssText = btn(false);
  bar.appendChild(panelRollBtn);
  const panelWebBtn = document.createElement("button");
  panelWebBtn.id = "panel-web-btn";
  panelWebBtn.textContent = "web";
  panelWebBtn.title = "census · food web · richness";
  panelWebBtn.style.cssText = btn(false);
  bar.appendChild(panelWebBtn);
  const panelDrawerBtn = document.createElement("button");
  panelDrawerBtn.id = "panel-drawer-btn";
  panelDrawerBtn.textContent = "drawer";
  panelDrawerBtn.title = "every kind introduced here";
  panelDrawerBtn.style.cssText = btn(false);
  bar.appendChild(panelDrawerBtn);

  // ── the pressures tray's toggle: a "pressures ⚘" button beside brush,
  // same btn() chrome as every other bar control. Flips the pressures tray
  // (an in-flow child of the bottom-center `stack`, built near the end of
  // this function, once stat() exists) open/closed — the marquee of the
  // evolutionary layer, one click away (Task 5, slice 4). ─────────────────
  bar.appendChild(sep());
  const pressuresBtn = document.createElement("button");
  pressuresBtn.id = "pressures-btn";
  pressuresBtn.textContent = "pressures ⚘";
  pressuresBtn.style.cssText = btn(false);
  pressuresBtn.onclick = () => chrome.openPressures();
  bar.appendChild(pressuresBtn);

  // ── the ambient bench toggle: an "ambient" button beside pressures, same
  // btn() chrome as every other bar control. Flips the ambient tray (built near
  // the end of this function) open/closed — the Simulator's opt-in ambient roles,
  // one click away (slice 5b). No glyph: the old "ambient ✿" reused ✿, which is
  // ALSO the pollinator role's own badge, so one mark meant both "open this panel"
  // and "this kind pollinates" (qa consistency #1). ────────────────────────────
  const ambientBtn = document.createElement("button");
  ambientBtn.id = "ambient-btn";
  ambientBtn.textContent = "ambient";
  ambientBtn.style.cssText = btn(false);
  ambientBtn.onclick = () => chrome.openAmbient();
  bar.appendChild(ambientBtn);

  // ── save/load a construct to a named slot (Task 9): a "save · load"
  // cluster beside pressures, same btn()/group() chrome as every other bar
  // control. Save prompts for a name (mirrors nameWorld's window.prompt,
  // main.ts); load opens the slot panel below (mirrors the isle picker's
  // own toggle-able modal, picker.ts). loadSlotBtn's active face tracks the
  // panel's open state, the same convention pressuresBtn already uses. ────
  bar.appendChild(sep());
  const saveSlotBtn = document.createElement("button");
  saveSlotBtn.id = "save-slot-btn";
  saveSlotBtn.textContent = "save";
  saveSlotBtn.style.cssText = btn(false);
  saveSlotBtn.onclick = () => chrome.onSaveSlot();
  const loadSlotBtn = document.createElement("button");
  loadSlotBtn.id = "load-slot-btn";
  loadSlotBtn.textContent = "load";
  loadSlotBtn.style.cssText = btn(false);
  loadSlotBtn.onclick = () => chrome.onLoadSlot();
  bar.appendChild(group(label("slot"), saveSlotBtn, loadSlotBtn));

  chrome.onSaveSlot = () => {};
  chrome.onLoadSlot = () => {};

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
  chrome.onSpeed = () => {};
  chrome.setTimeState = ({ playing, fidelity, stepN, speedMul }) => {
    playBtn.textContent = playing ? "pause" : "play";
    for (const { f, b } of fidelityBtns) b.style.cssText = btn(f === fidelity);
    if (Number(stepNInput.value) !== stepN) stepNInput.value = String(stepN);
    speedBtn.textContent = `×${speedMul}`;
  };
  chrome.setTick = (tick) => {
    tickValue.textContent = String(tick);
  };
  chrome.onBrushSize = () => {};
  chrome.setBrushSize = (size) => {
    for (const { size: s, b } of brushBtns) b.style.cssText = btn(s === size);
  };

  // ── the palette: a select tool + two rows (plants tinted by hue, critters
  // by name), docked just above the starter/time bar (both live in `stack`
  // now) so the two read as one strip of chrome. A third quiet row carries
  // the "won't root here" note. ────────────────────────────────────────────
  const palette = document.createElement("div");
  palette.id = "lab-palette"; // a stable hook, same convention as #lab-readout/#lab-census
  // Capped + scrolling, mirroring every OTHER panel's own vh-relative cap
  // (rollPane 48vh, drawerPanel/readout 42vh, evoTray 46vh) — without one, a
  // wrapped plant/critter row on a narrow window grows the palette, which
  // grows `stack` (its bottom-anchored, column-reverse parent), which shoves
  // the whole stack — the palette AND the pressures tray appended above it —
  // up over the header/side panels rather than staying put and scrolling.
  palette.style.cssText =
    "max-width: 88vw; max-height: 26vh; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;" +
    " padding: 9px 12px; background: var(--panel); border-radius: var(--radius); box-shadow: var(--frame);" +
    " user-select: none;";
  stack.appendChild(palette);

  const plantRow = document.createElement("div");
  plantRow.style.cssText = "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;";
  const critterRow = document.createElement("div");
  critterRow.style.cssText = "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;";
  const biomeRow = document.createElement("div");
  biomeRow.style.cssText = "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;";
  const hint = document.createElement("div");
  hint.style.cssText = `${MONO} color: rgb(var(--rose)); min-height: 13px; opacity: 0; transition: opacity 0.15s;`;
  palette.append(plantRow, critterRow, biomeRow, hint);

  const selectBtn = document.createElement("button");
  selectBtn.textContent = "select";
  selectBtn.title = "click the construct to read a plant's genome or a critter up close";
  selectBtn.style.cssText = btn(true); // null selection is the default
  selectBtn.onclick = () => chrome.onSelect(null);
  plantRow.appendChild(selectBtn);
  plantRow.appendChild(label("plant"));
  critterRow.appendChild(label("critter"));
  biomeRow.appendChild(label("biome"));

  let plantBtns: { id: number; b: HTMLButtonElement; tint: string }[] = [];
  let critterBtns: { id: number; b: HTMLButtonElement }[] = [];
  let hintTimer: number | undefined;

  // the biome swatch row is static (BIOME_TILES never changes across a
  // construct rebuild), so it's built once here rather than in setPalette —
  // unlike the plant/critter rows, which depend on the seed's rolled kinds.
  const tileBtns = BIOME_TILES.map(({ tile, name }) => {
    const color = OVERVIEW_COLORS[tile];
    const b = document.createElement("button");
    b.textContent = name;
    b.style.cssText = tileBtn(false, color);
    b.onclick = () => chrome.onSelect({ kind: "tile", tile });
    biomeRow.appendChild(b);
    return { tile, b, color };
  });

  chrome.setPalette = (plants, critters) => {
    for (const { b } of plantBtns) b.remove();
    for (const { b } of critterBtns) b.remove();
    plantBtns = plants.map((sp) => {
      const b = document.createElement("button");
      b.textContent = sp.name.toLowerCase();
      const need = BIOME_TILES.find((t) => t.tile === sp.habitat)?.name ?? "its habitat";
      b.title = `roots on ${need} · brush stamps a patch · drag to sow a path`;
      const tint = hsl(sp.archetype.hue, 0.62, 0.5);
      b.style.cssText = plantBtn(false, tint);
      b.onclick = () => chrome.onSelect({ kind: "plant", id: sp.id });
      plantRow.appendChild(b);
      return { id: sp.id, b, tint };
    });
    critterBtns = critters.map((c) => {
      const b = document.createElement("button");
      const badge = roleBadge(c.role); // "" for a plain disperser; a glyph for a bench role
      b.textContent = badge ? `${c.name.toLowerCase()} ${badge}` : c.name.toLowerCase();
      const roleHelp = AMBIENT_ROLES.find((r) => r.id === c.role)?.help; // P7: the chip explains its role
      if (roleHelp) b.title = roleHelp;
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
    for (const { tile, b, color } of tileBtns) {
      b.style.cssText = tileBtn(sel !== null && sel.kind === "tile" && sel.tile === tile, color);
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

  // ── the right column: the drawer (species roster, Task 6) and the select
  // tool's readout plate. The readout used to independently `position:
  // fixed` at right:18px, vertically centred — the drawer has nowhere
  // principled to go alongside it without risking the SAME collision
  // leftStack already fixed on the left column (a panel whose height can
  // reach into its neighbour's box). `rightStack` mirrors that fix: one
  // fixed anchor, plain flow children stacked top-down, so the readout's top
  // edge is always "the drawer's bottom + gap" — never a guess that can
  // overlap it, regardless of which panel is showing or how tall either
  // grows. Capped so, even both fully expanded, the column never reaches
  // the bottom starter/time/palette stack. ────────────────────────────────
  const rightStack = document.createElement("div");
  rightStack.id = "lab-right-stack";
  rightStack.style.cssText =
    "position: fixed; right: 18px; top: 92px; z-index: 6; display: flex; flex-direction: column;" +
    " align-items: flex-end; gap: 10px; max-height: calc(100vh - 160px); pointer-events: none;";
  document.body.appendChild(rightStack);

  // the drawer: every introduced kind (starter/rolled/captured daughter),
  // live status — in play / variations / a three-way alive-extinct-cleared
  // badge — and a delete/bring-back button. Docked above the readout.
  // Hidden by default (map-first); open from the bar's "drawer" toggle.
  const drawerPanel = document.createElement("div");
  drawerPanel.id = "lab-drawer";
  drawerPanel.style.cssText =
    "display: none; width: 296px; max-height: 42vh; overflow-y: auto; padding: 14px 16px; background: var(--panel);" +
    " border-radius: var(--radius); box-shadow: var(--frame); color: var(--ink); font-family: var(--serif);" +
    " user-select: none; flex: 0 0 auto; pointer-events: auto;";
  rightStack.appendChild(drawerPanel);

  const drawerHead = document.createElement("div");
  drawerHead.innerHTML =
    `<div style="font-variant: small-caps; letter-spacing: 0.03em; font-size: 17px; color: var(--ink-bright);">the drawer</div>` +
    `<div style="font: 11px var(--mono); color: rgba(228,236,242,0.5); margin-top: -2px;">every kind introduced here — live status, delete, bring back</div>`;
  drawerPanel.appendChild(drawerHead);

  const drawerEmptyMsg =
    `<div style="font: italic 12px var(--serif); color: rgba(228,236,242,0.45); padding: 4px 0;">nothing in the drawer yet</div>`;
  const drawerList = document.createElement("div");
  drawerList.style.cssText = "margin-top: 8px;";
  drawerList.innerHTML = drawerEmptyMsg;
  drawerPanel.appendChild(drawerList);

  chrome.onDeleteEntry = () => {};
  chrome.onReviveEntry = () => {};
  chrome.onPinEntry = () => {};
  chrome.onUnpinEntry = () => {};
  // Renders the roster from scratch every call — the drawer is never large
  // enough (a handful of starters + whatever's been rolled/captured) for a
  // full-innerHTML rebuild to be worth avoiding, and it keeps each row's
  // delete/bring-back button trivially wired to the CURRENT key, no stale
  // closures to worry about. Three-way state (deleted → cleared; extinct →
  // lived, now gone; else alive) is exactly the model's own reading of
  // `extinct`/`deleted` — this is the only place that turns it into a label.
  chrome.setDrawer = (rows) => {
    if (rows.length === 0) {
      drawerList.innerHTML = drawerEmptyMsg;
      return;
    }
    drawerList.innerHTML = "";
    for (const r of rows) {
      const state = r.deleted ? "cleared" : r.extinct ? "extinct" : "alive";
      const stateColor =
        state === "alive" ? "rgb(var(--lumen))" : state === "extinct" ? "rgb(var(--rose))" : "rgba(228,236,242,0.45)";
      const row = document.createElement("div");
      row.style.cssText = "padding: 7px 0; border-bottom: 1px solid rgba(127,224,196,0.14);";
      row.innerHTML =
        `<div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">` +
        `<span title="${esc(r.name)}" style="font-variant: small-caps; letter-spacing: 0.02em; font-size: 13px; color: var(--ink-bright);` +
        ` overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 158px;">${esc(r.name)}</span>` +
        `<span style="font: 9.5px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: ${stateColor};">${state}</span></div>` +
        `<div style="font: 10px var(--mono); color: rgba(228,236,242,0.45); margin-top: -1px;">${esc(r.sub)}</div>` +
        stat("in play", String(r.count), "mint") +
        stat("variations", String(r.variations));
      const actionBtn = document.createElement("button");
      actionBtn.style.cssText = btn(false) + " margin-top: 4px; padding: 3px 9px; font-size: 9px;";
      if (r.deleted) {
        actionBtn.textContent = "bring back";
        actionBtn.onclick = () => chrome.onReviveEntry(r.key);
      } else {
        actionBtn.textContent = "delete";
        actionBtn.onclick = () => chrome.onDeleteEntry(r.key);
      }
      row.appendChild(actionBtn);
      // curate: pin this phenotype so `place pinned` re-places fresh
      // instances from its stored def — the active (lumen-filled) face of
      // btn() IS the pinned ⭑ state, no separate badge needed.
      const pinBtn = document.createElement("button");
      pinBtn.style.cssText = btn(r.pinned) + " margin-top: 4px; margin-left: 6px; padding: 3px 9px; font-size: 9px;";
      pinBtn.textContent = r.pinned ? "⭑ pinned" : "pin ⭑";
      pinBtn.onclick = () => (r.pinned ? chrome.onUnpinEntry(r.key) : chrome.onPinEntry(r.key));
      row.appendChild(pinBtn);
      drawerList.appendChild(row);
    }
  };

  // ── the readout plate: a bench-owned codex plate for the select tool's
  // pick — raw internals, not the player-facing openInspect card. Docked
  // below the drawer in `rightStack` now (was independently fixed, vertically
  // centred — see rightStack's own comment above). ─────────────────────────
  const readout = document.createElement("div");
  readout.id = "lab-readout";
  readout.style.cssText =
    "display: none; width: 264px; max-height: 42vh; overflow-y: auto; padding: 16px 18px;" +
    " background: var(--panel); border-radius: var(--radius); box-shadow: var(--frame); color: var(--ink);" +
    " font-family: var(--serif); flex: 0 0 auto; pointer-events: auto;";
  rightStack.appendChild(readout);

  // ── the left column: the roll pane and the living-web census used to be
  // two independently `position: fixed` panels sharing the left:18px column
  // — the roll pane pinned under the eyebrow, the census vertically
  // centred. Once the roll grid filled out (its normal 2-row state), the
  // roll pane's height reached down into the census's vertically-centred
  // box, and painted over its title (it's appended to body later, so it
  // wins the paint order). `leftStack` fixes that structurally, the same
  // way the bottom starter/time `stack` above avoids ITS own panel
  // collision: a single fixed anchor, plain flow children laid top-down, so
  // the census's top edge is always "roll pane's bottom + gap" — never a
  // guess that can land inside the roll pane's box. ───────────────────────
  const leftStack = document.createElement("div");
  leftStack.id = "lab-left-stack";
  leftStack.style.cssText =
    "position: fixed; left: 18px; top: 92px; z-index: 6; display: flex; flex-direction: column;" +
    " align-items: flex-start; gap: 10px; max-height: calc(100vh - 160px); pointer-events: none;";
  // Children re-enable pointer-events so the empty stack doesn't block the map.
  document.body.appendChild(leftStack);

  // the census (population, the live proof) beside the food web's static
  // chain-potential, so watching a chain close is just watching a feeder's
  // row climb out of zero. Docked below the roll pane in `leftStack` now
  // (was vertically centred, independently fixed — see above).
  const web = document.createElement("div");
  web.id = "lab-census";
  web.style.cssText =
    "display: none; width: 240px; max-height: 52vh; overflow-y: auto; padding: 16px 18px; background: var(--panel);" +
    " border-radius: var(--radius); box-shadow: var(--frame); color: var(--ink); font-family: var(--serif);" +
    " pointer-events: auto; flex: 0 0 auto;";
  leftStack.appendChild(web);

  // shared plate-string helpers, mirroring simulator.ts's own title/head/
  // stat token usage so the two benches' plates read as one family
  const pct = (v: number): string => Math.round(v * 100) + "%";
  const esc = (s: string): string => s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
  const title = (t: string): string =>
    `<div style="font: 10px var(--mono); letter-spacing: 0.2em; text-transform: uppercase; color: rgb(var(--lumen)); opacity: 0.75; margin: 14px 0 6px;">${t}</div>`;
  const head = (name: string, sub: string): string =>
    `<div style="font-variant: small-caps; letter-spacing: 0.03em; font-size: 18px; color: var(--ink-bright);">${esc(name)}</div>` +
    `<div style="font: 11px var(--mono); color: rgba(228,236,242,0.5); margin-top: -2px;">${esc(sub)}</div>`;
  const stat = (k: string, v: string, cls: "ink" | "mint" | "gold" = "ink"): string => {
    const col = cls === "mint" ? "rgb(var(--lumen))" : cls === "gold" ? "rgb(var(--firefly))" : "var(--ink-bright)";
    return (
      `<div style="display: flex; justify-content: space-between; align-items: baseline; padding: 3px 0; gap: 10px;">` +
      `<span style="font: 9.5px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: rgba(228,236,242,0.5);">${esc(k)}</span>` +
      `<span style="font: 13px var(--mono); color: ${col}; text-align: right;">${esc(v)}</span></div>`
    );
  };
  // a drive row: the dominant one wears the firefly gold — the "legible why"
  const drive = (k: string, v: number, isDominant: boolean): string =>
    `<div style="display: flex; justify-content: space-between; align-items: baseline; padding: 3px 0;">` +
    `<span style="font: 9.5px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: ${isDominant ? "rgb(var(--firefly))" : "rgba(228,236,242,0.5)"};">${k}${isDominant ? " · dominant" : ""}</span>` +
    `<span style="font: 13px var(--mono); color: ${isDominant ? "rgb(var(--firefly))" : "var(--ink-bright)"};">${pct(v)}</span></div>`;
  const italic = (t: string): string =>
    `<div style="font: italic 12px var(--serif); color: rgba(228,236,242,0.6); line-height: 1.5; margin: 6px 0 2px;">${esc(t)}</div>`;
  const speciesRow = (name: string, spark: string, count: number): string =>
    `<div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px; padding: 2px 0; font: 11px var(--mono);">` +
    `<span title="${esc(name.toLowerCase())}" style="color: var(--ink-bright); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 96px;">${esc(name.toLowerCase())}</span>` +
    `<span style="color: rgb(var(--lumen)); letter-spacing: 0.03em;">${spark}</span>` +
    `<span style="color: rgba(228,236,242,0.7); min-width: 22px; text-align: right;">${count}</span></div>`;

  // ── the roll pane: the species lab's dice made visible — a kind toggle, a
  // roll/re-roll pair, and a grid of live thumbnails whose cells ARE the pick
  // buttons. Docked top-left, under the eyebrow, ABOVE the census in
  // `leftStack` (was independently fixed, vertically overlapping the
  // census — see leftStack's own comment above). The pane itself caps its
  // OWN height and scrolls as a whole (the vh-cap block just below) — not
  // just the grid's own inner scroll — so growth here can never shove the
  // census down into the collision leftStack was built to avoid. This
  // chrome never rolls or renders a sprite itself — worldlab.ts hands it
  // finished canvases via setBatch; a click only ever reports its index
  // outward. ─────────────────────────────────────────────────────────────
  const rollPane = document.createElement("div");
  rollPane.id = "lab-roll";
  // capped + its own scroll (same vh-relative move the census panel below it
  // already makes) — NOT just the grid's own inner scroll. The iterate strip
  // (Task 5) can grow taller than the grid ever did; without an outer cap the
  // whole pane would grow with it and shove the census down far enough to
  // clip its own food-web rows below the viewport — the exact collision
  // Task 4 fixed the OTHER way (leftStack's flex column). A vh cap bounds
  // the pane's rendered height regardless of what the strip ever grows to,
  // so the census's position never moves by more than the cap itself allows.
  rollPane.style.cssText =
    "display: none; width: 336px; padding: 14px 16px; background: var(--panel); border-radius: var(--radius);" +
    " box-shadow: var(--frame); color: var(--ink); font-family: var(--serif); user-select: none; flex: 0 0 auto;" +
    " max-height: 42vh; overflow-y: auto; pointer-events: auto;";
  leftStack.insertBefore(rollPane, web); // above the census — leftStack's first child

  const rollHead = document.createElement("div");
  rollHead.innerHTML =
    `<div style="font-variant: small-caps; letter-spacing: 0.03em; font-size: 17px; color: var(--ink-bright);">the roll pane</div>` +
    `<div style="font: 11px var(--mono); color: rgba(228,236,242,0.5); margin-top: -2px;">roll a batch, pick a kind for the palette</div>`;
  rollPane.appendChild(rollHead);

  const rollControls = document.createElement("div");
  rollControls.style.cssText = "display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 10px 0 10px;";
  rollPane.appendChild(rollControls);

  const ROLL_KINDS: { k: RollKind; name: string }[] = [
    { k: "critter", name: "critter" },
    { k: "plant", name: "plant" },
  ];
  const rollKindBtns = ROLL_KINDS.map(({ k, name }) => {
    const b = document.createElement("button");
    b.id = `roll-kind-${k}`; // a stable hook, same convention as #play-btn/#step-btn
    b.textContent = name;
    b.style.cssText = btn(false);
    b.onclick = () => chrome.onRollKind(k);
    return { k, b };
  });
  rollControls.appendChild(group(label("kind"), ...rollKindBtns.map((k) => k.b)));

  const rollBtn = document.createElement("button");
  rollBtn.id = "roll-btn";
  rollBtn.textContent = "roll";
  rollBtn.style.cssText = btn(false);
  rollBtn.onclick = () => chrome.onRoll();
  const reRollBtn = document.createElement("button");
  reRollBtn.id = "reroll-btn";
  reRollBtn.textContent = "re-roll";
  reRollBtn.style.cssText = btn(false);
  reRollBtn.onclick = () => chrome.onReRoll();
  rollControls.appendChild(group(rollBtn, reRollBtn));

  // roll-a-web: a second control row, below roll/re-roll, still inside the
  // roll pane's own capped+scrolling box — rolls (and auto-places) a whole
  // matched, closable source/feeder/disperser set at once, rather than one
  // batch member at a time.
  const webControls = document.createElement("div");
  webControls.style.cssText = "display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 0 0 10px;";
  rollPane.appendChild(webControls);
  const rollWebBtn = document.createElement("button");
  rollWebBtn.id = "roll-web-btn";
  rollWebBtn.textContent = "roll a web";
  rollWebBtn.style.cssText = btn(false);
  rollWebBtn.onclick = () => chrome.onRollWeb();
  const seedRicherBtn = document.createElement("button");
  seedRicherBtn.id = "seed-richer-btn";
  seedRicherBtn.textContent = "seed it richer";
  seedRicherBtn.style.cssText = btn(false);
  seedRicherBtn.onclick = () => chrome.onSeedRicher();
  // curate: re-seed every pinned drawer kind from its stored def (Task 6) —
  // lives beside roll-a-web's own control row since both are "add instances
  // to the construct" actions, not roll-batch actions. Labelled "place
  // pinned" (not "reseed") — "reseed" is the pressures tray's own word for
  // FloraTuning.reproChance; three mechanics sharing one word was the bug.
  const reseedPinnedBtn = document.createElement("button");
  reseedPinnedBtn.id = "reseed-pinned-btn";
  reseedPinnedBtn.textContent = "place pinned";
  reseedPinnedBtn.style.cssText = btn(false);
  reseedPinnedBtn.onclick = () => chrome.onReseedPinned();
  webControls.appendChild(group(rollWebBtn, seedRicherBtn, reseedPinnedBtn));

  // bounded so a bigger-than-usual batch scrolls WITHIN the grid instead of
  // growing the pane past this point and reopening the census collision —
  // ~220px comfortably holds the normal 2-row/10-thumbnail batch with room
  // to spare, and scrolls if that ever grows.
  const rollGrid = document.createElement("div");
  rollGrid.style.cssText =
    "display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; max-height: 220px; overflow-y: auto;";
  rollPane.appendChild(rollGrid);

  const rollEmpty = document.createElement("div");
  rollEmpty.style.cssText = "font: italic 12px var(--serif); color: rgba(228,236,242,0.45); padding: 4px 0;";
  rollEmpty.textContent = "nothing rolled yet — hit roll";
  rollPane.appendChild(rollEmpty);

  chrome.onRollKind = () => {};
  chrome.onRoll = () => {};
  chrome.onReRoll = () => {};
  chrome.onPickBatch = () => {};
  chrome.onRollWeb = () => {};
  chrome.onSeedRicher = () => {};
  chrome.onReseedPinned = () => {};
  chrome.onFocusBatch = () => {};
  chrome.onNudgeLooks = () => {};
  chrome.onRerollLooks = () => {};
  chrome.onSetTrait = () => {};
  chrome.onPickFocused = () => {};
  chrome.setRollKind = (k) => {
    for (const { k: kk, b } of rollKindBtns) b.style.cssText = btn(kk === k);
  };
  chrome.setBatch = (cells) => {
    rollGrid.innerHTML = "";
    rollEmpty.style.display = cells.length ? "none" : "block";
    cells.forEach((cell, i) => {
      const cellBtn = document.createElement("button");
      cellBtn.style.cssText =
        `${MONO} display: flex; flex-direction: column; align-items: center; gap: 3px; text-transform: none;` +
        ` background: rgba(23,42,54,0.72); border: 1px solid ${cell.tint}; border-radius: 4px;` +
        ` padding: 4px 2px 5px; cursor: pointer; color: rgba(228,236,242,0.82);`;
      cell.thumb.style.cssText = "image-rendering: pixelated; display: block;";
      cellBtn.appendChild(cell.thumb);
      const nameEl = document.createElement("span");
      nameEl.textContent = cell.name;
      nameEl.title = cell.name; // hovering shows the full name — critical for a dozen ✧ daughters
      nameEl.style.cssText =
        "font-size: 9px; text-align: center; line-height: 1.15; max-width: 54px; overflow: hidden;" +
        " text-overflow: ellipsis; white-space: nowrap;";
      cellBtn.appendChild(nameEl);
      // a single click FOCUSES the cell (opens the iterate strip below); a
      // double-click (or the strip's own pick button) introduces it — the
      // click that also fires ahead of every dblclick simply re-focuses the
      // same cell first, which is harmless (focusBatch is idempotent).
      cellBtn.onclick = () => chrome.onFocusBatch(i);
      cellBtn.ondblclick = () => chrome.onPickBatch(i);
      rollGrid.appendChild(cellBtn);
    });
  };

  // ── the iterate strip: the focused candidate's enlarged thumbnail, looks
  // controls (nudge/re-roll), kind-appropriate trait controls, a trait
  // readout (reusing title()/stat() from the plate helpers above), and a
  // pick button. Lives inside the roll pane, below the grid — opening it
  // SHRINKS the grid's own scroll window (see setFocus below) rather than
  // growing the pane's total height, so the census panel underneath in
  // `leftStack` never gets pushed into the overlap Task 4 already fixed. ──
  const iterateStrip = document.createElement("div");
  iterateStrip.id = "lab-iterate";
  iterateStrip.style.cssText =
    "display: none; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(127,224,196,0.18);";
  rollPane.appendChild(iterateStrip);

  const iterateHead = document.createElement("div");
  iterateHead.style.cssText = "display: flex; align-items: center; gap: 8px;";
  const iterateThumbHost = document.createElement("div");
  iterateThumbHost.id = "iterate-thumb";
  iterateThumbHost.style.cssText = "display: flex; align-items: center; justify-content: center;";
  const iterateName = document.createElement("div");
  iterateName.id = "iterate-name";
  iterateName.style.cssText =
    "font-variant: small-caps; letter-spacing: 0.03em; font-size: 14px; color: var(--ink-bright); flex: 1;";
  const iterateCloseBtn = document.createElement("button");
  iterateCloseBtn.id = "iterate-close-btn";
  iterateCloseBtn.textContent = "close";
  iterateCloseBtn.style.cssText = btn(false);
  iterateCloseBtn.onclick = () => chrome.onFocusBatch(null);
  iterateHead.append(iterateThumbHost, iterateName, iterateCloseBtn);
  iterateStrip.appendChild(iterateHead);

  const looksRow = document.createElement("div");
  looksRow.style.cssText = "display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 6px;";
  const nudgeLooksBtn = document.createElement("button");
  nudgeLooksBtn.id = "iterate-nudge-btn";
  nudgeLooksBtn.textContent = "nudge looks";
  nudgeLooksBtn.style.cssText = btn(false);
  nudgeLooksBtn.onclick = () => chrome.onNudgeLooks();
  const rerollLooksBtn = document.createElement("button");
  rerollLooksBtn.id = "iterate-reroll-looks-btn";
  rerollLooksBtn.textContent = "re-roll looks";
  rerollLooksBtn.style.cssText = btn(false);
  rerollLooksBtn.onclick = () => chrome.onRerollLooks();
  looksRow.append(label("looks"), nudgeLooksBtn, rerollLooksBtn);
  iterateStrip.appendChild(looksRow);

  const traitsControls = document.createElement("div");
  traitsControls.id = "iterate-traits";
  traitsControls.style.cssText = "display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 6px;";
  iterateStrip.appendChild(traitsControls);

  const traitsReadout = document.createElement("div");
  iterateStrip.appendChild(traitsReadout);

  const pickFocusedBtn = document.createElement("button");
  pickFocusedBtn.id = "iterate-pick-btn";
  pickFocusedBtn.textContent = "pick";
  pickFocusedBtn.style.cssText = btn(true) + " margin-top: 8px;"; // lumen-highlighted — the strip's one call to action
  pickFocusedBtn.onclick = () => chrome.onPickFocused();
  iterateStrip.appendChild(pickFocusedBtn);

  chrome.setFocus = (view) => {
    if (!view) {
      iterateStrip.style.display = "none";
      rollGrid.style.maxHeight = "220px"; // the grid's own normal scroll window
      return;
    }
    // shrink the grid's scroll window while the strip is open — its own
    // extra height eats the freed room, so the roll pane's TOTAL height (and
    // so the census panel stacked below it) barely moves either way.
    rollGrid.style.maxHeight = "108px";
    iterateStrip.style.display = "block";
    iterateThumbHost.innerHTML = "";
    view.thumb.style.cssText = "image-rendering: pixelated; display: block;";
    iterateThumbHost.appendChild(view.thumb);
    iterateName.textContent = view.name;

    traitsControls.innerHTML = "";
    if (view.kind === "critter") {
      const roleBtns = (["disperser", "grazer"] as const).map((r) => {
        const b = document.createElement("button");
        b.textContent = r;
        b.style.cssText = btn(view.role === r);
        b.onclick = () => chrome.onSetTrait({ role: r });
        return b;
      });
      const sizeSmallerBtn = document.createElement("button");
      sizeSmallerBtn.id = "iterate-size-smaller-btn";
      sizeSmallerBtn.textContent = "smaller";
      sizeSmallerBtn.style.cssText = btn(false);
      sizeSmallerBtn.onclick = () => chrome.onSetTrait({ size: (view.size ?? 1) - SIZE_STEP });
      const sizeLargerBtn = document.createElement("button");
      sizeLargerBtn.id = "iterate-size-larger-btn";
      sizeLargerBtn.textContent = "larger";
      sizeLargerBtn.style.cssText = btn(false);
      sizeLargerBtn.onclick = () => chrome.onSetTrait({ size: (view.size ?? 1) + SIZE_STEP });
      const palateBtn = document.createElement("button");
      palateBtn.id = "iterate-palate-btn";
      palateBtn.textContent = "shift palate";
      palateBtn.style.cssText = btn(false);
      palateBtn.onclick = () =>
        chrome.onSetTrait({ palate: { hueCenter: ((view.palate?.hueCenter ?? 0) + PALATE_STEP) % 1 } });
      // one flex-wrap row, not three stacked ones — each group() cluster
      // (label + its own buttons, never split) wraps onto a new line only
      // once the pane's width actually runs out, same as the bottom bar's
      // own clusters do; keeps the strip's height down.
      traitsControls.append(
        group(label("role"), ...roleBtns),
        group(label("size"), sizeSmallerBtn, sizeLargerBtn),
        group(label("palate"), palateBtn),
      );
      // one combined readout line, not a whole plate — role/size already
      // read off the buttons' own active state; palate's numbers (not
      // otherwise shown) are what's worth reusing stat() for here.
      traitsReadout.innerHTML = stat("palate", `${pct(view.palate?.hueCenter ?? 0)} ± ${pct(view.palate?.hueWidth ?? 0)}`);
    } else {
      const habitatRow = document.createElement("div");
      habitatRow.id = "iterate-habitat";
      habitatRow.style.cssText = "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;";
      const habitatBtns = BIOME_TILES.map(({ tile, name }) => {
        const color = OVERVIEW_COLORS[tile];
        const b = document.createElement("button");
        b.textContent = name;
        b.style.cssText = tileBtn(view.habitat === tile, color);
        b.onclick = () => chrome.onSetTrait({ habitat: tile });
        return b;
      });
      habitatRow.append(label("habitat"), ...habitatBtns);
      // labelled "substrate feeder" (not "reseed") — "reseed" is the
      // pressures tray's own word for FloraTuning.reproChance; this toggle is
      // the substrateFeeder flag, a different mechanic entirely.
      const reseedBtn = document.createElement("button");
      reseedBtn.id = "iterate-reseed-btn";
      reseedBtn.textContent = view.substrateFeeder ? "substrate feeder: on" : "substrate feeder: off";
      reseedBtn.style.cssText = btn(!!view.substrateFeeder);
      reseedBtn.onclick = () => chrome.onSetTrait({ substrateFeeder: !view.substrateFeeder });
      traitsControls.append(habitatRow, group(label("substrate feeder"), reseedBtn));
      // one combined readout line — the genome's form/hue aren't shown by
      // any button (habitat/reseed are); habitat itself is skipped here,
      // already legible off the habitat picker's own active tile.
      traitsReadout.innerHTML = stat("genome", `${PlantForm[view.form ?? 0].toLowerCase()} · hue ${pct(view.hue ?? 0)}`);
    }
  };

  chrome.showCritterInspect = (v) => {
    // the subtitle speaks the tray's short label ("fish"), never the raw kebab-case
    // role id ("aquatic-grazer") — the same vocabulary the button and badge use (qa
    // consistency #3). Falls back to the raw id for an unlisted role (reads fine).
    const roleName = AMBIENT_ROLES.find((r) => r.id === v.role)?.label ?? v.role;
    readout.innerHTML =
      head(v.name.toLowerCase(), `${roleName} · size ${v.size.toFixed(2)}`) +
      title("palate") +
      stat("form", PlantForm[v.palate.form].toLowerCase()) +
      stat("hue center", pct(v.palate.hueCenter)) +
      stat("hue width", pct(v.palate.hueWidth)) +
      stat("glow taste", v.palate.glowTaste.toFixed(2)) +
      title("live state") +
      stat("state", v.state) +
      stat("mood", v.mood, "mint") +
      stat("energy", pct(v.energy), "mint") +
      stat("curiosity", v.curiosity.toFixed(2)) +
      stat("target", `${Math.round(v.targetX)}, ${Math.round(v.targetY)}`) +
      stat("meal", v.mealName) +
      italic(`${v.moodLine} · ${v.roleLine}`) +
      title("drives · the legible why") +
      drive("hunger", v.drives.hunger, v.dominant === "hunger") +
      drive("comfort", v.drives.comfort, v.dominant === "comfort") +
      drive("curiosity", v.drives.curiosity, v.dominant === "curiosity");
    readout.style.display = "block";
  };
  chrome.showPlantInspect = (v) => {
    readout.innerHTML =
      head(
        v.name.toLowerCase(),
        `${v.habitat} · ${v.substrateFeeder ? "a substrate feeder" : "not a substrate feeder"}`,
      ) +
      title("genome") +
      stat("form", PlantForm[v.genome.form].toLowerCase()) +
      stat("hue", pct(v.genome.hue)) +
      stat("hue2", pct(v.genome.hue2)) +
      stat("sat", pct(v.genome.sat)) +
      stat("height", pct(v.genome.height)) +
      stat("spread", pct(v.genome.spread)) +
      stat("petals", String(Math.round(v.genome.petals))) +
      stat("leaves", String(Math.round(v.genome.leaves))) +
      stat("lean", v.genome.lean.toFixed(2)) +
      stat("glow", pct(v.genome.glow), v.genome.glow > 0.8 ? "gold" : "ink") +
      title("readout") +
      stat("age", `${v.age} ticks`, "mint");
    readout.style.display = "block";
  };
  chrome.hideInspect = () => {
    readout.style.display = "none";
  };

  // The richness meter: hoisted to the TOP of the panel (above "census"), so
  // "how alive is this island" reads at a glance — the word big in firefly
  // gold, the score beside it, chains/closable underneath. Rides inside the
  // panel's own bounded/scrolling box (no new panel, no left-column
  // overlap); recomputed fresh every setCensusWeb call, so it's live as you
  // step, not a snapshot taken once at construct time.
  const richnessMeterBlock = (v: CensusWebView): string =>
    `<div style="margin: 10px 0 2px; padding: 10px 12px; background: rgba(127,224,196,0.06);` +
    ` border: 1px solid rgba(244,201,121,0.4); border-radius: 6px;">` +
    `<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 10px;">` +
    `<span style="font-variant: small-caps; letter-spacing: 0.05em; font-size: 21px; color: rgb(var(--firefly));">${esc(v.richness)}</span>` +
    `<span style="font: 15px var(--mono); color: rgb(var(--firefly));">${v.richnessScore.toFixed(1)}</span>` +
    `</div>` +
    `<div style="display: flex; gap: 16px; margin-top: 5px; font: 9.5px var(--mono); letter-spacing: 0.06em;` +
    ` text-transform: uppercase; color: rgba(228,236,242,0.55);">` +
    `<span>chains <b style="color: var(--ink-bright);">${v.chains.chains}</b></span>` +
    `<span>closable <b style="color: ${v.chains.closable > 0 ? "rgb(var(--lumen))" : "var(--ink-bright)"};">${v.chains.closable}</b></span>` +
    `</div>` +
    // P5: the meter only counts dispersers (chainStats' equality filter) — a
    // note so an ambient pollinator/shuttle flip that leaves the number still
    // reads as expected, not as a broken meter.
    `<div style="margin-top: 6px; font: italic 10.5px var(--serif); color: rgba(228,236,242,0.45);">` +
    `counts dispersers — ambient roles don't move this number</div>` +
    `</div>`;

  chrome.setCensusWeb = (v) => {
    const rows = v.species.length
      ? v.species.map((s) => speciesRow(s.name, s.spark, s.count)).join("")
      : `<div style="font: italic 12px var(--serif); color: rgba(228,236,242,0.45); padding: 2px 0;">nothing counted yet — place a kind, or step time</div>`;
    web.innerHTML =
      `<div style="font-variant: small-caps; letter-spacing: 0.03em; font-size: 17px; color: var(--ink-bright);">the living web</div>` +
      `<div style="font: 11px var(--mono); color: rgba(228,236,242,0.5); margin-top: -2px;">census · food web — live as you step</div>` +
      richnessMeterBlock(v) +
      title("census") +
      stat("live", String(v.summary.live), "mint") +
      stat("arose", String(v.summary.arose)) +
      stat("lost", String(v.summary.lost)) +
      title("by species (plants)") +
      rows +
      title("food web") +
      stat("chains", String(v.chains.chains)) +
      stat("closable", String(v.chains.closable), v.chains.closable > 0 ? "mint" : "ink") +
      stat("redundancy", v.chains.redundancy.toFixed(1) + "×");
  };

  // ── the evolution tray (Task 5, slice 4 — LAYOUT FIXED in review): the
  // marquee of the evolutionary layer made literal — five LIVE sliders, each
  // an onInput straight onto the running kernel (worldlab.ts's setPressure,
  // wired through onPressure below). The original pass docked this bottom-
  // RIGHT as an independent `position: fixed` overlay; at the brief's own
  // shot viewport that collided with the drawer's own right-docked column
  // (both right-corner fixed panels, no mutual awareness) and clipped its
  // rows. Fixed by making the tray a child of the bottom-CENTER `stack`
  // instead — the SAME self-healing column-reverse mechanism the starter/
  // time bar and palette already share (see `stack`'s own comment, above):
  // appended LAST, so it stacks ABOVE the palette rather than below it,
  // growing the stack's total height without moving the bar's own
  // bottom-anchored position.
  //
  // Centering alone isn't quite enough, though: `stack`'s own box sizes to
  // its WIDEST child (here, the palette, which on a big roster can already
  // run wide — a separate, pre-existing "the palette can underlap the side
  // columns" behavior this task doesn't touch), and `align-items: center`
  // only centers each child WITHIN that box, not within the narrower gap
  // between leftStack's right edge (~386px: 18px + the roll pane's own
  // 336px content + its 32px of padding) and rightStack's left edge
  // (~346px in from the right: 18px + the drawer's 296px content + its
  // 32px of padding) — a gap that narrows on a smaller window. So the tray
  // caps its OWN max-width well under that gap (independent of whatever the
  // palette does) and lays its five sliders in a compact, narrow-columned
  // row that wraps (flex-wrap) onto as many lines as it needs — 2 per row
  // at this cap, so 3 rows for five sliders — bounded so the tray's total
  // rendered width can never reach into either side column's footprint, at
  // the brief's own 1400px shot OR the narrower 1100px one, rather than a
  // viewport-width guess that only holds at one specific size.
  // Toggled by the pressuresBtn beside brush, above; hidden by default. ────
  const evoTray = document.createElement("div");
  evoTray.id = "lab-evo-tray";
  evoTray.style.cssText =
    "display: none; max-width: 260px; max-height: 46vh; overflow-y: auto; padding: 12px 16px;" +
    " background: var(--panel); border-radius: var(--radius); box-shadow: var(--frame); color: var(--ink);" +
    " font-family: var(--serif); user-select: none;";
  stack.appendChild(evoTray); // appended LAST — column-reverse stacks it above bar + palette

  const evoHead = document.createElement("div");
  evoHead.style.cssText = "text-align: center;";
  evoHead.innerHTML =
    `<div style="font-variant: small-caps; letter-spacing: 0.03em; font-size: 17px; color: var(--ink-bright);">the pressures</div>` +
    `<div style="font: 11px var(--mono); color: rgba(228,236,242,0.5); margin-top: -2px;">crank a pressure — evolution changes live, nothing resets</div>`;
  evoTray.appendChild(evoHead);

  // The five sliders sit in a ROW (not a stacked column) — a compact strip
  // above the bottom bar rather than a tall panel. Each group is narrow
  // enough (with the tray's own 260px cap above) that either two fit per
  // row at that cap, or all five fit in one row on a wide enough window
  // (flex-wrap handles both), the same convention the bottom bar's own
  // clusters already use.
  const evoRow = document.createElement("div");
  evoRow.style.cssText = "display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 10px;";
  evoTray.appendChild(evoRow);

  // A raw slider value's own legible face: the four FloraTuning-backed
  // pressures (fine steps, 0.01) read as a two-decimal fraction; the coarse
  // ones (maxPerTile's whole tiles, grazerShare's 0.05 steps) round to
  // whatever their own step can actually land on — grazerShare as a
  // percent (it reads as a share), maxPerTile as a bare integer (it reads
  // as a tile count).
  const formatPressure = (p: Pressure, v: number): string =>
    p.id === "grazerShare" ? pct(v) : p.step >= 1 ? String(Math.round(v)) : v.toFixed(2);

  const pressureRows = PRESSURES.map((p) => {
    const group = document.createElement("div");
    group.style.cssText = "width: 100px; flex: 0 0 auto; text-align: center;";
    const rowLabel = document.createElement("div");
    rowLabel.style.cssText = `${MONO} text-transform: uppercase; color: rgba(228,236,242,0.65);`;
    rowLabel.textContent = p.label;
    const input = document.createElement("input");
    input.id = `pressure-${p.id}`;
    input.type = "range";
    input.min = String(p.min);
    input.max = String(p.max);
    input.step = String(p.step);
    input.style.cssText = "width: 100%; margin-top: 4px; accent-color: rgb(var(--lumen));";
    input.oninput = () => chrome.onPressure(p.id, Number(input.value));
    const valueRow = document.createElement("div");
    valueRow.style.cssText = "font: 13px var(--mono); color: rgb(var(--lumen)); margin-top: 3px;";
    group.append(rowLabel, input, valueRow);
    evoRow.appendChild(group);
    return { p, input, valueRow };
  });

  chrome.onPressure = () => {};
  chrome.setPressure = (id, value) => {
    const row = pressureRows.find((r) => r.p.id === id);
    if (!row) return;
    if (Number(row.input.value) !== value) row.input.value = String(value);
    row.valueRow.textContent = formatPressure(row.p, value);
  };
  // the tray's own boot-time face: DEFAULT_TUNING's values (this function
  // has no access to worldlab.ts's pressureValues closure) — worldlab.ts
  // re-syncs every slider to its own live pressureValues right after this
  // returns (the same "if (ui) sync" round-trip every other chrome control
  // here already uses), so a dev-aid-cranked value never sticks at showing
  // the wrong position.
  // fieldValueFor mirrors a reversed pressure's field default to its slider
  // POSITION (identity for the other four), so even this transient boot face
  // agrees with "right = wilder" before worldlab.ts's own re-sync lands.
  for (const p of PRESSURES)
    chrome.setPressure(p.id, p.tuningKey ? fieldValueFor(p.id, DEFAULT_TUNING[p.tuningKey] as number) : 0);

  let pressuresOpen = false;
  chrome.openPressures = (open) => {
    pressuresOpen = open ?? !pressuresOpen;
    evoTray.style.display = pressuresOpen ? "block" : "none";
    pressuresBtn.style.cssText = btn(pressuresOpen);
  };

  // Map-first side panels: closed by default so the construct stays visible.
  // The bar's roll / web / drawer buttons toggle them; ?roll= still opens roll.
  let rollOpen = false;
  let webOpen = false;
  let drawerOpen = false;
  const syncSidePanels = (): void => {
    rollPane.style.display = rollOpen ? "block" : "none";
    web.style.display = webOpen ? "block" : "none";
    drawerPanel.style.display = drawerOpen ? "block" : "none";
    panelRollBtn.style.cssText = btn(rollOpen);
    panelWebBtn.style.cssText = btn(webOpen);
    panelDrawerBtn.style.cssText = btn(drawerOpen);
  };
  chrome.openRoll = (open?: boolean) => {
    rollOpen = open ?? !rollOpen;
    syncSidePanels();
  };
  chrome.openWeb = (open?: boolean) => {
    webOpen = open ?? !webOpen;
    syncSidePanels();
  };
  chrome.openDrawer = (open?: boolean) => {
    drawerOpen = open ?? !drawerOpen;
    syncSidePanels();
  };
  panelRollBtn.onclick = () => chrome.openRoll();
  panelWebBtn.onclick = () => chrome.openWeb();
  panelDrawerBtn.onclick = () => chrome.openDrawer();
  syncSidePanels(); // start closed

  // ── the slot panel (Task 9): a centered modal, the same footprint
  // convention as the real-world #picker (index.html) — position: fixed,
  // translate(-50%, -50%), var(--panel)/var(--frame)/var(--radius) — but
  // built fresh here, never the real #picker element: a sim slot's own
  // namespace stays as separate from a real world's picker as simSave.ts's
  // wander.sims key is from wander.world.<seed> (facts §6). Its z-index sits
  // above the whole bench chrome (5/6 elsewhere), so it's the one thing on
  // top while it's open — the bar/palette/drawer stay put underneath. ─────
  const slotPanel = document.createElement("div");
  slotPanel.id = "lab-slot-panel";
  slotPanel.style.cssText =
    "display: none; position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 20;" +
    " width: min(420px, 88vw); max-height: 68vh; overflow-y: auto; padding: 18px 22px; background: var(--panel);" +
    " box-shadow: var(--frame); border-radius: var(--radius); color: var(--ink); font-family: var(--serif);" +
    " user-select: none;";
  document.body.appendChild(slotPanel);

  const slotTitle = document.createElement("div");
  slotTitle.style.cssText =
    "font-variant: small-caps; letter-spacing: 0.08em; font-size: 19px; color: var(--ink-bright);";
  slotTitle.textContent = "the constructs you've kept";
  slotPanel.appendChild(slotTitle);

  const slotEpigraph = document.createElement("div");
  slotEpigraph.style.cssText =
    "font: italic 12px var(--serif); opacity: 0.5; margin: 4px 0 12px; padding-bottom: 10px;" +
    " border-bottom: 1px solid rgba(var(--lumen), 0.14);";
  slotEpigraph.textContent = "every construct you've saved, kept whole — click one to take up right where you left it.";
  slotPanel.appendChild(slotEpigraph);

  const slotRowsEl = document.createElement("div");
  slotPanel.appendChild(slotRowsEl);

  const slotEmptyMsg =
    `<div style="font: italic 13px var(--serif); color: rgba(228,236,242,0.6); margin-top: 6px;">` +
    `nothing kept yet — "save" beside load tucks this construct away for later.</div>`;

  const slotHint = document.createElement("div");
  slotHint.style.cssText = `${MONO} color: rgba(228,236,242,0.4); margin-top: 12px; text-align: center;`;
  slotHint.textContent = "click a construct to load it";
  slotPanel.appendChild(slotHint);

  const slotCloseBtn = document.createElement("button");
  slotCloseBtn.textContent = "close";
  slotCloseBtn.style.cssText = btn(false) + " display: block; margin: 10px auto 0;";
  slotCloseBtn.onclick = () => chrome.openSlotPanel(false);
  slotPanel.appendChild(slotCloseBtn);

  chrome.onPickSlot = () => {};
  chrome.onForgetSlot = () => {};
  chrome.setSlotRows = (rows) => {
    if (rows.length === 0) {
      slotRowsEl.innerHTML = slotEmptyMsg;
      return;
    }
    slotRowsEl.innerHTML = "";
    for (const row of rows) {
      const r = document.createElement("div");
      r.style.cssText = "position: relative; padding: 7px 10px; margin: 2px -10px; border-radius: 6px; cursor: pointer;";
      const name = document.createElement("div");
      name.style.cssText = "font: 13px var(--mono); color: var(--ink-bright);";
      name.textContent = row.name;
      const when = document.createElement("div");
      when.style.cssText = "font: italic 12px var(--serif); opacity: 0.55; margin-top: 1px;";
      when.textContent = row.when;
      const forget = document.createElement("button");
      forget.textContent = "forget";
      forget.title = "delete this saved construct";
      forget.style.cssText =
        "position: absolute; right: 8px; top: 50%; transform: translateY(-50%); opacity: 0;" +
        " transition: opacity 0.15s; font: 10px var(--mono); color: rgba(var(--rose), 0.85); cursor: pointer;" +
        " background: rgba(255,255,255,0.06); border: 1px solid rgba(var(--rose), 0.35); border-radius: 4px;" +
        " padding: 2px 8px;";
      r.onmouseenter = () => {
        r.style.background = "rgba(var(--lumen), 0.06)";
        forget.style.opacity = "1";
      };
      r.onmouseleave = () => {
        r.style.background = "transparent";
        forget.style.opacity = "0";
      };
      forget.onclick = (ev) => {
        ev.stopPropagation();
        chrome.onForgetSlot(row.id);
      };
      r.onclick = () => chrome.onPickSlot(row.id);
      r.append(name, when, forget);
      slotRowsEl.appendChild(r);
    }
  };

  let slotPanelOpen = false;
  chrome.openSlotPanel = (open) => {
    slotPanelOpen = open ?? !slotPanelOpen;
    slotPanel.style.display = slotPanelOpen ? "block" : "none";
    loadSlotBtn.style.cssText = btn(slotPanelOpen);
  };

  // ── the ambient bench: opt-in experimental roles for placed critter KINDS
  // (pollinator / shuttle / … ), OFF by default. Same in-flow-child-of-`stack`
  // pattern as the pressures tray above (NOT a position:fixed overlay — see that
  // tray's own hard-won comment trail), same btn()/group()/label() chrome. Each
  // row is one critter kind + a button per role; clicking flips that kind live
  // through kernel.setCritterRole (the exact path grazerShare already uses).
  // Bench-only: nothing graduates to real worlds in v1. ────────────────────────
  const ambientTray = document.createElement("div");
  ambientTray.id = "lab-ambient-tray";
  ambientTray.style.cssText =
    // 260px matches evoTray — proven clearance from leftStack's right edge, so
    // kind names never clip behind the roll pane at ~1100px (P1).
    "display: none; max-width: 260px; max-height: 46vh; overflow-y: auto; padding: 12px 16px;" +
    " background: var(--panel); border-radius: var(--radius); box-shadow: var(--frame); color: var(--ink);" +
    " font-family: var(--serif); user-select: none;";
  stack.appendChild(ambientTray); // appended after evoTray — column-reverse stacks it above the bar

  const ambientHead = document.createElement("div");
  ambientHead.style.cssText = "text-align: center;";
  ambientHead.innerHTML =
    `<div style="font-variant: small-caps; letter-spacing: 0.03em; font-size: 17px; color: var(--ink-bright);">the ambient bench</div>` +
    `<div style="font: 11px var(--mono); color: rgba(228,236,242,0.5); margin-top: -2px;">give a placed kind an experimental role — bench only, nothing graduates</div>`;
  ambientTray.appendChild(ambientHead);

  const ambientRows = document.createElement("div");
  ambientRows.style.cssText = "display: flex; flex-direction: column; gap: 8px; margin-top: 10px;";
  ambientTray.appendChild(ambientRows);

  chrome.setAmbient = (kinds, hasShallow) => {
    ambientRows.replaceChildren();
    if (kinds.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "font: italic 12px var(--serif); color: rgba(228,236,242,0.45); padding: 2px 0;";
      empty.textContent = "nothing to give a role yet — place a critter first";
      ambientRows.appendChild(empty);
      return;
    }
    for (const k of kinds) {
      const rowEl = document.createElement("div");
      rowEl.style.cssText = "display: flex; align-items: center; gap: 6px; flex-wrap: wrap;";
      const nameEl = document.createElement("span");
      nameEl.textContent = k.name.toLowerCase();
      nameEl.style.cssText = "font-variant: small-caps; color: var(--ink-bright); min-width: 96px;";
      rowEl.appendChild(nameEl);
      for (const role of AMBIENT_ROLES) {
        const b = document.createElement("button");
        b.textContent = role.label;
        // P2: a fish freezes forever on a construct with no shallow water — gate
        // the button (unless the kind is already a fish) rather than let a flip
        // strand the critter. See ambientRoleEnabled for the rule.
        const gated = !ambientRoleEnabled(role.id, hasShallow, k.role);
        b.title = gated ? "needs shallow water on this construct" : role.help;
        b.style.cssText = btn(k.role === role.id); // the active role reads lit
        if (gated) {
          b.disabled = true;
          b.style.opacity = "0.4";
          b.style.cursor = "not-allowed";
        } else {
          b.onclick = () => chrome.onAmbientRole(k.id, role.id);
        }
        rowEl.appendChild(b);
      }
      ambientRows.appendChild(rowEl);
    }
  };

  let ambientOpen = false;
  chrome.openAmbient = (open) => {
    ambientOpen = open ?? !ambientOpen;
    ambientTray.style.display = ambientOpen ? "block" : "none";
    ambientBtn.style.cssText = btn(ambientOpen);
  };
  chrome.onAmbientRole = () => {}; // real handler wired by startWorldLab's body

  return chrome;
}
