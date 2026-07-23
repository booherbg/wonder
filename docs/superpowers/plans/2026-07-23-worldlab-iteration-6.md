# World-Lab Iteration (6a–6c) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Execute task-by-task. Checkbox steps are the unit of progress.

**Goal:** Make the World-Lab a clean-slate ecology bench: empty Live roster + Archive, Select/Place/Paint/Erase tools, live spread/pollination levers, and insect clouds you can place (generic + snap-to-bloom), inspect in detail (maps, pollination log), retarget, and chart over time — including a self-seed=0 / insects-only scenario.

**Architecture:** Extend existing World-Lab chrome (`worldlab.ts`) and pure models (`simPressures.ts`) without a layout rewrite. Promote hardcoded pollinate radii into tunable defaults (same numbers as today). Own a `SwarmLayer` beside the kernel for insect clouds, stepped from the bench’s existing play/step loop. Port main-world ledger chart muscle (`charts.ts` / census + swarm series) into the lab in phase 6e. Real-island defaults stay byte-identical unless a later graduation spec says otherwise.

**Tech Stack:** TypeScript, Vite 6, Vitest 3, Playwright (`scripts/shot.mjs`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-23-worldlab-iteration-design.md` (expanded insect Details / clone / analysis — 2026-07-23)

## Global Constraints

- **Determinism:** no `Math.random` / wall clock in sim paths; swarm/place/roll use seeded streams.
- **Peaceful:** erase removes instances only; never “kills” as predation flavor; step does not birth/remove critters except explicit place/erase.
- **Real worlds untouched:** new FloraTuning fields default to today’s constants; ambient pollinator role stays bench-assigned only; swarm bench wiring is `?sim=1` only until graduation.
- **Art / copy:** lowercase evocative; `:root` tokens + existing `btn()`/`group()`/`label()`; no new fixed overlays that collide with left/right stacks.
- **Verify each task:** relevant vitest file(s) green; after each phase `npx tsc --noEmit` + `npx vitest run` green.
- **Line numbers drift:** grep for quoted anchors; do not trust plan line numbers alone.
- **Model constraint:** prefer Composer/Grok for subagents unless the user says otherwise (user preference).

## File map

| File | Responsibility | Phase |
|---|---|---|
| `src/game/worldlab.ts` | clean slate drawer, Live/Archive tabs, tool radio, erase, swarm place/inspect UI, help copy | 6a–6c |
| `src/game/simPressures.ts` | new pressure ids + `tuningPatchFor` ranges | 6b |
| `src/life/flora.ts` | ensure `reseedRadius` / `pollinationRadius` remain live-read; optional helpers only if needed | 6b |
| `src/life/fauna.ts` | read pollinator reach/density from shared bench tuning (not hardcoded consts) | 6b |
| `src/game/swarms.ts` | read pollinate radius/maxSame from injectable config or flora tuning bridge | 6b–6c |
| `src/life/kernel.ts` | optional: erase helpers; swarm tick hook **or** keep swarm outside kernel and tick from worldlab (prefer outside kernel first) | 6a / 6c |
| `src/game/simRoster.ts` (new, optional) | pure Live/Archive list helpers if drawer logic gets thick | 6a |
| `tests/sim-roster.test.ts` | clean slate + archive transitions | 6a |
| `tests/sim-erase.test.ts` | erase patch clears plants/critters in cells | 6a |
| `tests/sim-pressures-spread.test.ts` | new levers patch FloraTuning / pollinate config | 6b |
| `tests/sim-swarm-bench.test.ts` | place + step swarm pollinates via pollinateSpread | 6c |

## Phases

| Phase | Deliverable |
|---|---|
| **6a** | Clean slate + Archive + tool radio + Erase |
| **6b** | Spread / cross / pollinator reach & density levers (+ lifespan; self-seed=0 scenario) |
| **6c** | Insects: SwarmLayer; place generic + invite snap; Details (maps, pollination log); retarget; erase clouds |
| **6d** | Camera pan/zoom (sibling — outline only at end) |
| **6e** | Lab ledger charts; swarm histories; clone-with-mutation flower |

---

# PHASE 6a — Roster & tools

---

### Task 1: Clean slate drawer (no starter Live kinds)

**Files:**
- Modify: `src/game/worldlab.ts` (`build()` drawer seed block — search `the drawer's roster resets with the construct`)
- Test: `tests/sim-roster.test.ts` (new) — if drawer state is hard to unit-test from worldlab, extract pure helpers into `src/game/simRoster.ts`:

```ts
export type RosterOrigin = "starter" | "rolled" | "daughter" | "restored";
export interface RosterEntry { /* mirror DrawerEntry fields needed */ }
export function initialLiveEntries(): RosterEntry[]; // returns []
export function archiveEntry(live: RosterEntry[], key: string): { live: RosterEntry[]; archive: RosterEntry[] };
export function restoreEntry(live: RosterEntry[], archive: RosterEntry[], key: string): { live: RosterEntry[]; archive: RosterEntry[] };
```

**Interfaces:**
- Consumes: existing `makeEntry`, `deleteDrawerEntry`, `reviveDrawerEntry`
- Produces: `build()` sets `drawer = []` (Live empty); Archive starts `[]`; palette empty until roll/pick

- [ ] **Step 1: Write failing tests** for `initialLiveEntries()` empty; archive/restore round-trip

```ts
import { expect, test } from "vitest";
import { archiveEntry, initialLiveEntries, restoreEntry } from "../src/game/simRoster";

test("clean slate starts with no live kinds", () => {
  expect(initialLiveEntries()).toEqual([]);
});

test("delete moves live → archive; restore moves back", () => {
  const entry = { key: "plant:3", kind: "plant" as const, speciesId: 3, name: "fenmoss", deleted: false };
  const a = archiveEntry([entry], "plant:3");
  expect(a.live).toEqual([]);
  expect(a.archive).toHaveLength(1);
  const b = restoreEntry(a.live, a.archive, "plant:3");
  expect(b.live).toHaveLength(1);
  expect(b.archive).toEqual([]);
});
```

- [ ] **Step 2: Run tests — expect FAIL** (`simRoster` missing)

- [ ] **Step 3: Implement `simRoster.ts` + wire `build()` to `drawer = []`; split Live vs Archive arrays (or `deleted` filter presented as tabs)**

Recommended UI: two tabs on `#lab-drawer` — **live** / **archive**. Live lists `!deleted`; Archive lists `deleted` (and optionally extinct-with-zero that user archived). Delete on Live → set deleted + clear instances (existing `deleteDrawerEntry`). Archive shows **restore** only (today’s bring back).

- [ ] **Step 4: Run tests — PASS; manual: `?sim=1` → empty palette, Roll → pick → chips appear**

- [ ] **Step 5: Commit**

```bash
git add src/game/simRoster.ts src/game/worldlab.ts tests/sim-roster.test.ts
git commit -m "$(cat <<'EOF'
feat(sim): clean-slate Live drawer with Archive tab

Starters no longer flood the palette; cleared kinds move to Archive with restore.
EOF
)"
```

---

### Task 2: Tool radio — Select · Place · Paint · Erase

**Files:**
- Modify: `src/game/worldlab.ts` (palette header / `Selected` type / pointer handlers)

**Interfaces:**
- Extend selection model:

```ts
type LabTool = "select" | "place" | "paint" | "erase";
// selected kind/tile only consulted when tool is place/paint
```

- [ ] **Step 1: Add four tool buttons; default `select`**
- [ ] **Step 2: Clicking a plant/critter chip sets `tool = "place"` + selected kind**
- [ ] **Step 3: Clicking a biome chip sets `tool = "paint"` + tile**
- [ ] **Step 4: Pointerdown branches on `tool` (select inspect / place stamp / paint / erase)**
- [ ] **Step 5: Update eyebrow help: `select · place · paint · erase · brush 1–4 · …`**
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(sim): tool radio for select / place / paint / erase"
```

---

### Task 3: Erase patch

**Files:**
- Modify: `src/life/kernel.ts` (add helpers) and/or `worldlab.ts`
- Test: `tests/sim-erase.test.ts`

**Interfaces:**

```ts
// on SimKernel (preferred)
eraseAtTile(tx: number, ty: number): { plants: number; critters: number };
// worldlab loops stampCells(tx,ty,brushSize) and sums counts
```

- [ ] **Step 1: Failing test** — place plant + critter on a tile, `eraseAtTile`, counts zero, species defs remain

```ts
test("eraseAtTile removes instances but keeps species defs", () => {
  // build small kernel, placePlant, placeCritter, eraseAtTile
  // expect flora count / critter count down; plantSpecies/critterSpecies length unchanged
});
```

- [ ] **Step 2: Implement `eraseAtTile` using `flora.removePlant` / filter-remove critters (match peaceful clear style of `clearPlantInstances` but tile-scoped)
- [ ] **Step 3: Wire Erase tool + drag like place/paint
- [ ] **Step 4: Flash `erased N plants · M critters`
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sim): erase brush clears plants and critters in a patch"
```

---

# PHASE 6b — Spread & pollination levers

---

### Task 4: Pressures for reseedRadius + pollinationRadius

**Files:**
- Modify: `src/game/simPressures.ts` (`PressureId`, `PRESSURES`, `tuningPatchFor`)
- Modify: `src/game/worldlab.ts` (pressureValues seed from `DEFAULT_TUNING`)
- Test: `tests/sim-pressures-spread.test.ts` (or extend existing pressures tests)

- [ ] **Step 1: Add pressures**

```ts
{ id: "reseedRadius", label: "spread distance", min: 1, max: 8, step: 1, tuningKey: "reseedRadius" },
{ id: "pollinationRadius", label: "cross distance", min: 0, max: 6, step: 1, tuningKey: "pollinationRadius" },
```

- [ ] **Step 2: `tuningPatchFor` returns integer-clamped radii**
- [ ] **Step 3: Tray subtitle note: `island-wide — not per plant`
- [ ] **Step 4: Test patch applies to `kernel.flora.tuning` via existing `setPressure` path
- [ ] **Step 5: Commit**

```bash
git commit -m "feat(sim): pressures for spread distance and cross distance"
```

---

### Task 5: Shared pollinator reach / density levers

**Files:**
- Modify: `src/game/simPressures.ts` — add non-tuningKey pressures `pollinatorReach`, `pollinatorDensity` **or** add optional fields on a small `PollinationAssist` config owned by worldlab and passed into fauna/swarms
- Modify: `src/life/fauna.ts` — replace `POLLINATOR_RADIUS` / `POLLINATOR_MAX_SAME` with readers from config (default 6 / 2)
- Modify: `src/game/swarms.ts` — same defaults for `POLLINATE_SPREAD_RADIUS` / `POLLINATE_MAX_SAME`
- Test: ambient pollinator + swarm pollinateSpread use overridden radius

**Recommended shape:**

```ts
// src/life/pollinateAssist.ts (new, pure)
export interface PollinateAssist {
  radius: number;   // default 6
  maxSame: number;  // default 2
}
export const DEFAULT_POLLINATE_ASSIST: PollinateAssist = { radius: 6, maxSame: 2 };
```

Bench holds one `pollinateAssist` object; pressures write it; fauna ambient role + SwarmLayer read it (inject via closure/param — **do not** break real-play call sites: default param = `DEFAULT_POLLINATE_ASSIST`).

- [ ] **Step 1: Failing tests** — with radius 1 vs 8, pollinateSpread landing distribution differs (or call count with stubbed flora)
- [ ] **Step 2: Implement module + wire fauna + swarms defaults
- [ ] **Step 3: Add pressure sliders; copy distinguishes **natural reseed** vs **pollinator assist**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(sim): tunable pollinator reach and density (shared assist)"
```

---

# PHASE 6c — Insects on the construct

---

### Task 6: SwarmLayer on the World-Lab

**Files:**
- Modify: `src/game/worldlab.ts` — construct `SwarmLayer` after kernel/map/species exist; tick on play/step when fidelity includes life
- Modify: renderer scene builder in worldlab to pass swarm entities if the game renderer already supports them (grep `swarmLayer` / `swarms` in `renderer.ts`); if not, draw minimal markers in a lab overlay first

**Interfaces:**
- On each `kernel.step` batch from the bar, also `swarmLayer.tick(kernel.flora)` (same order as `main.ts`: flora heartbeat then swarms)
- Sample optional match history only if cheap; skip charts in v1

- [ ] **Step 1: Boot empty `SwarmLayer` with construct seed + flora + spawn at map centre**
- [ ] **Step 2: Tick with play/step; confirm no throw on empty swarms
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(sim): SwarmLayer ticks beside the World-Lab kernel"
```

---

### Task 7: Place / inspect / erase insect clouds

**Files:**
- Modify: `src/game/worldlab.ts`, possibly `src/game/swarms.ts` (add `addSwarmNear` / `removeNear` if missing)

**Interfaces:**

```ts
// preferred helpers on SwarmLayer or a thin simSwarm.ts
placeCloud(flora, wx, wy, rng): SwarmEntity | null; // needs a nearby bloom
removeCloudsInTiles(tiles: {x:number;y:number}[]): number;
inspectCloudAt(wx, wy, radiusPx): SwarmInspect | null;
```

- [ ] **Step 1: Palette or bar action “cloud” under Place** — or Roll kind toggle **insect** that seeds a cloud personality then place
- [ ] **Step 2: Select tool hit-tests swarms (after critters/plants or before — document order)
- [ ] **Step 3: Inspect plate shows name, match %, host flower, population
- [ ] **Step 4: Erase patch also removes clouds whose home tile is in the patch
- [ ] **Step 5: Tests: place near bloom → step → plant count or pollinated counter increases when assist is high / match forced
- [ ] **Step 6: Commit**

```bash
git commit -m "feat(sim): place, inspect, and erase insect clouds on the construct"
```

---

### Task 8: Roll or seed clouds + copy pass

**Files:**
- Modify: roll pane kind toggle **or** a “seed cloud on bloom” button on inspect/ambient
- Modify: help eyebrow + pressures empty states

**Minimum (pick one, ship both if cheap):**

1. **Seed on bloom:** with Select on a flowering plant, button `invite a cloud` places one swarm homing there (seeded rng).
2. **Roll insects:** third roll kind `insect` producing N cloud candidates (name + behavior sketch) → pick → Place tool stamps.

- [ ] **Step 1: Implement at least (1)**
- [ ] **Step 2: Help copy names three paths: natural · critter pollinator (Ambient) · insect cloud
- [ ] **Step 3: Manual checklist in PR body (below)
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(sim): seed insect clouds from blooms; clarify pollination copy"
```

---

# PHASE 6d — Camera (sibling outline; do not block 6a–6c)

### Task 9 (optional follow-up): Standard pan/zoom

- Wheel / two-finger → pan (`deltaX`/`deltaY` → `camX`/`camY`)
- ⌃/⌘+wheel or pinch → zoom; soften factor (~1.05)
- UI: `−` / `zoom%` / `+` / Fit; optional minimap + view rect
- Keyboard `=`/`-`/`0`

Separate small plan if this grows; not required to close 6c.

---

## Manual test plan (end of 6c)

1. `?sim=1` — Live empty, Archive empty, palette empty.
2. Roll plant → pick → Place brush 2×2 → plants appear.
3. Delete kind from Live → appears in Archive → Restore → back on Live.
4. Erase brush over patch → instances gone; kind stays Live if any remain elsewhere / or count 0 still Live until Delete.
5. Pressures: crank spread distance + reseed rate; Step N — colonization visibly wider/faster than defaults.
6. Ambient → flip a critter to pollinator; compare with high vs low pollinator reach.
7. Invite/seed a cloud on a bloom; Play — assist spread; inspect shows match.
8. Ordinary island (`?nomenu=1`) — no UI change; defaults match prior feel.

## Spec self-review checklist

- [x] No TBDs in success criteria
- [x] Natural vs pollinator paths named
- [x] Phases independently shippable
- [x] Real-play defaults preserved
- [ ] **User review of spec + this plan before coding** → resolved 2026-07-23: Q1–Q4 locked in spec (defaults unchanged; shared assist lever; invite-cloud first)
