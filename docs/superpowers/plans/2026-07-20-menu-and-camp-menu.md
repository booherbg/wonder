# Menu & Camp Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline, this session) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A real menu (`Tab`) that tucks away the non-immediate actions and holds a backpack; and, when you're at your camp, a camp menu showing what's here, the buildable camp actions with their requirements, and a deliberate "abandon camp."

**Architecture:** One `#menu` panel (same id-toggled pattern as `#picker`/`#help`). A pure `menu.ts` builds its rows: launcher rows (each naming its shortcut key) for the tucked-away panels, a backpack section (seeds + materials carried), and — only when at camp — a camp section reusing `campLines` plus **camp-action rows** whose labels quote the true `FIRE_COST`/`BEDROLL_COST` and grey out when unaffordable/already built. The build actions call the SAME `tryBuildFire`/`tryBuildBedroll` the `H` key uses (extracted for DRY). The HUD legend slims to the immediate verbs + `Tab menu`.

**Tech Stack:** TypeScript, Vite, Vitest, canvas. Panels are `<div id>` toggled via `style.display`.

## Global Constraints

- Match the existing panel idiom: `openMenu(...)`, `closeMenu()`, `isMenuOpen()` in `src/render/menu.ts`; reuse the `anth-title`/`anth-epigraph`/`anth-hint` and `isle-row` CSS families.
- Opening the menu closes every other panel and hushes murmurs, exactly like the other panels' key handlers.
- Keep the direct-key shortcuts working (`L`,`?`,`P`,`N`,`M`,`J`,`Q`); the menu is an additional discoverable surface, not a replacement. Only the HUD legend slims.
- Recipe costs come from `materials.ts` (`FIRE_COST`, `BEDROLL_COST`) — never hard-code the numbers; the menu must read them so it can't drift from the code (same discipline as the help card).
- `npx tsc` clean + `npx vitest run` green before each commit; eyeball with `npm run shot`.
- Commit trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
  and `Claude-Session: https://claude.ai/code/session_01ESuzCu8BorD1cYDQJ2zNSt`

## File Structure

- `src/render/menu.ts` (create) — pure row builders (`campActionRows`, `menuLaunchers`) + `openMenu`/`closeMenu`/`isMenuOpen`.
- `index.html` (modify) — add `<div id="menu">` and its CSS (mostly reused classes + a `menu-row`).
- `src/game/main.ts` (modify) — extract `tryBuildFire`/`tryBuildBedroll` (shared with `H`), wire `Tab` to toggle the menu, route menu handlers, slim the HUD legend, add abandon-camp.
- `src/render/help.ts` (modify) — add a `Tab` row for the menu.

---

### Task 1: Pure menu row builders

**Files:**
- Create: `src/render/menu.ts`
- Test: `tests/menu.test.ts`

**Interfaces (Produces):**
- `interface MenuAction { key: string; label: string; }`
- `menuLaunchers(pouchCount: number): MenuAction[]` — the tucked-away actions with their shortcut keys: isles (`L`), field guide (`?`), murmurs (`M`), journal (`J`), postcard (`P`), name world (`N`), and — only when `pouchCount > 0` — toss a seed (`Q`).
- `interface CampActionRow { id: "fire" | "bedroll"; label: string; ready: boolean; done: boolean; }`
- `campActionRows(mat: { wood: number; stone: number; rush: number }, fire: boolean, bedroll: boolean, cost: { fire: { wood: number; stone: number }; bedroll: { wood: number; rush: number } }): CampActionRow[]` — e.g. fire → `{ id:"fire", label:"make a fire — 4 driftwood · 3 stones", ready: mat.wood>=4 && mat.stone>=3, done: fire }`. When `done`, label reads "a fire, burning every night". Bedroll analogous ("weave a bedroll — 2 driftwood · 4 rushes" / "a bedroll of woven rushes").

- [ ] **Step 1: Write failing tests**

