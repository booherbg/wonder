# The Ecology Ground Engine — data model & build sequence

*Documented 2026-07-18. This is the buildable bridge between
[camp-and-ecology.md](camp-and-ecology.md) Arcs 2–3 and
[ecosystem-vision.md](ecosystem-vision.md). The prior-art research report
lands at `docs/superpowers/research/ecosystem-prior-art.md`; its findings
fill the marked sections. Pillars checked throughout: peaceful; surprise
is a budget; keys stay few; the world doesn't need you; show, don't
commemorate.*

## What's already load-bearing

The vision asks for "every critter carries tuning values, the same idea as
the flora genomes." Most of the substrate is shipped:

| Shipped | Role in the ground engine |
| --- | --- |
| Flora genomes, drift, speciation | The tuning-value pattern everything else copies |
| `CritterSpecies` (fauna.ts): body stats + `favoriteSpecies` + den | The seed of diet — currently a species *index*, needs to become *taste over traits* |
| Field journal (auto-entries from inspect) | Becomes the "depends on" edge recorder — the web that draws itself |
| Inspect panel | The read instrument; the bench later becomes the write instrument |
| Home garden + sow + Q toss | The invitation surface — how a player composes a garden chord |
| Away-aging catch-up sim + sleep-to-dawn | "World doesn't need you" is already real for flora |
| Per-tile plant caps in Flora | Carrying capacity — half of a logistic loop, already enforced |
| Materials, tide pools, hoards-to-come | Precedent for "discovered, not crafted" passive stations |

**Gap worth naming:** critters are respawned fresh on every `loadWorld` —
no fauna persistence. Flora remembers; fauna forgets. Anything that makes
individual critters matter (trust, energy, drift) needs them saved.

## 1. The palate — taste over traits, not species indices

`favoriteSpecies: number` can't love a plant it has never met. Replace it
with a **palate**: weights over the genome axes that already exist.

```
palate: {
  form: PlantForm;      // what it knows how to eat
  hueCenter: number;    // 0..1, the color it seeks
  hueWidth: number;     // tolerance around that color
  glowTaste: number;    // -1 avoids glow .. +1 seeks it
}
aversion?: PlantForm;   // one quiet no — walks wide of these
```

One scoring function, `appetite(palate, genome) → 0..1`, replaces every
`p.species === sp.favoriteSpecies` check. `favoriteSpecies` becomes a
*derived* value (best-scoring species present) so nothing downstream
breaks. What this buys, for free:

- A sown or tossed item attracts exactly the critters whose stats match —
  the vision's core loop — with no new systems.
- Daughter species (✧) inherit attention: drift a lineage's hue far
  enough and *different* critters start arriving. Selection made visible.
- The garden chord: three planted species assemble a fauna mix nobody
  scripted.

## 2. Drives, not rolls

`updateCritter` currently rolls dice at decision time. Replace the roll
table with two or three **drives** that rise over time and empty on use —
hunger (rises slowly; eating empties), comfort (rises at night and near
the beast; the den empties it), curiosity (rises when the wanderer is
still and near; approaching empties it). Highest drive picks the action.
Same tiny code size, but behavior becomes *legible motive* — you can
watch a critter and say "it's hungry" — which is what makes the web
discoverable without labels. *(Research pending: Rain World's drive
weighting, Creatures' chemistry-as-drives.)*

## 3. The energy ledger — Creatures, lite

Eating fills a critter; moving and night drain it. A fed critter lingers
where it fed (the trust front door from Arc 2). An empty one goes home
and sleeps — **nothing starves**; hunger is motive, not mortality
(peaceful pillar). One number per critter, persisted.

## 4. Balance without a script

The logistic loop, using parts we already have:

- Plants: per-tile caps (shipped) = carrying capacity.
- **Nibbles consume**: a nibbled plant loses growth progress; enough
  nibbles and it's gone. (Today nibbling is cosmetic — the web has no
  teeth, so it can't push back.)
- Critter appetite thins local flora → forage trips lengthen → energy
  spent exceeds energy found → critters range elsewhere or sleep more →
  flora recovers. Negative feedback with no referee.
- Births (later): a well-fed pair near a den adds one critter, gated on
  local plant density — the spring tension that refills after a trough.

Perturbation is the fascination: overharvest a patch and watch the
critters range wider, then the patch heal, then everyone come home.
Away-aging means it also happens while you're gone. *(Research pending:
stable parameter ranges, attractor states, what Equilinox fakes.)*

