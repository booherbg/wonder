# The Ecology Ground Engine — data model & build sequence

*Documented 2026-07-18. This is the buildable bridge between
[camp-and-ecology.md](camp-and-ecology.md) Arcs 2–3 and
[ecosystem-vision.md](ecosystem-vision.md). The prior-art research report
lands at `docs/superpowers/research/ecosystem-prior-art.md`; its findings
fill the marked sections. Pillars checked throughout: peaceful; surprise
is a budget; keys stay few; the world doesn't need you; show, don't
commemorate.*

## Direction shift — symbiosis over herbivory (2026-07-18, Blaine's steer)

**The core interaction becomes mutualism, not consumption.** A critter
with a preference visits the plants that match it, and the visit *helps*
the plant — spreads its seed, carries its pollen — while feeding the
critter. Both gain. Co-adaptation is always beneficial: the island drifts
toward harmony, not an arms race. No predator, no lethal danger; the game
stays peaceful by construction.

What this keeps, unchanged: **the palate** (preference = what a critter
visits), **the energy ledger** (a critter still feeds and tires), the
**garden-as-invitation** loop (now purely generative — plant a chord, the
matching fauna assemble *and spread what you planted*), and the pollinator
wisps / cross-pollination already shipped (they were mutualist all along).

What this flips: **the teeth (`458807b`).** A visit stops *consuming* the
plant. Instead it triggers a **propagation** — a drifted seed into a
nearby open tile, if space allows — and feeds the critter. **Shipped
(2026-07-18)**, but as a *disposition split* rather than a wholesale flip:
a later steer kept a thread of friction, so most critters disperse while a
minority still graze. `nibble` stays (the grazer path); `propagate` is the
new mutualist path; the "grazed patch thins then recovers" test stays valid
for grazers and a twin "a visited patch *spreads*" test proves the other
side. See the reframe note under Progress.

The one thing to get right — **balance.** Herbivory self-limits by
negative feedback (overgraze → crash → recovery). Mutualism is *positive*
feedback (more visits → more spread → more food → more visitors) and runs
*toward* saturation. So the restoring force is no longer predation; it is
**finite space** (the per-tile cap, already shipped) **plus saturation**
(a plant spreads only so fast; a tile holds only so many). The island
fills to a lush, blooming ceiling and *holds* there — the drama moves from
boom-bust population swings to **composition and succession**: which
lineages win the tiles, and how the mix co-adapts as fauna preference and
plant drift pull toward each other. Selection stays visible, but as
*matching improving*: a lineage drifting toward what a megafauna favors
gets spread more.

**A size spectrum of mutualists** (uses pieces already in the game): wisps
and moths pollinate locally; small critters disperse seed nearby; the
**beast becomes a gentle megafauna** whose migrations spread what it
favors across the whole island over island-days.

*Everything below was written under the herbivory frame; read it through
this lens. Palate, ledger, drives, discoverability all survive; only the
sign of the plant's outcome changes (help, not harm), and "balance without
a script" now means saturation, not predator-prey.*

## What's already load-bearing

The vision asks for "every critter carries tuning values, the same idea as
the flora genomes." Most of the substrate is shipped:

| Shipped | Role in the ground engine |
| --- | --- |
| Flora genomes, drift, speciation | The tuning-value pattern everything else copies |
| `CritterSpecies` (fauna.ts): body stats + `favoriteSpecies` + den | The seed of diet — currently a species *index*, needs to become *taste over traits* |
| Field journal (auto-entries from inspect) | Becomes the "depends on" edge recorder — the web that draws itself |
| Inspect panel | The read instrument; the bench later becomes the write instrument |
| Home garden + sow + Q toss | The invitation surface — how a player composes a garden chord |
| Away-aging catch-up sim + sleep-to-dawn | "World doesn't need you" is already real for flora |
| Per-tile plant caps in Flora | Carrying capacity — half of a logistic loop, already enforced |
| Materials, tide pools, hoards-to-come | Precedent for "discovered, not crafted" passive stations |

**Gap worth naming:** critters are respawned fresh on every `loadWorld` —
no fauna persistence. Flora remembers; fauna forgets. Anything that makes
individual critters matter (trust, energy, drift) needs them saved.

## 1. The palate — taste over traits, not species indices

`favoriteSpecies: number` can't love a plant it has never met. Replace it
with a **palate**: weights over the genome axes that already exist.

```
palate: {
  form: PlantForm;      // what it knows how to eat
  hueCenter: number;    // 0..1, the color it seeks
  hueWidth: number;     // tolerance around that color
  glowTaste: number;    // -1 avoids glow .. +1 seeks it
}
aversion?: PlantForm;   // one quiet no — walks wide of these
```

