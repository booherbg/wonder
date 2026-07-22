# The front door & the world forge — design

**Date:** 2026-07-22
**Status:** design approved in brainstorm; awaiting spec review → plan.
**Working name:** *the front door* (the title screen) + *the forge* (the new-island params panel).

---

## Where this sits — the lost front door

A **title screen** was designed in the Simulator spec
([`2026-07-21-simulator-design.md`](2026-07-21-simulator-design.md), §"The Simulator UI — v1 › Front door",
and roadmap item 5 "Frame & persistence"): *a title screen on load → World · Simulator ·
Help, over a live rich-biome backdrop, the way big games use a living scene as title art.*
It was parked in a later phase and **never built** — verified across `master`, all agent
worktree-branches, and full history: the concept lives only in the spec docs, never in `src/`.
Today `src/game/main.ts` boots straight into `loadWorld(...)` (line ~1320); `?sim=1` is a
separate full-page takeover (line ~105). There is no front door.

This spec builds it — and grows two of its rows past the original sketch, per Blaine:
- **`a new island`** opens a **world-generation params panel** (the *forge*), not an instant roll.
- **`the simulator`** row **launches today's simulator** (`src/game/simulator.ts`, the v1
  flower/swarm meadow). Building out the full World-Lab sandbox (palette, roll pane / species
  lab, evolutionary layer) stays its **own separate effort**, tracked by the Simulator spec —
  out of scope here. The front door only opens the door; it does not build the room.

---

## Trigger & routing

The title screen shows on **every load**. One flag gates the whole thing so every existing
deep-link and dev aid keeps working behind it:

**On boot, in `main.ts`:**
1. **`?nomenu=1` present** → skip the title; honor classic routing exactly as today:
   `?sim=1` → `startSimulator()`; else `loadWorld(seedFromUrl() ?? newIslandSeed())`.
   This is the **dev / tooling path** — the screenshot harness and manual verification ride here,
   so `?seed=`, `?shape=`, `?warm=`, `?night=`, etc. all behave unchanged.
