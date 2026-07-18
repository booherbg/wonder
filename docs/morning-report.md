# Good morning ☀️

While you slept, the island came alive. Here's what's waiting for you.

## First, play

    npm run dev        # probably still running from last night

Open http://localhost:5173 — you'll land on a random island.
**WASD** walk · **E** inspect · **F** gather · **G** sow · **P** postcard ·
**R** new island. Days last ~4 minutes; stay out after dusk.

Worth visiting: `?seed=99` (the blue forest below), `?seed=12345`
(two pockets, two springs, and Lulu), `?seed=555` (fenland island).

## The tour

**Dusil Skerry (seed 99)** — no one chose these colors; the island's tree
species just rolled indigo and orchid, and drift did the rest:

![indigo and magenta forest](shots/dusil-skerry-forest.png)

**A pocket biome igniting at night** (seed 12345, hidden between two
rivers — ~60% of islands hide one, nothing marks them, you just find them):

![pocket clearing glowing at night](shots/pocket-ignites-at-night.png)

**The glow forest after dark** — fungi light the understory and join into
faint mycelium threads; the wanderer carries a small lantern:

![bioluminescent forest at night](shots/glow-forest-at-night.png)

**A hot spring at the rock's edge** — steam, a warm teal pool, and a water
flower that colonized it on its own (shallow water is valid habitat; the
systems compose):

![hot spring with resident flower](shots/hot-spring.png)

**Sanpo Tumbles at their den** — every critter species loves one plant and
dens where it grows:

![critters near their burrow](shots/critter-den.png)

**Lulu, the old wanderer** — seed 12345's beast. No den, no appetite, just
an endless slow crossing. She glows at night. She will sometimes stop and
look at you:

![the beast crossing the dunes](shots/lulu-the-old-wanderer.png)

**A fenland coast** (seed 555) and **an island overview** (dev view,
`?overview=1`):

![marsh coastline](shots/marsh-coast.png)
![island overview](shots/overview-dusil-skerry.png)

## What shipped overnight

Everything is committed to `master`, 76 unit tests green, zero runtime
dependencies, ~13 kB gzipped.

- **World**: named islands, per-seed silhouettes, rivers with deltas and
  pond-ring marshes, marsh biome, hot springs, hidden pocket biomes
- **Flora**: 5 forms (flower/shrub/tree/fungus/fern, plus lily & reed
  aquatic forms), ~15 named species per island, genome drift in real time,
  **cross-pollination** (neighbors breed; planting is breeding), pocket
  amplification, one ✶ sport per island
- **Fauna**: 3 critter species with dens/foraging/curiosity/blinks; the
  beast; butterflies by day, moths by night
- **Light**: 4-minute days, glow genomes shining after dark, mycelium
  threads, cloud shadows, the lantern
- **You**: inspect panel with drift readings, seed pouch, sowing, postcards
- **Murmurs**: 20 gathered voices (Thoreau, Darwin, Bashō, Dickinson,
  Whitman, van Gogh…) surfacing at first-times: new biome, stillness,
  night, the sport, the beast, the spring

The full design record is in `docs/superpowers/` (specs + plans) and the
idea backlog in `docs/ideas.md`.

## Decisions waiting for your taste

1. **Field journal** (J) — my top pick for the next step: a self-writing
   memoir of every species you've met, renameable, per-seed memory.
2. **The wanderer's home** — where does it live, what is it for? (My
   instinct: a porch, a garden bed, a place the camera rests — not a base.)
3. **Critter trust** — feeding favorites → follow → they lead you to
   secrets. How tame should wild things get?
4. **Sound** — generative wind/footsteps/critter motifs. Big mood win,
   real scope.
5. **Cross-island seeds** — should one pouch slot survive `R`? (Invasive
   species as gameplay.)
6. Anything on the island that made you feel something — tell me what, and
   that's the direction.

— written at the end of the night shift, with the loop still ticking
