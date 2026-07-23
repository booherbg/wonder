# Handoff — Simulator Slice 5 (persistence + ambient bench)

**Written:** 2026-07-23, mid-execution, as cutoff insurance. **Author:** the prior agent (Claude Opus 4.8, 1M ctx).
**For:** whoever picks up slice 5 next (an agent with more usage budget).

This doc is the single source of truth for resuming. It is deliberately self-contained: read it,
read the ledger, `git log`, and you can continue cold. **Trust the ledger + git over any recollection.**

---

## TL;DR — where things stand

- **Shipped & live on `master`** (blainebooher.com/wonder/ auto-deploys from master push): the whole
  Simulator **slices 1–4** (playable core, shaping brushes, species lab, evolutionary layer) + **5 QA
  passes** + all their fixes. Nothing about that is pending. Last relevant master commit: `80efeaf`
  (tech-doc §16). Do not redo any of it.
- **Slice 5 = "frame & persistence"** — the remaining spec-v1 scope. Blaine explicitly chose **"build
  slice 5 fully"** (persistence AND the ambient bench). It splits into two independent sub-slices:
  - **5a — persistence** (touches the REAL save format; higher stakes): **DONE + SHIPPED to master**
    (commit `60af5bd`, deployed). All 10 tasks complete, reviewed, broad-reviewed READY TO MERGE, all
    guards held. Two harmless follow-ups logged below (M1/M2) — NOT blockers, optional polish.
  - **5b — ambient bench** (Simulator-only; lower stakes): **NOT STARTED — this is all that remains.**
    Plan written, pre-flight-reviewed, and patched — ready to execute cold on a fresh `sim-slice5b`
    branch off master. **START HERE.**

## The two plans (already written, pre-flight-reviewed, patched — execute as-is)

- `docs/superpowers/plans/2026-07-23-simulator-slice5a-persistence.md` — 10 tasks, two stages.
- `docs/superpowers/plans/2026-07-23-simulator-slice5b-ambient-bench.md` — 7 tasks, two stages + a
  documented deferral (bird role).