```ts
import { expect, test } from "vitest";
import { campActionRows, menuLaunchers } from "../src/render/menu";
import { BEDROLL_COST, FIRE_COST } from "../src/game/materials";

const cost = { fire: FIRE_COST, bedroll: BEDROLL_COST };

test("launchers name each tucked-away action and its key; toss only with seeds", () => {
  const none = menuLaunchers(0).map((a) => a.key);
  expect(none).toEqual(["L", "?", "M", "J", "P", "N"]);
  expect(menuLaunchers(2).map((a) => a.key)).toContain("Q");
});

test("a fire action greys out until you carry enough, and quotes the true cost", () => {
  const broke = campActionRows({ wood: 0, stone: 0, rush: 0 }, false, false, cost)[0];
  expect(broke.id).toBe("fire");
  expect(broke.ready).toBe(false);
  expect(broke.label).toContain(`${FIRE_COST.wood} driftwood`);
  expect(broke.label).toContain(`${FIRE_COST.stone} stones`);
  const flush = campActionRows({ wood: 9, stone: 9, rush: 9 }, false, false, cost)[0];
  expect(flush.ready).toBe(true);
});

test("a built camp action reads as done, not as a recipe", () => {
  const rows = campActionRows({ wood: 9, stone: 9, rush: 9 }, true, true, cost);
  expect(rows.find((r) => r.id === "fire")!.done).toBe(true);
  expect(rows.find((r) => r.id === "fire")!.label).toContain("burning every night");
  expect(rows.find((r) => r.id === "bedroll")!.label).toContain("woven rushes");
});
```

- [ ] **Step 2: Run — expect FAIL.** `npx vitest run tests/menu.test.ts`
- [ ] **Step 3: Implement** `menuLaunchers` and `campActionRows` (pure).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** (`feat: pure menu + camp-action row builders`).

---

### Task 2: The `#menu` panel — DOM, CSS, render

**Files:**
- Modify: `index.html` (add `<div id="menu">` after `#help`; CSS block mirroring `#picker`, plus `.menu-row` (clickable, like `isle-row`) and a `.menu-row.disabled` greyed state, and a `.menu-key` right-aligned like `help-key`).
- Modify: `src/render/menu.ts` — `openMenu`, `closeMenu`, `isMenuOpen`.

**Interfaces (Produces):**
- `isMenuOpen(): boolean`, `closeMenu(): void`
- `interface MenuModel { pouch: { name: string }[]; mat: { wood: number; stone: number; rush: number }; camp?: { lines: string[]; actions: CampActionRow[] }; }`
- `interface MenuHandlers { launch: (key: string) => void; build: (id: "fire" | "bedroll") => void; abandon: () => void; }`
- `openMenu(model: MenuModel, handlers: MenuHandlers): void` — renders: title "menu"; a **your camp** section (only if `model.camp`) with the `lines` and the `actions` as rows (greyed when `!ready`, click → `handlers.build(id)` when `ready && !done`), plus an "abandon camp" row (two-click confirm: first click swaps its text to "click again to abandon", second click → `handlers.abandon()`); a **backpack** section listing materials carried (`wood/stone/rush` when > 0) and pouch seed names (or "empty"); an **actions** section from `menuLaunchers(pouch.length)`, each row `label` + right-aligned `key`, click → `handlers.launch(key)`; a hint "Tab or Esc to close".

- [ ] **Step 1:** Add the DOM + CSS to `index.html`.
- [ ] **Step 2:** Implement `openMenu`/`closeMenu`/`isMenuOpen`. (No unit test for the DOM render — verified by shot in Task 5; the pure builders are already tested.)
- [ ] **Step 3: Commit** (`feat: #menu panel — backpack, camp, and a launcher for the tucked-away actions`).

---

### Task 3: Extract `tryBuildFire`/`tryBuildBedroll`; wire `Tab`, handlers, HUD legend

**Files:**
- Modify: `src/game/main.ts`

