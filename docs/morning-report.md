# Morning report — the night Wander became a game you play

*2026-07-19, built overnight by Opus + a fleet of Fable subagents.*

You went to sleep calling it "a beautiful screensaver" — deep simulation, no
verbs, nothing you could touch. You woke up to a game. Everything you fired at
me tonight is **done, tested (240 tests green), and playable right now.**

## What you can DO now

- **Inspect everything (E).** No more "nothing within reach." Lean close and the
  panel tells you *the hour* (the sky and sea right now — a low tide under
  stars, an aurora, a glowing tide), *the water's edge* (tide pools + their
  dwellers, driftwood), *the land* (springs, falls, the crater, stones), *what
  grows*, *your company*, *your camp*. And it **follows you as you walk.**
- **Feed & befriend a critter.** Open the inspect panel near one; if you carry a
  seed its kind favors, an **offer a seed** button appears. Feed it and it warms
  to you — *wary → warming → trusts you → bonded*. The friendship **persists per
  island across reloads.** A bonded kind stops keeping its distance and comes to
  live near your camp. This is the Animal-Crossing heart you asked for.
- **A home worth tending.** Inspect while standing at your camp and you'll see a
  **your camp** view: what's growing in the bed, what you've built (fire,
  bedroll), and the **friends who've made a home here** — *"your camp hums —
  three kinds live alongside you."*
- **Lean in (Z).** A smooth focus zoom to kneel down and watch a **pollinator
  work a specific flower** — butterflies now settle, sip, and gather thick where
  your blooms are dense.
- **Your almanac (J).** This island's character (shape, biomes, its remembered
  aurora/tide/beast nights), the creatures you've met, every plant in all its
  color varieties — and now a **fog-of-war map** of the island as far as you've
  walked.
- **Sail between islands (L).** The islands you've visited are saved; the picker
  lets you return to one instead of guessing at `?seed=`.
- **Press ? for help.** A field guide of the keys and the camp path — no more
  guessing at mechanics. (New players get a one-time welcome.)
- **The beast is alive.** It visibly pauses and **drops a glowing sprout** where
  it plants, moves with purpose toward the flora it favors, and wades the
  shallows instead of floating.

## Fixes you'll feel

The legend never hides keys anymore; F grabs the *nearest* plant; there's a
gather button on the inspect card; **critters no longer starve at a cliff**
(they only crave plants they can reach); murmurs don't clash with open panels;
every plant card names its **biome** so "nosing after X" points you somewhere
real. Plus the whole world got **depth** — ground shadows, a deeper sea,
crown-light, foreground parallax, a vignette.

## A 3-minute tour (append to your URL)

- `?split=1` — sow a few seeds by home and watch a **new species arise** in
  minutes (the genome engine, visibly alive).
- `?lowtide=1` then **E** on the beach — the tide pools finally answer.
- `?seed=20` — a crater lake; `?seed=777` — waterfalls; `?shape=skerries` — a
  scatter of islets. Feed a critter, then press **J** and watch your map fill in.

## What's *not* done (for you to weigh in on)

- ~~Take one home as a companion~~ — **shipped while you slept.** Take a bonded
  critter home (the "take home" button, once it trusts you) and it pads at your
  heel wherever you wander, still yours when you return. The befriend loop is
  whole: feed → trust → bond → they live at your camp → one comes with you.
- **Fauna persistence** — trust persists, but individual critters still respawn
  fresh each load. The world doesn't yet *fully* remember its animals.
- **The mountain as a destination** — Rock/Snow are still impassable walls; you
  wanted a reachable summit with a vista. A real discoverable, unbuilt.
- **An art eye** — the fog map, the camp view, and the pollinators were verified
  by tests, not by a live browser (no headless-browser tooling here). Worth your
  own look; tunables are one-liners.

## How it was built

A 4-minute loop woke me; I dispatched Fable subagents for each feature (in
isolated git worktrees when they'd collide), then verified and cherry-picked
their work into `main`. Some agents hung after finishing their code (during
browser self-checks) — a transcript-freshness check caught them and their work
salvaged cleanly. Two big tasks I built by hand when delegation kept stalling.
The whole night is one clean history in `git log`; the plan lives in
`docs/superpowers/specs/playable-and-alive.md`.

Go play. Feed something. It'll come home with you.
