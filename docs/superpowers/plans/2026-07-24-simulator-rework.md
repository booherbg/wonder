# World-Lab Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the World-Lab from a bench whose interface covers and misreports the construct into an instrument that reveals it — fixing camera, selection and pause, reserving real layout space, and rendering the pollination economy the sim already computes.

**Architecture:** Every stage extracts one *pure, testable* module (camera math, hit-test ranking, telemetry arithmetic, graph layout) with tests first, then wires the DOM to it. `worldlab.ts` shrinks as a consequence of the work rather than in one unverifiable up-front sweep. The working view is render-only over existing state, so it carries no determinism risk.

**Tech Stack:** TypeScript, Vite, Vitest, hand-rolled canvas rendering, no UI framework.

**Spec:** `docs/superpowers/specs/2026-07-24-simulator-rework-design.md`

**Branch:** `sim-rework` off `master`. One branch, one review.

## Deviation from the spec (deliberate)

Spec §4 called for splitting `worldlab.ts` first as a single no-behaviour-change commit. This plan **does not** do that. A 4,228-line mechanical split of DOM code with no DOM tests is unverifiable — the only check is "it still looks right", and it delays every visible win by a day. Instead each stage carves out the module it needs, pure part first with tests. The destination is identical (§4's module list); the path is incremental and every commit is independently verifiable.

## Global Constraints

Copied verbatim from the spec §5. Every task's requirements implicitly include these.

- **Determinism:** no `Math.random` / `Date.now` / `new Date()` in sim, kernel, flora or rng paths. The working view is render-only and reads state it never writes.
- **The island is untouched by the sim changes.** `?sim=` and no-`?sim` play stay byte-identical. The voice pass changes strings only.
- **Save format additive.** New fields optional; `tests/save.test.ts` and `tests/sim-save.test.ts` guards stay green.
- **Peaceful.** Nothing dies violently; `step()` never births or removes a critter.
- **Commit trailer on every commit:**
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **Hygiene:** commit files BY NAME (never `git add -A`). `npm run check` + `npx vitest run` + `npm run build` green before any task is called done. Baseline: **617 tests** in 111 files (verified on master 2026-07-24; an earlier note of 601 was a misread of a truncated run). Per-task counts below are stated as deltas, not absolutes, so a rebase cannot invalidate them.
- **Voice register** (spec §3.7): lowercase, state the fact, name the quantity, no metaphor in functional copy. Exempt: murmurs, generated species/island names, the field guide's intro prose.

---

## Task 0: Branch

- [ ] **Step 1: Cut the branch**

```bash
git checkout master
git pull --ff-only
git checkout -b sim-rework
git rev-parse --short HEAD    # record this as BASE for the final review package
```

- [ ] **Step 2: Confirm the baseline is green**

Run: `npm run check && npx vitest run 2>&1 | tail -4`
Expected: no type errors; `Tests  617 passed (617)`

---

# Stage 1 — Controls

The clunk, removed. No layout change in this stage.

## Task 1: Zoom about the pointer

**Files:**
- Modify: `src/game/simCamera.ts`
- Modify: `src/game/worldlab.ts` (`applyCameraZoom`, `nudgeZoom`, the wheel handler)
- Test: `tests/sim-camera.test.ts`

**Interfaces:**
- Consumes: `clampCameraAxis`, `clampZoomMul`, `nextZoomMul` (existing, `simCamera.ts`)
- Produces: `zoomAboutPoint(camX, camY, viewW, viewH, fx, fy, ratio) → { camX, camY }` and `ZOOM_WHEEL_IN = 1.12`

- [ ] **Step 1: Write the failing test**

Append to `tests/sim-camera.test.ts`:

```ts
import { zoomAboutPoint, ZOOM_WHEEL_IN } from "../src/game/simCamera";

describe("zoomAboutPoint", () => {
  // The world point under the pointer must not move. world = cam + f * view;
  // after the zoom view' = view / ratio, so cam' = world - f * view'.
  it("holds the world point under the pointer fixed when zooming in", () => {
    const camX = 100, camY = 200, viewW = 400, viewH = 300;
    const fx = 0.25, fy = 0.75, ratio = 2;
    const worldX = camX + fx * viewW; // 200
    const worldY = camY + fy * viewH; // 425
    const out = zoomAboutPoint(camX, camY, viewW, viewH, fx, fy, ratio);
    expect(out.camX + fx * (viewW / ratio)).toBeCloseTo(worldX, 6);
    expect(out.camY + fy * (viewH / ratio)).toBeCloseTo(worldY, 6);
  });

  it("holds the world point fixed when zooming out", () => {
    const out = zoomAboutPoint(100, 200, 400, 300, 0.5, 0.5, 0.5);
    expect(out.camX + 0.5 * (400 / 0.5)).toBeCloseTo(300, 6);
    expect(out.camY + 0.5 * (300 / 0.5)).toBeCloseTo(350, 6);
  });

  it("is identity at ratio 1", () => {
    const out = zoomAboutPoint(100, 200, 400, 300, 0.3, 0.7, 1);
    expect(out.camX).toBeCloseTo(100, 6);
    expect(out.camY).toBeCloseTo(200, 6);
  });

  it("centre-anchored zoom keeps the centre fixed", () => {
    const out = zoomAboutPoint(0, 0, 400, 300, 0.5, 0.5, 2);
    expect(out.camX + 0.5 * 200).toBeCloseTo(200, 6);
    expect(out.camY + 0.5 * 150).toBeCloseTo(150, 6);
  });

  it("steps the wheel zoom fast enough to cross the range in ~20 events", () => {
    // 0.4 → 4 is a 10× span; at 1.12 per event that is ~20 events.
    const events = Math.log(10) / Math.log(ZOOM_WHEEL_IN);
    expect(events).toBeGreaterThan(15);
    expect(events).toBeLessThan(25);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/sim-camera.test.ts`
Expected: FAIL — `zoomAboutPoint is not a function` (and the `ZOOM_WHEEL_IN` step assertion fails at 1.05, which needs ~48 events).

- [ ] **Step 3: Implement**

In `src/game/simCamera.ts`, change the constant and append the helper:

```ts
export const ZOOM_WHEEL_IN = 1.12; // ~20 wheel events across the 0.4–4× range
```

```ts
/**
 * Zoom while holding one point fixed on screen. `fx`/`fy` are the anchor as a
 * 0..1 fraction of the canvas (0.5, 0.5 = centre); `ratio` is newZoom/oldZoom.
 * The world point under the anchor is invariant: world = cam + f * view, and
 * the view shrinks by `ratio`, so cam' = world - f * (view / ratio).
 */
export function zoomAboutPoint(
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  fx: number,
  fy: number,
  ratio: number,
): { camX: number; camY: number } {
  const worldX = camX + fx * viewW;
  const worldY = camY + fy * viewH;
  return {
    camX: worldX - fx * (viewW / ratio),
    camY: worldY - fy * (viewH / ratio),
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/sim-camera.test.ts`
Expected: PASS, all 5 new tests plus the existing file green.

- [ ] **Step 5: Wire the DOM to it**

In `src/game/worldlab.ts`, replace `applyCameraZoom` (currently at `:1652`) and add an anchored variant:

```ts
  function applyCameraZoom(): void {
    renderer.setZoom(Math.max(0.05, fitZoom * zoomMul));
    clampCamera();
    ui?.setZoomPct(Math.round(zoomMul * 100));
  }
  // Zoom holding (fx, fy) — a 0..1 fraction of the canvas — fixed on screen.
  function applyCameraZoomAbout(fx: number, fy: number, prevMul: number): void {
    const beforeW = renderer.viewWidth;
    const beforeH = renderer.viewHeight;
    renderer.setZoom(Math.max(0.05, fitZoom * zoomMul));
    const ratio = zoomMul / prevMul;
    if (ratio !== 1) {
      const next = zoomAboutPoint(camX, camY, beforeW, beforeH, fx, fy, ratio);
      camX = next.camX;
      camY = next.camY;
    }
    clampCamera();
    ui?.setZoomPct(Math.round(zoomMul * 100));
  }
```

Add `zoomAboutPoint` to the existing `simCamera` import. Then in the wheel handler (`:2367`) replace the zoom branch:

```ts
      if (wheelCameraMode(e) === "zoom") {
        const prevMul = zoomMul;
        zoomMul = nextZoomMul(zoomMul, wheelZoomFactor(e.deltaY) >= 1 ? "in" : "out");
        applyCameraZoomAbout(e.offsetX / rect.width, e.offsetY / rect.height, prevMul);
        return;
      }
```

`nudgeZoom` (keyboard `+`/`−`) stays centre-anchored:

```ts
  function nudgeZoom(direction: "in" | "out"): void {
    const prevMul = zoomMul;
    zoomMul = nextZoomMul(zoomMul, direction);
    applyCameraZoomAbout(0.5, 0.5, prevMul);
  }
```

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`, open `http://localhost:5173/?sim=1&demo=1`, put the cursor on a distinctive plant, pinch/⌘-wheel both ways.
Expected: that plant stays under the cursor at every zoom level. `+`/`−` zoom about the centre.

- [ ] **Step 7: Commit**

```bash
git add src/game/simCamera.ts src/game/worldlab.ts tests/sim-camera.test.ts
git commit -m "fix(sim): zoom about the pointer, and a wheel step worth using

Zoom was applied about the camera origin, so whatever you were looking
at slid away as you zoomed. zoomAboutPoint holds the world point under
the cursor fixed; the wheel step goes 1.05 -> 1.12 so the 0.4-4x range
crosses in ~20 events instead of ~48.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Selection by distance, with cycling

**Files:**
- Create: `src/game/simSelect.ts`
- Create: `tests/sim-select.test.ts`
- Modify: `src/game/worldlab.ts` (the `pointerdown` select branch, `:2477-2492`)

**Interfaces:**
- Consumes: `PICK_RADIUS_PX`, `SWARM_PICK_RADIUS_PX` (move both into `simSelect.ts`)
- Produces:
  - `type PickKind = "swarm" | "critter" | "plant"`
  - `interface Candidate<T> { kind: PickKind; ref: T; score: number }`
  - `RADIUS_FOR: Record<PickKind, number>`
  - `rankCandidates(input: RankInput) → Candidate<unknown>[]` — sorted, in-reach only
  - `cycleIndex(prevKey: string | null, nextKey: string, prevIndex: number, count: number) → number`

- [ ] **Step 1: Write the failing test**

Create `tests/sim-select.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RADIUS_FOR, cycleIndex, rankCandidates } from "../src/game/simSelect";

