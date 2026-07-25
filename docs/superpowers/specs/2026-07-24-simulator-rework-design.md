# The World-Lab rework — design

**Written:** 2026-07-24 · **Branch:** `sim-rework` (one branch, one review)
**Supersedes nothing.** Reworks the Simulator's interface, input, and legibility; leaves the sim itself alone.

---

## 1 · What the bench is for

> "The whole point of the simulator is to experiment with ways to build complex food chains."
> — Blaine, 2026-07-24

And the constraint that follows from it:

> "We can't build new amazing complexity without understanding it right."

Everything below serves those two sentences. The bench is an **instrument**: you place life, run time, and read what happened. Where the island is a place to be in, the bench is a thing to operate. It should feel like an oscilloscope, not a diorama.

Today it does not. The interface covers the construct it is supposed to reveal, the selection tool can't select the thing you most want to study, the camera moves away from what you're pointing at, and pausing doesn't stop the animation. This document fixes those, then adds the readouts the bench needs to earn its purpose.

---

## 2 · Diagnosis

Every item was read directly from source. Line numbers are against `de144cb`; grep the quoted anchor text if they drift.

### 2.1 Selection can't select a flower

`worldlab.ts:2486-2489`:

```ts
const sw = swarmLayer.pick(wx, wy, SWARM_PICK_RADIUS_PX);
const c  = sw ? null : pickCritterNear(kernel.critters, wx, wy, PICK_RADIUS_PX);
const plantPick = c || sw ? null : p;
```

Two compounding faults:

1. **Hard class priority.** Swarm beats critter beats plant, unconditionally — proximity never enters the decision.
2. **Asymmetric reach.** `SWARM_PICK_RADIUS_PX = 3.5 * TILE_SIZE` against `PICK_RADIUS_PX = 1.5 * TILE_SIZE` (`:162-163`). The swarm wins from 2.3× further away *and* wins every tie.

Because swarms hover over the blooms they work, the flower under a swarm is unreachable by construction.

A third fault makes it worse. At `:2479-2485`, when a swarm is already inspected, clicking a bloom **retargets the swarm** rather than inspecting the plant. One click means two different things depending on invisible state, and neither of them is "show me this flower".

### 2.2 The interface covers the construct

`worldlab.ts:2803-2816`. All bottom chrome is one element:

```
position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%);
flex-direction: column-reverse; max-height: calc(100vh - 36px); overflow-y: auto;
```

A bottom-anchored, centre-docked, reverse-stacking pile that may grow to the full viewport. Bar + palette + an open tray stack *upward over the canvas*. The ledger, web and drawer are **separate** `position: fixed` overlays with their own z-indices, so they also stack on each other and on the help text.

Nothing reserves layout space. The construct never shrinks to make room; the panels simply cover it.

### 2.3 Panel state is invisible and unclosable

A consequence of 2.2. Because each panel is an independent overlay, no shared open-state exists — so the LEDGER button cannot reflect that the ledger is open, and there is no shared close affordance. The only way out is remembering the key.

### 2.4 Pause doesn't pause

`worldlab.ts:2597`:

```ts
swarmLayer.animate(dt / 1000);          // ← outside `if (playing)`
renderer.draw(camX, camY, sceneFor(...), now);
```

The forage animation runs off the wall clock regardless of sim state. Paused, the motes keep leaving, visiting and returning. The view lies about whether time is running.

### 2.5 Zoom moves away from the pointer

`worldlab.ts:1652-1656`:

```ts
function applyCameraZoom(): void {
  renderer.setZoom(Math.max(0.05, fitZoom * zoomMul));
  clampCamera();
  ui?.setZoomPct(Math.round(zoomMul * 100));
}
```

No pointer anchoring — zoom is applied about the camera origin, so the thing under the cursor slides away as you zoom. Compounding: `ZOOM_WHEEL_IN = 1.05` (`simCamera.ts:6`) is a 5% step across a 0.4–4× range (≈47 events end to end), and panning requires middle-mouse or space+drag (`:2446`).

The wheel model itself is right and stays: scroll pans, ⌃/⌘/pinch zooms (`wheelCameraMode`, `simCamera.ts:45`).

### 2.6 No tooltips

No `title` attributes and no tooltip layer anywhere in `worldlab.ts`. Every pressure's meaning already exists as a source comment (`simPressures.ts:50-64`) and goes unread by the player.

