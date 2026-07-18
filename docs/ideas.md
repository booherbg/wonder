# Wander — ideas to explore

*Written overnight, 2026-07-18, while you slept. These are options, not
promises — react to whichever ones spark. Ordered roughly by how naturally
they build on what exists now. The pillars they serve: peaceful; variety
and surprise; exploring → gardening → interacting; one step at a time.*

## How a game like this plays (UX thinking)

The core loop today: **wander → notice → lean in (E) → keep a little of
what you loved (F) → give it a new home (G)**. Everything below deepens one
of those verbs rather than adding new systems for their own sake.

Some UX principles worth protecting as it grows:

- **No numbers on screen.** Drift percentages live in the inspect panel;
  the world itself stays wordless except for murmurs. Feelings first, stats
  on request.
- **The world doesn't need you.** It drifts, blooms, and forages whether
  you interact or not. Gardening should feel like joining something, not
  operating it.
- **Surprise is a budget.** Rare things (sports, glow-drift, snow islands)
  must stay rare to stay wonderful. Resist the urge to make the psychedelic
  the default; the plain green meadow is what makes the violet forest land.
- **Keys stay few.** WASD + E/F/G + R is a complete alphabet. New verbs
  should replace or contextualize (hold-E, tap-vs-hold) before adding keys.

## The field journal (my favorite next step)

A hand-drawn-looking journal (J) that fills itself in as you wander: every
species you've inspected gets a sketch (its sprite), your name for it (you
can rename anything you discover), where you first met it, and how far
you've seen it drift. Discovery becomes collection without ever being a
checklist — the journal is a *memoir*, not a todo list. It also solves
"what did I find last night?" when you return to a seed.

- Cheap first version: auto-entries from inspect; localStorage per seed.
- The journal is also where cross-island continuity can live later: "seen
  on 3 islands, always violet on rocky ones."

## Gardening, deepened

- **Living gardens**: sown plants already drift. Add *pollination*: two
  plants of the same species within a tile or two occasionally cross,
  averaging traits + jitter. Suddenly placement is breeding — plant your
  tallest glowfern beside your bluest and wait.
- **A tended patch reads as tended**: plants sown by you get a tiny mark in
  inspect ("planted by hand, generation 3"). Watching your lineage spread
  on its own is the payoff.
- **Terrarium seeds**: let one seed slot survive R / travel between
  islands (seed snapshots its genome + species archetype). Invasive-species
  ethics as gameplay: the journal quietly records what you've introduced.

## The wanderer

