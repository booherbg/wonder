# The hotbar & the one Interact — a UX rework

*2026-07-20. Supersedes the soil-clod mechanic (dig/lay), which is removed.*

## Why

The world-verbs had grown disjointed: `G` gather, `F` sow, `T` dig, `B` lay —
four keys, four verbs, no through-line. Adding "till" would have made a fifth.
Blaine's question — *"why does `F` hoe? shouldn't there just be an Interact
when an item is selected?"* — is the fix. What you **hold** should decide what
a single Interact does. The `H` home key already works this way (beside camp it
builds a fire, then a bedroll, then sleeps; on open ground it sets home), so
this extends a pattern the game already has rather than importing a new one.

At the same time we simplify the garden: **drop the whole dig-a-clod-and-carry
mechanic.** Tilling needs no material now — a hoe and a press. This is the
"simplify for now" foundation; richer soil mechanics can return later on top of
it.

## The model

### One item model, one bar

Today there are two inventories — seeds (`Inventory { seeds: Seed[] }`, cap 8)
and materials (`mat: { wood, stone, rush, soil }`). Replace them with **one
hotbar of three functional slots** — hand, hoe, and a single seed pouch —
plus carried material counts that ride along off the bar:

```ts
type SlotName = "hand" | "hoe" | "pouch";
interface Varietal { species: number; genomes: Genome[] } // one seed kind, FIFO
interface Toolbar {
  selected: SlotName;       // which slot Interact uses
  bank: Varietal[];         // every seed varietal carried — all in the one pouch
  active: number | null;    // index into bank of the *loaded* varietal (null = empty pouch)
  materials: Record<"wood" | "stone" | "rush", number>;
}
```

- **Seeds never sprawl into a slot each.** Every varietal lives in the one
  pouch; only the **loaded** varietal (`active`) is offered to Interact.
- **Out means out.** Spend the loaded varietal and the pouch goes empty —
  `active` becomes `null`. It **never** rolls over to another kind, so you can't
  plant seeds you didn't mean to. Switching kinds is deliberate (the backpack,
  or a quick-swap key).
- **Genome memory kept** — a varietal is a species + a FIFO queue of the exact
  gathered genomes; planting pops the oldest (`inventory.ts:5` behaviour intact).
- **hand** and **hoe** are permanent (arrival supplies); the hand gathers, the
  hoe tills. **Materials** are plain carried counts — a small HUD readout and a
  backpack line, **not** hotbar slots.
- Built and unit-tested in `src/game/toolbar.ts` / `tests/toolbar.test.ts`.

### The one Interact

**`Space` = Interact**, acting on the selected slot. Resolution:

| selected slot | Interact does | target |
|---|---|---|
| `hand` | **gather** nearest gatherable in reach (material node, else nearest plant → a seed) | radius (`GATHER_RANGE` / `PLANT_REACH`) — unchanged feel |
| `hoe` | **till** the tile ahead if it is tillable & not already tilled | tile ahead (`player.x+6, y+2`) |
| `pouch` | **plant** the loaded varietal ahead if plantable & has room; pop its oldest seed. Empty pouch → nudge, plant nothing | tile ahead |