---

## 3 · The design

### 3.1 Layout — three zones, reserved space

Replace the centre pile with a fixed frame. The canvas gets the box that is left over, and **the camera fits to that box**, so chrome never covers the construct.

```
┌────────────────────────────────────────────────────────────────┐
│ WONDER · WORLD-LAB              tick 1114        [back to isle]│
├──────────────┬──────────────────────────────┬──────────────────┤
│ LEFT RAIL    │                              │  RIGHT DOCK      │
│ 280px        │                              │  360px           │
│ ⟨collapse    │         the construct         │     collapse⟩    │
│              │                              │                  │
│ tool         │      (camera fits HERE)      │ ┌──────────────┐ │
│  select      │                              │ │subject       │ │
│  place       │                              │ │exchange      │ │
│  paint       │                              │ │web           │ │
│  erase       │                              │ │ledger        │ │
│  cloud       │                              │ │pressures     │ │
│              │                              │ └──────────────┘ │
│ palette      │                              │                  │
│  plants…     │                              │   (tab body)     │
│  critters…   │                              │                  │
│  biomes…     │                              │                  │
├──────────────┴──────────────────────────────┴──────────────────┤
│ ⏸ ▸ step  stepN 20  ×1 │ fidelity full │ construct ▾ │ save load│
└────────────────────────────────────────────────────────────────┘
```

- **Left rail** — tool selection and the palette. Fixed width, own scroll, collapsible to a 40px icon strip.
- **Right dock** — *one* panel with five tabs. One open-state, one close, and the active tab is visibly active. This resolves §2.2 and §2.3 together.
- **Bottom bar** — one 44px row, time and construct only. Never wraps, never grows.
- **Canvas** — everything else. `fitCameraToConstruct()` measures the canvas box, not the viewport, so collapsing a rail genuinely grows the construct.

Below 900px wide the rails collapse to overlay drawers so the layout does not break. That is a guard against breakage, not a mobile design — the phone case is out of scope (§6).

### 3.2 Camera and input

| Gesture | Behaviour |
|---|---|
| two-finger scroll | pan (unchanged) |
| pinch · ⌃wheel · ⌘wheel | **zoom about the pointer** |
| `+` `−` | zoom about the canvas centre |
| `0` | fit |
| drag on empty space, any tool | pan |
| space + drag | pan (unchanged) |
| middle-drag | pan (unchanged) |
| arrows | nudge (unchanged) |

**Zoom-to-cursor** is the load-bearing change. In `simCamera.ts`, add a pure helper and test it there:

```ts
export function zoomAboutPoint(
  camX: number, camY: number,
  viewW: number, viewH: number,
  fx: number, fy: number,      // pointer as a 0..1 fraction of the canvas
  ratio: number,               // newZoom / oldZoom
): { camX: number; camY: number }
```

The world point under the pointer is invariant across the zoom: `world = cam + f * view`, and `view' = view / ratio`, so `cam' = world - f * view'`.

Raise `ZOOM_WHEEL_IN` to `1.12` (≈20 events across the range) and keep the multiplicative model so steps feel even at every scale.

"Drag on empty space pans" needs a hit test before the stroke begins: on `pointerdown` with a placement tool, if the tile under the pointer is outside the construct, treat it as a pan rather than a no-op.

### 3.3 Selection

Replace class priority with **normalised distance**. Each candidate class keeps its own radius (clouds legitimately need more reach), but the winner is the nearest *relative to its own radius*:

```ts
score = distance / radiusFor(kind)     // < 1 means "in reach"; lowest score wins
```

Then:

- **Click again to cycle.** A click on the same spot advances through all in-reach candidates, so a flower under a swarm takes exactly two clicks. Cycling resets when the pointer moves more than a tile.
- **A "here" chip** in the dock header lists what is under the cursor (`swarm · flower · substrate`), with the current pick emphasised. The disambiguation becomes visible rather than guessed.
- **Retarget leaves the plain click.** It becomes an explicit button in the Subject tab — *retarget → click a bloom* — which arms a one-shot mode with a visible cursor state, and disarms on Escape or on use. A plain click never again means two things.

### 3.4 The working view — legibility in the world

> "Little previews of a pollinator … so we can SEE the pollination happening in real time. How long until it spreads? How hungry are the insects? I want to know it all."