2. **Otherwise** → **show the title screen.** Every load — `?seed=42`, `?sim=1` and the bare URL
   all land on the menu first (Blaine's call: "every single load, always").

`scripts/shot.mjs` appends `nomenu=1` to its query automatically, so all existing screenshot
invocations (and my own verification) keep landing directly in-world with no per-call change.

## The rows

Rendered in the naturalist's-codex look (the `:root` tokens), lowercase voice. Empty rows are
**hidden**, never greyed — the menu only ever offers what's real.

| Row | Label (voice) | Action | Shown when |
|---|---|---|---|
| continue | `continue — <island name>` | resume the last-played island (`loadWorld(lastSeed)`) | a `lastSeed` exists |
| new island | `a new island` | open **the forge** (params panel) | always |
| saved isles | `the isles you've known` | open the existing `openIslePicker()` | ≥1 saved isle |
| simulator | `the simulator` | `startSimulator()` (today's v1) | always |
| guide | `the field guide` | `openHelp()` over the backdrop | always |

- **`continue`** needs one small new piece: a `wonder.lastSeed` pointer in `localStorage`,
  written whenever a world is entered (from the forge, the picker, or continue itself). The game
  already persists each world by seed (`worldKey(seed)` + `WORLD_INDEX_KEY`); this only remembers
  *which* was last. The island's display name comes from the existing save/`islandName(seed)`.
- On a **true first visit** (no `lastSeed`, no saved isles) only `a new island · the simulator ·
  the field guide` show. The title screen **replaces today's first-visit welcome card**
  (`SEEN_KEY`/`openHelp(true)` at main.ts ~1340); the welcome copy is folded into the guide.

## The forge — the new-island params panel

Selecting `a new island` opens a params panel exposing **the whole generator**
(`generate(seed, config, shape, relief)` + the `warm` richness lever). "Everything we can" for
this first pass — optimize/curate later. Every knob defaults to `DEFAULT_CONFIG`
(`src/world/config.ts`) / the roll functions.

**Headline (always visible):**
- **the roll** — `seed`: **⟳ reroll** or type one in (an island becomes reproducible / shareable).
- **silhouette** — `shape`: *highland · twin · ridge · lowland · crescent · skerries*, or **let it roll**
  (`rollShape`). Each shown with its `SHAPE_PHRASE`.
- **relief** — the climb underneath: *rolling · terraced · mesa · gorges · crags*, or **let it roll**
  (`rollRelief`). Each with its `RELIEF_PHRASE`.
- **size** — `width × height` (default 300×300).
- **life** — `warmth`: pre-runs the ecology *barren → teeming* (0 … capped 50 000 ticks). Answers
  the standing "how alive does the island greet me" want.

**Fine grain (collapsed behind a fold by default — the full `WorldConfig`):**
- *elevation* — `elevationScale`, `elevationOctaves`, `falloffSharpness`
- *moisture* — `moistureScale`, `moistureOctaves`
- *sea & land bands* — `seaLevel`, `shoreLevel`, `beachLevel`, `rockLevel`, `snowLevel`
  (how much ocean, sand, bare rock, snowcap)
- *biomes* — `forestMoisture`, `marshMoisture` thresholds
- *rivers & falls* — `riverCount`, `riverMinSpringElevation`, `fallMaxCount`, `fallMinDrop`, `fallMinSpacing`
- *rarities* — `craterChance` (a caldera lake)
- *reroll guards* — `minLandFraction`, `minWalkableRegion`

**Controls:** **⟳ randomize all** (re-rolls seed + every knob within sane bounds) · **preview**
(button-triggered for v1 — regenerates the island and paints its minimap thumbnail; live-on-drag
is a later optimization) · **generate** (enters the island, records `lastSeed`).

**Boundaries:** knob ranges are clamped to sane min/max so a value can't hang or white-screen the
generator; `maxGenerationAttempts`/reroll guards stay in force. The forge produces a `GenArgs`
(`{seed, shape, relief, config, warm}`) that both preview and generate consume — the same path
`loadWorld` will use — so it is testable as pure `GenArgs → WorldMap` with no UI.

## The living backdrop

Behind the menu, a **live, pre-warmed rich-biome island** plays — reusing the real renderer over
**one fixed seed chosen for its diversity** and warmed so it greets you already lush (plants,
moving critters, flitting swarms, day/night). Non-interactive title art; the camera **slowly
drifts** for a cinematic feel. A dark vignette keeps the menu text legible over the moving scene.
(A rotating *library* of backdrop seeds is deferred — v1 is one good one.)

Implementation reuses `renderer.ts` + the flora/fauna tick over a fixed seed, with **no player and
no HUD**; selecting a row tears the backdrop loop down before entering the chosen mode. If full
game-loop reuse proves heavy, a first cut may render the warmed scene with ambient animation only —
the *look* (a living island under the wordmark) is the requirement, not full simulation fidelity.

## Art direction & the version stamp

- The wordmark **WONDER**, a one-line tagline, the rows as codex menu items with hover glow.
- **The build stamp lands here**, dim at the foot — closing the original request: the version is
  now visible **every launch**, no keypress. (It also still rides the Tab menu & field guide.)

---

## Component & code layout

| Unit | File | Purpose / interface |
|---|---|---|
| Title screen | new `src/render/title.ts` | mounts the backdrop + wordmark + rows; `showTitle(handlers)`; tears down on choice |
| Which rows show | in `title.ts` (pure) | `visibleRows({lastSeed, savedIsles}): Row[]` — unit-testable |
| The forge | new `src/render/forge.ts` | the params panel; `openForge(onGenerate)`; owns `panelState`; `panelState → GenArgs` (pure, testable) |
| Last-played pointer | `src/game/save.ts` | `readLastSeed()` / `writeLastSeed(seed)` over `wonder.lastSeed` |
| Boot routing + wiring | `src/game/main.ts` | the `?nomenu` branch; `showTitle` handlers call `loadWorld` / `startSimulator` / `openHelp` / `openIslePicker` |
| Gen path used by forge | `src/world/generate.ts` (reuse) | `generate(seed, config, shape, relief)` — no change expected; forge builds the args |
| Harness skip | `scripts/shot.mjs` | append `nomenu=1` to the query |

**Testable (headless):** `visibleRows(...)`; the forge `panelState → GenArgs` mapping and knob
clamping; `readLastSeed/writeLastSeed` round-trip; a `GenArgs → WorldMap` smoke test proving each
shape/relief and a warmed config generate a viable island.

---

## Acceptance (v1)

- `npm run check` clean · `npm test` green · `npm run build` clean.
- **Deep-links & dev aids unchanged behind `?nomenu=1`:** `npm run shot` (which now appends it)
  still lands in-world; `?sim=1&nomenu=1` → simulator; `?seed=X&nomenu=1` → island X.
- **Every normal load shows the title screen**; each row routes to its mode; empty rows are absent.
- **`continue`** resumes the last island entered in a prior session.
- **The forge** generates an island from any combination of the headline knobs; **preview** paints
  its minimap; the **fine-grain** fold exposes the full `WorldConfig`; out-of-range values can't
  hang generation.
- The **backdrop** shows a living, warmed island under the wordmark; the **version stamp** reads at
  its foot.
- Manual verify via the run/screenshot harness: load with no params → see the title over a live
  island → open the forge, pick `crescent` + `mesa` + high warmth, preview, generate → arrive on a
  lush crescent island.

---

## Implementation sequencing (for the plan)

1. **The shell** — `wonder.lastSeed` pointer; `showTitle` with the five rows + `visibleRows`;
   boot routing (`?nomenu` gate) + harness skip; rows wired to existing modes
   (`loadWorld`/`startSimulator`/`openHelp`/`openIslePicker`); the welcome card folded in; the
   version stamp. **Backdrop can start static-then-animated.** Ships useful on its own.
2. **The forge** — the params panel: headline knobs, the fine-grain fold, ⟳ randomize, preview
   (button), generate; the `panelState → GenArgs` path + clamping + tests.
3. **Backdrop polish** — full live tick + drifting camera + curated rich seed, if step 1 left it minimal.

## Deferred / later (YAGNI for v1)

- **Live-on-drag forge preview** (v1 is button-triggered).
- **A way back to the title from inside a world** (v1: reload returns to it; an in-game "to the
  front door" door can come later).
- **Curated seed library / named presets** for the forge and the backdrop.
- **The full simulator sandbox** — its own spec (`2026-07-21-simulator-design.md`).
- **Persisting forge configs** / sharing a world by its full param set (seed alone already reproduces).

**Related:** [`2026-07-21-simulator-design.md`](2026-07-21-simulator-design.md) (the simulator the
front door launches; the full sandbox it defers to) and the plant/insect ecology spec. The forge's
*warmth* knob answers a standing playtest want — controlling how alive an island feels on arrival.
