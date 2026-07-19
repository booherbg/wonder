# Inspect Everything — no visible thing is mute

*Captured 2026-07-18 from Blaine, playing at night: "there was something on
the beach. i should be able to inspect literally everything. otherwise
what's the POINT." This is a north-star for the inspect verb, not a nicety.*

## The principle

**If you can see it, leaning close (E) must reward you** — with at least a
gentle line, and a sketch where one exists. Inspect is Wander's core
discovery verb; every dead end (a thing you can see but not learn) is a
small broken promise. Rich things (plants with genomes, critters with
moods) keep their full cards; everything else earns a quiet, poetic line in
the game's own voice. No wall of text: inspect shows only what is *actually
near and notable right now*, exactly as it already does for plants.

## What "something on the beach at night" was

Almost certainly one of these — and none is inspectable today:
- a **tide pool dweller** (rose star, anemone, violet urchin) — bared at low
  tide, and *glowing* on a biolume night, right there on the sand;
- **driftwood** or a **loose stone** the sea left;
- the **glowing tide** itself, sparking blue-green at the water's edge.

## The audit — visible today, but mute to inspect

Inspectable now: plants (species cards), critters (company), the beast.
**Everything below is visible on screen and says nothing when you lean in:**

- **The shore & sea**: tide pools + their dwellers, driftwood / stones /
  marsh rushes, the biolume tide, fish, frogs, dragonflies.
- **The land & water features**: hot springs, waterfalls, confluence pools,
  the crater lake, night-glowing mycelium threads.
- **Aloft**: birds / flocks, pollinator wisps & moths.
- **The camp**: the fire, the bedroll, the garden bed, your own footprints.
- **The hour & sky**: night / dusk / dawn, low vs high tide, an aurora, a
  bloom day, rain, a glowing-tide night.

## The build

Extend the inspect gather-and-render, keeping proximity scoping so it stays
focused, not a catalog:

1. **`openInspectAtPlayer` (main.ts)** — beyond plants/critters/beast, also
   gather what's in reach: tide pools, materials, springs/falls/confluence/
   crater, mycelium (at night), birds/fish/frogs/dragonflies/pollinators
   nearby, and read the current hour/tide/weather state.
2. **`openInspect` (render/inspect.ts)** — render new gentle sections, each
   thing at least a line, a little sprite/canvas where one already exists
   (tide-pool dwellers, materials, and the beast all have art):
   - **"the hour"** — a line for the sky and sea right now: *"a low tide
     under stars," "an aurora crossing," "the morning after a glowing
     tide."*
   - **"at the water's edge"** — tide pools + dwellers, driftwood, the
     biolume tide.
   - **"the land"** — springs, falls, confluence, crater, mycelium.
   - **"aloft / in the water"** — birds, fish, dragonflies, pollinators.
   - keep **"growing here," "company," "your pouch."**
3. Each dweller/feature gets a short written line in the field-guide voice
   (reuse the tide-pool dweller sprites, material glyphs, beast sprite).
   Where a thing has natural history worth a murmur, it can offer one.

## Notes for the build

- **Scope by proximity** so a night beach shows *"a low tide under stars" +
  "an anemone folds and opens" + "driftwood, salt-dried"* — magic, not a
  data dump.
- Depends on the **gather-from-inspect** work (in `inspect.ts` +
  `openInspectAtPlayer` right now) — sequence this *after* that lands to
  avoid clobbering the same files.
- The tide-pool dwellers, materials, springs, falls, crater, confluence,
  mycelium, birds, fish, frogs, dragonflies, pollinators all already exist
  in the sim/renderer — this is surfacing them to the inspect verb, not
  inventing them.
