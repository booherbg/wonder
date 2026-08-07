# Task 7 report — glow keys off the sky's tint, and motion signatures reach the screen

Status: complete. `npm run check` clean, `npm test` 783 passed / 130 files (was 778;
the five additions are `tests/glow-tint.test.ts`).

Terms used below, defined first:

- **darkness** — `darknessAt(nowMs)`, 0 in daylight rising to `MAX_DARKNESS` 0.75 at
  night. It is the luminance term the renderer dims the scene with.
- **tint** — `tintStrength(nowMs)`, new, in `[0, 1]`: the alpha of the `skyGrade`
  overlay the renderer lays over the scene. It is the colour-cast term.
- **gait** — the `Gait` record from `src/life/motion.ts`: period (ms), amplitude
  (art px), pause fraction, drift (art px), bob phase, darting.
- **art px** — one pixel of the sprite grid. The renderer scales by `SCALE` (3) times
  `zoomLevel` (1 by default), so at default zoom 1 art px = 3 screen px.

## Part A — glow

`tintStrength(nowMs)` added to `src/game/daynight.ts` returning `skyGrade(nowMs).a`.

Renderer changes in `src/render/renderer.ts`:

- `tintNow = tintStrength(timeMs)` computed once beside `darkness`. `timeMs` is the
  sky clock (`sky = performance.now() + skyOffset` at `main.ts:2656`), the same clock
  `darknessAt` is read on, so the two terms are in phase.
- The glower-collection gate changed from `darkness > 0.05` to `tintNow > 0.05`.
- `nightPass` is now driven by `glowDrive = Math.max(darkness, tintNow)`.

Why this is not cosmetic: at 12% into dusk (`sky` = 244 800 ms) the tint is 0.152
while darkness is 0.0311 — a factor of 4.9. The old gate at 0.05 was shut; the new one
is open. At the dusk peak (260 000 ms) tint is 0.42 against darkness 0.375.

### Test quality

`tests/glow-tint.test.ts` carries the four checks from the brief plus a fifth that
exists specifically to kill the null implementation: at 12% into dusk it asserts
`tintStrength > darknessAt * 3` and `tintStrength > 0.05 > darknessAt`. If
`tintStrength` returned `darknessAt`, three of the five tests fail (the alpha-tracking
test, the dusk-peak test, and this one). Verified by reading, not by running a mutant.

## Part B — motion wiring

In `src/render/renderer.ts`:

- `private gaits = new Map<number, Gait>()` on the `Renderer`. `gaitFor` runs once per
  species id, on first sight, then is served from the map — six `hash2d` calls per
  species for the life of the renderer, not per critter per frame.
- Per-individual phase is `hash2d(ci, c.species, 0x6a17)`, `ci` being the critter's
  index in `scene.critters`. That array is fixed after spawn (no `push`, `splice`,
  `pop` or reassignment of `critters` anywhere in `src/game/main.ts` or
  `src/life/fauna.ts`), so the phase is stable for a given individual across frames and
  across reloads of the same seed. Seeded hash, no `Math.random()`.
- The offset is added only inside the `ctx.drawImage` call for the critter sprite. It
  is not written back to `c.x`, `c.y` or anything else; deleting the two added terms
  restores the previous draw exactly, and the simulation reads the same numbers either
  way.

### Is the gait visible at default zoom?

Yes. Measured over the eight species gaits of a fresh island, sampling `motionOffset`
every 20 ms for 8 s:

| species | period (ms) | amplitude (art px) | pause | darting | peak-to-peak lateral (screen px @ zoom 1) |
|---|---|---|---|---|---|
| 0 | 1843 | 1.01 | 0.42 | 0.12 | 6.0 |
| 1 | 2996 | 0.95 | 0.04 | 0.85 | 5.7 |
| 2 | 2525 | 1.02 | 0.24 | 0.27 | 6.1 |
| 3 | 3289 | 1.82 | 0.01 | 0.48 | 10.9 |
| 4 | 3205 | 1.25 | 0.51 | 0.54 | 7.5 |
| 5 | 1196 | 2.56 | 0.41 | 0.79 | 15.4 |
| 6 | 1958 | 1.93 | 0.15 | 0.55 | 11.6 |
| 7 | 2737 | 1.81 | 0.27 | 0.26 | 10.9 |

Range 5.7–15.4 screen px of peak-to-peak lateral travel, against a 3 screen px
rounding quantum. Nothing is sub-pixel. Periods span 1196–3289 ms, pause fractions
0.01–0.51 and darting 0.12–0.85, so the eight kinds differ in rhythm as well as
in reach. Critter sprites are drawn 16 art px wide, above bench 11's 8.5 px crossing
point, so colour is also readable at this zoom — motion adds to the tell rather than
carrying it alone.

## Visual checks

Run headless with `npm run shot`, Chromium, 960×640 at deviceScaleFactor 2,
`?seed=7&sky=244800&hollow=1&nomenu=1`, 4 s of warm-up. `sky=244800` is 12% into dusk,
where the tint is 0.152 and darkness 0.0311.

1. **Glow at dusk while the sky is still warm — confirmed, before/after.** With the
   change stashed out, the same frame shows zero glow halos: darkness 0.0311 is under
   the old 0.05 gate. With the change in, nine warm halos are visible over the sand
   and the shore plants while the sky is still light and warm-cast. Files:
   `docs/shots/hollow-dusk.png` (after) against the stashed run kept only in scratch.
2. **Critters draw with the offset applied, but the rhythm was not isolated.** The
   wired build renders critters cleanly, with no clipping or jitter artefacts, and a
   crop of the same critter cluster differs by a few pixels between a wired run and a
   run with `motionOffset` forced to `{0,0}`. That comparison is *not* proof: two runs
   of identical code already differ over 0.725% of pixels (timing jitter — the sky
   clock is `performance.now()`), and wired-vs-zeroed differs over 0.922%, which is
   inside the noise. Static screenshots also cannot show rhythm at all. So the claim
   I can support is the numeric one in the table above plus code inspection of a
   three-line draw-site change; I did **not** watch the animation frame by frame, and
   I am not claiming "some darting, some smooth, some pausing" was observed on screen.
3. **Screenshot** saved to `docs/shots/hollow-dusk.png` (960×640 at 2× = 1920×1280).

## Not covered by test

The motion wiring has no test. Per the brief, a canvas harness was not built. The
underlying `motionOffset` is already tested in `src/life/motion.ts`'s suite; what is
untested is that the renderer calls it and adds the result to the sprite position.

## Concerns

1. **The rhythm is unverified in the running game.** See check 2. Someone should open
   `?hollow&sky=244800` and watch for ten seconds before this is called done.
2. **`nightPass` now runs slightly earlier in the cycle** — it fires when
   `max(darkness, tint) > 0.01` rather than `darkness > 0.01`, so it starts a fraction
   of a second into dusk instead of a few seconds in. Its first act is filling the
   viewport with the sky cast at `skyGrade().a`, which is near zero there, so the
   visible change is only the glow. No test asserted on the old boundary; the full
   suite is green.
3. **Phase stability rests on `scene.critters` never being reordered.** I verified no
   mutation of that array exists today. If critter death or spawning is ever added,
   every individual's phase shifts and the group's decorrelation is reshuffled — not a
   crash, but a visible pop. A stable `id` field on `Critter` would remove the risk.
