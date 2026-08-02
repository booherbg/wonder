# The ecology design space

*Fable, 2026-08-01. A synthesis written alongside seven working benches. Companion
to [`02-ECOLOGY-FOUNDATIONS.md`](02-ECOLOGY-FOUNDATIONS.md), which holds Blaine's
soil/CA proposal, my response, and the reagent-economy design. This document goes
underneath all of that: what the ecology is **for**, what Kauffman and Holland
actually give us, the axes the design can vary along, and which of those axes the
benches measured.*

> **Start with the benches:**
> <https://claude.ai/code/artifact/6c48a76a-4bd1-48af-888c-acb9e5248ad1>
> — seven live instruments, every dial adjustable, every run seeded. §8 has the
> findings; §7 has what I would ship because of them.

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
F-generated) condition, and crucially it comes with an *algorithm*: a greatest-
fixed-point pruning that finds the maximal RAF in polynomial time. That is about
thirty lines of code, and **Bench 1 implements it**.

Two things to keep honest about it, both from the verification pass:

- **The threshold result is mathematically sound — proved, not just simulated.**
  What did *not* survive is Kauffman's original chemical argument: holding the
  per-pair catalysis probability fixed as the network grows implicitly requires
  each molecule to catalyse exponentially many reactions. Later RAF work rescued
  the conclusion on much weaker assumptions rather than defending that argument.
  The correct statement of the good news is that **each molecule needs to catalyse
  only about one to two reactions on average**, and the required rate grows merely
  *linearly in maximum polymer length* — which, since molecule count is
  exponential in that length, is logarithmic in system size.
- **Closure is not evolution.** Vasas, Fernando, Santos, Kauffman & Szathmáry
  (2012) — with Kauffman himself on the paper — concluded they "cannot confirm
  previous claims that autocatalytic sets of organic polymer molecules could
  undergo evolution in any interesting sense by themselves." For us that is a
  scoping note rather than a blocker: we want RAFs as a **viability test and an
  origination mechanism**, with heredity carried separately by genomes. But it
  rules out the most seductive version of the idea, where the chemistry evolves on
  its own and we do nothing.

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

Kauffman's **complexity catastrophe** is the other half: at high K, as N grows, the
fitness of the local optimum reached by an uphill walk falls back toward the mean.
Translated: **there may be a maximum useful genome size, and it depends on how
coupled the traits are** — which speaks directly to the worry I raised in §6.4 of
the previous document, that adding reagent affinities and root genes roughly
doubles the genome.

But it is narrower than it is usually quoted, and the qualification matters for
us. It is a statement about **that particular search rule**, not about the
landscape: the *global* optimum stays far above the mean regardless of N, and
Solow et al. showed the effect is substantially an artefact of the NK model's own
assumption that fitness is an *average* of N random contributions, which forces
concentration. Population subdivision, recombination and long-jump mutation all
beat a single uphill walk. Fleming & Sorenson found no empirical inverted-U in
K/N.

So Bench 2 is not confirming a known law; it is measuring whether the effect bites
**in our regime** — small N, a real population rather than one walker, and
recombination present. If it does not, the constraint on genome size lifts and the
reagent economy gets easier.

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

*(Scope note, because the famous version of this is wrong. Kauffman's specific
quantitative claim — that critical K=2 networks have ~√N attractors, matching
cell-type counts — does not survive: Samuelsson & Troein showed the √N figure was
an artefact of undersampling and the true count grows superpolynomially. The
qualitative idea is fine, and has independent experimental support in real cells,
but we should take **attractor-as-stable-identity** and leave the counting
argument alone. Klemm & Bornholdt's finding is the more useful one for us: most
attractors of a synchronous network are artefacts of the lockstep update and
vanish under noisy timing — so if we want robust phenotypes we should be selecting
for the attractors that survive perturbation, which is exactly what Bench 3's
canalisation measure is looking at.)*

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

**A correction first**, because the popular version of this is not defensible and I
had written it. The schema theorem is a **one-generation lower bound** on how
short, low-order, above-average schemata propagate. It counts only the disruptive
effects of crossover and mutation, it cannot be iterated (observed schema fitness
shifts as selection biases the population), and it holds for *every* problem
instance — so it cannot distinguish problems where GAs excel from ones where they
fail. Wright, Vose & Rowe put it flatly: "The various claims about GAs that are
traditionally made under the name of the building block hypothesis have, to date,
no basis in theory." Holland's own Royal Road experiments came out backwards —
random-mutation hill climbing beat the GA by roughly tenfold on R1. (Though note
the detail the retelling always drops: steepest-ascent and next-ascent hill
climbing never found the optimum at all.)

What **is** defensible, and is enough for the argument:

> Recombination lets a population assemble partial solutions discovered
> separately, and on problems with the right structure this provably beats
> mutation alone — Jansen and Wegener constructed "real royal road" functions on
> which a steady-state GA with crossover finds the optimum in polynomial expected
> time while mutation-only algorithms fail with all but exponentially small
> probability.

That still lands the point about Wonder, because the point is about
*representation*. A flat vector of ten floats crossed by **midpoint averaging** has
no separable partial solutions to assemble at all. Averaging two genomes is not
recombination in any useful sense — it manufactures an intermediate, which is the
one thing guaranteed to destroy whatever either parent had found.

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

I originally wrote that the intermediate disturbance hypothesis — diversity peaks
at *intermediate* disturbance — is one of the most robust results in community
ecology. **That is close to the opposite of the truth, and a verification pass
caught it before it shipped.** Worth stating the real position, because it changes
what Bench 7 is for:

> Disturbance genuinely shapes diversity, but the textbook claim that diversity
> peaks at intermediate disturbance does not hold as a general law. Mackey & Currie
> (2001) found the hump-shaped pattern in only **16%** of 116 species-richness
> studies, with *no significant relationship* the most common outcome. Fox (2013,
> *TREE*) argued the hypothesis should be abandoned outright, on the grounds that
> all three mechanisms usually invoked to produce the hump do not logically imply
> it. Sheil & Burslem replied that Connell's narrow original formulation survives,
> but consensus has not returned. The current framing (Miller, Roxburgh & Shea
> 2011) is that disturbance–diversity relationships take **many** shapes depending
> on whether frequency, intensity or extent is varied, and a hump is one possible
> outcome among several rather than the expected one.

So the case for disturbance in Wonder cannot lean on IDH. It has to rest on the
narrower and better-supported claim that **disturbance resets succession**, and on
the design argument that a world with no reset converges and stops being worth
watching. Bench 7 therefore tests whether a hump appears *in our model* rather
than assuming one, and a flat or messy curve there is a real result, not a bug.

Wonder has no disturbance at all, which is a structural reason its islands
monotonically converge and settle.

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
change. Their interaction is usually called the **Baldwin effect**: plastic
individuals survive long enough for selection to act, turning a flat landscape
with an isolated peak into one with a usable gradient. Worth flagging that this is
an actively discussed mechanism rather than a settled fact — the plastic alleles
never fully disappear in Hinton & Nowlan's canonical model, plasticity can also
*slow* genetic change by shielding genotypes from selection, and a 2015
re-analysis showed their benchmark task is solvable by conventional population
genetics without any learning at all.

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

### 4.6 The island's market — scarcity as the instrument

The reagent economy creates emergent scarcity, and scarcity has a natural
readout that this project has not considered: **a price.**

For each reagent, compute a shadow price from how contested it is — demand across
all live metabolisms against what the ground actually supplies. Then show the
island a **market report**: what is cheap, what is dear, what has moved this
season.

Why this is worth more than another chart:

- It is the single most **compressed** description of an island's state. One
  column of numbers tells you what the place is short of, which is the same thing
  as telling you what will invade next and what any newcomer will be selected for.
- It is **predictive**, so it rewards being read. A player who notices violet is
  dear can go and plant something that makes violet, and be right. That is a
  genuine strategy loop that costs no new mechanics — it is a *view* onto
  mechanics we already have.
- It is exactly the SimCity/Civ/Factorio register Blaine has been asking for, and
  it arrives without making the game about optimisation, because the player is
  still only choosing where to perturb.

