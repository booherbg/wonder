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

## Design B — byproduct chains & seed search  *(shipped, behind the A/B toggle)*

The big ecology layer. Built in parallel overnight (Fable in a worktree, I
verified independently and integrated), now on `master` — **all 320 tests
green, tsc clean, build succeeds.**

**What it does.** One new primitive: a transient, trait-tagged **substrate** —
a byproduct a *spreader* drops where it feeds, carrying the eaten plant's
hue/glow/form. Some species are **substrate-feeders** (rolled at generation,
biased to pioneers like moss/fungus/spore-stalks); they germinate on a
hue-matching substrate. Closure falls out for free: a germinated plant is
ordinary — eaten in turn, it drops its own byproduct. So **multi-step
life-cycle chains self-assemble from the seed, different every island**, no
authored chains. And "sail to a new island" (`R`) is now a **search**: it rolls
candidate seeds and keeps the first that clears a minimum-diversity floor, so
you're never dropped on a barren rock — with `?frontier` for a deliberately
sparse builder's canvas.

**The A/B checkbox you asked for.** `wander.chains`, **default on**. Add
`?chains=0` to turn the whole layer off (byte-identical to before — I checked)
and `?chains=1` back on; the choice persists. So you can compare, or kill it
"in case it's a disaster."

**Does it stay stable?** Yes — I re-ran the long collapse check with chains ON:
islands hold at the ~8800 ceiling (never crash), biodiversity holds or grows
(seed 20: 26→29 kinds, seed 1: 22→27), **hundreds of germinations** fire over a
run (seed 2438: 613), and substrate load stays tiny (peak ~40, bounded by
decay). The monoculture-amplification risk didn't materialize — per-tile caps
and multiple feeders per role keep it balanced. (The disease-on-monoculture
balancer stays its natural future pair, but the sim doesn't need it to hold.)

**How to watch it.** The dev readout (backtick) has a new line — e.g.
**`chains: 11 substrates · 2 sprouted · score 44`**. Substrates render as faint
tinted ground patches near where spreaders fed; germination is watchable (a
feeder creeps out where a critter has been), and the journal records it when
you're still and near. **Demo seed: 2438 "Polpol Skerry" — diversity score 44
(legendary), 41 germinations with full closure; the flat seed 42 scores ~2, no
chains.** Emergence tracks the seed, exactly as intended.

> One judgment call to flag: the diversity *score* (the gen-time seed-search
> heuristic) is habitat-blind — faithful to the study the spec calibrates the
> floor against (its numbers are habitat-blind, and the plan's literal "match
> habitat" clause contradicted its own `floor=5`). It's a ranking heuristic
> only; **actual in-sim germination still respects habitat**, and the emergence
> test proves real habitat-enforced chains separately. Documented in
> `src/life/foodweb.ts`.

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