One scoring function, `appetite(palate, genome) → 0..1`, replaces every
`p.species === sp.favoriteSpecies` check. `favoriteSpecies` becomes a
*derived* value (best-scoring species present) so nothing downstream
breaks. What this buys, for free:

- A sown or tossed item attracts exactly the critters whose stats match —
  the vision's core loop — with no new systems.
- Daughter species (✧) inherit attention: drift a lineage's hue far
  enough and *different* critters start arriving. Selection made visible.
- The garden chord: three planted species assemble a fauna mix nobody
  scripted.

## 2. Drives, not rolls

`updateCritter` currently rolls dice at decision time. Replace the roll
table with two or three **drives** that rise over time and empty on use —
hunger (rises slowly; eating empties), comfort (rises at night and near
the beast; the den empties it), curiosity (rises when the wanderer is
still and near; approaching empties it). Highest drive picks the action.
Same tiny code size, but behavior becomes *legible motive* — you can
watch a critter and say "it's hungry" — which is what makes the web
discoverable without labels. *(Research pending: Rain World's drive
weighting, Creatures' chemistry-as-drives.)*

## 3. The energy ledger — Creatures, lite

Eating fills a critter; moving and night drain it. A fed critter lingers
where it fed (the trust front door from Arc 2). An empty one goes home
and sleeps — **nothing starves**; hunger is motive, not mortality
(peaceful pillar). One number per critter, persisted.

## 4. Balance without a script

The logistic loop, using parts we already have:

- Plants: per-tile caps (shipped) = carrying capacity.
- **Nibbles consume**: a nibbled plant loses growth progress; enough
  nibbles and it's gone. (Today nibbling is cosmetic — the web has no
  teeth, so it can't push back.)
- Critter appetite thins local flora → forage trips lengthen → energy
  spent exceeds energy found → critters range elsewhere or sleep more →
  flora recovers. Negative feedback with no referee.
- Births (later): a well-fed pair near a den adds one critter, gated on
  local plant density — the spring tension that refills after a trough.

Perturbation is the fascination: overharvest a patch and watch the
critters range wider, then the patch heal, then everyone come home.
Away-aging means it also happens while you're gone. *(Research pending:
stable parameter ranges, attractor states, what Equilinox fakes.)*

## 5. Discoverability — the journal draws the web

"Witnessed" = the nibble happened on screen within ~6 tiles of a still or
slow wanderer. A witnessed nibble records an edge; the species' journal
page grows a "depends on" line; enough edges and the island's web sketch
appears (vision: two players' journals disagree, both right). No numbers
anywhere on screen — appetite stays hidden; the *pattern* is the reward.

## 6. Build sequence (each step ships alone, tested)

1. **Palate + appetite** — pure data change; `favoriteSpecies` derived;
   critters keep behaving identically on day one. Tests: appetite scoring
   monotone in hue distance; every island's palates find food; daughters
   within hueWidth inherit their parent's diners.
2. **Teeth + ledger** — nibbles consume growth; critter energy; fed
   critters linger. Test: a grazed patch measurably thins and recovers.
3. **Witnessed edges** — journal "depends on" lines from watched nibbles.
4. **Toss = invitation** — Q-tossed and surplus items score against
   palates and draw visitors from farther than sniffing range.
5. **Fauna persistence** — critters (positions, energy) survive the save
   roundtrip; away-time runs the same drives coarsely.
6. **Predator + wariness** (Arc 3) — one hunter species; prey drift
   warier/faster near it; journal keeps the then/now sketch.
7. **The bench** (vision) — tilt a lineage's drift dice at the home bed;
   released variants get a journal page that keeps writing itself.

## Progress

- **Step 1 (palate + appetite): shipped** `5ddc176`. Critters taste traits,
  not species names; sown plants, kin, and daughters draw diners on merit.
- **Step 2 (teeth + ledger): shipped** `458807b`. Nibbles consume growth;
  critters carry an energy ledger; nothing starves. Perturb-and-recover is
  proven against an ungrazed twin island.
- **Step 3 (witnessed edges): shipped** `cfecc35`. The journal draws the
  web from nibbles the wanderer actually watched.
- **Drives, not rolls: shipped.** The roll table is gone; three drives
  choose every action. Design note at the end of this doc.
- **Teeth reframe (symbiosis with a thread of friction): shipped**
  `2026-07-18`. The bite is no longer every critter's outcome. Each
  `CritterSpecies` now carries a `role: "disperser" | "grazer"`, rolled off
  the seeded stream at generation with a `GRAZER_CHANCE` of 0.28 — so
  **dispersal clearly dominates** (a typical island is mostly dispersers and
  often has zero or one grazer; ~1/3 of islands are pure mutualist). A
  disperser's visit calls the new `Flora.propagate` — it carries a
  same-species seed to a nearby open tile (simTick's reseed placement,
  drifted one generation by `mutate`), leaving the visited plant unharmed;
  both gain. A grazer's visit still calls `nibble` (consume young, set back
  mature). **Both feed** — every visit gives `MEAL_ENERGY`, so the ledger
  invariant (nothing starves) is untouched; only the plant's outcome turns
  on the role.
  - **Balance:** dispersal is positive feedback whose *only* limit is finite
    space — `propagate` respects the per-tile cap, habitat, and global cap
    via `addPlant`, and simply no-ops when the neighborhood is saturated.
    That saturation is the whole balancer; grazing keeps the old
    negative-feedback recovery (`tests/graze.test.ts` still passes for a
    grazer).
  - **Emergent co-adaptation (the reason to keep it):** the drift is *not*
    biased toward any palate. Because a mutualist spreads the plants its
    taste favors, the plants that get spread are the ones the resident
    critters visit most — so over island-days the flora quietly bends toward
    its dispersers. Selection made visible, emergent from *differential
    spreading*, never hard-coded.
  - **Journal:** a witnessed disperser reads "spread by X", a grazer "grazed
    by X" — never mislabeled. `JournalEntry` gained a parallel `spreadBy?`
    field (same dedup/cap as `eatenBy`); `recordSpread` writes it,
    `recordForage` unchanged for back-compat; the witness in `main.ts`
    branches on the critter's role. Old journals with neither field still
    load.
