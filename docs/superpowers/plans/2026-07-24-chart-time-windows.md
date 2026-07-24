# Chart time windows — Implementation Plan

> **For agentic workers:** Execute task-by-task. Checkbox steps are the unit of progress. Prefer Composer/Grok. TDD for helpers.

**Goal:** Deeper census/swarm history (~100k ticks), ledger window buttons (5k/10k/50k/100k/All), absolute tick x-axis labels.

**Spec:** `docs/superpowers/specs/2026-07-24-chart-time-windows-design.md`

**Tech stack:** TypeScript, vitest, existing `CensusLog` / `charts.ts` / `main.ts` / `simCharts.ts`

**Global constraints (from spec):**
- Cap **2500** samples; cadence **interval 40** on main
- Windows: **5k · 10k · 50k · 100k · All**; default **All**
- Labels: absolute `tick N` (locale grouping); left/mid/right
- Clamp short histories; lab keeps denser cadence
- No wall-clock, drag-zoom, persist window, or lab cadence change

---

## File map

| File | Role |
|---|---|
| `src/life/census.ts` | Default cap 2500; expose `lastSampleTick` / `sampleInterval`; fix `restore` lastTick |
| `src/render/chartWindow.ts` | Pure: window ids, ticks→sample count, slice series, format tick labels |
| `src/render/charts.ts` | ChartsView time fields; slice+label SVGs; window button row + re-render |
| `src/game/main.ts` | SWARM_HISTORY_CAP 2500; pass interval/lastTick in buildChartsView |
| `src/game/simCharts.ts` | Pass lab census interval/lastTick |
| `src/game/worldlab.ts` | Swarm match history cap 2500 (ledger series) |
| `tests/chart-window.test.ts` | Pure window/label + viewForWindow tests |
| `tests/census.test.ts` | Cap/restore/lastSampleTick coverage |
| `index.html` | Minimal `.ch-win` button styles |

---

### Task 1: Census retention + lastTick

**Files:** `src/life/census.ts`, `tests/census.test.ts`

- [x] **1.1** Failing tests: default cap ≥ 2500; after samples, `lastSampleTick` equals last `sample()` tick; `restore` leaves lastTick usable for label math
- [x] **1.2** Implement: `CENSUS_DEFAULT_CAP = 2500`; getters; on restore set `lastTick` from longest trace
- [x] **1.3** Tests green; commit

### Task 2: Pure chart window helpers

**Files:** `src/render/chartWindow.ts`, `tests/chart-window.test.ts`

- [x] **2.1** Failing tests for: window tick spans; `samplesForWindow`; `sliceRight`; `tickAtIndex`; `axisTicks` / `formatTickLabel`
- [x] **2.2** Implement minimal pure module
- [x] **2.3** Tests green; commit

### Task 3a: View model + retention caps

**Files:** `src/render/charts.ts` (ChartsView fields + `viewForWindow` only), `src/game/main.ts`, `src/game/simCharts.ts`, `src/game/worldlab.ts`, tests as needed

- [x] **3a.1** Extend `ChartsView` with `sampleInterval` + `lastTick`; builders fill them
- [x] **3a.2** Raise `SWARM_HISTORY_CAP` to 2500 in main + worldlab match history
- [x] **3a.3** Export `viewForWindow` (rightmost slice); cover in `chart-window.test.ts`
- [x] **3a.4** `tsc` + focused tests; commit

### Task 3b: Window buttons + tick axis SVG

**Files:** `src/render/charts.ts` (UI/SVG), `index.html`

- [x] **3b.1** Module window state (default `all`); button row; re-render on click without rebuilding sim
- [x] **3b.2** Population + swarm SVGs use `axisSvg` with absolute tick labels (left/mid/right)
- [x] **3b.3** CSS for `.ch-windows` / `.ch-win`; `tsc` + vitest; commit

### Task 4: Verify

- [x] **4.1** Full `npx vitest run` + `npx tsc --noEmit`
- [ ] **4.2** Manual note: open `G` after warm → All / 5k labels and zoom

---

## Done when

Success criteria in the spec are met; tests green.
