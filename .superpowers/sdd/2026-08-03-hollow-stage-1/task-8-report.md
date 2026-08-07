# Task 8 report: growth as animation

Status: DONE, with one visual check not fully performed (see below).

Commit: d25c5dc "feat(render): plants grow into their size instead of appearing at it"
(branch hollow-stage-1).

Files: created `src/render/growth.ts`, `tests/growth.test.ts`; modified
`src/render/renderer.ts` (Scene.floraTick/matureAge, plant-loop transform),
`src/game/main.ts` (passes `floraTick: flora.tick, matureAge: flora.tuning.matureAge`
into the Scene at the one `renderer.draw(...)` call site).

## Implementation

`growthScale(ageTicks, matureAge)` — smoothstep from a 0.18 sprout floor to 1 over
`matureAge` ticks, clamped, `matureAge <= 0 → 1`. Matches the brief's spec exactly.

Renderer: `grow = scene.floraTick === undefined ? 1 : growthScale(scene.floraTick - p.born, scene.matureAge ?? 20)`.
`ctx.save/translate/scale/translate/restore` is applied **only when `grow < 1`**
(scale about `(dx + sprite.width/2, dy + sprite.height)`, the sprite's base) —
after a burn-in most plants are already mature, so this is a small minority of
plants per frame, keeping the save/restore cost off the common path. No opacity
easing added — scale alone is the brief's spec and is cheap; opacity would add a
second per-plant state change for a visual difference I judged not worth it.

## Suite

`npm run check` clean. `npm test`: 128 files, 771 tests passed (was 766 before
this task's 5 new tests).

## Always-1 substitution (test-quality check)

Replaced `growthScale` body with `return 1` and reran `tests/growth.test.ts`:
- FAILS: "starts visible but small" (expected <0.35, got 1) — this is the one test
  that actually exercises the growth behavior.
- STILL PASS: "reaches full size at maturity", "is monotonic", "zero maturity age",
  "never outside [0.18,1]" — 4 of 5 growth tests are satisfied by a constant 1.
- Full suite rerun with the stub: 1 failed, 770 passed (127/128 files) — no test
  outside `growth.test.ts` noticed the renderer wiring change at all. There is no
  test that exercises `renderer.ts`'s use of `growthScale` via the Scene/floraTick
  path — coverage of the wiring itself, as opposed to the pure function, is absent.
  Reported plainly rather than implied.
Restored the real implementation afterward; `growth.test.ts` back to 5/5 passing.

## Addendum: `?hollow` dev aid + completed visual checks

Added `FORCE_HOLLOW` in `src/game/main.ts`, same style/placement as `FORCE_NIGHT`
etc. (line ~99): `?hollow` (optionally `&seed=N`) generates a Hollow directly on
load via the same `generateHollow()` path the forge uses, bypassing forge UI. This
is a permanent dev aid, not scaffolding.

Renderer wiring (floraTick/matureAge → `growthScale` → the per-plant transform)
is verified **visually, not by test** — no automated test exercises this path.

1. Classic (`?seed=55`, screenshots at 0.5 s and 60 s, same seed/camera, saved to
   scratchpad not committed): between the two frames, several small plants
   present at 60 s (e.g. a red-cap sprout near the top edge, a purple flower
   cluster at the shoreline) are absent or not yet visible at 0.5 s — new growth
   is appearing over time rather than the island being static, consistent with
   plants easing up rather than popping in at full size. I did not track a single
   plant frame-by-frame inside the browser (i.e., did not confirm continuous
   size interpolation, only presence/absence across two snapshots) — CONFIRMED
   with that caveat.
2. Hollow (`?hollow&seed=11`, `docs/shots/hollow-growth.png`): the island reads
   as an established forest — dense mature dark-blue/purple canopy dominates —
   with a visible minority of small saplings and low sprigs in the sandy/verge
   area near the burrow. That matches the coordinator's measured 30.7% still
   growing / 15.2% under half size: mixed age structure, not a uniform seedling
   field. CONFIRMED.
3. `docs/shots/hollow-growth.png` replaced with the `?hollow&seed=11` frame
   described above (previous Classic single-frame smoke shot discarded).

## Concerns

- No test asserts the Scene→renderer wiring (floraTick/matureAge threaded through
  to the transform); coverage is limited to the pure `growthScale` function, and
  the wiring is verified by the two visual checks above instead.
- The Classic check compared two static screenshots rather than observing
  continuous animation in a live browser session; it shows new growth appearing
  but does not directly show a single plant's scale increasing smoothly frame to
  frame.
