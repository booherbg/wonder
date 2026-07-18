# Island Explorer — Design Spec

**Date:** 2026-07-18
**Status:** Approved direction, pending spec review
**Working title:** *Wander* (easily renamed)

## What we're building

A peaceful, generative, explorable pixel-art world in the browser. Each seed
produces a finite island — mountains in the interior, rivers flowing downhill
to the sea, forests and grasslands between — and you walk through it as a
small pixel character. No goals, no enemies, no timers. Just a beautiful
place to explore.

This is deliberately **step one** of a larger, direction-unknown project.
The next step gets decided after this one exists and is fun to walk around in.

## Core decisions (settled during brainstorming)

| Decision | Choice |
|---|---|
| Tech | Vite + TypeScript, Canvas 2D, zero runtime dependencies |
| Perspective | Top-down, player-controlled character |
| World shape | Finite seed-generated island (~300×300 tiles) |
| Generation | Layered fractal noise + radial falloff; noise-based moisture for biomes; rivers traced downhill from mountain springs |
| Art | 100% procedurally drawn pixel tiles (16×16), no asset files |
| Tweakability | **First-class constraint.** Palette, worldgen parameters, and tile art each live in one obvious, isolated place |

## Architecture

```
src/
  core/
    rng.ts        seeded PRNG (mulberry32) — determinism everywhere
    noise.ts      value noise + fBm octaves, built on rng
  world/
    types.ts      Tile enum, WorldMap interface, Biome definitions
    config.ts     ALL worldgen tunables: map size, noise scales/octaves,
                  elevation thresholds, moisture thresholds, river count,
                  falloff curve — one file, commented, safe to fiddle with
    generate.ts   seed → WorldMap (pure function, fully unit-testable)
  render/
    palette.ts    every color in the game, named, in one file
    tiles.ts      one small draw function per tile type → pre-rendered
                  tile atlas (with per-tile variants so nothing looks stamped)
    renderer.ts   camera, viewport tile blitting, water shimmer animation
  game/
    player.ts     movement, collision against tile passability
    main.ts       game loop, input, seed display / regenerate
```

Each unit has one purpose and a clean interface: `generate(seed, config)`
returns a `WorldMap`; the renderer consumes a `WorldMap` and a camera; the
player consumes passability queries. Generation knows nothing about
rendering; rendering knows nothing about input.

## World generation (generate.ts)

1. **Elevation:** fBm noise (several octaves) multiplied by a radial falloff
   from map center → guarantees ocean at the edges, highland in the interior.
2. **Moisture:** independent fBm noise field.
3. **Biome classification** per tile from (elevation, moisture) thresholds:
   deep water, shallow water, sand, grass, forest, rock, snow.
4. **Rivers:** pick N spring points among high-elevation tiles (spaced apart);
   each flows repeatedly to its steepest-descent neighbor, carving shallow
   water, until it reaches the sea. If trapped in a local minimum, it forms a
   small lake and stops. Rivers are wadeable so they never wall off the map.
5. **Spawn point:** a grass tile on the largest connected walkable region,
   near the coast.
6. **Retry guard:** if a seed yields a degenerate island (land below a
   minimum fraction), reroll deterministically (seed+1) up to a small cap.

Passability: grass, sand, forest, shallow water (wading) are walkable;
deep water, rock, and snow are not. Mountains are walked *around*.

## Rendering

- Tiles pre-drawn once per world into an offscreen atlas canvas; the visible
  viewport is blitted each frame. Target 60fps trivially.
- Integer pixel scaling, `imageSmoothingEnabled = false` — crisp pixels.
- Each tile type has a handful of pre-drawn variants chosen deterministically
  per map position (hash of x,y,seed) so terrain doesn't look stamped.
- Water animates with a slow two-frame shimmer. This is the one ambient
  animation in scope for step one.
- Camera follows the player, clamped to map edges.

## Controls & UI

- WASD / arrow keys to walk (smooth sub-tile movement, camera follows).
- `R` regenerates with a random seed.
- Current seed shown unobtrusively on screen; `?seed=` URL param loads a
  specific island so worlds are shareable/revisitable.

## Error handling

- Degenerate seeds: handled by the retry guard above.
- River tracing has a hard step limit (can't loop forever).
- Camera and player positions clamped to map bounds.

## Testing

`generate.ts` and everything under `core/` are pure and get real unit tests
(Vitest, dev-dependency only):

- Same seed → identical map (determinism).
- Every river tile connects to the sea or a lake terminus.
- Spawn tile is walkable and its connected region exceeds a minimum size.
- Map edges are always deep water.
- Biome coverage sanity (e.g., land fraction within expected band).

Rendering and feel are verified by eye in the browser.

## Explicitly out of scope for step one

Sound, day/night, NPCs/animals, items, saving progress, infinite worlds,
minimap, touch controls. All are natural *next* steps — the point is a small,
beautiful, finished first world.