This is the heart of the rework, and it needs **no new simulation** — every quantity below is already computed and already saved. It is a pure render layer over existing state, so it carries no determinism risk.

| Reading | Source | Drawn as |
|---|---|---|
| hunger | `Swarm.energy` (0..1 metabolic reserve, `swarm.ts:53`) | mote brightness/saturation — a starving cloud goes grey and slow |
| carrying pollen | `Mote.phase === "inbound"` (`swarms.ts:226`) | a gold pip on the mote, lit only on the return leg |
| at the bloom | `Mote.phase === "visit"` | a brief flare at the flower |
| can it pollinate at all | `match >= POLLINATE_MATCH_MIN` (0.3, `swarms.ts:88`) | ring around the cloud: **grey = never**, mint = yes |
| time until next spread | `1 / (POLLINATE_CHANCE · match² · fill)` heartbeats | that ring fills toward the expected spread |
| host nectar | `Flower.nectar`, regen `0.05`/tick, draw `0.25`/feed | a small arc on the host bloom, draining and refilling live |
| a spread just happened | `flora.pollinateSpread()` returning `true` (`swarms.ts:814`) | pulse on the host, pop on the new seedling |
| approaching a boom | `ent.pollinated` vs `BOOM_POLLINATIONS` | the ring thickens as it nears |

The ETA deserves emphasis: because the per-heartbeat pollination probability is `POLLINATE_CHANCE · match² · fill`, its reciprocal is the expected wait in heartbeats. So the bench can state, honestly and numerically, *"next spread ≈ 14 ticks"* — and show the same number as a filling ring in the world. **That single readout is the difference between watching a system and understanding one.**

Toggle: **W** (working view), **lab-only**, default on. Off, the construct renders exactly as it does today. `render/working.ts` takes a `Scene` and draws nothing the sim can read, so porting it to the island later (behind its own toggle, so the island stays peaceful) is a wiring change and not a rewrite — but that port is **not** in this branch.

### 3.5 The dock's five tabs

**Subject** — what is selected.
For a swarm: identity map beside host map with match %, population/cap, an energy in-vs-out bar (`intake = nectar · FEED_VALUE` against `burn = LIVING_COST · population`), palate spread from `pollinationLog`, predation exposure from `conspicuousness`, behaviour genes, and the retarget button.
For a plant: species, genome traits, drift from founder, nectar level, who works it, how many stand within N tiles.
For a critter: kind, role, drive, what it eats and what that wakes.

**Exchange** — one swarm × its host flower, the interaction itself.
Live nectar level against regen and draw, visits per 100 ticks, pollinations delivered, time since last spread, ETA to next. A small strip chart of nectar over the last 200 ticks with visits marked. This is the panel for "observe the interactions between insect and host flower".

**Web** — the food chain, graph by default with a table behind a toggle.
Nodes per species, edges per link, live throughput on each edge, closed loops marked. Clicking a node selects it in the world. The table view is the same data as sortable rows for tuning.

**Ledger** — the existing charts, unchanged in content, re-hosted in the dock. The empty state collapses to one line instead of 350px of blank chart.

**Pressures** — the thirteen existing levers, each with a tooltip.

### 3.6 Tooltips

