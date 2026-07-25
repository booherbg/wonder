# World-Lab Overlay HUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the World-Lab construct full-bleed with SimCity-style overlay chrome grouped as Build · Run · Read, so panels no longer shrink the world.

**Architecture:** Flip layout policy first (canvas always viewport-sized; chrome overlays). Then re-home existing controls without changing sim rules: left Build rail + flyouts, thin bottom Run/Session strip, right Read dock only. Narrow (&lt;900) remaps Build to a bottom tool dock + sheets. Prefer small pure helpers + DOM wiring in `worldlab.ts`; extract a chrome module only when a task’s DOM block is too large to review safely.

**Tech Stack:** TypeScript, Vite, Vitest, hand-rolled DOM chrome (no UI framework), existing `simDock` / roll / drawer panels.

**Spec:** `docs/superpowers/specs/2026-07-25-worldlab-overlay-hud-design.md`

## Global Constraints

- **Surface:** World-Lab only. Island play (`main.ts` without `?sim=`) stays byte-identical.
- **No sim rule / ecology / pressures math / roll algorithm changes** — chrome layout and IA only.
- **Overlay policy:** canvas fills the viewport; chrome never feeds `edgeInset` into `canvasBoxFor` for lab.
- **IA homes (verbatim from spec):** Build = tools · brush · materials · library; Run = time · fidelity; Session = **new ▾** · save · load · tick; Read = dock tabs only.
- **Labels:** no “construct” on the bar; starter control is **new ▾**.
- **Hygiene:** commit files by name (never `git add -A`). `npm run check` + `npx vitest run` green before a task is done. Do not commit `.superpowers/brainstorm/`.
- **Voice:** lowercase functional copy; tooltips stay factual.

---

## File map

| File | Responsibility |
|---|---|
| `src/game/simLayout.ts` | Pure canvas box math; document overlay policy; keep `NARROW` / `MIN_CANVAS` / `GUTTER` / `edgeInset` for callers that still measure |
| `tests/sim-layout.test.ts` | Overlay policy tests (full-bleed default; chrome growth does not shrink canvas when insets are zero) |
| `src/game/worldlab.ts` | `relayout()`, `buildChrome()`, panel open state, keyboard wiring |
| `src/game/simDock.ts` | Dock tabs; optional working toggle hook; ambient host under pressures body |
| `src/game/simChromeLayout.ts` *(create if Task 3 needs it)* | Pure helpers: which materials flyout for a tool; narrow vs desktop chrome mode |
| `tests/sim-chrome-layout.test.ts` *(create with helper)* | Tests for those pure helpers |
| `src/render/help.ts` | Ensure World-Lab shortcuts live in Help (no permanent legend) |
| `.gitignore` | Ignore `.superpowers/` |
| Spec status | Mark design doc approved |

---

### Task 0: Branch, ignore, mark spec approved

**Files:**
- Modify: `.gitignore`
- Modify: `docs/superpowers/specs/2026-07-25-worldlab-overlay-hud-design.md` (status line only)

- [ ] **Step 1: Cut the branch**

```bash
git checkout master
git pull --ff-only
git checkout -b worldlab-overlay-hud
```

- [ ] **Step 2: Ignore brainstorm/session junk**

Append to `.gitignore`:

```
.superpowers/
```

- [ ] **Step 3: Mark the spec approved**

In the design doc header, set:

```markdown
**Status:** approved
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore docs/superpowers/specs/2026-07-25-worldlab-overlay-hud-design.md
git commit -m "$(cat <<'EOF'
chore: approve Overlay HUD spec and ignore .superpowers/

EOF
)"
```

---

### Task 1: Full-bleed layout policy

**Files:**
- Modify: `src/game/simLayout.ts`
- Modify: `tests/sim-layout.test.ts`
- Modify: `src/game/worldlab.ts` (`relayout` ~2528–2582)

**Interfaces:**
- Consumes: existing `canvasBoxFor`, `NARROW`
- Produces: World-Lab `relayout()` always uses zero chrome insets (full viewport box). `canvasBoxFor` remains for tests / potential future use; comments describe overlay policy.

- [ ] **Step 1: Rewrite the failing/updated tests**

