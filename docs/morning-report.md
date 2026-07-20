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

## Then you woke and pushed — findable materials, and a world you can *read*

You hit two walls and named a third, so I turned to them:

**"Where are the stones? no wood in forests." — fixed.** Wood was beach-only and
stone was rock-edge-only, so a low-rock island could have *no* stone source and
a fire couldn't be built at all. Now stone comes from **shore cobbles** (every
coast), **scree**, **waterfall spray**, and rock/cliff edges; wood includes
**fallen wood on the forest floor**. A test guards it: every island (9 seeds)
has at least a fire's worth of both. And it reads right now — forest wood says
"fallen wood," not "driftwood."

**"I have no idea what's going on — insight, man." — the big one.** You were
right that the chain *data* meant nothing to a player. So there's now a real
comprehension layer, built to your four verbs (see / understand / find /
witness):

- **The living web (`C`)** — a *graphical* chain explorer. Each chain is drawn
  from the **actual sprites** you meet — [that critter] → [that plant] → [that
  feeder] — with plain-language arrows ("eats it & scatters the seed", "its
  leavings let this sprout"), a one-line "what a chain is" primer, every plant
  node grounded with **where it lives and how many are here now**, loops marked
  "↺ the loop closes", and **● firing now** on the chains that are live this
  moment so you know where to walk and watch one close.
- **The dev readout (`` ` ``)** — the raw data you love: `web: score 44 ·
  legendary`, then `38 links · 33 close the loop · 4.2× backup per source`, then
  the actual named chains, plus live substrate/germination counts.
- **The seed-label** now carries a viability word — *"a legendary web"* / *"a
  living web"* / *"a flat web"* — so the instant you arrive you know whether you
  sailed somewhere alive or somewhere to build up yourself.
- **The field guide (`?`)** gained a **"the living web"** chapter that teaches
  it in plain words — spreaders vs grazers, what a chain is, why the critters
  move (food by day, den by dark, curiosity toward a still watcher — nothing
  hunts, nothing starves), and that your camp is a garden bed you sow to draw a
  kind to settle. And a critter's **spreader/grazer role** now shows on its
  inspect card.

## Roadmap — what I'd build next (co-designing this with you)

You set the compass: **SimCity / Civ / Factorio — more data, more charts, more
insight, and the system legible *and* manipulable.** Tonight built the *reading*
layer; here's the *agency + depth* layer I'm driving toward, most-wanted first:

1. **Soil & planting freedom** — ✅ **SHIPPED tonight** (Fable built it, I
   verified + integrated; 338 tests green). **`T`** digs a clod of soil from
   plain ground into your pack; **`B`** lays it to till the tile in front of
   you; **`F`** then sows *any* seed on tilled ground, off its usual habitat.
   So you can till a patch by your fire, plant a critter's favorite food, and
   coax its kind to settle — the observation-lab loop, unblocked. Soil persists
   across reloads, and crucially the **wild sim still respects habitat** (only
   your own hand plants off-habitat; drift and reseeding can't). This was #1 on
   your list; the rest below is still ahead:
2. **Clearing & sculpting** — fell/remove plants to clear a garden zone around
   camp (you asked "how do I remove plants, sculpt the area?"). The first step of
   real terraforming.
3. **The camp as a *place*** — right now "the bed's just sitting there." A
   shelter/house that takes shape as you build, a camp zone that visibly grows
   with your fire, denned critters clustering in — the base made to *look* like
   the home-lab it is.
4. **A charts dashboard** — the census as real graphs: population lines per kind
   over island-time, arose/lost, the web's chain-count trend, biome makeup.
   "More charts = fancy pantsy." A data panel beyond the dev readout.
5. **The chain explorer v2 — witnessing** — mark the chains you've *personally
   seen* close (vs. merely latent); click a node to point the camera at the
   nearest one; filter to "chains running through my camp." Turns the panel from
   a readout into a logbook of what you've discovered.
6. **An origin story** — a crashed boat / varied arrivals seeding a few starting
   supplies, giving felling/clearing its means.

Open calls I took leans on (say the word to change them): secondary actions
(postcards/name) folded into the one Tab menu rather than a separate one; the
camp-zone-growth is cosmetic-first (radius grows with building) rather than
mechanical, for now.

## The Fable art/ideas audit — the true-end pass

A fresh Fable agent played across seeds/day-night/panels and read the whole
codebase. Its headline, which I think is dead right: **the engine and the
poetry are already here in abundance — the work now is *surfacing* it.** And
most of the wins are cheap because the data and even the functions already
exist and just aren't wired to the player. It also **caught a real bug, which
I fixed tonight** (the "● firing now" flag over-promised — now it mirrors the
germination rule, so ● means a chain you can actually go watch close).

**The four highest-leverage moves (all mostly-existing pieces):**

1. **Promote the data you already compute.** `CensusLog` (`src/life/census.ts`)
   already stores full per-species population history, peaks, arose/lost — it's
   rendered only as tiny unicode sparklines in the *debug* overlay. Build a real
   **charts dashboard** (population lines over island-time, biome makeup, the
   web's chain-count trend) opened from the menu. And the gorgeous full-colour
   island map already exists as `?overview` — **promote it into a real
   in-journal map** (the fog map is a near-black void with `SIGHT=2` on a
   300×300 island). This *is* your "more charts / more map = fancy pantsy," and
   it's mostly wiring over data that's already there.
2. **Dawn/dusk + lift the meadow off flat.** Day↔night is a single blue multiply
   — no golden hour; and the commonest meadow plant (a gold tussock) tiles
   near-identically so fields read "stamped." Cheap fixes: per-instance
   mirror/jitter/±size in the entity pass (`renderer.ts`), low-frequency tonal
   variation on the ground, and a dawn/dusk colour grade in `daynight.ts` +
   `renderer.ts` (the single biggest beauty win). Warmed islands are already
   markedly prettier than fresh tick-2 ones — a small default warm-up would let
   new players meet the rich version.
3. **Give the camp a body and a reason** — "the bed's just sitting there" is
   literally true (a 0.22-alpha square). Grow a visible silhouette as you build
   (lean-to → tent → cabin), unify the bed's look with the crisp tilled-soil
   patch, and make the fire/bed *do* something legible (a homecoming "what
   changed while I was away" card, a growing draw-radius).
4. **Behavior/heat overlays** — the sim knows each critter's drive, substrate
   hotspots, per-species density, trust; none of it shows spatially. A toggleable
   overlay set would make the ecology click at island scale.

**Also flagged (cheap, high-value):** an uproot/clear verb — `flora.removePlant`
already exists, there's just no key for it (this is roadmap item 2, nearly
free); a **lost-species elegy** to match the ✧ arrival trace; a shore/foam line
where sand meets water (the least-finished surface); the wanderer doesn't
animate (a 2-frame bob); genetic pollination (two same-species neighbours cross)
as the gardening-depth pairing for soil + charts. Rough edges: the fog map never
fills, `?overview` renders only ~60% wide, and the seed-label wraps mid-phrase at
some widths.

Full report (all findings, ranked, with file pointers and shot references) is in
the audit agent's transcript; the top items above are folded into the roadmap.
Its verdict: *"four moves would transform the feel with mostly-existing pieces —
promote the census into charts and the overview into a map, grade dawn/dusk and
lift the meadow, give the camp a body and a reason, and let the ● mean what it
says."* (The last is done.)

## Late additions (after the report, still you-and-me at the keyboard)

- **A corner minimap** (`K` toggles it) — a little island map top-right in the
  overview colours, with a **★ for your camp** and a dot for you. First bite of
  the audit's "give the player a real map," and an answer to "how do I find
  things." Cheap: the overview inks once per island to an offscreen canvas and
  is blitted each frame.
- **This report is now HTML** — `npm run report` renders `docs/morning-report.md`
  → `docs/morning-report.html`; I taught the renderer tables, blockquotes, and
  numbered lists so it all lands in the dark theme.
- **Reloading, answered:** you *can* return to a saved island (the isle picker,
  `L` / the Tab menu), and for the home-lab that's the intended loop — camp,
  tilled soil, drifted flora, settled critters, trust, name and time all
  persist, and the island **ages while you're away**. `R` is for a fresh seed.
  The thing that'd make returning sing — a "what changed while you were away"
  homecoming card — is on the roadmap.