## 5. Discoverability — the journal draws the web

"Witnessed" = the nibble happened on screen within ~6 tiles of a still or
slow wanderer. A witnessed nibble records an edge; the species' journal
page grows a "depends on" line; enough edges and the island's web sketch
appears (vision: two players' journals disagree, both right). No numbers
anywhere on screen — appetite stays hidden; the *pattern* is the reward.

## 6. Build sequence (each step ships alone, tested)

1. **Palate + appetite** — pure data change; `favoriteSpecies` derived;
   critters keep behaving identically on day one. Tests: appetite scoring
   monotone in hue distance; every island's palates find food; daughters
   within hueWidth inherit their parent's diners.
2. **Teeth + ledger** — nibbles consume growth; critter energy; fed
   critters linger. Test: a grazed patch measurably thins and recovers.
3. **Witnessed edges** — journal "depends on" lines from watched nibbles.
4. **Toss = invitation** — Q-tossed and surplus items score against
   palates and draw visitors from farther than sniffing range.
5. **Fauna persistence** — critters (positions, energy) survive the save
   roundtrip; away-time runs the same drives coarsely.
6. **Predator + wariness** (Arc 3) — one hunter species; prey drift
   warier/faster near it; journal keeps the then/now sketch.
7. **The bench** (vision) — tilt a lineage's drift dice at the home bed;
   released variants get a journal page that keeps writing itself.

## Progress

- **Step 1 (palate + appetite): shipped** `5ddc176`. Critters taste traits,
  not species names; sown plants, kin, and daughters draw diners on merit.
- **Step 2 (teeth + ledger): shipped** `458807b`. Nibbles consume growth;
  critters carry an energy ledger; nothing starves. Perturb-and-recover is
  proven against an ungrazed twin island.
- **Next: step 3 (witnessed edges)**, then drives-not-rolls (step 2's
  decision loop already leans on the ledger; full drive weighting is the
  richest remaining lever — validated twice by the research below).

## Findings from research (`../research/ecosystem-prior-art.md`)

The prior-art pass (Creatures, Rain World, Equilinox, Dwarf Fortress/URR,
ecological theory) landed. What it changes here:

- **Simplicity surprises through interaction density**, not rule count
  (DF's unscripted drunk cats). Build features that *cross* existing ones —
  tide × day/night × palate × ledger — not standalone systems.
- **Discoverability = internal state shown as visible behavior** (Creatures,
  Pirates!). Standing rule: *every hidden tuning value needs a visible
  tell.* The journal records the tell; the player infers the value.
- **Balance is tuned offline in data + geometry, never a runtime clamp**
  (Rain World, Equilinox). Keep the crowding thin as a soft global cap;
  never add a per-species population controller.
- **Finite food is the restoring force, and the world's cycles stabilize
  it.** Lotka-Volterra with carrying capacity self-rights; a *periodic*
  carrying capacity (Swailem & Täuber 2023) *enlarges* the coexistence
  zone. So Wander's day/night, tide, and rain/bloom are promoted from
  flavor to balance infrastructure: when births land (step 6), gate them
  on a food supply that ebbs with those cycles.
- **Caveat:** no shipped *peaceful* game provably self-rights after a
  perturbation (Equilinox's self-correction claim was refuted). Wander's
  teeth test showing recovery is mildly novel ground — worth keeping as a
  standing invariant, not assuming from prior art.