Replace the “growing bottom tray shrinks the construct” narrative in `tests/sim-layout.test.ts` with overlay-first expectations. Keep `canvasBoxFor` arithmetic tests (it still computes reserved boxes), but add / change the policy tests World-Lab cares about:

```ts
test("overlay policy: with zero insets the construct stays full-bleed even if chrome exists elsewhere", () => {
  // World-Lab will pass zero insets always; chrome may be tall but must not be measured in.
  const b = canvasBoxFor(1200, 800, { top: 0, right: 0, bottom: 0, left: 0 });
  expect(b).toEqual({ left: 0, top: 0, width: 1200, height: 800 });
});

test("canvasBoxFor still shrinks when insets are supplied (helper remains pure)", () => {
  const short = canvasBoxFor(1200, 800, { top: 0, right: 0, bottom: 80, left: 0 });
  const tall = canvasBoxFor(1200, 800, { top: 0, right: 0, bottom: 320, left: 0 });
  expect(tall.height).toBe(short.height - 240);
});
```

Remove or rewrite the old comment block that says the fix is “reserve by measurement / shrink the construct.”

- [ ] **Step 2: Run tests — helper tests should still pass; note any that encode the old World-Lab policy**

Run: `npx vitest run tests/sim-layout.test.ts`
Expected: PASS after Step 3 if you update comments/tests together; if you only change tests that assert World-Lab policy before wiring, keep arithmetic tests green.

- [ ] **Step 3: Update `simLayout.ts` header comment**

Replace the “reserve by measurement / construct shrinks” story with: helper can compute reserved boxes; **World-Lab Overlay HUD uses zero insets so chrome overlays a full-bleed construct.**

- [ ] **Step 4: Change `relayout()` to full-bleed**

In `worldlab.ts`, replace inset measurement with:

```ts
function relayout(): void {
  const box = canvasBoxFor(window.innerWidth, window.innerHeight, {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  });
  canvas.style.position = "fixed";
  canvas.style.left = `${box.left}px`;
  canvas.style.top = `${box.top}px`;
  canvas.style.width = `${box.width}px`;
  canvas.style.height = `${box.height}px`;
  if (box.width === lastBoxW && box.height === lastBoxH) return;
  lastBoxW = box.width;
  lastBoxH = box.height;
  renderer.resize(box.width, box.height);
  fitCameraToConstruct();
}
```

Remove the `ResizeObserver` loop over chrome ids **or** keep observing only if something else needs it — preferred: observe nothing for insets; keep `window.resize` → `relayout()` only.

You may leave unused imports (`edgeInset`) until a later cleanup commit in this task:

```ts
// remove edgeInset from the import if unused
import { NARROW, canvasBoxFor } from "./simLayout";
```

Keep `NARROW` imported — later tasks still use it for mobile chrome.

- [ ] **Step 5: Verify**

Run: `npx vitest run tests/sim-layout.test.ts && npm run check`
Expected: PASS / no type errors.

Manual: open `?sim=1` — construct should fill the window behind the existing (still heavy) chrome.

- [ ] **Step 6: Commit**

```bash
git add src/game/simLayout.ts tests/sim-layout.test.ts src/game/worldlab.ts
git commit -m "$(cat <<'EOF'
fix(sim): full-bleed World-Lab canvas — chrome no longer shrinks the world

EOF
)"
```

---

### Task 2: Compact badge — kill shortcut wall

**Files:**
- Modify: `src/game/worldlab.ts` (`buildChrome` eyebrow ~3044–3063)
- Modify: `src/render/help.ts` only if World-Lab keys are missing from Help

- [ ] **Step 1: Replace eyebrow HTML**

```ts
eyebrow.innerHTML =
  `<span style="font: 10px var(--mono); letter-spacing: 0.24em; text-transform: uppercase; color: rgb(var(--lumen));">Wonder · world-lab</span>`;
eyebrow.style.cssText =
  "position: fixed; left: 18px; top: 14px; z-index: 5; pointer-events: none; user-select: none;" +
  " padding: 4px 8px; background: rgba(20,32,28,0.82); border-radius: 4px;";
```

Delete `#lab-key-help`, `syncNarrowChrome`, and its resize listener.

