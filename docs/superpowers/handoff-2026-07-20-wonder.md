# Wonder — handoff (resume here) · 2026-07-20

The latest handoff — supersedes `handoff-2026-07-21.md` (whose one open item, the
in-game map, is now built). This session was a big one: the game was **renamed
Wander → Wonder**, got a **live deploy**, a **controls/UX rework**, a **charts
dashboard**, a **codex art direction** across every panel, and the **Fable
beauty pass**. Commit range: `55986b8..d06ce6e` (all on `master`, all deployed).

Durable facts also live in auto-memory: `wonder-toolbar-rework`,
`wander-ui-art-direction`, `wander-deploy`, `wonder`… (the MEMORY.md index).

## ⭐ START HERE — current state

- **Live at https://blainebooher.com/wonder/.** Every push to `master` runs
  `.github/workflows/deploy.yml` (Vite build → GitHub Pages). Repo:
  github.com/booherbg/wonder (public), default branch `master`. To ship: just push.
- **354 tests green, `tsc` clean.** Verify: `npm test` · `npm run check` ·
  `npm run shot -- "seed=2438" out.png` (headless screenshot; drives keys).
- **The whole toolbar/interact/beauty rework is done and shipped.** No half-built
  feature is sitting in the tree. The working tree is clean.
- Design spec (kept current): `docs/superpowers/specs/2026-07-20-toolbar-and-interact-design.md`.

## What shipped this session (all on master, all live)

1. **`chore:` rename Wander → Wonder** — title, README, package, and the GitHub
   repo. "The wanderer" (the player) and the `wander.*` localStorage keys stay
   (renaming the keys would wipe saves).
2. **`ci:` GitHub Pages deploy** via Actions. `vite.config.ts` uses `base: "./"`
   (relative), so the build runs at the `/wonder/` subpath and off disk.
3. **`feat:` the seed-pouch model + tillable + garden-spread** (`src/game/toolbar.ts`,
   `materials.ts` `isTillable`, `flora.ts` garden-spread). One pouch, one *loaded*
   varietal, **out-means-out** (never auto-advances). A tended (tilled) plot fills
   itself onto adjacent empty tilled tiles, never the wild.
4. **`feat:` one Interact** (`main.ts`) — `Space` acts by the selected slot:
   hand→gather, hoe→till, pouch→plant. `G/F/T/B` + the soil clod are gone. Seeds
   convert to/from the flat save format in main.ts, so `save.ts` is untouched.
5. **`feat:` the island's ledger (`G`)** — census + food-web charts dashboard
   (`src/render/charts.ts`): population-over-time lines (scaled to the kinds,
   dodged labels), diversity tiles, biome bar, named chains.
6. **`feat:` the backpack (`B`)** — a JRPG inventory screen (`src/render/backpack.ts`):
   browse the bank, Enter loads a varietal, Q tosses. Modal (movement blocked).
7. **`feat:` the Tab menu is the codex hub** — restyled + every card (backpack,
   ledger, map, web, isles, journal, murmurs, guide, postcard, name) from one Tab.
8. **The Fable beauty pass:** dawn/dusk colour grade (`daynight.ts skyGrade`);
   meadow lift (per-instance mirror+jitter in `renderer.ts`); camp body
   (lean-to→tent→cabin); island map (`O`, `openIslandMap`); ecology overlay
   (`V`, `drawEcologyOverlay` — drives ringed by `c.mood`, chain hotspots).
9. **Codex art direction** ("naturalist's codex": dark tide ground, mint `#7fe0c4`,
   gold `#f4c979`, serif small-caps + Georgia + mono) across all new panels.
   Interactive preview artifact: https://claude.ai/code/artifact/36d03cee-1422-43c1-ab58-eb0370993766

## The control scheme now (it changed a lot)

- **Move:** WASD / arrows.
- **`Space` = Interact** — hand gathers · hoe tills · pouch plants the loaded seed.
- **`1` `2` `3`** select hand/hoe/pouch; **`[` `]`** / mouse-wheel cycle;
  **`3` again** swaps the loaded varietal; **`Q`** tosses the loaded seed.
- **`E`** examine. **`B`** backpack. **`G`** ledger. **`O`** map. **`V`** ecology
  overlay. **`K`** corner minimap. **`Z`** focus (camera).
- **`Tab`** the menu hub · **`C`** web · **`J`** journal · **`M`** murmurs ·
  **`L`** isles · **`H`** home/build/sleep · **`R`** sail · **`N`** name ·
  **`P`** postcard · **`?`** guide · **`Esc`** close · **`` ` ``** debug.

## Open threads (nothing urgent)

- **`?sky=<ms>` dev param** — Blaine flagged "params for world-state." It's only a
  load-time seed for the `shot.mjs` screenshot harness (sets `skyOffset`); no
  gameplay uses it. Offered to drop it and have the harness set state post-load.
- **A *true* tabbed menu** (inline panel content) vs. today's launcher rows.
- **Camp:** a homecoming "what changed while you were away" card; unify the bed
  visual with the tilled-soil look.
- **Ecology overlay** could add a per-species density heat and a trust layer.
- **The critter drive-rings** (`V`) render for `scene.critters` but weren't caught
  on-screen in a verification shot (no fauna-critter in frame) — worth an eyeball.

## How this project is built

- Vite + TS, canvas render. Sim is pure & unit-tested (`tests/`, vitest); the DOM
  entry `src/game/main.ts` isn't unit-tested — verify it with `npm run shot`.
- The voice is lowercase-poetic; the codex is the UI look. Beauty is a first-class
  goal. Blaine: start small, expand in bursts, act-then-show-evidence.
- Dev-aid query params (via `shot.mjs`): `?seed= ?warm=<ticks> ?sky=<ms>
  (258000 dusk·340000 night·420000 dawn) ?night ?lowtide ?aurora ?focus ?overview`.

## Verify on resume

```
npm test          # 354 green
npm run check     # tsc, clean
npm run shot -- "seed=2438&warm=3000" shots/check.png 3000 1000 700 "Escape,g"
```
