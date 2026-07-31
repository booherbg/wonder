# Ecology Foundations Rewire

We've built a fun little sandbox game here and the most interesting part is the relationship between the pollinators (insect swarms, currently) and the flowers that use pixel maps and genetic algorithms to drive adaptation.

Up until this point the system has been mostly emergent - pretty plants, biomes, and some critters, with various parts of the food web creating replicating species and beautiful pixel art. I want to revisit how the ecology of the system works from a foundational level, and am open to lots of new ideas to iterate through. I want to, above all, preserve the sense of wonder that we are driving towards and understand that we have lots of work to do create something that is intuitive, explorative, beautiful, enjoyable, and above all - surprising.

The main thing that I want to try and encapsulate is to give the generative fauna and flora real constraints based on limited resources. Thinking through a typical food chain example, and thinking through how energy flows in our world, there is a ton of interesting flow that almost entirely derives from either natural compounds in the soil or as direct energy from the sun. Modeling "light" and photosynthesis feels a little bit over-engineered, so let's start with the soil.

I am imagining that there are resources in this world that are available in the ground. Maybe each 'biome' is actually just a set of certain minerals that are available to the root systems of the plants that grow there. I can imagine there may be some steadfast defaults, but many of this may be rollable per-world, so that each world has consistency that is unique to that particular giaia (in world X, "wetlands" always have a high concentration of resource Y, for example). At a simple model, these resources are almost infinite in their availability (subject to potential constraints that we put on the world, like maybe high dessert has different constraints than a fertile river valley). The question then becomes - how do we enable gentic drift by plants such that they have to solve problems that lock them into competition and adaptation to the biome that they live in?

A simple example that comes to mind is that each biome has a 2D pattern that presents the availability of all of the resources for that biome. For now let's just assume it is a repeated pattern across the entire biome. Imagine a striped pattern, for example, alternating between several highly available minerals and one or two less available minerals. Plants that create a root system that efficiently extracts the minerals will have more energy made available for them to grow and reproduce.

This is similar to the insect's pixel map adaptation, but I want it to be more intricate. Genetic adaptation to a simple pixel grid is simple enough, but real biology is much more complex. Many different pieces all working together in ways that seem well timed, designed, and suited for the environment that they live in. I want this to be simple to understand for the player, but when observed it feels like watching something that could only have come into being through selective competition and genetic adaptation.

Imagine, as an example, mechanisms that drive a cellular automata - either 1D or 2D in nature, and at regular intervals the plant uses the generated CA to extract resources according to how well the generated pattern matches the biome's pattern. The plant's genetics will determine the particular rules, starting configuration, size etc. and there should be a real opportunity for the plant to generate very weird and interesting mechanics that ultimately shape how it extracts energy from the biome and competes against other plants for superiority.

What is undetermined in this model are things like: should we use the ground pattern as an input, run the system, and then evaluate at some later interval how well it has performed? Should we use the CA as a direct 'filter' and just extract energy according to how well it matches the pattern? Should we combine multiple mechanisms so that over time we see a kind of rube-goldberg machine that is weirdly adapted to the biome that it has grown in?

I also love the idea that the minerals themselves are determining what is possible in the plant. The plant should have unique benefits to the adaptation and specialization to that specific biome. For example, using the minerals to physically color the plant (so the pollinators, too, will ultimately take on the colors as a secondary effect). I also imagine that this energy, which is made available primarly by plants, travels up through the food chain in such a way that only through strong plant life and increased specialization can the next level of the food chain even exist. If a plan extracts 100 units of energy, that is energy now available to the insects and critters that use that plant for polliation events and food (birds/berries), and likewise those animals that prey on the insects are directly supported by that energy transfer as well.

An interesting consideration may be that we have some kind of baseline chemistry that determines how certain minerals can be translated into other minerals. The trick here is to make it interesting enough that it leads to novel and surprising side effects, but not so complicated that it is not easily observable. Additionally - we don't want it to be so convoluted that a random roll of chemistry leads to a universe that isn't viable in the majority of worlds (which could be interesting to explore but could get boring when 9 out of 10 worlds develop the equivalent of moss as the only producer of energy).

I'm thinking this could be a simple fundamental set of "chemical reactions" that are actually just cellular automata chains with predetermined rules. For example, 3 of mineral A and 2 of mineral B -> transmuted into mineral C (which maybe is not available in this biome but has some other advantage where a species may want to produce it - for coloration purposes or pattern matching, or even signaling and camoflauge). It could also be that certain plant species can perform certain chemical actions cheaply (or for free) - so they already have certain minerals available to animals that can process them or know how to look for them.

It's also possible that a biome may have, say, 3 minerals in abundance but only small traces of a handful of other minerals. Those animals that can create a chemical pipeline to produce an abundance of minerals that are not easily available may have some advantage in defense, reproduction, or behavior.

The whole goal of this is to create a natural flow of energy through a food chain that provides concrete machinery for selective exploitation and adaptation, leading to the rise of specialization and niche exploration, co-adaptive evolution, surprising mechanics and depth. I think there should also be some kind of generative modality - not just of form but of something that can lead to surprising interactions and behaviors when the generative process ends up in different basins from where it may have originally started (just thinking about our own world and how interesting it is to observe nature in general).

The food web, to keep things simple, could look something like:

- Minerals in the ground
- Biome layer (consistent pattern from the mineral roll)
- Plant layer (extracting and specializing in the mineral adaptation, pollination, flower/form/trees/berries)
    - Insect layer (pollination swarms, adaptation, energy transfer of minerals for their own use, reproduction, etc)
    - Bird layer 
        - Berry consumer: (consuming the fruit of a plant, potentially totally different from the pollination system)
        - Insect hunter: birds landing on a plant and trying to find feeding insects - picking ones that are the most stand-out on the plant
    - Critter Layer: feeding on plants directly (foilage? berries?) or also hunting insects as they travel or feed

The energy transfer, thus, looks like plants having a rich availability, insects being numerous in swarm and population (as they pollinate and acquire energy from plants), birds and critters being supported by the insects and plants.