- [ ] **Step 2: Confirm Help covers lab keys**

If Help has no World-Lab section, add a short lab-only blurb listing: tools, brush 1–4, wheel pan, ⌃/⌘ zoom, −/+ / 0 fit, space play, Esc, roll/web/drawer keys, G ledger, W working. Do **not** put that text back on the eyebrow.

- [ ] **Step 3: Manual check**

Open lab — top-left is a small badge only; `?` still opens Help with shortcuts.

- [ ] **Step 4: Commit**

```bash
git add src/game/worldlab.ts src/render/help.ts
git commit -m "$(cat <<'EOF'
feat(sim): compact world-lab badge; move shortcuts to Help only

EOF
)"
```

---

### Task 3: Pure chrome-mode helpers (materials + narrow)

**Files:**
- Create: `src/game/simChromeLayout.ts`
- Create: `tests/sim-chrome-layout.test.ts`

**Interfaces:**
- Produces:
  - `export type MaterialsKind = "tiles" | "life" | null`
  - `export function materialsForTool(tool: LabTool | "cloud"): MaterialsKind`
  - `export function isNarrowViewport(width: number, narrow = NARROW): boolean`
  - `export type OverlayEdge = "left" | "right" | "bottom" | "modal"`
  - `export function primaryLeftOverlay(open: { flyout: boolean; roll: boolean; drawer: boolean }): "flyout" | "roll" | "drawer" | null` — at most one left overlay (flyout loses to roll/drawer if both requested: prefer explicit panel)

- [ ] **Step 1: Write failing tests**

```ts
import { expect, test } from "vitest";
import { NARROW } from "../src/game/simLayout";
import {
  materialsForTool,
  isNarrowViewport,
  primaryLeftOverlay,
} from "../src/game/simChromeLayout";

test("paint opens tile materials; place opens life; select/erase/cloud open none", () => {
  expect(materialsForTool("paint")).toBe("tiles");
  expect(materialsForTool("place")).toBe("life");
  expect(materialsForTool("select")).toBe(null);
  expect(materialsForTool("erase")).toBe(null);
  expect(materialsForTool("cloud")).toBe(null);
});

test("narrow breakpoint matches layout NARROW", () => {
  expect(isNarrowViewport(899)).toBe(true);
  expect(isNarrowViewport(900)).toBe(false);
  expect(NARROW).toBe(900);
});

test("left edge allows only one primary overlay — roll beats flyout", () => {
  expect(primaryLeftOverlay({ flyout: true, roll: false, drawer: false })).toBe("flyout");
  expect(primaryLeftOverlay({ flyout: true, roll: true, drawer: false })).toBe("roll");
  expect(primaryLeftOverlay({ flyout: false, roll: false, drawer: true })).toBe("drawer");
});
```

- [ ] **Step 2: Run — expect FAIL (module missing)**

Run: `npx vitest run tests/sim-chrome-layout.test.ts`

- [ ] **Step 3: Implement**

```ts
import { NARROW } from "./simLayout";
import type { LabTool } from "./…"; // use the existing LabTool type export/path from worldlab or a shared type — if LabTool is local to worldlab, define a minimal union here instead:

export type BuildTool = "select" | "place" | "paint" | "erase" | "cloud";
export type MaterialsKind = "tiles" | "life" | null;

export function materialsForTool(tool: BuildTool): MaterialsKind {
  if (tool === "paint") return "tiles";
  if (tool === "place") return "life";
  return null;
}

export function isNarrowViewport(width: number, narrow = NARROW): boolean {
  return width < narrow;
}

export function primaryLeftOverlay(open: {
  flyout: boolean;
  roll: boolean;
  drawer: boolean;
}): "flyout" | "roll" | "drawer" | null {
  if (open.roll) return "roll";
  if (open.drawer) return "drawer";
  if (open.flyout) return "flyout";
  return null;
}
```

If `LabTool` already exists and is exported, import it; do not duplicate conflicting unions.

- [ ] **Step 4: Run — expect PASS**

Run: `npx vitest run tests/sim-chrome-layout.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/game/simChromeLayout.ts tests/sim-chrome-layout.test.ts
git commit -m "$(cat <<'EOF'
feat(sim): chrome layout helpers for materials flyouts and narrow mode

EOF
)"
```

