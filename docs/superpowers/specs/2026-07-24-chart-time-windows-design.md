# Chart time windows + tick labels — design

**Date:** 2026-07-24  
**Status:** approved  
**Surfaces:** Main island ledger (`G`); World-Lab ledger (same `#charts` panel)  
**Out of scope:** Wall-clock axis, drag-zoom, multi-tier downsample, rewriting chart art

---

## Goal

After mid-session warm, the ledger should read as **island-time**: absolute tick marks on the x-axis, and buttons to view **5k / 10k / 50k / 100k / All** recent history — SimCity-style scales on one retained ring.

---

## Locked decisions

| Topic | Choice |
|---|---|
| Retention | One detailed ring; **do not lose** ~100k ticks of history |
| Cadence | Keep main **interval 40** ticks/sample |
| Cap | Main census + swarm match history **2500** samples (~100k ticks) |
| Windows | **5k · 10k · 50k · 100k · All** (tick spans → sample slices) |
| Default window | **All** |
| Labels | Absolute **`tick N`** (left / mid / right when the plot is wide enough) |
| Surfaces | Main + World-Lab via shared `charts.ts` |
| Clamp | If retained history is shorter than the window, show all available and still label real ticks |
| Lab census | Keep denser short lab sampling; same window UI clamps to available points |
| Memory | Counts are tiny vs sprites/heap — cap 2500 is intentional headroom, not multi-res compression |

---

## Behavior

### Retention
- `CensusLog` default cap: **2500** (was 100).
- Main `SWARM_HISTORY_CAP`: **2500** (was 100).
- Expose `lastTick` (and interval) so charts can reconstruct sample times: sample `i` of length `n` ending at `lastTick` is at `lastTick - (n - 1 - i) * interval`.
- `restore()` must recover a usable `lastTick` (e.g. from the newest peakTick / firstTick + counts length × interval) so labels work after load.

### View model
- `ChartsView` gains: `sampleInterval`, `lastTick`, and enough series length to cover retained history (builders already pad/right-align).
- Chart panel holds a **window** selection (module state is fine): `5_000 | 10_000 | 50_000 | 100_000 | "all"`.
- Slicing: convert window ticks → `samples = ceil(ticks / interval)` (or full length for All); take the **rightmost** N samples of each series (aligned to “now”).
- Re-render on window click without rebuilding sim state; builders may pass full series once per open/refresh.

### X-axis
- Replace `"first log"` / `"now"` with tick labels derived from the **visible** window’s first/mid/last sample ticks.
- Format: `tick 46,000` style (locale grouping); shorten to `t 46000` only if space forces it — prefer full `tick N` on left/right, mid when ≥3 labels fit.
- Apply to **population** and **swarm match** SVGs.

### UI
- Row of window buttons under the chart head (or above the population section): `5k` `10k` `50k` `100k` `All`, active state styled like other codex controls.
- Switching windows re-draws both time-series charts with the same window.

---

## Non-goals

- Changing forge/`?warm` behavior
- Persisting the selected window across reloads
- Per-sample tick arrays in saves (infer from lastTick + interval)
- World-Lab matching main’s 40-tick cadence

---

## Success criteria

1. After a long warm, **All** shows the full retained ring with real tick labels at the ends.
2. **5k** zooms to the recent ~5k ticks; labels update; lines right-aligned to now.
3. Cap 2500 / interval 40: ~100k ticks retained before oldest samples drop.
4. Main and lab ledgers share the control; lab clamps cleanly on short histories.
5. `tsc` + vitest green; existing chart/census tests updated.

---

## Phasing

| Step | Ships |
|---|---|
| 1 | Census cap + lastTick exposure + restore fix; swarm cap |
| 2 | Pure window-slice + tick-label helpers + tests |
| 3 | Wire into `charts.ts` SVG + window buttons; main/lab builders pass interval/lastTick |