- **A home**: choose a spot; a small cabin/tent grows over time (materials
  are ambient: driftwood appears on beaches after you've walked them). Home
  is a *view*, not a base: its purpose is a porch to sit on, a garden bed
  beside it, and a place the camera returns to at rest.
- **Traits, gently**: not stats — habits the game notices. Walk mostly at
  night → your murmurs shift to night poets; nibble-watch critters often →
  they trust you sooner; garden heavily → seeds keep 1 extra slot. Traits
  are discovered, never chosen from a menu.
- **Sitting**: hold S (or just stand still 10s) → the camera eases out a
  touch, water sparkles slightly more, murmur chance rises. Doing nothing
  becomes a verb.

## Critters, deepened

- **Trust**: feed a critter its favorite seed (drop it nearby) and its
  species remembers, slowly: they flee less, then follow sometimes, then
  occasionally lead you — to the island's sport, to a hidden cove.
- **Homes matter**: dens get better as their favorite plants thrive nearby
  (bigger mound, flowers on it, pups in spring?). An ecology meter you can
  *see* instead of read.
- **One rare wanderer-animal per island** (the faunal sport): a single
  strange creature — long low-slung, or tiny and glowing — with no den,
  crossing the island on its own schedule. Meeting it is an event.

## New biomes & hydrology (variety and surprise)

- **Wetlands / marsh**: where rivers pond, a new habitat: reeds, lilies,
  will-o-glow fungi, mist particles. Wading slows you — a place to linger.
- **Hot springs** in the rock: steam, mineral-tinted pools (per-seed hue),
  a unique bathing... standing-in spot that triggers its own murmur.
- **Tidal flats**: shallow water that breathes — a slow (2-3 min) tide
  cycle revealing and hiding sand, with plants that only show at low tide.
- **Waterfalls**: where a river drops two elevation bands in one tile,
  draw a fall + foam. Rivers gain sound-shaped identity even in silence.
- **Psychedelic pockets**: small high-moisture high-elevation combos spawn
  a *pocket biome* (2-6 tiles): inverted palette, exaggerated genomes —
  Scavenger's Reign clearings you stumble into maybe once per island.
- **Volcanic islets / black sand / crystal barrens / mycelium networks**
  (faintly glowing threads between fungi at night) — a menu of rare island
  *modifiers* so that occasionally a whole island breaks its own rules:
  one-in-ten islands rolls one modifier. Surprise at the island scale.

## Atmosphere

- **Day/night with dawn/dusk palettes**; glow-trait plants only reveal
  their light after dark — a reason to stay out late. Night murmurs.
- **Weather as mood, not mechanics**: drifting cloud shadows, rain that
  darkens tiles and speeds plant drift a little, mist on morning water.
- **Sound**: generative and quiet — wind through the biome you're in
  (filtered noise), footstep textures per tile, a two-note motif per
  critter species, murmur chimes. (The entropy game's generative
  soundtrack is prior art one workspace over.)
- **Photo mode** (P): hide UI, gentle vignette, save a PNG named after the
  seed + coordinates. Shareable postcards = shareable seeds.

## Structure, much later

- **The archipelago**: islands become places on a sea chart; a raft you
  build once. Travel is real (a minute of open water, murmurs about the
  sea), and carried seeds make each island partly your doing.
- **Seasons across real days**: the island drifts palette and species
  behavior with the calendar. A reason to come back Tuesday.
- **Nothing to win.** If a structure ever appears (journal completion,
  archipelago map), it should be the kind you're glad to leave unfinished.

## Second night of dreaming (added while the loop ticked)

- **Traces of before**: press a key near loose stones to build a small
  cairn. Cairns persist per seed (localStorage) — return to an island
  months later and find your own markers waiting. The only "save" this
  game may ever need: not progress, *presence*.
- **The beast's trail**: pressed grass fading behind it for a minute —
  you could track something you never quite catch.
- **Aurora nights**: maybe one night in twenty, slow color curtains over
  everything; glow plants answer by pulsing. Islands remember it happened
  (a murmur the next day).
- **Rain** → the next day's mushroom bloom: weather that pays off later,
  not instantly.
- **Bioluminescent tide**: some nights the shallow water itself glints
  blue-green where you wade.
- **Singing stones**: a rare rock formation; standing close plays a soft
  generative chime unique to the island (seed-derived scale). First sound
  in the game should probably be this — rare, discovered, optional.
- **Spore motes** drifting slowly in pocket biomes (the shimmer made
  particulate).
- **Beachcombing**: driftwood, shells, sea-glass appearing on sand after
  each night; purely collectible, maybe cairn-building material.
- **Crater lakes**: rarely, the island's heart is water — a caldera with
  an inner shore only reachable by one river-cut.
- **Murmur echoes**: a page (in the future journal) holding every murmur
  you've ever been given, in the order the world offered them — your
  wandering, retold as an anthology.
- **Weather memory**: islands remember their rare events — revisit a seed
  and the label whispers "an aurora passed here once." Small histories
  accreting onto places.

## The ecosystem dream (2026-07-18)

- The full far-horizon vision — a garden that summons its fauna, a journal
  where the food web draws itself, the bench, machines that are grown not
  built, little factories and byproduct chains — now lives in
  `docs/superpowers/specs/ecosystem-vision.md`, with a research brief and
  its own dreams section. That file is the reference; point future
  sessions at it instead of re-describing it.

## Small polish anytime

- Grass sways where the wanderer walks; footprints on sand that fade.
- Water lilies get pads; reeds get reflections.
- Critter blink animations; ear-twitch when the player is near.
- Rivers one tile wider at their mouths; deltas.
- The seed label could name the island: syllable-generator islands
  ("Vethmar Isle, seed 40272") — names make seeds memorable.
