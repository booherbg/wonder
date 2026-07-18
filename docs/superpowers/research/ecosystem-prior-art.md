# Prior Art — how living-world games earn emergence, balance, and discovery

*Synthesized 2026-07-18 from a fan-out research pass (21 sources, 101
claims extracted, 25 adversarially verified, 23 confirmed / 2 refuted).
This is the reference the [ecology-ground-engine.md](../specs/ecology-ground-engine.md)
"findings pending" section was waiting on. Working vocabulary for Wander
stays game-side — critters, tuning values, spawn, drift, palate — the
prior-art games' internals are described in their own terms only where a
source demands it.*

## The one-paragraph answer

Living-world games that feel alive share one recipe: **keep each
creature's rules simple but genuinely run them** (don't fake the parts
that must interact); **let creatures act from their own drives**, not from
scripts aimed at the player; **hold balance in tuned data and world
geometry set before the sim runs**, not with a runtime hand that clamps
populations; and **make the hidden system discoverable through visible
behavior** the player watches, infers, and exploits. All four map cleanly
onto Wander — and one of them is what the just-shipped grazing loop
already demonstrates.

## The four questions the brief asked

### 1. How simple can the core rules be and still surprise?

Very simple — surprise scales with **how densely simple systems
interact**, not with rule complexity. The canonical proof is Dwarf
Fortress's drunk cats: never scripted, it emerged from three unrelated
systems colliding — taverns where spilled drink wets the floor, an
~8-year-old footprint/liquid-tracking system, and a new self-cleaning
behavior, so cats licked alcohol off their paws and got drunk. (PC Gamer
interview w/ Tarn Adams, cross-checked against the Bay12 bug report.)

**For Wander:** invest in systems that *overlap* — tide × day/night ×
palate × the energy ledger — rather than authoring individual outcomes.
Every new feature should touch an existing one. The tide already crosses
the biolume night; the palate already crosses flora drift. That crossing
*is* the surprise budget.

### 2. How do these games make hidden systems discoverable without menus?

By surfacing internal state as **legible behavior**. Creatures turns a
hidden internal level into a visible act (a creature shivers when its cold
value crosses a threshold, eats when its energy value runs low) — you read
the state by watching the body. Sid Meier's Pirates! runs a full trade
economy "underneath the covers" that no menu reveals; an attentive player
discovers it through play (blockade an island, watch it starve). Discovery
is the *reward for attention*.

**For Wander:** this is precisely the field-journal bet — record only what
the player witnessed, and let them assemble the model themselves. The
design rule it implies: **every hidden tuning value must have a visible
tell.** A hungry critter should *look* hungry (it already forgoes play to
forage); appetite should show as a beeline to a plant, never as a number.
The journal is the discovery ledger, not a tooltip.

### 3. How do they hold balance without a script, so a perturbed web recovers?

Two layers, and this is the richest finding.

