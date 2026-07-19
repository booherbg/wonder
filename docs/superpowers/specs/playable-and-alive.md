# Playable & Alive — the pivot from a simulation to a game you play

*Captured 2026-07-18 night, from Blaine's live playtest barrage. The honest
diagnosis: the island runs a real, tested ecology (palate, drives, energy
ledger, dispersal, co-adaptation — 180 tests) but the player has almost no
**verbs** to touch it and almost no way to **see** what's there, so it plays
like a beautiful screensaver. Everything below is either a verb or a way to
surface what already exists. No more invisible depth until this is done.*

## The standing rule from here

Every task must pass one of two tests: **(a)** it gives the player a new
*verb* (a thing they can DO), or **(b)** it makes something the sim already
does *visible/legible*. If it does neither, it doesn't ship now.

## Priority 1 — make it playable (verbs)

- **Inspect literally everything, live.** Standing by a tide pool + a wisp +
  a critter and getting "nothing grows within reach" is the whole bug. E must
  surface every near thing — tide pools & dwellers, critters (richly),
  pollinators, materials, springs/falls, the hour/tide — and **re-render as
  you move**, not a static snapshot. (spec: inspect-everything.md)
- **The critter relationship.** Understand it → **feed** it a seed it favors
  (from your pouch) → it **trusts** you → it **follows you home** → with
  enough trust, a **baby**. Learn what each one eats (its palate/signature).
  Feeding lives on the critter's inspect card (a Feed button), same as the
  new Gather button.
- **A home you actually build.** The "garden" is embarrassingly thin — you
  place it and stare. Give it verbs: **attract** critters (a fed/tossed
  favorite draws them), **inspect the garden's state** (who visits, how it's
  doing, what's pollinating what), **observe pollinators** working *specific*
  flowers. The home becomes a living dependency web you compose, not a 3x3 of
  sprites.
- **Plant signatures → dependencies → build around home.** Each plant's
  genome already *is* a unique signature (form + hue + glow = what critters
  taste). Make it **legible**: inspecting a plant tells you its signature and
  which creatures depend on it; learn a critter's need, find/bring the plant
  home, and assemble a working little ecosystem. (This is the vision's
  byproduct-chain idea, grounded in what's shipped.)
- **Watch it happen, up close.** Stand in the field and watch a pollinator
  work a *specific* flower — a way to **zoom/focus** on an interaction and
  actually see the mechanic fire (pollination, a graze, a spread), not just
  ambient motion.

## Priority 2 — surface the world (see what's there)

- **The discovery log (J).** In flight now. This island's character (shape,
  biomes, crater/falls/springs, its remembered aurora/tide/beast events),
  every critter you've met + what you've learned it eats/spreads, and every
  plant **in all its color varieties** (answers "are these the same species?
  does the journal capture color varieties?").
- **A fog-of-war island map** in the journal/home: the island as you've seen
  it, dimmed where you haven't been or haven't returned in a while — so you
  can read your island's state at a glance and know where to explore.

## Priority 3 — onboarding & navigation (remove confusion)

- **A help/intro overlay.** There is none today. A quiet first-run card + a
  toggle (?) that names the verbs. Calm, skippable, not a tutorial wall.
- **An island picker.** Worlds already autosave (last 8), but the only way
  back is hand-editing `?seed=N`. Give it a UI: see your saved islands
  (name, when last visited, a thumbnail) and return to one.

## Priority 4 — depth of discovery (the "learned it in 3 minutes" problem)

*A design conversation, not yet built. The island reveals itself in ~3
minutes and then there's nothing left to find. Discovery needs layers.*

- **Conditional discoverables** — things that only appear/occur under
  conditions you have to be present for: a low-tide-only pool creature, an
  aurora-only bloom, a night-only glow, something that only happens after
  you've fed/tended/befriended enough. Being *there at the right time* is the
  reward.
- **A unique thing per island** — every island hides one genuine find (a rare
  endemic, an unusual landmark, a one-of critter) so a *new* island is worth
  sailing to, and "what's special here?" always has an answer.
- **Progressive revelation within an island** — the more you inspect, feed,
  and tend, the more the island shows you (dependencies you couldn't see
  until you'd watched enough; a web that fills in). Depth that unfolds over
  a session, not all at once.
- **Open question for Blaine:** what's the *fantasy* of a great discovery
  here — a naturalist slowly mapping a living system? a collector completing
  a living guide? a gardener coaxing a hidden equilibrium into being? The
  answer sets which of the above we lean into.

## Working method

Fable subagents build in parallel where files don't collide; Opus supervises,
verifies in a real browser, integrates. The hot files (main.ts, inspect.ts)
force some sequencing — that's a build-speed choice, not a stall. Progress is
tracked here; this doc is the source of truth for the pivot.