Prices also give a clean, principled definition of a **niche**: an unexploited
combination of cheap inputs. The empty regions of the audit's requested
niche-space map are just the bargains nobody is taking.

### 4.7 Two generative systems, for two different visual jobs

A distinction worth making explicitly, because conflating them is why generated
creatures so often look generated:

- **Structure** — the silhouette, the branching, the architecture. Best from a
  **growth grammar** (the metabolic chain as a program, §14 of the previous doc).
  Grammars produce structure that reads as *grown*.
- **Surface pattern** — spots, stripes, marbling, the markings on a wing.
  Structure grammars are bad at this. **Reaction–diffusion is what actually
  produces it in life**, and it is cheap, and it is stunning.

Running a small Gray–Scott field over an organism's body to generate its markings
would give Wonder a pattern vocabulary it has no other route to, and it would tie
back into the tag system directly: the resulting pattern *is* the appearance map
the pollinators and predators read. Two parameters per organism, and the markings
are heritable because the parameters are.

### 4.8 Niche construction — the theory name for what the soil layer already does

Plants draw reagents down, leak catalysts, and drop litter. That changes the
ground, which changes what can grow there next, which changes selection on the
plants. This is **niche construction** (Odling-Smee, Laland), and naming it
matters because the theory says something we would otherwise have to discover the
hard way: organisms that improve their own habitat become *founders of
communities*, and the resulting feedback can be far stronger than selection on the
organism alone.

The design consequence: **do not treat drawdown purely as depletion.** A plant
that leaves the ground *better* for its own kind — or for a specific partner — is
where the most interesting long-run behaviour will come from, and it is one flag
away from what §6.3 of the previous document already proposes.

### 4.9 Every mechanic must land in the first ten seconds

The legibility failures are the ones that killed the ancestors of this game, so
this deserves an architecture rather than a reminder. Three tiers, each with a
different audience and a different budget of attention:

| Tier | Cost to the player | What carries it |
|---|---|---|
| **Ambient** | 0 seconds — just looking | colour, form, movement, density. A meadow gone violet; a plant with visibly elaborate roots |
| **The tell** | ~10 seconds — lean in, inspect | *one sentence* naming the cause. "Its roots chase gold, and there is little here." |
| **The ledger** | minutes — charts, market, chain logs | the full instrumentation, for the player who wants to be right about a hypothesis |

And the rule that follows:

> **A mechanic that does not land at the ambient tier does not ship.** Not "gets a
> readout added later" — does not ship.

Wonder's own stated principle is that every hidden value earns a visible tell.
This is the stronger version: the tell must be visible *before the player asks*,
because the player who has to ask is already the player who was going to stay.
The one we lose is the one who never leaned in, and they only ever see tier one.

Note how well this composes with §3.1's rule — prefer mechanisms whose state is
already visible to something else in the world. A mechanism read by another
creature is automatically ambient, because you can watch the creature respond to
it. The two rules are the same rule seen from different ends.

### 4.10 The session arc this all has to serve

Concretely, what a good hour looks like, so the mechanics can be checked against
it rather than against taste:

| Time | What happens | What it requires |
|---|---|---|
| 0–2 min | arrive; the island is beautiful; walk | **beauty at the ambient tier** |
| 2–10 min | notice something odd — a colour, a shape, a bare patch | **variance that reads without explanation** |
| 10–30 min | form a hypothesis; check it against a tell or the ledger | **traceable causation** |
| 30+ min | perturb — amend a bed, carry a catalyst, move a seed | **verbs that change the question** (§4.1) |
| next session | return and find out what came of it | **persistence, and a world that moved without you** |

Everything in this document is in service of the middle three rows. The game
already does the first row well and the last row adequately.

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

Twelve parameterised instruments, each isolating one mechanism. All are standalone
HTML in `docs/superpowers/prototypes/`, all share the kit in `BENCH-KIT.md`, all
are seeded and reproducible. Every one opens with a **`.sysblock`** — what the
model is, its parts defined with types and ranges, its procedure numbered in
execution order, and what each panel shows — before any finding.

**Index (start here):** <https://claude.ai/code/artifact/6c48a76a-4bd1-48af-888c-acb9e5248ad1>
· live at <https://blainebooher.com/wonder/benches/>

