# The Simulator — Slice 2: the shaping tools (stamp brush + biome brush) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the World-Lab's **shaping tools** (per `docs/superpowers/specs/2026-07-21-simulator-design.md` §"The Simulator UI — v1" and §"Build order within v1" item 2), extending the slice-1 bench (`src/game/worldlab.ts`, already shipped): a **stamp brush** — a 1×1 / 2×2 / 3×3 size picker so one click lays an N×N *block* of the selected palette kind instead of a single one; and a **biome brush** — a real-tile picker (grass/sand/water/forest/marsh/rock/…) you click-and-drag to repaint the construct's ground, after which the placeable-palette habitat-gating refreshes so a newly-painted habitat unlocks its plants. The starter templates already shipped in slice 1 — no work, noted for completeness.

**Architecture:** The pure, testable core lives in a new small module `src/game/simBrush.ts` (mirroring how slice 1 split `simRoster.ts`/`flags.ts` out of the DOM-heavy bench): `stampOffsets(size)` / `stampCells(tx,ty,size,map)` compute the N×N tile set for a stamp (rng-free, clamped to the map), and `paintBiome(map, cells, tile)` is a **deterministic in-place mutation** of `WorldMap.tiles` that preserves the map's validity (real tiles only; the spawn tile is never made non-walkable). Everything else is UI wiring inside `worldlab.ts`: a shared brush-**size** state (1/2/3, default 1 — so a size-1 kind-click is byte-identical to slice-1's place-one), a new biome tile-swatch row tinted from the existing `OVERVIEW_COLORS`, and a pointer path (down/move/up) that reuses slice 1's **exact** screen→world→tile mapping so a stamp/paint lands on the tile you clicked. The biome brush's re-render is essentially free: `worldlab` mutates the *same* `map.tiles` array that both `Flora` (which holds `private map` by reference, `flora.ts:158`, and reads `this.map.tiles[key]` live in its habitat gate, `flora.ts:281`) and the `Renderer` already hold — the render loop's `renderer.draw()` reads `map.tiles` live every frame from a pre-built, tile-indexed atlas, so the paint appears on the next animation frame with no atlas rebuild and no `setMap` call. After a paint stroke, the palette re-filters through the *same* `placeablePlants`/`habitatsOf` slice-1 already tests.

**Tech Stack:** TypeScript, Vite, Vitest (node env — the brush kit is pure, no DOM). Pure logic (`simBrush.ts`) is TDD'd; the brush UI is screenshot-verified via `node scripts/shot.mjs "sim=1…"` using deterministic display-only dev-aids (`?brushdemo=…`), the same "logic tested, pixels shot" practice slice 1 established (the shot harness presses keys, not canvas coordinates, so an on-load aid seeds the result — exactly as slice 1's `?demo`/`?run`/`?inspect` do).

## Global Constraints

