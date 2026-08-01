# The ecology design space

*Fable, 2026-08-01. A synthesis written alongside six working benches. Companion
to [`02-ECOLOGY-FOUNDATIONS.md`](02-ECOLOGY-FOUNDATIONS.md), which holds Blaine's
soil/CA proposal, my response, and the reagent-economy design. This document goes
underneath all of that: what the ecology is **for**, what Kauffman and Holland
actually give us, the axes the design can vary along, and which of those axes the
benches are measuring.*

---

## 0 · What we are actually trying to accomplish

Worth saying plainly before adding any more machinery, because it changes what
"good" means.

Wonder is not a simulation and not a challenge. It is a **peaceful world you
watch**. The pleasure on offer is *noticing*. So the ecology's job is not fidelity
and not balance — it is to **manufacture things worth noticing**, and to make them
traceable when the player goes looking.

That gives a sharper test than "is this realistic" or "is this fun". For any
proposed mechanic:

> **Does it produce a moment where the player says "huh — look at that", and can
> they then find out why?**

The four capabilities the 2026-07-24 audit found missing each earn their place
under that test, and it is worth restating them as *moments* rather than as
systems:

| Missing capability | The moment it buys |
|---|---|
| **Selection** | "that shape is winning, and I can see what it's winning at" |
| **Niche** | "those two aren't competing — they're solving different problems" |
| **Origination** | "there's something here that wasn't here before" |
| **Disturbance** | "it grew back, but different" |

And a fifth the audit did not name, which I think is the most important of all:

| **Legible causation** | "the flowers went violet *because* the soil turned, and the beetles followed the flowers" |

That last one is the whole product. A purple flower is decoration. A purple flower
you can trace back through three steps to a cause is the thing Scavenger's Reign
does that nothing else does, and it is what this game keeps reaching for.

So: **we are building a machine that manufactures traceable surprise.** Everything
below is in service of that sentence.

---

## 1 · Three grades of surprise

A distinction I have not seen made in this project's docs, and it reorganises the
whole argument.

**Grade 1 — combinatorial.** The space of configurations is enormous and the roll
picks an unfamiliar one. This is what Wonder has today: 5,000+ critter
silhouettes, 17 insect body forms, rolled palettes. It is cheap, it is pretty, and
**it wears off**, because after twenty islands you have seen the shape of the
space. What this actually delivers is *variety*, which we have been calling
surprise.

**Grade 2 — dynamical.** Simple rules, iterated, produce structure nobody put in.
Cellular automata, reaction–diffusion patterns, boolean-network attractors. This
wears off much more slowly, because the space of *behaviours* is far larger than
the space of parameters you are rolling. This is Kauffman's "order for free."

**Grade 3 — adaptive.** The system is solving a problem you set, and it finds a
solution you did not anticipate. Avida's digital organisms evolving a logic
function nobody wrote. This is the highest grade because the surprise is
*about* something — it is an answer, so it can be interrogated, and interrogating
it is exactly the noticing the game is made of.

**Wonder is at grade 1 and has zero grade 3.** That is the honest one-line
diagnosis, and the whole rewire is an argument for climbing.

The distinction also sorts the benches:

- **Bench 2 (NK)** asks whether grade-3 surprise is *reachable at all* at a given
  landscape ruggedness — if the landscape is wrong, no amount of machinery above
  it will adapt.
- **Bench 3 (boolean networks)** is grade-2 machinery recruited to serve grade 3:
  dynamical structure that selection can then act on.
- **Bench 1 (autocatalysis)** is grade 2 producing *origination*, which is the one
  capability nothing else on the list can deliver.
- **Benches 4, 5, 6** test whether grade-3 dynamics survive contact with Wonder's
  actual constraints — peacefulness, scale, and legibility.

---

## 2 · Kauffman, and what each idea buys us

### 2.1 Autocatalytic sets — you do not design species, you design a chemistry rich enough that species design themselves

