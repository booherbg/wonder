# Wander

A peaceful, generative pixel-art island that is *alive*. Every seed grows a
new island — mountains at the heart, rivers running to the sea — and then
grows an ecology on top of it: plant species unique to each island's
habitats, every individual carrying a genome that drifts as plants reseed;
cute critters with dens who forage the plants they love; and murmurs — real
human words that surface at quiet moments.

## Play

    npm install
    npm run dev

Open http://localhost:5173.

- **WASD / arrows** — walk
- **E** — inspect the plants at your feet, up close (names, traits, drift)
- **F** — gather a seed from the nearest plant
- **G** — sow your oldest seed where you stand
- **P** — save a postcard PNG of the current view
- **R** — new island
- **?seed=N** in the URL — revisit a specific island (the URL always shows
  the current seed, so copy it to share an island)
- **?overview=1** — bird's-eye view of the whole island (dev aid);
  **?at=tx,ty** — start at a tile (dev aid)

Deep water, bare rock, and snow block your path; you can wade through
rivers, shallows, and marshes. Stand still sometimes. Follow the critters —
they know where the good things grow. One species on every island is a
✶ sport: stranger, brighter, worth finding. Days are about four minutes
long; stay out after dusk and the glow-trait plants reveal themselves
(`?night=1` to force night).

## Tweak it

Everything tunable lives in an obvious place:

- `src/world/config.ts` — island size, sea level, mountain/snow lines,
  forest density, river count… every worldgen knob, commented
- `src/render/palette.ts` — every color of the terrain
- `src/render/tiles.ts` — the ground pixel art, one draw function per tile
- `src/life/genome.ts` — plant traits and mutation bounds
- `src/life/species.ts` — species archetypes, habitats, and the name maker
- `src/life/flora.ts` — scatter density, drift speed, lifespans (`DEFAULT_TUNING`)
- `src/render/plantSprites.ts` — how genomes become pixels, one drawer per form
- `src/game/murmurs.ts` — the murmurs and their moments

## Develop

    npm test        # world generation unit tests (vitest)
    npm run check   # typecheck
    npm run build   # production build

Design docs live in `docs/superpowers/`.
