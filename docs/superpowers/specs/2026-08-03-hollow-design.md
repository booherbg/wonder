# The Hollow — an island that was already old when you arrived — design

**Date:** 2026-08-03
**Status:** draft, awaiting review
**Surface:** a new island style. The existing island style is untouched and generates exactly as it does today.
**Builds on:** `docs/03-ECOLOGY-DESIGN-SPACE.md` §7, §8, §11 (bench findings 1–12)

---

## Definitions

Terms used load-bearingly below, with type and range, before any claim rests on them.

- **Hollow** — a new island style selectable in the forge. Small, dense, enclosed. The container for everything in this document.
- **Burn-in** — running the Hollow's ecology headless for a fixed number of generations at worldgen, before the player's first frame. Integer, target 300–600 generations (§5.3 sets the budget).
- **Mineral profile** — a per-tile vector of 6 mineral quantities, each a float in [0, 1]. Plants draw from it, deplete it, and return a different vector at death.
- **Fitness function** — a scalar in [0, 1] scoring a genome against the mineral profile and light level of the tile it occupies. Wonder has none today; this document adds one.
- **K (ruggedness)** — in the NK fitness landscape, the number of other traits each trait's contribution depends on. Integer. This document uses K = 3.
- **RBN (random boolean network)** — the N-gene regulatory network whose attractor determines a body. This document uses N = 32, K = 2, p = 0.40. Note this K is a *different quantity* from the ruggedness K above; the two benches measure different models and the numbers must not be pooled.
- **Motion signature** — the twelve-feature description of how a critter moves, derived from its genome. The primary identity channel at gameplay zoom.
- **Host plate** — the lean-in specimen view, 30×74 art px (30 wide; 50 shoot, 1 ground line, 23 root).
- **Separability** — leave-one-out nearest-neighbour classification accuracy over genomes drawn uniformly at random from the gene box. Chance level is stated with every figure.

---

## Goal

A forest that is legible if you look hard enough, and that never tells you anything.

The player walks. Things are close, overlapping, and mostly still until they move. A correlation noticed on foot — this leaf shape sits in this light, that critter works only that plant — can be confirmed by leaning in. The confirmation is the reward for having noticed; the world itself stays wordless.

**Success looks like:**

1. Every visible correlation is *true* — produced by selection during burn-in, not authored by a generator.
2. A player can identify a critter species across a clearing by how it moves, before colour is resolvable.
3. The Hollow arrives at equilibrium. Nothing dies on screen in stage 1.
4. The original island style is byte-for-byte unaffected.

**Non-goals for this spec:** camera change, planting, seeds, breeding, the journal, puzzles. All were explicitly deferred during design.

---

## Diagnosis — why the world does not currently mean anything

Two mechanisms are missing, and one is deeper than the other.

**There is no fitness function.** Bench 2's drift control — selection at zero — pins a population at fitness 0.500 with mean Hamming distance exactly N/2, at every K. That control is a description of Wonder today. Traits drift. Nothing selects. A species therefore cannot be *adapted to* anything, which is why specialization and surprise have not appeared on their own. Ruggedness, morphology and chemistry are all downstream of this; selection is the floor.

**Species are rolled, not fitted.** `generateCritterSpecies` (`src/life/fauna.ts:443`) samples a species from randomness. Nothing asks what the island demands and what shape answers it. Form varies without meaning, so correlations noticed while walking teach the player nothing true.

A third, smaller gap shapes stage 3 rather than stage 1: **behaviour is universal.** Every critter shares five states — `idle | seek | nibble | home | sleep` (`fauna.ts:310`). No species does one specific odd thing.

What already exists and should be built on rather than beside:

- `morphOf` (`fauna.ts:143`) derives body plan, tail, crown and coat from body parameters. Form-from-function is partly there.
- `IdMap` (`src/life/idmap.ts`) matches a critter's sensor map against a flower's signature, yielding `metabolicEfficiency` and `resemblance`. A chain waiting to be made visible.
- `src/render/depth.ts` already establishes ground shadow pools sized from each plant's genome, crown light, and a fixed light direction (upper-left).

