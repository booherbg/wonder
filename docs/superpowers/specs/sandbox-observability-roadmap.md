# Sandbox & Observability — roadmap

Captured 2026-07-19 from Blaine, in a live back-and-forth while playing. The
through-line: **Wander should become a home-lab — a sandbox where you can SEE
the living ecology and MANIPULATE it.** Sandbox now (all info on); eventually a
game about exploring and observing. Direct design influence to pursue:
**Scavenger's Reign** (the bio-strange, watch-the-ecology-live sensibility — the
glowing sporestalks already gesture at it).

Ordered roughly by how Blaine surfaced them; the QA batch at top is where he said
"let's wrap these up."

## Done this session (2026-07-19)

- **Debug readout** (backtick `` ` ``): seed (selectable → copyable), island
  name/shape/relief, fps, tick, your tile + elevation, biome census, live species
  census, critters afoot. `0800174`
- **Inspect always names the ground** underfoot ("loose scree underfoot") — never
  just "nothing grows within reach". `0800174`
- **Biodiversity over time**: `CensusLog` samples every plant kind's count over
  sim-time; the readout draws a sparkline of each kind's rise/fall, a trend mark,
  and a summary ("18 kinds · 2 arose · 0 lost") — watch succession, not a
  snapshot. `1450982`
- **`?warm=N`**: fast-forward N sim ticks before arrival (bounded 50k) — a
  screenshot aid and the seed of "run N generations first".

## Worlds, saves & identity (the QA batch)

- **Save everything, not just plants.** Today flora persists on reload (plants +
  tick, then capped catch-up); **critters regenerate from the seed** — same kinds,
  but individuals and positions reset. Trust/bonds persist; individual animals
  don't. Make saves whole: critter individuals + positions, companion, weather
  memory, explored map (already), camp (already).
- **Don't save by default.** Let someone explore many worlds freely. Prompt before
  losing the tab / leaving a world. **Auto-save once they've been in a world ~5
  min**; also a way to **explicitly save**.
- **Name your world.** A given name, not just the seed-derived island name.
- **Record time-in-world**, so important saves are obvious ("you've spent 2h here").
- **Picker discoverability + seed copy.** Blaine couldn't find the L picker for a
  long time; a click dismisses it before you can copy the seed. Want: a first-run
  nudge to the picker, a copy-seed affordance (backtick readout now covers copy).

## New-world controls (light levers → deeper)

- Not just random. Controls at creation: **size, geography type** (the shape/relief
  levers already exist as `?shape=` / relief), **game-type checkboxes**, and **how
  many generations to run before you start** (`?warm=N` is the mechanism).

## The home-lab (sandbox control)

- **Spawn / clone** critters & plants at will.
- **Modify behavior params & preferences** — palate, drives, size, role,
  favorite species — on a kind or an individual.
- **Release a bunch into a biome and watch** — they nest, forage, and drift over
  time. "Unleash and see what happens." Emergence as play.

## Deeper ecology & mode

- **Food-web ecology is going to have to be really deep** — the mutualism/grazer
  base (see [[wander-ecology-engine]]) is the start; layer real trophic structure.
- **Sandbox vs Mission.** Sandbox now: all info on, free manipulation. Eventually a
  **mission/observation game**: exploring and observing an ecology you don't fully
  control, Scavenger's-Reign-style.

## Design study to run

- **Scavenger's Reign** as a direct influence: what makes its ecology feel alien,
  legible, and alive without hand-holding; how observation (not control) drives its
  tension. Pull principles, then adapt.