Both were adversarially pre-flight-reviewed and the plan defects were patched back in (see "why the
plans are trustworthy" below). **Follow them task-by-task; the exact code is in each task.**

## The process (superpowers:subagent-driven-development)

This is how every task on this branch was built; keep doing it:

1. Record the base commit: `git rev-parse --short HEAD`.
2. `scripts/task-brief PLAN_FILE N` → writes `.superpowers/sdd/task-N-brief.md`, prints the path.
   Script dir: `/Users/blaine/.claude/plugins/cache/claude-plugins-official/superpowers/6.1.1/skills/subagent-driven-development/scripts/`
3. Dispatch a **fresh implementer subagent** (Agent tool, model `sonnet` for most; the plan text has
   the full code so implementers transcribe + test). Hand it: the brief path, one line of scene-setting,
   any cross-task interface facts it can't know, the report path. Do NOT paste plan/history into the prompt.
4. On DONE: `scripts/review-package BASE HEAD` → writes a diff file; dispatch a **task reviewer**
   subagent with the brief + report + diff paths + the binding constraints (below). Use `opus` for the
   riskiest reviews (determinism, real-save format), `sonnet` otherwise.
5. Fix Critical/Important findings via a fix subagent; re-verify; mark the task complete in the ledger
   (`.superpowers/sdd/progress.md`) with `Task N: complete (commits base..head, review clean)`.
6. After all tasks: one **broad whole-branch review** (opus), then ff-merge the branch to master + push.

**Ledger:** `.superpowers/sdd/progress.md` (git-ignored scratch) has the full per-task record. Read it
first. `.superpowers/sdd/slice5a-facts.md` + `slice5b-facts.md` are the research the plans were built
from (exact file:line refs — invaluable, but line numbers have DRIFTED; grep the anchor text).

## BINDING CONSTRAINTS (copy into every reviewer prompt — these are the whole game)

- **Determinism:** no `Math.random`/`Date.now`/`new Date()` in sim/kernel/flora/rng logic. A resumed
  run CONTINUES a stream, never restarts. (`savedAt` epoch-ms in the SAVE path is UI metadata — fine.)
- **Backward-compatible / additive:** every new field on `SavedWorld` is optional (`?:`); absence falls
  back to today's exact behavior. The Task-2 GUARD test (`tests/save.test.ts`) pins legacy critter
  restore byte-for-byte and MUST stay green. No pinned seed / existing save may shift.
- **Real worlds byte-identical:** the shared-file changes (`flora.ts`, `save.ts`, `main.ts`, `core/rng.ts`)
  are all additive and inert for ordinary play. Any new shared-file change must prove this (a guard test
  + reasoning). `?sim=swarm` and no-`?sim` play stay identical.
- **Peaceful:** nothing dies violently; `step()` never births/removes a critter.
- **Commit trailer on EVERY commit:**
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- **Hygiene:** commit files BY NAME (never `git add -A`); screenshots go to `shots/` (rm before merges —
  `shots/` and `scratchpad/` are NOT reliably gitignored); verify `npm run check` + `npx vitest run` +
  `npm run build` before "done". Current test count: **527**.

---

## 5a — SHIPPED (master `60af5bd`, deployed) — reference only

All 10 tasks landed, each implementer→reviewed; the broad whole-branch review (opus) returned READY TO
MERGE with 0 Critical / 0 Important and every binding constraint traced clean (backward-compat with real
player data, bit-identical replay, real-worlds byte-identical, namespace isolation, cross-task seams,
layering, peaceful). Stage 1 (Tasks 1–4) delivers the real-game benefit (animals resume mid-thought +
the critter RNG continues); Stage 2 (Tasks 5–10) delivers the full Simulator slot save/load, proven
bit-identical end-to-end. Nothing here needs doing. Documented in tech-doc §17.

**Two harmless follow-ups the broad review logged (OPTIONAL polish — NOT blockers, safe as shipped):**
- **M1 — real-game `meal` staleness under away-reload.** `main.ts` load order is: restore plants →
  `catchUp` simTicks → `warm` simTicks → *then* `restoreCrittersV2` re-resolves `meal` by index. Those
  simTicks reorder `flora.all` (removePlant swap-pop / addPlant append), so a critter that was mid-nibble
  at save can resolve `meal` to a *different* live plant after a `catchUp>0` reload. Harmless + self-
  correcting (the `flora.all[idx]===meal` guard passes on a valid-but-wrong plant, it grazes one plant,
  then `meal=null`, idle; no crash; peaceful; determinism unaffected — the SIM SLOT re-resolves with no
  intervening tick, so it's exact there). One-line polish if ever wanted: null a restored `meal` when
  `catchUp>0` in the real-game restore path.
- **M2 — `restoreSim` skips the dim check on the UNPAINTED path.** `simSave.ts` compares
  `saved.tiles.length` only when tiles are present (painted); `saved.width/height` are packed but never
  compared. Purely a theoretical cross-version concern (would need `buildConstruct`'s default size to
  change between save and load); cannot occur within one deployed version. One-line polish: also assert
  `saved.width/height` match the rebuilt map on the unpainted path.

**5a design facts worth carrying forward (so 5b or future work doesn't regress them):**
- `flora.ts` `addPlant` has an opt-in `skipCap` param passed `true` ONLY by the restore loop
  (`flora.ts:185`) — real play never passes it → byte-identical. Don't add other `skipCap:true` callers.
- `packSim` serializes the FULL live `plantSpecies`/`critterSpecies` rosters wholesale (speciated
  daughters have ids beyond a fresh generate; `placeCritter` mutates `den`, `setCritterRole` mutates
  `role`) AND the live `FloraTuning` — never regenerate rosters from seed on restore.
- The RNG `.state()` accessor (its seed IS its state) is the resume primitive; the Task-2 GUARD test
  (`tests/save.test.ts`) pins legacy critter restore and MUST stay green through any future save change.

---

## 5b — the ambient bench (not started; the bulk of remaining work)

Plan: `docs/superpowers/plans/2026-07-23-simulator-slice5b-ambient-bench.md`. Simulator-only; **inert in
real play BY CONSTRUCTION** — new `CritterRole` literals can only be assigned inside the Simulator
(`generateCritterSpecies` only ever emits `"grazer"`/`"disperser"`), so `updateCritter`'s new arms are
unreached in ordinary play. Do it on a fresh branch `sim-slice5b` off master AFTER 5a merges.

**Scope (decided from the facts, with Blaine's "build fully"):**
- **Stage 1 (Tasks 1–5):** the ambient tray UI + two CLEAN roles — **pollinator active-cross** (new arm
  calling `flora.pollinateSpread`) and **nutrient-shuttle** (new arm + a `Flora.takeSubstrateNear` helper
  + `carriedSubstrate?` field on `Critter`, moving substrate A→B). Both ride the existing
  `Critter`/`CritterRole` machinery; `kernel.setCritterRole` is reused.
- **Stage 2 (Tasks 6–7):** **fish aquatic-grazer** — needs a NEW `fishWalkable` predicate threaded
  through the movement stack (`moveToward`/`stepToward`/`routeToward`/`stepOffWall`) as an INJECTED
  param defaulting to `critterWalkable` (so real play is byte-identical), + placement gated to
  `ShallowWater`. Feeding reuses `flora.nibble`.
- **DEFERRED (documented in the plan):** **bird disperser-on-the-wing** — requires bringing `Flock`
  (`src/life/birds.ts`) into `SimKernel` for the first time + a two-layer isolation guard. A genuinely
  separate architecture step; leave it deferred unless Blaine asks.

**5b risk notes (from the pre-flight review, already patched into the plan):**
- Task 5 must add `ui.setAmbient(...)` to the boot-time catch-up block (~`worldlab.ts:1497`), else the
  tray opens BLANK on first use (the plan's Step 8 has the fix).
- Task 5 must make `critterInspectView` prefer `AMBIENT_ROLES.find(...)?.help ?? roleLine(sp.role)`, else
  a fish is mislabeled "a spreader" (the plan has this as a Step; keep it Simulator-only, don't touch
  shared `render/inspect.ts`).
- Movement-predicate injection: default MUST be the existing `critterWalkable` so real play is unchanged.

---

## Why the plans are trustworthy (context, not required reading)

Each plan was drafted by an Opus agent from a detailed facts doc, then adversarially **pre-flight
reviewed** before any execution, and the found defects were patched back into the plan:
- 5a review found 2 Critical (packWorld doesn't spread `extra`; a load-path NPE) + 3 Important test
  defects — all fixed in the plan before Task 1 ran.
- 5b review found 2 Important (blank tray on boot; fish mislabeled) — patched into Task 5.

So the plans reflect the real code. But the codebase has moved since the facts docs were written — line
numbers drift; grep the quoted anchor text, don't trust absolute line numbers.

## If you get cut off mid-task

Nothing is lost. Each task commits to `sim-slice5a` (or `sim-slice5b`) as it completes. Read
`.superpowers/sdd/progress.md` + `git log --oneline`, find the first task not marked complete, and
resume there. Do NOT re-dispatch completed tasks. If a subagent journal is needed,
`.superpowers/sdd/task-N-report.md` files hold each task's detail.