**Shipped games tune balance offline, in data and geometry — not with a
live controller.** Rain World's balance came from iterative playtesting
("I'd run a region 15 or 20 times... then change a wall from five tiles to
six") — adjusting *level geometry* and creature parameters, never a script
that clamps populations. Equilinox links per-creature condition to
longevity and breeding (healthy wildlife lives longer, breeds more) — a
data feedback loop, not a god-hand.

**Ecological theory supplies the restoring force: finite food.** A few
designer knobs (birth rate, lifespan, time-to-starve) map onto the classic
Lotka-Volterra predator–prey equations, whose carrying-capacity form has a
*coexistence attractor* a finite food supply self-rights toward (ICEC 2010,
Springer LNCS 6243). And the counterintuitive gem (Swailem & Täuber, Phys.
Rev. E 107, 064144, 2023): making carrying capacity **vary periodically**
*enlarges* the zone where predator and prey coexist — a seasonal or
day/night pulse in food *stabilizes* the web rather than shaking it apart.

**For Wander:** express balance as tuned tuning-values plus hand-shaped
island geography, verified by repeated unattended (overnight) runs — never
a runtime population clamp. Give the web **finite food as its restoring
force** — which the just-shipped teeth do: a grazed patch is really
consumed, forage trips lengthen, critters range off or sleep, the patch
recovers. And lean on the cycles Wander already has — **day/night, tide,
rain/bloom** — as the periodic carrying-capacity pulse that *widens*
stability. The cycles are not just mood; they are the stabilizer.

### 4. What to simulate vs. fake?

A conscious, per-system decision — not a default to maximal fidelity.
Adams and Johnson treat "balancing complexity in large simulations" as an
explicit design topic; Grand marks the other pole (a creature's internal
processes must be *genuinely* run, not faked as timed outputs, or the
emergence never arises). Choose system by system: **genuinely simulate the
interacting core** (palate → forage → the ledger → population), **cheaply
approximate the cosmetic** (a swaying sprite, a drifting cloud).

## What this changes in the ground engine

- **The teeth were the right first move.** Finite food is the textbook
  restoring force; the grazing test now proves perturb-and-recover on a
  real island. *Note:* the research could not find a shipped **peaceful**
  game that provably self-rights after a disturbance (Equilinox's
  self-correction claim was **refuted** — see caveats). Wander doing it is
  slightly novel ground, not a copied trick.
- **Drives-not-rolls is validated twice** — as the emergence engine
  (Rain World) and as the discoverability bridge (Creatures). It is the
  highest-value next step after the ledger.
- **The world's cycles get a promotion.** Day/night and tide were flavor;
  the carrying-capacity result makes them balance infrastructure. When
  births arrive, gate them on a food supply that ebbs with the cycles.
- **No runtime god-hand.** The existing crowding thin is a soft global cap,
  not a per-species controller — keep it that way. Balance lives in the
  tuning values.

## Caveats that bound these claims

- **Equilinox self-correction: refuted 0-3.** Evidence supports only that
  per-creature condition governs longevity and breeding — *not* that a calm
  gardening sim provably recovers after a perturbation. The only positive
  evidence for perturb-and-recover is the ecological theory, not a shipped
  peaceful game.
- **Do not attribute** "fidelity subordinate to fun" to Adams/Johnson — the
  claim that the Roguelike Radio episode frames it that way was refuted 0-3.
- **"Little factories inside each animal"** is the brief's own metaphor, not
  a Steve Grand quotation.
- **Transfer is by analogy.** None of the studied games is a peaceful,
  witnessed-only journaling game like Wander; every recommendation is an
  inference across adjacent designs.
- **Source quality varies** — Creatures internals lean on community wikis
  (corroborated by Grand's book and the Grand/Cliff/Malhotra paper); Rain
  World rests largely on one dev interview; the two ecology papers are
  strong but were partly paywalled (conclusions rest on verified abstracts).

## Open questions the research left for Wander

1. Does per-creature condition feedback actually *self-right* a perturbed
   web, or only let mismatched critters die out without recovery? (Wander's
   teeth test suggests recovery is achievable — worth making a standing
   invariant.)
2. What concrete tuning-value ranges keep a small hand-authored web inside
   the coexistence zone over an overnight run? The theory exists; the
   numbers for a handful of designed critters do not.
3. How do you present an emergent surprise so a peaceful player reads it as
   *delight*, not a bug? (DF's drunk cats first surfaced as a bug report.)
   What does the journal say when the web does something strange?
4. What is the minimum simulation fidelity for a witnessed observation to
   feel *earned* rather than random flavor?

## Sources (verified)

Creatures / Steve Grand — *Creation* (Grand); creatures.wiki
Biochemistry & Brain; Wikipedia; howwegettonext.com. Rain World —
gamedeveloper.com dev interview; official wiki. Equilinox — equilinox.com;
Steam community critique; ThinMatrix devlog. Dwarf Fortress / URR —
Roguelike Radio Ep. 121; PC Gamer; gamedeveloper.com. Ecology —
inria.hal.science hal-01055640 (ICEC 2010); arXiv 2211.09276 (Phys. Rev. E
2023). Full URLs in the run record.