A single shared tooltip layer, positioned with viewport-edge collision handling (the current transient tooltip clips off-screen right — visible in Blaine's screenshot). Every tool, every pressure, every time control, every palette entry gets one line: what it does and, for pressures, what the ends mean. The copy already exists in `simPressures.ts:50-64`'s comments — it moves from source into the interface.

Delay in 400ms, out 80ms. Keyboard focus shows the same tooltip.

### 3.7 Voice — one technical register

**Decision: everything terser** (Blaine, 2026-07-24). One register across the whole game.

The rule: **state the fact, name the quantity, drop the atmosphere.** Lowercase, no exclamation, no metaphor in functional copy, no second person where a noun will do. Numbers where numbers are known.

| today | becomes |
|---|---|
| `a fish needs shallow water` | `fish → shallow water only` |
| `✧ a daughter arose: velith manybell` | `speciated · velith manybell` |
| `pinned ⭑ — place pinned kinds from the roll pane, top-left` | `pinned · velith manybell` |
| `a cloud of colour works the blooms nearby — lean close (E) or click it` | `swarm nearby · E` |
| `roams middling · skittish · an easy cloud` | `roam 0.5 · skittish · exposure 0.7` |
| `the island's ledger — census & food web` | `ledger · census + web` |
| `population over island-time` | `population / tick` |
| `and the flower's nectar feeds the swarm — a fair trade` | `nectar 0.24/visit → swarm` |

**What keeps its voice, explicitly:**

- **Murmurs.** They are real quotations from real people; they are the game's soul and they are not ours to clip.
- **Species and island names.** Generated proper nouns stay as they are.
- **The field guide's introductory prose.** One place may still explain itself in sentences.

Everything else — HUD, menu, panel headers, inspect cards, notes, empty states, button labels — moves to the technical register. This is a large surface; it is done as a pass over strings with the table above as the standard, and it lands in the same branch.

---

## 4 · Architecture

`worldlab.ts` is 4,228 lines and this rework touches most of it. It is split **first**, as a no-behaviour-change commit, then built on:

| module | holds |
|---|---|
| `simLayout.ts` | the three-zone frame, rails, dock, collapse state, canvas box measurement |
| `simInput.ts` | pointer, wheel, keyboard; the stroke state machine |
| `simSelect.ts` | normalised-distance hit test, the cycle, the "here" set — **pure, tested** |
| `simDock.ts` | tab host, open-state, shared close, tooltip layer |
| `simSubject.ts` | the Subject tab's view models |
| `simExchange.ts` | the Exchange tab's view models |
| `simWebGraph.ts` | graph layout + the table view — **pure, tested** |
| `render/working.ts` | the working-view overlay — **pure over Scene, tested** |
| `worldlab.ts` | wiring only; target under 900 lines |

`simCamera.ts` gains `zoomAboutPoint` and keeps its existing pure-helper character.

The pure modules (`simSelect`, `simWebGraph`, `working`, `simCamera`) are where the tests go — hit-test ranking, cycle order, ETA arithmetic, graph layout, and zoom invariance are all testable without a DOM.

---

## 5 · Binding constraints

Carried forward from the project's standing rules; every one applies to this branch.

- **Determinism.** No `Math.random` / `Date.now` / `new Date()` in sim, kernel, flora or rng paths. The working view is *render-only* and reads state it never writes.
- **The island is untouched by the sim changes.** `?sim=` and no-`?sim` play stay byte-identical. The voice pass changes strings only; any shared-module edit must prove no behavioural change.
- **Save format additive.** New fields optional; existing saves and the `save.test.ts` guard stay green.
- **Peaceful.** Nothing dies violently; `step()` never births or removes a critter.
- **Hygiene.** Commit files by name, `npm run check` + `npx vitest run` + `npm run build` green before done. Current baseline: **601 tests**.

---

## 6 · Non-goals

- **The phone.** The lab's mobile layout (audit item A6) is explicitly deferred; the rails become overlay drawers below 900px and no further.
- **New simulation.** No new mechanics, roles, or tuning fields. Every readout is existing state.
- **The island's layout.** Only its *strings* change in this branch.
- **The deferred bird role** stays deferred.

---

## 7 · Risks

| risk | mitigation |
|---|---|
| The split is large and lands before any visible win | It is one no-behaviour-change commit, verified by the existing 601 tests plus a screenshot diff |
| "Everything terser" touches shared island copy | Strings only; the three exemptions in §3.7 are enumerated, and the island's rendering paths are covered by existing tests |
| Working-view overlay costs frames at 10k plants | Drawn only for on-screen entities, reusing the existing culling; measured against the 60fps / 15MB baseline before merge |
| Graph layout for a dense web becomes spaghetti | Layered layout by trophic role (source → actor → target), table view as the always-available fallback |

---

## 8 · Acceptance

The rework is done when, on a fresh construct:

1. No panel ever covers the construct; collapsing a rail visibly grows it.
2. A flower beneath a swarm is selectable in two clicks, and the "here" chip says why.
3. Zoom keeps the point under the cursor fixed, at every zoom level.
4. Pause stops the motes.
5. Every tool, pressure and time control shows a tooltip; none clips off-screen.
6. Selecting a swarm shows its hunger, its match, its nectar economy, and a numeric ETA to its next spread — and the same spread is visible in the world as it happens.
7. The web reads as a graph, with a table one click away.
8. No string in the lab or the menu reads as atmosphere where a number would do.
9. `npm run check`, `npx vitest run`, `npm run build` all green; test count above 601.