"Nothing happened" always gives a soft HUD nudge (e.g. "this ground is too hard
to till — grass, marsh, sand, or forest takes a hoe"; "out of that seed — load
another in your pack").

The old `G` `F` `T` `B` key branches are **deleted**; their logic moves behind
Interact, keyed on the selected slot.

### Selection & the rest of the hands

- `1` `2` `3` — jump to hand / hoe / pouch.
- `[` / `]` and the **mouse wheel** — cycle the selected slot ◀ / ▶ (no mouse
  handlers exist today, so the wheel is free).
- **Quick-swap the loaded varietal** (sub-decision for the input step): a key to
  cycle `active` among the bank without opening the backpack — likely re-pressing
  `3` when the pouch is already selected, or a dedicated key. Backpack is always
  the deliberate way.
- `Q` — toss one of the loaded seed to the wind (`tossLoaded`).
- `E` — examine (unchanged). **`Space` acts, `E` looks** — the clean split.
- `Space` must `preventDefault()` (it scrolls the page otherwise).

## The garden loop

- **Tillable** = the soft lowland ground: `Grass`, `Marsh`, `Sand`, `Forest`
  (the old `DIGGABLE` set). *Not* scree/highland — carrying soil up there was
  the removed clod mechanic's job; out of scope now (easy to re-add later).
- **Till:** `hoe` + Interact on tillable, untilled ground → the tile joins
  `flora.soilTiles` (the existing tilled-tile set — kept as-is).
- **Plant:** `pouch` + Interact plants the loaded varietal on **tilled ground
  (any seed, habitat waived)** *or* **its own wild habitat (untilled)**. This is
  exactly today's `sowableAt` (`flora.ts:278`) — no change needed; it already
  allows both. Planting pops the loaded varietal's oldest seed.
- **Spread (fill-the-plot):** in the flora reproduction step (`flora.ts:411`),
  a mature plant's child may root on an adjacent tile that is **tilled, empty,
  and has room — habitat waived** — in addition to today's habitat-gated wild
  reseeding. So a tilled plot fills itself with what you planted; to grow the
  garden you till more ground. Per-tile caps and crowding still apply.
- **Garden vigour follows tilled ground.** Today the repro ×2 bonus and the
  crowding-spare key off `inGarden` (a 3×3 around home, `flora.ts:183`).
  Generalise both to "on a tilled tile": tilled plants breed eagerly and are
  spared thinning. Home stays the camp/sleep anchor; the "garden" concept moves
  onto the tilled tiles.

## Removed

- `mat.soil` (the carried clod count) and its HUD/inspect lines.
- `T` dig / `B` lay key branches.
- `isDiggable` / `isLayable` / the `DIGGABLE` (reused as `TILLABLE`) & `LAYABLE`
  sets in `materials.ts` — keep a single `TILLABLE` predicate; drop `LAYABLE`.
- `placeMaterials` and wood/stone/rush gathering **stay** (fire/bedroll intact);
  they ride along as carried counts (HUD readout + backpack) and are still spent
  by the camp menu.
- The old per-species seed slots — seeds are one pouch now, not a slot each.

## Save & migration

- Tilled tiles already persist (`flora.soilTileKeys()` → the world blob's
  `soil` field) — **keep**. Tilling still produces tilled tiles.
- Drop the carried-clod save fields (`mat.soil`, `camp.soil`). Old saves: ignore
  them (a missing/legacy `soil` count reads as 0).
- Seeds: `restoreInventory` builds the pouch bank from the old `Seed[]`
  (`toolbar.migrate`, grouping by species). `hand`/`hoe` are always present.
- The loaded varietal / selected slot need not persist (rebuild on load, first
  kind loaded); persisting them is a nice-to-have.

## Rendering

- Replace the HUD's seed-dots + `carried` text (`main.ts:173-194`) with a
  **hotbar strip of three cells** — ✋ hand · 🪝 hoe · 👝 pouch — the selected
  cell highlighted. The pouch cell draws the loaded varietal's plant sprite
  (tinted by genome hue) with its count; an empty pouch shows a slack pouch.
  Beside it, a **small carried-materials readout** (wood/stone/rush counts, not
  selectable). Keep it in the same low, quiet HUD band.
- The legend shrinks to: `Space interact · 1·2·3 slot · E examine · Tab menu`,
  plus the contextual "what Space will do right now" tell (e.g. "till" / "plant
  marsh-fern" / "gather").
- Update `help.ts`: rewrite "the keys" and "your camp" sections to teach
  hold-then-Interact; delete the dig/lay/clod lines.

## Card consolidation — the one menu hub (full sweep, approved)

The `Tab` menu already has tabs (backpack · camp · isles · guide). Grow it into
**the** hub and retire the scattered top-level card keys:

- **Tabs:** Backpack · Camp · Isles · Web · Journal · Murmurs · Guide.
- **Removed as standalone keys:** `C` web, `J` journal, `M` murmurs, `L` isles,
  `N` name — all now reached through the menu. (`N` name lives under Camp/Isles.)
- **Kept as quick keys** (HUD/camera/meta, not cards): `K` minimap, `Z` focus,
  `P` postcard, `R` sail, `` ` `` debug, `?` guide *(the universal help
  convention — opens the menu's Guide tab)*, `Esc` close, plus the hands
  (`Space` · `1`–`9` · `[` `]` · wheel · `Q` · `E`).
- **In the menu:** `←`/`→` (or the tab's initial letter) switch tabs; `↑`/`↓`
  move a cursor; `Enter` acts; `Esc` closes. One consistent card grammar.

This is where the disjointed pile of letter-keys collapses into a single,
navigable hub — the other half of "clean it all up."

## The backpack — an 8-bit RPG screen (Final Fantasy VII styling)

The Backpack tab is a **classic JRPG inventory screen**, deliberately styled
after FF7's menus (the one intentional retro flourish against the game's quiet
painterliness — a "your gear" screen that feels like opening a menu in an old
RPG):

- **Frame:** a semi-transparent deep-blue gradient panel with a light 1px
  cyan/white border (the FF7 window look), sitting over a dimmed world.
- **List:** one row per stack — a small sprite/glyph, the name left-aligned, the
  quantity right-aligned after a colon (`fern seed…….:3`, FF7's dotted leader).
  Tools (hand, hoe) show as permanent rows with no count.
- **Cursor:** a `▸` hand-cursor points at the active row; `↑`/`↓` move it, and it
  stays in sync with the hotbar's `selected`.
- **Description line:** a sub-panel below shows the highlighted item's blurb —
  for a seed, its species and a one-line lineage tell (drifted hue, parent);
  for a material, what it's good for (fire, bedroll).
- **Actions:** `Enter` on a row offers a tiny sub-menu — **Select** (make it the
  active hotbar slot) and **Toss** (drop one, the old `Q`). Keep it to those two;
  "arrange" (reorder) is a nice-to-have, deferred.
- Rendered from the same `Toolbar` model as the HUD hotbar — one source of truth,
  two views (quick strip in-world, full screen in the menu).

It's a **view**, not new game state: selecting/tossing call the same
`toolbar.ts` ops the hotbar uses.

## Out of scope (later)

- Scree/highland tilling; a composter that produces soil; soil *types*;
  hotbar reordering ("arrange"). Later.

## Implementation sequence (TDD)

Input-independent core first, so any redirect on the key scheme stays cheap.

1. **`toolbar.ts`** — the `Slot`/`Toolbar` model + pure ops (`gatherSeed`,
   `gatherMaterial`, `plantAt`, `dropAt`, `cycle`, `selectIndex`, `migrate`).
   Unit-tested in isolation. ✅ **done** (`tests/toolbar.test.ts`, 12 green).
2. **`materials.ts`** — collapse to a single `isTillable`; delete dig/lay preds.
3. **`flora.ts`** — spread onto adjacent tilled tiles; generalise garden vigour
   to tilled tiles. Extend `tests/soil.test.ts` / `flora.test.ts`.
4. **`main.ts`** — the Interact resolver keyed on the selected slot, selection
   input (`1`–`9`, `[`/`]`, wheel), delete `G/F/T/B` branches, wire `Space` with
   `preventDefault`.
5. **HUD hotbar** rendering (the quick in-world strip).
6. **The menu hub** — grow `menu.ts` to the full tab set, fold in the standalone
   cards (web/journal/murmurs/isles/guide), retire their top-level keys.
7. **The FF7 backpack screen** — the Backpack tab: framed list, cursor,
   description sub-panel, Select/Toss sub-menu. Reads the `Toolbar` model.
8. **`help.ts`** rewrite + inspect-line cleanup to teach the new grammar.
9. **save.ts / `restoreInventory`** migration + a save round-trip test.
10. `npm test` + `npm run check` green; drive it in the real app (`run` /
    `npm run shot`) — till, plant on tilled and wild habitat, watch a plot fill,
    open the backpack, walk the menu tabs.

## Success criteria

- One key (`Space`) does the right world-action given the held slot; `G/F/T/B`
  are gone and nothing references dig/lay/clod.
- Seeds and materials stack; `1`–`9`/`[`/`]`/wheel select; the selected slot is
  visible in the hotbar.
- Till (hoe) → plant (seed) on tilled; plant also works on wild habitat.
- A planted tilled plot visibly fills with its own kind over time.
- One `Tab` hub holds every card (backpack/camp/isles/web/journal/murmurs/guide);
  the standalone `C`/`J`/`M`/`L`/`N` keys are gone, navigation is consistent.
- The Backpack tab is a framed FF7-style screen: cursor, quantities, a
  description line, and a Select/Toss sub-menu, driven by the `Toolbar` model.
- Old saves load without error; the full suite stays green.