**Details:**
- Extract the fire/bedroll build logic currently inline in the `H` handler into `tryBuildFire(): boolean` and `tryBuildBedroll(): boolean` (mutate `mat`/`fire`/`bedroll`, `flashHud`, `murmurs.offer`, `persist`, `renderHud`; return whether built). Refactor the `H` handler to call them. **Refactor step — behavior identical; existing camp behavior must not change.**
- Add a `Tab` key branch (with `e.preventDefault()`): if `isMenuOpen()` close it, else close all other panels + `hushMurmur` and `openMenu(model, handlers)`. Build `model` from current state: pouch = `inventory.seeds.map(s => ({name: species[s.species].name}))`, `mat`, and — when `home` and player within camp range (same `Math.hypot(home - itx/ity) <= 2.5` test used in inspect) — `camp: { lines: campLines(campView), actions: campActionRows(mat, fire, bedroll, {fire:FIRE_COST,bedroll:BEDROLL_COST}) }`.
- Handlers: `launch(key)` maps to the existing open functions (`L`→picker, `?`→help, `M`→anthology, `J`→almanac, `P`→postcard, `N`→name, `Q`→toss); `build(id)` → `tryBuildFire()`/`tryBuildBedroll()` then re-`openMenu` to refresh; `abandon()` → clear `home`/`fire`/`bedroll`, `flora.setHome(null)` — wait, `setHome(null)` clears the garden — then `persist()`, `flashHud("you strike camp — the ground goes wild again")`, `closeMenu()`.
- Slim the HUD legend array to the immediate verbs + the menu: `["E inspect","G gather","F sow","Z focus","H home","Tab menu"]`. (The pouch `Q toss` addend stays as-is.)
- Add `Tab` to the `keys.add`/movement exclusion so holding Tab doesn't register as movement (it won't — it's not w/a/s/d — but ensure `preventDefault` and early `return`).

- [ ] **Step 1:** Extract `tryBuildFire`/`tryBuildBedroll`; refactor `H`. Run full suite (esp. `tests/camp.test.ts`) — green (pure refactor).
- [ ] **Step 2:** Wire `Tab`, handlers, and the slimmed HUD legend.
- [ ] **Step 3:** `npm run check` clean; `npx vitest run` green.
- [ ] **Step 4: Commit** (`feat: Tab opens the menu; H shares its build path; HUD legend slims`).

---

### Task 4: Help card — name the menu

**Files:**
- Modify: `src/render/help.ts`
- Test: `tests/help.test.ts` (extend)

- [ ] **Step 1:** Add a failing assertion: the keys section has a `Tab` row whose text mentions "menu".
- [ ] **Step 2:** Run — FAIL.
- [ ] **Step 3:** Add `{ key: "Tab", text: "the menu — your backpack, the isles, and the field guide" }` near the top of the keys section.
- [ ] **Step 4:** Run — PASS.
- [ ] **Step 5: Commit** (`docs: the field guide names the Tab menu`).

---

### Task 5: Eyeball + verify end to end

- [ ] **Step 1:** `npm run shot -- "seed=1&at=71,187" shots/menu.png 2200 900 1000 "Escape,Tab"` — Read the PNG; confirm the menu opens with backpack + launcher rows. (At 71,187 there's no camp, so no camp section — that's correct.)
- [ ] **Step 2:** Build a camp first, then screenshot the camp menu: `npm run shot` driving `Escape` then walking onto grass and pressing `H` then `Tab` — OR use a seed/spot with a saved camp. Confirm the camp section shows `campLines` + fire/bedroll action rows (greyed, quoting costs) + abandon. Iterate on CSS until it reads cleanly.
- [ ] **Step 3:** Full `npx vitest run` green, `npm run build` succeeds.
- [ ] **Step 4: Commit** if any CSS/polish tweaks (`polish: camp menu layout`).

---

## Self-Review

- **Spec coverage:** §1 menu panel + backpack + isles/help launcher → Tasks 1-3; `G`=gather already shipped; secondary-actions (postcards/name/murmurs/journal) folded into the one menu (open-Q #1 lean). §2 camp menu (what's here + abandon) → Tasks 2-3; camp-zone growth (open-Q #3) DEFERRED (radius rendering is its own piece; the menu frame lands first). §3 camp-actions with greyed requirements → Task 1 (`campActionRows`) + Task 2 render.
- **Deferred (later plans):** soil dig/carry (§4), felling/clearing + origin story (§5), composter (§4), camp-zone growth (§2), fire-sparkle-by-wood-kind (§3), any-wood/more-stone-sources (§3). These want the menu as their home, which this plan builds.
- **Type consistency:** `MenuAction`, `CampActionRow`, `MenuModel`, `MenuHandlers` defined in Task 1-2 and consumed in Task 3; `tryBuildFire`/`tryBuildBedroll` shared by `H` and the menu.
- **Risk:** `Tab` default focus behavior — `e.preventDefault()` on the Tab branch. Abandon-camp is destructive — two-click confirm guards it.
