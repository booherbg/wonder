# Wonder — handoff (resume here) · 2026-07-21 (QA + live playtest)

Supersedes `handoff-2026-07-20-wonder.md`. This session was a **full-system UI QA
+ a long live-playtest** with Blaine (he fires findings rapidly; treat it as a
stream). Everything below is **on `master` and deployed** (blainebooher.com/wonder/).
Durable detail + the open design session live in auto-memory
`wonder-playtest-fixes` and `wander-ui-art-direction`.

## ⭐ START HERE — the one big open thread

**The ecology / food-chain design session — deferred, Blaine wants it next.**
Both the boring ledger graph (populations ramp monotonically to carrying capacity,
no swings) and the sparse `V` overlay (only spreaders + substrate-feeders are
wired into chains — grazers, uneaten plants, chainless critters don't participate)
are one root: **the food web is thin and static.** Blaine's vision, verbatim:
*deeper food chains; deep-time simulation; pollinators, insects, fauna all part of
it — "i want each island to feel like it is alive."* Resume via
`superpowers:brainstorming` **from that vision** (don't re-ask it). Reference
`docs/superpowers/specs/ecosystem-vision.md` + memory `wander-ecology-engine`.

## What shipped this session (all on master, all live)

Commit range `5f37d3d..bd4c286`.
- **The codex coherency pass:** a real `:root` design-token layer in `index.html`;
  all 10 panels unified (the 6 flat-mono ones — web/journal/murmurs/isles/guide/
  examine — brought up to the codex). Fixed 5 stale control-hints. Spec:
  `docs/superpowers/specs/2026-07-20-codex-coherency-pass-design.md`.
- **Camp bed** reads as worked/tended earth (dappled, not hoed furrows).
- **Gatherables** (driftwood/stone/rush) now visible day & night (halo + dark rim
  + bright body). `renderer.ts` `scene.materials` block.
- **Critters:** land + **shore-adjacent shallows** only (reach shore food, never
  strand in open sea); **route around obstacles** (`routeToward` BFS in
  `fauna.ts`) instead of grinding.
- **Reachability:** no unreachable islands — `connectLobes` in `generate.ts` wets
  wadeable **shoals** across water and carves **scree passes** through cliff/snow.
- **Bare Rock is now WALKABLE** (only Cliff faces + Snow wall you off).
- **Living-web self-loops** render as one node; **examine card** got codex labels.

## Backlog (offered, not built)
- The **ecology design session** (⭐ above).
- **Tide-pool dwellers** (rose star etc.) as examinable sprite cards, not text notes.
- A dataviz nit: ledger population lines force one lightness, so same-hue species
  collide (`charts.ts` `lineColor`).

## Verify on resume
```
npm run check   # tsc, clean
npx vitest run  # 358 green (67 files)
npm run build   # succeeds
```
Determinism note: generation changed (connectLobes, walkable Rock) — but there are
no whole-map snapshot tests, only property tests, and they hold. Sim/gen use no
`Math.random`/`Date.now`; new logic is pure geometry / seeded streams.