---

## Locked decisions

| Topic | Choice | Source |
|---|---|---|
| Container | New island style, original untouched | design conversation |
| Camera | **No change.** Canvas 2D, top-down, pixel art | design conversation |
| Enclosure | Tight default zoom + occluding canopy, not a camera rig | design conversation |
| Legibility model | World is diegetic; the lean-in view **confirms**, never explains | design conversation |
| Equilibrium | **Burn-in** before first frame | design conversation |
| Ruggedness | K = 3, usable band 2–4 | bench 2 |
| Regulatory network | N = 32, K = 2, p = 0.40 | bench 3 |
| Morph readout | Hash **all 32** mean-activations into 12 morph parameters | bench 3 |
| Identity channel at zoom | **Motion**, not colour | bench 11 |
| Palette | Grounded split-complementary, bias 0.70 | bench 10 |
| Lean-in view | Host plate at 30×74 | bench 9 |
| Chemistry gate | maxRAF ≥ 5 reactions, tuned *near* the transition | bench 1 |

---

## Layers

Five layers, bottom to top. Each rests on the one below; the sequencing in §5 delivers them in three playable stages.

### 1. Minerals as the selective pressure

Each Hollow tile carries a mineral profile: 6 minerals, each in [0, 1]. Plants draw on it to grow, deplete what they use, and return a different profile at death — niche construction (§4.8), which the existing soil layer already half implements.

Scarcity is the instrument. A species cannot be good at everything because the minerals to be good at everything are not present in one place. That single constraint is what converts drift into specialization, and it is what forces the chains between species to exist rather than being authored.

### 2. A fitness function, at K = 3

Bench 2's answer, with its usable band of 2–4. What K = 3 buys, in its own numbers at N = 16: 58 local optima among 65,536 genotypes; the most popular basin takes 12.5% of independent lineages and the top three take 29%; a population run ends on 4.0 distinct peaks with the dominant one holding 87%.

That distribution reads as **one common form plus a few odd rare ones**, which is the forest this design is after. The alternatives fail in both directions: K = 0 gives one answer on every island (100% of lineages in one basin) and reaches *lower* mean fitness than every K from 1 to 9 — 0.680 versus 0.724 at K = 3 — because no interaction means no happy accidents. K = 15 gives 0.8%, where no answer is ever the answer.

Adaptation stays watchable at K = 3: correlation length 3.3 mutations, walks 4.9 steps.

**Constraint to respect as the genome grows:** argmax K across N = 10, 12, 14, 16, 18, 20 is 4, 3, 2, 3, 3, 3 — a small constant that does not scale with genome size. Wonder can grow its genome; it cannot grow K alongside it. At fixed low K there is no fitness decline at all across N = 4…20, and genuinely catastrophic territory extrapolates to 100–200 loci.

### 3. Burn-in

At worldgen, the Hollow runs layers 1 and 2 headless for 300–600 generations with no renderer attached. Selection, mineral depletion, competition and extinction all run at speed with nobody watching. The player's first frame shows the survivor set.

Three consequences, all load-bearing:

- **Correlations are earned.** A broad leaf occupies shade because narrow-leaved competitors lost there across hundreds of generations. Leaning in to confirm a hunch reads actual history.
- **Loss is already complete.** Everything that could crash crashed off-screen. The Hollow is peaceful because it is old, not because it is protected — no mechanism is removed and the peaceful pillar is not bent.
- **"Ancient" becomes literal data.** The Hollow knows its own history: this species is 400 generations old, that one arrived late. That is the material the lean-in view should be showing.