const at = (x: number, y: number) => ({ x, y });

describe("rankCandidates", () => {
  it("prefers the nearer thing even when a swarm is in reach", () => {
    // A plant 4px away and a swarm 40px away: the plant wins, though today's
    // code hands it to the swarm unconditionally.
    const out = rankCandidates({
      wx: 0, wy: 0,
      swarms: [at(40, 0)],
      critters: [],
      plants: [at(4, 0)],
    });
    expect(out[0].kind).toBe("plant");
    expect(out[1].kind).toBe("swarm");
  });

  it("normalises by each kind's own radius, so clouds keep their extra reach", () => {
    // Swarm at 0.5 of its radius vs plant at 0.9 of its own: the swarm is
    // relatively nearer and leads, though it is further in raw pixels.
    const out = rankCandidates({
      wx: 0, wy: 0,
      swarms: [at(RADIUS_FOR.swarm * 0.5, 0)],
      critters: [],
      plants: [at(RADIUS_FOR.plant * 0.9, 0)],
    });
    expect(out[0].kind).toBe("swarm");
  });

  it("drops anything out of its own reach", () => {
    const out = rankCandidates({
      wx: 0, wy: 0,
      swarms: [at(RADIUS_FOR.swarm + 1, 0)],
      critters: [],
      plants: [at(2, 0)],
    });
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe("plant");
  });

  it("returns an empty list when nothing is in reach", () => {
    expect(rankCandidates({ wx: 0, wy: 0, swarms: [], critters: [], plants: [] })).toEqual([]);
  });

  it("lists every in-reach candidate so the caller can cycle and label them", () => {
    const out = rankCandidates({
      wx: 0, wy: 0,
      swarms: [at(10, 0)],
      critters: [at(6, 0)],
      plants: [at(3, 0)],
    });
    expect(out.map((c) => c.kind)).toEqual(["plant", "critter", "swarm"]);
  });
});

