# Wander

A peaceful, generative pixel-art island to explore. Every seed is a new
island — mountains at the heart, rivers running to the sea, forests and
meadows between.

## Play

    npm install
    npm run dev

Open http://localhost:5173.

- **WASD / arrows** — walk
- **R** — new island
- **?seed=N** in the URL — revisit a specific island (the URL always shows
  the current seed, so copy it to share an island)
- **?overview=1** — bird's-eye view of the whole island (dev aid)

Deep water, bare rock, and snow block your path; you can wade through
rivers and shallows.

## Tweak it

Everything tunable lives in an obvious place:

- `src/world/config.ts` — island size, sea level, mountain/snow lines,
  forest density, river count… every worldgen knob, commented
- `src/render/palette.ts` — every color in the game
- `src/render/tiles.ts` — the pixel art itself, one draw function per tile

## Develop

    npm test        # world generation unit tests (vitest)
    npm run check   # typecheck
    npm run build   # production build

Design docs live in `docs/superpowers/`.
