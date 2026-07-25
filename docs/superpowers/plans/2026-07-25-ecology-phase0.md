# Ecology Phase 0 — make the existing genome matter

> **For agentic workers:** Execute task-by-task. TDD for pure helpers. Prefer Composer/Grok subagents for mechanical edits.
>
> **Goal:** Turn flora drift into selection, load two decorative traits, close the first co-adaptation loop, and make the result visible in World-Lab.
>
> **Spec:** `docs/superpowers/specs/2026-07-24-ecology-expansion-audit.md` (Part II §2, §9.1, §10 Phase 0)
>
> **Field guide:** `docs/ecology-report-2026-07-24.html` (Part I for current behaviour; Part II §11 for rationale)
>
> **Ship order:** B1a → B2 → B1b → B3 → B4 → B5 (B1c optional follow-on)

---

## Why this order

| Task | Depends on | Rationale |
|---|---|---|
| **B1a** selective thin (kin only) | — | Smallest proof that genomes affect survival; no new per-tile state |
| **B2** height → shade | — | Independent; unlocks `shadeTerm` and vertical niche |
| **B1b** shadeTerm in fitness | B2 | Completes the fitness function the audit describes |
| **B3** spread → dispersal | — | Independent colonization–competition tradeoff |
| **B4** learned palate | — | Independent fauna loop; needs save plumbing |
| **B5** trait charts | B1–B4 ideally landed | Instrumentation — proves the mechanics moved the needle |
| **B1c** visitTerm (optional) | visit tracking | Nice bonus; not required for Phase 0 close |

**Peaceful contract (non-negotiable):** every change expresses as a *rate* change, never a visible death event. Crowding thin already works this way — selection only changes *who* gets thinned, not *that* thinning happens.

**Determinism:** all decisions draw from existing sim rng streams (`flora.rng`, critter walk rng). No `Math.random` / `Date.now` in sim paths.

**Save format:** additive only. Learned palate must survive load (new optional save fields).

**Surfaces:** mechanics ship in shared `life/` modules → both main island and World-Lab benefit. Trait charts: World-Lab ledger first (`simCharts.ts` / `charts.ts`); main island `G` ledger is a follow-on if cheap.

---

## Global constraints

- Do **not** add entities, roles, or tile types in this phase.
- Do **not** change speciation thresholds, `maxPlants`, or crowding `comfortFraction` defaults (except via the new fitness/rate multipliers).
- Bench-only roles (`pollinator`, `nutrient-shuttle`) stay bench-only; learned palate applies to **island** disperser/grazer/aquatic-grazer visits in real play.
- `npm run check` + `npx vitest run` + `npm run build` green before calling any task done.
- Commit files by name (never `git add -A`).

---

## File map

| File | Role |
|---|---|
| `src/life/flora.ts` | Crowding thin, shade map, spread-scaled dispersal, repro multipliers |
| `src/life/floraFitness.ts` *(new, pure)* | `plantFitness(p, ctx)` — kinTerm, shadeTerm, visitTerm |
| `src/life/fauna.ts` | Palate drift on completed nibble |
| `src/life/census.ts` | Optional trait sampling hook, or parallel `TraitCensus` |
| `src/life/genome.ts` | `driftDistance` unchanged; fitness is separate from speciation |
| `src/game/save.ts` | Persist per-kind palate drift |
| `src/game/main.ts` | Wire trait census sample on heartbeat / warm |
| `src/game/simCharts.ts` | Build trait histogram view model for lab ledger |
| `src/render/charts.ts` | Render hue-distribution SVG (or sparkline bins) |
| `tests/flora-fitness.test.ts` *(new)* | Pure fitness + selective-thin sampling |
| `tests/flora-shade.test.ts` *(new)* | Shade accumulation + repro multiplier |
| `tests/flora-spread.test.ts` *(new)* | Spread scales radius and/or attempt budget |
| `tests/fauna-palate.test.ts` *(new)* | Palate nudge bounded + deterministic |
| `tests/trait-census.test.ts` *(new)* | Histogram sampling + downsample |