describe("cycleIndex", () => {
  it("starts at 0 on a new spot", () => {
    expect(cycleIndex(null, "a", 3, 2)).toBe(0);
    expect(cycleIndex("a", "b", 1, 3)).toBe(0);
  });

  it("advances on a repeat click at the same spot", () => {
    expect(cycleIndex("a", "a", 0, 3)).toBe(1);
    expect(cycleIndex("a", "a", 1, 3)).toBe(2);
  });

  it("wraps back to the first candidate", () => {
    expect(cycleIndex("a", "a", 2, 3)).toBe(0);
  });

  it("stays at 0 when there is only one candidate", () => {
    expect(cycleIndex("a", "a", 0, 1)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/sim-select.test.ts`
Expected: FAIL — cannot resolve `../src/game/simSelect`.

- [ ] **Step 3: Implement**

Create `src/game/simSelect.ts`:

```ts
// The select tool's hit test, pure so its ranking is testable without a DOM.
//
// The bench's old rule was class priority — swarm beat critter beat plant,
// unconditionally, and the swarm's radius was 2.3x the plant's. Because clouds
// hover over the blooms they work, that made the flower under a swarm
// unreachable: exactly the pairing the bench exists to study.
//
// The rule now: rank by distance measured in units of each kind's OWN radius.
// Clouds keep their extra reach (they drift, and a drifting target deserves a
// wider target), but they no longer win a tie by being a cloud.

import { TILE_SIZE } from "../world/config";

export type PickKind = "swarm" | "critter" | "plant";

export const RADIUS_FOR: Record<PickKind, number> = {
  swarm: 3.5 * TILE_SIZE, // clouds drift; give the click more reach
  critter: 1.5 * TILE_SIZE,
  plant: 1.5 * TILE_SIZE,
};

export interface Positioned {
  x: number;
  y: number;
}

export interface Candidate<T extends Positioned = Positioned> {
  kind: PickKind;
  ref: T;
  score: number; // distance / RADIUS_FOR[kind]; < 1 means in reach
}

export interface RankInput {
  wx: number;
  wy: number;
  swarms: readonly Positioned[];
  critters: readonly Positioned[];
  plants: readonly Positioned[];
}

function push(
  out: Candidate[],
  kind: PickKind,
  items: readonly Positioned[],
  wx: number,
  wy: number,
): void {
  const radius = RADIUS_FOR[kind];
  for (const ref of items) {
    const d = Math.hypot(ref.x - wx, ref.y - wy);
    const score = d / radius;
    if (score <= 1) out.push({ kind, ref, score });
  }
}

/** Every in-reach candidate, nearest-relative-to-its-own-radius first. */
export function rankCandidates(input: RankInput): Candidate[] {
  const out: Candidate[] = [];
  push(out, "swarm", input.swarms, input.wx, input.wy);
  push(out, "critter", input.critters, input.wx, input.wy);
  push(out, "plant", input.plants, input.wx, input.wy);
  out.sort((a, b) => a.score - b.score);
  return out;
}

/**
 * Which candidate a click selects. Clicking the same spot again advances
 * through the stack (so a flower under a swarm is two clicks); clicking
 * anywhere else starts over at the nearest.
 */
export function cycleIndex(
  prevKey: string | null,
  nextKey: string,
  prevIndex: number,
  count: number,
): number {
  if (count <= 0) return 0;
  if (prevKey !== nextKey) return 0;
  return (prevIndex + 1) % count;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/sim-select.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Wire the DOM to it**

In `src/game/worldlab.ts`:

1. Delete the `PICK_RADIUS_PX` / `SWARM_PICK_RADIUS_PX` consts at `:162-163` and import from the new module instead:

```ts
import { Candidate, RADIUS_FOR, cycleIndex, rankCandidates } from "./simSelect";
```

Replace their other uses (`:2460`, `:2478`, `:2487`) with `RADIUS_FOR.swarm` / `RADIUS_FOR.plant`.

2. Add cycle state beside the other stroke state (near `:2421`):

```ts
  // click-to-cycle: a repeat click within a tile of the last one advances
  // through the stack under the pointer instead of re-picking the same thing
  let pickKey: string | null = null;
  let pickIndex = 0;
  let pickHere: Candidate[] = [];
```

3. Replace the select branch (`:2477-2492`) entirely:

```ts
    if (tool === "select" || !selected) {
      const here = rankCandidates({
        wx, wy,
        swarms: swarmLayer.swarms,
        critters: kernel.critters,
        plants: kernel.flora.plantsNear(wx, wy, RADIUS_FOR.plant),
      });
      const key = `${tx},${ty}`;
      pickIndex = cycleIndex(pickKey, key, pickIndex, here.length);
      pickKey = key;
      pickHere = here;
      const chosen = here[pickIndex] ?? null;
      inspected = chosen
        ? chosen.kind === "swarm"
          ? { kind: "swarm", ref: chosen.ref as WorldSwarm }
          : chosen.kind === "critter"
            ? { kind: "critter", ref: chosen.ref as Critter }
            : { kind: "plant", ref: chosen.ref as Plant }
        : null;
      ui?.setHere(here.map((c) => c.kind), pickIndex);
      refreshInspect();
      return;
    }
```

Note what is **gone**: the retarget-on-click block from `:2479-2485`. Retarget becomes an explicit armed mode in Task 3.

4. Add `setHere` to the `Chrome` interface (`:2609`) and implement it in `buildChrome` as a small mono line in the readout plate:

```ts
  setHere: (kinds: PickKind[], index: number) => void;
```

```ts
  chrome.setHere = (kinds, index) => {
    hereEl.textContent = kinds.length > 1
      ? "here · " + kinds.map((k, i) => (i === index ? k.toUpperCase() : k)).join(" · ") + "  (click again to cycle)"
      : "";
  };
```

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`, open `?sim=1&demo=1`, find a swarm sitting over a bloom, click it twice.
Expected: first click selects the swarm, second selects the flower beneath it; the "here" line reads `here · SWARM · plant (click again to cycle)` then `here · swarm · PLANT …`.

- [ ] **Step 7: Run the full suite**

Run: `npm run check && npx vitest run 2>&1 | tail -4`
Expected: no type errors; +9 tests from this task.

- [ ] **Step 8: Commit**

```bash
git add src/game/simSelect.ts tests/sim-select.test.ts src/game/worldlab.ts
git commit -m "fix(sim): rank selection by distance, cycle overlapping picks

Selection was hard class priority (swarm > critter > plant) with the
swarm holding 2.3x the pick radius, so the flower under a cloud could
never be selected -- the one pairing the bench exists to study. Rank by
distance in units of each kind's own radius instead; clicking the same
spot again cycles the stack, and a 'here' line names what is under the
pointer. Retarget-on-click is removed (it made one click mean two
things); it returns as an armed mode in the next commit.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Retarget as an armed mode

**Files:**
- Modify: `src/game/worldlab.ts` (`Chrome`, the select branch, the swarm readout)

**Interfaces:**
- Consumes: `Candidate`, `rankCandidates` (Task 2)
- Produces: `armRetarget()` / `disarmRetarget()` internal to `startWorldLab`; `Chrome.setRetargetArmed(on: boolean)`

- [ ] **Step 1: Add the armed state**

Beside the pick state in `startWorldLab`:

```ts
  // retarget: armed by a button in the swarm readout, spent on the next click
  // on a bloom. A plain click never re-homes a cloud by accident.
  let retargetArmed = false;
  function setRetargetArmed(on: boolean): void {
    retargetArmed = on;
    ui?.setRetargetArmed(on);
    canvas.style.cursor = on ? "crosshair" : "";
  }
```

- [ ] **Step 2: Spend it at the top of the select branch**

Insert immediately before the `rankCandidates` call added in Task 2:

```ts
      if (retargetArmed && inspected?.kind === "swarm") {
        const p = nearestPlant(kernel.flora.plantsNear(wx, wy, RADIUS_FOR.plant), wx, wy);
        if (p && isBloom(p) && canFlower(kernel.plantSpecies[p.species].archetype.form)) {
          if (swarmLayer.retarget(inspected.ref, p)) {
            ui?.flashNote(`retargeted · ${kernel.plantSpecies[p.species].name.toLowerCase()}`);
            setRetargetArmed(false);
            refreshInspect();
            return;
          }
        }
        ui?.flashNote("retarget → click a bloom in range");
        return;
      }
```

- [ ] **Step 3: Disarm on Escape**

In the lab keydown handler, in the `Escape` branch (`:2331`), before `leaveBench()`:

```ts
    } else if (e.key === "Escape") {
      if (retargetArmed) { setRetargetArmed(false); return; }
```

- [ ] **Step 4: Add the button to the swarm readout**

In the readout plate's swarm branch, add a button that reads `retarget` when idle and `retarget · click a bloom` when armed, calling `setRetargetArmed(!retargetArmed)`. Add to `Chrome`:

```ts
  onRetarget: () => void;
  setRetargetArmed: (on: boolean) => void;
```

- [ ] **Step 5: Verify in the browser**

Run: `npm run dev`, `?sim=1&demo=1`. Select a swarm, click a different bloom.
Expected: nothing re-homes (it inspects the bloom). Press `retarget`, then click a bloom: it re-homes and the button disarms. Escape while armed cancels.

- [ ] **Step 6: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "feat(sim): retarget is an armed mode, not a side effect of clicking

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Pause actually pauses, and empty space pans

**Files:**
- Modify: `src/game/worldlab.ts` (`frame`, `:2597`; `pointerdown`, `:2445`)

- [ ] **Step 1: Gate the mote animation on play state**

At `:2597`, replace:

```ts
    swarmLayer.animate(dt / 1000);
```

with:

```ts
    // Paused means still. The forage animation runs off the wall clock, so
    // without this gate a paused bench keeps flying motes out to blooms and
    // back -- the view lying about whether time is running.
    if (playing) swarmLayer.animate(dt / 1000);
```

- [ ] **Step 2: Let a drag on empty space pan with any tool**

In `pointerdown`, replace the early-out at `:2455-2456`:

```ts
    const hit = pointerTile(e);
    if (!hit) {
      // Off the construct: drag to pan, whatever tool is held.
      e.preventDefault();
      cameraPanning = true;
      panLastX = e.clientX;
      panLastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      return;
    }
```

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`, `?sim=1&demo=1`. Press play, watch motes fly, press pause.
Expected: motes stop where they are; the world still renders and still pans. Drag from the black area outside the construct: the camera pans.

- [ ] **Step 4: Run the full suite**

Run: `npm run check && npx vitest run 2>&1 | tail -4`
Expected: no type errors; +9 tests from this task.

- [ ] **Step 5: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "fix(sim): pause stops the motes; empty space drags the camera

swarmLayer.animate ran outside the playing gate, so a paused bench kept
animating the forage cycle off the wall clock.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# Stage 2 — Layout

## Task 5: The three-zone frame

**Files:**
- Create: `src/game/simLayout.ts`
- Create: `tests/sim-layout.test.ts`
- Modify: `src/game/worldlab.ts` (`buildChrome`'s `stack`, `:2803`; `fitCameraToConstruct`, `:1657`; `resize` handler, `:2358`)

**Interfaces:**
- Produces:
  - `interface Zones { root, rail, canvasBox, dock, bar: HTMLElement }`
  - `buildZones(host: HTMLElement) → Zones`
  - `canvasBoxSize(zones: Zones) → { width, height }`
  - `railWidth(collapsed: boolean) → number` (280 / 40)
  - `dockWidth(collapsed: boolean) → number` (360 / 0)

- [ ] **Step 1: Write the failing test**

Create `tests/sim-layout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { dockWidth, railWidth } from "../src/game/simLayout";

describe("zone widths", () => {
  it("gives the rail an icon strip when collapsed", () => {
    expect(railWidth(false)).toBe(280);
    expect(railWidth(true)).toBe(40);
  });

  it("gives the dock nothing at all when collapsed, so the canvas takes it", () => {
    expect(dockWidth(false)).toBe(360);
    expect(dockWidth(true)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/sim-layout.test.ts`
Expected: FAIL — cannot resolve `../src/game/simLayout`.

- [ ] **Step 3: Implement the module**

Create `src/game/simLayout.ts`:

```ts
// The bench's frame. Three fixed zones plus a canvas box that takes what is
// left, so chrome never covers the construct.
//
// What this replaces: one `position: fixed; left: 50%; bottom: 18px;
// flex-direction: column-reverse; max-height: calc(100vh - 36px)` pile that
// grew UPWARD over the canvas, plus three independently-fixed overlay panels
// that stacked on it and on each other. Nothing reserved space, so the
// construct never shrank to make room -- it was simply covered.

export const RAIL_W = 280;
export const RAIL_W_COLLAPSED = 40;
export const DOCK_W = 360;
export const BAR_H = 44;
export const NARROW = 900; // below this the rails overlay instead of reserving

export function railWidth(collapsed: boolean): number {
  return collapsed ? RAIL_W_COLLAPSED : RAIL_W;
}

export function dockWidth(collapsed: boolean): number {
  return collapsed ? 0 : DOCK_W;
}

export interface Zones {
  root: HTMLElement;
  rail: HTMLElement;
  canvasBox: HTMLElement;
  dock: HTMLElement;
  bar: HTMLElement;
}

export function buildZones(host: HTMLElement): Zones {
  const root = document.createElement("div");
  root.style.cssText =
    "position: fixed; inset: 0; display: grid; z-index: 4;" +
    ` grid-template-columns: ${RAIL_W}px minmax(0, 1fr) ${DOCK_W}px;` +
    ` grid-template-rows: minmax(0, 1fr) ${BAR_H}px;` +
    " grid-template-areas: 'rail canvas dock' 'bar bar bar';";

  const mk = (area: string, extra: string): HTMLElement => {
    const el = document.createElement("div");
    el.style.cssText = `grid-area: ${area}; min-width: 0; min-height: 0; ${extra}`;
    root.appendChild(el);
    return el;
  };

  const rail = mk("rail", "overflow-y: auto; background: var(--panel); border-right: 1px solid rgba(127,224,196,0.14);");
  const canvasBox = mk("canvas", "position: relative; pointer-events: none;");
  const dock = mk("dock", "overflow: hidden; display: flex; flex-direction: column; background: var(--panel); border-left: 1px solid rgba(127,224,196,0.14);");
  const bar = mk("bar", "display: flex; align-items: center; gap: 8px; padding: 0 12px; background: var(--panel); border-top: 1px solid rgba(127,224,196,0.14); overflow-x: auto; white-space: nowrap;");

  host.appendChild(root);
  return { root, rail, canvasBox, dock, bar };
}

/** The box the construct gets — the camera fits to THIS, not the viewport. */
export function canvasBoxSize(zones: Zones): { width: number; height: number } {
  const r = zones.canvasBox.getBoundingClientRect();
  return { width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) };
}

export function setRailCollapsed(zones: Zones, collapsed: boolean, dockCollapsed: boolean): void {
  zones.root.style.gridTemplateColumns =
    `${railWidth(collapsed)}px minmax(0, 1fr) ${dockWidth(dockCollapsed)}px`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/sim-layout.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Mount the canvas into the box and fit the camera to it**

In `worldlab.ts`, after `buildZones`, size the canvas to `canvasBoxSize` on boot and on resize, and set `canvas.style.pointerEvents = "auto"` (the box itself is `pointer-events: none` so the rails above it stay clickable).

Replace the body of `fitCameraToConstruct` so it measures the box:

```ts
  function fitCameraToConstruct(): void {
    const box = canvasBoxSize(zones);
    canvas.width = box.width;
    canvas.height = box.height;
    renderer.resize();
    renderer.setZoom(1);
    // ... rest unchanged: fitZoom = fitZoomFor(worldW, worldH, renderer.viewWidth, renderer.viewHeight, FIT_MARGIN)
  }
```

- [ ] **Step 6: Move the existing chrome into the zones**

Reparent, without changing their internals:
- tool buttons + palette + roll pane → `zones.rail`
- time controls + construct selector + save/load + tick → `zones.bar`
- delete the `stack` element and its `position: fixed` cssText entirely

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`, `?sim=1&demo=1`.
Expected: the construct occupies the middle column and is never covered; the bar is one row; the rail scrolls independently.

- [ ] **Step 8: Commit**

```bash
git add src/game/simLayout.ts tests/sim-layout.test.ts src/game/worldlab.ts
git commit -m "feat(sim): three-zone frame — chrome reserves space, never covers

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: One dock, five tabs, visible state

**Files:**
- Create: `src/game/simDock.ts`
- Create: `tests/sim-dock.test.ts`
- Modify: `src/game/worldlab.ts` (delete the four independent overlay panels; re-host their bodies)

**Interfaces:**
- Produces:
  - `type TabId = "subject" | "exchange" | "web" | "ledger" | "pressures"`
  - `interface Dock { setTab(id: TabId | null): void; body(id: TabId): HTMLElement; onTab(fn): void; activeTab(): TabId | null }`
  - `buildDock(host: HTMLElement) → Dock`
  - `nextTabState(current: TabId | null, clicked: TabId) → TabId | null` — pure toggle rule

- [ ] **Step 1: Write the failing test**

Create `tests/sim-dock.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nextTabState } from "../src/game/simDock";

describe("nextTabState", () => {
  it("opens a tab when none is open", () => {
    expect(nextTabState(null, "web")).toBe("web");
  });

  it("switches between tabs", () => {
    expect(nextTabState("ledger", "web")).toBe("web");
  });

  it("closes when the open tab is clicked again — the answer to 'how do I close this'", () => {
    expect(nextTabState("web", "web")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/sim-dock.test.ts`
Expected: FAIL — cannot resolve `../src/game/simDock`.

- [ ] **Step 3: Implement**

Create `src/game/simDock.ts` with `TAB_IDS`, `nextTabState`, and `buildDock` rendering a tab strip plus one body per tab, showing only the active one. The active tab button carries an `aria-selected="true"` and the mint background used elsewhere in the codex (`rgba(127,224,196,0.16)`), so open-state is visible — the thing the old independent overlays could not express.

```ts
export type TabId = "subject" | "exchange" | "web" | "ledger" | "pressures";
export const TAB_IDS: TabId[] = ["subject", "exchange", "web", "ledger", "pressures"];

/** Clicking the open tab closes the dock; clicking another switches to it. */
export function nextTabState(current: TabId | null, clicked: TabId): TabId | null {
  return current === clicked ? null : clicked;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/sim-dock.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Re-host the existing panels**

Move the ledger, web/census and pressures bodies into `dock.body("ledger" | "web" | "pressures")`. Delete their `position: fixed` wrappers and their independent open flags. Route `G` to `dock.setTab(nextTabState(dock.activeTab(), "ledger"))`.

Collapse the ledger's empty state: when `series.length === 0`, render the one line `no history yet · press play` instead of the 350px empty chart.

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`, `?sim=1&demo=1`. Click LEDGER, then click it again.
Expected: it opens with the button lit, and the same click closes it. No panel overlaps another. `G` does the same thing.

- [ ] **Step 7: Run the full suite**

Run: `npm run check && npx vitest run 2>&1 | tail -4`
Expected: no type errors; +3 tests from this task.

- [ ] **Step 8: Commit**

```bash
git add src/game/simDock.ts tests/sim-dock.test.ts src/game/worldlab.ts
git commit -m "feat(sim): one dock, five tabs, visible open state

Four independent fixed overlays became one dock with shared state, so a
toggle can light up and a second click closes it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# Stage 3 — Readouts

## Task 7: The pollination telemetry (pure)

**Files:**
- Create: `src/game/simTelemetry.ts`
- Create: `tests/sim-telemetry.test.ts`

**Interfaces:**
- Consumes: `POLLINATE_CHANCE`, `POLLINATE_MATCH_MIN`, `BOOM_POLLINATIONS` (export these from `swarms.ts` — they are currently module-private consts at `:88-89`), `FEED_VALUE`, `LIVING_COST`, `NECTAR_REGEN`, `NECTAR_DRAW` (already exported, `swarm.ts:12-15`)
- Produces:
  - `spreadOdds(match, population, cap) → { perTick: number; expectedTicks: number | null; canSpread: boolean }`
  - `energyBudget(population, cap, energy, nectar) → { intake, burn, net }`
  - `nectarEconomy(nectar, regen, draw, visitsPerTick) → { level, refillTicks, drainPerTick, sustainable }`

- [ ] **Step 1: Write the failing test**

Create `tests/sim-telemetry.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { energyBudget, nectarEconomy, spreadOdds } from "../src/game/simTelemetry";
import { POLLINATE_CHANCE, POLLINATE_MATCH_MIN } from "../src/game/swarms";

describe("spreadOdds", () => {
  it("mirrors the sim's own arithmetic exactly", () => {
    // swarms.ts tick(): rng() < POLLINATE_CHANCE * match * match * fill
    const match = 0.6, pop = 50, cap = 100;
    const expected = POLLINATE_CHANCE * match * match * (pop / cap);
    expect(spreadOdds(match, pop, cap).perTick).toBeCloseTo(expected, 10);
  });

  it("reports the expected wait as the reciprocal", () => {
    const out = spreadOdds(0.6, 50, 100);
    expect(out.expectedTicks).toBeCloseTo(1 / out.perTick, 6);
  });

  it("says a below-threshold match can never spread — the reading that matters most", () => {
    const out = spreadOdds(POLLINATE_MATCH_MIN - 0.01, 100, 100);
    expect(out.canSpread).toBe(false);
    expect(out.perTick).toBe(0);
    expect(out.expectedTicks).toBeNull();
  });

  it("treats a match exactly at the threshold as able to spread", () => {
    expect(spreadOdds(POLLINATE_MATCH_MIN, 100, 100).canSpread).toBe(true);
  });

  it("returns no odds for an empty swarm", () => {
    const out = spreadOdds(0.9, 0, 100);
    expect(out.perTick).toBe(0);
    expect(out.expectedTicks).toBeNull();
  });

  it("never divides by a zero cap", () => {
    expect(() => spreadOdds(0.9, 10, 0)).not.toThrow();
    expect(spreadOdds(0.9, 10, 0).expectedTicks).toBeNull();
  });
});

describe("energyBudget", () => {
  it("nets intake against the cost of living", () => {
    const out = energyBudget(50, 100, 0.5, 0.8);
    expect(out.burn).toBeCloseTo(0.02 * 50, 10); // LIVING_COST * population
    expect(out.net).toBeCloseTo(out.intake - out.burn, 10);
  });

  it("goes negative for a big hungry swarm on a dry flower", () => {
    expect(energyBudget(100, 100, 0.1, 0).net).toBeLessThan(0);
  });
});

describe("nectarEconomy", () => {
  it("is sustainable when regen outpaces draw", () => {
    expect(nectarEconomy(0.5, 0.05, 0.25, 0.1).sustainable).toBe(true);
  });

  it("is not sustainable when visits drain faster than regen", () => {
    expect(nectarEconomy(0.5, 0.05, 0.25, 1).sustainable).toBe(false);
  });

  it("reports how long a drained flower takes to refill", () => {
    expect(nectarEconomy(0, 0.05, 0.25, 0).refillTicks).toBeCloseTo(20, 6);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/sim-telemetry.test.ts`
Expected: FAIL — cannot resolve `../src/game/simTelemetry`; `POLLINATE_CHANCE` not exported from `swarms.ts`.

- [ ] **Step 3: Export the constants**

In `src/game/swarms.ts`, add `export` to the existing consts at `:88-89` and to `BOOM_POLLINATIONS`:

```ts
export const POLLINATE_MATCH_MIN = 0.3; // metabolic efficiency a swarm needs before it pollinates at all
export const POLLINATE_CHANCE = 0.5; // scales the per-swarm, per-heartbeat pollination probability
```

- [ ] **Step 4: Implement the module**

Create `src/game/simTelemetry.ts`:

```ts
// The bench's readouts, derived from state the sim already computes. PURE:
// no DOM, no rng, no wall clock, and nothing here is ever fed back into the
// sim -- these are measurements, not inputs.
//
// The arithmetic is deliberately a mirror of swarms.ts tick(). If that changes,
// these change with it, and tests/sim-telemetry.test.ts asserts the mirror by
// importing the same constants rather than restating their values.

import { FEED_VALUE, LIVING_COST } from "../life/swarm";
import { POLLINATE_CHANCE, POLLINATE_MATCH_MIN } from "./swarms";

export interface SpreadOdds {
  perTick: number; // probability of a spread ATTEMPT per heartbeat
  expectedTicks: number | null; // 1/perTick, or null when it can never spread
  canSpread: boolean; // match clears POLLINATE_MATCH_MIN
}

/**
 * How often this swarm tries to pollinate its host.
 *
 * swarms.ts: `if (match >= POLLINATE_MATCH_MIN)` then
 * `rng() < POLLINATE_CHANCE * match * match * fill`, fill = population / cap.
 *
 * `expectedTicks` is the expected wait between ATTEMPTS. A spread also needs
 * flora.pollinateSpread to find room, so the real interval is this or longer --
 * the readout should say "≈" and never promise.
 */
export function spreadOdds(match: number, population: number, cap: number): SpreadOdds {
  if (cap <= 0 || population <= 0 || match < POLLINATE_MATCH_MIN) {
    return { perTick: 0, expectedTicks: null, canSpread: match >= POLLINATE_MATCH_MIN };
  }
  const fill = population / cap;
  const perTick = POLLINATE_CHANCE * match * match * fill;
  return {
    perTick,
    expectedTicks: perTick > 0 ? 1 / perTick : null,
    canSpread: true,
  };
}

export interface EnergyBudget {
  intake: number; // energy gained per heartbeat at the current nectar level
  burn: number; // LIVING_COST * population
  net: number;
}

/** What the cloud earns against what it costs to stay alive. */
export function energyBudget(
  population: number,
  cap: number,
  match: number,
  nectar: number,
): EnergyBudget {
  const intake = Math.max(0, nectar) * FEED_VALUE * Math.max(0, match);
  const burn = LIVING_COST * Math.max(0, population);
  return { intake, burn, net: intake - burn };
}

export interface NectarEconomy {
  level: number; // 0..1 now
  refillTicks: number; // heartbeats from empty to full at `regen`
  drainPerTick: number;
  sustainable: boolean; // regen keeps up with the draw
}

export function nectarEconomy(
  nectar: number,
  regen: number,
  draw: number,
  visitsPerTick: number,
): NectarEconomy {
  const drainPerTick = draw * Math.max(0, visitsPerTick);
  return {
    level: nectar,
    refillTicks: regen > 0 ? 1 / regen : Infinity,
    drainPerTick,
    sustainable: regen >= drainPerTick,
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run tests/sim-telemetry.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add src/game/simTelemetry.ts tests/sim-telemetry.test.ts src/game/swarms.ts
git commit -m "feat(sim): pollination telemetry — spread odds, energy, nectar

Pure mirror of swarms.ts tick() arithmetic, so the bench can state a
numeric ETA to the next spread and say plainly when a match below 0.3
means a cloud will never pollinate its host at all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: The working view

**Files:**
- Create: `src/render/working.ts`
- Create: `tests/working-view.test.ts`
- Modify: `src/render/renderer.ts` (`Scene`, the draw call)
- Modify: `src/game/worldlab.ts` (the `W` toggle, `sceneFor`)

**Interfaces:**
- Consumes: `spreadOdds` (Task 7), `MotePhase`, `WorldSwarm`, `Flower`
- Produces:
  - `interface WorkingReading { cx, cy, hunger, ringFill, canSpread, carrying: number, hostX, hostY, hostNectar }`
  - `workingReadings(swarms, flowerFor, match) → WorkingReading[]` — **pure**
  - `drawWorking(ctx, readings, camX, camY)` — render only

- [ ] **Step 1: Write the failing test**

Create `tests/working-view.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { workingReadings } from "../src/render/working";

const swarm = (over: Partial<any> = {}) => ({
  x: 10, y: 20,
  sw: { population: 50, cap: 100, energy: 0.6 },
  home: { x: 12, y: 22, species: 1 },
  motes: [{ phase: "inbound" }, { phase: "orbit" }, { phase: "inbound" }],
  ...over,
});

describe("workingReadings", () => {
  it("counts only the motes carrying pollen home", () => {
    const [r] = workingReadings([swarm()] as any, () => ({ nectar: 0.5 }) as any, () => 0.6);
    expect(r.carrying).toBe(2);
  });

  it("reads hunger straight off the metabolic reserve", () => {
    const [r] = workingReadings([swarm()] as any, () => ({ nectar: 0.5 }) as any, () => 0.6);
    expect(r.hunger).toBeCloseTo(1 - 0.6, 6); // energy 0.6 → hunger 0.4
  });

  it("marks a below-threshold match as unable to spread", () => {
    const [r] = workingReadings([swarm()] as any, () => ({ nectar: 0.5 }) as any, () => 0.1);
    expect(r.canSpread).toBe(false);
    expect(r.ringFill).toBe(0);
  });

  it("skips a homeless swarm", () => {
    const out = workingReadings([swarm({ home: null })] as any, () => null, () => 0.6);
    expect(out).toEqual([]);
  });

  it("carries the host position and nectar through for the bloom arc", () => {
    const [r] = workingReadings([swarm()] as any, () => ({ nectar: 0.25 }) as any, () => 0.6);
    expect(r.hostX).toBe(12);
    expect(r.hostY).toBe(22);
    expect(r.hostNectar).toBeCloseTo(0.25, 6);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/working-view.test.ts`
Expected: FAIL — cannot resolve `../src/render/working`.

- [ ] **Step 3: Implement `workingReadings`**

Create `src/render/working.ts` with the pure reader first (the draw function follows in Step 5):

```ts
// The working view: the pollination economy, drawn into the world.
//
// "We can't build new amazing complexity without understanding it right."
// Every value here is already computed by the sim each heartbeat -- this
// module only reads and draws. It never writes, so it cannot perturb a seed.

import { Flower } from "../life/swarm";
import { WorldSwarm } from "../game/swarms";
import { spreadOdds } from "../game/simTelemetry";

export interface WorkingReading {
  cx: number; // cloud centre, world px
  cy: number;
  hunger: number; // 1 - energy; 0 = fed, 1 = starving
  ringFill: number; // 0..1 progress toward the expected next spread
  canSpread: boolean; // false = match below threshold: it will NEVER pollinate
  carrying: number; // motes on the return leg, pollen aboard
  hostX: number;
  hostY: number;
  hostNectar: number; // 0..1
}

export function workingReadings(
  swarms: readonly WorldSwarm[],
  flowerFor: (speciesId: number) => Flower | null,
  matchFor: (ent: WorldSwarm) => number,
): WorkingReading[] {
  const out: WorkingReading[] = [];
  for (const ent of swarms) {
    if (!ent.home) continue;
    const flower = flowerFor(ent.home.species);
    if (!flower) continue;
    const match = matchFor(ent);
    const odds = spreadOdds(match, ent.sw.population, ent.sw.cap);
    out.push({
      cx: ent.x,
      cy: ent.y,
      hunger: 1 - Math.max(0, Math.min(1, ent.sw.energy)),
      ringFill: odds.canSpread ? Math.min(1, odds.perTick * 20) : 0,
      canSpread: odds.canSpread,
      carrying: ent.motes.reduce((n, m) => n + (m.phase === "inbound" ? 1 : 0), 0),
      hostX: ent.home.x,
      hostY: ent.home.y,
      hostNectar: flower.nectar,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/working-view.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the draw function**

Append to `src/render/working.ts` a `drawWorking(ctx, readings, camX, camY)` that, per reading:
- strokes a ring around the cloud — **grey `rgba(150,160,168,0.5)` when `!canSpread`**, mint `rgba(127,224,196,0.8)` otherwise, arc swept by `ringFill`
- draws `carrying` small gold `#f4c979` pips on the ring's edge
- desaturates toward grey by `hunger` (a translucent grey disc over the cloud at `hunger * 0.35` alpha)
- strokes a small nectar arc at `(hostX, hostY - 10)` swept by `hostNectar`

Cull anything outside `camX/camY ± view`, reusing the renderer's existing bounds check.

- [ ] **Step 6: Wire it**

Add `working?: WorkingReading[]` to `Scene` in `renderer.ts`, call `drawWorking` after the swarm layer draws, and in `worldlab.ts` build the readings in `sceneFor` when `workingOn`. Bind `W` to toggle, default **on**, and add a `working` button to the bar.

Guard: `main.ts`'s `sceneFor` never sets `working`, so the island is untouched.

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`, `?sim=1&demo=1`, press play.
Expected: each cloud carries a ring that fills; gold pips appear on the return leg; a badly-matched cloud's ring is grey and static; the host bloom's nectar arc drains and refills.

- [ ] **Step 8: Run the full suite**

Run: `npm run check && npx vitest run 2>&1 | tail -4`
Expected: no type errors; +5 tests from this task.

- [ ] **Step 9: Commit**

```bash
git add src/render/working.ts tests/working-view.test.ts src/render/renderer.ts src/game/worldlab.ts
git commit -m "feat(sim): the working view — pollination made visible

Hunger from the metabolic reserve, gold pips for motes carrying pollen
home, a ring filling toward the expected next spread (grey when the
match is below 0.3 and the cloud will never pollinate at all), and a
nectar arc on the host bloom. Render-only over existing state.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Subject and Exchange tabs

**Files:**
- Create: `src/game/simSubject.ts`, `src/game/simExchange.ts`
- Create: `tests/sim-exchange.test.ts`
- Modify: `src/game/worldlab.ts`

**Interfaces:**
- Consumes: `swarmInspectView` (`worldlab.ts:361`), `spreadOdds`/`energyBudget`/`nectarEconomy` (Task 7), `layer.inspect`
- Produces: `subjectView(inspected, deps) → SubjectView`; `exchangeView(layer, ent, species) → ExchangeView` with `{ hostName, nectar, regen, draw, visitsPer100, pollinations, sinceLastSpread, etaTicks, canSpread, history: number[] }`

- [ ] **Step 1: Write the failing test**

Create `tests/sim-exchange.test.ts` asserting that `exchangeView` reports `etaTicks === null` and `canSpread === false` for a swarm whose match is below `POLLINATE_MATCH_MIN`, reports a finite `etaTicks` above it, and that `sinceLastSpread` counts from `pollinationLog.lastTick` against the layer's current tick.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/sim-exchange.test.ts`
Expected: FAIL — cannot resolve `../src/game/simExchange`.

- [ ] **Step 3: Implement both view builders**

`simSubject.ts` extends the existing `SwarmInspectView` shape with `energy: EnergyBudget`, `odds: SpreadOdds`, and `palateSpread` (count of distinct species in `pollinationLog`), and adds plant and critter branches.

`simExchange.ts` builds the one-swarm-one-flower view, keeping a bounded 200-sample nectar history in a `Map<number, number[]>` keyed by swarm id, sampled once per heartbeat from `worldlab`'s tick loop.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/sim-exchange.test.ts`
Expected: PASS.

- [ ] **Step 5: Render into the dock**

Subject tab: identity map beside host map, match %, population/cap, an energy in-vs-out bar, palate spread, exposure, behaviour, the retarget button from Task 3.
Exchange tab: nectar level against regen/draw, visits per 100 ticks, pollinations delivered, ticks since last spread, `≈ N ticks` to next (or `never · match 0.18 < 0.30`), and a 200-sample nectar strip chart.

- [ ] **Step 6: Verify in the browser**

Run: `npm run dev`, `?sim=1&demo=1`. Select a swarm, open Subject then Exchange.
Expected: both populate; the ETA matches the ring's fill rate in the world.

- [ ] **Step 7: Commit**

```bash
git add src/game/simSubject.ts src/game/simExchange.ts tests/sim-exchange.test.ts src/game/worldlab.ts
git commit -m "feat(sim): Subject and Exchange tabs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# Stage 4 — The food chain

## Task 10: Web graph layout (pure)

**Files:**
- Create: `src/game/simWebGraph.ts`
- Create: `tests/sim-web-graph.test.ts`

**Interfaces:**
- Consumes: `chainLinks` (`src/life/foodweb.ts`)
- Produces: `layoutWeb(links) → { nodes: {id, name, kind, col, row, x, y}[]; edges: {from, to, label, closes}[] }` — layered by trophic role (source → actor → target), deterministic, no rng

- [ ] **Step 1: Write the failing test**

Create `tests/sim-web-graph.test.ts` asserting: sources land in column 0, actors in column 1, targets in column 2; a species that is both a source and a target appears **once**, in its earliest column; a closed loop is marked `closes: true` on the returning edge; the layout is deterministic for the same input; and an empty link list yields empty nodes and edges.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/sim-web-graph.test.ts`
Expected: FAIL — cannot resolve `../src/game/simWebGraph`.

- [ ] **Step 3: Implement `layoutWeb`**

Assign columns by role, dedupe nodes by species id keeping the lowest column, stack rows within a column in stable id order, and compute `x = col * 150 + 20`, `y = row * 64 + 20`.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/sim-web-graph.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/simWebGraph.ts tests/sim-web-graph.test.ts
git commit -m "feat(sim): deterministic layered layout for the food web

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Web tab — graph, with a table behind a toggle

**Files:**
- Modify: `src/game/worldlab.ts` (the Web tab body)

- [ ] **Step 1: Render the graph**

An SVG built from `layoutWeb`: rounded node rects tinted by each species' genome hue, edges as paths with live throughput labels (`142/kt`), closed loops marked `↻`. Clicking a node sets `inspected` to the nearest live instance of that species and selects it in the world.

- [ ] **Step 2: Add the table toggle**

`[graph] [table]` in the tab header. The table is the same data as sortable rows: source, actor, target, rate, closes.

- [ ] **Step 3: Verify in the browser**

Run: `npm run dev`, `?sim=1&demo=1&rich=1`, open Web.
Expected: a readable layered graph; the toggle swaps to a sortable table with identical numbers; clicking a node selects that species in the world.

- [ ] **Step 4: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "feat(sim): the food chain as a graph, table one click away

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

# Stage 5 — Tooltips and voice

## Task 12: Tooltips

**Files:**
- Create: `src/render/tooltip.ts`
- Create: `tests/tooltip.test.ts`
- Modify: `src/game/simPressures.ts` (add a `help` field per pressure), `src/game/worldlab.ts`

**Interfaces:**
- Produces: `attachTooltip(el, text)`; `tooltipPosition(anchor, tip, viewport) → { left, top }` — **pure**, flips at the viewport edge

- [ ] **Step 1: Write the failing test**

Create `tests/tooltip.test.ts` asserting `tooltipPosition` places the tip below-right by default, flips to the left when it would overflow the right edge (the current transient tooltip clips off-screen — visible in the 2026-07-24 screenshot), flips above when it would overflow the bottom, and never returns a negative coordinate.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/tooltip.test.ts`
Expected: FAIL — cannot resolve `../src/render/tooltip`.

- [ ] **Step 3: Implement**

One shared tooltip element, 400ms in / 80ms out, shown on `pointerenter` and on `focus` so keyboard users get it too.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/tooltip.test.ts`
Expected: PASS.

- [ ] **Step 5: Add `help` to every pressure**

In `simPressures.ts`, add a `help: string` to each of the thirteen `PRESSURES` entries, lifting the copy from the existing source comments. Terse register, both ends named. Example:

```ts
{ id: "mutationAmount", label: "drift", min: 0, max: 0.3, step: 0.01, tuningKey: "mutationAmount",
  help: "genome drift per generation · 0 = clones, 0.3 = wild" },
{ id: "splitDistance", label: "speciation", min: 0.08, max: 0.6, step: 0.01, tuningKey: "splitDistance", reversed: true,
  help: "how readily a drifted lineage becomes its own kind · right = more often" },
```

- [ ] **Step 6: Attach tooltips throughout**

Every tool button, palette entry, time control, brush size, fidelity, dock tab and pressure slider.

- [ ] **Step 7: Verify in the browser**

Run: `npm run dev`, `?sim=1&demo=1`. Hover every control, including the rightmost.
Expected: every control explains itself; nothing clips off-screen.

- [ ] **Step 8: Commit**

```bash
git add src/render/tooltip.ts tests/tooltip.test.ts src/game/simPressures.ts src/game/worldlab.ts
git commit -m "feat(sim): tooltips on every control, edge-aware

The pressures' meanings existed only as source comments; they move into
the interface.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: The voice pass

**Files:**
- Modify: `src/game/worldlab.ts`, `src/render/menu.ts`, `src/render/inspect.ts`, `src/render/charts.ts`, `src/render/web.ts`, `src/render/backpack.ts`, `src/render/journal.ts`, `src/render/help.ts`, `src/game/main.ts` (HUD strings only)
- Do **not** modify: `src/game/murmurs.ts`, `src/world/name.ts`, `src/life/species.ts` name generation

**Rule (spec §3.7):** state the fact, name the quantity, drop the atmosphere. Lowercase, no metaphor in functional copy, numbers where numbers are known.

**Exempt:** murmurs, generated species/island names, the field guide's intro prose.

- [ ] **Step 1: Rewrite the lab's strings**

Every `flashNote`, label, heading and empty state in `worldlab.ts`. Reference conversions:

| today | becomes |
|---|---|
| `a fish needs shallow water` | `fish → shallow water only` |
| `✧ a daughter arose: velith manybell` | `speciated · velith manybell` |
| `pinned ⭑ — place pinned kinds from the roll pane, top-left` | `pinned · velith manybell` |
| `rolled a web — 5 chains introduced + seeded` | `web rolled · 5 chains` |
| `picked velith manybell — now on the palette` | `palette + velith manybell` |
| `needs a flowering plant in bloom` | `no bloom in range` |
| `archived velith manybell — restore it any time` | `archived · velith manybell` |

- [ ] **Step 2: Rewrite the menu and panel headings**

| today | becomes |
|---|---|
| `the backpack — your seeds & tools` | `backpack` |
| `the island's ledger — census & food web` | `ledger · census + web` |
| `the island's map — the whole isle drawn` | `map` |
| `the living web — this island's chains` | `web · chains` |
| `everything that isn't an immediate step — your pack, the isles, the guide` | *(delete the subtitle)* |
| `population over island-time` | `population / tick` |

- [ ] **Step 3: Rewrite the HUD and inspect strings**

| today | becomes |
|---|---|
| `a cloud of colour works the blooms nearby — lean close (E) or click it` | `swarm nearby · E` |
| `roams middling · skittish · an easy cloud` | `roam 0.5 · skittish · exposure 0.7` |
| `and the flower's nectar feeds the swarm — a fair trade` | `nectar 0.24/visit → swarm` |
| `you lean in close — Z to stand back` | `zoom 2× · Z` |

- [ ] **Step 4: Fix the tests that pin copy**

Run: `npx vitest run 2>&1 | grep -E "FAIL|✕" | head -20`
Update any test asserting on changed strings. Do **not** weaken an assertion to make it pass — update it to the new exact string.

- [ ] **Step 5: Run the full suite**

Run: `npm run check && npx vitest run 2>&1 | tail -4`
Expected: no type errors; all green.

- [ ] **Step 6: Verify the exemptions held**

Run: `git diff --stat master -- src/game/murmurs.ts src/world/name.ts`
Expected: no output — neither file changed.

- [ ] **Step 7: Commit**

```bash
git add -- src/game/worldlab.ts src/render/menu.ts src/render/inspect.ts src/render/charts.ts src/render/web.ts src/render/backpack.ts src/render/journal.ts src/render/help.ts src/game/main.ts tests/
git commit -m "refactor: one technical register across the game

State the fact, name the quantity, drop the atmosphere. Murmurs,
generated names and the field guide's intro keep their voice.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 14: Verify against the spec's acceptance criteria

- [ ] **Step 1: Walk all nine criteria**

From spec §8, in the browser at `?sim=1&demo=1`:

1. No panel covers the construct; collapsing a rail grows it.
2. A flower beneath a swarm is selectable in two clicks; the "here" chip says why.
3. Zoom holds the point under the cursor at every level.
4. Pause stops the motes.
5. Every control shows a tooltip; none clips off-screen.
6. A selected swarm shows hunger, match, nectar economy and a numeric ETA; the same spread is visible in the world.
7. The web reads as a graph, table one click away.
8. No lab or menu string reads as atmosphere where a number would do.
9. All three commands green; test count above 617.

- [ ] **Step 2: Confirm the island is untouched**

Run: `npm run shot -- "seed=42&warm=8000" shots/verify/island.png 8000` and compare against `shots/audit/03-warm.png`.
Expected: identical but for the HUD strings changed in Task 13.

- [ ] **Step 3: Final gate**

Run: `npm run check && npx vitest run 2>&1 | tail -4 && npm run build 2>&1 | tail -3`
Expected: no type errors; all tests pass; build succeeds.

- [ ] **Step 4: Clean up and hand over**

```bash
rm -rf shots/verify
git log --oneline master..sim-rework
```

---

## Self-review notes

**Spec coverage:** §3.1 → Task 5. §3.2 → Tasks 1, 4. §3.3 → Tasks 2, 3. §3.4 → Tasks 7, 8. §3.5 → Tasks 6, 9, 11. §3.6 → Task 12. §3.7 → Task 13. §4 module list → produced incrementally by Tasks 2, 5, 6, 7, 8, 9, 10, 12 (see the stated deviation above). §8 → Task 14.

**Known gap, accepted:** spec §4 targets `worldlab.ts` "under 900 lines". This plan extracts eight modules but does not chase that number; whatever remains after Task 13 is reported in Task 14 and split further only if it is still unwieldy. Chasing a line count for its own sake is not worth a risky sweep.