- **Next: step 4 (toss = invitation).**

## Findings from research (`../research/ecosystem-prior-art.md`)

The prior-art pass (Creatures, Rain World, Equilinox, Dwarf Fortress/URR,
ecological theory) landed. What it changes here:

- **Simplicity surprises through interaction density**, not rule count
  (DF's unscripted drunk cats). Build features that *cross* existing ones —
  tide × day/night × palate × ledger — not standalone systems.
- **Discoverability = internal state shown as visible behavior** (Creatures,
  Pirates!). Standing rule: *every hidden tuning value needs a visible
  tell.* The journal records the tell; the player infers the value.
- **Balance is tuned offline in data + geometry, never a runtime clamp**
  (Rain World, Equilinox). Keep the crowding thin as a soft global cap;
  never add a per-species population controller.
- **Finite food is the restoring force, and the world's cycles stabilize
  it.** Lotka-Volterra with carrying capacity self-rights; a *periodic*
  carrying capacity (Swailem & Täuber 2023) *enlarges* the coexistence
  zone. So Wander's day/night, tide, and rain/bloom are promoted from
  flavor to balance infrastructure: when births land (step 6), gate them
  on a food supply that ebbs with those cycles.
- **Caveat:** no shipped *peaceful* game provably self-rights after a
  perturbation (Equilinox's self-correction claim was refuted). Wander's
  teeth test showing recovery is mildly novel ground — worth keeping as a
  standing invariant, not assuming from prior art.

## Drives — how a critter chooses (design note, 2026-07-18)

The roll table in `updateCritter` is gone. Three drives, each 0..1, are
read fresh at every decision; the strongest above a quiet line (0.2)
chooses the action, and exact ties fall to the earlier name — the ledger
before shelter, shelter before play. The dice now only jitter timing and
wander steps; motive never rolls, so a watcher can always answer *why*.

- **hunger** — computed from the energy ledger: zero at FULL, pressing
  hard below HUNGRY, capped at 0.95 so a spent body's need for the den
  always outranks it. *Nothing starves* lives in the drive shapes and is
  pinned by tests. Tell: a beeline to the nearest palatable plant.
- **comfort** — computed from the hour and the body:
  `max(darkness, spent)`. Dusk leans critters homeward; a nearly spent
  body saturates it to 1. Tell: heads for the den, curls up, sleeps.
  Mood reads "drowsy" (the hour) or "weary" (the body).
- **curiosity** — the one true accumulator: rises beside a wanderer who
  keeps still (~5 s to full), fades once the moment passes, and the
  sidle itself spends it — so an approach is shy, halfway at a time.
  Capped at 0.55: play never outranks real hunger or deep night. Tell:
  sidles toward you, pauses, sidles again.
- **fear** — a named, unwired slot. This ecology is mutualistic: nothing
  in the world hunts, so nothing needs startling. If something ever
  earns a gentle give-space response, fear is one more term, one "wary"
  tell, one action — not a rewrite.

When nothing presses, the critter is **content** and potters its home
range. The behavior itself is every drive's primary tell; `mood` on each
critter records the choosing drive so an inspect line could someday say
"seems drowsy" — words on request, never numbers on screen.

Threading: `updateCritter` grew an optional trailing context,
`{ darkness?, playerStill? }` — absent context reads as broad daylight
and a wanderer on the move, so old call sites and tests stand unchanged.
`main.ts` passes the sky's darkness and whether the wanderer is holding
still; stillness was already this game's watching verb. The beast is not
threaded in — it stays scenery until fear earns its wire.
