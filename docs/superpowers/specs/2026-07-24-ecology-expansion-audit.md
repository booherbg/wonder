# The Ecology Expansion Audit — what the world can't yet express, and how to open it

*Written 2026-07-24 against commit `300ce6a`. This is **Part II** of the ecology
report; **Part I** is the technical field guide, and every claim about current
behaviour here is sourced there. Both halves are cross-linked section by section
in the browsable version:*

> **📖 [docs/ecology-report-2026-07-24.html](../../ecology-report-2026-07-24.html)**
> — open in a browser. Part I (field guide) · Part II (this document, with
> diagrams and screenshots).

*This markdown copy exists for git review and for agents reading the repo; it is
the same content as Part II of the report.*

Reads on: [ecosystem-vision.md](ecosystem-vision.md) ·
[ecology-ground-engine.md](ecology-ground-engine.md) ·
[disease-and-diversity.md](disease-and-diversity.md) ·
[prior art](../research/ecosystem-prior-art.md) ·
[Scavenger's Reign study](../research/scavengers-reign-design.md) ·
[food-web & byproducts](../research/food-web-and-byproducts.md)

---

## 0 · The diagnosis in one paragraph

Wonder has built an extraordinary amount of *machinery* for evolution and
almost no *evolution*. Plants carry nine heritable traits, cross, mutate,
speciate, and log their history — but their reproduction rate is a flat
constant, their mortality is uniformly random, and six of the nine traits are
read by nothing but the sprite renderer. Insects have a genuinely excellent
adaptive layer (the identity map) that is used for exactly one relationship
and connects to plant genetics through a single integer. Critters cannot be
born, cannot die, and cannot change. The word for what the flora does is
**drift**, not adaptation: a random walk with a speciation tripwire attached.

Everything below is about closing that gap — not by adding systems, but by
making the ones that exist *consequential*.

---

## 1 · The five things that are structurally impossible right now

Before the ideas, the constraints. Each of these is a thing you literally
cannot observe on any island, at any seed, at any tuning.

| # | Impossible | Because |
|---|---|---|
| 1 | **A trait becoming more common because it works** | `simTick` reproduces a uniformly-sampled plant at a flat `reproChance`; the crowding thin removes a uniformly-sampled plant. Genome never enters either decision. |
| 2 | **An animal adapting to a plant** | Palate, role, size, morph are frozen at worldgen. There is no fauna reproduction of any kind. |
| 3 | **Two species partitioning a resource** | The only scarcity is tile slots. No light, water, nutrient, or time axis exists to partition. |
| 4 | **Something new entering the world** | The species list can only *split*, bounded at 12 daughters. No source term. |
| 5 | **A disturbance the ecology recovers from** | No fire, blight, flood, storm, or die-off. Succession has no reset, so diversity has no maintenance mechanism. |

Note the shape: (1) and (2) are about *selection*, (3) about *niche*, (4)
about *origination*, (5) about *disturbance*. Those four words are the whole
ecology. The engine currently implements none of them, and implements
*inheritance* beautifully.

---

## 2 · Foundations — four small changes that turn drift into evolution

These are deliberately tiny. Together they are, I think, the highest
value-per-line work available in this codebase. None of them adds an entity,
a save field, or a key.

### 2.1 Selective mortality — make the thin *choose*

`flora.ts:534` picks a crowding victim at random. Change it to sample k=3 and
remove the *worst* of them by some local fitness. That single edit is the
difference between a random walk and evolution, because it is the first time a
genome ever affects a plant's expected descendants.

The fitness function can start absurdly simple and still work:

```
fitness(p) = 1
  × shadeTerm(p)      // §2.3 — tall wins light, short loses it
  × kinTerm(p)        // penalty for being surrounded by near-identical kin
  × visitTerm(p)      // bonus if recently fed on / pollinated
```

Every term is optional and independently shippable. Even *one* of them makes
the island's flora start bending toward something.

> **Design guard.** Selection must express as a *rate*, never an event. A
> plant that loses does not die visibly of losing; it is simply the one the
> crowd thins. The peaceful pillar survives intact — this is the same
> mechanism that already runs, just with an opinion.

### 2.2 Make `spread` govern dispersal distance

`spread` (0.1–1) currently draws bushier sprites. Let it scale
`reseedRadius`: a high-spread plant throws its children further but with a
lower per-seed take rate (fewer placement attempts, or a per-tile penalty).

This is the **colonization–competition tradeoff**, the single most-studied
coexistence mechanism in real ecology. Two species can then stably coexist on
one habitat: one wins locally, one wins the empty ground. Today, two species
on one habitat simply race and one wins.

Cost: about ten lines in `propagate`.

### 2.3 Make `height` govern light

One float per tile: `shade = Σ height over the plants on it`. A plant's
reproduction multiplier reads its own height against the shade *above* it.

This is the cheapest possible niche axis and it pays enormously:

- `height` becomes load-bearing — a real cost/benefit rather than decoration.
- Forests stratify: canopy, understory, ground layer, with different winners.
- The eleven forms that currently do nothing ecologically get a role — Moss
  (0.05–0.25) and Fungus (0.10–0.45) become *specialists of the shaded floor*
  instead of just short things.
- Trees get an ecological function for the first time (they are currently
  outside every web: no critter eats them, no insect visits them).
- It couples straight into fire, gaps, and succession later.

### 2.4 The learned palate — let critters adapt without being born

Fauna can't evolve because they can't reproduce, and giving ~30 named,
den-having, trust-bearing creatures a birth/death cycle is a large and
possibly unwanted change. There is a cheaper answer that is also better
design: **let the palate drift toward what the animal actually eats.**

On each completed nibble, nudge the kind's `hueCenter` a hair toward the
genome it just fed on (and `glowTaste` likewise). Bounded, slow, per-kind.

- It is *learning*, not genetics — honest to "nothing is born, nothing dies".
- It closes the co-adaptation loop: plants bend toward their dispersers
  (already true), and now dispersers bend toward the plants that persist.
- It is visible: a kind's palate swatch in the codex shifts over island-days,
  and the journal can note "its taste has moved".
- It creates the first **runaway** in the game — disperser prefers red, spreads
  red, finds more red, prefers red harder. Which is exactly the kind of thing
  that should then need a brake (§5).

Roughly twenty lines in `fauna.ts`, one new persisted field.

---

## 3 · Multiple pixel maps — generalize the identity map into a tag space

The `IdMap` (`life/idmap.ts`) is the best mechanic in the codebase: a 7×7 grid
of 7 states with a reward economy (upkeep 0.10, base hit 0.20, jackpot 0.90,
neutral trickle 0.02) that produces specialists, generalists, and camouflage
from one function. It is currently used for exactly one relationship —
insect sensor against flower appearance — and it is not even connected to the
plant's real colour.

**The move: treat the idmap as a general *channel* primitive and run several
of them.** Same grid, same economy, different meaning. The interesting part is
not any single channel; it is the leakage between them.

| Channel | Emitted by | Read by | What it buys |
|---|---|---|---|
| **appearance** *(shipped)* | flowering plants | insect swarms | pollination, camouflage |
| **scent** | every plant, on every form | critters (and the beast) | the 11 forms that currently have no animal get one; a scent map is a *second* way to be findable, so a tree can matter |
| **soil** | a tile, accumulated from what died / was eaten / was dropped there | germinating plants | succession, litter, allelopathy, seed banking, fire-followers |
| **search image** | — | insectivores | a real camouflage arms race (§4) |
| **warning** | plants and insects that are "costly" to eat | anything that eats | aposematism and Batesian mimicry fall out of a sign flip on `matchReward` |
| **song** | insect clouds, converging | clouds; and plants that *mimic* it | sensory exploitation — a flower that fakes the chorus gets visits it never earned |

Three specific things this unlocks that nothing else does:

**Trait conduits become physical.** The food-web study left this as the open
fork: if a substrate carries the eaten plant's signature *into the soil map*,
and germinating plants read the soil map, then colour genuinely travels the
island. You can watch a hue walk from a meadow to a shore over island-days,
carried in bellies. Cause and effect you can trace — the exact thing the
Scavenger's Reign study argues makes an ecology feel alive.

**Place stops being a boolean.** Today a tile either is or isn't your habitat.
With a soil map, ground has *history* — it has been a fungus patch, then a
burn, then meadow — and germination reads that history. Islands develop a
past you can read from the dirt.

**Mimicry becomes possible without deception being cruel.** A harmless
species that copies a costly one's warning map free-rides. A flower that
copies a *different* flower's appearance map borrows its pollinators. Both are
real biology, both are gentle, and both are pure emergence from the existing
match function.

---

## 4 · The missing trophic level — critters that eat swarms

This is the user's own instinct and it is exactly right, and it is also
*almost free*, because the top of the food chain is currently a constant:
`WORLD_PREDATION = 0.6` in `game/swarms.ts:61`, described in its own comment as
"standing in for generic insectivores." Meanwhile one to two bird flocks fly
around the island eating nothing at all.

**Add one role: `insectivore`.** Its palate reads sensor maps instead of plant
genomes — the same `appetite` shape on a different tag space. `applyPredation`
already takes a `pressure` scalar; make that scalar *local and sourced* rather
than global and constant.

What this produces, in order of how surprising it is:

1. **Predation becomes geography.** Safe bays and dangerous meadows. Swarms
   are thinned where insectivores actually are.

2. **A frustrated optimization.** Right now a cloud has one goal: match the
   flower. Add a predator with a search image and the cloud has *two goals in
   tension* — match the flower to feed, don't match it where you'll be seen.
   Frustrated optimizations are where persistent diversity comes from in real
   systems, and they never settle. This is the single best answer to "how do I
   get surprised by adaptiveness."

3. **Local divergence for free.** Clouds in bird country drift away from
   clouds in safe country *while working the same flower*. Same species, two
   shapes, one island. `divergeSwarm` already exists to bud the cousin.

4. **The predator adapts back.** Give the insectivore a search-image map that
   drifts toward what it has actually caught, and you have a two-sided arms
   race in a system where nothing dies.

5. **A three-level colour conduit.** Flower colour → insect colour → predator
   search image. Change the flowers and the birds' plumage-preference follows,
   two links downstream, over island-days.

**The peaceful contract holds.** `applyPredation` never kills discretely — it
lowers a float. An insectivore is an animal that makes clouds *thinner near
it*, visible as a cloud that keeps its distance and stays drab. No corpse, no
chase, no fear. The existing `Drives.fear` slot stays deferred; predation here
is a pressure on populations, not an event in a life.

**The chassis is already there.** `life/birds.ts` has flocks that fly, settle,
perch, and flush. Give a flock a sensor map and a feeding radius and the
system is done.

*And the symmetric move:* a **frugivore/nectarivore critter** whose palate
reads the flower's appearance map rather than the plant's genome — so
pollinator-plant and disperser-plant relationships stop living in separate
alphabets.

---

## 5 · The Heart — a source term for the world

The species list is closed. Islands can split lineages twelve times and then
they are done, forever. There is nothing in Wonder that *makes new kinds of
thing*, and that is the deepest reason a long session eventually settles.

The proposal, and it is the one I'd most like to build:

### 5.1 The feature

A rare worldgen feature alongside `Crater` and `Pocket` — **the Heart**: a
cave mouth in the rock, faintly lit, breathing on a slow cycle. Perhaps one
island in six. Visible from a distance at night.

### 5.2 What it emits

Every island-day or so, the Heart releases a **Mote of the Unformed**:

- an entity whose *only* genome is a random idmap
- no form, no habitat, no role, no species
- an economy deliberately set to **losing**: high upkeep, near-zero income

A Mote is dying from the moment it appears. It has a few island-hours to find
something to be.

### 5.3 How it becomes something

The Mote wanders and *samples*. Each tick it scores its map against every
channel in reach — nearby flower maps, the soil map under it, insect sensors,
critter scent, the warning channel. Reward accumulates per channel. When one
channel's accumulated reward crosses a threshold, the Mote **commits**:

| Channel it fed best on | What it becomes |
|---|---|
| soil map | a **plant**, of a form matching the tile and the map's structure |
| flower appearance | an **insect swarm** homed on that bloom |
| scent | a **critter kind**, palate cut from what it tasted |
| warning | a **mimic** of whatever it was copying |
| nothing, in time | it fades back to the Heart |

**Commitment is speciation from nothing.** The new kind enters the ordinary
species list, gets a name in the codex voice, and lives under all the ordinary
caps.

### 5.4 Why this is the surprise engine

Because *what a Mote becomes is determined by what the island had room for*.
Release one into a saturated meadow and it starves and returns. Release one
into a habitat with an unworked flower, and it becomes the pollinator that
flower never had. Release one on burnt ground and it becomes a fire-follower.
**You cannot predict the output, and the output is always an answer to a
question the island was actually asking.** That is a fundamentally different
kind of surprise from "the dice rolled a purple one."

It also gives the whole world a spine of lore that is never stated: everything
here descends from the cavern, and you can watch the process happen.

### 5.5 The player verb it creates

Motes can be carried. Pick one up in the pouch and it becomes the most
interesting item in the game, because **where you release it decides what it
is**. Release it in the marsh and it becomes a reed; carry it to the shore and
it becomes something that lives in the shallows. A player who understands the
system can *aim* the world's creativity without ever setting a value.

That is exactly the "tilt the dice, never set them" line the ecosystem vision
drew for the bench, arrived at from the other direction.

### 5.6 Balance and the peaceful pillar

- Emission is bounded and slow; commitment requires a genuine reward
  threshold, so most Motes fade.
- **Make the emission rate read the island's unfilled niche volume**: a rich
  island's Heart is quiet, a barren one's is prolific. The source term
  self-balances, and a flat seed (like seed 42) is no longer a dud — it is a
  place where the Heart is *busy*.
- Fading is not death: a Mote that fails **returns to the Heart**, and the
  Heart *remembers*. Its future output drifts toward everything that has ever
  come back to it. An island's Heart becomes a slowly-accumulating memory of
  its own failures — and ghost lineages can resurface decades later.

---

## 6 · What drives adaptation, besides reproduction

The question deserves a direct taxonomy. Every row is implementable against
current code.

| Driver | Mechanism | Current status | Cost |
|---|---|---|---|
| **Differential survival** | selective crowding thin (§2.1) | absent — mortality is uniform-random | ~15 lines |
| **Resource scarcity** | shade / light per tile (§2.3) | absent — only tile slots are scarce | one float per tile |
| **Escape** | predation with a search image (§4); blight that spreads along likeness | absent; blight specced, unbuilt | one role, one map |
| **Access to a service** | pollinator *choice* — clouds score blooms by match × nectar × display, so flowers compete for attention | absent — `chooseFeedPlant` picks nearest / fullest | ~20 lines in `swarms.ts` |
| **Dispersal reach** | `spread` → throw distance, with a per-seed cost (§2.2) | absent — `reseedRadius` is a global constant | ~10 lines |
| **Time / phase** | seasonality; carrying capacity that *pulses* with rain and season; night-blooming vs day-blooming as a real temporal niche | absent — all four cycles are cosmetic or flat multipliers | moderate |
| **Kin structure** | inbreeding depression: reproduce worse when local kin are near-identical | absent — `driftDistance` exists and is used only for speciation | ~10 lines |
| **Mutualism debt** | a plant that has been visited recently reproduces better; one long unvisited decays | absent — visits are pure bonus, never necessary | ~10 lines |
| **Symbiosis** | two lineages that co-occur and match long enough fuse (§7) | absent | moderate |

The prior-art doc's strongest finding is sitting in row six and is currently
unused: **making carrying capacity vary periodically *enlarges* the zone in
which species coexist** (Swailem & Täuber, Phys. Rev. E 107, 2023). Wonder has
day/night, tide, rain, bloom-day and aurora — five periodic signals — and not
one of them touches carrying capacity. Wiring rain or season to per-tile
nutrient (or even just to `maxPlants`) is a one-line change with a
theoretically-grounded stabilizing effect. That is the cheapest real win on
this whole list.

**And the rule that keeps all of it peaceful:** every driver above expresses
as a *change in rate*, never as an event in an individual's life. Nothing
starves, nothing is hunted, nothing suffers. Populations rise and fall.

---

## 7 · Weird things to put in the world

The surprise budget. Ordered by (my estimate of) delight per unit of work.

**Wind.** One vector per island, rolled at worldgen. Biases the tile choice in
`propagate` and `pollinateSpread`. Windward and leeward floras diverge; seeds
pile against ridges; the island develops an *orientation*. Perhaps ten lines,
and it makes every map read differently.

**The seed bank.** A dying plant leaves a dormant substrate carrying its full
genome. Disturbance — fire, flood, a player's hoe — germinates it. Nothing is
ever truly lost; the island remembers its dead. Tilling old ground and finding
a lineage that vanished twenty island-days ago is one of the best possible
moments this game could have.

**Fire.** The missing disturbance, and the classic diversity-maintenance
mechanism. Lightning on a storm night, on a dry island, burns a swath. It
*enriches* the soil map rather than sterilizing it. High-glow forms burn hot
(glow reads as volatile oils — a real and lovely reason the psychedelic
lineages are dangerous to stand in). Fire-followers are species that germinate
only on burnt soil. It stays peaceful because it is weather.

**Symbiogenesis.** Two species that co-occur densely and match hues for long
enough **fuse** into a composite kind that inherits *both* parents' habitats.
Mechanically it's `cross()` across a species boundary plus a habitat union.
This produces genuinely astonishing organisms — a moss-coral that lives on
rock *and* in the shallows — and it is real biology (endosymbiosis).
Reserve it heavily: once or twice per long-lived island.

**Epiphytes — habitat as a *form*, not a tile.** Let a species' habitat be
"on a Tree" rather than "on Forest floor". This doubles the niche space with
no new tile types, and it finally gives trees an ecological role. Vines and
mosses want this badly; they already read as things that should grow on
something.

**The midden.** Critter dens accumulate substrate over island-days and become
nutrient hotspots with their own distinctive flora. Dens stop being a
coordinate and become a place you can find by looking at the plants. The
vision doc's "little factories" arrives without a crafting system.

**The intertidal guild.** Tide already exists and is cosmetic. Plants that can
only reproduce at low tide, or only germinate on ground the tide has just
uncovered, create a temporal niche and a reason to be on the shore at a
particular hour.

**Ghost pollinators.** When a cloud's host species goes extinct, it keeps its
sensor map — a specialist with nothing left to specialize on. It either finds
a mimic, or fades. Watching a perfectly-adapted thing become obsolete is a
kind of story this game has no other way to tell.

**Chorus and sensory exploitation.** Insect clouds converge on a shared signal
channel. A flower whose appearance map drifts toward that signal gets visits
it never earned. Deception without menace; the "mutualism's white lie" the
Scavenger's Reign study already sketched.

**The Heart's tide.** (§5.6) The Heart emits faster where the island is
emptier. Barren seeds stop being duds and become *fertile* in the one sense
that matters.

---

## 8 · How they should compete

Three channels, in the order I'd add them. The rule that makes all three safe
is the same: **competition lowers a rate; it never triggers an event.**

1. **Space** — exists already, but is currently adjudicated by a coin flip.
   Make the thin selective (§2.1). Nothing new is needed; the existing brake
   simply acquires an opinion.

2. **Light** — vertical, one float per tile (§2.3). This is the axis that
   produces *structure*: layers, understories, gaps, succession. It is also
   the one that makes the most currently-inert forms suddenly make sense.

3. **Attention** — pollinator choice (§6, row four). This is the axis that
   produces *display*: colour, petal count, scent. It is the only competition
   that gets more beautiful the fiercer it gets, which makes it the most
   on-brand of the three.

What to explicitly **not** add: interference competition (plants attacking
plants), territoriality, exclusion. Wonder's whole thesis is that a peaceful
world can still be dynamic. Everything above achieves dynamism through
differential *rates*, which is both gentler and — per the prior-art doc —
closer to how real ecologies actually hold together.

---

## 9 · Instrumentation — you cannot tune what you cannot see

The World-Lab was built to make food chains legible and it currently plots
only population counts. Four readouts, in order of value:

1. **Trait distributions over time.** A hue histogram per species, sampled on
   the census cadence. This is the single most revealing chart the game could
   have and the sampling infrastructure already exists (`CensusLog.sample`
   takes a map; it just takes the wrong map). Right now genome drift — the
   thing the entire flora layer is *about* — is completely invisible in
   aggregate.

2. **A fitness readout**, the moment a fitness function exists: per-species
   mean fitness, and a trait-vs-fitness scatter. This is how you'd know
   whether §2.1 actually did anything.

3. **The lineage tree.** `PlantSpecies.parent` and `.bornTick` are recorded
   and never drawn. A dendrogram of an island's ✧ daughters is three hours of
   work and it is the island's autobiography.

4. **A niche-space map.** Plot every species in (habitat × hue × height) and
   show the *empty* regions. That view is both a design instrument and,
   later, the Heart's targeting display — it shows you what the island is
   about to invent.

---

## 10 · Recommended build order

Sequenced so each phase is independently shippable and each one makes the next
more interesting.

### Phase 0 — Make the existing genome matter *(small, and I'd do it first)*
- selective crowding thin (§2.1)
- `height` → shade, one float per tile (§2.3)
- `spread` → dispersal distance with a take-rate cost (§2.2)
- learned palate (§2.4)
- trait-distribution charts (§9.1) — so you can *see* whether any of it worked

Four small mechanics and one chart. At the end of this phase, Wonder has
evolution instead of drift, two genome traits stop being decoration, and the
first co-adaptive loop closes. Nothing new is on screen.

### Phase 1 — The soil map
Generalize `IdMap` to a second channel (§3). Tiles accumulate a signature from
what dies and is dropped there; germination reads it. This is the substrate
that fire, the seed bank, succession, and trait-conduits all stand on.

### Phase 2 — The insectivore
One role, one search-image map, birds as the chassis (§4). Predation becomes
local, sourced, and adaptive; camouflage becomes a real game with two players;
local divergence appears without any new species machinery.

### Phase 3 — The Heart
The source term (§5). Open-ended origination, and the best player verb in the
design space.

### Phase 4 — Disturbance and strangeness
Fire, blight (already specced), symbiogenesis, epiphytes, wind, the midden,
the intertidal guild. By this point every one of them lands into a system with
selection, niche, and origination already running, so each addition
*compounds* rather than sitting beside the others.

---

## 11 · Open questions for Blaine

1. **Fauna: learned palate, or real reproduction?** §2.4 gets co-adaptation
   without birth or death, and preserves the named-friend feel of critters. A
   true birth/death cycle would be more powerful and would cost the trust and
   companion systems their stability. My strong lean is learned palate — but
   it's your call whether critters should ever be *populations*.

2. **How many idmap channels before it stops being legible?** Three (appearance,
   scent, soil) feels like the ceiling for a player who's meant to read the
   system by watching. Warning and song are wonderful and might be one layer
   too many.

3. **The Heart: one per island, or one per world?** A single Heart shared
   across all islands (its memory accumulating across every island you've ever
   visited) is a much stranger and possibly better idea than one per island.

4. **Does the Heart emit into the player's pouch, or only into the world?**
   The carry-and-release verb (§5.5) is the most player-facing idea in this
   document, and it is the one most likely to break the "the world doesn't
   need you" pillar.

5. **Fire.** Is a burn compatible with peaceful, or does watching a stand of
   plants you loved go up cross the line? (My read: it's compatible, and it's
   the most important missing mechanic. But it's the one I'd most want you to
   veto if it isn't.)
