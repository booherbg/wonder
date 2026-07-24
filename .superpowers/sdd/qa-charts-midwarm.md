# QA — Lab ledger + mid-session warm (`charts-midwarm`)

**Branch:** `charts-midwarm`  
**Spec:** `docs/superpowers/specs/2026-07-23-charts-and-midwarm-design.md`

---

## Milestone A — World-Lab full ledger

**Status:** implemented  
**Gates:** `npx tsc --noEmit` · full `npx vitest run`

### Ships

- Pure `buildLabChartsView` in `src/game/simCharts.ts` (census series, biomes, food web, swarm match %)
- World-Lab opens reuses `#charts` / `openCharts` / `closeCharts`
- **G** toggles ledger; **Esc** closes ledger before inspect/bench exit
- Bottom bar **ledger** button + WEB panel **open ledger** button
- Tests: `tests/sim-charts.test.ts`

### Smoke checklist (`?sim=1`)

1. Open World-Lab — bottom bar shows **ledger** beside **web**
2. Place a plant kind → **Step** a few times → open **web** panel
3. Click **open ledger** — full charts panel appears (population lines, biomes, food web)
4. **G** toggles ledger closed/open
5. With ledger open, **Esc** closes ledger only (stays on bench)
6. With ledger closed and a critter/plant inspected, **Esc** clears inspect first
7. With nothing open, **Esc** returns to island
8. After inviting a cloud and stepping, ledger swarm chart shows match % curves
9. Main island **G** unchanged (still island ledger, not bench)

### Non-goals (A)

- Energy series inside SVG swarm chart (match % only, parity with main)
- Persisting chart open state across reload

---

## Milestone B — Mid-session warm

**Status:** implemented  
**Gates:** `npx tsc --noEmit` · full `npx vitest run`

### Ships

- Pure helpers in `src/game/midWarm.ts`: `clampWarmTicks`, `runWarmBatches`, cap 50k
- Backtick `#dev` panel: preset warm buttons (300 · 1k · 3k · 10k), custom input + run
- Async yielded batches; progress `warming… N%`; busy lock; HUD flash `warmed N → tick T`
- Ecology scope matches `?warm`: flora.simTick + census.sample + swarmLayer.tick + sampleSwarms only
- Tests: `tests/mid-warm.test.ts`

### Smoke checklist (live island)

1. Start or resume an island (not title screen)
2. Press `` ` `` — dev readout shows numeric stats **and** warm row
3. Click **1k** — progress counts up; tick advances ~1000; UI stays responsive
4. Custom input **500** + **warm** — works; tick advances ~500 more
5. Enter **99999** — clamps to 50k (watch tick jump)
6. Enter **0** or blank — ignored (no warm)
7. While warming, preset/run buttons disabled; duplicate clicks ignored
8. On finish, HUD flashes `warmed N → tick T`; dev readout refreshes
9. Title screen: dev panel may open but warm controls stay disabled

### Non-goals (B)

- Warm from World-Lab (`?sim=1`)
- Changing forge / `?warm` load-time warmth
- Critter/beast/flock simulation during warm