Stability here is *settled*, not static. It holds until something disturbs it — weather (§4.2, nobody's fault) or the player (§4.1, the player perturbs and does not optimise). Disturbance is out of scope for stage 1 but the burn-in is what makes it meaningful later.

### 4. Body as attractor, with punctuation

Bench 3's recommendation: N = 32, K = 2, p = 0.40 — sensitivity 0.96, just inside the ordered regime. Yields 4.8 attractors, 4.1 distinct bodies, 4% collision, 70% canalisation, genome under 100 bytes. The body is a pure function of the attractor, so it computes once at birth and caches.

**Readout requirement, not optional:** hash all 32 mean-activations into the 12 morphological parameters. Truncating to the first 12 throws the rest of the network away, and because most genes are frozen in the ordered regime, 26% of attractor pairs draw literally the same plant at N = 24 — 68% at N = 48.

**Punctuation is why this layer exists.** In the ordered regime mutation effect sizes are bimodal: 73% under 0.1, 19% over 0.4, only 8% in between. A lineage holds its shape through most mutations and then occasionally changes dramatically. That is an event a player can witness, not a slider being nudged, and it is specifically an ordered-regime property — the chaotic regime is smooth. Wonder has no mechanism that can currently produce one.

### 5. Verbs, and the confirming lens

A per-species behaviour slot alongside the five shared states. One species works only the undersides of one plant; one moves only after the light drops; one caches. The verb is specific and repeatable, so it can be learned by watching.

Each verb's reason lives elsewhere in the chain — the underside-worker needs a mineral only that plant concentrates. The player is never told this. It is true whether or not they find it.

The lean-in view shows what a thing **is doing** and what it **needs** — not why. It confirms a hunch already formed on foot. This is a rewrite of what `src/render/inspect.ts` (714 lines) says, not new plumbing.

---

## Art — how this is beautiful, and how it is specifically itself

The look is not applied on top of the simulation. The simulation is the thing being looked at. The claim that makes it distinctive:

> **At walking distance the forest is read by motion. Only on leaning in is it read by colour.**

### Motion is the identity channel at gameplay zoom

Bench 11: motion separability is **89.1% against a 12.5% chance level** — seven times chance — over eight genomes drawn uniformly at random from the gene box, 24 ten-second flights each, twelve features. Range 85.9–97.9% across four seeds, with between-genome scatter 1.87× within-genome scatter.

Head to head, same classifier, same chance level, colour given its best case of four hues evenly spaced at full palette chroma:

| sprite size | 2px | 5px | 14px |
|---|---|---|---|
| motion | 51% | **88.9%** | 99% |
| colour | 24% | **58.3%** | 100% |

The curves cross at 8.5px. Below that motion wins; above it colour does. Colour's collapse is chromatic spatial summation — a small sprite's chroma is averaged over a patch larger than the sprite. Swept across three patch sizes and half/double σ, the crossing stays between 5.2 and 11.2px. The exact pixel is soft; the direction is not.

So a critter's identity at gameplay zoom is its gait, its pauses, its flight path — derived from its genome, not hand-animated.

### The lean-in view is a specimen plate, not a zoom

Host plate at **30×74**. At 30×50 the whole body plan reads: leader, branch order, leaf whorls, a median of **7 individually countable blooms**, berries and catalyst nodes. Going to 64×104 costs 4.4× the pixels and buys two more flowers, while shoot ink coverage *falls* from 12.8% to 9.3%. Bigger plates buy paper, not detail.

**Constraint that must be respected in the design of this view:** a host plate cannot show a swarm. At 30×50 the median plate holds **two** pollinators before they merge; ask for eight and the median separable count is **one**, with a quarter of the plant occluded. 64×104 fits three. Past about three, the view must break true scale or stop drawing individuals. Stage 3 decides which; stage 1 does not draw pollinators on the plate.

The root pane ships with two fixes that are themselves findings: six minerals **cannot be separated by hue** when a world rolls a hue spread as narrow as 70°, so the ground needs a per-world *value* ladder with hue riding on top; and the matched root pixel must be the brightest thing in the pane, wearing its mineral's colour. With both, a centre cut shows a median of 6 mineral bands and matched-root length spans 1%–96% across islands.

### Palette: grounded split-complementary, bias 0.70

The only setting in bench 10's sweep where every measure improves at once, over 14 islands per configuration: scene discord 26.1% → 19.5%, flora discord 23.5% → 18.8%, island difference 0.302 → 0.380, character spread 10.4° → 11.2°.

The finding that reorganised the question: a key touching only the flora buys almost nothing at scene scale. Complementary at full bias takes flora discord to 8.3% while the whole-scene number barely moves — the plants agree with each other and go on disagreeing with the dirt. **Grounding the root — anchoring one hue to the terrain green — is worth more than the choice of key** (grounded tetradic reaches 9.6% flora discord, a 63% reduction).

Split-complementary specifically, despite not scoring best: tetradic and triadic offsets are closed under their own rotation, so grounding them yields one identical anchor set for every island in the game, and the island-difference statistic is blind to that. Split-complementary's 0/150/210 offsets are not rotation-symmetric. Bias 0.70 rather than 1.0 is arithmetic about arc width — 78% of the hue wheel stays reachable at 0.70, only 39% at 1.0.

Variety improves under this constraint rather than suffering: island difference rises 0.302 → 0.514, because an unbiased island has no character to differ in — ten uniform hues make a flat histogram and every flat histogram resembles every other. The one genuine failure mode is **analogous**, the only key that makes discord worse (26.1% → 37.7%) and, grounded, collapses variety outright.

### Crypsis is the default, and it is kept

Running the colour rule literally, the median insect's gut chemistry lands **5.4° of hue from its host**, with 71% inside 15° (n = 800). Insects wear their flower. This corrects the earlier claim that insects transform colour rather than copying it — that is true of about one in five.

This is kept rather than fixed. A forest where things are hard to see until they move is the intended experience, and it puts insect visibility on the *same* channel as the motion signature. **Value contrast, not hue, is what makes an insect read against its host** — body-dark against wing-light. No UI may assume a player can find a pollinator by colour.

### Two fixes that ship in stage 1

**Glow must fire off the tint term, not luminance.** Pigment separation retention against the unlit palette: 93% daylight, 35% at the twilight peak, 24% deep twilight, 27% night — below half for about 54% of the modelled cycle, with mean hue rotation 60–62° at the worst point. The damage is the tint term, not the darkness; at the peak the model mixes 49% toward a single warm colour. Night-with-glow restores 108% of separation but dusk-with-glow only 74%, because glow currently fades on luminance while the worst damage happens where tint peaks. Since colour carries metabolic information, losing two-thirds of it for half of every day is not cosmetic. This is a one-line change and bench 10 deliberately left it broken so the table still shows the problem.

**Growth as animation.** §9.5 ranks it first at roughly a day of work, and it improves every existing screen. Things visibly growing is most of what makes a place read as alive.

---

## Sequencing

Three stages. Each ends playable, and each answers a question that the next stage's cost depends on.

### Stage 1 — does a world that means something feel different to walk through?

Layers 1–3, plus the art fixes. Minerals, fitness at K = 3, burn-in, motion signatures, grounded split-complementary palette, glow off tint, growth as animation. Tight zoom and occluding canopy for enclosure.

This is the honest test. If a burned-in, selected forest does not feel more alive than today's island, stages 2 and 3 are worth rethinking before they are built.

### Stage 2 — does strangeness arrive on its own?

Layer 4. Attractor bodies at N = 32, K = 2, p = 0.40, with the all-32 hash readout, and punctuated change.

### Stage 3 — does the chain become findable?

Layer 5 plus the chemistry gate. Per-species verbs, the confirming lens rewrite, and Hollow generation gated near the chemistry transition.

**The chemistry gate, deferred to stage 3 but specified now:** gate on maxRAF size ≥ 5 reactions, not on RAF existence. Because the food set is unlimited, a single reaction catalysed by a food molecule is formally a maximal RAF, so "does a RAF exist" crosses 50% at f ≈ 0.49 while a chemistry that can support a metabolism needs f ≈ 1.48 — a 3× error entirely on trivia. The threshold is not a fudge factor: the maxRAF is violently bimodal (at L = 7 the median jumps 0 → 520 across one step in p), so any threshold from 3 to 50 draws the same curve.

Tune *near* the transition rather than rich. The adjacent possible peaks at 32.5 molecules at f ≈ 1.5 and collapses to zero at f = 6, where closure has swallowed the entire molecule set; frontier-to-made runs 3.6 at f = 1.5 down to 0.05 at f = 3.5. A "more chemistry is better" gate would select exactly the wrong islands. The most interesting island is not the richest one — it is the one with the most left to discover.

---

## Risks and open questions

**RESOLVED — burn-in compute budget.** `burnIn` alone over 400 generations costs 964 ms. The whole `makeHollow` path costs 6.2–7.0 s across five seeds, which is the figure that matters: called synchronously it froze the browser tab, so burn-in now yields between chunks and the forge paints progress. Verified in a real browser — 39 frames painted and 4 pointer events handled during a 4,890 ms generation. Resume costs 25 ms.

**RESOLVED — two different Ks.** Named `RUGGEDNESS_K` (3) and, when stage 2 arrives, the regulatory K (2). Never a bare `K`.

**RESOLVED — extinction during burn-in.** `BURN_IN_SPECIES_FLOOR = 4`, reported in `BurnInReport.floorHit` rather than silently, with deterministic rerolls past a burn-in that empties the island. Across 25 seeds none exhausted its attempts.

**RESOLVED — the 8.5px crossing.** Gait amplitude at default zoom is 5.7–15.4 screen px peak-to-peak against a 3 px rounding quantum, so motion is above the ambiguity band rather than inside it. Measured separability is 100% against a 12.5% chance level.

**FAILED — the within-species light gradient.** §Layer 5's promise, that a player forms a hunch on foot and confirms it by leaning in, rests on individuals being legible. They are not. Three rounds of work fixed two real defects — `score()` selecting on the same trait `CanopyField` casts shade from, and reverse causation in the island-wide measure — without producing the effect; a dispersal sweep then refuted its own hypothesis, since within-species light standard deviation *falls* as seeds travel further. Root cause, and the two variances it turns on: island-wide the canopy light field has sd **0.253** over 8,407 land tiles (mean 0.685, p05 0.283, p95 0.999) — real structure — but *within the tiles a single species occupies* light sd is only **0.05–0.12**, because `habitat` pins a species to one tile type and canopy shade is smoothed over `CANOPY_RADIUS = 2`. Selection acts on the second figure, and there is nearly nothing there. Full record in `docs/03-ECOLOGY-DESIGN-SPACE.md` §12.3.

What is true instead: the Hollow's **composition** was earned. These species outcompeted others here — seed 2026, quartiles of 2,064 plants: mean `spread` 0.676 in the dark quartile against 0.375 in the bright, a separation of 0.301, against 0.267 (0.675 against 0.408) on a constant-light control, so most of that separation is the island's shape rather than the light term. What cannot be claimed is that an individual plant is readable.

**OPEN — legibility has still never been tested with a person.** §9.5 item 5 remains unrun. Every claim in this document about what a player will notice is a hypothesis, and stage 1 did not change that.

**OPEN — some Hollows are not forests.** Forest fraction runs 7.1%–62.5% across seeds 1–12 (mean 55.3%). The low tail undermines the premise for those seeds.

**OPEN — the palette claim was wrong.** This spec said bias 0.70 leaves 78% of the hue wheel reachable. Under a linear pull, reachability is exactly `1 − bias`: 30.8% at 0.70, not 78%. The key ships at 0.70 and the resulting palette is tight; whether that reads as character or as monotony is unresolved.

---

## What this explicitly does not change

The existing island style. Its generation path, its species rolling, its palette and its renderer are untouched. The Hollow is a second style selected in the forge, and the two must be able to coexist so the original stays available for comparison.
