# The Simulator — design

**Date:** 2026-07-21
**Status:** design approved in brainstorm; first build (v1) specced here, awaiting spec review → plan.
**Working name:** *the Simulator* (Blaine's rename of "the Bench").

---

## Where this sits — the World Lab & the god-view north star

The Simulator is the first of three "doors" onto **the World Lab** — a family of
tools for *understanding and shaping the ecology*, all riding one shared engine.
Blaine's framing this session: *"we're still in 'what is this world going to be'
mode — need more tools for understanding."*

- **Door C — the Simulator** *(this spec).* A construct you pull anything into,
  stamp, roll, swap biomes, and read every number. Reductionist — put the
  primitives on a bench by hand, see how they interact. The instrument for
  developing mechanics from the ground up.

**Two intents — hold both** (Blaine's framing):
1. **Explore phenotypes** — what a critter/plant *can be*: roll morphology and
   traits, compare, pick, iterate. The character-creator half.
2. **Design something wild & evolutionary** — author and *evolve* a living web:
   roll foodchains, tune the pressures, crank richness, run deep-time, and
   **curate what emerges**. The world-builder half.

The tools below serve both; §*The evolutionary layer* is where intent 2 lives.
- **Door A — deep-time preview** *(later spec).* Fork a real world, run it
  forward at a chosen fidelity, show before→after, adopt-or-discard.
- **Door B — the Forge** *(later spec).* Roll/dial the **land**, lock the geology
  you love, then re-roll/customize the **life** on it — "same land, many lives."
  Its enabler is a `terrainSeed`/`lifeSeed` split (**not** needed by the
  Simulator, so out of scope here — noted so it isn't lost).

**The north star (tucked away, a non-goal for now — but don't architect against
it):** a **god-view / petri-dish** mode where you run the world at the
meta-level, and when it's rich enough you **pause, descend, and go on an
adventure**, then rise back out. God-view is "run the world from above"; the
walk-around game we already have is "drop in." The long arc makes them one
product. The Simulator's forked/headless kernel and meta-level panels are the
muscles god-view flexes later — so build them clean and reusable.

**Decisions locked in the brainstorm (for context; A/B are future specs):**

| Question | Decision |
|---|---|
| Deep-time fidelity (Door A) | A **toggle**: fast plant-only scrub *and* slow full-ecology run |
| Deep-time jump model (Door A) | **Preview you can adopt** (fork → run → keep or discard); scrubbable timeline = v2 |
| Generator control (Door B) | **Two layers** — roll/dial geology, lock it, re-roll/customize life |
| Build order | **Simulator first** — it forces the cleanest shared engine |
| Ambient creatures | **Prototype on the bench, decide later** (see below) |

---

## Base principles — what's actually alive (the audit)

Grounding findings from reading the code this session. These shape the design.

**1. There is no neutral/void ground tile.** `Tile` (`src/world/types.ts`) is all
natural biomes: `DeepWater, ShallowWater, Sand, Grass, Forest, Rock, Snow, Marsh,
Scree, Highland, Cliff`. `Grass` is the generic-est walkable. → **Decided at
review: we don't add one.** The Sim starts from **real-tile starters** and the
biome brush replaces tiles — no new enum value, no worldgen guard, no "no-habitat"
special-casing. (The literal Matrix void look is set aside.)

**2. Half the "wildlife" has no ecological role — a hard code split:**

- **Real actors (stateful, mechanical):** **critters** (`src/life/fauna.ts`) and
  **the beast** (`src/life/beast.ts`, a carrier that sows seeds as it roams).
  These eat, spread, and form chains. This *is* the ecology.
- **Pure decoration (cosmetic, wall-clock, zero ecology role):** **pollinators,
  frogs, dragonflies, fish** — all in `src/render/ambient.ts`, the *render* layer.
  They drift/sip/sparkle off the clock and camera; they don't pollinate, eat,
  drift genes, or connect to anything.
- The only *mechanical* pollination is plant→neighbour crossing
  (`flora.pollinationRadius`, `src/life/flora.ts:431`) — unrelated to the visual
  `Pollinators` class.

→ The Simulator is where we decide whether the ambient creatures earn a role
(see *Ambient bench*, below).

**3. Critters are only half-stateful across save/load.**
- *Good:* motive is already **deterministic**, not random — drives decide
  (hunger/comfort/curiosity); dice only jitter timing and wander-steps
  (`critterDrives`/`dominantDrive`, `src/life/fauna.ts`).
- *Gap:* the save keeps only `[species, x, y, energy]`
  (`src/game/save.ts:101`). On reload the **behavioural state resets** — `state`,
  `targetX/Y`, `stateTime`, `mood`, `curiosity`, current `meal`, and the RNG
  stream. So an animal doesn't "pick up where it was."

→ Making critters first-class = persist the **full `Critter` state + the sim
RNG** so a scenario **resumes and even replays identically**. (Bonus: closes the
long-standing "individuals respawn each load" gap in the real game.)

---

## The shared engine (built here, reused by Doors A & B)

Three reusable pieces. Building the Simulator forces all three clean.

### 1. Headless life kernel
A `Flora` + critter set you **step forward with no rendering and no player-drive**.

```
kernel.step(nTicks, { fidelity })   // fidelity: "plants" | "full"
```
- `"plants"` — `flora.simTick()` + `census.sample()` per tick (what `?warm` does
  today, `src/game/main.ts:748`). Fast scrub.
- `"full"` — additionally steps every critter headless: `updateCritter(c, dt,
  map, flora, species, rng, ctx)` with a fixed `dt` and a **neutral/off-map
  player** so nothing is drawn toward a hearth. Co-adaptation actually happens
  (grazing sets plants back, dispersal spreads + emits substrate).
- **Feasibility to verify before leaning on it:** confirm `updateCritter` is
  render-free and tolerates a null/off-map player. It reads as pure logic, but
  verify (a throwaway `tests/_kernel.test.ts` stepping N ticks headless).

This is exactly what Door A forks into and Door B previews with.

### 2. Manipulation API
Thin wrappers over existing `Flora`/`fauna` internals — the verbs the bench (and
later the home-lab) act through:

- `spawnPlant(species, tx, ty)` — place one plant (over `flora.addPlant`/sow;
  respects the per-tile cap).
- `spawnCritter(species, wx, wy)` — construct a `Critter` (the shape in
  `spawnCritters`, `src/life/fauna.ts:529`) and add it.
- `removeAt(tx, ty)` — clear plants/critters on a tile (`flora.removePlant`
  exists).
- `rollPlantSpecies(seed)` / `rollCritterSpecies(seed)` — generate a *new* kind
  on demand (reuse the species-roster generator + `generateCritterSpecies`).
- `setRole(critter|species, "disperser"|"grazer")`, `retargetPalate(critter,
  plantSpecies)` — the knobs that let you **drive a chain by hand**.
- `paintBiome(tx, ty, tile)` — the biome brush.

### 3. Legibility read
The Simulator shows, live: **census** (`src/life/census.ts`, `CensusLog`), the
**living-web** (`src/render/web.ts`, from `foodweb.ts` chainLinks/chainStats),
and per-entity **internal state** (extend the inspect card, `src/render/inspect.ts`).

---

## The construct — starter canvases (real tiles, no new tile)

**Decision (spec review):** no neutral void tile. The construct is a small
`WorldMap` built from the **existing biome tiles**; the biome brush replaces any
of them. The Simulator is a **separate mode**, so real worlds and worldgen are
untouched by construction (the byte-identical guarantee is about *mode
isolation*, not a guarded tile). The literal Matrix white-room look is set aside;
"blank" is just a single-biome fill.

- **Construct map** — a small `WorldMap` built directly, no rivers/features. Size
  comes from the chosen starter.
- **Biome brush** — `paintBiome` stamps real tiles (Grass/Marsh/ShallowWater/…)
  so a placed plant gets legal habitat. Answers *"how can a water plant live on
  land?"* — it can't, so you paint water first, then plant.

### Starters — pick one, then customize

You start from something believable, not a cold grid. A small handful:

- **Playable island** — a small **real** island (reuse `generate()` at a modest
  size, or a curated seed). You begin with terrain, water, biomes — a living
  little world to mess with immediately.
- **Biome sampler** — the major biomes as clean bands/quadrants
  (ShallowWater · Sand · Grass · Forest · Marsh, a Rock/Highland corner) so you
  can drop any kind onto legal ground and test cross-biome interactions in one
  screen.
- **Single biome** — one biome fills the map (pick which) — the near-empty
  "blank" canvas, for studying one habitat's web in isolation.

Starters are seeded fills / a small `generate()` call (trivial to add more).
Each carries its own size — the sampler wants room, a single-biome study can be
tight — which settles the old "what size" question.

### Saving a sim to a slot

A construct you've built up can be **saved to a named slot and resumed later** —
its own space, separate from the real-world saves. This rides directly on the
full-state + RNG persistence below, so a resumed sim **picks up exactly** where
you left it (and replays identically). v1: save/resume to a slot. Share/export a
"scenario string" is v2.

---

## Stateful & deterministic critters

- **Persist the full `Critter`** — extend the save row (or add a `crittersV2`
  block) to carry `state, targetX, targetY, stateTime, mood, curiosity, facing,
  meal(as plant index or dropped), path, pathGoal, stuck` alongside the existing
  `species, x, y, energy`. `companion` already persists separately
  (`SavedCompanion`).
- **Persist the sim RNG stream(s)** — the critter RNG and `flora.rng` state, so a
  saved scenario **replays bit-identically**, not just resumes-approximately.
- **Backward compatible** — old saves (`[species, x, y, energy]` rows, no RNG
  block) still load; missing fields default exactly as `restoreCritters`
  (`src/game/save.ts:155`) does today. No pinned seed or existing world shifts.
- This work lives in `save.ts` + `fauna.ts` and benefits the **real game too**
  (animals resume mid-thought), not only the Simulator.

---

## The Simulator UI — v1

**Front door (Blaine's "like a real game"):** a **title screen** on load →
**World · Simulator · Help**. "World" = today's flow (sail to / pick an isle);
"Simulator" = enter the construct; "Help" = the field guide / references.
**Behind the menu, a wildly rich biome plays live** — a deliberately lush,
warmed island (lots of plants, ambients, diversity) running for beauty, the way
big games use a living scene as title art. Reuses the renderer over a
high-diversity seed (pre-warmed so it meets you rich). Codex art direction for
the menu itself.

**Inside the construct (v1):**
- **Palette** — the kinds currently on your bench (rolled or picked). Select one,
  then click the canvas to place it. New kinds arrive from the roll pane.
- **The roll pane (species lab)** — the heart of "carve out the ecology." A pane
  where you **roll a batch** of a kind (critters, plants, or ambients), see them
  as a **grid of live sprite thumbnails**, **pick** the ones you like onto your
  palette, and **iterate** on a pick:
  - *Looks* — re-roll or nudge the morph/genome (a critter's body plan, tail,
    crown, coat, eyes, colour — `CritterMorph`, `morphOf`; a plant's form, hue,
    proportions). Thumbnails re-render from `critterSprites.ts` / `plantSprites.ts`.
  - *Traits* — a critter's palate (what it favours), role (disperser/grazer),
    size; a plant's habitat and reseed behaviour.
  - *Ambients* roll on **looks only** for now (they have no traits yet — see the
    ambient bench); iterating their role is the experimental toggle below.
  "Roll a bunch, pick one, iterate" — a character-creator for the whole cast.
- **The drawer (species roster)** — every kind you've introduced is **stamped
  into a drawer** with its live status: **number in play** (from
  `flora.speciesCounts` / a critter tally), **variations** (iterated looks/traits
  + any daughters that arose ✧), and an **extinct** mark when the count hits zero.
  You manage it: **delete** a kind from the drawer (clear an extinct one you're
  done with) or **bring it back** (re-spawn from the stored definition — so the
  drawer holds each kind's full definition, not just a live reference). The
  drawer is the Sim's cast list and the roll pane's landing shelf.
- **Stamp brush** — **1×1 / 2×2 / 3×3** size picker (the SimCity stamp): one
  click lays a block of the selected palette kind.
- **Biome brush** — paint the ground tile under where you'll build.
- **Time controls** — **pause / play / speed**, plus step 1 · step N. Play/pause
  simply **halts the sim engine** (the kernel stops stepping); rendering keeps
  running so you can still pan and inspect a frozen world. Speed scales
  ticks-per-second; **fidelity toggle** (plants-only vs full) lives here too.
- **Data readout** — inspect *anything* → its **full internal state** (a critter's
  drives/energy/mood/target/meal; a plant's genome-derived traits/hue/age) **+ all
  species data** (palate, role, habitat, appetite matches). The **living-web**
  and **census** update live as you step, so a chain *appears* when it closes.
- **Ambient bench** — place pollinators/frogs/dragonflies and **toggle
  experimental roles** (OFF by default): e.g. *pollinator moves genes between
  neighbouring blooms*, *frog crops insects*. Observe on the bench only — nothing
  graduates to real worlds in v1. This is where we learn what role (if any) they
  deserve.

**Art direction:** the naturalist's-codex token system (`index.html :root`
tokens; serif small-caps titles, mint section labels, mono keycaps/counts) —
every new panel consumes tokens, no hardcoded hexes.

### Build order within v1 (so something's playable early)

v1 is broad; build it so each slice is usable on its own. Rough order (the
implementation plan finalizes it):

1. **Playable core** — a starter canvas + headless kernel + place-one +
   pause/play/step + the data readout, on fully-stateful critters. The minimum
   "pull a plant and a critter in, run time, watch them interact."
2. **Shaping tools** — stamp brush (1×1/2×2/3×3) + biome brush + the starter
   templates (playable island / biome-sampler / single-biome).
3. **The roll pane + the drawer** — batch-roll → grid → pick → iterate
   looks/traits; introduced kinds land in the drawer (which **auto-captures
   emergent daughters** ✧) with live status.
4. **The evolutionary layer** — roll-a-foodchain/web, a basic pressures panel
   (drift / speciation / grazer-share), and the richness/wildness meter. Turns
   the bench from "place & watch" into "author & evolve."
5. **Frame & persistence** — title screen (World/Simulator/Help, live-biome
   backdrop) + save/resume to a slot + the ambient bench.

---

## The evolutionary layer — designing something wild (intent 2)

The kernel already *evolves* when you step it: genomes **drift** on reseed,
**daughter species arise** (✧) past `FloraTuning` thresholds, and **selection**
bends flora toward what the critters favour. Intent 2 is about *steering* that.

**The loop:** seed/roll → set the pressures → run deep-time → **curate what
emerges** → re-seed from the good bits → repeat.

- **Roll a foodchain / a web** *(v1)* — beyond rolling one kind, generate a
  *matched set* built to interlock: a plant of hue H + a disperser whose palate
  favours it + a substrate-feeder tuned to H → a closable chain. Roll several → a
  starter web. Reuses `foodweb.ts` matching + the substrate/palate rules. This is
  "rolling foodchains."
- **The pressures panel** *(v1 basic → v2 deep)* — expose knobs buried in
  `FloraTuning` / constants today: **drift/mutation rate**, **speciation
  threshold** (how easily daughters split — `?split=1` is the current dev aid),
  **grazer share / critter density** (selection strength), **reseed rate**, and
  the **per-tile cap** (the richness ceiling). Crank them; watch phenotypes and
  chains evolve faster or wilder.
- **Increase richness** *(v1)* — a **richness/wildness meter** for the whole
  construct (reuse `diversityScore` + chain count as a live score) and a "seed it
  richer" action that drops a diverse matched web. Know when you've made something
  wild.
- **Curate what emerges** *(v1 basic → v2 deep)* — the **drawer auto-captures
  emergent daughters** (✧) as first-class entries, and you can **pin** a phenotype
  to re-seed from it. The wild output becomes new input. *(v2: name lineages,
  branch a phenotype, export a curated kind toward a real world.)*

Deep-time on the bench reuses the kernel's `step()` + fidelity toggle (the engine
Door A forks with), so "run evolution N ticks and see what shows up" is in hand.

---

## Insect swarms (LIVE — the fun, peaceful half)

*Blaine's steer (2026-07-21): a swarm is fun and **not** the same as critter-on-
critter predation. It's a mass phenomenon, not a charged kill — so it sidesteps
the peaceful-pillar worry, the perf hole, and the arms-race complexity, and stands
on its own without the parked predation machinery.*

- **A swarm is a species with a genome**, living mostly as a **drifting cloud**;
  individuals can **peel off to seek** and rejoin. It has behaviours and emergent
  physical traits (colour, camouflage). Inspect/roll/drawer treat it as a first-
  class kind.
- **Foraged = population reduced, never killed.** A frog sipping a swarm reads as
  cozy foraging, not violence — no character dies. But the *survivors' traits
  dominate the regrowth*, so it's real selection pressure with zero death. This is
  the peaceful bridge to the (parked) predator side.

### The identity-map matcher (insect-specific for now)

The mutable key-and-lock Blaine wants to "trace adaptation over time." Start
insect-specific; generalise (onto `appetite`/substrate) only later.

**Genome vs. phenotype (Blaine's steer, 2026-07-21):** the identity map is the
*abstract tag grid* that matching runs on — it is **not** the creature's body.
The visible phenotype is **rendered *from* the genome** (genome colours → the
colours you see, pattern → markings), so the two are **correlated, not
identical**: evolve the genome and the look shifts, but the genome stays a clean
map you can inspect and match on. (Prototype confirmed the crisp-grid genome reads
better than trying to make the grid literally *be* the body.)

> **This is John Holland's tags** (ECHO, *Hidden Order* / *Signals and
> Boundaries*): tag-matching as the interaction primitive; the swarm is a little
> **genetic algorithm** (population + selection + mutation), the map is its
> tag/chromosome. Mimicry (host-camouflage) is a *known* ECHO emergent, and
> **perpetual novelty** — CAS never settling — is why the sim stays wild. The
> Simulator is a GA you can watch; the evolutionary-eyes tools are its
> instrumentation. ECHO's multi-region tags (offense/defense/mating) → our map's
> possible regions: **affinity** (host-seeking), **appearance** (camouflage), and
> **lineage** (clean cousin-speciation).

- **Plants present a map; insects adapt one (asymmetric).** A plant's map = its
  **existing genome rendered as a pixel signature** (hue/form/symmetry) — no new
  system plant-side; it's their "face," and it drifts slowly as the plant's genome
  drifts (a slow-moving target). The **swarm carries the mutable map** — its
  appearance = its camouflage.
- **Match = pixel similarity.** Two random maps share a low **nominal** match.
- **Energy economy of pixels (the whole game):** a **neutral** pixel costs 0 and
  gives a small base; a **coloured** pixel costs energy to hold but pays a **big
  bonus only when it matches** the host's pixel (wasted otherwise). So a swarm
  can't cheaply match everything — it must **specialise** (big + to its host,
  natural − to others). Resting state = cheap generalist; adaptation = an earned,
  energy-funded investment.
- **No named traits — just "keep visiting."** Better-matched individuals
  out-reproduce the rest → the swarm's aggregate map drifts toward its favourite
  host at a mutation rate. Fast micro-evolution *inside one entity*.
- **Double payoff (falls out):** matching the host earns **mutualism reward**
  (feed + pollinate) *and* **camouflage** (looks like the plant → predators keyed
  to the plant's look struggle). One gradient, two wins → strong, legible
  selection.
- **Cousins (falls out):** the energy cost forbids staying generalist, so swarms on
  different hosts diverge into distinct **cousin swarms** — reuse the flora
  daughter-speciation pattern.

### Inspect = the portrait

A swarm's card shows species facts (population, hosts, habitat, behaviours) **+ a
big pixel portrait of a representative member beside its host's map, match
highlighted** — so you *see* the camouflage and watch it morph toward the host as
it adapts. Show, don't commemorate, applied to evolution.

**Prototype (archived 2026-07-21):** a live design sandbox exploring exactly this
lives at `docs/superpowers/prototypes/2026-07-21-identity-map-lab.html` (artifact:
<https://claude.ai/code/artifact/e39f8fe3-ce0a-4580-a8a0-9bcee58a7d03>). Swarms
adapt pixel-genomes to mimic hosts, plants co-evolve back (a handshake), predators
cull the conspicuous (foraged = population down, **not** death), and you can clone
anyone to watch cousins diverge. It confirmed the model reads at a glance and that
the **double payoff** (mimicry = food + camouflage) drives fast, legible
convergence — Holland ECHO-style tags in miniature.

### The in-game model — worked out live (2026-07-21)

The prototype settled the mechanics; here's how they become the actual game. A
whole ecology from **two map types + a nectar cycle + one population number + a
few behaviour genes.**

**The swarm = one cloud + a small internal gene pool.** A swarm is a *single
spatial entity* (a cloud that moves, homes, forages, renders) carrying a **small
internal pool of ~6–12 genomes**. The pool is GA bookkeeping, **not** spatial
agents — movement/pathfinding cost is per-*swarm*, not per-insect, which
**retires the "thousands of insects melt the sim" perf risk.** Selection runs
*inside* the pool. (A single genome per swarm was rejected: all clones → nothing
to select, predators can't pick anyone off, no divergence — variance is required.)
**Population = pool size / cloud density.**

**The map — one shared format, two instances:**
- **Flower map** (per plant *species*): two layers in one grid — a **base/foliage
  colour** filling most cells (*always present → always something to match*) + a
  **flower accent** whose *size is a genome trait* (few pixels = small bloom =
  small jackpot; many = big showy bloom). Renders as the plant's real flower;
  every plant shows at least a hint, and **Z-zoom / inspect shows it crisp**.
  Plants reproduce slowly → the flower map drifts slowly (a near-fixed target).
- **Insect sensor/appearance map** (per swarm): adapts (via the pool) toward the
  flower it works most. **The insect's colours are rendered from this map** →
  adapting = coming to *look* like the flower.

**Feeding = adaptive metabolism.** A flower's nectar **regenerates on a reset
cycle**; an insect draws **once per cycle**, and the **amount = its match
quality** (base pixels: small generic; flower pixels: the jackpot). Well-matched →
full meals from a few home flowers (safe); poorly-matched → crumbs, must **range**
(exposed). Rate-limited by the cycle, so poor fit genuinely costs — it can't be
brute-forced by grazing. Feeding also **pollinates** (spreads the plant) — the
mutualism.

**Camouflage (free, spatial).** Conspicuousness = `1 − match(appearance, the plant
it's on)`. Adapted + home = hidden; strayed = exposed. One map does feeding *and*
hiding, and gives a **roam-vs-stay** tension for free.

**Predation (gentle, non-wiping).** A predator thins the **conspicuous variants**
— cull rate ∝ conspicuousness — as a **slow population drain, not constant kills**;
hidden/fed swarms **regrow**. Fed predators satiate/rest; predator density capped.
**No predator map needed in v1** (they eat what stands out); an evolving predator
search-image is the richer v2 (the prototype's Red Queen). Peaceful: population
down, never a bonded critter killed.

**Behaviour genes (a scalar slice — heritable + visible):** **Range**
(homebody↔wanderer), **Nerve** (skittish↔bold), **Cohesion** (loose↔tight),
optional **Rhythm** (day↔night). Separate from the pixel map (that's *looks*;
these are *personality*). Evolve under the same pressures; read straight off how
the cloud moves → **visible personality that adapts.**

**Divergence → cousins.** When the internal pool goes **bimodal** (part favouring
flower A, part B — e.g. A's nectar dried up), the swarm **buds a new swarm**
carrying the second cluster (reuse the ✧ daughter pattern). Needs the internal
variance.

**Reuse vs. new.** *Reuse:* plant genomes/forms (`genome.ts`), pollination,
day/night, Z-zoom + inspect, ✧ speciation, critters-as-predators. *New:* the
flower map + sensor map + pixel-matcher; the swarm entity (cloud + gene pool);
nectar meters; the metabolism/camouflage/predation math; behaviour genes.

**Still open (smaller):** exact map size (≈7×7) and base-vs-flower pixel split;
the metabolism/predation-drain constants (tune on the bench); whether behaviour
genes get their own inspect readout; the dual-map (independent camouflage) and
evolving-predator-search-image as explicit **v2** richness knobs.

---

## Critter-on-critter predation (the first predation thread)

> **PARKED — backlog (2026-07-21).** The *heavy* predation (a critter hunting a
> critter — fear, danger, a bonded creature killed) is deferred to its own run
> (see *Near-term backlog*). Insect swarms above are the *peaceful* cousin
> (foraged = population down, no death) and are LIVE. The framing we settled for
> when we return: predation is a **general** mechanic on existing systems (a *diet
> axis* on the palate so a predator tastes prey traits; a *size-ratio gate* —
> palate decides want, size decides can; prey survive via *evolvable genome
> traits* → co-evolution). Headed for real worlds eventually, paced by the bench;
> not insects-only.

- **What it is** — a **tiny critter** (reuses the critter system: a genome, so it
  has morphology and rolls/iterates in the species lab; a grazer role; and now,
  *predated*). The world is mutualist by construction today (the `fear` drive is
  dormant, nothing hunts) — this is the first thing that gets *hunted*.
- **Reproduction (new mechanic)** — **energy-driven**: a well-fed insect (energy
  over a threshold) spawns an offspring nearby and spends the energy; a **per-tile
  density cap** (mirroring flora) bounds it. Food-coupled → emergent boom-bust:
  lush plants → swarm, predators/scarcity → crash. No timer; reuses the energy
  ledger.
- **The catch — one mechanic, many faces.** Under the hood, one shared path:
  seek → reach → consume (predator gains meal-energy, the insect is removed); prey
  **flee via the dormant `fear` drive**. On top, each predator hunts *in
  character* — art direction, for surprise and wonder: **frog** sit-and-tongue-
  flick ambush, **dragonfly** dart-intercept, **bird** stoop, a chase-lunge on the
  approach. Because the core is shared, many predators stay cheap — they differ in
  expression + movement, not logic.
- **Predators (all wired):** dragonflies, frogs, birds — the ambient trio promoted
  to hunters — **and a carnivore critter** (a meat palate on a rolled critter),
  which proves the mechanic is **general** (not hard-coded to ambient creatures)
  and lets the roll pane mint new hunters.
- **New fauna work this commits:** individual **reproduction** + a **hunt drive**
  (the predator counterpart to `fear`). Both prototyped and tuned on the bench.

---

## Ambient & fauna roles — a tiered menu to prototype (opt-in)

Roles are **opt-in** (off by default; toggled on the ambient bench). Here's what
each creature is today and role ideas by effort. **Note:** the *predation-
dependent* rows (frog/dragonfly/bird insectivore, the insect chain-hub) ride with
the **parked predator/prey backlog**; the **non-predation** roles (pollinator
active-cross, bird seed-disperser, fish aquatic-grazer, nutrient shuttle) are the
ones still on the table for the Sim's ambient bench.

| Creature | Today | Easy | Medium stretch | Bigger stretch |
|---|---|---|---|---|
| **Pollinators** | drift & sip flowers (cosmetic) | **active cross-pollinator** — fire the existing neighbour-cross along their flight path | **long-distance carrier** — cross patches farther apart than the passive radius, widening the gene pool | **obligate pollination** — some flowers only set seed if visited; lose the flier → lose the flower |
| **Frogs** | hop near water (cosmetic) | **damp-detritus feeder** — crop a wet-ground substrate (reuses substrate appetite) | **insectivore** — eat the new insect/pest, checking a bloom that would chew plants | **amphibian cycle** — breed in water, forage on land; ties the two webs through one animal |
| **Dragonflies** | dart over water (cosmetic) | **live density gauge** for a placed insect count | **first predation loop** — introduce the insect/pest (fast-breeding grazer-lite); dragonflies/frogs/birds predate it | **insect as chain hub** — insects graze, emit frass, pollinate, get eaten → one node wiring many chains |
| **Fish** | schools in water (cosmetic) | **aquatic grazer** — crop kelp/water plants (grazer role, in water) | **nutrient shuttle** — move substrate between water tiles | **aquatic web** — shore critters / the beast fish the shallows; land & water trade energy |
| **Birds** | stateful flocks: settle/startle/roost, but inert | **dispersers on the wing** — a settled flock drops a drifted seed of what it fed on (long-range) | **frugivore** — prefer fruiting **trees** (not foraged today), tying the canopy in | **migration** — arrive/leave on the day/weather cycle; a periodic long-range disperser |

Prototype these **on the bench first** (nothing graduates to real worlds in v1);
what proves good becomes "ambient-role graduation" (v2).

---

## v2 / deferred (captured, not built now)

- **Scenario share/export** — hand someone a "scenario string" of a saved
  construct. (Slot save/resume itself is **v1**; this is the shareable form.)
- **Deep analytics** — energy/drive **traces over time**, a **connection matrix**,
  per-species population curves beyond today's sparklines.
- **Live param tweak** — palate/role/size sliders on a kind or an individual
  (bridges toward the home-lab *manipulate* half — its own future spec).
- **Ambient-role graduation** — if a bench role proves good, wire it into real
  worlds.
- **Assert-a-link probe** — force a link the current rules *don't* make, to reveal
  the next rule to add.
- **The beast** as a placeable actor on the bench.
- **Doors A & B**, and Door A's **scrubbable timeline**.

### Near-term backlog (beyond this spec, its own run — Blaine flagged)

- **Predator/prey (its own run).** Parked 2026-07-21 mid-design — the framing is
  captured in *The insect/pest primitive* above (general mechanic on existing
  systems: diet-on-palate, size-ratio gate, evolvable prey defenses → co-
  evolution). Open when we return: which **prey defenses** to build first
  (flight/speed+senses · size/armor · unpalatability+warning-color · camouflage ·
  fecundity), the **size-ratio** threshold, how predation reads in the
  **living-web** (a new "hunts" edge), and its **scale/perf** (swarm counts through
  `updateCritter` — needs a population budget + a cheaper insect update path).
- **Habitat as a first-class consideration.** Today habitat is a single gate tile
  per species (a plant lives on its one habitat or dies; critters favour only
  walkable-habitat plants). Blaine wants a **near-term feature run** deepening it:
  habitat **preference/tolerance** (thrive vs. merely survive), habitat as a real
  axis of the food web, and how painting/transitioning biomes shifts who wins.
  The Simulator's biome brush is the perfect proving ground for it.

---

## Open questions (for Blaine, at spec review)

All review questions resolved. Remaining calls are scope-depth ones the
implementation plan will make (how deep the pressures panel goes in v1 vs v2; how
"roll a web" tunes for closure), not blockers.

**Resolved this review:** starter canvas = *real-tile starters, no void tile*;
roles to prototype first = *pollinator active-cross + the insect/pest primitive*;
roll batch = *~9–12, re-roll + nudge*; roll-back-to-real = *neat, not urgent* →
home-lab/v2; title screen = *live rich-biome backdrop*; ambient roles = *opt-in,
off by default*; pause = *halts the sim engine*; every introduced kind lands in
the **drawer** with live status; **intent 2 (wild & evolutionary) is now a
first-class layer** (roll foodchains, pressures panel, richness meter, curate
emergent).

---

## Acceptance (v1)

- `npm run check` (typecheck) clean; `npm test` green; `npm run build` clean.
- **Real worlds byte-identical when not using the Simulator:** the Sim is a
  separate mode (no new tile); the only shared-file change is `save.ts`, which
  stays backward-compatible; no pinned seed shifts. Guard with a test.
- A short **headless-kernel test** proving N ticks step deterministically with
  no renderer, at both fidelities.
- Manual verify via the run/screenshot harness: enter the construct, paint a
  water strip, place a water plant + a disperser whose palate points at it + a
  hue-matched feeder, step time, and **watch the chain close in the web**.

---

## File map (where the work lands)

| Area | Files |
|---|---|
| Construct map + starters | new, e.g. `src/world/construct.ts` (playable-island / biome-sampler / single-biome; real tiles, reuses `generate()`) |
| Headless kernel | new, e.g. `src/life/kernel.ts` (wraps `flora.ts` + `fauna.ts` + `census.ts`) |
| Manipulation API | `src/life/flora.ts`, `src/life/fauna.ts` (small new exports) |
| Full critter state + RNG persistence | `src/game/save.ts`, `src/life/fauna.ts` |
| Sim slot save/resume | `src/game/save.ts` (sim-keyed slots, separate from world saves) |
| Roll pane (species lab) | new, e.g. `src/render/rollpane.ts`; reuses `critterSprites.ts`, `plantSprites.ts`, `genome.ts`, `generateCritterSpecies` |
| Evolutionary layer (roll-a-chain, pressures, richness meter, drawer capture) | reuses `src/life/foodweb.ts` (matching + `diversityScore`), `FloraTuning` in `flora.ts`; new UI in the Simulator |
| Simulator mode + UI | new, e.g. `src/game/simulator.ts` + `src/render/*`; wired in `src/game/main.ts` |
| Title screen | new, small; `src/game/main.ts` entry |
| Data readout | extend `src/render/inspect.ts`; reuse `src/render/web.ts`, `charts.ts` |
| Construct + brushes rendering | `src/render/renderer.ts`, `tiles.ts` |
