# Lab ledger + mid-session warm — design

**Date:** 2026-07-23  
**Status:** shipped 2026-07-23 (Milestones A + B on master)  
**Surfaces:** World-Lab (`?sim=1`) ledger; main island backtick (`\``) mid-session warm  
**Out of scope:** predation, bird disperser-on-the-wing

---

## Goal

1. **World-Lab ledger** — promote WEB sparklines into the full main-island `charts.ts` panel (population lines, biomes, food web, swarm match curves), openable by **button and `G`**.
2. **Mid-session warm** — while wandering an island, fast-forward N flora/census/swarm heartbeats from the backtick **dev panel** (presets + custom), without a full reload.

---

## Locked decisions

| Topic | Choice |
|---|---|
| Lab ledger open | **Button + `G`** — buttons for everything; keyboard shortcuts are nice |
| Warm amount UI | **Presets + custom** — 300 · 1k · 3k · 10k, plus a number input; cap **50k** (same as `?warm`) |
| Warm advances | Same as load warmth: **flora.simTick + census.sample + swarmLayer.tick + sampleSwarms** (not full critter AI / wall clock) |
| Warm UX | Yielded batches + `warming… N%` in the dev panel; HUD flash on finish |
| WEB panel | Keep light sparklines; add **open ledger** button |
| Main island `G` | Unchanged behavior |

---

## A — World-Lab charts panel

### Behavior
- Build a `ChartsView` from the construct: `kernel.census`, plant/critter species, tile biomes, `swarmLayer` + match history (energy series stay in WEB sparklines for now; ledger swarm chart uses match % like main).
- Reuse `openCharts` / `closeCharts` / `#charts` DOM (already in `index.html`).
- **Open:** bottom/WEB button “ledger” (or “open ledger”) + key **`G`** (toggle like main).
- **Close:** `G` / Esc / existing charts hint.
- Title copy may say “the construct's ledger” when opened from the lab (optional `ChartsView` name/timeLabel already cover this).
- Mutually exclusive with other overlays as needed (close inspect/web when opening, mirror main).

### Non-goals
- Rewriting `charts.ts` SVG
- Persisting chart open state
- Energy series inside the SVG swarm chart (match % only, parity with main)

---

## B — Mid-session warm (backtick)

### Behavior
- When `#dev` is open (`\``), show a **warm** row under the readout:
  - Buttons: `300` `1k` `3k` `10k`
  - Custom: number input + `warm` / run button
  - Cap: `Math.min(50000, n)`; reject non-positive
- Clicking a preset or run starts an async warm:
  - Batch ticks (e.g. 50–100 per yield) with `await setTimeout(0)` so the browser paints
  - Progress line: `warming… 42%` (replace or append in `#dev`)
  - On finish: restore normal `renderDev()` content; flash `warmed N → tick T`
- Disable warm controls while a warm is in flight (busy lock).
- Autosave / existing persist paths pick up the advanced flora as usual on next save.

### Non-goals
- Warm from World-Lab (lab already has play/step/step-N)
- Changing forge load-time warmth
- Critter/beast/flock simulation during warm (matches `?warm` today)

---

## Success criteria

1. `?sim=1` → WEB → **open ledger** shows full charts; **`G`** toggles the same panel.
2. On a live island, `` ` `` → warm **1k** advances tick ~1000, census/swarm histories grow, UI stays responsive with progress %.
3. Custom warm `500` works; values >50k clamp; invalid ignored.
4. `tsc` + full vitest green; QA note per milestone; deploy after each milestone.

---

## Phasing

| Milestone | Ships |
|---|---|
| **A** | Lab `ChartsView` builder + WEB button + `G` + tests/QA + deploy |
| **B** | Dev-panel warm UI + async runner + tests/QA + deploy |
