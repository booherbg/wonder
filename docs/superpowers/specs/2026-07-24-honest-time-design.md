# Honest time (census cadence + live richness) — design

**Date:** 2026-07-24  
**Status:** approved (brainstorm)  
**Surfaces:** Main island census + ledger (`G`); World-Lab ledger richness tile; load warm path  
**Ship order:** Track B — **after** forge life density (Track D)  
**Depends on:** Chart time windows (shipped) — windows/labels stay; this updates cadence, retention, warm sampling, richness, and SVG draw  
**Out of scope:** B4–B8 (map layers, V overlay, web/inspect polish, lab z-order); wall-clock axis; multi-resolution rings

---

## Goal

The ledger should tell the truth about **island-time in play and in warm**: enough samples to draw a curve in a short session, enough retention to still see the beginning after a long warm, the swarm boom visible on the plant chart, and richness that reflects **living** kinds — especially on empty/thin islands from Track D.

---

## Locked decisions

| Topic | Choice |
|---|---|
| Main sample interval | **10** ticks (was 40) |
| Main census cap | **50 000** samples (~500k ticks at interval 10) |
| Swarm match history | Same interval + cap as census |
| Lab census | Unchanged denser short ring |
| Chart windows | Keep **5k · 10k · 50k · 100k · All** (tick spans → sample slices) |
| SVG paths | **Downsample** to plot resolution after window slice (~200–700 points) |
| Load swarm warm | Call **`census.sample`** each swarm-warm step (parity with mid-warm) |
| Richness (main + lab ledger) | Score only species with **live count > 0** |
| Memory | Cap 50k accepted; draw must not emit 50k-point path strings |

---

## Behavior

### B1 — Cadence + retention
- `CENSUS_DEFAULT_INTERVAL = 10`, `CENSUS_DEFAULT_CAP = 50000`.
- Main `SWARM_SAMPLE_INTERVAL` / `SWARM_HISTORY_CAP` match.
- Window math already uses `sampleInterval`; 5k ticks → 500 samples at interval 10, etc. Update tests that hard-code 40 / 2500.
- Supersedes retention numbers in `2026-07-24-chart-time-windows-design.md` (windows/labels unchanged).

### B2 — Load swarm-warm sampling
- After flora warm, the swarm warm loop currently ticks swarms + `sampleSwarms` only.
- Also call `census.sample(flora.tick, flora.speciesCounts)` on that cadence so plant series include the pollination boom.
- Mid-warm / heartbeat paths already sample census; leave them correct.

### B3 — Live richness
- When building ledger / chain score for display: filter plant (and critter, if included) species to those with live population > 0 before `chainStats` / `richnessMeter` / `richnessWord`.
- Reuse the lab strip’s live-filter approach so main and lab **ledger** agree with “what’s alive,” not latent defs.
- Empty island → flat/sparse (or equivalent low word), never “RICH” off an unused roster.

### Chart draw downsample
- `populationChart` / `swarmChart`: after `viewForWindow`, downsample each series to ~plot width before building path `d`.
- Prefer existing `downsample` in `census.ts` (or a thin chart helper). Axis tick labels still use full visible sample endpoints via `tickAtIndex` (first/last of the **window**, not the decimated polyline interior).

### Performance notes (validated in brainstorm)
- Holding 50k samples is fine vs heap.
- Emitting 50k-point SVG paths is **not** (~95 ms / ~4 MB for 7 series) — downsample is required, not optional.
- `Array.shift` on a full 50k ring is acceptable for this pass; ring-buffer optimization is a later polish if warm-at-cap hurts.

---

## Non-goals

- Changing World-Lab census interval/cap
- Ecology map overlays, V overlay, web row density, inspect layout, lab z-order (B4–B8)
- Persisting window selection
- Typed-array census storage

---

## Success criteria

1. ~45s of live play produces a **visible curve** on the population chart (not two-point rays).
2. After load warm with swarms, plant series show change **during** the swarm-warm phase, not only a cliff at the end.
3. Construct / island with 0 living kinds: richness tile is low/empty-worded, not rich-from-defs.
4. Opening **All** on a long ring stays responsive (downsample); window buttons still correct.
5. Cap 50k / interval 10: ~500k ticks retained before oldest samples drop.
6. `tsc` + vitest green; census / chart-window / sim-charts tests updated.

---

## Phasing

| Step | Ships |
|---|---|
| 1 | Interval 10 + cap 50k + swarm match; tests |
| 2 | Load swarm-warm calls `census.sample` |
| 3 | Live richness filter on main + lab ledger builders |
| 4 | SVG downsample after window slice |
| 5 | Verify short play + long warm + empty life=0 |

---

## Follow-ons

- Track A (touch/mobile)
- Track C (pressures / tools in the world) — discuss separately
- Optional: ring buffer if shift cost shows up in profiling
