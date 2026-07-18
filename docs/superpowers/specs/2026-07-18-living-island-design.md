# Living Island — Design Spec (Phase 2)

**Date:** 2026-07-18
**Status:** Direction approved by Blaine mid-session ("go ahead and build this");
details designed autonomously overnight — every decision here is open to revision.
**Builds on:** `2026-07-18-island-explorer-design.md` (phase 1, shipped)

## Vision

The island comes alive. Each island evolves its own flora — species unique to
its biomes, every individual plant grown from a genome that drifts as plants
reseed, so walking across a meadow means walking through a *gradient* of
color and form. Cute small animals live in dens, forage the plants they love,
and cluster where their favorites bloom. The player can lean in close
(inspect), gather seeds, and replant them — the first gardening verb.

Design pillars, in the user's words: **variety and surprise**; psychedelic,
Scavenger's Reign-adjacent flora; peaceful; one step at a time.

## Core concepts

### Genome
A plant genome is a small record of numeric traits:
`form` (flower | shrub | tree | fungus — fixed per species), `hue`, `hue2`
(accent), `sat`, `height`, `spread`, `petals`, `leaves`, `lean`, `glow`.
Mutation = seeded-random jitter of each numeric trait, clamped to bounds.
`glow > 0.8` adds luminous accent pixels — the psychedelic tail of the
distribution, reachable by drift.

### Species
Each island generates ~12–16 plant species (deterministic from seed): for
each habitat — grass, forest, sand, shallow-water, rock — 2 to 4 species
with an archetype genome, a generated name (syllable words, e.g. "Vethka
Trumpetbloom"), and a habitat tile preference. One species per island is a
**sport**: trait ranges exaggerated (neon hues, doubled height) for surprise.
Forest-tree species replace the old baked-in tile tree: trees become
individual plants with genomes (the forest tile art becomes mossy floor).

### Plants (instances)
Up to ~8000 plant instances live in a per-tile spatial index. At worldgen,
habitats are seeded in noise-driven patches; each plant's starting genome is
the species archetype shifted by a smooth field over (x, y) — so geography
already shows drift gradients on day one.

**Life simulation** (a tick every ~2s, budgeted subset of plants): mature
plants occasionally reseed to a nearby eligible tile with a mutated genome;
old plants die and free space. Drift is visible within a session and
compounds across one.

### Critters
Three animal species per island (deterministic): round pastel-bodied,
procedurally drawn (body hue, ear/tail length, size), each with a **favorite
plant species** and a den placed near a cluster of favorites. A handful of
individuals per species. Behavior loop: idle-hop near home → seek a favorite
plant in range → nibble it (gentle; plants survive) → drift home; mildly
curious about the player (turn, occasionally hop closer). They obey the same
walkability as the player.

### Player verbs
- **E — inspect**: DOM overlay panel showing the plants within ~2.5 tiles,
  each rendered large (pixel-crisp 6× zoom): name, traits, and how far its
  genome has drifted from its species archetype. Esc/E closes.
- **F — gather**: take a seed (species + exact genome snapshot) from the
  nearest plant into a small inventory (8 slots, shown as colored dots).
- **G — plant**: sow the first seed at your feet if the tile suits it —
  gardening: carry a violet glow-fern across the island and start a colony.

## Architecture

```
src/life/genome.ts     Genome type, clamp bounds, mutate(), drift distance,
                       phenoKey() (quantized cache key), hsl() helper
src/life/species.ts    generateSpecies(seed) -> PlantSpecies[]; name generator
src/life/flora.ts      Flora: per-tile plant index; initFlora(map, species);
                       simTick(); plantsNear(); addPlant/removePlant
src/life/fauna.ts      generateCritterSpecies(seed, flora); Critter update FSM;
                       den placement
src/game/inventory.ts  seed slots, gather/plant rules (pure, testable)
src/render/plantSprites.ts   genome -> cached offscreen sprite canvas
src/render/critterSprites.ts critter species -> 2-frame sprite pair
src/render/inspect.ts  DOM panel (open/close/populate)
```

Renderer gains a y-sorted entity pass (plants row-by-row, critters and
player interleaved) so tall trees overlap correctly. Simulation state lives
outside the renderer; `main.ts` owns the tick timer and key wiring.

Determinism: all generation and simulation randomness flows from seeded RNG
streams (world seed ⊕ purpose constants). `Math.random()` stays confined to
main.ts's fresh-seed picker.

## Out of scope for this phase
Wanderer traits/home, animal taming, saving, sound, day/night, weather.
Candidate next steps live in `docs/ideas.md`.

## Testing
Pure logic is unit-tested (mutation bounds & determinism, species/name
generation, habitat eligibility of every placed plant, sim reproduction
rules, critter walkability invariants, inventory round-trips). Rendering and
feel verified by screenshot review at ground level and overview.
