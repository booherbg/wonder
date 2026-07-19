# Disease & Diversity — the balancer that preys on sameness

*Captured 2026-07-18 from Blaine's steer: "what if the cap is not predatory
but disease/parasite? preying on the mono genetics." This is the negative-
feedback the mutualist ecology needs — and a better one than crude crowding.
Read alongside [ecology-ground-engine.md](ecology-ground-engine.md) (the
symbiosis engine) and its balance section. Pillars: peaceful; surprise is a
budget; keys stay few; the world doesn't need you; show, don't commemorate.*

## The problem it solves

The ecology went mutualist: a visit mostly *spreads* the plant (dispersers,
and the beast carrying lineages shore to shore). That's **positive feedback**
— and left alone it pushes the island toward **monoculture**: the favored
lineage spreads everywhere, co-adaptation pulls the flora toward one winning
shape, and the island fills to a lush but *uniform* ceiling. Today the only
brake is the crude crowding thin (`comfortFraction`: above ~72% density, remove
random plants). That caps the count but does nothing about the *sameness* — and
a uniform island is a monotonous one.

## The idea

**Blight preys on uniform stands.** Where plants grow dense *and* too alike —
same species, genomes barely drifted apart — a blight can take hold and sweep
through the sameness, thinning it. It **spreads along likeness**: from an
infected plant to its dense, genetically-close neighbors, and it **stops at
difference** — a divergent individual, a drifted daughter, a different species
is a firebreak. So the survivors of a sweep are the *unlike* ones, and the gaps
it opens are re-seeded diverse. **Diversity is resistance; monoculture is
fuel.** The balancer isn't a predator eating prey — it's the island refusing to
become one thing.

This turns the crude density cap into a *meaningful* one: blight replaces (or
reframes) the crowding thin as the island's rebalancer — removing dense uniform
plants, sparing the diverse — so the ceiling it holds is not just lush but
**varied**.

## Why it's the right shape for Wander

- **It targets mutualism's exact failure mode.** Dispersal spreads sameness;
  blight punishes sameness. The two become a **dynamic attractor**: co-adaptation
  pulls toward the favored uniform lineage, blight pushes back toward a diverse
  mosaic, and the island breathes between them — bloom, sameness, a sweep,
  diversity returns, bloom. The boom-bust dynamism mutualism-alone lacked, now
  sourced from *diversity* rather than predation.
- **Diversity becomes the winning strategy** — the perfect lesson for a peaceful
  garden. A monoculture garden takes blight; a diverse one thrives. The player
  learns to garden for variety, and the whole game already rewards variety
  (drift, speciation, the field guide).
- **It couples to systems already shipped**: genome drift, `driftDistance`,
  speciation (a ✧ daughter is literally a firebreak), per-tile density. No new
  substrate — blight reads the genetics that already exist.
- **It's discoverable by watching** (the research's core rule): you *see* a
  wilt sweep through a uniform patch and halt at a drifted edge, and you learn
  "difference is health" with no menu ever saying so. The journal could note a
  lineage that "took the blight" or a stand that "stood through it."
- **It stays peaceful.** Blight removes plants — as age and crowding already do —
  never harms the wanderer, and its lesson is *tend for diversity*, not fear. Not
  combat, not a threat; an ecological rebalancer. A sweep is a **murmur moment**
  (the deck could gain a diversity/resilience line — Darwin on variation).

## Mechanic sketch (for the build — refine in implementation)

- **Susceptibility** of a plant ≈ local sameness: among its near neighbors, how
  many are the same species *and* within a small `driftDistance`. High density +
  low drift variance = ripe.
- **Ignition**: occasionally (rare, weather-like — not constant), the ripest
  stand ignites a blight at one plant.
- **Spread**: over ticks, blight passes from an infected plant to adjacent
  same-species, genetically-close neighbors; each step it may remove the plant
  (a wilt first, then gone) and pass on. It **cannot cross** to a divergent
  plant or a different species — difference halts it.
- **Outcome**: the uniform core is thinned; drifted/divergent survivors remain
  and re-seed the gaps → the next generation there is more varied. Emergent
  selection *for* diversity, never hard-coded.
- **Replaces/reframes** the `comfortFraction` crowding thin as the primary
  rebalancer (or runs alongside it, tuned so blight does the diversity work and
  crowding only backstops raw count). **Runs during away-aging** too — the
  island diversifies while you're gone.
- **Visible tell**: an infected plant wilts/tints (a sickly hue, drooping) and
  the sweep is watchable as it travels and stops. Behavior is the tell.

## Open questions for Blaine

1. **Replace or complement the grazer thread?** You earlier chose "mostly
   symbiosis with some friction" = a minority of grazer critters. Does blight
   *become* the friction (grazers revert to all-dispersers), or do both stand —
   grazers a small local nibble, blight the systemic diversity-keeper? (My lean:
   both — they're different scales, and blight is the real balancer.)
2. **Abstract blight, or a visible parasite agent?** A spreading wilt on the
   flora itself (simplest, clean), or a small critter/bloom-scale *parasite* you
   can see moving through the monoculture (more legible, more to render, and it
   could itself be drawn to sameness the way a palate is drawn to a plant)?
3. **How rare?** A sweep now and then (like rain/aurora — an event an island
   remembers), or a steady low pressure always trimming sameness? (Lean:
   occasional sweeps, so witnessing one is an event.)
4. **How is "too alike" measured cheaply** at scale (thousands of plants)? Local
   neighbor sample + `driftDistance` threshold is the obvious cut — needs to be
   budget-friendly like the existing simTick sampling.
