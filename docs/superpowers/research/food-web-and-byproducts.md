# The food web today — and what byproducts (design B) would do

*A simulation & reference study, 2026-07-19. Measured against 14 real seeds
with a harness that reads the actual generated species and their `appetite`
matches (harness in the appendix; re-runnable). Part 1 is fact — extracted from
live worldgen. Part 2 is a **structural projection** of design B with stated
assumptions, not a full dynamics sim, and is labelled as such throughout.*

Design B: *"fauna don't need special latch-in hooks — they already latch in
through the palate. Add byproducts as one generic trait-medium, and the seed
does the composing."* This doc asks: **what does the web look like now, and what
would B actually change?** See also
[the Scavenger's Reign study](scavengers-reign-design.md) (why chains matter)
and [the roadmap](../specs/sandbox-observability-roadmap.md).

---

## Part 1 — How the ecology works today

### The one matching primitive: `appetite`

Every fauna→flora interaction runs through a single function
(`src/life/fauna.ts`):

```
appetite(palate, genome):
  if genome.form ≠ palate.form → 0        // form-gated: you eat one shape
  hueScore  = how close genome.hue is to palate.hueCenter (within hueWidth)
  glowScore = how well genome.glow matches palate.glowTaste
  return hueScore × (0.6 + 0.4 × glowScore)
```

An edge exists when `appetite > 0.3` (`APPETITE_MIN` — "below this a plant is
just scenery"). So a critter's diet is: **plants of its one form, whose hue sits
in its color window, tuned by glow.** The palate is *cut from* one plant species
at generation (`hueCenter ≈ that plant's hue ± 0.03`, `hueWidth 0.12–0.26`,
`glowTaste` from its glow) — a critter is born loving one kind and generalises
outward by colour.

This is the whole reader. It already tastes **traits, not species** — which is
exactly what makes B possible without new hooks.

### Classes of fauna (structurally)

Two axes define a fauna kind's *ecological* class (morphology is cosmetic on
top — 8 body plans, sizes 0.35–1.6, covered in the menagerie work):

| Class | Share | On eating, it calls | Effect |
|---|---|---|---|
| **Disperser** | ~72% (`1 − GRAZER_CHANCE`) | `flora.propagate` | drops a drifted **same-species** seed nearby — plant unharmed, both gain |
| **Grazer** | ~28% (`GRAZER_CHANCE = 0.28`) | `flora.nibble` | consumes/sets back the plant — the negative-feedback thread |

Each island rolls **5–8 kinds**, each with a palate keyed to one of 14 plant
forms (Flower, Shrub, Tree, Fungus, Fern, Coral, Succulent, Reed, Vine, Grass,
Moss, Bulb, Sporestalk, Kelp). Plants carry 9 drifting traits (hue, hue2, sat,
height, spread, petals, leaves, lean, glow); `form` never mutates. Plants are
habitat-locked; drift + `maybeSpeciate` make new lineages over time.

### The current food chain & dependencies (measured, 14 seeds)

| Metric | Value |
|---|---|
| Plant species / island | **23.3** |
| Fauna kinds / island | **6.6** |
| Food-web edges / island | **10.4** (7.0 disperser + 3.4 grazer) |
| Diet breadth | **~1.6 plant species / critter** |
| **Plant species no critter eats** | **14.6 / island — 63%** |
| Longest organism→organism→organism chain | **1** |

Two facts matter most:

1. **The web is sparse.** Nearly two-thirds of every island's flora is
   *scenery* — beautiful, drifting, speciating, but outside the fauna web
   entirely. Fauna touch a thin band of colour-matched plants and ignore the
   rest.
2. **There are no chains.** Every interaction is **pairwise** — a critter and
   the plants it tastes. A disperser spreads *the same species* it ate; nothing
   is *one organism's output becoming another organism's required input*. The
   dependency graph is a shallow star (critter → its palate-plants → habitat),
   never a line you can trace A→B→C. This is the quantified version of "a
   beautiful screensaver of pairwise mutualism."

### Examples from real seeds

**Seed 959830264 (your overnight island — Orbel Isle).** 7 kinds, 5D/2G, each a
tight length-1 palate:

```
D Tamdov Nibbler   scuttler  palate[Flower hue.73]  → Maka Star (0.98)
D Sanbul Muncher   hopper    palate[Kelp   hue.55]  → Luma Banner (0.94)
D Sanpo Hopper     tuft      palate[Flower hue.98]  → Norlu Bloom (0.88)
D Bulbul Hopper    serpent   palate[Fern   hue.83]  → Cynka Manylace (0.86)
G Nitam Nibbler    strider   palate[Vine   hue.77]  → Thoith Manytangle (0.86)
D Wislop Peep      puff      palate[Fungus hue.47]  → Norfenri Glowspore (0.86)
G Sanfi Tumble     loaf      palate[Shrub  hue.40]  → Ovasaenor Manyknot, Saeka Knot
```

12 plant forms present, but only ~8 food-web edges — most of its 21 plants go
uneaten. Every critter is essentially bonded to one plant. Nothing chains.

**Seed 42 — a *flat* island.** 5 kinds; its Moss/Fungus substrate-feeders happen
to sit at hues no disperser's food shares → **0 potential chains even under B.**
Real proof that emptiness is possible and must be designed around.

**Seed 12 — a *mono-taste* island.** 4 of 6 critters have **Shrub** palates over
8 Shrub species. A near-monoculture of appetite — fragile, and exactly the
island where your deferred **disease-on-monoculture** balancer would bite.

**Seed 88 — a *rich* island.** 8 dispersers, 0 grazers, dense colour overlap →
**28 potential chain-links, 17 closed-loop-capable** under B. The opposite pole.

The spread from seed 42 (flat) to seed 88 (rich) is the point: **the same rules,
wildly different rhythms per seed.**

---

## Part 2 — What design B adds, and its projected impact

### The one new primitive: `substrate` (a byproduct in the trait-language)

B adds a single generic idea: **an organism's action leaves a byproduct tagged
with a trait-signature, and other organisms read that byproduct through the same
`appetite`-style match they already use for plants.** Nothing about specific
chains is authored. Concretely, the modelled rule:

- A **disperser** eating plant *P* leaves a **byproduct** (scat / spore-fall)
  tagged with *P*'s hue (and glow).
- A **substrate-feeder** plant *S* — a pioneer/decomposer form (Moss, Fungus,
  Sporestalk) — **germinates only on a byproduct** whose hue is within its own
  window (modelled at ±0.12).
- That makes a link **D → (eats P) → byproduct(P.hue) → S germinates.** If *S*
  is *itself* eaten by some critter, the chain continues and can close.

Chains self-assemble from whatever the seed rolled — because byproducts speak
the **same colour language** the palate already reads. No island's chain is
written; it *falls out* of the trait mix.

### Projected impact (structural, 14 seeds)

| Metric | Today | Under B (projected) |
|---|---|---|
| Longest required chain | **1** (pairwise) | **2–3** (multi-organism) |
| Chain-links / island | 0 | **8.4** |
| Islands with ≥1 emergent chain | 0 | **13 / 14 (93%)** |
| Closed-loop-capable links / island | 0 | **3.5 (42% of links)** |
| Range across seeds | — | **0 → 28** (flat → rich) |
| Byproduct producers / island | — | 4.6 (the dispersers) |
| Substrate-feeder species / island | — | 4.6 (Moss/Fungus/Sporestalk) |

What this says:

- **B turns a pairwise web into a chained one on almost every island (93%).**
  The single missing medium (byproducts) is enough — the readers already exist.
- **It gives the 63% of "scenery" plants a job.** Substrate-feeders that no
  critter ate become *nodes the web routes through* — the island fills in.
- **The variety is real and seed-native.** 0 chains (seed 42) to 28 (seed 88),
  averaging ~8 — emergent, different every time, no authoring. This is the
  "different every island" you asked for, quantified.
- **Closure is common but not guaranteed (42%).** Enough islands can grow a
  *loop* you can watch close; enough can't that it stays a discovery, not a
  given.

### The trait-conduit variant (the open fork)

Because byproducts carry *P*'s hue, a chain is already a **colour conduit**:
P(hue h) → byproduct(h) → S(hue ≈ h). The open question is whether *S* then
**re-emits h** — a moss that sprouts on red scat tints red, its pollinators
carry red onward. The sim can't score aesthetics, but structurally it would
*lengthen* conduits (each link re-tags the next) and make hue visibly travel the
island over days. This is the "chains as visible trait-conduits" option; it is
more coupling to reason about and is the main design decision still open.

### Risks the data surfaces

- **Flat islands are real (seed 42).** ~7% grew no chain even under B. Mitigation
  options: bias substrate-feeder hues toward disperser foods at generation, or
  accept flatness as a legible island *character* (some places are just quiet).
- **Mono-taste islands are real (seed 12).** Dense same-form palates → fragile
  monoculture. B *amplifies* whatever the seed leans toward, so this is where the
  **disease-on-monoculture** balancer becomes not optional but paired with B.
- **Grazer-heavy vs disperser-heavy swings hard** (seed 88 was 8D/0G; seed 5 was
  3D/4G). Byproduct volume tracks disperser count, so chain richness co-varies
  with the D/G roll — worth watching that grazer-heavy islands don't feel dead.
- **Legibility load.** Multi-link chains are exactly the thing Mission mode wants
  you to *infer* — but Sandbox must show the substrate tiles and links clearly,
  or the new depth is invisible.

### Assumptions (so the projection is honest)

The Part-2 numbers depend on modelling choices, each defensible but not the only
option: substrate-feeders = {Moss, Fungus, Sporestalk}; germination match =
hue within 0.12; closure = the substrate-feeder is itself eaten by some critter;
byproducts tagged by hue only (not the full 9-trait genome). Widening the match
window or the substrate-form set raises every B number; narrowing lowers them.
The *shape* of the finding — sparse-pairwise today, chained-and-seed-varied under
B — is robust to these knobs; the exact counts are illustrative.

---

## Part 3 — Seed search: a minimum-viable floor, and the legendary hunt

Because the diversity score is computed at **generation time (no sim)**,
generation can become a **search** — "here are params, find a seed that satisfies
them" — instead of a coin flip that sometimes sells a lush island that is
actually barren. A scan of **2,500 seeds** (1..2500) maps the space.

### The distribution (2,500 seeds)

| | chains / island |
|---|---|
| median | 9 |
| p90 | 19 |
| p99 | 36 |
| **max** | **71** |
| flat (0 chains) | 38 / 2500 — **1.5%** |
| ≥30 chains | 47 seeds |
| ≥40 chains ("legendary") | 16 seeds — **0.6%** |

### The floor is nearly free to enforce

| minimum floor | seeds passing | candidate rolls to find one |
|---|---|---|
| ≥1 chain | 98% | ~1.0 |
| ≥3 | 92% | ~1.1 |
| ≥5 | 78% | ~1.3 |
| ≥8 | 55% | ~1.8 |

Default new-world generation to (say) ≥5 chains and no casual player ever lands
on a dud — at ~1.3 candidate rolls, imperceptible.

### The legendary tier (best of 2,500)

| seed | island | chains (closed) | forms | critters |
|---|---|---|---|---|
| **2438** | **Polpol Skerry** | **71 (69)** | 8/14 | 7 (4D/3G) |
| 1143 | Maqui Skerry | 71 (51) | 12/14 | 8 (7D/1G) |
| 770 | Orzel Shoal | 60 (50) | 11/14 | 8 (6D/2G) |
| 1093 | Ovara Isle | 56 (50) | 10/14 | 8 (5D/3G) |
| 308 | Silith Cay | 43 (33) | 11/14 | 7 (7D/0G) |

**The champion — seed 2438, "Polpol Skerry": 71 potential chains, 69 closing
into loops.** Nearly every chain on that island is a complete, watchable cycle —
a near-fully-wired ecology, ~8× the median. Worth pinning as a demo seed.

### What this means for the design

- **Generation → query.** The new-map controls become search params: minimum
  diversity, biome mix, D/G balance, "must contain a closed loop," size, relief.
- **A floor by default** protects the casual player; **dial it up** to hunt
  legendary seeds (a shareable "Minecraft-seed" moment); **dial it down** for a
  **frontier** — a deliberately-sparse canvas you cultivate yourself (the 1.5%
  flat seeds, opt-in, the sandbox-builder's case).
- **Richness correlates with dispersers.** The legendary tier skews
  disperser-heavy — byproduct volume tracks disperser count — a real lever the
  generator could nudge.
- **Search fixes flatness; `?warm` only ages.** Flatness is structural in the
  species roll; simming longer won't grow a chain a seed can't form.

---

## Appendix — the harness

Throwaway `tests/_impact.test.ts` (removed after the run; reproduced here).
Reads real generated species, builds the `appetite`-based food web, and projects
B. Re-add and `npx vitest run tests/_impact.test.ts` to reproduce.

```ts
import { APPETITE_MIN, appetite, generateCritterSpecies } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generateCraterEndemics, generatePlantSpecies } from "../src/life/species";
import { generate } from "../src/world/generate";

const SUBSTRATE_FORMS = new Set([PlantForm.Moss, PlantForm.Fungus, PlantForm.Sporestalk]);
const HUE_MATCH = 0.12;
const SEEDS = [42, 7, 20, 137, 959830264, 1, 12, 67, 54, 17, 5, 88, 3, 900];
// per seed: generate plants+critters; edges where appetite(palate, plant) > 0.3;
// B links = disperser eats P, a substrate-feeder S has hue within HUE_MATCH of P;
// closed = S is itself eaten by some critter. (Full source in git history.)
```

**Bottom line for the design call.** Today's web is real but sparse and
pairwise — 63% scenery, chain length 1. B, with one generic medium and zero
authored chains, gives 93% of islands a multi-link web that differs every seed,
gives the scenery a role, and reconnects the monoculture balancer. The cost is
coupling (especially the trait-conduit variant) and a legibility burden that
Sandbox mode must carry. The upside is the exact thing the Scavenger's Reign
study argues makes an ecology feel *alive*: cause and effect you can trace.
