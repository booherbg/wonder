# Wonder — working notes for Claude

## Writing

`docs/WRITING-STANDARD.md` governs every document, prototype, report, UI string and
commit message in this repo. Read it before writing prose. The three rules that get
broken most:

1. **Define before you use.** Every term gets a definition — with type and range —
   before its first load-bearing use. Findings come after definitions, never before.
2. **No failed soft analogies.** A borrowed word standing where a literal term exists
   ("load-bearing", "does the work", "the whole difference", "what it holds") must be
   replaced with the mechanism it is gesturing at. Apply the referent test: can the
   reader point to the variable, function, panel or number the phrase names?
3. **Numbers, not adjectives.** "far steeper" is a number you have and did not type.
   Every comparison carries both sides and its sample size.

## Prototypes

Benches live in `docs/superpowers/prototypes/` and follow `BENCH-KIT.md`: single
self-contained HTML fragments, no external requests, seeded RNG only, both themes,
no horizontal overflow at 1280px or 430px.

- `npm run build` runs `vite build` then `scripts/build-benches.mjs`, which publishes
  the benches to `dist/benches/`. **Adding a bench needs both a `PAGES` and a `LOCAL`
  entry in that script**, or it silently does not ship.
- `node scripts/bench-qa.mjs` checks the prototypes for fragment discipline, external
  loads, unseeded randomness, console errors, overflow and unpainted canvases.
