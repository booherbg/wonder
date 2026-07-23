# Wonder — The Plant/Insect Ecology: how it works (and how to tweak it)

*A technical read for the morning. Every formula and every tunable constant, with
worked numbers and screenshots. Written 2026-07-22 against `master`. Design specs:
[`2026-07-21-plant-insect-ecology-design.md`](specs/2026-07-21-plant-insect-ecology-design.md),
[`2026-07-21-simulator-design.md`](specs/2026-07-21-simulator-design.md).*

> **TL;DR of the loop.** Each **flower** shows a little pixel **map**. Each insect
> **swarm** carries a **sensor map** it evolves to match that flower. Matching the
> flower = **energy** (feeding) = **camouflage** = the swarm **pollinates** the
> plant, spreading it faster. Predators thin the *conspicuous*. A well-matched
> pair **booms** together; a mis-matched one scrapes by. Everything is bounded so
> it holds at a lush ceiling instead of exploding or collapsing.

![The Simulator — swarms adapting to flowers](images/plant-insect/01-simulator.png)

---

## 0. The pieces & where they live

| Piece | File | What it is |
|---|---|---|
| The identity map (pure math) | `src/life/idmap.ts` | the 7×7 tag grid, matching, reward, efficiency |
| The swarm + flower (pure sim) | `src/life/swarm.ts` | gene pool, feeding, population, predation |
| The world layer | `src/game/swarms.ts` | swarms on real islands: spawn, home on blooms, pollinate, diverge |
| Plant propagation | `src/life/flora.ts` | `pollinateSpread` (the plant's payoff) + normal self-seeding |
| Insect sprites | `src/render/insectSprites.ts` | generative bug bodies from the genome |
| Draw / inspect | `src/render/renderer.ts`, `inspect.ts` | the flitting clouds + the examine card |

**Timescale.** One **heartbeat** = one sim tick = **2 seconds** (`SIM_MS = 2000` in
`main.ts`). One heartbeat = one feed + **one gene-pool generation** + one population
update per swarm. All "per tick" numbers below are per 2 s of real time.

---

## 1. The map, and what a "match" is

A map is a **7×7 = 49-cell** grid (`MAP_G = 7`). Each cell is **0 = neutral** or a
**colour 1..6** (`MAP_NCOL = 6`).

- A **flower** presents a map: a **base/foliage colour** fills most cells, and a
  **flower accent** (a distinct colour) is stamped on a few cells — those accent
  cells are the *jackpot*. Flower size = how many accent cells.
- A **swarm** carries a **sensor map** that starts mostly neutral (a cheap
  generalist) and evolves toward a flower's map. **The insect's visible colours are
  rendered from this sensor map** — so as it adapts, the bug literally becomes its
  flower.

### The reward function — `matchReward(sensor, flower)`

Walk all 49 cells and sum:

```
per cell:
  sensor cell is NEUTRAL (0)      →  + GENERIC        (a tiny income, works on ANY flower)
  sensor cell is COLOURED         →  − UPKEEP         (costs energy to hold a colour)
        and it matches a BASE cell →  + BASE_HIT      (generic match, small)
        and it matches an ACCENT   →  + FLOWER_HIT    (the flower jackpot, big)
```

with the current weights (`idmap.ts`):

| constant | value | net per matched cell |
|---|---|---|
| `GENERIC` | **0.02** | neutral cell, free income |
| `UPKEEP` | **0.10** | cost of any coloured cell |
| `BASE_HIT` | **0.20** | base match → net **+0.10** |
| `FLOWER_HIT` | **0.90** | accent match → net **+0.80** |

So a **neutral generalist** earns a little from every flower; a **specialist** that
paints its cells to match a flower earns a lot *from that flower* — the accent
cells 8× more than the base cells. A coloured cell that matches *nothing* is
**−0.10** wasted, which is what makes specialising *toward one flower* the winning
move (and, because your colours are your look, what makes you camouflaged on it).

### Metabolic efficiency — the 0..1 number everything scales by

```
metabolicEfficiency = clamp( matchReward / maxReward , 0 , 1 )
```

where `maxReward` is the score of a perfect mimic (every cell coloured to match).
**This is the master dial**: 0 = a naive/mismatched cloud, 1 = a perfect mimic.
A fresh random swarm sits around **~0.11** (the generalist floor from all those free
neutral cells); a fully adapted one reaches **~1.0**.

### Resemblance & conspicuousness (camouflage)

```
resemblance   = (flower-coloured cells the sensor reproduces) / (flower-coloured cells)   // 0..1
conspicuousness = 1 − resemblance                                                          // 0..1
```

Resemblance is what the examine card shows as "**% come to match its flower**".
Conspicuousness is how much it *stands out on the plant it's on* — the predation
handle (§5).

---

## 2. What "energy" is, and how it's gained

**Energy is the swarm's metabolic reserve, a single number in `[0,1]`** (`sw.energy`).
It rises when the swarm feeds, falls a fixed amount just from living, and it's what
the population chases (§4). It is *not* stored food units — think of it as
"how well-fed the cloud is right now."

### Feeding — `feedSwarm(sw, flower)` (the "how much energy do they gain" answer)

Every heartbeat a swarm draws nectar from the flower it works and converts it:

```
drawn   = min(flower.nectar, NECTAR_DRAW)        // take up to a cap
flower.nectar -= drawn                            // the flower is depleted…
boldness = 0.6 + 0.4 · nerve                      // a bold swarm works the flower harder (0.6–1.0)
gain    = drawn · metabolicEfficiency · FEED_VALUE · boldness
sw.energy = min(1, sw.energy + gain)
```

Nectar regenerates on the flower: `flower.nectar = min(1, nectar + NECTAR_REGEN)` each tick.

| constant (`swarm.ts`) | value | meaning |
|---|---|---|
| `NECTAR_REGEN` | **0.05** /tick | a flower's productivity (the real ceiling on income) |
| `NECTAR_DRAW` | **0.25** | most nectar an insect takes in one feed |
| `FEED_VALUE` | **4** | energy per unit nectar at full efficiency |
| `LIVING_COST` | **0.02** /tick | energy burned just living (see §4) |

**Worked numbers** (why it's balanced):
- *Well-adapted, full flower:* `gain = 0.25 · 1.0 · 4 · (0.6–1.0) = 0.6–1.0` → energy
  pins at 1 almost instantly → population climbs to the cap. It thrives.
- *Naive generalist (eff ≈ 0.11), steady state:* a flower can only *produce* ~`0.05`
  nectar/tick, so once it's been grazed the sustainable draw ≈ `0.05`. Income ≈
  `0.05 · 0.11 · 4 · 0.8 ≈ 0.018` — almost exactly `LIVING_COST (0.02)`. So a
  clueless cloud **breaks even and survives** (barely) while it adapts, but doesn't
  grow. **This is the knob that decides "can a naive swarm survive long enough to
  learn?"** — raise `GENERIC`/`FEED_VALUE`/`NECTAR_REGEN` or lower `LIVING_COST` to
  make the world kinder to beginners; do the opposite to make adaptation urgent.

---

## 3. Reproduction — three distinct mechanisms

Blaine, this is the part with three different "reproduction" senses; keep them separate:

**(a) The gene pool evolves (this is the real adaptation).** A swarm isn't one
genome — it's a small **pool of `POOL_SIZE = 10`** sensor maps. Each heartbeat,
`evolveSwarm`:
```
sort the 10 by matchReward(against the home flower)
keep the top half (5 survivors)
refill to 10 by MUTATED COPIES of survivors   // mutateMap flips MUTATE_FLIPS = 3 random cells
sensor = the best genome                       // what you see / the card shows
```
That's a genetic algorithm: better-matched variants out-reproduce the rest, so the
pool drifts toward the flower. **`MUTATE_FLIPS` = adaptation speed & noise**; a
bigger pool or more flips = faster, jitterier learning.

**(b) The population number tracks energy** (the cloud gets denser/sparser) — §4.
This is *not* literal births; it's a size proxy.

**(c) Divergence buds a new swarm (speciation).** When a swarm's pool splits between
two flowers, it buds a **cousin** — a whole new swarm — §6.

---

## 4. Population — `updatePopulation(sw)`

```
sw.energy -= LIVING_COST                      // 0.02/tick, living costs
target     = sw.energy · sw.cap               // how big the current energy can support
sw.population += (target − sw.population) · 0.05   // ease 5% toward target each tick
clamp population to [0, sw.cap]
```

- **`cap` is the size lever** (`SWARM_CAP` — 100 in the core, **96** for a world
  swarm; the Simulator exposes a slider). Population is the cloud density and the
  count in "N aloft".
- The `· 0.05` is inertia: population moves ~5%/tick toward its target, so booms and
  busts are smooth, not instant.

---

## 5. Predation — gentle, non-wiping (the peaceful pillar)

Insectivory is a **population drain proportional to how conspicuous a swarm is** —
never a discrete kill. `applyPredation(sw, flower, pressure)`:

```
exposure = 0.4 + 0.6 · nerve                  // bold clouds linger exposed (0.4–1.0)
taken    = sw.population · conspicuousness · pressure · PREDATION_RATE · exposure
sw.population -= taken
```

| constant | value | where |
|---|---|---|
| `PREDATION_RATE` | **0.02** | `swarm.ts` — fractional loss/tick at full exposure×pressure |
| `WORLD_PREDATION` | **0.6** | `swarms.ts` — the ambient pressure in a real island (the Simulator toggles its own) |

A **camouflaged** swarm (conspicuousness ≈ 0) loses ≈ nothing; an **exposed** one is
thinned but **regrows once hidden/fed** — so adaptation *is* survival, and nothing is
ever wiped out. **`WORLD_PREDATION` is the "how dangerous is the world" dial**; 0
removes insectivory entirely, 1 makes camouflage urgent.

---

## 6. Divergence → cousins

Every **`DIVERGE_INTERVAL = 50` heartbeats** (~100 s) a swarm checks whether its pool
is genuinely bimodal — half favouring its flower, half favouring a *different* nearby
flowering species. If so it **buds a cousin** (a new swarm carrying the second
cluster, mutated behaviour, 40% of the population). Hard-capped at
**`SWARM_COUNT_CAP = 24`** swarms per island. This is how one kind becomes many over
island-time; cousins wear a ✧ in their name.

---

## 7. The plant's payoff — pollination vs. going it alone

This is the "**benefits to the plant vs non-insect behaviour**" answer, and it's the
whole mutualism.

**Without insects, a plant still lives** — `flora.simTick` self-seeds every plant on
its own (drift within a small `reseedRadius`). That's the **facultative floor**: a
flower with no swarm persists, just spreads *slowly*. (Guarded by a test: all
flowering kinds survive 800 self-seed-only ticks.)

**With a well-fed, well-matched swarm, the plant spreads faster.** Each heartbeat, in
`SwarmLayer.tick`, a swarm working a flower rolls to pollinate it:

```
match = metabolicEfficiency(swarm, flower)
if match ≥ POLLINATE_MATCH_MIN (0.3):                       // a starving stray never pollinates
    fill = population / cap                                  // a fuller cloud pollinates more
    if rng() < POLLINATE_CHANCE · match² · fill:            // 0.5 · match² · fill
        flora.pollinateSpread(host, radius=6, maxSame=2)     // the plant's ordinary propagation, tripped
island-wide ≤ MAX_POLLINATIONS_PER_TICK (3) pollination events per heartbeat
```

`pollinateSpread(p, radius, maxSame)` (in `flora.ts`) is like normal reseeding but
**wider and lower-density**: it drifts a mutated child up to **6 tiles** away and
**refuses any tile that already holds ≥2** of that species (below flora's own
per-tile cap of 4), so the boom reads as **airy spread, not a tiled slab**. It still
routes through `addPlant`, so per-tile + global caps and the habitat gate all hold.

| constant (`swarms.ts`/`flora.ts`) | value | meaning |
|---|---|---|
| `POLLINATE_MATCH_MIN` | **0.3** | efficiency needed before a swarm pollinates at all |
| `POLLINATE_CHANCE` | **0.5** | base per-swarm per-tick pollination probability |
| chance formula | `0.5 · match² · fill` | quadratic in match → rewards *good* mimics steeply |
| `MAX_POLLINATIONS_PER_TICK` | **3** | island-wide ceiling (keeps booms bounded) |
| `POLLINATE_SPREAD_RADIUS` | **6** tiles | drift of a pollinated seed (wider than self-seed) |
| `POLLINATE_MAX_SAME` | **2** /tile | density cap so it's spread, not a carpet |

**The reciprocal boom.** Match → the swarm feeds (population up) *and* pollinates
(the plant spreads → more flowers → more nectar → more feeding → …). Positive
feedback, **bounded** by per-tile caps + nectar limits + predation. A "well-versed
pair grows rapidly," then settles at a lush ceiling. Verified bounded: a full island
run holds ~8000 plants, peaks < the 10 000 cap, never collapses.

![The reciprocal boom — a swarm's flower thickens where it works](images/plant-insect/03-reciprocal-boom.png)

**So, plant with a swarm vs without:** same survival floor, *much* faster spread when
a matched cloud is working it — and the flowers a swarm favours come to dominate,
which is the co-adaptation ("the island leans toward what its pollinators love").

---

## 8. Behaviour genes — personality (and the one that bites the sim)

Each swarm has three scalar genes in `[0,1]` (`BehaviorGenes`), heritable + mutated on
divergence:

| gene | 0 ↔ 1 | wired effect |
|---|---|---|
| **nerve** | skittish ↔ bold | **feeding** `boldness = 0.6+0.4·nerve` *and* **exposure** `0.4+0.6·nerve` — bold clouds feed harder but are thinned more (a real trade-off; predation selects skittish, scarcity selects bold) |
| **range** | homebody ↔ wanderer | render motion: dart length / how far the cloud roams its bloom |
| **cohesion** | loose ↔ tight | render motion: how tightly the insects cluster |

`range` and `cohesion` currently express in *motion + the sprite roll* (which of the
17 body forms — tight cohesion favours beetle/ladybird/bumblebee, wide range favours
moth/damsel/lacewing, bold nerve favours wasp/mantis/skipper), not yet in the sim
numbers — that's where you'd wire more trade-offs (e.g. wanderers reaching farther
flowers, tight clouds harder for predators to pick from).
The examine card renders these as words ("a homebody · bold · an easy cloud").

---

## 9. World integration & spawning (so numbers match what you see)

`SwarmLayer` (in `swarms.ts`) runs off its **own salt** (`SWARM_SALT = 0x5a12b`) so it
is **seed-safe**: a pinned island's terrain/flora/critters are byte-identical with or
without swarms. Flower maps use a separate `FLOWER_SALT` per species (daughters get a
lazily-built map, so evolved kinds host swarms too).

| constant | value | meaning |
|---|---|---|
| `MIN_SWARMS` / `MAX_SWARMS` | **4 / 8** | swarms spawned per island |
| `SPARSE_SWARMS` | **2** | fallback so a bloom-poor island still has some life |
| `WARM_TICKS` | **20** | heartbeats a swarm has already lived on load (arrives partly adapted) |
| `LIVELY_POP` | **38** | arrival population (a lush cloud, not a lone speck) |
| `HOME_SCAN_PX` | **10 tiles** | how far a swarm looks for a flower to work |
| `SWARM_CAP` (world) | **96** | the world size lever |
| `BOOM_POLLINATIONS` | **3** | spreads before a swarm's work "reads as a boom" (fires a murmur/journal note) |

Under `?warm=N` the swarm layer lives the tail of the fast-forward too, so a warmed
island loads already booming.

---

## 10. Every tunable, in one place

*Raise/lower these to retune. Files: `i` = `idmap.ts`, `s` = `swarm.ts`,
`g` = `swarms.ts`.*

| knob | file | value | turn it UP → | turn it DOWN → |
|---|---|---|---|---|
| `GENERIC` | i | 0.02 | naive swarms feed more anywhere (kinder, less specialisation pressure) | specialise-or-starve |
| `UPKEEP` | i | 0.10 | colours cost more → leaner sensors, weaker mimics | mimics fill in denser |
| `BASE_HIT` | i | 0.20 | camouflage/foliage-matching more worthwhile | flower-only focus |
| `FLOWER_HIT` | i | 0.90 | the jackpot dominates → sharp specialists | flatter reward |
| `NECTAR_REGEN` | s | 0.05 | flowers feed more → bigger populations, faster booms | scarcer, leaner islands |
| `NECTAR_DRAW` | s | 0.25 | burstier feeding | smoother |
| `FEED_VALUE` | s | 4 | more energy/food → faster growth | slower growth |
| `LIVING_COST` | s | 0.02 | harsher (starvation pressure) | everything survives easily |
| `SWARM_CAP` | s/g | 100/96 | **bigger swarms** (the size lever) | smaller swarms |
| `POOL_SIZE` | s | 10 | more internal variation → faster adaptation | slower, more drift |
| `MUTATE_FLIPS` | s | 3 | faster + jitterier adaptation | slower, cleaner |
| `PREDATION_RATE` | s | 0.02 | harder predation | gentler |
| `WORLD_PREDATION` | g | 0.6 | camouflage more urgent (0 = off) | safer world |
| `POLLINATE_MATCH_MIN` | g | 0.3 | only strong mimics pollinate | even mediocre ones help the plant |
| `POLLINATE_CHANCE` | g | 0.5 | plants spread faster under swarms | weaker mutualism |
| `MAX_POLLINATIONS_PER_TICK` | g | 3 | bigger booms | subtler |
| `POLLINATE_SPREAD_RADIUS` | g | 6 | booms spread wider/thinner | tighter clumps |
| `POLLINATE_MAX_SAME` | g | 2 | denser carpets | airier spread |
| `DIVERGE_INTERVAL` | g | 50 | (lower) cousins bud more often | rarer speciation |
| `SWARM_COUNT_CAP` | g | 24 | more total swarms per island | fewer |
| `WORLD_PREDATION`→nerve wiring | s | 0.4–1.0 exposure | — | — |

---

## 11. What you see (and where to look in-game)

- **In the world:** clouds of **generative insects** — **17 body forms** (moth,
  cicada, beetle, ladybird, firefly, weevil, hoverer, wasp, bumblebee, midge, damsel,
  lacewing, mayfly, skipper, leafhopper, mantis, walkingstick), each rolled from a
  swarm's behaviour genes and coloured/patterned from its genome — flit and **perch on
  the blooms they work**. A well-adapted cloud takes on its flower's palette (so it
  gets *subtler* as it succeeds — camouflage working); fireflies glow at night. At a
  wanderer's distance they're motes — lean the view (`Z`) or examine to see the bug.
  ![world](images/plant-insect/06-world.png)
- **Lean close (`E`) or click a cloud:** its examine card — a **portrait** of the
  actual bug, its name, host flower, population ("N aloft"), resemblance ("% come to
  match its flower"), and personality, with the genome grid as a small inset.
  ![examine card](images/plant-insect/02-examine-card.png)
- **First meeting:** a HUD cue + a murmur point you at the swarms; the field guide
  (`?`) has an entry teaching the clouds and the `Z` lean.
  ![first meeting](images/plant-insect/05-first-meeting.png)
- **Court a cloud:** **sow a flower where a cloud drifts** and a matched swarm will
  come to work it (and thicken that kind) — the game announces the first time a swarm
  takes to a bloom you planted. This is the feature's main *player verb*.
- **The Field Journal (`J`):** the clouds you've met become pages (portrait, host,
  best match, fullest cloud) alongside the plants and critters.
- **The `V` ecology overlay:** each swarm is ringed by **exposure** (cool = hidden in
  its flower's colours, warm = plain to see — the number predation reads), with a
  thread to a bloom when a cloud has drifted off to home on it.
- **`C` the living web:** leads with **swarm → pollinates → bloom → nectar feeds the
  swarm**; single clouds are **named** and drawn as their actual insect; the old
  substrate chains sit demoted below.
  ![living web](images/plant-insect/04-living-web.png)
- **`G` the ledger:** "the pollinators aloft" plots **each named swarm's match-% over
  island-time**, climbing toward a dashed "matched — pollinates above" (50%) rule — so
  you watch adaptation happen (above the plant-population census).
- **`?sim=swarm` → the identity-map bench:** place flowers & swarms, run time,
  toggle Predators, dial the size Cap, watch a cloud find and *become* its
  flower — and "back to the island ↩" when you're done. (`?sim=1` now opens the
  World-Lab, §13 below; the swarm bench moved to `?sim=swarm` to make room.)

---

## 12. Where I'd tweak first (suggestions)

- **To make adaptation feel more consequential:** lower `GENERIC` (0.02 → 0.01) and
  raise `LIVING_COST` (0.02 → 0.03) so a naive cloud is genuinely pressured — but
  watch it doesn't dip below break-even (§2 math) or clouds will thin before they
  learn.
- **To make the boom more/less dramatic:** `POLLINATE_CHANCE` and
  `MAX_POLLINATIONS_PER_TICK` are the volume knobs; `POLLINATE_SPREAD_RADIUS` /
  `POLLINATE_MAX_SAME` are the *shape* (airy vs. dense).
- **To make camouflage matter more:** raise `WORLD_PREDATION` toward 1.0 — exposed
  clouds get thinned harder, so matching the flower buys real survival, not just food.
- **The unbuilt richness (v2):** the **dual insect map** (a separate food map vs.
  camouflage map, so feeding and hiding can *conflict*) and an **evolving-predator
  search image** — these turn the current "harmonious" adaptation into a genuine arms
  race. Say the word and I'll build them.

*Any of these is a one-line change; the tests (`ecology-holds`, `pollination`,
`swarm-layer`) will catch a retune that breaks the balance.*

---

## 13. The World-Lab (Simulator slice 1)

`?sim=1` now opens **the World-Lab**, a from-scratch bench for the plant/insect
core (the `flora`/`fauna` ecology, not the swarm layer above): a real-tile
construct — playable island / biome sampler / single biome, never a void tile
— rendered fit-to-window over the game's own renderer, with a habitat-gated
place-one palette (click a plant or critter kind, click the construct to set
it down), pause/play/step-1/step-N time controls with a plants/full fidelity
toggle, and a data readout — a picked critter's or plant's full internal state
(drives, mood, target, meal; genome, age) beside a live census + food-web
strip. The old swarm/identity-map bench is preserved, unchanged, at
`?sim=swarm`; ordinary play (no `?sim`) is untouched — one router
(`parseSimMode` in `src/game/flags.ts`) sends the three down entirely separate
paths, so a played island is byte-identical whether or not this bench exists.

Where to tune or extend it: `src/life/kernel.ts` is the reusable headless
core — one deterministic `SimKernel.step()` over `Flora` + a critter array +
`CensusLog`, no renderer, no player, seeded RNG only (the piece Doors A/B of
the wider ecology plan will fork/preview with later). `src/world/construct.ts`
is the starter surface — `buildConstruct(kind, seed)` for the three canvases
above; a biome brush would repaint their tiles in a later slice.
`src/game/worldlab.ts` is the bench itself — palette, click-to-place, time
controls, and the readout, all DOM/render-layer code that reuses the kernel
and construct rather than re-deriving anything.

Deferred to later slices (not lost, just not slice 1 — the biome + stamp
brush shipped in slice 2, §14 below): the roll pane + drawer, the
evolutionary layer (pressures panel, roll-a-web, richness meter),
save/resume to a slot with full critter state + RNG persistence, and an
ambient/title-screen bench.

## 14. The shaping tools (Simulator slice 2)

The World-Lab now carries two hand tools alongside slice 1's place-one: the
**stamp brush** — a shared 1×/2×/3× size picker; one click lays an N×N block
of the selected plant or critter kind (odd sizes centre on the clicked tile;
the even 2×2 has no exact centre, so it anchors the block at the clicked
tile's top-left) — and the **biome brush** — pick a real `Tile` from an
eight-swatch row (every plant habitat, plus open water), then click or drag
to repaint that many tiles under the brush. A paint mutates `map.tiles` in
place — the same `Uint8Array` the game's `Renderer` and `Flora` already
hold — so the repaint shows up on the very next frame with no `setMap` call
and no atlas rebuild; the plant palette re-filters through
`placeablePlants`/`habitatsOf` on stroke end (pointerup, not per painted
cell, to avoid thrashing a full-tiles scan mid-drag), so painting a new
habitat in unlocks its plants live. Painting a habitat *away* just stops
offering it — it does not retro-kill anything already rooted there, since
`Flora` only gates habitat at `addPlant` time, never continuously.
`paintBiome` also refuses to make the spawn cell non-walkable, so a
construct can never be stranded even under a full flood.

Both tools are rng-free by construction — `grep -nE "Math\.random|Date\.now|new Date" src/game/simBrush.ts`
finds nothing — and structurally peaceful: a stamp only ever calls
`placePlant`/`placeCritter`, a paint only ever writes `tiles`; neither one
removes anything, so slice 1's `critterCount()` never-decreases invariant
over `step()` holds untouched. The pure maths (`stampOffsets`/`stampCells`/
`paintBiome`) lives in `src/game/simBrush.ts`, covered by
`tests/sim-brush.test.ts`; the DOM wiring — the size picker, the tile swatch
row, the drag-to-paint path, the post-stroke palette refresh — lives in
`src/game/worldlab.ts`, reusing the same click→world mapping,
`placeablePlants`/`habitatsOf`, and kernel placement calls slice 1 already
built. No shared file changed, so ordinary play and the `?sim=swarm` bench
are untouched by any of this — the router (`parseSimMode` in
`src/game/flags.ts`) still sends the three modes down entirely separate
paths, and its existing test still guards it.

Tuning surface: `BIOME_TILES` in `simBrush.ts` is the eight swatches on
offer (a one-line addition to include `Scree`/`Snow`/`Cliff`, omitted as
rarely a plant habitat); the 2×2 stamp's top-left anchor is a one-line flip
in `stampOffsets` if a different feel is wanted.

Deferred to later slices, unchanged: the roll pane + drawer (slice 3), the
evolutionary layer — pressures panel, roll-a-web, richness meter (slice 4),
save/resume to a slot with full critter state + RNG persistence (slice 5),
and an ambient/title-screen bench.

## 15. The species lab (Simulator slice 3)

The World-Lab now carries a third surface: **roll a fresh kind, iterate its
look/traits, then keep or clear it from a live drawer.** The **roll
pane** draws a seeded batch of ~9–12 candidate plant or critter kinds —
`rollPlantBatch`/`rollCritterBatch` in `src/life/roll.ts` reuse the tested
whole-roster generators (`generatePlantSpecies`/`generateCritterSpecies`)
off a per-roll seed (`rollSeedFor(base, kind, cursor)`) and slice members
out, so no new genome/species-generation math exists anywhere; re-roll just
advances the cursor to a fresh, still-reproducible slice of the same seeded
stream. Thumbnails reuse the real sprite renderers — `getPlantSprite` for
plants, the uncached `critterPortrait` for critters (candidates carry a
`PROVISIONAL_ID` of -1, and the ordinary `getCritterSprites` cache is keyed
by id, so the uncached path is the one that can't collide) — scaled into a
small pixelated canvas, the only new DOM plumbing. Picking a candidate calls
`kernel.introducePlantSpecies`/`introduceCritterSpecies`, which append the
def with `id === array.length` (never assigned earlier) so Flora's own
`speciesList[species]` indexing — the same array, held by reference — stays
correct the instant a rolled kind joins it. Iterating a pick before it's
placed nudges looks (`nudgePlantLooks`/`nudgeCritterLooks`, re-rendering the
thumbnail off a fresh genome/morph) or traits (`setPlantTraits`/
`setCritterTraits`, patching habitat/reseed or role/size/palate — a size
change re-derives the morph, the one trait that also reshapes the look).

The **drawer** (`src/game/simDrawer.ts`, a pure model — no DOM, no RNG, no
wall clock) is the cast list: every starter, rolled, and daughter kind gets
an entry holding a deep-cloned definition (`cloneDef`), so deleting a kind
never loses it. Status is computed fresh each refresh (`statusOf` against
the kernel's live count): **alive** while count > 0 or never yet placed,
**extinct** once a kind has lived (`peak` > 0, tracked by `bumpPeak`) and
fallen back to zero on its own, **cleared** once deliberately deleted — a
tombstone (`deleteEntry`/`reviveEntry`), never a splice, so a kind's id
never moves and reviving just re-places instances against the still-present
record. **Delete is a roster op, not a kill**: `kernel.clearPlantInstances`/
`clearCritterInstances` zero a kind's live population while keeping its
species record at its id — the spec's "populations rise and fall," never a
violent removal, and both run entirely outside `step()` so the peaceful
invariant below is untouched. Variations count iterated looks plus captured
daughters; `captureDaughters` auto-promotes any `plantSpecies` record
carrying a `parent` that the drawer doesn't yet know (flora's own ✧
speciation records, scanned rather than evented since `takeEvents()` carries
no id) — idempotent, so it's safe to call on every refresh.

**Determinism and the peaceful pillar, checked:** `grep -nE
"Math\.random|Date\.now|new Date" src/life/roll.ts src/game/simDrawer.ts`
finds nothing — the roll pane is seeded end to end (`rollSeedFor` +
`makeRng`), and the drawer is pure arithmetic over its inputs. Peaceful is
guarded two ways already in the suite: slice 1's `critterCount()`-across-
`step()` invariant (delete/revive sit outside `step`, so it never moved) and
a slice-3 kernel test that introduces a rolled kind, steps the kernel, and
asserts it's still there (`tests/kernel.test.ts`, "introduceCritterSpecies
appends with id === index; the kind places + steps").

**Real worlds are byte-identical.** The only touched shared file is
`src/life/kernel.ts`, and every slice-3 addition to it (`introduce*`,
`clear*Instances`, `critterCountOf`) is a new, additive method — no
existing method changed, and `main.ts`/`species.ts`/`fauna.ts`/`flora.ts`
are untouched. The router (`parseSimMode` in `src/game/flags.ts`) still
sends `?sim=1` (lab), `?sim=swarm` (bench), and no `?sim` (ordinary play)
down three separate paths, and its existing truth-table test still guards
it; a visual pass (`?seed=42`, `?sim=swarm`, `?sim=1`) confirmed the three
destinations stay distinct — ordinary play unchanged, the identity-map
bench intact, and the World-Lab now additionally carrying the roll pane +
drawer with no life until something is placed or rolled.

Where it lives: the pure roll/iterate maths in `src/life/roll.ts`
(`tests/roll.test.ts`), the pure drawer model in `src/game/simDrawer.ts`
(`tests/sim-drawer.test.ts`), the additive kernel seams in
`src/life/kernel.ts` (`tests/kernel.test.ts`), and all the DOM wiring — the
roll pane, the iterate strip, the drawer panel, the dev aids (`?roll=`,
`?rollpick=`, `?iterate=`, `?drawerdemo=`, `?drawerdel=`, `?split=`) — in
`src/game/worldlab.ts`. Tuning surface: `SIZE_MIN`/`SIZE_MAX` in `roll.ts`
clamp a critter-size trait patch; the batch count and re-roll amounts
(`REROLL_LOOKS_AMOUNT`) are call-site constants in `worldlab.ts`; ids are
positional (array index), so a long session's deletes grow the arrays with
cheap tombstones rather than ever compacting.

Deferred to later slices, unchanged: the evolutionary layer — pressures
panel, roll-a-web, richness meter (slice 4), save/resume to a slot with full
critter state + RNG persistence (slice 5), and an ambient/title-screen
bench. Also still deferred (slice-3 scope, explicitly out of bounds per the
plan): iterating an already-picked-and-placed kind in place, and a
genome-first single-kind synthesis path (`rollPlantKind`/`rollCritterKind`)
as an alternative to today's roster-slice approach.

## 16. The evolutionary layer (Simulator slice 4)

The World-Lab now carries a fourth surface, turning "place & watch" into
"author & evolve": **roll a matched, closable web** in one action; **crank
five live pressures** that reshape how the construct evolves as you keep
stepping; read a **richness/wildness meter** that scores what you've made;
and **pin a phenotype to re-seed** the construct from it. All four reuse the
sim's own rules rather than re-deriving them, and all four were carried
through a five-lens QA pass whose material findings are folded into this
section rather than left as a separate to-do.

**Roll a foodchain — `src/life/rollweb.ts`.** `foodweb.ts` only *scores* a
species set (`chainStats`/`chainLinks` read what links already exist — there
is no "build a matched chain" path), so `rollWeb(base, cursor, size,
habitats, map)` **synthesises** a set and the tests **verify** closure with
the sim's own matching rules: `appetite`/`APPETITE_MIN` (a disperser eats a
plant) and `hueGap`/`SUBSTRATE_HUE_MATCH` (a feeder germinates on a
byproduct). Because `fauna.appetite` gates *hard* on form equality, one
palate only ever eats one plant *form* — so each chain closes with **exactly
one disperser** by giving the **source** and the **feeder** the same
`(form, hue)` family (the feeder is a real, distinctly-named same-form
candidate — or a clone of the source if the batch holds none — retuned to
the source's hue and flagged `substrateFeeder`, on the source's own
habitat). A disperser's palate is built *by construction*, not search
(`palateFor` centres `hueCenter`/`hueWidth`/`glowTaste` on the source's
archetype via `setCritterTraits`), so it eats the source (→ a byproduct at
hue H) **and** the feeder that wakes on that byproduct — the loop closes.
`worldlab.ts`'s `seedWeb(size)` introduces the whole triple onto the
palette/drawer (`introducePlantDef`/`introduceCritterDef` →
`kernel.introducePlantSpecies`/`introduceCritterSpecies`) and auto-places one
seed of each near the construct centre so the chain can actually close as
you step — and re-points the disperser's `favoriteSpecies` at the freshly
introduced source id, so the inspect card's "born loving" line never indexes
a stale placeholder. **roll a web** calls `seedWeb(WEB_SIZE = 3)`; **seed it
richer** calls `seedWeb(WEB_SIZE_RICH = 6)`.

**The pressures panel — `src/game/simPressures.ts` + `kernel.setTuning`/
`setCritterRole`.** Five sliders, in order: **drift** (`mutationAmount`),
**speciation** (`splitDistance`), **grazer share** (a role paint, not a
tuning field), **reseed rate** (`reproChance`), **per-tile cap**
(`maxPerTile`). `tuningPatchFor(id, value)` maps the four tuning-backed
pressures to their `FloraTuning` fields — speciation is special-cased to
also open the companion `splitClusterMin`/`splitCooldownTicks` gates as the
threshold drops, since a lower `splitDistance` alone is silently blocked by
those gates otherwise. `grazerAssignment(ids, share)` is a deterministic,
no-rng role paint: sort every live critter kind's id, the first
`round(share·N)` become `grazer`, the rest `disperser`. **The load-bearing
finding that made this slice cheap:** `Flora.tuning` is never captured at
construction — **every** consumer (`simTick`, `maybeSpeciate`, `hasRoom`,
`propagate`, `pollinateSpread`, `stepSubstrates`) reads `this.tuning.<field>`
fresh each call, and `updateCritter` reads `speciesList[c.species].role`
fresh each tick too — so `kernel.setTuning(patch)`
(`Object.assign(this.flora.tuning, patch)`) and `kernel.setCritterRole(id,
role)` (`this.critterSpecies[id].role = role`) land on the *very next*
`step()`, with the whole plant/critter/tick state preserved. **No rebuild,
ever.** A slider is a pure parameter write on the running kernel. In the
chrome, the five sliders live in an **evolution tray** that is an in-flow
child appended last into the bottom-center `stack` (a column-reverse flex
container, so it renders above the palette/bar), toggled by a **`pressures
⚘`** button — not a `position: fixed` overlay as first sketched, and not a
fourth scrolling column, so the left/right bounded/scrolling stacks stay
structurally untouched.

**The richness/wildness meter.** `richnessMeter(plants, critters)` reuses
`chainStats` and the *exact* `diversityScore` arithmetic (`chains +
2·(redundancy − 1)`), named via `richnessWord`
(flat/sparse/living/rich/lush/legendary) — display-only, it never mutates
the sim. It rides inside the existing "living web" census panel's header (no
new column), and — after a QA fix, see below — it scores only the
construct's **live** species (`speciesCounts().get(id) > 0` for plants,
`critterCountOf(id) > 0` for critters), so an untouched construct reads
`flat 0.0` rather than a lively-sounding score for kinds that were merely
*introduced*, never placed. "Seed it richer" drops a bigger web (6 chains
instead of 3), pushing the reading up a tier or two.

**Curate — pin-to-reseed.** `simDrawer.ts` gives every `DrawerEntry` a
`pinned` flag (`false` by default), with `pinEntry`/`unpinEntry` as
immutable toggles that preserve the entry's stored `def`, and
`pinnedEntries` filtering to the non-deleted pinned set — mirroring the
existing `deleteEntry`/`reviveEntry` tombstone shape exactly. The bench's
**place pinned** button (renamed from "reseed pinned" in the QA pass, see
below) calls `reseedPinned()`, which re-places a few fresh instances of each
pinned kind near the construct centre through the same seeded
`kernel.placePlant`/`placeCritter` path `reviveDrawerEntry` already uses. One
honest limitation, surfaced by QA but not itself a fix in this pass:
placement resolves by `speciesId` against the kernel's **live** species
record, not literally the drawer's frozen `def` snapshot — harmless for
plants (nothing in the bench mutates a live `PlantSpecies` record in place
after introduction), but a critter's `role` is exactly the one species-level
field the grazer-share slider can repaint live, so a pinned "disperser" that
the slider has since flipped to "grazer" re-places as a grazer, not as the
phenotype it was pinned at. Noted here as a known edge, not silently papered
over.

**The binding invariants, checked.** *Determinism:* `grep -nE
"Math\.random|Date\.now|new Date" src/life/rollweb.ts src/game/simPressures.ts`
finds nothing — roll-a-web draws off `roll.ts`'s `rollSeedFor`+`makeRng`;
`grazerAssignment` and `richnessMeter` are pure arithmetic over their
arguments; a pressures change adds **no new rng draws**, so it's a pure
parameter write — proven by a schedule-replay kernel test (same seed, same
placements, same tuning-write schedule, same step count ⇒ byte-identical
snapshot). *Peaceful:* `step()` still never births or removes a critter —
`clearPlantInstances`/`clearCritterInstances`/`setTuning`/`setCritterRole`
are all player-triggered ops that run outside the step loop, and cranking
grazer share only ever *thins* (a grazer nibbles via `flora.nibble`, setting
a mature plant back to sprout — nothing dies); a kernel test flips a placed
critter to grazer, steps 120 ticks at full fidelity, and confirms
`critterCount()` is unchanged. *Real worlds untouched:* every new file
(`rollweb.ts`, `simPressures.ts`) and every edited file (`kernel.ts`,
`simDrawer.ts`, `worldlab.ts`) is Simulator-only. The **one** touch to a file
ordinary play also uses — `flora.ts`'s additive `readonly suppressedSpecies
= new Set<number>()` (added during the QA fix pass, below) — is provably
inert for ordinary play: it defaults empty, and the only two writers
(`kernel.clearPlantInstances`, which adds an id, and
`kernel.unsuppressPlantSpecies`, which removes one) are both Simulator-only
kernel methods that ordinary play never calls; `stepSubstrates`' feeders
filter against an empty set returns the identical array, confirmed by the
full suite (including the pre-existing substrate-germinate tests) staying
green.

**The QA pass and its fixes.** Five QA lenses ran over the whole bench — UX,
consistency, functionality, coherence, completeness — and the material
findings were fixed and shipped to `master` (`c30812e`):

- **BLOCKING (coherence):** the bottom `stack`'s `palette` child had no
  height cap, so on a wide roster at ≤1100px width the palette's growing
  rows pushed the whole bottom-anchored, column-reverse stack upward,
  shoving the evolution tray into the header and side columns and clipping
  both. Fixed by giving `palette` the same `max-height: 40vh; overflow-y:
  auto` every sibling panel (roll pane, drawer, readout, evo tray) already
  had.
- **The speciation slider ran backwards (UX).** `splitDistance` was the one
  pressure where a higher raw field value is the *tamer* end, so dragging it
  right — same direction as every other slider's "wilder" — actually made
  speciation rarer. Fixed with a `reversed` flag on its `Pressure`
  descriptor and a new `fieldValueFor(id, sliderValue)`, which mirrors only
  the reversed slider's position across `[min, max]` before it reaches
  `tuningPatchFor` — the real field, and `tuningPatchFor`'s own tests, are
  untouched; only the slider-to-field mapping flips, so right now reads
  "wilder" for all five.
- **Deleted substrate-feeders came back on their own (functionality).**
  `clearPlantInstances` zeroed a feeder's live population but
  `stepSubstrates`' feeders filter had no notion of a tombstone, so a live
  disperser elsewhere could germinate a fresh instance of the "cleared"
  species within roughly a hundred ticks, with the drawer still showing
  "cleared." Closed by `flora.ts`'s new `suppressedSpecies` set —
  `clearPlantInstances` adds the id, `unsuppressPlantSpecies` (called on
  revive) removes it, and the feeders filter excludes anything suppressed.
- **The richness meter scored potential, not what was actually alive**
  (flagged independently by three of the five lenses). It read off *every*
  introduced species definition, including the starter kinds seeded at
  boot — so a completely untouched construct read "living 14.7" beside a
  census saying "nothing counted yet." Fixed by scoping the meter's inputs
  to live species only (population > 0) before calling `richnessMeter`; an
  empty construct now reads `flat 0.0`, matching the pre-existing
  `richnessMeter([], [])` unit test.
- **Grazer share was dishonest at boot and silent on change (UX).** The
  slider initialised to a bookkeeping `0` regardless of the roster's actual
  role mix, and the first nudge silently repainted every critter kind's role
  with no feedback. Fixed by seeding the slider from the live roster's real
  share on build, and flashing "grazer share N% — repainted M kind(s))" (or
  "roster unchanged") on every move.
- **No speed control (completeness).** The spec named pause/play/speed
  explicitly; only step-1/step-N/fidelity existed. Added a **×1/×2/×4**
  button that only re-paces the frame loop's accumulator (`stepMs = TICK_MS
  / speedMul`) — never a sim input, so determinism is untouched.
- **"Reseed" meant three different things on three panels (coherence).** The
  pressures tray's reseed rate (`reproChance`), the iterate strip's "reseed:
  on/off" (actually the `substrateFeeder` flag), and the roll pane's "reseed
  pinned" (placement from a stored def) all borrowed one word for three
  unrelated mechanics. Renamed the trait toggle to **substrate feeder:
  on/off** and the pin action to **place pinned**, leaving "reseed rate" as
  the one surface that's actually about reproduction.

**The open design calls, resolved.** The slice-4 plan flagged five open
calls for the controller; each is now a settled decision:

1. **A chain closes with exactly one disperser via a shared `(form, hue)`
   family**, not a richer multi-form chain — **confirmed** as the v1 shape.
   A 4-member chain (a second disperser on a second plant form) is a v2
   idea, not built.
2. **Richness is realized (live species), not potential** — resolved by the
   QA fix above. The meter now reads `flat` on an empty or critterless
   construct, which is the honest reading for a food-*web* meter; the
   census's `AROSE`/`LIVE` counts beside it carry the biodiversity signal
   the meter itself doesn't.
3. **The pressures live in an in-flow bottom-center `stack` child** — not a
   fourth scrolling column, and (contrary to the plan's original sketch)
   not a `position: fixed` overlay either — **shipped and confirmed**; the
   left/right bounded/scrolling stacks are untouched by it.
4. **Grazer share is a global role repaint of every live critter kind**,
   overriding any hand-set role — **confirmed** as the intended default
   selection pressure. The QA fix made its effect visible (a truthful
   initial value plus a repaint flash) instead of silent; a per-kind
   exemption (e.g. sparing a roll-a-web-authored disperser) is a v2
   consideration, not built.
5. **The `?split=1`/`?pressures=wild` demo tuning is best-effort**, not a
   guaranteed outcome within any fixed run length — **fine as shipped**,
   same as slice 3's `?split` precedent.

**Where it lives:** the pure roll/verify maths in `src/life/rollweb.ts`
(`tests/rollweb.test.ts`); the pure pressures + richness model in
`src/game/simPressures.ts` (`tests/sim-pressures.test.ts`); the additive,
Simulator-only kernel seams — `setTuning`, `setCritterRole`,
`clearPlantInstances`, `unsuppressPlantSpecies` — in `src/life/kernel.ts`
(`tests/kernel.test.ts`); the pin model (`pinEntry`/`unpinEntry`/
`pinnedEntries`) in `src/game/simDrawer.ts` (`tests/sim-drawer.test.ts`); the
one additive, empty-by-default `suppressedSpecies` set in `src/life/flora.ts`
(`tests/sim-suppress.test.ts`); and all the DOM wiring — the evolution tray,
the roll-a-web controls, the richness block hoisted into the census panel,
the pin toggle + "place pinned," the ×1/×2/×4 speed button, and the dev aids
(`?web=`, `?rich=`, `?evo=`, `?pressures=wild`, `?pin=`, `?reseed=`) — in
`src/game/worldlab.ts`.

Deferred to slice 5, unchanged: **save/resume to a named slot** with full
critter-state + RNG persistence (the one item that touches a real shared
file, `save.ts`) and **the ambient bench** (place pollinators/frogs/
dragonflies, opt-in experimental roles) — the remaining "frame &
persistence" v1 items the spec named but no slice has yet claimed.

## 17. Persistence (Simulator slice 5a)

Two saves get a memory upgrade in the same slice: the real game's own save
file, and a brand-new save slot for the World-Lab bench. The foundation
shared by both is a small insight about the seeded RNG: its **seed and its
running state are the same number**, so exposing that number is enough to
make every stream in the codebase resumable, with no separate "resume"
constructor needed anywhere.

**The `.state()` accessor — `src/core/rng.ts`.** `makeRng(seed)` keeps its
running position in one closed-over counter, and that counter starts at
exactly the `seed` argument's value — so `rng.state = () => a` costs one
line, and `makeRng(rng.state())` **is** the resume call: the ordinary
constructor already accepts a mid-stream position, because a seed always
was one. `Rng` widens to `(() => number) & { state?: () => number }`, still
callable exactly as before for every existing caller — `tests/rng.test.ts`
pins both the new behavior (a captured `.state()` resumes the exact
continuation, never restarting the draw sequence) and the old (`makeRng`
with a fresh seed matches its pre-slice-5a self byte for byte).

**Real game: `crittersV2` + `critterRng`, additive.** `SavedWorld`
(`src/game/save.ts`) gains two optional fields: `crittersV2?:
SavedCritterV2[]` and `critterRngState?: number`. `SavedCritterV2` is the
**lossless** full `Critter` row — every field of the runtime interface
(state, target, stateTime, hopPhase, facing, curiosity, mood, stuck, path,
pathGoal, meal), unrounded — unlike the legacy 4-column `critters:
number[][]` rows, which round position to `r1` and energy to `r3` for
compactness. That rounding is fine for "the animals are where you left
them" but fatal for bit-identity, so `crittersV2` is a new, parallel field
rather than a change to the old one. `meal` — a live `Plant` reference —
can't survive JSON, so it's packed as its index into `flora.all` and
re-resolved after restore, guarded against `removePlant`'s swap-pop having
moved a *different* plant into that slot before the save happened
(`flora.all[c.meal.idx] === c.meal`). `restoreCrittersV2` is a two-branch
dispatcher: `crittersV2` present → the new full restore (`restoreCritterRows`);
absent → the untouched legacy `restoreCritters` path, unchanged. Old saves
take the second branch and get today's exact behavior — locked by a GUARD
test (`tests/save.test.ts`, written before the schema changed) that loads a
legacy-shaped save (no `crittersV2`, no `critterRngState`) and asserts the
exact legacy defaults; a second dispatcher test re-confirms the fallback
branch directly. The payoff this earns: **the real game's animals now
resume mid-thought** — a critter mid-hop toward a berry bush, three
waypoints into a path, wearing "wary," restarts exactly there, rather than
snapping to idle-and-freshly-decided the way the legacy 4-column format
always did.

**`Flora` and `SimKernel` gain resume threading.** `Flora`'s constructor
already took an optional `RestoredFlora` for `tick`/`plants`/`soil`
(pre-slice-5a, the real game's away-time catch-up); slice 5a adds four more
optional fields — `rngState` (resume the flora rng stream instead of
reseeding at `seed ^ 0xf10a`), `substrates` (in-flight byproduct-chain
markers), `suppressed` (`suppressedSpecies` ids to re-apply), and
`lastSplitTick` (the speciation-cooldown gate, serialized as `undefined`
when `-Infinity` — not JSON-safe — and restored to `-Infinity` when absent).
Three new accessors — `rngState()`, `substratesSnapshot()`,
`lastSplitTickValue()` — let a caller capture live state without any of it
routing through `save.ts` (so `flora.ts` still never imports upward out of
`src/life`). `SimKernel` gained the matching `KernelInit` fields
(`restoredFlora`, `critterRngState`, `placeRngState`) plus its own
`critterRngState()`/`placeRngState()` accessors, all additive to
`KernelInit`'s existing shape.

**The `skipCap` fix — restore reproduces, it doesn't re-adjudicate.** The
resume path surfaced a subtlety: `Flora.addPlant` normally re-checks every
seed against the live density caps (`hasRoom`/`inHabitat`) before it roots —
correct for ordinary growth, wrong for restore. A plant that legally rooted
under yesterday's tuning could be silently rejected on replay if the live
tuning had since tightened (say, the pressures panel's `maxPerTile`
slider). `addPlant` gained a sixth, restore-only `skipCap` parameter:
`true` bypasses the density-cap half of the gate only — never the habitat
half, so a saved plant is still expected to sit on its own species' tile —
so restore **reproduces** the saved set instead of re-arbitrating it under
whatever tuning happens to be live now. Exactly one call site passes
`true`: the restore loop inside `Flora`'s own constructor (`flora.ts:185`);
every other `addPlant` call — ordinary growth, propagation, substrate
germination, the player's own sow — defaults `skipCap` to `false` and is
untouched. `tests/sim-save.test.ts`'s "PROBE3" regression plants over-cap
under a loose tuning, tightens the tuning, and confirms restore still
reproduces the over-cap tile rather than thinning it back down.

**`SavedSim` — a separate slot, in a separate namespace.** A World-Lab
construct is not a `SavedWorld`: it can hold rolled/introduced species
mid-session, drawer tombstones, hand-painted tiles, live tuning drift —
nothing the real save format models. `src/game/simSave.ts` (new) defines
`SavedSim` (its own `v: 1`, no shared migration path with `SavedWorld`) and
a slot store keyed `wander.sim.<id>` / indexed at `wander.sims`, deliberately
parallel to — and never overlapping — `worldKey`'s `wander.world.<seed>` /
`wander.worlds`. A sim slot can never collide with, evict, or be evicted by
a real island: `tests/sim-save.test.ts`'s non-collision test asserts the key
functions and index-key constants are pairwise distinct, and its round-trip
test asserts a sim-slot save leaves `store.getItem(worldKey(seed))` at
`null`. Slots are capped at `MAX_SAVED_SIMS = 8` and evicted oldest-first —
the same shape and cap `MAX_SAVED_WORLDS` already uses, sibling data in a
sibling namespace.

**`packSim`/`restoreSim` — the whole construct, bit-identically.** `packSim`
gathers every determinism-critical crumb of a running `SimKernel` plus its
`DrawerEntry[]` roster: flora (tick, plants, soil, rng state, substrates,
suppressed species, `lastSplitTick`, and the **live** `FloraTuning` —
captured wholesale so a resumed run doesn't silently snap back to defaults
if the pressures panel had drifted it), the full lossless
`SavedCritterV2[]` roster (reusing the real game's own `packCrittersV2`),
both rng streams (critter + placement), the plant/critter species arrays
wholesale (so runtime `introducePlantSpecies`/`introduceCritterSpecies`
additions and in-place mutations — a den relocation, a role repaint —
survive), the drawer, and the tile grid **only when it's been hand-painted**
away from the pure `buildConstruct(starter, seed)` baseline (a byte-for-byte
diff against a freshly built map; an unpainted construct costs nothing
extra). `restoreSim` reverses each field exactly: rebuilds the map from
`starter`+`seed`, overlays painted tiles if present, reconstructs the
`SimKernel` via the new `KernelInit` resume fields, restores critters last
(so `meal` re-resolves against the live, just-rebuilt `flora.all`), and
calls the drawer's new `syncKeySeq` so freshly-minted keys can never collide
with a resumed entry's key. `tests/sim-save.test.ts`'s round-trip test
proves the whole thing: pack, `JSON.stringify`, `JSON.parse`, restore, step
N more ticks — snapshot-equal to a kernel that never stopped, including
carry-forward tests for a speciated daughter species and for non-default
tuning.

**The bit-identical replay proof, at four compounding levels.** Slice 5a
proves *resumption* — not merely restoration — holds at every layer it
touches: (1) `tests/rng.test.ts` — a captured `.state()` resumes the exact
continuation of a bare stream; (2) `tests/flora.test.ts` — a `Flora`
resumed from a snapshot at tick N, stepped M more, matches a `Flora` run
straight through to N+M; (3) `tests/kernel.test.ts` — the same proof one
layer up, over the whole `SimKernel` (flora + critters + both rng streams),
including an explicit "resume-then-run equals running N+M straight through
from the start" test; (4) `tests/sim-save.test.ts` — the same proof again,
through a full JSON round-trip of `packSim`/`restoreSim`. Each level is a
strictly stronger claim than the one below it — a JSON round-trip subsumes
an in-memory resume, which subsumes a bare stream continuation — and all
four are green.

**The binding invariants, checked.** *Determinism:* `grep -nE
"Math\.random|Date\.now|new Date\(" src/core/rng.ts src/game/save.ts
src/game/simSave.ts src/life/flora.ts src/life/kernel.ts` finds **nothing**
— not even a `savedAt` stamp; all five files treat `savedAt` as data handed
in by a caller, never a clock any of them reads itself. The one wall-clock
read in the whole feature (`Date.now()` at the moment a save button is
clicked) lives one layer up, in `main.ts`/`worldlab.ts`/`picker.ts` — the UI
chrome, outside anything the sim/restore logic touches. *Real-play
inertness:* `addPlant`'s `skipCap` is `true` at exactly one call site (the
restore loop inside `Flora`'s own constructor); every `RestoredFlora`/
`KernelInit` resume field is optional, and the real game's only `Flora`
construction site (`main.ts`, restoring `tick`/`plants`/`soil` — pre-existing,
unrelated to this slice) never passes `rngState`/`substrates`/`suppressed`/
`lastSplitTick`; `main.ts` never constructs a `SimKernel` at all. *Mode
isolation:* `main.ts` dispatches once, at boot, to either ordinary play or
`startWorldLab()` (`?sim`) — never both — so `kernel.ts`'s and
`simSave.ts`'s resume machinery only ever runs inside the Simulator; the
router's own truth-table test still guards the split.

**Where it lives:** the accessor in `src/core/rng.ts` (`tests/rng.test.ts`);
the additive real-game fields + lossless critter-row functions in
`src/game/save.ts`, shared by both the real game and the sim slot
(`tests/save.test.ts`); the resume threading in `src/life/flora.ts`
(`tests/flora.test.ts`) and `src/life/kernel.ts` (`tests/kernel.test.ts`);
the new slot type + storage + `packSim`/`restoreSim` in
`src/game/simSave.ts` (`tests/sim-save.test.ts`); the drawer's
`nextDrawerKey`/`syncKeySeq` in `src/game/simDrawer.ts`
(`tests/sim-drawer.test.ts`); and the World-Lab's save/load-slot row — a
name-on-save `window.prompt` mirroring `nameWorld`'s, and a slot picker
mirroring the isle picker — in `src/game/worldlab.ts`.

Deferred: a `census: SpeciesTrace[]` is captured in every `SavedSim` for
chart continuity, but `restoreSim` has no path yet to feed it back into a
resumed kernel's own census log (chart-only, feeds no rng — noted directly
in `packSim`'s own comment); persisting the **real game's** flora/bird/beast
rng streams is explicitly out of scope for slice 5a — only the critter
stream is persisted there (the sim slot, by contrast, persists flora's rng
stream too, since the Simulator has no separate bird/beast layer to omit);
and a `v: 2` migration framework for either save format, should a future
schema change ever need one.