---

### Task 4: Bottom Run strip — Session cluster, strip the pile

**Files:**
- Modify: `src/game/worldlab.ts` (`buildChrome` bar ~3094–3372, palette attachment, panel button wiring)

**Goal of this task:** Bottom bar becomes **one non-wrapping row**: time · fidelity · **new ▾** · save · load · tick. Remove from the bar: construct button group, brush, roll/web/ledger/working/drawer/pressures/ambient. Keep callbacks working via temporary wiring to left-rail placeholders **or** keyboard / dock only until Task 5–6 finish — but the **visible bar** must match the spec.

- [ ] **Step 1: Stop growing the bottom stack**

- Change `#lab-bottom-stack` to a single-row host: no `max-height: 34vh` scroll pile; no `column-reverse` multi-child stack.
- **Detach** `#lab-palette` from the stack (move to a document fragment / left host created empty for Task 5). For this task, hide the old palette with `display: none` if not yet re-homed — acceptable intermediate: tools unreachable from mouse until Task 5, keyboard still works.
- Remove ambient tray from the bottom stack (`#lab-ambient-tray` append target moves in Task 6).

Bar CSS:

```ts
bar.style.cssText =
  "display: flex; align-items: center; gap: 8px; padding: 8px 12px; flex-wrap: nowrap;" +
  " max-width: min(96vw, 1100px); overflow-x: auto; height: 44px; box-sizing: border-box;" +
  " background: var(--panel); border-radius: var(--radius); box-shadow: var(--frame); user-select: none;";
```

Stack:

```ts
stack.style.cssText =
  "position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); z-index: 6;" +
  " display: flex; align-items: center; justify-content: center;";
```

- [ ] **Step 2: Replace construct group with Session `new ▾`**

Remove `label("construct")` + three always-visible starter buttons.

Add:

```ts
const newBtn = document.createElement("button");
newBtn.id = "session-new-btn";
newBtn.textContent = "new ▾";
attachTooltip(newBtn, "start a new canvas — rebuilds the map");
// menu: three options calling chrome.onStarter(kind) after confirm (Task 7 can deepen dirty check;
// for now window.confirm("rebuild this canvas? unsaved work will be lost") is enough)
```

Place Session group after fidelity: `group(label("session"), newBtn, saveSlotBtn, loadSlotBtn)` then tick.

- [ ] **Step 3: Delete panel toggle buttons from the bar**

Remove creation/append of `panelRollBtn`, `panelWebBtn`, `panelLedgerBtn`, `panelWorkingBtn`, `panelDrawerBtn`, `pressuresBtn`, `ambientBtn`, and the brush group from `bar`. Keep `chrome.openRoll` / `openWeb` / etc. functions; rebind their triggers in Tasks 5–6. Keyboard handlers that call those functions must keep working.

If something still references removed button ids for `style.cssText` active state, gate those updates on `document.getElementById(...)` or move active-state onto rail icons in Task 5.

- [ ] **Step 4: Verify**

Run: `npm run check && npx vitest run tests/sim-dock.test.ts tests/sim-layout.test.ts`
Manual: bottom bar is one slim row; world stays full-bleed.

- [ ] **Step 5: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "$(cat <<'EOF'
feat(sim): slim Run strip with session new/save/load — clear the bottom pile

EOF
)"
```

---

### Task 5: Build left rail + materials flyouts

**Files:**
- Modify: `src/game/worldlab.ts` (`buildChrome` tools/palette/brush/roll/drawer hosts)
- Uses: `materialsForTool`, `primaryLeftOverlay` from `simChromeLayout.ts`

- [ ] **Step 1: Create `#lab-build-rail`**

Fixed left column ~44px wide, top below badge, bottom above Run strip:

```ts
rail.style.cssText =
  "position: fixed; left: 10px; top: 48px; bottom: 66px; width: 44px; z-index: 6;" +
  " display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 0;" +
  " background: rgba(20,32,28,0.88); border-radius: 8px; user-select: none;";
```

