# Design B — Byproduct chains & seed search

*Design spec, 2026-07-19. The outcome of the food-web impact study
([research](../research/food-web-and-byproducts.md)) and the Scavenger's Reign
study. Approved direction: add **one generic primitive** so Rube-Goldberg
life-cycle chains **emerge from the seed** — no authored chains — and make
new-world generation a **search** with a minimum-viable-diversity floor.*

This spec is self-contained: it is the handoff across a context clear. When
building, the next step after review is the `writing-plans` skill.

## Goal & non-goals

**Goal.** Turn today's sparse, pairwise food web (63% of plants are scenery,
longest chain = 1) into one where multi-organism chains self-assemble, different
every seed — by adding a single medium (**substrate**: a byproduct tagged in the
trait-language the `palate` already reads) and letting the seed compose. Plus:
never sell a player a barren island (seed-search floor), while preserving a
deliberately-sparse **frontier** for builders.

**Non-goals (deferred, see Phasing).** The trait-conduit variant (substrate
re-emitting the producer's hue); plant-emitted spore-fall (the full multi-source
Lantern Loop); grazer byproducts; Mission-mode hiding; pollinator flower-tinting;
the disease-on-monoculture balancer (pairs with B but is its own spec).

## The core primitive: `Substrate`

A transient, trait-tagged mark on the ground that gates germination.

```ts
interface Substrate {
  x: number; y: number;      // world px
  hue: number; glow: number; // the trait-signature of what produced it
  form: PlantForm;           // what was eaten (for future form-gated rules)
  born: number;              // flora sim-tick it appeared
}
```

Substrates live on `Flora` (`flora.substrates`), tick with the sim, and are read
through the **same appetite-style match** everything else uses — that is the
whole point: no new matching language.

## The rules (v1)

**R1 — Emission.** When a **disperser** critter feeds (the existing
`flora.propagate` path in `fauna.ts` `updateCritter`), it also drops a substrate
at its own position tagged with the eaten plant's `{hue, glow, form}`. New API:
`flora.addSubstrate(x, y, sig)`, called by the critter (it knows its position and
its meal). Grazers emit nothing in v1.

**R2 — Substrate-feeders germinate on a match.** Some plant species are
**substrate-feeders** — a property rolled at generation
(`PlantSpecies.substrateFeeder: boolean`), biased strongly toward pioneer/
decomposer forms (Moss, Fungus, Sporestalk) but generatively possible on others.
In `flora.simTick`, for each live substrate, a substrate-feeder species `S`
whose archetype hue is within `SUBSTRATE_HUE_MATCH` (start 0.12) of the
substrate's hue may germinate one plant of `S` at that spot (via the existing
`addPlant`, so per-tile caps and habitat rules still hold), with a per-tick
probability so it "creeps out" over an island-day rather than popping. A
substrate that germinates is consumed.

**R3 — Decay.** A substrate that isn't fed on within `SUBSTRATE_LIFETIME`
sim-ticks fades. This bounds entity count and sets the "catch it live vs it
assembles while you're away" feel. Start ~half an island-day; tunable.

