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

import { CensusLog, sparkline } from "../life/census";
import {
  Critter,
  CritterSpecies,
  DriveName,
  Drives,
  Palate,
  appetite,
  critterDrives,
  dominantDrive,
  generateCritterSpecies,
} from "../life/fauna";
import { Flora, Plant, nearestPlant } from "../life/flora";
import { chainLinks, chainStats, richnessWord } from "../life/foodweb";
import { Genome, PlantForm, hsl } from "../life/genome";
import { Fidelity, SimKernel } from "../life/kernel";
import { PROVISIONAL_ID, RollKind, rollCritterBatch, rollPlantBatch } from "../life/roll";
import { PlantSpecies, generatePlantSpecies } from "../life/species";
import { critterPortrait } from "../render/critterSprites";
import { BIOME_WORDS, moodLine, roleLine } from "../render/inspect";
import { getPlantSprite } from "../render/plantSprites";
import { Renderer, Scene } from "../render/renderer";
import { OVERVIEW_COLORS } from "../render/palette";
import { StarterKind, buildConstruct } from "../world/construct";
import { TILE_SIZE } from "../world/config";
import { Tile, WorldMap } from "../world/types";
import { DrawerEntry, makeEntry } from "./simDrawer";
import { habitatsOf, placeablePlants } from "./simRoster";
import { BRUSH_SIZES, BrushSize, paintBiome, stampCells } from "./simBrush";

// The biome brush's palette: real tiles you can paint, each swatched with its
// own OVERVIEW_COLORS entry (the island-at-a-glance color, indexed by the enum
// — not an invented hex). Covers every plant habitat plus open water/terrain;
// trivially extended with any other Tile.
const BIOME_TILES: { tile: Tile; name: string }[] = [
  { tile: Tile.DeepWater, name: "deep water" },
  { tile: Tile.ShallowWater, name: "water" },
  { tile: Tile.Sand, name: "sand" },
  { tile: Tile.Grass, name: "grass" },
  { tile: Tile.Forest, name: "forest" },
  { tile: Tile.Marsh, name: "marsh" },
  { tile: Tile.Rock, name: "rock" },
  { tile: Tile.Highland, name: "highland" },
];

const STARTERS: { kind: StarterKind; name: string }[] = [
  { kind: "playable-island", name: "Playable Island" },
  { kind: "biome-sampler", name: "Biome Sampler" },
  { kind: "single-biome", name: "Single Biome" },
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
    roleLine: roleLine(sp.role),
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
  richness: string;
}