---

## Task B1a — Selective crowding thin (kinTerm only)

**What changes:** In `flora.ts` `simTick` crowding block (~L534–542), replace uniform victim pick with **sample k=3, remove lowest fitness**.

**Start without shade/visit terms** — kin penalty only:

```
kinTerm(p) = 1 - penalty * (count of same-species neighbors within kinR tiles with driftDistance < threshold)
```

Reuse existing `driftDistance` from `genome.ts` and speciation's `kinR` / cluster constants where sensible, or define `FITNESS_KIN_RADIUS` / `FITNESS_KIN_THRESHOLD` beside flora tuning.

**Still exempt:** tended plants, species with count ≤ 12 (existing guard).

**Tests:**
- [ ] Given 3 candidates where one has near-identical kin cluster and one is isolated, isolated survives selective thin deterministically (seeded rng).
- [ ] Crowding thin frequency unchanged in expectation when fitness is flat (control: all identical genomes → same as today).

**Acceptance:** Over a long warm on a dense island, mean `driftDistance` within species **decreases** (less redundant kin survives). No new save fields.

---

## Task B2 — height → shade per tile

**What changes:**

1. Maintain `shadeByTile: Float32Array` (or recompute lazily per tick): for each tile, `shade = Σ plant.genome.height` of plants on that tile.
2. For a plant at `(tx, ty)`, compute `shadeAbove` from taller neighbors on the same tile (or canopy model: max height on tile minus own height — pick one model, document in code).
3. Repro multiplier in `simTick`: `repro *= shadeFactor(height, shadeAbove)` where short plants in deep shade reproduce slower and tall plants in open light reproduce faster. Clamp to `[0.2, 1.5]` or similar.

**Update on:** plant add/remove/move (if moves exist), each `simTick` batch, or incrementally — prefer correctness + testability over micro-optimization.

**Tests:**
- [ ] Moss-height plant under tall tree canopy has lower repro multiplier than same genome in open tile.
- [ ] Shade map deterministic across two identical Flora instances.

**Acceptance:** `height` trait measurably affects population outcomes; forests show understory vs canopy dynamics in census (even before B5 charts).

---

## Task B1b — shadeTerm in fitness

**What changes:** Extend `plantFitness` with `shadeTerm(p)` using B2's shade map. Wire into B1a selective thin.

```
shadeTerm(p) = shadeFactor(p.genome.height, shadeAbove(p))
```

**Tests:**
- [ ] Under artificial shade, low-height plant outranks high-height plant for survival (or vice versa per chosen model — test documents the direction).

**Acceptance:** Two coupled mechanisms (repro + survival) both read height; aligns with audit §2.1 + §2.3.

---

## Task B3 — spread governs dispersal distance

**What changes:** In `propagate`, `pollinateSpread`, and `simTick` self-seed placement:

- `radius = baseReseedRadius * lerp(0.6, 1.4, spread)` (tune constants)
- **Tradeoff:** `attempts = round(lerp(8, 4, spread))` OR per-attempt success penalty `*= lerp(1.2, 0.7, spread)` so high spread throws further but lands fewer children.

Use parent plant's `genome.spread` at call site.

**Tests:**
- [ ] High-spread genome places seeds farther from parent (mean tile distance ↑) on fixed seed.
- [ ] High-spread genome has lower successful propagate rate at saturation (tradeoff).

**Acceptance:** Two species on one habitat can coexist longer: local winner vs colonizer pattern visible in play.

---

## Task B4 — Learned palate (critters adapt without birth/death)

**What changes:** On completed nibble in `fauna.ts` (~L859–905), after a successful meal on a **real plant** (disperser / grazer / aquatic-grazer paths, not treat-from-hand):

```ts
// nudge per-kind palate toward eaten genome — slow, bounded
sp.palate.hueCenter = lerpHue(sp.palate.hueCenter, meal.genome.hue, PALATE_LEARN_RATE);
sp.palate.glowTaste = lerp(sp.palate.glowTaste, meal.genome.glow, PALATE_LEARN_RATE);
```