Move tool buttons (select/place/paint/erase/cloud) onto the rail as compact icon/text buttons. Move brush 1×–4× under tools on the rail (vertical or compact popover — vertical stack of `1`/`2`/`3`/`4` is fine).

Add rail buttons for **roll** and **drawer** that call `chrome.openRoll` / `chrome.openDrawer`.

- [ ] **Step 2: Materials flyout**

Create `#lab-materials-flyout` positioned to the right of the rail. Show:

- `materialsForTool(tool) === "tiles"` → biome row (existing `tileBtns`)
- `"life"` → plant + critter rows (existing palette setters)
- `null` → hide flyout

Wire tool changes and `onSelect` so choosing a tile/plant still goes through existing `chrome.onSelect` / `onTool`.

Use `primaryLeftOverlay` so opening roll/drawer hides the materials flyout.

- [ ] **Step 3: Reposition roll + drawer as left overlays**

- `#lab-roll` and `#lab-drawer`: `left: 62px` (rail + gap), not competing for the right edge with the dock.
- Remove mutual exclusion between drawer and dock (both edges may open). Delete the `if (next && dock.activeTab()) dock.setTab(null)` guard in `openDrawer`.
- Active state: rail roll/drawer buttons reflect open (replace old `panelRollBtn` styling).

- [ ] **Step 4: Delete old `#lab-palette` bottom host** once rows live in the flyout.

- [ ] **Step 5: Verify**

Manual: paint → tile flyout; place → life flyout; roll/drawer from rail; brush on rail; keyboard tools still work.
Run: `npm run check && npx vitest run tests/sim-chrome-layout.test.ts tests/sim-brush.test.ts tests/sim-select.test.ts`

- [ ] **Step 6: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "$(cat <<'EOF'
feat(sim): Build left rail with brush, materials flyouts, and library

EOF
)"
```

---

### Task 6: Read dock only — ambient under pressures, working on dock

**Files:**
- Modify: `src/game/simDock.ts`
- Modify: `src/game/worldlab.ts` (pressures body, ambient tray host, working toggle)

- [ ] **Step 1: Add a working-view control on the dock**

In `buildDock`, add a header control (button or checkbox) labeled `working` that calls a new optional `dock.onWorking?.(next: boolean)` / `setWorking(active: boolean)`. Wire World-Lab’s existing working flag / `W` key to the same path. Remove any leftover bottom `panel-working-btn` references.

- [ ] **Step 2: Move ambient UI into pressures body**

- Append the existing ambient controls into `dock.body("pressures")` below the pressure sliders (sub-heading `ambient`).
- Delete `#lab-ambient-tray` as a bottom-stack child and `openAmbient` as a separate bottom toggle.
- Keep `chrome.openAmbient(true)` for `?` dev aids by selecting pressures tab + scrolling/ensuring ambient section visible — or map `openAmbient` → `dock.setTab("pressures")`.

- [ ] **Step 3: Ensure Read entry points**

- Web / ledger / pressures open **only** via dock tabs + existing keys (`G` ledger, etc.).
- No bottom duplicates.
- Chip stack / inspect may remain; do not shrink canvas.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/sim-dock.test.ts tests/sim-ambient.test.ts tests/sim-pressures.test.ts && npm run check`
Manual: dock tabs work; ambient visible under pressures; W toggles working; no bottom panel buttons.

- [ ] **Step 5: Commit**

```bash
git add src/game/simDock.ts src/game/worldlab.ts
git commit -m "$(cat <<'EOF'
feat(sim): Read dock owns observe panels; ambient under pressures

EOF
)"
```

---

### Task 7: Session dirty confirm for `new ▾`

**Files:**
- Modify: `src/game/worldlab.ts`

- [ ] **Step 1: Track dirty**

```ts
let sessionDirty = false;
function markDirty(): void {
  sessionDirty = true;
}
function clearDirty(): void {
  sessionDirty = false;
}
```

Call `markDirty()` from paint/place/erase success paths, roll pick / introduce, ambient/pressure changes if they mutate the bench. Call `clearDirty()` after successful save, after load, and after confirmed starter rebuild.

- [ ] **Step 2: Gate starter rebuild**

```ts
function requestNewCanvas(kind: StarterKind): void {
  if (sessionDirty && !window.confirm("rebuild this canvas? unsaved work will be lost")) return;
  chrome.onStarter(kind); // or the existing starter rebuild path
  clearDirty();
}
```

Wire `new ▾` menu items through `requestNewCanvas`.

- [ ] **Step 3: Verify manually** — paint something, hit new, cancel keeps map; confirm rebuilds.

- [ ] **Step 4: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "$(cat <<'EOF'
feat(sim): confirm before new canvas when the session is dirty

EOF
)"
```

