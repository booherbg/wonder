# Honest time — Implementation Plan

> **For agentic workers:** Execute task-by-task. Prefer Composer/Grok. TDD.

**Goal:** Census interval 10 / cap 50k; sample load swarm-warm; live richness; SVG downsample.

**Spec:** `docs/superpowers/specs/2026-07-24-honest-time-design.md`

**Architecture:** Raise main census/swarm ring; fix warm sampling gap; filter richness to live pops; downsample chart paths after window slice.

**Tech stack:** TypeScript, vitest, CensusLog / charts / main / simCharts

## Global Constraints

- Interval **10**, cap **50000**; swarm history matched
- Lab census unchanged
- SVG must downsample (no 50k-point paths)
- Live richness on main + lab ledger
- Prefer Composer/Grok

## File map

| File | Role |
|---|---|
| `src/life/census.ts` | DEFAULT interval 10, cap 50000 |
| `src/game/main.ts` | SWARM caps; census.sample in swarm warm; live richness in ledger |
| `src/game/simCharts.ts` | Live richness filter |
| `src/render/charts.ts` | Downsample series before path |
| `tests/census.test.ts` | Cap/interval asserts |
| `tests/chart-window.test.ts` | Interval 10 math |
| `tests/sim-charts.test.ts` / new | Live richness / downsample |

---

### Task 1: Cadence + retention

**Files:** `src/life/census.ts`, `src/game/main.ts`, tests

- [ ] **1.1** Failing tests: DEFAULT_INTERVAL 10, DEFAULT_CAP 50000; chart-window samplesForWindow(5000,10,…) = 500
- [ ] **1.2** Update constants; SWARM_SAMPLE_INTERVAL=10; SWARM_HISTORY_CAP=50000
- [ ] **1.3** Tests green; commit

### Task 2: Load swarm-warm census.sample

**Files:** `src/game/main.ts`, test if extractable else assert via warm helper

- [ ] **2.1** In swarm warm loop after `sampleSwarms()`, call `census.sample(flora.tick, flora.speciesCounts)`
- [ ] **2.2** Commit (manual/note: warm with swarms lengthens plant series during swarm phase)

### Task 3: Live richness

**Files:** `src/game/main.ts`, `src/game/simCharts.ts`, tests

- [ ] **3.1** Failing test: buildLabChartsView / richness with defs but 0 live → low word/score
- [ ] **3.2** Filter live plants/critters before chainStats in buildChartsView + buildLabChartsView (+ chainScoreNow if display)
- [ ] **3.3** Tests green; commit

### Task 4: SVG downsample

**Files:** `src/render/charts.ts`, `tests/chart-window.test.ts` or charts test

- [ ] **4.1** After viewForWindow, downsample counts/matches to ~plotW (e.g. 500) via `downsample` before path; axis still uses full window length for tickAtIndex
- [ ] **4.2** Test: long series → path point count bounded
- [ ] **4.3** Commit

### Task 5: Verify

- [ ] **5.1** Full vitest + tsc
- [ ] **5.2** Manual: short play curve; life=0 richness; All stays snappy

---

## Done when

Spec success criteria met; tests green.