Suggested constants: `PALATE_LEARN_RATE ≈ 0.02–0.05` per meal; clamp hue width unchanged initially.

**Persistence:** Critter **kinds** are re-derived from world seed on load today — drift must be saved.

- [ ] Add optional `palateDrift?: { kindId, hueCenter, glowTaste }[]` to `SavedWorld` (or pack into existing extensibility pattern).
- [ ] Apply on restore after species generation; default absent → worldgen palate.

**Journal / codex (light):** If palate moved > ε from founder, journal inspect may note taste shift (optional polish, not blocking).

**Tests:**
- [ ] 20 nibbles on red plants shift `hueCenter` toward red deterministically.
- [ ] Palate drift round-trips save/load.
- [ ] Bench pollinator role does **not** drift palate (or only island roles — document choice).

**Product decision (locked for this plan):** **learned palate, not fauna reproduction** (audit §12 Q1).

---

## Task B5 — Trait-distribution charts (World-Lab)

**What changes:** The audit's #1 instrumentation gap: population charts show counts, not traits.

1. **Sample:** On census cadence, for each live species with count > 0, record mean hue (or 8-bin hue histogram) from `flora.all` genomes. Store in ring buffer parallel to `CensusLog` — e.g. `TraitTrace { id, hueBins: number[] }` or `{ id, meanHue: number[] }`.
2. **View model:** Extend `ChartsView` / `buildLabChartsView` with per-species hue series.
3. **Render:** New chart section in lab ledger under population: **trait / hue** — stacked or multi-line per species, same time windows (5k/10k/50k/100k/All) and downsample rules as honest-time charts.
4. **Wire:** `worldlab.ts` / `kernel.ts` call `traitCensus.sample(flora)` alongside `census.sample`.

**Tests:**
- [ ] Sampling is deterministic; bin counts sum to species population.
- [ ] Downsampled SVG path point count bounded (reuse chart-window helpers).

**Acceptance:** Run bench with life + warm; hue distribution visibly shifts after B1–B4 land. Without B1–B4, chart is flat drift noise (still valid baseline).

---

## Task B1c — visitTerm (optional, not blocking Phase 0)

**What changes:** Track `lastFedTick` or visit counter on plants when critters nibble or swarms pollinate. `visitTerm(p) = 1 + bonus` if visited within N ticks.

**Defer if:** visit tracking touches too many paths for Phase 0 scope.

---

## Verification checklist (end of Phase 0)

Manual on World-Lab (`?sim=1`, place life, warm 3k–10k, open ledger):

1. [ ] Population curves still sane (no runaway extinction from fitness).
2. [ ] Hue trait chart shows divergence between species / over time.
3. [ ] Subject inspect on critter: palate hue drifts after feeding sessions.
4. [ ] Short plants under tall canopy reproduce slower (dev overlay or logged metric if no UI yet).
5. [ ] High-spread species colonizes empty edge tiles faster than low-spread at equal density.

Automated: full vitest + tsc + build green; add ≥1 test per task file above.

---

## Out of scope (Phase 1+)

- Soil map / second idmap channel
- Insectivore role / local predation
- The Heart / Motes
- Fire, wind, symbiogenesis, epiphytes
- Pollinator *choice* (attention competition) — Phase 0 follow-on, not in this plan
- Rain/season → carrying capacity pulse (audit §6 row 6) — cheap but separate
- Main island `G` trait chart (lab first; port if trivial)

---

## Open questions for Blaine (before B4/B5 polish)

1. **Shade model:** sum heights on tile vs canopy-max? Affects forest readability.
2. **Palate drift in codex:** show founder → current swatch, or journal-only?
3. **Trait chart default:** mean hue per species vs 8-bin histogram per species (histogram is more revealing, busier UI).

---

## Done when

All of B1a, B1b, B2, B3, B4, B5 acceptance criteria met; B1c explicitly deferred or shipped; verification checklist passed; tests green.
