# Lab ledger + mid-session warm — Implementation Plan

> **For agentic workers:** Execute task-by-task. Checkbox steps are the unit of progress. Prefer Composer/Grok. QA audit + deploy after each milestone.

**Goal:** World-Lab full ledger (`charts.ts`) via button + `G`; main-island backtick mid-session warm (presets + custom).

**Spec:** `docs/superpowers/specs/2026-07-23-charts-and-midwarm-design.md`

**Tech:** TypeScript, Vitest, existing `#charts` / `#dev` DOM.

## File map

| File | Responsibility |
|---|---|
| `src/game/simCharts.ts` (new) | Pure `buildLabChartsView(...)` — ChartsView from kernel + swarms |
| `src/game/worldlab.ts` | Wire open ledger button + `G`; close overlays |
| `src/game/main.ts` | Mid-session warm UI in `renderDev` / `#dev` |
| `src/game/midWarm.ts` (new, optional) | Pure `clampWarmTicks` + async runner helpers for testability |
| `tests/sim-charts.test.ts` | Lab ChartsView shape / series from census |
| `tests/mid-warm.test.ts` | Clamp + batch count math |
| `.superpowers/sdd/qa-charts-midwarm.md` | Per-milestone QA notes |

## Milestone A — Lab ledger

- [ ] **A1** Failing test: `buildLabChartsView` returns series from census traces + swarm match history
- [ ] **A2** Implement `simCharts.ts`; wire worldlab open/close + WEB button “open ledger” + `G` toggle
- [ ] **A3** `tsc` + vitest; QA note; commit; merge master; push deploy

## Milestone B — Mid-session warm

- [ ] **B1** Failing tests: clampWarmTicks (0→0, 500→500, 99999→50000)
- [ ] **B2** Implement warm row in `#dev` (presets + custom); async batch runner; busy lock; HUD flash
- [ ] **B3** `tsc` + vitest; QA note; commit; merge master; push deploy

## Constraints

- Real-play defaults unchanged; warm matches `?warm` ecology scope (flora + census + swarms only)
- No Math.random in sim tick paths
- Don't mix unfinished forge WIP; work on `worldlab-close` or fresh branch from master
- HEREDOC commits; verify before claiming green
