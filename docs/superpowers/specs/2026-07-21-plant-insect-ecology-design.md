# Plant–Insect Ecology — design

**Date:** 2026-07-21
**Status:** design complete — worked out live (Blaine + Opus) against a prototype;
ready for an implementation plan.
**Relatives:** prototyped/tuned in the Simulator
([`2026-07-21-simulator-design.md`](2026-07-21-simulator-design.md) § Insect swarms);
live design sandbox archived at
`docs/superpowers/prototypes/2026-07-21-identity-map-lab.html`
([artifact](https://claude.ai/code/artifact/e39f8fe3-ce0a-4580-a8a0-9bcee58a7d03)).

---

## The loop in one breath

A **swarm** adapts a pixel-**map** toward a plant's **flower**, which **feeds it**
(an adaptive metabolism, pulsed by the flower's nectar), **hides it** (that same
map is its camouflage when it's home on the plant), and **spreads the plant**
(pollination). Nectar depletes → the swarm **ranges** for more → gets **exposed** →
**insectivores** gently thin the conspicuous → pressure to adapt or **split into
cousins**. A well-matched plant+insect pair **booms**; the abundance pulls
**critters** to specialize on it. Appearance and a few behaviour genes are rendered
from the genome, so you *watch* camouflage and personality evolve.

**Design intent** (Blaine): a *legible, evolutionary* ecology — "trace adaptation
over time," Holland ECHO-style tags, "each island feels alive." **Peaceful by
construction:** foraging reduces a *population*, never kills a bonded creature.

---

## Core primitives

### The identity map (one shared format)

A small pixel grid (≈7×7) is the shared "tag" space everything matches in. Two
instances:

- **Flower map** — per plant *species*. **Two layers in one grid:** a
  **base/foliage colour** filling most cells (*always present → there's always
  something to match*) + a **flower accent** whose *size is a genome trait* (few
  pixels = small bloom = small jackpot; many = big showy bloom). It **renders as
  the plant's real flower** — every plant shows at least a hint of it, and
  **`Z`-zoom / inspect reveals it crisp** on the actual plant form. Plants breed
  slowly → the flower map drifts slowly (a near-fixed target).
- **Insect sensor/appearance map** — per swarm. Adapts toward the flower it works
  most. **The insect's colours are *rendered from* this map** (genome → look), so
  adapting = coming to *look* like the flower. The map is the abstract thing
  matching runs on; the body is a render of it — **correlated, not identical.**

**Matching** is pixel similarity. Base-colour matches pay a *little* (generic,
works on many plants) and do the camouflage job; **flower matches are the
jackpot** (the specialised pollination reward).

### The swarm = one cloud + a small internal gene pool

A swarm is a **single spatial entity** (a cloud that moves, homes, forages,
renders) carrying a **small internal pool of ~6–12 genomes**. The pool is GA
bookkeeping, **not** spatial agents — so movement/pathfinding cost is per-*swarm*,
not per-insect. **This is what makes it affordable** (no "thousands of insects"
explosion) *and* alive (real selection runs inside the pool).

*Rejected:* one genome per swarm — all clones means nothing to select on, predators
can't pick anyone off, and no divergence. **Variance is required.**

**Population = pool size / cloud density** — one number that rises with feeding and
falls with predation.

---

## The mutualism

### Feeding = adaptive metabolism

A flower's nectar **regenerates on a reset cycle**; an insect draws **once per
cycle**, and the **amount = its match quality.** So the map *is* a metabolic
efficiency:

- **Well-matched** → a full meal per pulse → lives off a few **home** flowers →
  **safe.**
- **Poorly-matched** → crumbs per pulse → must **range** across many flowers →
  **exposed.**

Rate-limited by the nectar cycle, so poor fit genuinely costs and **can't be
brute-forced by grazing constantly.** Feeding also **pollinates** — see next.

### What plants gain — propagation (facultative + reciprocal boom)

- **Pollination is the primary, fast path to spread** — a pollinated flower sets
  more seed, farther. This is the plant's payoff for the nectar it spends.
- **Facultative, not obligate:** plants keep a **slow self-seed floor** (drift /
  self-pollination as today), so they **never mass-die** if pollinators dip. A
  plant *needs* insects to **thrive**, not to **survive** — this is the
  **resilience requirement** (no single point of failure).
- **Reciprocal boom:** a well-matched pair feeds the insect (population up) *and*
  spreads the plant (more flowers) → more feeding → more pollination → … Positive
  feedback, **bounded** by per-tile space caps + nectar limits + predation on the
  swarm. A "well-versed pair grows rapidly," then settles at a lush ceiling.
- *v2:* a few **obligate** plants (need a specific pollinator to seed at all) as
  rare high-stakes drama — deferred for resilience.

### Camouflage — free, and spatial

Conspicuousness = `1 − match(appearance, the plant it's currently on)`. Since the
appearance *is* the sensor map, an insect adapted to its flower is **hidden while
home on it**, and **exposed when it strays** onto other ground. One map does
feeding *and* hiding, and gives a **roam-vs-stay tension for free** (nectar
depletion forces the roam).

---

## Predation & the trophic ladder

### Insectivores thin the conspicuous (gentle, non-wiping)

A predator (frog / dragonfly / bird / insectivore critter) thins the **conspicuous
variants** — cull rate ∝ conspicuousness — as a **slow population drain, not
constant kills.** Hidden/fed swarms **regrow**; a swarm that adapts *stops being
eaten*. Fed predators **satiate and rest**; predator density is capped. **No
predator map needed in v1** — they simply eat what stands out. Peaceful:
population down, never a bonded critter killed.

*v2 richness:* an **evolving predator search-image** (the prototype's Red-Queen
arms race) and a **dual insect map** (independent camouflage vs. food, so hiding
and feeding can genuinely conflict).

### Critters specialize on abundance

The booming pair pulls the next trophic level. Critters key their **palates** (the
existing `appetite` system) onto what's plentiful:

- **Insectivores** on the swarms (the gentle predation above) — a booming swarm
  feeds them, their numbers rise, predation pressure rises, the swarm is regulated.
- **Frugivores / grazers** on the plants/fruit — a booming plant feeds plant-eaters.

"Specialize accordingly" = critters **co-adapt** toward the abundant pair, which is
where the web gains **trophic depth**: plants → insects → insectivore critters
(→ larger predators later, when critter-on-critter predation un-parks).

---

## Evolution & variety

### Behaviour genes (personality — heritable and *visible*)

A small **scalar slice** of the genome, separate from the pixel map (that's
*looks*; these are *personality*), each read straight off how the cloud moves:

- **Range** (homebody ↔ wanderer) — predation selects homebody; scarcity selects
  wanderer.
- **Nerve** (skittish ↔ bold) — how fast it scatters from a predator vs. holds to
  keep feeding.
- **Cohesion** (loose ↔ tight cloud) — a visible tell and a survival knob.
- *(optional)* **Rhythm** (day ↔ night) — riding the existing day/night cycle.

They evolve under the same pressures, so a jumpy homebody swarm *reads* completely
differently from a bold wanderer — **personality you can watch adapt.**

### Divergence → cousins

When the internal pool goes **bimodal** (part favouring flower A, part B — e.g. A's
nectar dried up), the swarm **buds a new swarm** carrying the second cluster (reuse
the ✧ daughter-species pattern). Needs the internal variance.

### Plant-side co-evolution (slow)

Plants drift slowly toward their pollinators (be matched → be pollinated), so over
long island-time a host's flower **comes to fit its faithful pollinators**. Slow
(plants breed slowly) — a near-fixed target the insects chase. Deeper two-way
co-evolution is a v2 knob.

---

## The web, reworked

The **plant ↔ insect ↔ critter** mutualism + trophic structure becomes the
**primary, legible food web** — it's more interesting and more readable than the
abstract byproduct/substrate chains (`foodweb.ts`, the shipped design-B). Those get
**reworked/subsumed:**

- The **living web** (`C`) re-centers on real relationships: **pollination**
  (insect→plant), **feeding** (insect←flower), **predation** (critter→insect),
  **herbivory** (critter→plant), with live counts and "firing now."
- The **substrate/hue-match chains** either **reconcile into this** (substrate as
  one edge type among several) or become a **secondary/legacy mechanism**. Decision
  to make during the plan; direction is *demote the abstract chains, promote the
  plant/insect web.*

---

## Legibility (show, don't commemorate)

- **Inspect a swarm:** its map (with matched pixels ringed) beside its host flower;
  population, exposure, its behaviour genes, its host(s), its predators, resemblance
  over time.
- **`Z`-zoom / inspect a plant:** the real plant form with its flower **crisp**;
  its pollinators; nectar level.
- **Appearance = the tell:** a swarm's colours show its adaptation; its motion shows
  its personality; a thinning cloud shows predation. Every hidden value has a
  visible expression.
- **The web (`C`)** and **charts (`G`)**: the relationships and their populations
  over island-time.

---

## Rendering & scale (Blaine, 2026-07-21)

- **Beautiful coloration, not a dust cloud.** Both the **individual insects** and
  the **swarm as a whole** are drawn with real colour pulled from the sensor map
  (`appearanceColors`) — a swarm of a well-adapted kind is a shimmer of its
  flower's palette, each member distinct (draw from the gene-pool variants), with a
  cohesive, lovely cloud silhouette. Never a grey particle fog.
- **A population of swarms.** A world holds *many* swarms (of many kinds), not one;
  they home, forage, boom, and split (divergence).
- **Levers on size.** How big a swarm can grow is a **lever** — `Swarm.cap` in
  `swarm.ts` (default `SWARM_CAP`), surfaced later in the Simulator's pressures
  panel so you can dial swarm sizes per kind or globally.

## Balance & resilience

- **Facultative pollination** + a **self-seed floor** → no plant mass-dies (no
  single point of failure — Blaine's standing requirement).
- **Bounds** on the boom: per-tile caps, nectar limits, predation, satiation.
- **Predation never wipes** an adapted swarm (it hides and recovers).
- Tune the constants (metabolism rate, nectar cycle, cull rate, boom feedback) **on
  the bench** (the Simulator) before shipping to real worlds; guard with a
  collapse/'-holds' test like `tests/ecology-holds.test.ts`.

---

## Reuse vs. new (code map)

| Reuse | New |
|---|---|
| Plant genomes/forms (`genome.ts`), plant sprites | **Flower map** (base+flower) per species; renders into the flower |
| Pollination + reseeding (`flora.ts`) | **Graded** pollination reward; nectar meters + reset cycle |
| `appetite`/palate (`fauna.ts`) | **Insect swarm** primitive (cloud + gene pool); the **pixel-matcher** |
| ✧ speciation | Swarm **divergence** (bimodal pool → bud) |
| Critters as predators; drives/energy | **Insectivore** feeding = conspicuousness drain; **behaviour genes** |
| Day/night, `Z`-zoom, inspect, the web (`web.ts`), charts | **Web rework** (plant/insect/critter primary); swarm inspect + portrait |

---

## Built in the Simulator

This ecology is the **core content of the Simulator** (Door C). The Simulator is
where we place plants/swarms/critters by hand, tune the constants, watch adaptation
over deep time, and prove resilience — *before* it graduates to real worlds. The
Simulator spec should treat plant/insect ecology as its central subject, not a
side feature.

---

## Open questions / v2

- Exact **map size** (≈7×7) and the **base-vs-flower pixel split**.
- The **constants**: metabolism per pulse, nectar cycle length, cull rate, boom
  feedback strength (tune on the bench).
- Do **behaviour genes** get their own inspect readout, or just show through motion?
- **v2 richness:** dual insect map (camouflage vs. food conflict); evolving predator
  search-image; obligate-pollination plants; faster/deeper plant-side co-evolution.
- The **web-rework** decision: fold substrate chains in, or deprecate them?