- **Determinism:** the brush kit is rng-free — `stampOffsets`/`stampCells`/`paintBiome` are pure functions of their inputs; **painting a tile is a deterministic map mutation**. Placement still flows through the seeded kernel (`kernel.placePlant`/`placeCritter`, whose only draws are the slice-1 `placeRng` stream). **No `Math.random` / `Date.now` / `new Date()`** in `simBrush.ts` or any bench *sim/brush* logic. Same seed + same brush sequence ⇒ byte-identical world. The bench render/pointer loop MAY read the rAF `timeMs` for animation and pacing — view-only, never sim input.
- **Peaceful pillar (brushes don't kill):** a **stamp** only *adds* plants/critters (never removes a critter); a **paint** only mutates `tiles`. Painting over a plant's habitat does **not** remove the plant — `Flora` checks habitat only at `addPlant` time (`flora.ts:281`), never retroactively — so a mis-habitated plant simply lingers (peaceful, and true to flora's own semantics). No brush ever removes a critter, so slice 1's `critterCount()` invariant still holds.
- **Reuse, don't fork:** extend slice-1 `worldlab.ts` — reuse its click→world mapping (`worldlab.ts:570-574`), the `placeablePlants`/`habitatsOf` gating (`simRoster.ts`), `kernel.placePlant`/`placeCritter`, and the game `Renderer`. Biome painting mutates the construct's `map.tiles` **in place** and reuses the renderer's own tile drawing (the shared array + its pre-built atlas) — do **not** call `setMap` per paint, and do **not** reimplement tile rendering. Biome swatch colors come from the existing `OVERVIEW_COLORS` (`src/render/palette.ts:42`), not new hexes.
- **Real worlds untouched:** Simulator-only. The only files touched are the new `src/game/simBrush.ts` + `src/game/worldlab.ts` (both Simulator-exclusive) and the new `tests/sim-brush.test.ts`. **No shared-file change** — `main.ts`'s `?sim` router, `construct.ts`, `palette.ts`, `renderer.ts`, `flora.ts` are all consumed read-only. Ordinary play and `?sim=swarm` are byte-identical (guarded by the slice-1 `parseSimMode` test, still green, + a guard shot).
- **Coordinate correctness (the crux):** a stamp/paint MUST land on the tile you clicked. Reuse slice 1's **identical** fit-to-window/camera mapping — `wx = camX + (e.offsetX/rect.width)*renderer.viewWidth`, `wy = camY + (e.offsetY/rect.height)*renderer.viewHeight`, then `tx = Math.floor(wx/TILE_SIZE)`, `ty = Math.floor(wy/TILE_SIZE)` — because `renderer.viewWidth/Height` already fold in the fit-to-window `zoomLevel` and `camX/camY` are the centred offset the render loop reads. Do not hand-roll a second mapping.
- **Art:** every new control consumes the naturalist's-codex `:root` tokens already used in `worldlab.ts`'s `buildChrome` (reuse its `btn()`/`MONO`/`group()`/`label()`/`sep()` helpers). Biome swatches tint their face with the tile's own `OVERVIEW_COLORS[tile]` (content color, exactly as plant chips tint by `hsl(archetype.hue,…)`). No hardcoded chrome hexes; copy is lowercase and evocative.
- **Incremental:** stamp brush first (a small extension of place-one at size 1), then the biome brush (the bigger one — map mutation + habitat refresh + live re-render). Each task ends in a green test or a read screenshot.
- **Commits:** frequent; end every commit message with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Verify before "done":** `npm run check` (tsc) clean · `npx vitest run` green · `npm run build` clean.

**Out of scope for slice 2 (later slices — noted as deferred):** the roll pane + drawer (slice 3); the evolutionary layer — pressures/richness/roll-a-web (slice 4); save/resume to a slot + full-critter-state persistence (slice 5); the ambient bench; the title-screen backdrop. The **starter templates** are already shipped (slice 1's `construct.ts`) — the biome brush repaints them; no starter work here.

---

### Task 1: The brush kit — stamp offsets + `paintBiome` + the paint→habitat-refresh (TDD, pure)

The testable heart of the slice: the N×N stamp offset set, its map-clamped cell set, and the deterministic tile mutation — plus a direct test that painting a new habitat unlocks its plants through the slice-1 gating. All pure (node env, no DOM, no rng), so the brushes' correctness is proven before any pixels.

**Files:**
- Create: `src/game/simBrush.ts`
- Test: `tests/sim-brush.test.ts`

**Interfaces:**
- Consumes: `Tile`, `WorldMap`, `WALKABLE` (`../world/types`).
- Produces:
  - `type BrushSize = 1 | 2 | 3`; `const BRUSH_SIZES: readonly BrushSize[]`.
  - `stampOffsets(size: BrushSize): { dx: number; dy: number }[]` — the block's tile offsets relative to the clicked tile (clicked tile anchors the top-left for even sizes; centred for odd).
  - `stampCells(tx: number, ty: number, size: BrushSize, map: WorldMap): { x: number; y: number }[]` — offsets applied to (tx,ty), out-of-bounds cells dropped.
  - `paintBiome(map: WorldMap, cells: { x: number; y: number }[], tile: Tile): number` — sets each in-bounds cell to `tile` in place (skipping the spawn cell if `tile` is non-walkable, so the map stays valid); returns the count actually changed.

- [ ] **Step 1: Write the failing tests** — `tests/sim-brush.test.ts`:

```ts
import { expect, test } from "vitest";
import { paintBiome, stampCells, stampOffsets } from "../src/game/simBrush";
import { habitatsOf, placeablePlants } from "../src/game/simRoster";
import { singleBiome } from "../src/world/construct";
import { generatePlantSpecies } from "../src/life/species";
import { Tile, isWalkable } from "../src/world/types";

test("stampOffsets: 1×1 / 2×2 / 3×3 lay 1 / 4 / 9 cells", () => {
  expect(stampOffsets(1)).toEqual([{ dx: 0, dy: 0 }]);
  expect(stampOffsets(2).length).toBe(4);
  expect(stampOffsets(3).length).toBe(9);
  // 3×3 centres on the clicked tile
  expect(stampOffsets(3)).toContainEqual({ dx: -1, dy: -1 });
  expect(stampOffsets(3)).toContainEqual({ dx: 1, dy: 1 });
  // 2×2 has no fractional centre → the clicked tile anchors the block's top-left
  expect(stampOffsets(2)).toContainEqual({ dx: 0, dy: 0 });
  expect(stampOffsets(2)).toContainEqual({ dx: 1, dy: 1 });
  expect(stampOffsets(2)).not.toContainEqual({ dx: -1, dy: -1 });
});

test("stampCells fills the interior and drops out-of-bounds cells at an edge", () => {
  const m = singleBiome(1, Tile.Grass, 10);
  expect(stampCells(5, 5, 3, m).length).toBe(9); // interior: the full block
  expect(stampCells(0, 0, 3, m).length).toBe(4); // top-left corner: only the in-bounds quarter
  expect(stampCells(5, 5, 1, m)).toEqual([{ x: 5, y: 5 }]); // 1×1 == the clicked tile itself
});

test("paintBiome mutates tiles in place, real tiles only, returns the changed count", () => {
  const m = singleBiome(1, Tile.Grass, 8);
  const cells = stampCells(4, 4, 2, m);
  expect(paintBiome(m, cells, Tile.ShallowWater)).toBe(4);
  for (const { x, y } of cells) expect(m.tiles[y * m.width + x]).toBe(Tile.ShallowWater);
  expect(paintBiome(m, cells, Tile.ShallowWater)).toBe(0); // idempotent: already that tile
});

test("paintBiome keeps the spawn tile walkable even under a flood of deep water", () => {
  const m = singleBiome(1, Tile.Grass, 8);
  const all: { x: number; y: number }[] = [];
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) all.push({ x, y });
  paintBiome(m, all, Tile.DeepWater);
  expect(isWalkable(m, m.spawn.x, m.spawn.y)).toBe(true); // spawn spared
  expect(m.tiles[0]).toBe(Tile.DeepWater); // everything else flooded
});

test("painting a species' habitat unlocks exactly that species (the paint→refresh path)", () => {
  const species = generatePlantSpecies(7);
  const off = species.find((s) => s.habitat !== Tile.Grass); // a kind a grass construct excludes
  const m = singleBiome(7, Tile.Grass, 12);
  if (off) {
    expect(placeablePlants(species, habitatsOf(m)).some((s) => s.id === off.id)).toBe(false);
    paintBiome(m, stampCells(6, 6, 3, m), off.habitat); // paint its habitat in
    expect(habitatsOf(m).has(off.habitat)).toBe(true);
    expect(placeablePlants(species, habitatsOf(m)).some((s) => s.id === off.id)).toBe(true);
  }
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/sim-brush.test.ts` → FAIL (`src/game/simBrush.ts` missing).

- [ ] **Step 3: Implement `src/game/simBrush.ts`:**

```ts
// The shaping tools' pure core — the World-Lab's stamp + biome brush maths,
// kept out of the DOM-heavy bench so they can be tested headless (mirrors how
// simRoster.ts/flags.ts split out of worldlab.ts in slice 1). Rng-free: a
// stamp is a fixed offset set; a paint is a deterministic in-place mutation of
// WorldMap.tiles. Placement itself still runs through the seeded kernel.

import { Tile, WALKABLE, WorldMap } from "../world/types";

// The SimCity stamp sizes: one click lays an N×N block of the selected kind.
export type BrushSize = 1 | 2 | 3;
export const BRUSH_SIZES: readonly BrushSize[] = [1, 2, 3];

// The block's tile offsets relative to the clicked tile. Odd sizes centre on
// it (1×1 = just it; 3×3 = a ring around it); the even 2×2 has no exact centre,
// so the clicked tile anchors the block's TOP-LEFT — span [0 .. size-1] back
// from -floor((size-1)/2). So: 1→{0}, 2→{0,1}, 3→{-1,0,1}.
export function stampOffsets(size: BrushSize): { dx: number; dy: number }[] {
  const lo = -Math.floor((size - 1) / 2);
  const hi = Math.floor(size / 2);
  const out: { dx: number; dy: number }[] = [];
  for (let dy = lo; dy <= hi; dy++) for (let dx = lo; dx <= hi; dx++) out.push({ dx, dy });
  return out;
}

// The stamp's offsets landed on (tx, ty), with out-of-bounds cells DROPPED (not
// clamped) — a 3×3 at a corner simply lays the in-bounds subset, never a
// doubled edge cell. Offsets are distinct, so the result needs no dedup.
export function stampCells(tx: number, ty: number, size: BrushSize, map: WorldMap): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const { dx, dy } of stampOffsets(size)) {
    const x = tx + dx;
    const y = ty + dy;
    if (x >= 0 && y >= 0 && x < map.width && y < map.height) out.push({ x, y });
  }
  return out;
}

// Repaint the ground under `cells` to `tile`, in place — the biome brush. The
// SAME map.tiles array Flora and the Renderer already hold, so the mutation is
// seen live by both with no rebuild. Keeps the WorldMap valid: `tile` is always
// a real enum value (the caller only ever passes a Tile), and the spawn cell is
// never made non-walkable (a flood of DeepWater/Snow/Cliff spares spawn), so
// the construct is never stranded. Returns how many cells actually changed.
export function paintBiome(map: WorldMap, cells: { x: number; y: number }[], tile: Tile): number {
  const spawnKey = map.spawn.y * map.width + map.spawn.x;
  const tileWalkable = WALKABLE.has(tile);
  let changed = 0;
  for (const { x, y } of cells) {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    const key = y * map.width + x;
    if (key === spawnKey && !tileWalkable) continue; // never strand the spawn
    if (map.tiles[key] !== tile) {
      map.tiles[key] = tile;
      changed++;
    }
  }
  return changed;
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run tests/sim-brush.test.ts` → PASS (all five). If the unlock test's `off` is ever undefined for a seed (no non-grass species at all — unlikely across a full roster), the guarded block is skipped and the test still passes; pick a different seed only if you want the assertion to bite.

- [ ] **Step 5: Commit**

```bash
git add src/game/simBrush.ts tests/sim-brush.test.ts
git commit -m "feat: the brush kit — stamp offsets + deterministic paintBiome (pure, TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The stamp brush — a shared 1×1/2×2/3×3 size picker (screenshot)

Wire the size picker into placement so one click lays an N×N block of the selected palette kind. At size 1 a kind-click is byte-identical to slice-1's place-one, so this is a pure extension. Reuses slice 1's exact screen→tile mapping.

**Files:**
- Modify: `src/game/worldlab.ts`

**Interfaces:**
- Consumes: `BrushSize`, `BRUSH_SIZES`, `stampCells` (`./simBrush`); the existing `worldPxCenter`, `kernel.placePlant`/`placeCritter`, and the slice-1 click mapping.
- Chrome gains: `setBrushSize(size)` / `onBrushSize(size)` on the `Chrome` interface.

- [ ] **Step 1: Brush-size state + a stamp helper.** Add `let brushSize: BrushSize = 1;` alongside `selected`. Add a helper that stamps the currently-selected KIND across an N×N block, reusing `stampCells` + the existing `worldPxCenter` (each cell → its centre world px → `kernel.placePlant`/`placeCritter`):

```ts
// Lay the selected KIND across an N×N block centred on (tx, ty). Plants stay
// habitat-gated per cell (kernel.placePlant returns null off-habitat), so a 3×3
// on a biome edge roots only where it legally can — one flash if the CENTRE
// cell refused, matching slice 1's single-place feedback. Critters place on
// every cell. No-op for the tile tool / select tool (handled by the caller).
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
```

- [ ] **Step 2: Route the existing click through it.** In the `canvas` pointer handler (slice 1's `click` listener, `worldlab.ts:569`), keep the select-tool branch (`!selected` → inspect) unchanged, and replace the single-place tail with a call to `stampKindAt(tx, ty)` (the tile tool is handled in Task 3). The screen→tile mapping lines stay **verbatim** — do not alter the camera math.

- [ ] **Step 3: Chrome — the size picker.** In `buildChrome`, add a `brush` group to the bottom `bar` (after the `fidelity` cluster, before `tick`, divided by a `sep()`): a `label("brush")` + one `btn()` per `BRUSH_SIZES` value showing `1× · 2× · 3×`. Extend the `Chrome` interface with `onBrushSize: (s: BrushSize) => void` and `setBrushSize: (s: BrushSize) => void` (re-light the active size button). Wire `ui.onBrushSize = (s) => { brushSize = s; ui!.setBrushSize(s); }` and call `ui.setBrushSize(brushSize)` once at setup. Use the same active/inactive `btn()` styling the fidelity buttons use.

- [ ] **Step 4: A `?brushdemo=stamp` dev aid.** In `build()`, after the existing `?demo`/`?run` block, if `?brushdemo === "stamp"`, deterministically set `brushSize = 3`, select the first placeable plant kind, and stamp a 3×3 of it near the construct centre, then select a critter kind and stamp a 2×2 a few tiles away (reuse `nearestTileOf` + `stampKindAt`, or place directly via `stampCells`). Display-only, rng-free — a block of real sprites for the screenshot to read.

- [ ] **Step 5: Typecheck** — `npm run check` → 0.

- [ ] **Step 6: Screenshot the stamp** —

```
node scripts/shot.mjs "sim=1&starter=single-biome&brushdemo=stamp" scratchpad/lab-stamp.png 2200 1100 900 ""
```
Open it. Expected: on the grass single-biome, a filled **3×3 block of one plant kind** (nine sprites, not one) and a **2×2 of a critter** a short way off; the chrome's `brush` picker shows `3×` lit. Confirm the block is a square patch on the tiles you'd expect (centred), proving the N×N stamp and the coordinate mapping.

- [ ] **Step 7: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "feat: the stamp brush — 1×1/2×2/3×3 size picker lays a block of the selected kind

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The biome brush — paint the ground + refresh the palette + live re-render (screenshot)

The bigger tool: a real-tile picker you click-and-drag to repaint construct tiles (using the shared brush size), after which the placeable-palette re-filters so a newly-painted habitat unlocks its plants. The re-render is free — `worldlab` mutates the shared `map.tiles` and the running frame loop redraws it next frame.

**Files:**
- Modify: `src/game/worldlab.ts`

**Interfaces:**
- Consumes: `paintBiome`, `stampCells` (`./simBrush`); `placeablePlants`, `habitatsOf` (`./simRoster`); `OVERVIEW_COLORS` (`../render/palette`); `Tile` (`../world/types`).
- `Selected` widens to `{ kind: "plant" | "critter"; id: number } | { kind: "tile"; tile: Tile } | null`.
- Chrome gains: `setBiome(tiles)` (build the swatch row) is not needed — the tile set is static — but `setSelected` must light a tile swatch too; add nothing new beyond handling the `"tile"` case in `onSelect`/`setSelected`.

- [ ] **Step 1: Widen `Selected` + the biome tile set.** Extend the `Selected` type with the `{ kind: "tile"; tile: Tile }` variant. Add a module-level list of the biome tiles the brush offers (real enum values, easily extended), each drawn from `OVERVIEW_COLORS`:

```ts
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
```

- [ ] **Step 2: The paint stroke + habitat refresh.** Add a `paintTileAt(tx, ty)` helper and a `repaintRefresh()` that runs the **same** `placeablePlants`/`habitatsOf` path slice 1 tests. Paint on down and while dragging; refresh once on stroke end (not per cell — `habitatsOf` scans every tile and `setPalette` rebuilds DOM, so per-move would thrash and flicker the palette):

```ts
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
  if (selected?.kind === "plant" && !plantKinds.some((s) => s.id === selected!.id)) selected = null;
  if (ui) {
    ui.setPalette(plantKinds, critterKinds);
    ui.setSelected(selected);
  }
}
```

- [ ] **Step 3: Pointer path (down/move/up) reusing slice 1's mapping.** Replace slice 1's single `click` listener with `pointerdown` / `pointermove` / `pointerup` on the canvas, keeping the screen→tile lines **verbatim** (`worldlab.ts:570-574`). Branch on `selected`: `null` → inspect (slice-1 behaviour, on `pointerdown`); a kind → `stampKindAt` (on `pointerdown`); a tile → begin a paint stroke. Track `let painting = false; let strokeChanged = false; let lastPaintKey = -1;`:
  - **pointerdown** (tile tool): `painting = true; strokeChanged = paintTileAt(tx,ty) || strokeChanged; lastPaintKey = ty*map.width+tx;`
  - **pointermove** (tile tool, `painting`): map to (tx,ty); if `ty*map.width+tx !== lastPaintKey`, `strokeChanged = paintTileAt(tx,ty) || strokeChanged; lastPaintKey = …;` (skip re-painting the same tile every mouse event).
  - **pointerup** (and pointerleave/pointercancel): `if (painting && strokeChanged) repaintRefresh(); painting = false; strokeChanged = false;`

  (The frame loop's `renderer.draw` runs every rAF and reads `map.tiles` live, so the paint is visible mid-stroke without any explicit redraw — render never halts in this bench.)

- [ ] **Step 4: Chrome — the biome swatch row.** In `buildChrome`, add a third palette row (below the critter row, above the `hint`) with a `label("biome")` and one button per `BIOME_TILES`, each face-tinted with `OVERVIEW_COLORS[tile]` (reuse the `plantBtn(active, tint)` styling, or a small `tileBtn(active, color)` variant so a dark/light swatch keeps legible text). Clicking a swatch → `chrome.onSelect({ kind: "tile", tile })`. Extend `setSelected` to light the matching swatch when `selected?.kind === "tile"`.

- [ ] **Step 5: A `?brushdemo=biome` dev aid.** In `build()`, if `?brushdemo === "biome"`: pick a plant kind whose habitat is **absent** from the starter (so it's excluded from the initial palette — the same "off" search as Task 1's test), `paintBiome` a 3×3 patch of that habitat near centre via `stampCells`, call `repaintRefresh()` (proving the unlock), then stamp that now-unlocked plant onto the patch. Display-only, rng-free. If no such kind exists for the seed, paint a ShallowWater patch and log a console note (best-effort, mirroring slice-1's `seedDemoScenario`).

- [ ] **Step 6: Typecheck** — `npm run check` → 0.

- [ ] **Step 7: Screenshot the biome brush + the unlock** —

```
node scripts/shot.mjs "sim=1&starter=single-biome&brushdemo=biome" scratchpad/lab-biome.png 2200 1100 900 ""
```
Open it. Expected: on the grass single-biome, a **painted patch of a different biome** (e.g. a marsh/water square rendered in the game's real tile art, not a flat swatch), a plant of that habitat **rooted on the patch** (proving both the repaint reached `Flora` and the palette unlocked it), and the chrome's new `biome` swatch row visible. Confirm the patch is a clean N×N square on the tiles you'd expect (coordinate mapping) and the ground art matches the game's tiles (shared atlas). Also paint by hand if verifying live: pick `water`, drag across grass, watch the strip repaint and a water plant appear in the palette.

- [ ] **Step 8: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "feat: the biome brush — paint real tiles (drag), unlock habitats, live re-render

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Full verify + the determinism/peaceful/mode-isolation guards + a doc note

Prove the slice green, the brushes deterministic and peaceful, and real worlds untouched; leave a pointer for slice 3.

**Files:**
- Modify: `docs/superpowers/2026-07-22-plant-insect-ecology-tech.md` (a short "shaping tools (Simulator slice 2)" note) — or the simulator spec's foot.

- [ ] **Step 1: Full gate** — `npm run check` (0) · `npx vitest run` (all green — report the count, incl. the new `sim-brush` tests + the still-green slice-1 `kernel`/`construct`/`sim-roster`/`flags`) · `npm run build` (ok).

- [ ] **Step 2: Determinism + peaceful spot-check (pure).** The brush kit is rng-free by construction (Step 1 has no `Math.random`/`Date`); confirm with `grep -nE "Math\.random|Date\.now|new Date" src/game/simBrush.ts` → no hits. The peaceful invariant is structural (no brush path calls a remover) — a stamp only `placePlant`/`placeCritter`, a paint only writes `tiles`; note it in the doc. (Slice 1's `critterCount()` invariant test still covers `step()`; brushes never touch critter *count* except by explicit add.)

- [ ] **Step 3: The mode-isolation guard (real worlds byte-identical).** No shared file changed, so the slice-1 `parseSimMode` test still guards the router. Add the visual proof that the bench's brushes didn't disturb play or the swarm bench:

```
node scripts/shot.mjs "seed=42" scratchpad/guard-world.png 2500 960 640 "Escape"
node scripts/shot.mjs "sim=swarm" scratchpad/guard-swarm.png 2500 1000 800 ""
node scripts/shot.mjs "sim=1" scratchpad/guard-lab.png 2500 1100 820 ""
```
Open all three. Expected: `guard-world.png` — island 42 in normal play, unchanged; `guard-swarm.png` — the swarm/identity-map bench, intact; `guard-lab.png` — the World-Lab now carrying the `brush` size picker + `biome` swatch row in its chrome, no life until you place. Three distinct, correct destinations.

- [ ] **Step 4: Doc note** — one short paragraph: the shaping tools shipped — the stamp brush (1×1/2×2/3×3, a shared size picker) and the biome brush (paint real tiles by drag, mutating `map.tiles` in place → free re-render via the shared atlas; the palette re-filters through `placeablePlants`/`habitatsOf` so a painted habitat unlocks its plants; the spawn stays walkable). Pure maths in `src/game/simBrush.ts`; UI in `worldlab.ts`. Deferred slice-3+ items unchanged (roll pane + drawer, evolutionary layer, save/resume, ambient bench).

- [ ] **Step 5: Commit** (push/merge handled at branch-finish, not here):

```bash
git add -A
git commit -m "docs: shaping tools (Simulator slice 2) — stamp brush + biome brush, green

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review notes (coverage against the slice-2 scope)

| Slice-2 scope item | Task(s) | Verified by |
|---|---|---|
| **1. Stamp brush** (1×1/2×2/3×3 size picker; one click lays an N×N block of the selected kind) | Task 1 (offsets/cells) + Task 2 (size picker + wiring + `?brushdemo=stamp`) | `tests/sim-brush.test.ts` (offset counts, corner-clamped cells, 1×1≡place-one); `lab-stamp.png` (a 3×3 block + a 2×2, picker lit `3×`) |
| **2. Biome brush** (pick a real `Tile`, brush size, click/drag to repaint construct tiles) | Task 1 (`paintBiome`) + Task 3 (tile row + drag path + `?brushdemo=biome`) | `paintBiome` in-place/real-tiles/changed-count test; `lab-biome.png` (a painted patch in real tile art) |
| **2a. Habitat-gating refresh after repaint** (newly-painted habitat unlocks its plants) | Task 1 (paint→placeable test) + Task 3 (`repaintRefresh` on stroke end) | `tests/sim-brush.test.ts` "painting a species' habitat unlocks exactly that species"; `lab-biome.png` (unlocked plant rooted on the patch) |
| **2b. WorldMap stays valid** (real tiles only; spawn stays walkable) | Task 1 (`paintBiome` spawn guard) | `tests/sim-brush.test.ts` "keeps the spawn tile walkable even under a flood of deep water" |
| **2c. Renderer reflects the repaint** (via shared `map.tiles` + atlas, no reimplemented tile drawing) | Task 3 | `lab-biome.png` — the patch renders as the game's real tile art (shared, pre-built atlas), no `setMap` per paint |
| **3. Starter templates** (already shipped in slice 1) | — | Noted; the biome brush repaints slice-1's `construct.ts` starters |
| **Determinism (no rng/wall-clock in brush logic)** | Task 1, Task 4 | brush kit is pure/rng-free; `grep` guard in Task 4; placement still through the seeded kernel |
| **Peaceful pillar (brushes don't kill)** | Task 1, Task 4 | structural — stamp only adds, paint only writes tiles; painting a habitat away doesn't remove plants (flora gates only at `addPlant`) |
| **Coordinate correctness** (stamp/paint lands on the clicked tile) | Task 2, Task 3 | reuses slice 1's verbatim screen→world→tile mapping (folds in fit-to-window zoom + centred cam); `lab-stamp`/`lab-biome` squares land where clicked |
| **Real worlds byte-identical (mode isolation)** | Task 4 | only Simulator-exclusive files touched; slice-1 `parseSimMode` test + `guard-world`/`guard-swarm`/`guard-lab` shots |
| **Reuse over fork** | Tasks 2, 3 | reuses click→world mapping, `placeablePlants`/`habitatsOf`, `kernel.place*`, the game `Renderer` + its atlas, `OVERVIEW_COLORS`, and `buildChrome`'s helpers |

## Deferred to later slices (spec build-order 3–5, noted so they aren't lost)
- **Roll pane + drawer** (slice 3); **evolutionary layer** — pressures panel, roll-a-web, richness meter (slice 4); **save/resume to a slot + full-critter-state + RNG persistence** (slice 5); **ambient bench**; **title-screen live backdrop**.

## Open calls flagged for the controller
1. **2×2 anchor.** The even 2×2 stamp has no exact centre; this plan anchors the *clicked* tile at the block's top-left (span `[0..1]`). That's a convention choice — the alternative (bias up-left, span `[-1..0]`) is equally valid. Flagged in case a different feel is wanted; trivially flipped in `stampOffsets`.
2. **Biome tile set.** The brush offers eight tiles (`DeepWater · ShallowWater · Sand · Grass · Forest · Marsh · Rock · Highland`) — every plant habitat plus open water. `Scree`/`Snow`/`Cliff` are omitted (rarely a plant habitat) but one-line additions to `BIOME_TILES`.
3. **Habitat-refresh cadence.** The palette re-filters on stroke *end* (pointerup), not per painted cell, to avoid thrashing `habitatsOf` (a full-tiles scan) + a DOM rebuild mid-drag. Live-per-cell was rejected as flickery; flag if instant per-cell palette updates are desired.

## API-friction notes (where the biome brush is trickier — or easier — than the spec implies)
- **The re-render is essentially free — the spec's worry doesn't bite.** `renderer.setMap` only swaps the `map` reference; it does **not** rebuild the atlas. The atlas (`buildTileAtlas()`) is built once in the `Renderer` constructor and is **indexed by tile type** (a row per `Tile`, columns are variants), so every one of the 11 tiles already has art. `draw()` reads `map.tiles` **live** each frame (`renderer.ts:152`). Because `worldlab` mutates the **same** `map.tiles` `Uint8Array` the renderer holds, a paint appears on the next rAF with **no atlas rebuild and no `setMap` call**. The only latent trap: this relies on the bench never *copying* the tiles array — it holds the one `map` object through `new Renderer(canvas, map)` / `setMap(map)` and mutates it in place. If a future refactor ever cloned the map on paint, you'd have to re-`setMap` (still cheap) — noted so it isn't broken silently.
- **The mutation reaches the sim for free too.** `Flora` holds `private map` by reference (`flora.ts:158`) and reads `this.map.tiles[key]` in its habitat gate (`flora.ts:281`) and germination — the same array `worldlab` paints. So `placePlant` of a water plant on a freshly-painted water tile just *works*, with no kernel/flora rebuild. The palette's `placeablePlants` gate and flora's own `addPlant` gate are redundant but agree (both key on `species.habitat === tile`), so the unlock the player sees and the root that succeeds never disagree.
- **Painting does not strand the spawn, by construction.** The construct starters put spawn on a walkable tile; `paintBiome` refuses to overwrite the spawn cell with a non-walkable tile (`DeepWater/Snow/Cliff`), so the "spawn stays walkable" invariant holds even under a full-map flood. Cost: a 1-tile walkable island can be left where the spawn was if you paint water across it — acceptable (and the sim parks unplaced dens off-map anyway, so spawn is barely used on the bench), but visible, so flagged.
- **Painting a habitat away doesn't retro-kill plants.** `Flora` checks habitat only at `addPlant` time, never continuously, so a grass plant on a now-water tile lingers rather than dying. This keeps the peaceful pillar intact and matches flora's real semantics; it is *not* a bug to "fix" by removing mis-habitated plants (that would introduce death on the bench).