Kauffman's result: in a random soup of polymers where molecules catalyse
reactions with some probability, once catalytic connectivity crosses a threshold,
**self-sustaining reaction loops appear spontaneously.** Not built — found. The
formal version is Hordijk & Steel's RAF (Reflexively Autocatalytic and
F-generated) condition, and crucially it comes with an *algorithm*: a short
fixed-point pruning that finds the maximal RAF in a reaction network. That is
about thirty lines of code, and **Bench 1 implements it**.

Why this matters more than it looks: my §12.2 in the previous document proposed
hand-written viability gates for rolled chemistry ("every biome has ≥2 usable
reagents, ≥4 of 6 reachable"). Those are guesses. The RAF condition is the
principled version of the same question — *does this chemistry contain a loop that
sustains itself from the food set?* — and it is exactly what "is this world alive"
means.

**The new idea this opens:**

> **A species is a loop, not a genome.**

A lineage could be defined as a **collectively autocatalytic set** — a closed
cycle of conversions that sustains itself from what the ground provides.
Speciation is then the loop's membership changing. Extinction is the loop breaking
because a member's substrate ran out. Nothing about that requires a
`splitDistance` threshold constant or a speciation cooldown; species boundaries
get *discovered by the world* instead of declared by tuning.

I am not proposing we ship this in v1. I am proposing it is the most interesting
idea in this document and Bench 1 is the cheapest possible way to find out whether
the loops actually show up at the densities we would use.

### 2.2 NK landscapes — ruggedness is the most important dial we do not currently have

Kauffman's NK model: N genes, each contributing fitness as a function of itself
and K others. K is a pure ruggedness knob. K=0 gives a single smooth peak
(everything climbs to the same answer). K=N−1 gives a fully random landscape
(nothing climbs anywhere). In between sits correlated ruggedness with many local
peaks — the regime where adaptation works but does not converge on one answer.

Wonder has no equivalent parameter, and it *needs* one, because the two failure
modes are both real and both bad. A too-smooth ecology solves itself and every
island ends up looking the same. A too-rugged one is noise wearing a genome.

**The new idea:**

> **Roll K per world.** Ruggedness becomes a gaia's personality.

A smooth world converges fast: lush, uniform, legible, a little dull — a *tame*
island. A rugged world leaves its lineages stranded on strange local optima that
they never escape, and they stay strange forever. That second thing is precisely
the alien, over-specialised, why-is-it-like-that feeling of Scavenger's Reign,
which Blaine has named as a direct influence three separate times. It would arrive
as a consequence of one rolled number.

Kauffman's **complexity catastrophe** is the other half and it constrains us
directly: at high K, as N grows, the fitness of reachable local optima falls back
toward the mean. Translated: **there is a maximum useful genome size, and it
depends on how coupled the traits are.** That is a hard answer to the worry I
raised in §6.4 of the previous document — that adding reagent affinities and root
genes roughly doubles the genome — and Bench 2 measures where the ceiling sits at
the sizes Wonder actually uses.

### 2.3 The adjacent possible — make the frontier a visible object

Kauffman's "adjacent possible" is the set of things one step away from what
currently exists. Every innovation expands it.

In a reaction network this has a precise definition: given the current closure of
reachable molecules, the adjacent possible is exactly the set of molecules **one
reaction away** from it. That is computable, and Bench 1 computes it.

The audit asked for a "niche-space map showing the *empty* regions", and called it
both a design instrument and, later, the targeting display for its speculative
"Heart" feature. The adjacent possible is that map, with a rigorous definition
instead of a vibe. It answers *what is this island about to be able to invent* —
which is a genuinely new kind of thing to show a player, and it is the natural
readout for an origination mechanic.

### 2.4 Random boolean networks — phenotype as attractor

Kauffman's biological claim was that **cell types are attractors** of the genomic
regulatory network. Ported here: a plant's genome is a small boolean network, and
its **body is the network's attractor**.

What that buys, all at once:

- **Discrete forms from continuous genetic change** — you get species-like
  phenotypes without declaring species.
- **Canalisation** — most point mutations change nothing, because the attractor is
  robust. A lineage holds an identity.
- **Punctuated change** — occasionally a mutation moves the state into a different
  basin and the body *jumps*. That is a witnessable moment, and Wonder currently
  has no mechanism that can produce one.
- **Cacheable** — find the attractor once at birth, which is exactly the
  event-driven-and-cached rule Blaine asked for.
- The **sensitivity parameter `2Kp(1−p)`** unifies K and the function bias into a
  single ordered/critical/chaotic dial, so this system has the same kind of
  ruggedness knob as §2.2.

**Bench 3** measures whether the stability is real: do two initial states in the
same basin give the same body, and what fraction of mutations are silent?

---

## 3 · Holland, and what each idea buys us

### 3.1 Tags — and the leakage between them is the point

Holland's tag mechanic: arbitrary labels that mediate interaction and are
themselves under selection. Agents find each other without a central directory.
Wonder's identity map is already exactly this, and it is the best mechanic in the
codebase.

The move everyone reaches for is *more channels* — scent, soil signature, warning.
That is right, but it undersells the reason:

> **The value is not in any single channel. It is in a tag being read by more than
> one reader.**

A flower whose hue drifts to please a pollinator becomes, at the same time, more
conspicuous to whatever eats the pollinator. Nobody designed that link. It falls
out of two systems reading the same tag, and it is **traceable causation
generated for free** — the grade-5 moment from §0, arriving as a side effect of an
architectural choice rather than as authored content.

This gives a design rule I want to state explicitly, because it is the sharpest
legibility test I know:

> **Prefer mechanisms whose state is already visible to something else in the
> world.** If a value is read by another agent, it has a visible tell by
> construction, and you never have to bolt a readout onto it.

That single rule is why reagent → pigment → pollinator → predator is worth more
than any chart we could build.

### 3.2 Building blocks — an argument for cards over floats, independent of everything else

Holland's schema theorem says genetic algorithms work by recombining short,
high-fitness **building blocks**. The corollary is uncomfortable for Wonder's
current design: a flat vector of ten floats crossed by midpoint averaging has
almost no building-block structure. Averaging two genomes is not recombination in
Holland's sense — it destroys the very chunks that recombination is supposed to
propagate.

**Conversion cards are building blocks.** A card is a discrete, self-contained,
recombinable unit of function. Drafting a child's hand from two parents' hands is
recombination in exactly the sense the theory means, and midpoint-averaging floats
is not.

So the reagent economy has a second, independent justification beyond legibility
and beauty: **it is the representation the search actually wants.**

### 3.3 Internal models — and the comedy of a wrong one

Holland's complex adaptive agents carry internal models that let them anticipate.
Phase 0's learned palate is a small one: a critter's taste drifting toward what it
has actually eaten.

The extension is nearly free and I like it a great deal: **an animal that has
learned "violet means good eating" carries that model into a valley where violet
means something else.** It will make bad choices for a while, visibly, and then
re-learn. That is gentle, characterful, occasionally funny, and it is the kind of
thing players tell each other about.

### 3.4 Flows, not stocks

Holland emphasises that in a complex adaptive system what matters is the *flow*
through the network and its multiplier and recycling effects — not the standing
stocks. This is the theoretical backing for the position I took in §4.3 of the
previous document: model energy as a flux that sets ceilings, not as a conserved
quantity that funds individuals. **Bench 5** tests it directly, both ways, on the
same seeds.

### 3.5 Credit assignment — a careful, optional accelerator

From classifier systems: the bucket brigade strengthens rules that contributed to
a payoff. Applied here, cards that fired productively in a successful run would be
**more likely to be passed on**.

This needs care — done naively it is Lamarckian and it would undercut the honesty
of the whole selection story. As an *inheritance bias* rather than a genome edit
it is defensible, and it substantially speeds up the discovery of good chains. I
would keep it in the back pocket and only reach for it if Bench 6 shows that
useful chains take implausibly long to find.

---

## 4 · Five more ideas on the table

Beyond the two named theorists, in rough order of how much I would fight for them.

### 4.1 The player perturbs; the player does not optimise

The SimCity/Civ/Factorio compass points toward a player who optimises. I think
that is the wrong verb for this game and it quietly contradicts the
"world-doesn't-need-you" pillar.

> **The player's tools should change the *question the island is answering*, not
> improve its answers.**

Amend a bed with a reagent the region lacks. Introduce a catalyst and watch a
whole branch of chemistry open for everything downwind. Shift a soil pattern's
regularity in one valley. None of these make the island *better* — they make it
*different*, and then you watch what it does about it. The player is a source of
perturbation, which is both more on-brand and, per the disturbance literature,
genuinely diversity-maintaining.

This is the most important product idea in this document.

### 4.2 Disturbance is compatible with peaceful, because weather is nobody's fault

The intermediate disturbance hypothesis is one of the most robust results in
community ecology: diversity peaks at *intermediate* disturbance. Wonder has none,
which is a structural reason its islands monotonically converge and settle.

The peaceful pillar seems to forbid it. I think that reads the pillar too
narrowly. The pillar forbids *cruelty and death-as-event* — it does not forbid
weather. A storm, a flood, a frost is nobody's fault and nobody's failure, and the
game already has five periodic signals doing nothing mechanical.

Pair it with a **seed bank** and it stops being destruction at all: what a
disturbance does is *return a patch to an earlier successional state*, with the
lineages held dormant in the soil rather than lost. Tilling old ground and turning
up a lineage that vanished twenty island-days ago is one of the best moments this
game could have, and it requires disturbance to exist first.

### 4.3 Two-timescale evolution, because genetics is too slow to watch

A real UX problem nobody has named: **heritable change is too slow to perceive in
a play session.** Trait drift over island-days is invisible at the timescale a
person actually sits down for.

Real ecologies run two clocks — fast within-lifetime learning, slow heritable
change — and their interaction (the Baldwin effect: learning guides selection
toward what is learnable) is where a lot of the interesting dynamics live.

For us the payoff is mostly practical: **the player watches learning, which moves
in minutes, and infers genetics, which moves in hours.** Learned palate is already
the fast clock; card-strength bias (§3.5) would be another. The fast clock is the
one that makes the slow clock legible.

### 4.4 Time-to-first-surprise as an explicit, testable target

Cyberlife said *Creatures* took "an hour or two" to click. Turkle's SimLife child
said "I just ignore that. You don't need to know that kind of stuff to play."
Those are the two failure modes, and both are legibility failures rather than
simulation failures.

So let us make it a number we can fail:

> **A player should be able to trace one complete causal chain within ten minutes
> of arriving on an island.**

That is testable, it is tunable, and it is the constraint that should veto
mechanics. If the reagent economy cannot produce a traceable chain inside ten
minutes, it is too deep regardless of how good the theory is.

### 4.5 Rolled world-personality, as a bundle

§2.2 proposes rolling ruggedness. It generalises: **a world could roll its whole
regime** — ruggedness K, chemistry density (and therefore whether RAFs exist),
pattern regularity, disturbance frequency, forcing amplitude. Those five numbers
would produce genuinely different *kinds* of island rather than different
decorations on the same island, and every one of them is a parameter one of the
benches is currently measuring.

That is the payoff of doing this as a parameter study rather than as a design
document: the sliders become the roll table.

---

## 5 · The design space, as axes

The benches sample specific cells of this. Nothing here is settled.

| Axis | Options (roughly, least → most radical) |
|---|---|
| **What carries heredity** | float vector *(today)* · conversion cards · boolean network · autocatalytic-loop membership |
| **What the ground offers** | nothing *(today)* · scalar richness · typed reagents · patterned reagent field · patterned + depleting, mobile/immobile |
| **Genotype → phenotype** | direct lookup *(today)* · growth grammar · the metabolic chain as a growth program · network attractor |
| **What fitness reads** | nothing — drift *(today)* · uptake − cost · tier reached · loop closure |
| **How competition resolves** | uniform random thin *(today)* · selective thin · capacity ceiling · interference *(rejected — not peaceful)* |
| **What couples trophic levels** | nothing *(today)* · funded energy · capacity ceiling · tag match |
| **Where surprise comes from** | combinatorial *(today)* · dynamical · adaptive |
| **Ruggedness** | undefined *(today)* · fixed smooth · fixed rugged · **rolled per world** |
| **Disturbance** | none *(today)* · periodic forcing · stochastic weather · weather + seed bank |
| **Player's role** | gardener/optimiser · **perturber** · pure observer |

Reading the "today" column straight down is a fair summary of why the ecology
feels thin: it is the leftmost option on every single axis.

---

## 6 · The benches

Six parameterised instruments, each isolating one mechanism. All are standalone
HTML in `docs/superpowers/prototypes/`, all share the kit in `BENCH-KIT.md`, all
are seeded and reproducible.

| # | Bench | The question it settles |
|---|---|---|
| 1 | **Autocatalysis** | When is a randomly-rolled chemistry *alive*? Where is the phase transition, and is the RAF condition usable as a worldgen gate? |
| 2 | **NK landscape** | How rugged should Wonder be? What K, and does the complexity catastrophe bite at the genome sizes we actually use? |
| 3 | **Regulatory morphology** | Does "body = network attractor" give forms stable enough to be an identity but still able to jump? |
| 4 | **Tag ecology** | Does Holland's full ECHO produce trophic layers and mimicry — and does any of it survive being made non-lethal? |
| 5 | **Trophic flow** | Fund individuals or set ceilings? And does periodic forcing really widen coexistence? |
| 6 | **The island** | Does it cohere spatially, and can you *see* selection beat drift? |

Findings from each are recorded on the benches themselves and summarised in
[§8](#8--findings) once they land.

**Prior benches:** the reagent economy
(`2026-07-31-reagent-economy.html`) remains the chemistry/colour/morphology
prototype that these extend.

---

## 7 · What I would actually ship, if the benches hold

Stated as a bet, so it can be wrong.

**The spine stays what it was in §10/§18 of the previous document** — reagent
economy, catalysts, OKLCH pigment, chain-grown bodies, event-driven generation and
caching, the two-line fitness rewire in `flora.ts`. Nothing here displaces it.

**What this document adds to the v1 list:**

- **A rolled ruggedness parameter**, once Bench 2 says what range is usable. Cheap,
  and it is the difference between islands that vary and islands that vary *in
  kind*.
- **The RAF check as the worldgen viability gate**, replacing my hand-written
  rules, if Bench 1 says the transition is sharp enough to sit a threshold on.
- **Capacity-ceiling trophic coupling**, if Bench 5 confirms the funded model
  flickers.
- **Periodic forcing on carrying capacity**, if Bench 5 reproduces the
  coexistence-widening result. It is nearly free and the signals already exist.

**What moves to v2, deliberately:**

- Boolean-network morphology. It is the most beautiful idea here, but the chain-as-
  growth-program already covers morphology for v1 and two morphology systems is one
  too many. Revisit when the chain version's limits are known.
- Species-as-autocatalytic-loop. Genuinely radical; needs Bench 1 to say the loops
  are common before it is anything but a nice thought.
- Disturbance and the seed bank. Wants selection to exist first, or there is
  nothing for it to reset.

**What I would not build at all**, and want on the record: interference
competition, lethal predation, and any mechanic whose only surface is a number in a
panel.

---

## 8 · Findings

*Filled in as the benches report. Each bench also carries its own findings block
with the numbers in context.*

---

*— Fable*