| # | Bench | The question it settles | Live |
|---|---|---|---|
| 0 | **The reagent economy** | Can colour, yield and silhouette all be readouts of one metabolism? Is a random hand of recipes playable? | [↗](https://claude.ai/code/artifact/5d1bc66c-6609-4e01-bb96-4c3b6be832c0) |
| 1 | **Autocatalysis** | When is a randomly-rolled chemistry *alive*? Where is the phase transition, and is the RAF condition usable as a worldgen gate? | [↗](https://claude.ai/code/artifact/54f6c253-96be-4733-b448-53fb1f677e04) |
| 2 | **NK landscape** | How rugged should Wonder be? What K, and does the complexity catastrophe bite at the genome sizes we actually use? | [↗](https://claude.ai/code/artifact/5624c49b-28e0-47be-a538-4005fe2353f5) |
| 3 | **Regulatory morphology** | Does "body = network attractor" give forms stable enough to be an identity but still able to jump? | [↗](https://claude.ai/code/artifact/d3ce6504-7b67-4b6b-a68b-687ce0cd547d) |
| 4 | **Tag ecology** | Does Holland's full ECHO produce trophic layers and mimicry — and does any of it survive being made non-lethal? | [↗](https://claude.ai/code/artifact/7021b774-cbbe-402e-9003-9b76b81921ab) |
| 5 | **Trophic flow** | Fund individuals or set ceilings? And does periodic forcing really widen coexistence? | [↗](https://claude.ai/code/artifact/b437e032-2aaf-427e-9cf3-0e8a42642cd1) |
| 6 | **The island** | Does it cohere spatially, and can you *see* selection beat drift? | [↗](https://claude.ai/code/artifact/99589bf5-54bc-45c6-97ac-337fa8b932a0) |
| 7 | **Disturbance** | Does diversity peak at intermediate disturbance, and does the effect survive being made peaceful? | [↗](https://claude.ai/code/artifact/3b4fd3e7-92eb-45c7-b346-55beed29bc70) |
| 8 | **Markings** | Is reaction–diffusion pattern heritable in small steps, and does anything survive being shrunk to a sprite? | [↗](https://claude.ai/code/artifact/987c784c-9a01-4942-a589-7852d1a5b9eb) |
| 9 | **The host plate** | How much plate does the picture need? Is 30×50 enough? | [↗](https://claude.ai/code/artifact/b0722151-48d8-438a-9df0-4a1061ad4d23) |
| 10 | **Island palette and light** | Does biasing hues to a key make islands beautiful without making them alike — and does earned colour survive dusk? | [↗](https://claude.ai/code/artifact/08d56254-4f5f-4e2f-8d8e-f12038aa4d0a) |
| 11 | **Motion signature** | Is motion legible as a lineage identity at five pixels, and does it work as a second camouflage axis? | [↗](https://claude.ai/code/artifact/a9abda24-c51f-4fa9-aeda-2252ae4026d1) |

Benches 1–7 ask whether the mechanisms **work**; 8–11 ask whether they **read**.
Findings are recorded on the benches themselves and summarised in
[§8](#8--findings) and [§11](#11--art-bench-findings).

---

## 7 · What I would actually ship, if the benches hold

Stated as a bet, so it can be wrong.

### 7.0 First — the minimal grade-3 loop, and why it should ship before the economy

I want to argue against my own previous proposal on sequencing, because stress-
testing it turned up something worth acting on.

Ask what the **smallest possible system** is that delivers grade-3 adaptive
surprise (§1) with traceable causation (§0). It needs exactly five things:

1. the ground offers something **typed and spatially patterned**,
2. organisms have a **heritable, modular way** to exploit it,
3. exploitation success drives **differential reproduction**,
4. the strategy is **visible in the organism's appearance**,
5. **something else in the world reads that appearance**.

Here is a design that satisfies all five and is perhaps two hundred lines:

> Soil carries N reagent types in tiled patterns. A plant's genome gains an
> **affinity vector** — N floats, how well it uses each reagent. `uptake =
> affinity · local availability`, `vigor = uptake − cost`. Vigor multiplies
> reproduction and biases the crowding thin. **Pigment is the tier-weighted mean
> hue of what it actually took.** Insects match pigment. Done.

No cards. No tiers. No chemistry, no catalysts, no chain-as-body. And it still
produces the thing we are actually after: put that system in two biomes with
different patterns and the lineages **diverge into visibly different colours
because they are solving different problems**, and you can trace it.

That matters because it is the honest de-risking move. The card economy is better
— §12–§14 of the previous document argues why, and I stand behind all of it — but
it is *much* bigger, and if it fails the ten-minute test (§4.4) we will have spent
a month finding out. The minimal loop is small enough to build and evaluate
quickly, and everything the economy adds sits cleanly **on top** of it rather than
replacing it:

| The economy adds | On top of the minimal loop |
|---|---|
| conversion cards | the affinity vector becomes the *gather* step |
| tiers and chemistry | lets a plant **make** what the ground lacks |
| catalysts | plants start facilitating each other (§2.1, §4.8) |
| chain-as-body | morphology stops being a separate system |
| the printable run | the tell gets a sentence instead of a number |

**So: build the minimal loop first, confirm the loop actually closes and reads,
then layer the economy.** Same destination, one early checkpoint where being wrong
is cheap.

#### What it would actually touch

I checked this against the code rather than estimating, and it is smaller than I
expected — because `genome.ts` turns out to be **table-driven**.

`mutate`, `cross`, `clampTrait`, `driftDistance` and `phenoKey` all iterate
`NUMERIC_TRAITS`, which is just `Object.keys(GENOME_BOUNDS)`
(`genome.ts:36-49`). So adding an affinity vector is **six new rows in one
table** — `aff0: [0,1] … aff5: [0,1]` — and every genetic operator picks them up
with no edit at all. Mutation, crossing, drift distance and the render cache key
all just start including them.

| File | Change |
|---|---|
| `world/minerals.ts` *(new, pure)* | `rollMinerals(seed)` → per-biome motifs; `mineralAt(map, x, y, m)`. Follows `materials.ts`'s deterministic `hash2d` scatter; derived from seed, so nothing new to save |
| `world/generate.ts` | hoist the **moisture** value that is currently computed and thrown away at line 271 onto `WorldMap` — one `Float32Array`, and it is the natural gradient input |
| `life/genome.ts` | six rows in `GENOME_BOUNDS`. **Plus the drift fix below** |
| `life/floraFitness.ts` *(new, pure)* | `uptake`, `cost`, `vigor` — fully testable in isolation |
| `life/flora.ts` | the two lines: `repro *= vigor(p)` at ~548, and sample-3-take-worst in the crowding thin at ~531 |
| `game/swarms.ts` | flower palette from the affinity vector instead of `randColor(rng)` at ~465 |
| `render/renderer.ts`, `game/worldlab.ts` | a mineral overlay (copy the 18-line `soilTiles` block at `renderer.ts:498-516`) and a lab dock tab |

**The one non-obvious hazard, now confirmed by reading it:** `driftDistance`
(`genome.ts:97-107`) sums squared per-trait distances and divides by
`NUMERIC_TRAITS.length`. Going from 9 traits to 15 therefore *dilutes every
existing trait's contribution by a factor of ~1.7*, and speciation — which
triggers off exactly this number — will shift on every already-saved seed. That
is not a reason not to do it; it is a reason to ship the fix in the same commit.
The fix is as table-driven as the rest: a `DRIFT_WEIGHTS: Record<NumericTrait,
number>` beside `GENOME_BOUNDS`, weighting load-bearing traits up and cosmetic
ones down, and a weighted mean instead of a flat one. Perhaps five lines, and it
independently repairs the audit's finding #3 — that speciation currently fires
mostly on meaningless drift.

### 7.1 Then the economy

**The spine stays what it was in §10/§18 of the previous document** — reagent
economy, catalysts, OKLCH pigment, chain-grown bodies, event-driven generation and
caching, the two-line fitness rewire in `flora.ts`. Nothing here displaces it; §7.0
just puts a checkpoint in front of it.

**What this document adds to the v1 list** — the conditionals are now resolved, so
these are commitments rather than bets:

- **A rolled ruggedness parameter, centred on K = 3 with a band of 2–4.** Bench 2
  settled it, and settled the follow-up worry too: the best K does not move as the
  genome grows, so this does not have to be re-tuned every time we add a trait.
- **The RAF check as the worldgen viability gate** — but gating on **maxRAF size
  (≥ 5 reactions)**, never on RAF existence, which Bench 1 showed fires 3× too
  early on trivia. And the target is islands *near* the transition with a large
  unreached frontier, not the richest chemistry available.
- **Capacity-ceiling trophic coupling.** Confirmed at 1.000 versus 0.490 top-level
  persistence over 200 paired seeds, and it survives zero noise.
- **A "mean surplus over time" chart, built before the hue ribbon.** Bench 6 found
  it separates selection from drift by tick 50 where the ribbon needs 250–400. It
  is also much cheaper to build.
- **~~Periodic forcing on carrying capacity~~ — dropped.** Bench 5 returned a
  negative result: it *narrows* coexistence by 4.6%, because shared multiplicative
  forcing leaves every capacity ratio unchanged. This reverses the audit's
  "cheapest real win on this whole list" and is the clearest example of why the
  benches were worth building.
- **Pattern regularity demoted** from balance-critical to a texture control, per
  Bench 6 (§8).

**What moves to v2, deliberately:**

- Boolean-network morphology. It is the most beautiful idea here and Bench 3 says
  it works — exact stability, 70% canalisation, bimodal punctuated jumps — but the
  chain-as-growth-program already covers morphology for v1, and two morphology
  systems is one too many. The bench also found the readout bug (truncating to the
  first 12 genes collides 26% of phenotypes) so whoever picks this up starts a day
  ahead.
- Species-as-autocatalytic-loop. Still the most interesting idea in the document,
  and Bench 1 says the loops do show up — but also that closure is not evolution,
  so it would be an origination mechanism rather than a replacement for genomes.
- **Disturbance, promoted from "later" to "soon", and specifically the gentle
  version.** Bench 7 found suppression beats clearing (4.91 vs 4.52 effective
  species) because clearing subsidises colonisers. It still wants selection to
  exist first, or there is nothing for it to reset.
- The seed bank, **demoted**. Bench 7 found it is worth nothing at the diversity
  peak and only saves the high-disturbance tail — and that peaceful dynamics
  already remove most of the extinction risk it insures against.

**What I would not build at all**, and want on the record: interference
competition, lethal predation, and any mechanic whose only surface is a number in a
panel.

---

## 8 · Findings

*Each bench carries its own findings block with the numbers in context; this is
the summary and, where a result changes the design, what it changes.*

### Bench 1 — Autocatalysis

**The RAF condition works as a viability gate, but the naive form is a trap.**
Because the food set is unlimited, a single reaction `food + food → x` catalysed
by a food molecule *is* formally a maximal RAF. So "does a RAF exist" crosses 50%
at f ≈ 0.49 while a chemistry that can actually support a metabolism needs
f ≈ 1.48 — a **3× error, entirely on trivia**. The fix is to gate on **maxRAF size
≥ 5 reactions**, and that is not a fudge factor: the maxRAF is violently bimodal
(at L=7 the median jumps 0 → 520 across one step in p), so any threshold from 3 to
50 draws the same curve.

The transition reproduces Hordijk & Steel's *shape* — across L=3→7 the reaction
count grows 64×, critical p falls 12×, and critical catalysis rate rises only ~5×,
roughly linearly in L. Their f ≈ 1–2 constant does not transfer directly, because
this bench does ligation only and runs well below the polymer lengths the
published figures come from.

**The result I did not expect, and it inverts an assumption:** the *adjacent
possible* — the frontier of what a world could next invent — peaks near the
transition (32.5 molecules at f ≈ 1.5) and **collapses to zero** in rich chemistry
(f = 6), where the closure has already swallowed the entire molecule set.
Frontier-to-made ratio runs 3.6 at f = 1.5 down to 0.05 at f = 3.5.

> **A "more chemistry is better" worldgen gate would select exactly the wrong
> islands.** What we want is islands *near the line* — metabolically viable, but
> with most of their space still unreached. That is a genuinely different tuning
> target from the one I would have written, and it has a pleasing reading: the
> most interesting island is not the richest one, it is the one with the most left
> to discover.

The three-way alternation also earns its keep rather than being ceremony: at the
default state maxRA = 74 and maxF-generated = 196, but the true maxRAF is **17**.
Fifty-seven reactions pass both conditions separately and fail together.

### Bench 5 — Trophic flow

**Decision 1: the capacity-ceiling model wins, decisively.** Top-level persistence
**1.000 (ceiling) vs 0.490 (funded)** — paired difference +0.510, SE 0.0085,
t ≈ 60, over 200 paired seeds × 2,000 ticks. Funded coupling blinks the top level
out and back **19.7 times per 1,000 ticks**; the ceiling model never blinks.

Three things make that more than a tuning artefact: it **survives zero noise**
(the deterministic funded trajectory is a Rosenzweig–MacArthur limit cycle whose
trough reaches 0.003 against a 0.030 threshold — a Holling type II consumer
stacked two deep simply oscillates); no upkeep setting rescues it; and the only
escape is transfer efficiency ≥ 0.35, i.e. abandoning the realistic 10%. Funded
coupling does not even deliver the pyramid that motivated it — realised transfer
at the top step is **3.0% versus 10.0%** for the ceiling, because the population it
is funding spends half its life in the refuge.

**Decision 2 is a negative result, and it overturns prior project guidance.** The
2026-07-24 audit called wiring a periodic carrying capacity "the cheapest real win
on this whole list." Tested: **periodic forcing did not widen coexistence, it
narrowed it by ~4.6%.** Every cell of the competition-strength grid is zero or
negative; the coexistence boundary moves the wrong way, 0.88 → 0.80.

The *reason* matters more than the number, because it generalises:

> Shared multiplicative forcing leaves every ratio Kᵢ/Kⱼ unchanged, and the
> Lotka–Volterra coexistence condition depends only on those ratios. There is no
> channel through which it could create a temporal niche. All that is left is the
> cost of the troughs.

Giving each species its own forcing phase — the obvious repair — makes it
dramatically **worse** (−56.9%). Asynchronous forcing without a storage mechanism
is a periodic execution, not a niche; Chesson's storage effect requires a life
stage that survives the bad season.

> **The actionable conclusion: if Wonder wants periodic forcing to buy diversity,
> build the seed bank, not the wobble.** That also retroactively explains why §4.2
> pairs disturbance *with* a seed bank rather than proposing it alone.

Note this does not contradict Swailem & Täuber — and I had mis-described their
result in earlier drafts. Theirs is a **stochastic spatial lattice predator–prey**
model whose coexistence phase is sustained by pursuit-and-evasion waves, not a
well-mixed competing-species model. A well-mixed patch is structurally blind to
anything that needs space or discreteness, so the negative result here is about
*our* simplification, and a spatial version could still show the effect.

### Bench 2 — Ruggedness

**The answer is K = 3, with a usable band of 2–4**, and four independent measures
agree on it. Mean fitness reached at N=16 runs 0.680 (K=0) → 0.716 (K=2) →
**0.724 (K=3)** → 0.710 (K=4) → 0.652 (K=15).

The finding that makes this actionable: **the best K does not scale with genome
size.** Argmax across N = 10, 12, 14, 16, 18, 20 is K = 4, 3, 2, 3, 3, 3 — a small
constant. So the recommendation survives Wonder's genome growing, which was the
thing I was most worried about.

What K=3 buys, in the terms §2.2 cared about: **a menu rather than a monolith or a
haystack.** 58 local optima among 65,536 genotypes; the most popular basin takes
12.5% of independent lineages and the top three take 29%. Compare K=0 at 100% (one
answer, always, on every island) and K=15 at 0.8% (no answer is ever *the*
answer). A population run ends on 4.0 distinct peaks with the dominant one holding
87% — which reads exactly as **"one common form plus a few odd rare ones"**, and
that is a good description of an island worth walking around.

Adaptation also stays legible at K=3: correlation length 3.3 mutations, walks 4.9
steps. A visible handful of events, not one jump and not an endless shuffle.

Two results I did not expect:

- **K=0 reaches *lower* fitness than every K from 1 to 9.** A perfectly smooth
  landscape is not just boring, it is *worse*. No interactions means no happy
  accidents either. That is a much better argument for epistasis than "it's more
  realistic."
- **The complexity catastrophe is real but not our problem.** At K=N−1 it costs
  0.669 → 0.644 going from 10 to 20 traits — about 2.5 points out of a 17-point
  band above chance. At fixed low K there is *no* decline at all across N=4…20.
  Extrapolation puts genuinely catastrophic territory at 100–200 loci.
  > **Wonder can grow its genome. It just cannot grow K alongside it.**
  That fully resolves the §6.4 worry from the previous document: doubling the
  genome is safe, provided the new traits do not all interact with the old ones.

The drift control is the one to show Blaine: with selection at zero the population
pins at fitness 0.500 with mean Hamming distance exactly N/2 **at every K**. That
is Wonder today, on any landscape you like. Ruggedness is the *second* decision;
having a fitness function at all is the first.

### Bench 3 — Body as attractor

**Stability: confirmed, and it is exact rather than approximate.** Mean activation
over an attractor cycle is a property of the cycle *as a set*, so it cannot depend
on entry phase or on which basin member you started from — 160/160 checks across
10 seeds returned bit-identical phenotype vectors. The body is a pure function of
the attractor, so it computes once at birth and caches, which was a hard
requirement.

**Distinctness: fails on the obvious readout, and the fix is known.** Reading only
the first 12 genes throws the rest of the network away, and in the ordered regime
most genes are frozen — so at N=24, K=2, **26% of attractor pairs draw literally
the same plant**, and at N=48 it collapses to 68%. That is a readout bug rather
than a problem with Kauffman's idea: hash *all* N mean-activations into the 12
morphological parameters instead of truncating.

Canalisation behaves exactly as the theory says, which is reassuring given how
much of the surrounding theory turned out to be contested:

| K (at p=0.5) | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| sensitivity `2Kp(1−p)` | 0.5 | 1.0 | 1.5 | 2.0 | 2.5 |
| **silent mutations** | 70% | **59%** | 39% | **19%** | 16% |
| mean cycle length | 2.1 | 4.2 | 8.9 | 54 | 170 |
| frozen genes | 88% | 60% | 30% | 7% | 3% |

**Recommended: N = 32, K = 2, p = 0.40** — sensitivity 0.96, just inside ordered.
Gives 4.8 attractors, 4.1 *distinct* bodies, 4% collision, 70% canalisation, and a
genome under 100 bytes.

And the finding that matters most for the game:

> **Mutation effect sizes are bimodal in the ordered regime** — 73% under 0.1, 19%
> over 0.4, only 8% in between — and smooth in the chaotic regime. Punctuation is
> specifically an *ordered-regime* property.

That is the witnessable jump, delivered: a lineage holds its shape through most
mutations and then, occasionally, changes dramatically. Not a slider being nudged
— an event. Wonder has no mechanism that can currently produce one.

*(Note the two benches recommend different K values — 3 for the fitness landscape,
2 for the regulatory network. They are different models measuring different
things; there is no contradiction, but the numbers should not be pooled.)*

### Bench 4 — Tag ecology

**Trophic layers: yes.** Sustained layering in 7/7 seeds by t ≈ 387. With combat
bias at zero, **0/7** ever layer — mean trophic level sits at exactly 1.000. So the
structure is real and it is caused by the mechanism rather than by the plotting.

**Arms race: yes, and it is the cleanest signal in the suite.** Attack score falls
0.354 → 0.276 against a no-combat drift control of 0.012 — six times the control —
and keeps oscillating rather than settling. It has a signature you can read with
your eyes: **defence tags go monotone** (`ccccc`, `bbbbbbbb`, repetition 0.852 vs
0.488 control) while appearance stays mixed at 0.467. Hiding looks different from
advertising, in the raw data, with no analysis.

**Mimicry: no** — and this is the claim the bench was most expected to confirm. Raw
appearance similarity reaches 0.8–1.0, but that is a maximum over hundreds of
pairs. Measured against the right internal control — the same statistic on the two
*private* tags, which cannot be imitated — the excess is **−0.021**. Public tags
converge no more than unimitable ones do. No parameter regime lifted it above
0.054. Mimicry needs something this model does not have.

**The decisive result, and it reframes the peaceful constraint entirely:**

> Lethal mode and non-lethal mode came out **bit-identical across all seven
> seeds**, because starvation never fired at any survivable upkeep. Every bit of
> the selection was competitive displacement at carrying capacity. Push upkeep 30×
> until starvation does fire and it does not select — it exterminates (population
> 0 versus 13 survivors).

**It was never death doing the work. It was a full world.** That is a much better
argument for Wonder's peaceful pillar than the one we have been making: turnover
has to stay fitness-dependent, but it never has to be visible, attributable, or
even lethal. Finite space plus differential rates is not a compromise, it is the
mechanism.

With one real cost, which should be on the record: **full rates-only keeps the
layers but loses the arms race entirely** (attack score moves 0.0073 — *less* than
the 0.0123 drift control). Species count nearly doubles, 35 → 65, with higher
Shannon diversity. That is **diversity without differentiation** — more kinds of
thing, less reason for any of them to be the way they are. Worth knowing before we
soften everything by reflex.

### Bench 6 — The island

**Selection visibly beats drift, and the numbers are not close.** Same world, same
soil, same founders, seed 2438, 900 ticks:

| | drift (selection 0) | selected |
|---|---|---|
| effective hue bins (of 36) | 8.66, one mode | **4.54, two modes** |
| mean surplus | −6.0 | **+27.2** |
| mean tier reached | 1.07 | **2.31** |
| uptake per root cell | 0.184 | **0.260** |
| lineages | 560 | **173** |

The ribbons separate from about tick 250 and are unmistakable by 400, and it holds
on every seed tried. But **mean surplus is a far better instrument than the
ribbon** — it separates by tick 50. If we want a chart that shows selection
working, that is the one to build first.

The drift arm's mean tier of **1.07** is the quietly damning number: without
selection, **hands rot under mutation** until the island lives entirely off the
"tier-1 is always edible" floor. Drift does not merely fail to improve things; it
actively degrades an inherited metabolism.

**It falsified my "master tuning knob" claim, and the reason is instructive.**
§4.2 of the previous document argues that pattern regularity is the central dial,
because a soil pattern must be predictable enough to be worth adapting to. The
slider provably works (same-biome field correlation 0.97 → 0.48) — and **the
surplus gap is flat scatter across its whole range** (+25.3, +16.0, +20.9, +20.0,
+18.8, +22.6). There is no threshold.

> The reason: **tropism-grown roots are plastic.** They find good tiles by
> *looking*, so they never needed the motif to repeat. Regularity would only
> matter for genotype-fixed roots — a CA rule table, which is exactly the design
> I argued against on other grounds in §4.1.

So the two decisions are coupled in a way I did not see: **choosing plastic growth
removes the need for a learnable pattern.** That is a simplification worth taking,
and it means the regularity parameter can be a texture control rather than a
balance-critical one.

**Mobile versus immobile reagents diverged — but not as designed.** They split on
*concentration*, not reach: peak tile mass 4.44 (immobile-led) versus 2.05
(mobile-led), a 2.2× gap in every world, while spread barely moved (1.78 vs 2.13).
And the split appears **at selection zero**, so it is phenotypic — the growth rule
produces both shapes on contact with the ground. **Selection does not invent the
strategies; it decides which one owns the island** (293/420 → 967/62 by tick 300).

Four more things it surfaced that nobody designed:

- **Half the rolled worlds are duds.** Seeds 7 and 42 end below tier 1.6 with
  negative surplus *even at full selection*. The chemistry roll matters more than
  any slider on the page — which makes Bench 1's rejection sampler not optional.
- **Selection makes the island emptier first** (−22% population at tick 150,
  crossing over around 340). Anyone watching a live tuning run would think they had
  broken it.
- **Selection collapses speciation 3.2×** while the population grows. Selection and
  splitting pull against each other, which the current `driftDistance` tripwire
  has no way to express.
- **Catalysts pin their lineages to specific biome bands** with no range rule
  anywhere in the code. That is §12.1's facilitation claim arriving unbidden.

And a legibility finding worth keeping: the "tier-1 is always edible" floor turned
out to be **load-bearing for the visuals**. Without it, one bad card swap zeroes a
plant's pile, the pigment falls back to a constant, and the ribbon goes mute in
*both* arms. The viability floor is not just kindness to the simulation; it is what
keeps the picture readable.

### Bench 7 — Disturbance and the seed bank

**A hump appeared — in all four series — peaking at D ≈ 0.0114.** Effective
species run 2.08 ± 0.38 at zero disturbance → **4.52 ± 0.26** at the peak → 1.99 at
D = 0.15. A 2.2× gain.

**The peaceful version survives, and beats the lethal one** — 4.91 ± 0.11 versus
4.52 ± 0.26, outside the error bars. That is the opposite of what I expected. The
reason is worth understanding because it generalises: peaceful mode holds ~96%
occupancy against lethal's ~82%, so **clearing a patch is partly a coloniser
subsidy**, while merely suppressing the incumbent makes it beatable *without
surrendering the space*. Suppression is a better diversity mechanism than removal.

Lengthening the recovery window (25 → 60) does not raise the peak but lifts the
low-disturbance end sharply (4.18 → 4.69), moving the peak left. In design terms:
**gentler weather buys the same ecology**, which is exactly the trade Wonder wants.

**The seed bank works but is narrower than advertised**: 6 revivals against 0 with
the bank off, ending 6-of-8 species versus 3-of-8. At the peak it is worth nothing
(inside the error bars) — it earns its keep only in the high-disturbance tail
(1.99 → 2.99). Half-life barely mattered. And the sharpest correction to my own
priors: **peaceful mode posted 0 revivals and only 2 extinction events, against
lethal's 8.** The bank insures against a risk that peacefulness largely removes.
So §4.2's pairing of disturbance *with* a seed bank is right for a lethal world
and partly redundant for ours.

**The most uncomfortable result in the whole suite, and it should stay in.** The
no-trade-off control collapses as expected (1.07 effective species, never above
2.4). But **three of the four no-trade-off series still pass the hump test**,
because five replicates make the error bars small enough. A statistically real hump
describing a functionally dead two-species community.

> That gap between *significant* and *meaningful* is a large part of what Fox
> (2013) was complaining about — reproduced here by accident, in a model we
> control completely. It is the best possible argument for why Bench 7 tests the
> hypothesis rather than assuming it.

### What the findings have already changed

1. **The worldgen chemistry gate** — target islands *near* the autocatalytic
   transition with a large unreached frontier, not the richest chemistry. Gate on
   maxRAF size, never on RAF existence.
2. **Trophic coupling** — capacity ceilings, settled, with numbers. This was
   already my recommendation on peacefulness grounds; it now also wins on its own
   terms.
3. **Periodic forcing is off the v1 list** and the seed bank moves up, which is
   close to a reversal of the audit's cheapest-win claim.
4. **Ruggedness has a number: K = 3.** And critically, it does not move as the
   genome grows — which clears the §6.4 objection to doubling the genome, provided
   the new traits do not all couple to the old ones.
5. **A perfectly smooth landscape is worse than a moderately rugged one**, not just
   duller. That reframes epistasis from a realism argument into a quality one.
6. **Punctuated morphological change is available**, and it comes specifically from
   the ordered regime of a regulatory network. If we want witnessable jumps rather
   than sliders drifting, that is where they live.
7. **"Pattern regularity is the master tuning knob" is withdrawn.** Bench 6 found
   no threshold at all, because plastic roots find good ground by looking. The
   parameter stays as a texture control; it is not balance-critical, and choosing
   plastic growth is what removed the need for it.
8. **The peaceful pillar got a better argument than the one we had.** Bench 4
   showed lethal and non-lethal runs coming out bit-identical — the selection was
   always competitive displacement at carrying capacity, never starvation. Finite
   space plus differential rates is the mechanism, not a compromise. But Bench 4
   also priced the *full* softening: rates-only loses the arms race and yields
   diversity without differentiation.
9. **Disturbance is worth building, and the gentle version is the better one** —
   suppression beat clearing (4.91 vs 4.52) because clearing subsidises colonisers.
   The seed bank is narrower than I claimed: it matters in the high-disturbance
   tail, and peacefulness already removes most of the risk it insures against.
10. **Mean surplus, not the hue ribbon, is the instrument to build first.** It
    separates selection from drift by tick 50 against the ribbon's 250–400.
11. **Two citations corrected before they shipped** — the intermediate disturbance
   hypothesis (§4.2) and the building-block hypothesis (§3.2), both of which I had
   written in their popular and indefensible forms. A third, Swailem & Täuber, was
   mis-described as a competing-species model when it is predator–prey on a
   lattice; that one matters because it is the paper the periodic-forcing idea
   rests on, and the correction explains why our well-mixed bench could not
   reproduce it.

---

## 9 · Addendum — what we missed

*2026-08-01, after a full QA pass. Written by looking back at the suite and asking
what it does not cover, which turns out to be a lot and to be concentrated in one
place.*

### 9.1 The gap, in one sentence

**All seven benches are about mechanism. Not one of them is about art.**

For a project whose first design pillar is beauty, that is a real omission and I
should have caught it earlier. We measured fitness landscapes, autocatalysis,
trophic coupling, canalisation and disturbance. We did not measure whether any of
it *looks good*, or whether a person can read it, and those are the two things the
game is actually judged on.

Benches 8–11 start closing it: **surface pattern**, **the host plate**, **the
island's palette and light**, and **motion as a phenotype**. They are described in
§10.

### 9.2 The three methodological holes

Worth naming separately from the feature backlog, because no amount of new
benches fixes them.

**No human has read any of this.** Every bench measures the model. None measures
whether a person can perceive what the model is doing. §4.4 proposed "one
traceable causal chain within ten minutes" as an explicit target and it remains
entirely unmeasured — which is precisely the failure mode that sank SimLife and
made *Creatures* take an hour to click. **This is the most important untested
claim in the whole programme**, and testing it needs a person, not a script.

**Nothing was tested at game scale.** Bench 6 runs 64×48 tiles. Wonder runs
300×300 with roughly 8,000 plants sampled 480-at-a-time on a two-second heartbeat.
Every performance and visual-density conclusion here is an extrapolation across
two orders of magnitude. The specific risk: at real density, colour that reads as
meaningful on a shelf of twenty specimens may read as noise across a hillside of
thousands — which is exactly what bench 10 is now for, but only at one scale.

**Fauna are still frozen.** Audit finding #2 — critters cannot be born, cannot
die, cannot change — is untouched by all eleven benches. Everything we built is
plants, chemistry, or abstract agents. The learned palate (Phase 0's B4) remains
the only proposal on the table, and it is unbuilt and unbenched. If Blaine's
favourite thing about the game is the critters, and it is, that is the wrong place
to have a hole.

### 9.3 Low-hanging fruit, ranked by payoff per line

**1 · Growth as animation.** Plants currently pop into existence fully formed. The
body is *already* produced by running a program — so run it over a second or two
instead of instantly and you can watch a plant write itself. This is perhaps
twenty lines, it costs nothing at runtime (it is the same computation, paced), and
it is "show, don't commemorate" applied to the single most obvious place in the
game. I think this is the best value item in the entire document.

**2 · Wind.** One vector field per island, rolled at worldgen. It is in the audit's
list as "perhaps ten lines," but its real value is that it is the one system that
ties four others together *visually*: seeds drift with it, insects fight it, plants
lean into it, and surface patterns stretch along it. Windward and leeward floras
diverge, and the island acquires an **orientation** you can read from a distance.
One field, four visible consequences — the best leverage available.

**3 · Surface pattern** (bench 8). Two parameters per organism for spots, stripes
and marbling, and — if it survives reduction to 7×7 — the pattern *is* the identity
map the insects match against, which makes the beautiful thing and the functional
thing the same object.

**4 · The island's key** (bench 10). One rolled number biasing the whole palette
toward a harmonic interval. Cheap, and it is the difference between a world that
has a mood and one that has a hue histogram.

**5 · The chain as a sigil.** Render each metabolism as a small generated glyph —
Rube-Goldberg machines as heraldry. Every species gets a mark you would recognise
in the journal, derived from what it actually does. Extremely on-brand for the
naturalist's-codex direction, and it is pure rendering with no simulation risk.

**6 · Names that encode something.** We roll reagent names from a curated list of
real pigment words (ochre, verdigris, cinnabar). That could go much further:
species epithets derived from the *chain*, so a name tells you something true. The
game already has a codex voice; this is cheap text with a high flavour return.

**7 · Senescence as a phenotype.** Not death — Wonder does not do death as an
event. But *how* a plant fades is free heritable variation with real visual
payoff: one lineage goes gold before it goes, another just stops. Autumn, earned.

### 9.4 Bigger swings, and why they are worth it

**Stratigraphy.** Soil accumulates layers; digging shows the island's past as
bands of colour. This makes the seed bank visible, makes *time* visible, and
converts "the island remembers its dead" from a nice sentence into a picture. It
pairs with disturbance (§8, bench 7), which is now promoted.

**The scale zoom.** Island → plant → root → chemistry as one continuous
gesture, each level its own visualisation. This is the insight surface (§4.9's
three tiers) expressed as a *movement* rather than as separate screens, and it is
the most natural fit I can find for the SimCity/Civ/Factorio compass without
turning the game into an optimisation problem.

**Convergent markings.** If pattern parameters derive from the metabolic chain,
then a plant and the specialist that works it can converge on the **same pattern** —
two organisms wearing the same stripes because they are locked together. Nobody
would author that; it would fall out of two systems reading one tag. It is the
single most striking image this design could produce and §3.1's "prefer mechanisms
already visible to something else in the world" is exactly the rule that generates
it.

**The chorus, as synchronisation.** The audit sketches insect clouds converging on
a shared signal. With motion genes (bench 11) that becomes a genuine
**phase-locking** phenomenon — Kuramoto coupling between clouds — which is
beautiful, emergent, cheap, and gives the "sensory exploitation" idea (a flower
that fakes the chorus) something concrete to exploit.

**Seasonal metabolism.** The chain's step budget varying with the season: long
summer chains, short winter ones. Same genome, different body, same year. Plants
that honestly look different at different times, with no new phenotype system.

**Symbiogenesis.** Two lineages that co-occur and match for long enough fuse into
a composite that inherits both habitats. In the audit, never explored, and it is
the only mechanism on any list that produces genuinely astonishing organisms — a
moss-coral living on rock *and* in the shallows.

### 9.5 What I would do next, in order

1. **Growth as animation** — a day, and it improves every existing screen.
2. **The minimal grade-3 loop** (§7.0) — the checkpoint that de-risks everything.
3. **Wind** — after the loop exists, so seed drift has something to bias.
4. **Surface pattern**, if bench 8 says it is heritable and survives 7×7.
5. **A legibility test with an actual person** — the ten-minute claim, measured.
6. **Fauna**, finally: the learned palate, then whether critters should be
   populations at all.

Items 1, 3 and 4 are art; 2 and 6 are mechanism; 5 is the one that tells us whether
any of it worked. That ratio is roughly right, and it is close to the inverse of
what the first seven benches sampled.

---

## 10 · The art benches (8–11)

Where §6's benches asked whether the mechanisms *work*, these ask whether they
**read** — which, for this game, is the harder and more important half.

| # | Bench | The question it settles |
|---|---|---|
| 8 | **Surface pattern** | Is reaction–diffusion *heritable* — does a small genetic change give a small pattern change — and does anything survive being shrunk to sprite scale, or to the 7×7 identity map? |
| 9 | **The host plate** | Blaine's own unanswered question: **is 30×50 big enough?** Answered with pixels rather than prose, across five resolutions, with insects perched at true scale. |
| 10 | **Island palette and light** | Twenty individually-justified colours can still compose into mud. Does biasing a world's hues toward a harmonic key make islands more beautiful without making them samey — and does earned colour survive dusk? |
| 11 | **Motion signature** | At gameplay zoom an insect is five pixels, so you cannot see its colour — but you can see how it moves. Is motion legible as identity, and does it work as a second camouflage axis? |

Findings land in §11 as they report.

---

## 11 · Art bench findings

### Bench 9 — The host plate

**Blaine's question is answered: yes, 30×50 is enough for the shoot — and the plate
should ship at 30×74** (30 wide, 50 shoot, a ground line, 23 root), which is
exactly what §5 of the previous document proposed. The aspect ratio does not want
to change.

At 30×50 the whole body plan reads: leader, branch order, leaf whorls, a median of
**7 individually countable blooms**, berries and catalyst nodes. Going up to
64×104 costs **4.4× the pixels and buys two more flowers**. Shoot ink coverage
actually *falls* from 12.8% to 9.3% as the plate grows — **bigger plates buy paper,
not detail.**

**My insect estimate in §5 was about 3× too small.** I said a perched insect would
be 2–3px. Measured against the real sprites — a world plant is 16×28
(`plantSprites.ts:6`) and the inked insect inside its 7×7 canvas is ~5×4
(`insectSprites.ts:15`) — holding that ratio puts a perched insect at **9px** on a
30-wide plate. The legibility floor is 6px (head lifts clear of the wing) and 8px
is unambiguous, and true scale crosses both *below* Blaine's proposed width. So
single-insect legibility was never the constraint.

**The actual constraint is crowding, and resolution barely helps.** At 30×50 the
median plate holds **two** pollinators before they merge. Ask for eight and the
median separable count is **one**, with a quarter of the plant occluded. 64×104
has 4.4× the pixels and still fits only three, because true-scale insects grow
with the plate.

> **A host plate cannot show a swarm.** Past about three, the design has to break
> true scale or stop drawing individuals. That is a real constraint on the whole
> "watch the pollinators work this plant" idea and it needs deciding before the
> view is built.

**The root pane works**, but only after two non-obvious fixes that are themselves
findings: six minerals **cannot be separated by hue** when a world rolls a hue
spread as narrow as 70°, so the ground needs a per-world *value* ladder with hue
riding on top; and the matched root pixel has to be the brightest thing in the
pane, wearing the mineral's own colour. With both, a centre cut shows a median of
**6 mineral bands** and matched-root length spans 1%–96% across islands — genuinely
diagnostic. Its weakness is emptiness rather than resolution: roots touch only 24%
of the ground drawn beneath them.

**And the finding I did not see coming, which corrects §13 of the previous
document.** Running my own colour rule literally, the median insect's gut chemistry
lands **5.4° of hue from its host**, with 71% inside 15° (n=800).

> I claimed "insects transform colour rather than copy it." It is true of about
> **one in five**. **Crypsis is the default outcome of the colour system** — the
> insect ends up wearing very nearly the flower's colour.

That is excellent news for the birds-hunt-what-stands-out mechanic, which now has
a natural baseline to hunt against. It is bad news for any UI that expects a player
to spot pollinators by colour, and the bench had to force body-dark/wing-light
*value* contrast to make them read at all. Value contrast, not hue, is what makes
an insect visible on its host.

### Bench 10 — Island palette and light

**Recommendation: split-complementary, grounded root, bias 0.70.** Against the
no-key control it is the only setting in the sweep where every number improves at
once — scene discord 26.1% → 19.5%, flora discord 23.5% → 18.8%, island difference
0.302 → 0.380, character spread 10.4° → 11.2°, over 14 islands per configuration.

**The result that reorganised the whole question:** a key that only touches the
*flora* buys almost nothing at scene scale. Complementary at full bias takes flora
discord from 23.5% to **8.3%** while the whole-scene number barely moves — the
plants agree beautifully with each other and go on disagreeing with the dirt.

> **Grounding the root — anchoring one hue to the terrain green, changing nothing
> else — is worth more than the choice of key.** Grounded tetradic reaches 9.6%
> flora discord, a 63% reduction.

The bench then declined to recommend the best-scoring option, for a reason I would
not have caught: **tetradic and triadic offsets are closed under their own
rotation**, so grounding them yields one identical anchor set for every island in
the game — and the island-difference statistic is blind to that. Split-complementary's
0/150/210 offsets are not rotation-symmetric, so grounding still produces distinct
chords. Bias 0.70 rather than 1.0 is arithmetic about arc width: 78% of the hue
wheel stays reachable at 0.70, only 39% at 1.0.

**Variety did not suffer — it improved.** Island difference *rises* under bias
(0.302 → 0.514), because an unbiased island has no character to differ in: ten
uniform hues make a flat histogram, and every flat histogram resembles every
other. The one genuine failure mode is **analogous**, the only key that makes
discord worse (26.1% → 37.7%) and, grounded, collapses variety outright.

**Earned colour does not survive dusk, and this is a real problem.** Pigment
separation retention against the unlit palette: **93% in daylight, 35% at the
twilight peak, 24% in deep twilight, 27% at night** — below half for about 54% of
the modelled cycle, with mean hue rotation of 60–62° at the worst point. It is the
*tint* term, not the darkness; at the peak the model mixes 49% toward a single warm
colour.

Since §13's whole argument is that colour carries information about metabolism,
losing two-thirds of that signal for half of every day is not cosmetic. **Glow is
the fix and it currently fires too late** — night-with-glow restores 108% of
separation, but dusk-with-glow only 74%, because glow fades on *luminance* while
the worst damage happens where the *tint* peaks. Driving glow off the tint term
instead is a one-line change, and the bench deliberately leaves it broken so the
table still shows the problem.

### Bench 11 — Motion signature

**Motion is a real phenotype, and at gameplay zoom it beats colour outright.**

**Separability: 89.1% against a 12.5% chance level** — leave-one-out
nearest-neighbour over eight genomes drawn *uniformly at random* from the gene box
(not hand-picked archetypes), 24 ten-second flights each, twelve features. Seven
times chance, 85.9–97.9% across four seeds, with between-genome scatter 1.87× the
within-genome scatter. The four named lineages score 100% with a clean diagonal,
but that number means less and the bench says so.

**The headline comparison:**

| sprite size | 2px | 5px | 14px |
|---|---|---|---|
| **motion** | 51% | **88.9%** | 99% |
| **colour** | 24% | **58.3%** | 100% |

Same classifier, same chance level, and colour was given its best case — four hues
spaced evenly at full palette chroma. **The curves cross at 8.5px.** Below that,
motion wins; above it, colour does. Colour's collapse comes from chromatic spatial
summation: a small sprite's chroma gets averaged over a patch much larger than the
sprite. That is the one assumed constant, so the bench swept it — across three
patch sizes and half/double σ the crossing stays between **5.2 and 11.2px**. The
exact pixel is soft; the direction is not. Motion is also ahead from the *first
quarter-second glance* (68% vs 47%), because speed is itself a gene.

> Wonder's world-zoom insects are about 5px. **At the size the player actually
> sees them, how a cloud moves is a better identifier than what colour it is** —
> and colour is the only channel the game currently varies.

This composes with Bench 9's crypsis finding in a way neither bench could see
alone: if insects mostly end up wearing their host's colour, then colour was never
going to distinguish them, and motion is not a nice extra — it is the channel that
still works.

**The camouflage trade-off is real, not a story.** 10 non-dominated genomes of 100,
**six distinct optima** across 41 predation weightings, spanning 77.6% of the feed
range, and every gene varies over 0.66–0.98 of its range along the front. The
control settles it: turn the predator off and the front collapses to **one** member
and one best motion. That is a frustrated optimisation of exactly the kind §4 of
the audit argued produces persistent diversity — and here it is, measured.

Two things worth acting on directly:

- **A legibility ranking for the genes**, which tells us what to build and what to
  cut: hover 1.85, dart frequency 1.75, speed 1.09, dart impulse 0.99, wind
  coupling 0.97, curvature 0.56, **turn sharpness 0.28**. The *rhythm* genes beat
  speed. Turn sharpness is nearly worthless and is the first thing to drop.
- **A heritability floor.** A genome differs from *itself*, run to run, by 0.232 of
  a lineage-distance. Mutations at σ ≤ 0.05 land under that floor and are invisible
  to a player *and* to the classifier; σ = 0.30 moves an offspring half a lineage
  in one step. That is a directly usable mutation-size range, and it is the sort of
  number that is very expensive to guess wrong.

### Bench 8 — Surface pattern

**Reaction–diffusion is heritable enough to be a lineage identity — with one
mandatory design change that costs a single integer.**

Mean pattern distance rises *strictly monotonically* across three decades of
mutation size, at both 32² and 64² grids, never differing between them by more
than 0.013 — so this is a property of the chemistry, not of the grid we happened
to pick. At δ = 0.004 a child sits at 10% of the unrelated-genome ceiling; at
δ = 0.008, 16%. Those are family resemblances.

The metric is a real one rather than eyeballing: half cosine distance between
radially-averaged 2-D FFT power spectra, a fifth axial orientation resultant so
anisotropy is seen without discarding direction, and three tenths total-variation
distance between V histograms — which is what separates *spots* from *holes*,
something spectra cannot do. Identical runs score exactly 0.00000.

**Safe mutation range: δ ≤ 0.008 of parameter range per event** (σ(ΔF) ≈ 0.00064,
σ(Δk) ≈ 0.00036) — the largest step where nine children in ten stay recognisably
kin and fewer than one in ten lands somewhere the pattern dies.

> **The cliffs are in the tail, not in the mean.** The p90 child sits at 0.110 at
> δ = 0.008 and then leaps to 0.249 at 0.016 and 0.372 at 0.032. Only **22% of the
> (F,k) rectangle makes any pattern at all**, and 30% of that is one map cell away
> from death. Averages would have said this was fine.

**And the uncomfortable coincidence, which is the honest caveat on the whole
idea:** the mutation size at which a child's pattern differs from its parent's is
about the same size as the difference you get from merely *regrowing the same
genome*. There is no window where the genetic signal is loud and developmental
noise is quiet. Pattern can carry lineage identity, but not finely.

**On surviving pixel-art scale, only one variable matters:** field cells per sprite
pixel. All five sprite sizes from 32² down to 7² lie on a single curve. Contrast
retained runs 100 / 90 / 75 / 59 / 33 / 19% at 1 / 2 / 3 / 4 / 6 / 12 cells per
pixel.

> **So the sprite must not show the whole field — crop it to 2–3 cells per pixel.**
> An 8×8 wing then carries two or three marks. The **7×7 identity map carries about
> two features**: "two dots", "one bar", or "plain". Nothing finer survives, and
> that is the real vocabulary size of the appearance channel.

That is a genuinely useful constraint rather than a disappointment. Two features is
enough to be a tag, and it means the map, the marking and the thing pollinators
match against can all be the same object — the strongest form of §3.1's rule.

**The decisive finding, and it is nearly free: the growth seed must be inherited.**
On a 7×7 tile with the seed passed down, a δ = 0.002 child scores 0.53 against a
random baseline of 1.13, degrading gracefully to 0.71 at δ = 0.008. Re-roll the
seed and **a sibling with a genetically identical genome scores 1.14** —
indistinguishable from random, and *further from its parent than an unrelated
genome is*. One extra integer in the genome is the difference between heritable
markings and noise.

---

### What the art benches changed

1. **The host plate ships at 30×74** — Blaine's 30×50 for the shoot was right, and
   bigger plates buy paper rather than detail.
2. **A host plate cannot show a swarm.** Two pollinators, three at a stretch. This
   needs a design decision, not a resolution bump.
3. **Insects are cryptic by default**, not transformative — my §13 claim was wrong.
   Value contrast, not hue, is what makes them visible on a host.
4. **Motion beats colour at the size the game actually renders insects**, and it
   composes with (3): colour was never going to distinguish them anyway.
5. **Bias the palette split-complementary at 0.70, grounded to the terrain** — and
   grounding matters more than the key. Variety *improves* rather than suffering.
6. **Earned colour dies at dusk** (93% → 35% separation) and glow currently fires
   on the wrong term. One-line fix, but it needs making.
7. **Patterns are heritable but coarse**, the safe mutation step is δ ≤ 0.008, the
   7×7 map holds about two features, and **the growth seed must be genetic.**
8. **Cut turn sharpness** from any motion genome; hover and dart-frequency are what
   read.

---

## 12 · Addendum, 2026-08-02 — the pages were unreadable

Blaine read the reagent-economy bench end to end and could not say how the system
worked. That is a total failure of the artifact, and it was not a one-off: the
same defect was in all twelve.

### 12.1 What was actually wrong

Not prose quality. **Structure.** Every bench opened with an evocative standfirst
and then went straight to findings, so a reader met the results of a measurement
before learning what had been measured. Terms were used as though already defined:
*"what it ended holding"*, *"the hand it inherited"*, *"a hand that loops is an
engine"*. Each of those is a soft analogy standing where a definition belongs, and
none of them survives the question **"which part of the system is that?"**

The index made it worse: bench 0 was filed at the *bottom*, under a heading that
assumed you already knew what it extended, and the page had no summary at all —
twelve cards, no statement of what the suite is for or what it concluded.

### 12.2 The fix

Every bench now opens with a **`.sysblock`**, before the instrument, in a fixed
order:

1. **The system** — one literal paragraph, no metaphor, saying what is computed.
2. **Parts** — a definition list covering every term the page uses, with types and
   ranges. If a word appears in a heading, a slider label or a readout, it is
   defined here.
3. **Procedure** — the algorithm numbered in execution order.
4. **What is on this page** — panel by panel.

Findings moved to last, always. Headings that named feelings now name objects
(*"What it ended holding"* → *"The final pile"*). The index leads with an executive
summary — the problem, the proposal under test, how the twelve divide, and the
eleven decisions they produced — and the cards run 0 → 11 in order, each carrying a
**The system** line before its question and its finding.

### 12.3 The generalisation

This recurs often enough to be worth a standing rule, so `docs/WRITING-STANDARD.md`
now governs every document, prototype, report and UI string in the repo, and
`CLAUDE.md` points at it. Its two operative tests:

- **The referent test.** For every noun phrase, can the reader point to the thing —
  a variable, a function, a panel, a number? If the answer is "it's sort of the idea
  that…", it has no referent and must be replaced with one.
- **The substitution test.** Replace the phrase with the literal operation. If
  nothing is lost but length, the phrase was ornament.

`BENCH-KIT.md` §4 now requires the `.sysblock` structure of every new bench.

### 12.4 A harness bug this turned up

`scripts/bench-qa.mjs` defaulted to `^2026-08-*`, which silently excluded the
reagent-economy bench — the page most people open first, and the one that prompted
all of this. It now scans every prototype in the folder: **14/14 clean**, and 14/14
built pages verified at a 390 px viewport.

A class collision also surfaced: bench 8 already used `.spec` for its spectrum
chart, so the shared block is `.sysblock`. Injecting shared markup into twelve
pages without checking each page's existing class names is a real failure mode; the
CSS now carries `SYSBLOCK-CSS-START/END` sentinels so the block can be replaced
wholesale rather than patched.

---

*— Fable*