---

### Task 8: Narrow / mobile chrome

**Files:**
- Modify: `src/game/worldlab.ts`
- Uses: `isNarrowViewport`

- [ ] **Step 1: Apply narrow layout class/flag on resize**

When `isNarrowViewport(innerWidth)`:

- Hide left rail (`display: none` or off-screen).
- Show `#lab-mobile-dock` fixed bottom above safe area: tool row (select/paint/place/erase/⋯) + compact time (play/step) + **read** + **lib** buttons.
- Materials open as a bottom sheet (`bottom: 0; left/right: 0; max-height: 45vh`) instead of side flyout.
- Roll / drawer / dock open as full-height sheets (`width: min(100vw, 420px)` or 100vw on very small).
- Put fidelity + session (new/save/load) under **⋯** sheet.

When not narrow, hide mobile dock and restore desktop rail + Run strip.

- [ ] **Step 2: Keep zoom/back** — optional: hide zoom % text on narrow; pinch/wheel zoom remains.

- [ ] **Step 3: Verify**

Manual: DevTools &lt;900px width — tools reachable at bottom; opening sheets does not resize canvas (Task 1 invariant).
Run: `npx vitest run tests/sim-chrome-layout.test.ts && npm run check`

- [ ] **Step 4: Commit**

```bash
git add src/game/worldlab.ts
git commit -m "$(cat <<'EOF'
feat(sim): narrow World-Lab — bottom tool dock and overlay sheets

EOF
)"
```

---

### Task 9: Esc / open-state polish + acceptance pass

**Files:**
- Modify: `src/game/worldlab.ts` (Esc handler ~2490–2513)
- Modify: design acceptance checklist mentally / QA notes if repo uses them

- [ ] **Step 1: Esc closes overlays in order**

Materials flyout → left library (roll/drawer) → right dock → inspect → leave bench (existing). Ensure each step updates button active styles.

- [ ] **Step 2: Same-toggle closes**

Rail roll/drawer and dock tabs already toggle; materials flyout closes when tool has no materials or when Esc.

- [ ] **Step 3: Acceptance checklist (spec §Acceptance)**

Walk all 10 acceptance items on desktop and one narrow width. Fix any regressions found in this task (small CSS/z-index/pointer-events only — no scope creep).

- [ ] **Step 4: Full gate**

```bash
npm run check && npx vitest run && npm run build
```

Expected: clean types; all tests green; build ok.

- [ ] **Step 5: Commit**

```bash
git add src/game/worldlab.ts src/game/simDock.ts src/game/simLayout.ts src/game/simChromeLayout.ts tests/
git commit -m "$(cat <<'EOF'
fix(sim): Overlay HUD Esc order and acceptance polish

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Full-bleed / no shrink | 1 |
| Compact badge / Help shortcuts | 2 |
| Materials-by-tool + narrow helpers | 3 |
| Thin Run strip; session **new ▾**; no bottom panel pile | 4 |
| Left Build rail, brush, flyouts, library left | 5 |
| Read dock only; ambient under pressures; working on dock | 6 |
| Dirty confirm on new canvas | 7 |
| Narrow bottom dock + sheets | 8 |
| Esc / open-state; acceptance | 9 |
| Layout tests updated | 1 |
| No sim rule changes | Global constraint |

## Placeholder scan

No TBD/TODO steps remain; each task has concrete files, code, commands, and commit messages.

## Type consistency

- `materialsForTool` / `primaryLeftOverlay` / `isNarrowViewport` defined in Task 3 and consumed in Tasks 5 and 8.
- Session control id: `session-new-btn`.
- Starter rebuild goes through `requestNewCanvas` (Task 7) calling existing `onStarter` path.
