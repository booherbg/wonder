# Morning report — 2026-07-20 → 07-21

Good morning. Here's the night, in the order you'd play it. Everything below
is on `master`, tests green, unless a section says otherwise. Run `npm run dev`
to play; `npm run report` renders this to HTML.

## The quick wins + the bug (done first, as asked)

**`G` = gather, `F` = sow.** The mnemonic swap. Every surface that names the
keys moved with it — HUD legend, the inspect hint, the bare-bed camp line, and
the field guide. A straight guard swap in the keydown handler; nothing else
changed. *(commit `qol: G=gather, F=sow`)*

**Gatherables show in `inspect` now, with a real pick-up tell.** Leaning close
(`E`) near driftwood / stone / rushes reads e.g. **"driftwood, salt-dried — G
to gather."** And it's *truthful*: it says **"a step closer to gather"** when a
thing is in view but just out of arm's reach. (Turned out `inspect` range was
wider than the gather range — so the old wording could promise a pick-up you
couldn't make yet. Fixed.) *(commit `qol: gatherables show in inspect…`)*

**The stuck deer — fixed, and you called it exactly.** Feeding one raised the
whole kind's trust, so the others tried to potter toward you / the hearth (NW),
away from their beach den — and the straight-line walk there ran into water.
Root cause: the critter mover slides along flat walls but can't round a
*concave* corner (deep water on two sides of a shallow tile), and the homeward
drive kept re-aiming at the same blocked spot with no "I'm stuck" check. Now a
critter that makes no headway steps off the wall toward open ground — a deer
cut off by water **paces the shore** instead of freezing in a corner. The fix
is deterministic (no dice) and only touches genuinely-pinned critters, so the
seeded world is unchanged. Reproduction + regression tests included.
*(commit `fix: critters step off walls…`)*

## The menu (the frame everything hangs on)

`Tab` opens a real **menu** — the thing you asked for, so not everything is a
top-level keypress anymore. It holds:

- **Your backpack** — the seeds in your pouch and the materials you're carrying.
- **The tucked-away doors** — the isles (`L`), the field guide (`?`), the
  murmurs (`M`), the journal (`J`), a postcard (`P`), name this world (`N`).
  Each row still names its shortcut, so the menu *teaches* the keys rather than
  hiding them. The direct keys all still work.
- **Your camp** (only when you're standing in it) — what the bed grows, what's
  built, who's settled; the buildable actions shown as goals — **"make a fire —
  4 driftwood · 3 stones"**, greyed until you can afford it, quoting the true
  costs from the code so they can never drift; and a deliberate, two-click
  **"abandon camp."**

The HUD legend slimmed to the immediate verbs + `Tab menu`, since the menu now
holds the rest. Building a fire/bedroll from the menu and from `H` share one
code path, so they can't disagree. *(commits `feat: pure menu…`, `feat: #menu
panel…`, `feat: Tab opens the menu…`, `docs: field guide names the Tab menu`)*

> Open question I took a lean on: I folded the "secondary actions" (postcards,
> name) into the one menu rather than a separate menu — simpler, one place.
> Easy to split later if you'd rather. And I **deferred** the growing camp-zone
> radius (§2) behind the menu frame — it wants its own render pass; the menu is
> the thing soil/felling/composter all hang off, so it went first.

## "Make sure things don't collapse" — they don't

I ran real islands for ~4.5 hours of island-time each (8000 ticks) with critters
grazing and dispersing, and watched the numbers:

| seed | plants (start → end, min) | living kinds (start → end) |
|------|---------------------------|----------------------------|
| 20 "Quipoltris" (53% water) | 8017 → 8789 (never below 8017) | 26 → 32 |
| 2438 "Polpol Skerry" | 7319 → 8754 | 23 → 24 |
| 1 "Fenfen Reach" | 8064 → 8787 | 22 → 28 |

The finite-space balancer holds: every island fills to its lush ceiling
(~8800) and *stays*, biodiversity holding or **rising**. No boom-bust. I left a
lean regression test (`tests/ecology-holds.test.ts`) so a future tuning change
can't quietly turn the peaceful sim into a crashing one.

## A little fractal deepening (the observation lab)

A critter's **spreader-vs-grazer role** is now a visible tell on its inspect
card — "a spreader — its visits carry a favorite's seed to new ground" /
"a grazer — it crops what it favors." It was a hidden value that decides
whether a visit *plants or crops*; in the sandbox (all info shown) it earns a
line, per the discoverability rule. It's also the quiet reason an island's
flora leans, over its days, toward what its spreaders love — and it's exactly
what the byproduct chains (below) ride on. *(commit `feat: a critter's
spreader/grazer role…`)*

## Design B — byproduct chains & seed search  *(status below)*

<!-- FINALIZE: design B integration result -->
The big ecology layer built in parallel tonight. One new primitive — a
transient, trait-tagged **substrate** (a byproduct a spreader drops where it
feeds) — lets multi-organism life-cycle chains self-assemble from the seed, and
turns "sail to a new island" into a search with a minimum-diversity floor.
**It's behind an A/B checkbox** (`wander.chains`, default on) exactly as you
asked — flip it off (`?chains=0`) to compare, "in case it's a disaster." Full
status and how-to filled in once it's integrated and verified.

## Decisions waiting for you

<!-- FINALIZE: merge with Fable audit's ideas -->
1. **Menu:** secondary actions folded into the one menu — keep, or split
   postcards/name into their own?
2. **Camp-zone growth** (deferred): purely a cosmetic radius, or does a bigger
   camp *do* more (draw critters, protect plants)?
3. **The home-lab loop next** (soil dig+carry → off-habitat planting →
   composter → felling/clearing → an origin story for starting supplies) — all
   want the menu as their home, which now exists.

## The Fable art/ideas audit

<!-- FINALIZE: paste Fable audit findings -->
Running a fresh Fable pass over the whole game for details, ideas, and art
direction — findings folded in here and into `docs/ideas.md`.
