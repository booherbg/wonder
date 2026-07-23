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
  - **5a — persistence** (touches the REAL save format; higher stakes): **~90% done** on branch
    `sim-slice5a`. Tasks 1–8 complete + reviewed. **Task 9 (save/load-slot UI) was in flight when this
    doc was written; Task 10 (verify + doc) not started.** NOT yet merged to master.
  - **5b — ambient bench** (Simulator-only; lower stakes): **not started.** Plan written,
    pre-flight-reviewed, and patched — ready to execute cold.

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

## 5a — FINISH IT (highest priority; ~90% done)

Branch `sim-slice5a`, base off master `80efeaf`. Commits so far `c761b64..4c8e2b1` (Tasks 1–8, all
reviewed). **Stage 1 (Tasks 1–4) already delivers the real-game benefit: animals resume mid-thought +
the critter RNG continues.** Stage 2 (Tasks 5–8) delivers the full Simulator slot save/restore, proven
bit-identical end-to-end (kernel replay test: resume ≡ a continuous run, live flora + all rng streams).

**Remaining:**
- **Task 9 — World-Lab save/load-slot UI** (`src/game/worldlab.ts`). Was in flight at write time; CHECK
  `git log` — if `4c8e2b1` is still HEAD, T9 didn't land; re-dispatch from
  `.superpowers/sdd/task-9-brief.md`. DOM-wiring task: no unit harness, gate on check + full suite +
  screenshot (`node scripts/shot.mjs "sim=1&slots=1" shots/qa3/slots.png 3500 1400 950`, open it).
  Wires `packSim`/`restoreSim`/slot-storage (from `src/game/simSave.ts`) into a save button (prompt for
  a name, mirror `nameWorld()`) + a slot picker (mirror the isle picker). Must call `syncKeySeq(entries)`
  after restoring the drawer.
- **Task 10 — full verify + guards + doc note** (`.superpowers/sdd/task-10-brief.md`). Confirms
  determinism/peaceful/mode-isolation guards, `npm run build` clean, and adds a tech-doc §17 for slice 5a
  in `docs/superpowers/2026-07-22-plant-insect-ecology-tech.md` (mirror the existing §13–§16 style).
- **Then:** broad whole-branch review (opus) with `scripts/review-package $(git merge-base master
  sim-slice5a) sim-slice5a`; fix findings; `git checkout master && git merge --ff-only sim-slice5a &&
  git push origin master`; delete the branch; update this handoff + memory.

**5a risk notes (things a reviewer already caught — watch for the same class):**
- `flora.ts` `addPlant` gained an opt-in `skipCap` param (restore-only, defaults false) so restore
  REPRODUCES saved plants instead of re-adjudicating them through a (possibly-lowered) per-tile cap —
  a real Critical that was found + fixed (`4c8e2b1`). Real play never passes `skipCap` → byte-identical.
- `packSim` serializes the FULL live `plantSpecies`/`critterSpecies` rosters wholesale (speciated
  daughters have ids beyond a fresh generate; `placeCritter` mutates `den`, `setCritterRole` mutates
  `role`) AND the live `FloraTuning` — do NOT let any future change regenerate rosters from seed.
- `census` is packed but not restored (chart history resets on resume) — a known deferred UX nicety,
  not determinism-critical. Fine to leave.

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
