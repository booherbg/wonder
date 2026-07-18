# Living Island Implementation Plan (Phase 2)

> **For agentic workers:** Executed inline via superpowers:executing-plans in the same
> session that authored it (author retains full context; user asleep, pre-approved).
> Interfaces are exact; code detail lives in the implementation.

**Goal:** Flora with genetic drift, an inspect panel, foraging critters with dens, and
player gather/plant verbs — on top of the shipped phase-1 island.

**Spec:** `docs/superpowers/specs/2026-07-18-living-island-design.md`

## Global constraints (inherited + new)

- All phase-1 global constraints hold (zero runtime deps, strict TS, determinism,
  palette/config centralization, layering).
- New layering: `life/` may import `core/` + `world/` only. `render/` may import `life/`.
- Simulation budget: sim tick ≤ 400 plants processed; total plants ≤ 8000; critters ≤ 24.
- Sprite caches bounded (≤ 512 plant phenotypes).

## Tasks

### Task 1: `life/genome.ts` — genome, mutation, phenoKey (TDD)
- `interface Genome { form: PlantForm; hue: number; hue2: number; sat: number; height: number; spread: number; petals: number; leaves: number; lean: number; glow: number }`
- `enum PlantForm { Flower, Shrub, Tree, Fungus }`
- `GENOME_BOUNDS`, `mutate(g, rng, amount?): Genome` (clamped jitter, form preserved),
  `driftDistance(a, b): number`, `phenoKey(g): string` (quantized), `hsl(h, s, l): string`.
- Tests: determinism with same rng seed; bounds always respected; form never mutates;
  driftDistance(a, a) === 0 and grows with jitter; phenoKey stable under tiny jitter.

### Task 2: `life/species.ts` — species + names (TDD)
- `interface PlantSpecies { id: number; name: string; habitat: Tile; archetype: Genome; density: number; sport: boolean }`
- `generatePlantSpecies(seed): PlantSpecies[]` — 2–4 species per habitat
  (Grass, Forest, Sand, ShallowWater, Rock), exactly one sport per island,
  forest always includes ≥1 Tree-form species; deterministic.
- `speciesName(rng): string` — syllable pairs + trait epithet.
- Tests: determinism; habitat coverage; exactly one sport; names non-empty/capitalized;
  tree species present for Forest.

### Task 3: `life/flora.ts` — plant store + init + sim (TDD)
- `interface Plant { species: number; genome: Genome; x: number; y: number; born: number }`
- `class Flora { constructor(map, speciesList, seed); byTile: Map<number, Plant[]>; count;
  plantsInTile(tx, ty): Plant[]; plantsNear(x, y, radiusPx): Plant[];
  addPlant(p): boolean (capacity 3/tile, 8000 global, habitat check);
  removePlant(p): void; simTick(tick): void }`
- Init scatter: noise-patched (fbm) density per species habitat; genome = archetype
  drifted by smooth per-trait field over (x, y). Forest tree cover ~40% of forest tiles.
- simTick: seeded rng stream; processes ≤ 400 plants; mature plants reseed within
  3 tiles (habitat + capacity checked, mutated genome); plants past lifespan die.
- Tests: every placed plant sits on its habitat tile; per-tile/global caps hold;
  deterministic init; simTick reproduces only onto eligible tiles and never exceeds
  caps; deaths eventually occur (fast-forward many ticks).

### Task 4: `render/plantSprites.ts` — genome → pixel sprite (visual)
- `getPlantSprite(genome): HTMLCanvasElement` — cached by phenoKey (cap 512, clear on
  overflow). Draw functions per form: flower (leaning stem, leaf pairs, petal ring,
  accent core, glow halo pixels when glow > 0.8), shrub (blob cluster + berry dots),
  tree (trunk + layered canopy in genome hue — tall, up to 24px), fungus (stem + dome
  cap + spots). Verified by screenshot.

### Task 5: renderer integration — y-sorted entity pass
- Forest tile art loses its baked tree (mossy floor + speckle instead).
- `Renderer.draw(camX, camY, scene, timeMs)` where
  `scene = { player: {x,y} | null; flora: Flora | null; critters: Critter[] | null }`.
- Per visible tile row (top→bottom): draw that row's plants (anchor = base y), then
  critters with feet in the row, then player if its feet are in the row.
- Verified by screenshots (meadow, forest, shore, rock edge).

### Task 6: `life/fauna.ts` — critters (TDD for invariants)
- `interface CritterSpecies { id: number; name: string; bodyHue: number; earLen: number;
  tailLen: number; size: number; favoriteSpecies: number; den: {x,y} }`
- `generateCritterSpecies(seed, map, flora): CritterSpecies[]` — 3 species; den on a
  walkable tile near a cluster of favorites.
- `interface Critter { species: number; x; y; state: "idle"|"seek"|"nibble"|"home";
  target...; hopPhase }` + `updateCritter(c, dt, map, flora, speciesList, player, rng)`
  — walkability-safe movement, favorite-seeking within 8 tiles, nibble pauses,
  home drift when far, curiosity toward player within 3 tiles.
- `render/critterSprites.ts`: `getCritterSprites(species): [HTMLCanvasElement, HTMLCanvasElement]`
  (idle/hop frames) — round body, belly, ears, tail, dot eyes.
- Tests: dens walkable + favorites nearby; critters never move onto unwalkable tiles
  across many simulated seconds; favoriteSpecies always a real species id; determinism.

### Task 7: `render/inspect.ts` + `game/inventory.ts` + key wiring (TDD for inventory)
- Inventory (pure): `gather(inv, plant): Inv | null` (8 cap), `sow(inv): [Inv, Seed] | null`.
- Inspect panel: fixed DOM overlay; cards = 6× sprite canvas + name + trait words +
  drift note; opens with E (plants within 2.5 tiles), closes E/Esc.
- main.ts: keys E/F/G, sim timer (2s), HUD line (seed dots + key hints), critter update
  in frame loop.
- Tests: inventory cap/order round-trips; sow returns exact gathered genome.

### Task 8: Beauty pass + full verification
- Screenshot tour (spawn meadow, forest interior, shore, rock/snow edge, inspect panel
  open, critters near den) at 2+ seeds; tune species color ranges, densities, sprite
  shapes until it sings. `npm run check && npm test && npm run build` all green.
- Update README (controls, living-world blurb). Commit per task throughout.