A thought on energy transfer: maybe it is such that minerals have fixed potential energy (mineral A always has 10 energy units) but the effectiveness of extraction has to do with an adapted CA/pipeline based on the chemical reaction tooling of the world. Thus, animals that create extraction pipelines that are useful in their region will excel at energy extraction. In this way, it would be interesting to think through whether energy is preserved as it passes through the food chain or whether it is spent and must be re-harvested. There could be a potential where individual minerals are not that useful on their own, but as they are combined into bigger compounts, there is more energy stored or available - if the critter has the mechanism for working with it. Again imagining CAs (because they're easy to generate and run and visualize).

I think having animals that can take advantage of different scopes are also interesting. A small insect may only need a little bit of energy to survive, so it can take advantage of smaller flowers (for example) and be numerous in population but provide only a little energy to the predators who must then eat more of them. A more highly adapted sensor system can provide way more food, and thus more functionality and size, pushing the complexity of animal adaptation to new levels and providing a boon for predators who can consume fewer insects for the same energy intake - if they can adapt and catch them.

When thinking about plants, I also imagine a 'host' view that is different from what we have now. Instead of just a simple flower, the host view is a 2D canvas (say... 30x50 or so) that has the body of the plant as well as a view of the flowers / berries / leafs / whatever else. A small plant may only have one flower and it is limited in the amount of pollination events that can happen over time. A larger plant may have more flowers, or one giant flower, etc. We'll want to work out a system where insects can find these flowers in their region, land on the plant (we would see pollinators in this host view), and they're actually taking on the colors of the world and food that they consume because it drives their energy and reproduction, and helps them avoid predators who are looking at the host view for insects to eat that stand out. In fact this host view could be a main way to inspect how plants are operating and see their form, colors, patterns, etc. according to their phenotype. A beautiful view (is 30x50 big enough?) that lets us interact with the plant and has real advantages for insects who can use this to make decisions on where to land and which flowers to pollinate, or birds to determine which fruit to eat or insects to hunt, etc.

---
---

# A response

*Fable, 2026-07-31. Written against master at `5d63e24`, after reading the ecology
audit (`docs/superpowers/specs/2026-07-24-ecology-expansion-audit.md`), the unbuilt
Phase 0 plan, and the live source. Every code claim below has a `file:line` so you
can check me — and so a future session knows which claims went stale.*

---

## 0 · The short version

This proposal is **the fitness function the game has never had**, arriving from
underneath. That is a much bigger deal than it reads as, and I think it is the
right next move.

Three things I want to argue:

1. **It is a rewire, not a rewrite.** The two lines in `flora.ts` that currently
   decide who breeds and who gets thinned are both *multiplier chains*. Soil
   energy slots in as one more multiplier on each. Everything downstream —
   speciation, drift, the codex, 119 test files — keeps working.

2. **There is a join hiding in the code that makes the whole thing cohere.** The
   identity map has exactly **six** colours. Your soil has minerals. If those are
   the same six things, then "minerals physically colour the plant, and the
   pollinators take on the colours too" stops being a feature to build and becomes
   *a consequence of a lookup table*. Section 2. This is the part I'm most
   confident about.

3. **The stack you've described is about three systems too tall for one build.**
   Minerals + root growth + chemistry + compounds + trophic transfer + host view +
   scale niches is seven systems. There's a spine in here that's worth building on
   its own and that makes all the rest easier to add later. Sections 3 and 10.

And one honest caution: **the CA is the riskiest part of the design**, not because
it won't work but because evolving rule tables has a famously cruel fitness
landscape — long flat stretches, then a jump, and in the canonical experiments the
genuinely clever solutions turned up in 7 runs out of 300. That's a wonderful
source of rare marvels and a bad primary engine. §4.1 has a fix that keeps the
weirdness and adds a gradient to climb.

Two things I found while reading that I didn't expect, and that I'd lead with if
you only read one section each:

- **Nobody has built this in a game.** Spatial root competition for soil nutrients
  is thoroughly worked out in plant science and essentially unclaimed in games —
  the farming sims all do per-tile bookkeeping with no root extent. The only real
  precedent is a Google Research a-life artifact. §7.
- **The plant-science models split nutrients into mobile and immobile**, and the
  two demand *opposite* root strategies — sparse-and-far versus dense-and-local.
  One flag, two correct answers, real morphological divergence. It's the cheapest
  good idea in this whole response and it isn't mine. §4.2.

---

## 1 · What this proposal actually is

The 2026-07-24 audit found four structural problems. Worth checking your idea
against them honestly, because the score is better than you'd expect and the
misses matter:

| Audit finding | Does soil fix it? |
|---|---|
| **1. No fitness function.** Repro is a flat `reproChance`; the crowding thin picks a victim uniformly at random. Genome never affects descendant count. | **Yes, completely.** `uptake − cost` *is* a fitness function, and it's one the player can see, because it's a picture of roots against dirt. |
| **2. Fauna are frozen.** No birth, no death, no heritable variation in critters. | **No.** Still needs Phase 0's learned palate (B4), or real fauna populations. Soil doesn't touch it. |
| **3. Six of nine plant traits are cosmetic**, and `driftDistance` weights all nine equally so speciation fires on meaningless drift. | **Partly, and it makes one part worse.** New load-bearing traits arrive (affinities, root genes) — but they *dilute* `driftDistance` further. See §6.4; this needs handling in the same build. |
| **4. Only 3 of 14 plant forms can host pollinators.** Trees, kelp and coral sit outside every animal web. | **Yes.** Every form has roots. A tree that has never hosted an insect still competes for gold and violet in the ground under it. This is the cheapest big win in the whole proposal. |

So: two of four fixed outright, one improved-but-complicated, one untouched. That
is a very good ratio for one system, and it says something useful about ordering —
**soil and the learned palate are complements, not alternatives.** Phase 0's B4
(palate) and B5 (trait charts) should still ship; B1a/B1b (selective thin, shade)
get *subsumed* by this, because uptake is a better fitness term than the kin
penalty they proposed.

The deeper thing it fixes isn't on the list. Right now **place is a boolean.** A
species' habitat is a single `Tile` value (`species.ts:8`), and only 6 of the 11
tiles host plants at all (`HABITAT_FORMS`, `species.ts:18-26`). A plant either can
or cannot live on grass. There is no such thing as *better grass*. Your mineral
field turns habitat from a yes/no into a landscape with a shape, and that single
change is what makes specialization, gradients, edges and refugia possible.

---

## 2 · The join you may not have noticed: six minerals, six colours

This is the argument I'd most like you to react to.

`src/life/idmap.ts:12` and `:17` say:

```ts
export const MAP_NCOL = 6; // colours 1..6; value 0 = neutral / unpainted
const HUES = [0, 8, 44, 168, 276, 192, 338]; // ember, gold, mint, violet, teal, rose
```

**Six colours. Already named like minerals.** Ember, gold, mint, violet, teal,
rose.

Now look at what's wired to them today, and what isn't:

- A plant's flower map is built by `makeFlowerSignature(rng, flowerSize)`
  (`idmap.ts:39-54`) — it picks a base colour and an accent colour by **calling
  `randColor(rng)` twice**. The rng is seeded off the species id
  (`swarms.ts:465-473`). So a plant's appearance is **hash noise. It is not
  connected to the genome at all** — only its flower *size* is, via `petals`
  (`swarms.ts:451-460`).
- The insect's sensor map adapts toward that appearance, and the insect's rendered
  body colour is the sensor map's dominant colour (`insectSprites.ts:144,176-180`).
- Predation reads `conspicuousness = 1 − resemblance` (`swarm.ts:105-117`).

So the chain **flower colour → insect colour → predation exposure** is already
built and shipped. What's missing is the *first link*: nothing decides the flower
colour except a hash.

**Make the six identity-map colours be the six minerals.** Then:

```
what the roots pull out of the ground
  → the plant's pigment (base = its most-drawn mineral, accent = its second,
    or a transmuted one)
  → the flower map the insects match against
  → the insect's body colour, which is literally painted from that map
  → how visible that insect is to whatever hunts it
```

Every arrow after the first already exists in the code. You'd be replacing two
`randColor(rng)` calls with two lookups.

What that buys, concretely:

- **"Minerals physically colour the plant, and the pollinators take on the
  colours" is done** — not as a cosmetic rule but because pigment *is* the
  matching alphabet. It's the same six symbols all the way up.
- **Chemistry gets an instant, legible payoff.** A plant that can transmute
  `3 ember + 2 mint → violet` can wear a colour its soil does not contain. On an
  island where nothing else is violet, that's a flower no insect has adapted to
  yet — and the first swarm that does gets the jackpot cells to itself
  (`FLOWER_HIT = 0.9` vs `BASE_HIT = 0.2`, `idmap.ts:24-27`). You asked what
  advantage a species would want from producing an unavailable mineral. That's it,
  and it falls out of the existing reward math with no new rules.
- **A soil gradient becomes a visible colour gradient across the island.** Walk
  from the marsh to the ridge and the flora changes hue because the dirt changed.
  That is "show, don't commemorate" at its best.
- **It fixes a real defect.** Today a speciated ✧ daughter gets a *brand-new
  random* flower map, so appearance never inherits. If pigment comes from
  heritable affinity genes, daughters inherit a *shifted palette* — which is what
  you'd want and what the divergence machinery deserves.

Risk to flag: the flower map is currently one-per-**species**, cached
(`swarms.ts:476`). Pigment from a per-plant genome wants to be per-plant. I'd keep
the map's *shape* per-species and let the *palette* track the species' running
mean affinity, recomputed lazily. Cheap, and it keeps every cache intact.

---

## 3 · The spine I'd build

Strip the proposal to the smallest thing that is still the whole idea:

**A per-tile mineral field. A root that samples it. A surplus that decides who
breeds. And a plate that shows you all three at once.**

Here's the whole model:

```
mineralAt(x, y, m)  =  MOTIF[biome][m][(x mod P) + P·(y mod P)]      // the pattern
                    ×  concentration(m, moisture, elevation)          // the gradient
                    −  drawdown[tile][m]                              // what's been taken

uptake(plant)  =  Σ over root cells c   affinity[mineral(c)] · available(c)
cost(plant)    =  ROOT_COST · (root cells) + UPKEEP · size
vigor(plant)   =  clamp(uptake − cost, …)   normalised around 1.0
```

and then, in `flora.ts`, exactly two edits:

```ts
// flora.ts:548 — repro is already a multiplier chain; add one more link
let repro = t.reproChance * (this.tended(p.x, p.y) ? 2 : 1);
if (weather.rain) repro *= 1.6;
if (weather.bloom && p.genome.form === PlantForm.Fungus) repro *= 3;
repro *= vigor(p);                                  // ← new

// flora.ts:539 — the crowding thin acquires an opinion
if (crowd > 0 && … && this.rng() < crowd * 0.6 * frailty(p))   // ← frailty = 2 − vigor
```

That's it. That is the whole fitness rewire, and it lands inside the existing
peaceful contract — both changes are *rate* changes, nobody dies of an event, and
the thin still only decides *who*, never *whether*.

**Why the cost term is not optional.** Without `ROOT_COST`, the optimal root is
"fill the entire grid" and every lineage converges on the same blob within a few
hundred ticks. The cost is what makes root *shape* matter — it forces the plant to
choose *where* to spend cells, which is precisely what makes a striped soil select
for a striped root. I'd make cost superlinear in reach, so that big plants are a
real gamble rather than a strict upgrade.

**Where it hangs in the code.** All of this is already-worn grooves:

- `WorldMap` carries parallel row-major typed arrays (`tiles: Uint8Array`,
  `elevation: Float32Array`, `types.ts:42-58`). A mineral field drops in
  identically — or better, is *derived* from the seed and never stored at all.
- **`moisture` and `slope` are computed in worldgen and thrown away**
  (`generate.ts:271` and `:273-280`). They're local loop variables. Hoisting
  moisture onto `WorldMap` is one `Float32Array` and it is the single most natural
  input to a mineral gradient. This is a gift.
- `placeMaterials` (`materials.ts:54-100`) is the existing pattern for a
  deterministic per-tile scatter — `hash2d(x, y, seed ^ SALT)`, no rng stream, no
  save cost.
- `Flora.soilTiles` (`flora.ts:161, 273-300`) is the existing pattern for
  *mutable* per-tile state, end to end: state → accessors → an 18-line renderer
  overlay (`renderer.ts:498-516`) → save round-trip (`simSave.ts:43,182,235`).
  Drawdown should copy it exactly.
- Cost: the field is derived, so only drawdown needs storing, and only for tiles
  that have plants — sparse, keyed row-major like `byTile` already is.

**Perf is a non-issue,** which is worth saying because it's the usual objection.
`simTick` samples `min(simBudget = 480, all.length)` plants per tick
(`flora.ts:526-529`) on a 2-second heartbeat (`main.ts:124`), against ~8000 live
plants. An 8×8 root mask is 64 cells; 480 × 64 = 31k reads per heartbeat. And
because uptake is a pure function of (genome, tile phase), it caches — `core/lru.ts`
already exists for exactly this and is used by the sprite caches. Grow the root
once at germination, cache it, never recompute.

That last point is also a **design** answer, and it's the answer to the question
you asked at line 17. See §4.1.

---

## 4 · The design forks, with recommendations

### 4.1 How does the root read the soil? *(your explicit open question)*

You asked: run the CA and evaluate later, use it as a direct filter, or combine
into a Rube Goldberg machine?

**Recommendation: the root is a *growth process*, run once at germination, frozen
for life, and scored as an overlap integral.** Not a filter, not a re-run.

Three reasons:

- **It makes germination the decision point.** Where a seed lands determines
  whether its inherited root shape works *there*. That's real spatial selection
  and it's the thing that produces edges, refugia and local races — the good stuff.
- **It's cacheable**, so it's free.
- **It's true.** Roots are structural. A plant doesn't re-grow them each season.

Now, what generates the shape. This is the fork that matters:

| | How it works | Fitness landscape | Legibility |
|---|---|---|---|
| **A — CA rule table** *(your sketch)* | genome encodes rule + seed + size; run N steps; the pattern is the root | **Rough.** Long flat stretches broken by marked jumps — the SFI work calls them "epochs of innovation" (§7). | "its rule is 110" — opaque |
| **B — tropism growth** | roots grow cell by cell from the stem; continuous genes for per-mineral attraction, branch angle, branch chance, budget | **Smooth.** Every gene nudges yield a little. Reliable, visible convergence. | "its roots chase gold" — instantly readable |
| **C — hybrid** *(recommended)* | growth process as in B, but the step rule is a small discrete lookup on the local neighbourhood, and the *biases* are continuous | Smooth gradient with discrete jackpots available | mostly readable |

**Build B first, then try adding C's discrete part and measure whether it adds
surprise or just noise.** I'm recommending this sequencing rather than jumping to
C because B is the version that will *definitely* show you visible convergence in
a 60-second demo, and if B doesn't feel alive then C won't save it. If B does feel
alive, C is a small addition on top with a known-good baseline to compare against.

Tropism growth also gets you the thing you actually want from the CA — weird,
varied, unmistakably organic structures — because branching growth under a
directional bias field is exactly what produces plant-shaped things. It's the same
family as L-systems and diffusion-limited aggregation, both of which are famous
for looking alive.

**On the Rube Goldberg wish specifically:** I'd gently reframe it. Rube-Goldberg
depth comes from *a few primitives that can feed each other in many orders*, not
from any one step being baroque. The audit's own prior-art work landed on the same
conclusion — surprise is a function of interaction density, not rule complexity.
Your chain `mineral → compound → pigment → attraction → visit → dispersal → new
soil` is already six links with slack in it. That's the Rube Goldberg machine. It
does not need a complicated automaton at any single link, and it will be much
easier to debug and to *read* if each link is simple.

### 4.2 What is the soil pattern, exactly?

You said "a repeated pattern across the entire biome" and gave stripes as the
example. I think the instinct is exactly right and I want to name *why*, because
it's the constraint that keeps this whole design honest:

> **The soil pattern must be predictable enough to be worth adapting to.**

Random noise is unlearnable — there's no stable target, so roots can only ever be
generalists and the whole system flattens. A periodic motif is learnable: matching
its period and phase is a real, reachable, *visible* solution. **Pattern regularity
is the master tuning knob of this entire design**, and I'd put it on a slider in
the bench on day one.

Concretely, and cheaply:

```
mineralAt(x,y,m) = MOTIF[biome][m][(x mod P) + P·(y mod P)] × conc(m, moisture, elev)
```

- a small motif per (world, biome, mineral) — say P = 8, at **sub-tile
  resolution**, so one tile is roughly one motif period and a plant's roots span
  one to four tiles depending on reach. That gives you the scale niche in §4.5 for
  free: small plants work one patch, big plants span the seam between two.
- the motif is *tiled*, so the pattern is consistent and learnable;
- `conc` is a slow large-scale gradient from moisture/elevation, so the same motif
  is rich in the river valley and thin on the ridge. Same puzzle, different stakes.

For generating the motifs themselves, reaction–diffusion (Gray–Scott) is worth a
look — two parameters, and it reliably gives spots, stripes and labyrinths. That's
one rolled parameter pair per world producing organically varied but *structured*
fields, which is precisely the brief.

Only 2–4 of the six minerals should appear in any one biome. That's what gives a
biome its identity, and it's what makes moving between biomes a real problem to
solve rather than a re-tuning.

**And one mechanic worth stealing outright from the plant-science literature.**
The root-architecture models (OpenSimRoot, from Jonathan Lynch's lab) split soil
nutrients into two kinds that behave completely differently, and the split maps
onto game design beautifully:

- **Mobile** nutrients (their example is nitrate) diffuse freely through the soil.
  They reward **cheap, sparse, far-reaching** roots — go deep, go wide, don't
  bother being dense, because the resource comes to you.
- **Immobile** nutrients (phosphorus) form a tight **depletion halo** around each
  root segment. They reward **dense local foraging** — many fine roots packed into
  a small volume, because you only get what you physically touch.

Two mineral classes, one extra flag, and suddenly there are **two qualitatively
different root shapes that are both correct**, depending on what the ground under
you is offering. That's a real niche axis and a real reason for divergent
morphology, and it costs almost nothing. It also makes the depletion model in
§6.3 do double duty: mobile minerals refill from neighbours, immobile ones don't,
so a dense stand exhausts phosphorus locally and has to spread. I'd take this in
v1 — it's the highest texture-per-line item in the whole document.

### 4.3 Is energy conserved as it moves up?

**No — and I'd argue firmly against conserving it.** Energy in a real ecology is a
*flux*, not a stock. Roughly 10% survives each trophic transfer — Pauly &
Christensen measured a mean of **10.13%** across 140 estimates from 48 aquatic
models, with a standard deviation of 5.8 and a real range from about 2% to 50%.
Modelling conservation gives you accounting bugs and dull equilibria; modelling
flux gives you the pyramid for free.

*(One honest correction to the folk version of this, since it's the sort of thing
that gets designed around: "10% is why food chains are short" is **not** well
supported. Post 2002 finds energy availability limits chain length only in
genuinely resource-poor systems, and that ecosystem *size* predicts it better.
Chains run about 3–5 levels; take 10% as a defensible modelling convention, not a
law of nature.)*

But here's the trap, and it's a real one: **if you fund individuals from the level
below at realistic ratios, your top level is one bird that flickers in and out of
existence.** Two 10% transfers is 1%.

**So: use the pyramid to set soft carrying capacities, not to pay for
individuals.** Regional plant surplus raises the *ceiling* on swarm population;
swarm population plus plant surplus raises the ceiling on critters; and so on. A
level that loses its base doesn't die — it *thins*, slowly. That's a rate change,
so the peaceful pillar survives untouched, and it's the same shape as the periodic
carrying capacity the prior-art work already flagged as the cheapest real
stabilizer available.

There's a free bug-fix bundled in here. Nectar is currently **not a contested
resource**: `regenNectar` is called *inside* `stepSwarm` (`swarm.ts:121-127`) on a
species-shared flower object, so every swarm on a species gets its own full regen
and effective supply scales linearly with the number of swarms. Funding nectar
regen from the plant's actual surplus, drawn from a shared pool, fixes the
competition *and* wires the first trophic link at the same time. Small change,
disproportionate payoff.

### 4.4 How much chemistry?

Your own worry is the right one — a bad roll shouldn't produce nine moss worlds
out of ten. Two answers, and you should use both:

**Guarantee a floor by construction.** Two of the six minerals are *common*:
present in every plant-bearing biome, always directly usable, no reaction needed.
That's the moss floor, and it can never be rolled away. The other four are the
interesting part, rolled per world, some reachable only through chemistry. This is
your own "rare rolls should substitute, never remove" rule applied to chemistry.

**Then reject the rest.** Roll the reaction set, run a fast headless viability
probe, reroll if it fails. The codebase already does exactly this — `pickNewSeed` /
`diversityScore` in `foodweb.ts` rejection-samples worlds against a minimum-viable
floor. Same machinery, new predicate. Suggested gates: every plant-bearing biome
has ≥2 usable minerals; ≥4 of 6 minerals reachable island-wide; at least one
reaction is actually worth doing.

Scope: **4–6 reactions per world, plant-side only.** Animals get *affinities*
(what they can use), not pipelines. Your line 42 floats extraction pipelines for
animals too; I'd hold that back. It doubles the system's surface for a payoff the
plant side already delivers, and the audit's read — three identity-map channels is
about the ceiling for a player meant to learn this by watching — applies just as
much to chemistry.

### 4.5 Scale niches — cheap, do it

Small insect / small flower / numerous / low energy each, versus large / rare /
rich, is nearly free and adds a lot of texture. It's also half-built: flower size
is already `petals × 1.7` clamped to `[3,43]` accent cells (`swarms.ts:451-460`),
and `maxReward` already scales with accent count (`idmap.ts:81-85`), so bigger
flowers already pay more per visit. Add a body-size gene on the insect that sets
both its upkeep and its minimum viable flower, tie flower size to the plant's
surplus, and the ladder builds itself.

---

## 5 · The host view — and the pane you're missing

Yes to all of it. One structural note that I think is the difference between a nice
inspect screen and *the* image of this game:

> **The plate needs two panes: the shoot above the soil line, and the roots below
> it, drawn over the mineral field they're eating.**

Because the root/soil match is the entire new system, and it is otherwise
completely invisible. This is the trap the "playable-and-alive" pivot was created
to prevent — no more invisible depth. If the CA is the mechanism, the CA must be
on screen.

And a cross-section plate — shoot above, roots below, soil strata behind — is a
botanical-illustration convention that lands *exactly* on the naturalist's-codex
art direction. It's the most beautiful thing in this design and it's also the
most informative. You'd look at one plant and see, in one image: what's in the
ground here, what shape this lineage grew to eat it, whether that shape is
working, what pigment came out, and which insects are currently on it.

On your sizing question: **30×50 is right for the shoot, and it needs about 30×24
below.** Call it a 30×74 plate with a soil line about two-thirds down. At 30 wide,
a flower is a real 5-ish-pixel sprite and a perched insect is 2–3px — consistent
with the game's own dragonflies, and this view is finally where the 17 insect body
forms get *seen* (the QA audit flagged that they're invisible at standing zoom).

Three rows of the plate carry the whole causal chain, top to bottom:
**the insects on it → the pigment it wears → the minerals its roots took.** That's
the insight surface you've been asking for since the SimCity/Civ/Factorio note —
one screen where cause and effect are stacked vertically and you can just *read*
them.

One architectural caution: make the host view **a view, not a place.** Draw
perched insects from the swarm's actual state (population, sensor colours, match
quality) rather than simulating agents at that resolution. Faithful, cheap, and it
keeps the sim single-sourced. If insects genuinely need to make per-flower landing
decisions later, that's a separate, larger decision — flag it, don't smuggle it in.

---

## 6 · Where I'd push back

**6.1 The legibility budget is the real constraint, not the code.** Seven systems
at once will produce something you cannot debug and the player cannot read. The
audit's estimate was that three identity-map channels is about the ceiling for a
system meant to be learned by watching. I'd hold the same line here: minerals and
pigment in v1; chemistry and trophic ceilings in v2; compounds later or never.

**6.2 The CA fitness landscape.** Covered in §4.1 — mitigated by tropism genes,
not solved. Worth knowing going in that GA-over-CA-rules is genuinely hard, and
that its characteristic failure mode is *looks broken for a long time, then works*.
If the demo in §8 shows flat lines for 500 generations, that may be the landscape
rather than a bug — which is exactly why the demo should compare against the smooth
variant as a control.

The number that decided this for me is in §7: in the canonical SFI experiments,
genuinely sophisticated evolved strategies appeared in **7 of 300 runs**. A 2%
hit rate is a wonderful source of rare marvels and a terrible foundation for every
plant on the island. That's the whole argument for making the discrete part an
*upside* on top of a smooth base rather than the base itself.

**6.3 Depletion is what makes it move — but it must never hit zero.** Your doc
leans toward near-infinite availability. I'd add slow local drawdown with slow
regen, because that's what turns a static optimum into *succession*: a monoculture
exhausts its own band, its vigor falls, and a different affinity gets its opening.
Without depletion the island solves the puzzle once and holds. With it, the meadow
moves. But floor the drawdown well above zero — substitute, never remove.

**6.4 The genome is about to double, and that breaks speciation.** Adding six
affinities plus root genes takes the genome from ~10 traits to ~18.
`driftDistance` (`genome.ts:97-107`) is an RMS over *all* traits weighted equally,
and it's what triggers the ✧ split. The audit already flagged that six of nine
current traits are cosmetic, so speciation mostly fires on meaningless drift —
adding eight more traits makes that considerably worse, and it will quietly change
the speciation rate on every existing seed. This needs handling **in the same
build**: either weight `driftDistance` by load-bearing-ness, or speciate on a
declared subset. Don't let it be a surprise in week three.

**6.5 Two starters bypass worldgen.** `biome-sampler` and `single-biome`
(`construct.ts:16-61`) hand-fill their tiles with flat `elevation = 0.5` and never
call `generate()`. `biome-sampler` is the World-Lab default. Any mineral field
derived from elevation/moisture will read as blank there unless you give those
starters a defined field too — and you'll be staring at that bench all day.

**6.6 Determinism.** Everything above must come off the existing salted seed
streams. No `Math.random`, no wall-clock — the save model relies on it, `?warm=N`
relies on it, and the pinned-seed tests will catch you immediately. Pick unused
`hash2d` salts the way `rollShape` / `rollRelief` do (`generate.ts:30, 57`).

---

## 7 · Prior art worth an afternoon

*Every claim in this section was checked against a primary source. Where the
popular version of a story turned out to be wrong, I've said so — those are
usually the most useful bits.*

### The headline: nobody has built this in a game

Spatial root competition for soil nutrients is **well-established in plant science
and essentially unclaimed in games.** The farming-sim tier — Vintage Story is the
clearest documented case — is per-tile bookkeeping with no root extent at all:
three N/P/K levels on a farmland block, one crop, one block. The only real
precedent for what you're describing is a research artifact, not a shipped title.

That's worth knowing before you start. This is open ground.

### The four that will actually change the design

**Biomaker CA** (Google Research, 2023) is the closest thing that exists to your
exact idea, and it's a cellular automaton. A GPU/JAX cellular automaton where Earth
cells contain harvestable nutrients, **root cells absorb nutrients from nearby
Earth, nutrients diffuse cell-to-cell as a spatial field, and growing roots destroy
Earth cells** — which makes neighbouring plants direct below-ground competitors.
Read this one first. `ar5iv.labs.arxiv.org/html/2307.09320`

**OpenSimRoot / SimRoot** (Lynch lab, Penn State) is the serious version: 3D root
architecture grown in a discretized soil domain, with genuine multi-plant
competition (demonstrated on a maize–bean–squash intercrop). It's the source of the
mobile/immobile split I'm recommending in §4.2 — finite-element solute transport
for mobile nutrients, and a Barber–Cushman model resolving *depletion zones around
individual root segments* for immobile ones.
`pmc.ncbi.nlm.nih.gov/articles/PMC5575537`

**John Holland's ECHO** is the deepest fit, and it's already this game's
foundation — the identity map is ECHO-style tag matching. It also answers the
question your doc leaves open: how do minerals gate reproduction? In ECHO an
agent's genome is written in resource letters, and **to replicate it must acquire
enough of those resources to copy its own genome** — threshold × the count of each
letter it contains. Note the canonical ECHO world has **four** resources (a, b, c,
d), not six; my six in §2 comes from the identity map, not from Holland. Hraber,
Jones & Forrest, "The Ecology of Echo," *Artificial Life* 3(3):165–190.

This is the alternative to a scalar energy threshold, and it's the most interesting
fork in the document (§9.3). It makes minerals *structural* rather than fuel, gives
each species a genuinely different shopping list, explains chemistry in one
sentence, and "it needs two more gold before it can seed" is a thing a player can
hold in their head.

**Avida** rewards organisms for performing boolean logic on environmental inputs —
computation as metabolism, your CA idea in a different costume. Its headline result
is the one to internalise, and the numbers are stark: with a **ladder** of nine
tasks of escalating difficulty rewarded, **23 of 50** populations evolved the
hardest function (EQU). With *only* EQU rewarded, **0 of 50** did — and not for
lack of searching; those populations tested nearly twice as many genotypes.
(Lenski, Ofria, Pennock & Adami, *Nature* 423, 2003.) A follow-up detail that
matters: across 36 treatments that withheld one or two intermediate rungs, 124 of
360 still got there — so **no specific rung is essential, but the scaffolding is.**

Translated for you: don't reward only "match the pattern." Reward a graded ladder —
one mineral, then a pair, then the rare one — so there is always a next rung within
reach. This is probably the single most actionable finding in this section.

### The cautionary tales (read these before committing to the CA)

**GA-evolved cellular automata** — Mitchell, Hraber & Crutchfield (*Complex
Systems* 7:89–130, 1993) and Mitchell, Crutchfield & Hraber (*Physica D*
75:361–391, 1994), evolving radius-3 binary CA rules for density classification.
They report **four "epochs of innovation"**: flat best-fitness broken by marked
jumps. Two corrections to how this usually gets retold — they never use the words
"punctuated equilibrium," "stasis" or "plateau", so don't attribute those; and the
genuinely sophisticated solutions were **rare**, with particle-based strategies
emerging in only **7 of 300 runs** (Crutchfield & Mitchell, *PNAS* 1995).

Seven out of three hundred is the number I'd hold in mind when reading §4.1. It's
not that CA evolution doesn't work — it's that the good outcome is uncommon enough
that it can't be the thing every plant on the island depends on.

**SimEarth (1990) and SimLife (1992), Maxis.** SimLife — designed by **Ken
Karakotsios**, not Will Wright — shipped a first-party genome editor; its manual
says you can "directly look at an organism's genes and physically change them." The
legibility citation you want is Sherry Turkle's anecdote about a 13-year-old
playing it, who said of the message *"Your orgot is being eaten up"*: **"I just
ignore that. You don't need to know that kind of stuff to play."** Jimmy Maher's
Maxis retrospective backs it up — "it was all just so attenuated, so very
abstract" — and notes SimLife became Maxis's worst-selling release to that point.
Fair caveat: contemporary reviews weren't negative; the critique is retrospective.

**Creatures (1996), Steve Grand.** It shipped a real biochemistry — Grand, Cliff &
Malhotra's tech report describes four object classes (Chemicals, Emitters,
Reactions, Receptors) with reactions of exactly your form, `iA + jB → kC + lD`, all
genetically encoded and grounded in no real chemistry ("Chemicals have no inherent
properties"). Corrections to the folklore: **organs are a Creatures 2 addition**,
and there is no authoritative chemical *count* — 0–255 is an address space, so say
"a few dozen." The **Science Kit** was the player-facing chemical monitor. On
legibility, there's no Grand quote about players not perceiving it, but Cyberlife's
Toby Simpson said it "could take as long as an hour or two for the product to
'click' with people and start making sense." That's the number to beat.

### The rest of the shelf, corrected

- **Eco** (Strange Loop) — three soil nutrients (N/P/K), depleted by crops,
  replenished by fertilizer, with over-fertilizing penalised too. Two fixes to what
  I'd assumed: resolution is **per 5×5 plot**, not per tile, and the docs never
  mention crop rotation — only fertilizer and crop-to-soil matching.
- **Ecosystem** — developed by **Tom Johnson** (solo), *published* by Slug Disco
  (who made Empires of the Undergrowth). Genome-driven morphology is real: DNA
  "encodes everything about a creature: their skeletal structure, their mental
  processors and even their combat prowess," with selection on emergent swimming.
  It left Early Access at 1.0 in Nov 2024. It's a food *chain*, not a documented web.
- **Niche** (Stray Fawn, full release Sept 2017) — the reference for *surfacing*
  genetics, and richer than I'd credited: an explicit genotype panel showing both
  alleles with the dominant highlighted, plus co-dominance, multi-allele dominance
  hierarchies, and sex-linked genes. If you build a genome UI, start here.
- **The Sapling** — solo developer **Wessel Stoop**, still in Early Access. Per-
  organism energy budgets across a producer→herbivore→carnivore chain (different
  mouths get different energy from nectar/plants/meat). Note the dev says carnivore
  yield "is not that much higher" than herbivore — so it's an energy budget, not a
  transfer-efficiency model. Evolution is not player-directed: you design an
  organism, then optionally switch mutation on and watch.
- **Mito** (hellochar) — a tile-grid plant sandbox where you place root cells to
  draw water from soil. Single-organism, so no competition, but it's proof the
  root-placement mechanic *reads as play*.

### Non-game references

- **L-systems** — Lindenmayer, *J. Theor. Biol.* 18 (1968), as developmental
  biology for filamentous algae; the graphics came twenty years later. *The
  Algorithmic Beauty of Plants* is free from the authors at
  `algorithmicbotany.org/papers/abop/abop.pdf` (note the doubled path — the
  obvious shorter URL 404s).
- **Gray–Scott reaction–diffusion** for §4.2's motifs — Pearson's 1993 zoo
  (hexagons, stripes, self-replicating spots, chaos) is a **two-parameter** map
  over F and k with the diffusion rates held fixed, which is even better news for
  us: two rolled numbers per world. Worth knowing that Pearson notes this regime
  has no stable classical Turing patterns — it's a pattern generator, not a
  biology claim, and for our purposes that's fine.
- **Haeckel's *Kunstformen der Natur*** for the plate in §5.

---

## 8 · Demos, in the order I'd build them

The repo has a proven path for this: the last big pivot was de-risked with a
standalone HTML prototype (`docs/superpowers/prototypes/2026-07-21-identity-map-lab.html`)
before a line of game code was touched. Same play here. Each demo below is scoped
to answer **one** question, and the order is by how much each would change the plan.

**Demo 1 — The root bench.** *(build this first; it decides everything)*
One soil patch, one plant genome. Draw the root over the mineral field. Show
uptake, cost and surplus live. Then hill-climb a few hundred generations and watch.
**Decides:** does this evolve *visibly*, and how fast? If a root converges onto the
soil's stripes in under a minute of watching, the whole design is alive and
everything else is detail. If it doesn't, we found out for a day's work.
**Also settles:** tropism vs CA (run both, same field, same budget — this is the
control that §6.2 needs), what regularity the pattern needs to be learnable, and
whether the mobile/immobile split (§4.2) really does produce two distinct root
shapes. Read Biomaker CA (§7) before building it — it has already solved several
of the fiddly parts.

**Demo 2 — The soil plate.** Roll a world's minerals and biome motifs; render the
six fields as pixel plates; scrub the rolled parameters.
**Decides:** do rolled worlds look *distinct and beautiful*, and is 6 the right
number? Pure art-and-parameters, no simulation. Cheap, and it's the thing you'll
want to look at.

**Demo 3 — Two biomes, one founder.** Same starting species seeded into two
different mineral patterns. Run. Do they visibly diverge in root shape, pigment
and form?
**Decides:** does the system produce *adaptation to place* — the actual pitch — or
just two populations of noise. This is the demo that either sells the design or
kills it, and it only means something after Demo 1 works.

**Demo 4 — The host plate mock.** A static art mock of the two-pane plate at
30×74, with pigment swatches and a couple of perched insects.
**Decides:** resolution and framing, before any code depends on them. An hour, and
it front-loads the decision that's most annoying to change later.

**Demo 5 — Chemistry viability sweep.** Headless. Roll ~2000 chemistries, score
each against the §4.4 gates, plot the distribution.
**Decides:** how often is a world a dud, and do the guarantees hold — *before*
worldgen depends on it. Reuses the `pickNewSeed` rejection-sampling pattern
directly.

Demos 1, 2 and 5 are standalone. Demo 3 wants the World-Lab, where a mineral layer
would live as a pure `world/minerals.ts` + a `minerals` dock tab + a mineral row in
the materials flyout — the bench's own conventions
(`simDock.ts:13-31`, `simCharts.ts:54-62` has `biomeMakeup` sitting right where a
`mineralMakeup` wants to go). Start it on `?sim=1&starter=single-biome` for
isolation, then `&starter=playable-island` for realism.

---

## 9 · Open questions for you

The ones where your answer actually changes what gets built:

1. **Is this *beneath* the identity-map ecology, or *instead of* it?** My whole
   §2 argument assumes beneath: soil→plant is a new bottom layer, the flower map
   stays the plant→insect layer, and the join is that they share one six-symbol
   alphabet. Confirm, because if you meant *instead*, this is a much bigger and
   riskier build and I'd want to argue about it first.

2. **Does Phase 0 still ship?** My read: uptake *subsumes* B1a/B1b (selective thin,
   shade-as-fitness), but **B4 (learned palate) and B5 (trait charts) get more
   valuable, not less** — soil doesn't touch fauna at all, and you will badly want
   the trait charts to see whether any of this worked. Proposal: build B5 *first*,
   as instrumentation, then soil, then B4.

3. **Reproduction gate: a scalar energy threshold, or ECHO's "gather the letters
   you're made of"?** (§7.) The scalar is simpler and slots into the existing
   multiplier chain in one line. The ECHO version is stranger, more legible in
   words, and makes chemistry obviously necessary. I lean scalar for v1 with the
   ECHO rule as a v2 experiment — but this is genuinely your call and it's the most
   interesting fork in the document.

4. **Do minerals deplete?** (§6.3.) I want yes-but-floored. It's the difference
   between an island that solves itself and one that keeps moving. Costs one sparse
   map and some tuning.

5. **Six minerals — agreed?** It's forced if you take §2. If you'd rather have more
   minerals than colours, the join breaks and pigment becomes a separate mapping.
   I'd take the constraint; six named things is about what a player can learn.

6. **Host view: view or place?** (§5.) Faithful visualization, or do insects
   actually make per-flower decisions at that resolution? I recommend view, and
   it's much easier to upgrade later than to walk back.

7. **Chemistry: plants only, or animals too?** Your line 42 suggests both. I'd say
   plants only for v1 (§4.4).

8. **Whose fitness does this affect first — the wild sim, or the player's garden?**
   The soil verbs (`T` dig, `B` lay) already exist and already waive habitat for
   player sowing. Minerals could make the garden a real *puzzle* — amend this bed
   with ember and see what you can grow. That's a genuinely new player verb hiding
   in here, and it's Stardew-shaped in a way the rest of the design isn't. Worth
   deciding early because it affects where the tuning pressure goes.

---

## 10 · A proposed v1 cut

If you want a build to start from, this is the one I'd argue for:

**In:**
- six minerals ↔ the six identity-map colours (§2)
- per-world mineral roll: biome motifs + a moisture/elevation gradient (§4.2),
  derived from seed, nothing new saved
- the **mobile/immobile split** on those minerals (§4.2) — one flag, two viable
  root strategies, the best texture-per-line item in the document
- tropism-grown roots, frozen at germination, LRU-cached (§4.1 option B)
- `uptake − cost → vigor`, wired into the two existing multiplier chains (§3)
- pigment from minerals → the flower map's palette, inherited by ✧ daughters (§2)
- slow local drawdown with regen (§6.3)
- the two-pane host plate (§5)
- a `minerals` overlay + dock tab + `mineralMakeup` chart in the World-Lab
- Phase 0's B5 trait charts, built *first* as instrumentation
- the `driftDistance` weighting fix (§6.4) — not optional, ships with this

**Out, deliberately, for v2:**
- chemistry and transmutation (needs the viability sweep first, Demo 5)
- compounds and stored energy
- trophic carrying-capacity ceilings and the nectar-competition fix
- animal extraction pipelines
- scale niches (cheap, but it wants the energy ledger underneath it)
- the discrete CA rule gene (§4.1 option C) — add it *after* B works, with B as
  the control

That's one system, one new view, one instrument and one fix. It fixes two of the
four audit findings outright, gives the eleven ecologically-inert plant forms a job
for the first time, and it ends with a screen where you can *see* why one plant is
beating another — which is the thing this game has never once been able to show.

**Next step I'd suggest: Demo 1.** It's a day, it's standalone, and it decides
whether any of the rest is real.

---

*— Fable*