**R4 — Closure is automatic.** A germinated substrate-feeder is an ordinary
plant: it can be eaten (if it falls in some critter's palate), and that critter
emits substrate in turn. No special loop rule — closure falls out of the normal
web. The chain **D eats P → substrate(P) → S germinates → S eaten → substrate(S)
→ …** closes wherever the trait-graph allows (42% of links, per the study).

## Legibility (the depth must be visible)

- **Substrate renders** as a subtle ground tell (a faint tinted/glowing patch in
  the producer's hue) — `renderer.ts` / a tiles overlay. Germination is watchable:
  moss visibly creeps from where a critter fed.
- **Dev readout (`)** gains a line: active substrates, emergent chain count, and
  (optionally) the longest live chain — so Sandbox shows what Mission will hide.
- **Journal** records a *witnessed* link when the player is still/slow near a
  germination event ("moss sprouts where the ambler has fed") — reuse the
  existing witnessed-edge machinery in `main.ts`.

## Seed search & the diversity floor (Phase 2)

**`diversityScore(seed)`** — a pure, generation-time score (no sim), computing
chain-potential exactly as the study harness does: over the generated species,
count disperser→P→substrate-feeder(hue-match) links, weight closed ones. Fast
(~milliseconds/seed).

**Rejection-sampled generation.** `loadWorld`/new-world roll up to `M` candidate
seeds, keep the first with `diversityScore ≥ FLOOR`, else the best of `M`. Same
pattern as the existing "reroll until spawn walkable + connected" invariant.
Study data: `FLOOR = 5 chains` rejects the bottom ~22% at ~1.3 rolls; only 1.5%
of seeds are truly flat.

**Frontier opt-in.** A low/zero floor (a new-map control or `?frontier`) yields a
deliberately-sparse island to cultivate — the builder's canvas. Flatness becomes
a *choice*, not a disappointment.

**Legendary hunt.** A high floor searches for the rare rich seeds (≥40 chains ≈
0.6%). Champion found so far: **seed 2438 "Polpol Skerry" — 71 chains, 69
closable**; pin it as the demo/test seed.

## Integration points (files)

- `src/life/flora.ts` — `substrates` list, `addSubstrate`, decay + germination in
  `simTick`, `substrateFeeder` on species.
- `src/life/species.ts` / `genome.ts` — roll `substrateFeeder` at generation.
- `src/life/fauna.ts` — disperser emits substrate on the `propagate` path.
- `src/render/renderer.ts` (+ tiles) — draw substrates + germination.
- `src/world/generate.ts` / `src/game/main.ts` — `diversityScore`, rejection-
  sampled `loadWorld`, frontier control.
- `src/game/main.ts` dev readout + census — surface substrates & chain count.

## Testing

- **Emission:** a disperser feeding adds a substrate with the meal's signature.
- **Germination match:** a substrate-feeder germinates on a hue-matching substrate
  and not on a mismatched one; respects `addPlant` caps/habitat.
- **Decay:** an unfed substrate is gone after `SUBSTRATE_LIFETIME`.
- **Determinism:** same seed → identical substrate/germination sequence (seeded
  rng only; no `Math.random`/`Date.now`).
- **Chains emerge:** on a legendary seed (2438), a multi-link chain forms within N
  ticks; on a flat seed, few/none — proving emergence tracks the seed.
- **Diversity floor:** `diversityScore` matches the harness; rejection-sampling
  clears the floor within the expected roll budget; `?frontier` bypasses it.
- Full suite stays green; behavior of existing fauna/flora unchanged when no
  substrate-feeders/dispersers interact.

## Phasing

- **v1 (this spec):** the `Substrate` primitive, R1–R4, minimal rendering + dev
  readout, the diversity floor + frontier. Ship emergent chains + no-dud
  generation.
- **v2+ (deferred):** trait-conduit (substrate-feeders inherit/tint toward the
  producer's hue — hue visibly travels the island); plant spore-fall (multi-source
  Lantern Loop); grazer byproducts; pollinator flower-tinting; Mission-mode
  hiding; the disease-on-monoculture balancer.

## Open decisions (flag before/with build)

1. **Decay lifetime** — short (catch chains live) vs ~an island-day (they assemble
   while away). Leaning ~half a day.
2. **Floor value** — `≥5 chains` default? And is the frontier a control or a
   separate mode?
3. **Substrate-feeder germination** — does it *replace* the normal scatter path
   for those species, or *add* to it? (Leaning: add, but weight scatter down for
   substrate-feeders so substrate is their main route — makes the dependency real.)
4. **`substrateFeeder` roll** — pure form-based (Moss/Fungus/Sporestalk) or a
   genome flag biased by form? (Leaning: the latter, for generativity.)

## Risks

- **Monoculture amplification** — B amplifies a seed's lean; the disease balancer
  becomes its natural pair (separate spec, but note the coupling).
- **Performance** — substrate entities per tick; bound by decay + caps; measure.
- **Legibility load** — if substrates aren't clearly rendered, the new depth is
  invisible; rendering is not optional polish, it's part of v1.