// The living-web strip's data: the census exactly as CensusLog keeps it
// (summary/list/sparkline never re-derived) paired with the food web's
// static chain-potential (chainStats/richnessWord, the same score
// arithmetic diversityScore uses) — population is the live proof a chain
// closed; the chain count is the standing potential for one to.
function censusWebView(census: CensusLog, plantSpecies: PlantSpecies[], critterSpecies: CritterSpecies[]): CensusWebView {
  const species = census
    .list()
    .slice()
    .sort((a, b) => b.peak - a.peak)
    .map((tr) => ({
      name: plantSpecies[tr.id]?.name ?? `species #${tr.id}`,
      spark: sparkline(tr.counts),
      count: tr.counts[tr.counts.length - 1] ?? 0,
    }));
  const chains = chainStats(plantSpecies, critterSpecies);
  const richness = richnessWord(chains.chains + 2 * (chains.redundancy - 1));
  return { summary: census.summary(), species, chains, richness };
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
  // the roll pane's own state: which kind the toggle shows, the seeded
  // stream's cursor (re-roll advances it), the current batch of candidates
  // (PROVISIONAL_ID until picked), and the drawer roster (Task 6 renders it —
  // this task only keeps it seeded/growing so the roster is never empty).
  let rollKind: RollKind = "critter";
  let rollCursor = 0;
  let batch: (PlantSpecies | CritterSpecies)[] = [];
  let drawer: DrawerEntry[] = [];

  // Lay the selected KIND across an N×N block centred on (tx, ty). Plants stay
  // habitat-gated per cell (kernel.placePlant returns null off-habitat), so a 3×3
  // on a biome edge roots only where it legally can — one flash if the CENTRE
  // cell refused, matching slice 1's single-place feedback. Critters place on
  // every cell. No-op for the select tool (selected === null) and the tile
  // tool (paintTileAt/repaintRefresh below own that path instead).
  function stampKindAt(tx: number, ty: number): void {
    if (!selected || selected.kind === "tile") return;
    const cells = stampCells(tx, ty, brushSize, map);
    let centreRefused = false;
    for (const { x, y } of cells) {
      const { x: px, y: py } = worldPxCenter(x, y);
      if (selected.kind === "plant") {
        const p = kernel.placePlant(selected.id, px, py);
        if (p === null && x === tx && y === ty) centreRefused = true;
      } else {
        kernel.placeCritter(selected.id, px, py);
      }
    }
    if (centreRefused && ui) ui.flashNote("won't root here — wrong habitat");
    refreshCensusStrip(); // a fresh block can add latent chain links
  }

  // paint the selected tile across an N×N block; mutate map.tiles IN PLACE (the
  // array Flora + the Renderer share), so the running frame loop shows it next
  // draw — no setMap, no atlas rebuild. Returns whether anything changed, so the
  // stroke knows to refresh the palette on pointerup.
  function paintTileAt(tx: number, ty: number): boolean {
    if (selected?.kind !== "tile") return false;
    return paintBiome(map, stampCells(tx, ty, brushSize, map), selected.tile) > 0;
  }

  // After a paint stroke, re-filter the plant palette: a newly-painted habitat
  // unlocks its plants; a painted-away one drops them. Uses the exact slice-1
  // gating. If the selected plant kind is no longer placeable (its habitat was
  // erased), fall back to the select tool so no stale id survives.
  function repaintRefresh(): void {
    plantKinds = placeablePlants(kernel.plantSpecies, habitatsOf(map));
    if (selected?.kind === "plant") {
      const id = selected.id; // hoisted out of the closure below: TS can't narrow a captured `let`
      if (!plantKinds.some((s) => s.id === id)) selected = null;
    }
    if (ui) {
      ui.setPalette(plantKinds, critterKinds);
      ui.setSelected(selected);
    }
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
    renderGrid();
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

  // Pick: introduces the batch member at `index` into the kernel FOR REAL
  // (kernel.introduce*Species assigns the real id === array index), re-filters
  // the palette so the new kind is immediately placeable, and records a
  // "rolled" drawer entry. The freshly-picked kind becomes the selection, so
  // the very next click on the construct places it. Kernel-side effects run
  // regardless of `ui` (so ?rollpick can fire from build()'s first call,
  // ahead of buildChrome()); the UI refresh is guarded and re-synced by the
  // main flow once `ui` exists.
  function pickBatch(index: number): void {
    const member = batch[index];
    if (!member) return;
    let id: number;
    if (rollKind === "plant") {
      const sp = member as PlantSpecies;
      id = kernel.introducePlantSpecies({ ...sp, id: PROVISIONAL_ID });
      plantKinds = placeablePlants(kernel.plantSpecies, habitatsOf(map));
      drawer.push(makeEntry({ kind: "plant", speciesId: id, def: kernel.plantSpecies[id], origin: "rolled" }));
      selected = { kind: "plant", id };
    } else {
      const sp = member as CritterSpecies;
      id = kernel.introduceCritterSpecies({ ...sp });
      critterKinds = kernel.critterSpecies;
      drawer.push(makeEntry({ kind: "critter", speciesId: id, def: kernel.critterSpecies[id], origin: "rolled" }));
      selected = { kind: "critter", id };
    }
    if (ui) {
      ui.setPalette(plantKinds, critterKinds);
      ui.setSelected(selected);
      ui.flashNote(`picked ${member.name.toLowerCase()} — now on the palette`);
    }
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

  // Re-renders the always-on census + living-web strip. Called after every
  // kernel.step() batch AND after a placement (a fresh kind can add a latent
  // chain link even before anything's stepped). This is where a chain is
  // actually WATCHED closing: a feeder species' row climbs out of the census
  // from zero once the source→disperser→feeder loop first resolves.
  function refreshCensusStrip(): void {
    if (!ui) return;
    ui.setCensusWeb(censusWebView(kernel.census, kernel.plantSpecies, kernel.critterSpecies));
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
    // Every unplaced species dens at the scratch Flora's fallback (map.spawn,
    // since no plants are placed yet) — park them off-map so a fresh bench
    // doesn't stack ~17 den mounds on the spawn tile. placeCritter (kernel.ts)
    // overwrites the real den to the drop tile on placement, so a PLACED
    // critter still dens where you dropped it. chainStats/chainLinks (foodweb.ts)
    // never read species.den — only role/palate/archetype — so this is safe.
    for (const sp of critterSpecies) sp.den = { x: -1, y: -1 };
    kernel = new SimKernel({ map, plantSpecies: species, critterSpecies, seed });
    if (!renderer) renderer = new Renderer(canvas, map);
    else renderer.setMap(map);
    fitCameraToConstruct();

    plantKinds = placeablePlants(kernel.plantSpecies, habitatsOf(map));
    critterKinds = kernel.critterSpecies;
    selected = null;
    // the drawer's roster resets with the construct — seeded with every
    // starter kind (origin "starter") so the roll pane's roster is never
    // empty, even before a single kind is rolled.
    drawer = [
      ...kernel.plantSpecies.map((sp) => makeEntry({ kind: "plant", speciesId: sp.id, def: sp, origin: "starter" })),
      ...kernel.critterSpecies.map((sp) =>
        makeEntry({ kind: "critter", speciesId: sp.id, def: sp, origin: "starter" }),
      ),
    ];
    rollCursor = 0;
    batch = [];
    if (demoRequested) seedDemoScenario(map, kernel, plantKinds);
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
    ui!.setRollKind(k);
    ui!.setBatch([]);
  };
  ui.onRoll = () => rollBatch();
  ui.onReRoll = () => {
    rollCursor++; // the deterministic advance: same kind, next slice of the stream
    rollBatch();
  };
  ui.onPickBatch = (i) => pickBatch(i);
  ui.setPalette(plantKinds, critterKinds);
  ui.setSelected(selected);
  ui.setBrushSize(brushSize);
  ui.setRollKind(rollKind);
  // the first real render: build()'s own call above ran before `ui` existed
  renderGrid();
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
  // exactly slice 1's single placement). A tile pick instead begins a paint
  // stroke, dragged live via pointermove and refreshed once on pointerup.
  function pointerTile(e: PointerEvent): { tx: number; ty: number; wx: number; wy: number } | null {
    const rect = canvas.getBoundingClientRect();
    const wx = camX + (e.offsetX / rect.width) * renderer.viewWidth;
    const wy = camY + (e.offsetY / rect.height) * renderer.viewHeight;
    const tx = Math.floor(wx / TILE_SIZE);
    const ty = Math.floor(wy / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null; // off the construct
    return { tx, ty, wx, wy };
  }

  // The paint stroke's own state: `painting` while the pointer is down with
  // the tile tool active; `strokeChanged` records whether ANY cell actually
  // changed across the whole stroke (paintBiome's own return, OR'd in), so
  // pointerup refreshes the palette only when the stroke did something;
  // `lastPaintKey` skips re-painting the same tile on every mousemove within
  // it (a drag fires many move events per tile crossed).
  let painting = false;
  let strokeChanged = false;
  let lastPaintKey = -1;

  function endStroke(): void {
    if (painting && strokeChanged) repaintRefresh(); // once per stroke, not per cell
    painting = false;
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
      lastPaintKey = ty * map.width + tx;
      return;
    }
    stampKindAt(tx, ty);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!painting || selected?.kind !== "tile") return;
    const hit = pointerTile(e);
    if (!hit) return;
    const { tx, ty } = hit;
    const key = ty * map.width + tx;
    if (key === lastPaintKey) return; // already painted this tile this stroke's last step
    strokeChanged = paintTileAt(tx, ty) || strokeChanged;
    lastPaintKey = key;
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
      while (acc >= TICK_MS && ticks < 8) {
        acc -= TICK_MS;
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
  // time controls (Task 6)
  onPlay: () => void;
  onStep: () => void;
  onStepN: () => void;
  onStepNChange: (n: number) => void;
  onFidelity: (f: Fidelity) => void;
  setTimeState: (s: { playing: boolean; fidelity: Fidelity; stepN: number }) => void;
  setTick: (tick: number) => void;
  // the readout plate + living-web strip (Task 7)
  showCritterInspect: (v: CritterInspectView) => void;
  showPlantInspect: (v: PlantInspectView) => void;
  hideInspect: () => void;
  setCensusWeb: (v: CensusWebView) => void;
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

  // ── the stamp brush's size picker: 1×/2×/3× — one click lays that many
  // tiles square of the selected palette kind (size 1 is slice 1's own
  // single placement, unchanged). Same active/inactive btn() styling as the
  // fidelity cluster beside it, so the strip reads as one control family. ──
  bar.appendChild(sep());
  const brushBtns = BRUSH_SIZES.map((size) => {
    const b = document.createElement("button");
    b.textContent = `${size}×`;
    b.style.cssText = btn(false);
    b.onclick = () => chrome.onBrushSize(size);
    return { size, b };
  });
  bar.appendChild(group(label("brush"), ...brushBtns.map((s) => s.b)));

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
  palette.style.cssText =
    "max-width: 88vw; display: flex; flex-direction: column; gap: 6px; padding: 9px 12px;" +
    " background: var(--panel); border-radius: var(--radius); box-shadow: var(--frame); user-select: none;";
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

  // ── the readout plate: a bench-owned codex plate for the select tool's
  // pick — raw internals, not the player-facing openInspect card. Right
  // side, vertically centred, opposite the living-web strip. ─────────────
  const readout = document.createElement("div");
  readout.id = "lab-readout";
  readout.style.cssText =
    "position: fixed; right: 18px; top: 50%; transform: translateY(-50%); z-index: 6; display: none;" +
    " width: 264px; max-height: 74vh; overflow-y: auto; padding: 16px 18px; background: var(--panel);" +
    " border-radius: var(--radius); box-shadow: var(--frame); color: var(--ink); font-family: var(--serif);";
  document.body.appendChild(readout);

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
    "position: fixed; left: 18px; top: 104px; z-index: 6; display: flex; flex-direction: column;" +
    " align-items: flex-start; gap: 10px;";
  document.body.appendChild(leftStack);

  // the census (population, the live proof) beside the food web's static
  // chain-potential, so watching a chain close is just watching a feeder's
  // row climb out of zero. Docked below the roll pane in `leftStack` now
  // (was vertically centred, independently fixed — see above).
  const web = document.createElement("div");
  web.id = "lab-census";
  web.style.cssText =
    "width: 240px; max-height: 74vh; overflow-y: auto; padding: 16px 18px; background: var(--panel);" +
    " border-radius: var(--radius); box-shadow: var(--frame); color: var(--ink); font-family: var(--serif);";
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
    `<span style="color: var(--ink-bright); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 96px;">${esc(name.toLowerCase())}</span>` +
    `<span style="color: rgb(var(--lumen)); letter-spacing: 0.03em;">${spark}</span>` +
    `<span style="color: rgba(228,236,242,0.7); min-width: 22px; text-align: right;">${count}</span></div>`;

  // ── the roll pane: the species lab's dice made visible — a kind toggle, a
  // roll/re-roll pair, and a grid of live thumbnails whose cells ARE the pick
  // buttons. Docked top-left, under the eyebrow, ABOVE the census in
  // `leftStack` (was independently fixed, vertically overlapping the
  // census — see leftStack's own comment above). The pane itself no longer
  // caps/scrolls as a whole — only the grid does, below — so the header and
  // roll/re-roll controls stay put and never scroll out of reach. This
  // chrome never rolls or renders a sprite itself — worldlab.ts hands it
  // finished canvases via setBatch; a click only ever reports its index
  // outward. ─────────────────────────────────────────────────────────────
  const rollPane = document.createElement("div");
  rollPane.id = "lab-roll";
  rollPane.style.cssText =
    "width: 336px; padding: 14px 16px; background: var(--panel); border-radius: var(--radius);" +
    " box-shadow: var(--frame); color: var(--ink); font-family: var(--serif); user-select: none; flex: 0 0 auto;";
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
      nameEl.style.cssText =
        "font-size: 9px; text-align: center; line-height: 1.15; max-width: 54px; overflow: hidden;" +
        " text-overflow: ellipsis; white-space: nowrap;";
      cellBtn.appendChild(nameEl);
      cellBtn.onclick = () => chrome.onPickBatch(i);
      rollGrid.appendChild(cellBtn);
    });
  };

  chrome.showCritterInspect = (v) => {
    readout.innerHTML =
      head(v.name.toLowerCase(), `${v.role} · size ${v.size.toFixed(2)}`) +
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

  chrome.setCensusWeb = (v) => {
    const rows = v.species.length
      ? v.species.map((s) => speciesRow(s.name, s.spark, s.count)).join("")
      : `<div style="font: italic 12px var(--serif); color: rgba(228,236,242,0.45); padding: 2px 0;">nothing counted yet — place a kind, or step time</div>`;
    web.innerHTML =
      `<div style="font-variant: small-caps; letter-spacing: 0.03em; font-size: 17px; color: var(--ink-bright);">the living web</div>` +
      `<div style="font: 11px var(--mono); color: rgba(228,236,242,0.5); margin-top: -2px;">census · food web — live as you step</div>` +
      title("census") +
      stat("live", String(v.summary.live), "mint") +
      stat("arose", String(v.summary.arose)) +
      stat("lost", String(v.summary.lost)) +
      title("by species") +
      rows +
      title("food web") +
      stat("chains", String(v.chains.chains)) +
      stat("closable", String(v.chains.closable), v.chains.closable > 0 ? "mint" : "ink") +
      stat("redundancy", v.chains.redundancy.toFixed(1) + "×") +
      stat("richness", v.richness, "gold");
  };

  return chrome;
}
