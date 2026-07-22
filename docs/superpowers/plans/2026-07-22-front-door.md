# The Front Door (title screen) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the front-door title screen that shows on every load — a live rich-biome island backdrop under the **WONDER** wordmark with rows `continue · a new island · the isles you've known · the simulator · the field guide` — routing each to its mode, with the build version visible at its foot.

**Architecture:** The backdrop is not a new render loop — it is a **real curated island booted live**, with the menu overlaid on top. On a normal load `main.ts` boots the game on a fixed `BACKDROP_SEED` with a `titleActive` flag that hides the HUD, gates player input, drifts the camera, and mounts the `#title` overlay. Choosing a row clears `titleActive` and runs the action against `main.ts`'s existing locals (`loadWorld`, `openIslePicker`, `openHelp`, or a reload into the simulator). One flag, `?nomenu=1`, skips the whole front door and restores today's exact boot — so deep-links, dev aids, and the screenshot harness are unchanged behind it.

**Tech Stack:** TypeScript, Vite, Vitest (node env — no DOM/localStorage in tests), HTML5 canvas. Pure logic is TDD'd; rendered surfaces are verified with `npm run shot` (the repo's established practice — cf. `help.ts`/`menu.ts` test the data, screenshots verify the pixels).

## Global Constraints

- **Determinism:** no `Math.random`/`Date.now`/`new Date()` in game/sim logic. The one sanctioned `Math.random` is `randomSeed()` (`main.ts`). Camera drift is view-only and may read the rAF `timeMs`; it must not feed the sim.
- **Every load shows the title** unless `?nomenu=1` is present. Behind `?nomenu=1`, boot is byte-for-byte today's: `?sim=1` → `startSimulator()`; else `loadWorld(seedFromUrl() ?? newIslandSeed())`.
- **The backdrop is never a played session:** while `titleActive`, do NOT write `wonder.lastSeed` and do NOT `persist()`.
- **Art:** all new UI uses the codex `:root` tokens already in `index.html`. Copy is lowercase, evocative (match `menu.ts`/`help.ts` voice).
- **Storage keys** are `wander.*` (existing convention): the new one is `wander.lastSeed`.
- **Commits:** frequent; end every commit message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Verify before "done":** `npm run check` (tsc) clean, `npx vitest run` green, `npm run build` clean.
- **Scope:** `a new island` rolls a fresh island directly in this plan; **Plan B (the forge)** replaces that row's action with the params panel. The `simulator` row launches today's v1 simulator — building out the full sandbox is its own separate spec.

---

### Task 1: The last-played pointer (pure parse + key)

Mirrors the `resolveChains`/`CHAINS_KEY` pattern in `src/game/flags.ts`: a pure parser is unit-tested here; the `localStorage` read/write is wired inline in `main.ts` in Task 4.

**Files:**
- Modify: `src/game/flags.ts` (add `LAST_SEED_KEY` + `parseLastSeed`)
- Test: `tests/flags.test.ts` (extend)

**Interfaces:**
- Produces: `LAST_SEED_KEY: string` (`"wander.lastSeed"`); `parseLastSeed(stored: string | null): number | null` — a non-negative integer or `null`.

- [ ] **Step 1: Write the failing tests** — append to `tests/flags.test.ts`:

```ts
import { LAST_SEED_KEY, parseLastSeed } from "../src/game/flags";

test("LAST_SEED_KEY is the wander-namespaced key", () => {
  expect(LAST_SEED_KEY).toBe("wander.lastSeed");
});

test("parseLastSeed reads a stored non-negative integer", () => {
  expect(parseLastSeed("42")).toBe(42);
  expect(parseLastSeed("0")).toBe(0);
});

test("parseLastSeed rejects absent / non-integer / negative values", () => {
  expect(parseLastSeed(null)).toBeNull();
  expect(parseLastSeed("")).toBeNull();
  expect(parseLastSeed("abc")).toBeNull();
  expect(parseLastSeed("3.5")).toBeNull();
  expect(parseLastSeed("-1")).toBeNull();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/flags.test.ts`
Expected: FAIL — `parseLastSeed`/`LAST_SEED_KEY` are not exported.

- [ ] **Step 3: Implement in `src/game/flags.ts`** (append):

```ts
// The last island entered, remembered so the front door can offer "continue".
// Written by main.ts on world entry (never for the title backdrop); read here.
export const LAST_SEED_KEY = "wander.lastSeed";

export function parseLastSeed(stored: string | null): number | null {
  if (stored === null || stored === "") return null;
  const n = Number(stored);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/flags.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/flags.ts tests/flags.test.ts
git commit -m "feat: the wander.lastSeed pointer + parseLastSeed (front door 'continue')

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The title rows model (pure)

The menu's rows, as data — which rows show and their labels — decoupled from the DOM, exactly as `menu.ts` splits `menuLaunchers()` from `openMenu()`.

**Files:**
- Create: `src/render/title.ts`
- Test: `tests/title.test.ts`

**Interfaces:**
- Produces: `type TitleRowId = "continue" | "new" | "isles" | "sim" | "guide"`; `interface TitleRow { id: TitleRowId; label: string }`; `interface TitleState { lastSeed: number | null; lastName: string | null; savedCount: number }`; `titleRows(state: TitleState): TitleRow[]`.

- [ ] **Step 1: Write the failing test** — `tests/title.test.ts`:

```ts
import { expect, test } from "vitest";
import { titleRows } from "../src/render/title";

test("a returning wanderer sees all five rows in order", () => {
  const rows = titleRows({ lastSeed: 42, lastName: "Orka Cay", savedCount: 3 });
  expect(rows.map((r) => r.id)).toEqual(["continue", "new", "isles", "sim", "guide"]);
  expect(rows[0].label).toBe("continue — Orka Cay");
  expect(rows[1].label).toBe("a new island");
});

test("no last island: 'continue' is hidden", () => {
  const rows = titleRows({ lastSeed: null, lastName: null, savedCount: 2 });
  expect(rows.map((r) => r.id)).toEqual(["new", "isles", "sim", "guide"]);
});

test("no saved isles: 'the isles you've known' is hidden", () => {
  const rows = titleRows({ lastSeed: 42, lastName: "Orka Cay", savedCount: 0 });
  expect(rows.map((r) => r.id)).toEqual(["continue", "new", "sim", "guide"]);
});

test("a true first visit: only new, simulator, guide", () => {
  const rows = titleRows({ lastSeed: null, lastName: null, savedCount: 0 });
  expect(rows.map((r) => r.id)).toEqual(["new", "sim", "guide"]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/title.test.ts`
Expected: FAIL — module `src/render/title.ts` does not exist.

- [ ] **Step 3: Implement `src/render/title.ts`** (rows model only — DOM comes in Task 3):

```ts
// The front door (title screen): the rows are data (this file, testable),
// the screen is DOM (below, Task 3) — the split menu.ts uses.

export type TitleRowId = "continue" | "new" | "isles" | "sim" | "guide";

export interface TitleRow {
  id: TitleRowId;
  label: string;
}

export interface TitleState {
  lastSeed: number | null; // the island last entered, if any
  lastName: string | null; // its name, for the continue row
  savedCount: number; // how many isles are saved (the picker's size)
}

// Which rows the front door offers, in order. Empty rows are absent, never
// greyed — the menu only ever shows what's real.
export function titleRows(state: TitleState): TitleRow[] {
  const rows: TitleRow[] = [];
  if (state.lastSeed !== null) {
    rows.push({ id: "continue", label: `continue — ${state.lastName ?? "your island"}` });
  }
  rows.push({ id: "new", label: "a new island" });
  if (state.savedCount > 0) rows.push({ id: "isles", label: "the isles you've known" });
  rows.push({ id: "sim", label: "the simulator" });
  rows.push({ id: "guide", label: "the field guide" });
  return rows;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/title.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/render/title.ts tests/title.test.ts
git commit -m "feat: the front door's rows, as testable data (titleRows)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: The title overlay DOM + CSS (screenshot-gated)

Build the on-screen menu and verify its look over a live island, using a **temporary** `?title=1` dev mount so the overlay can be screenshotted before the real boot wiring (Task 4) exists.

**Files:**
- Modify: `src/render/title.ts` (add `showTitle`/`hideTitle`/`isTitleOpen`)
- Modify: `index.html` (add `#title` markup + CSS)
- Modify: `src/game/main.ts` (temporary `?title=1` mount — removed in Task 4)

**Interfaces:**
- Consumes: `titleRows` (Task 2); `formatStamp` from `../version`.
- Produces: `interface TitleHandlers { choose: (id: TitleRowId) => void }`; `showTitle(state: TitleState, handlers: TitleHandlers): void`; `hideTitle(): void`; `isTitleOpen(): boolean`.

- [ ] **Step 1: Add the overlay markup to `index.html`** — inside `<body>`, after the `#menu` element:

```html
    <div id="title">
      <div class="title-wordmark">WONDER</div>
      <div class="title-tagline">a living island, wandered</div>
      <div class="title-rows"></div>
      <div class="title-stamp"></div>
    </div>
```

- [ ] **Step 2: Add the CSS to `index.html`** — in the `<style>` block, after the `#menu` rules:

```css
      #title {
        display: none;
        position: fixed; inset: 0; z-index: 20;
        flex-direction: column; align-items: center; justify-content: center;
        gap: 4px;
        background: radial-gradient(120% 90% at 50% 42%, rgba(var(--abyss), 0.35), rgba(var(--abyss), 0.86));
        font-family: var(--serif);
      }
      #title.on { display: flex; }
      #title .title-wordmark {
        font-variant: small-caps; letter-spacing: 0.18em; font-size: 64px;
        color: var(--ink-bright); text-shadow: 0 0 34px rgba(var(--lumen), 0.4);
      }
      #title .title-tagline {
        font: italic 15px var(--serif); color: rgba(228, 236, 242, 0.7); margin-bottom: 26px;
      }
      #title .title-rows { display: flex; flex-direction: column; gap: 2px; min-width: 320px; }
      #title .title-row {
        display: block; text-align: center; cursor: pointer;
        font: 18px var(--serif); color: rgba(228, 236, 242, 0.82);
        padding: 9px 16px; border-radius: var(--radius);
      }
      #title .title-row:hover {
        color: var(--ink-bright);
        background: rgba(var(--lumen), 0.08);
        box-shadow: inset 0 0 0 1px rgba(var(--lumen), 0.22);
      }
      #title .title-stamp {
        margin-top: 26px; font: 10px var(--mono); letter-spacing: 0.04em;
        color: rgba(var(--lumen), 0.32); user-select: text;
      }
```

- [ ] **Step 3: Implement `showTitle`/`hideTitle`/`isTitleOpen`** — append to `src/render/title.ts`:

```ts
import { formatStamp } from "../version";

export interface TitleHandlers {
  choose: (id: TitleRowId) => void;
}

function panel(): HTMLElement {
  return document.getElementById("title")!;
}

export function isTitleOpen(): boolean {
  return panel().classList.contains("on");
}

export function hideTitle(): void {
  panel().classList.remove("on");
}

// The front door, mounted: the rows for this wanderer's state, each a door.
export function showTitle(state: TitleState, handlers: TitleHandlers): void {
  const el = panel();
  const rows = el.querySelector(".title-rows") as HTMLElement;
  rows.innerHTML = "";
  for (const r of titleRows(state)) {
    const row = document.createElement("div");
    row.className = "title-row";
    row.textContent = r.label;
    row.addEventListener("click", () => handlers.choose(r.id));
    rows.appendChild(row);
  }
  (el.querySelector(".title-stamp") as HTMLElement).textContent = formatStamp();
  el.classList.add("on");
}
```

- [ ] **Step 4: Add the TEMPORARY dev mount** — in `src/game/main.ts`, immediately after the `?isles` dev-aid line (~1336), add:

```ts
// TEMPORARY (removed in Task 4): screenshot the title overlay over a live island
if (new URL(location.href).searchParams.has("title")) {
  import("../render/title").then(({ showTitle }) =>
    showTitle(
      { lastSeed: currentSeed, lastName: islandName(currentSeed), savedCount: 3 },
      { choose: (id) => console.log("chose", id) },
    ),
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected: exit 0, no errors.

- [ ] **Step 6: Screenshot the overlay and inspect it**

Run: `node scripts/shot.mjs "seed=42&title=1" scratchpad/title.png 2600 960 1000 "Escape"`
Then open `scratchpad/title.png`. Expected: the **WONDER** wordmark + tagline over a live island, five centered rows (`continue — Ilma Reach` … through `the field guide`), and the dim version stamp at the foot. Confirm legibility over the scene (the vignette darkens it). Adjust CSS values if needed and re-shoot. (Put the PNG under `scratchpad/` — do not commit it.)

- [ ] **Step 7: Commit** (overlay only; the temp mount rides along and is removed next task)

```bash
git add src/render/title.ts index.html src/game/main.ts
git commit -m "feat: the front-door overlay — WONDER wordmark, codex rows, version stamp

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Boot routing, the live backdrop, and row wiring

Make the front door real: gate boot on `?nomenu=1`, boot a curated backdrop island with `titleActive` on, hide the HUD + gate input + drift the camera, wire each row to its action, and record `wonder.lastSeed` on genuine world entry.

**Files:**
- Modify: `src/game/main.ts` (boot routing, `titleActive`, guards, handlers, camera drift, lastSeed plumbing)
- Modify: `index.html` (HUD-hide CSS while titling)

**Interfaces:**
- Consumes: `showTitle`/`hideTitle`/`isTitleOpen`/`TitleRowId` (Task 3); `parseLastSeed`/`LAST_SEED_KEY` (Task 1); existing locals `loadWorld`, `newIslandSeed`, `openIslePicker`, `openHelp`, `persist`, `frame`, `renderer`, `map`, `currentSeed`, `islandName`, `savedIndex`.

- [ ] **Step 1: Remove the temporary mount** from Task 3 (the `?title` block in `main.ts`).

- [ ] **Step 2: Add imports + the `titleActive` flag + lastSeed plumbing** near the top of the game `else`-block (after the `import`s / early consts in `main.ts`):

```ts
import { LAST_SEED_KEY, parseLastSeed } from "./flags"; // extend the existing flags import
import { showTitle, hideTitle, isTitleOpen, TitleRowId } from "../render/title";

const BACKDROP_SEED = 42; // a lush, high-diversity island; tune by screenshot in Step 9
const BACKDROP_WARM = 1200; // heartbeats pre-run so it greets you already alive

let titleActive = false; // true only while the front door is up over its backdrop

function readLastSeed(): number | null {
  try { return parseLastSeed(localStorage.getItem(LAST_SEED_KEY)); } catch { return null; }
}
function writeLastSeed(seed: number): void {
  try { localStorage.setItem(LAST_SEED_KEY, String(seed)); } catch { /* storage off */ }
}
```

- [ ] **Step 3: Guard `lastSeed` write inside `loadWorld`** — in `loadWorld` (after `currentSeed = seed;`, ~line 768), add:

```ts
  if (!titleActive) writeLastSeed(seed); // the backdrop is not a played session
```

- [ ] **Step 4: Guard `persist()`** — at the very top of `persist()` (~line 696), add:

```ts
  if (titleActive) return; // never autosave the title backdrop
```

- [ ] **Step 5: Gate player input while titling** — in the keydown handler and the per-frame player update, early-return when the title (or its help) is up. At the top of the main `keydown` listener body add `if (titleActive) return;` and in `frame()`'s player-movement section guard the movement with `if (!titleActive)`. (Anchor: the same places that already bail when a codex panel is open.)

- [ ] **Step 6: Drift the camera while titling** — in `frame(now)`, where `lastCamX`/`lastCamY` are set for the normal player-follow, branch:

```ts
  if (titleActive) {
    const cx = (map.width / 2) * TILE_SIZE, cy = (map.height / 2) * TILE_SIZE;
    lastCamX = cx - renderer.viewWidth / 2 + Math.sin(now / 9000) * 60;
    lastCamY = cy - renderer.viewHeight / 2 + Math.cos(now / 11000) * 40;
  } else {
    /* ...existing player-follow camera... */
  }
```

- [ ] **Step 7: Hide the HUD while titling** — add to `index.html` `<style>`:

```css
      body.titling #hud, body.titling #seed-label, body.titling #dev { display: none !important; }
```

- [ ] **Step 8: Replace the boot tail with the front-door router.** Ordering matters: `titleActive` must be set *before* the backdrop `loadWorld` (so the lastSeed/persist guards fire), and `renderer` must be constructed *after* the first `loadWorld` (it needs a `map`) but *before* any `renderer.setMap`. Replace the boot block — from `loadWorld(seedFromUrl() ?? newIslandSeed())` (~1320) through the first-visit `SEEN_KEY` block (~1348) — with:

```ts
const NOMENU = new URL(location.href).searchParams.has("nomenu");

// establish `map` (and, for the title, its backdrop). titleActive is set FIRST
// so loadWorld's lastSeed write + persist() are both skipped for the backdrop.
if (!NOMENU) { titleActive = true; document.body.classList.add("titling"); }
loadWorld(NOMENU ? (seedFromUrl() ?? newIslandSeed()) : BACKDROP_SEED);
```

Then keep the existing `const renderer = new Renderer(canvas, map);` line here (it already sits just after the boot load). Immediately after it:

```ts
if (NOMENU) {
  // today's exact dev/deep-link behavior — the ?at/?inspect/?journal/?isles aids ride here
  const at = new URL(location.href).searchParams.get("at");
  if (at) { const [tx, ty] = at.split(",").map(Number);
    if (Number.isFinite(tx) && Number.isFinite(ty)) { player.x = (tx + 0.5) * TILE_SIZE; player.y = (ty + 0.5) * TILE_SIZE; } }
  if (new URL(location.href).searchParams.has("inspect")) openInspectAtPlayer();
  if (new URL(location.href).searchParams.has("journal")) openAlmanac();
  if (new URL(location.href).searchParams.has("isles")) openIslePicker();
} else {
  for (let i = 0; i < BACKDROP_WARM; i++) flora.simTick(); // greet the wanderer already alive
  const last = readLastSeed();
  showTitle(
    { lastSeed: last, lastName: last === null ? null : islandName(last), savedCount: savedIndex().length },
    { choose: onChoose },
  );
}

function leaveTitle(): void {
  titleActive = false;
  document.body.classList.remove("titling");
  hideTitle();
}

function onChoose(id: TitleRowId): void {
  if (id === "sim") { const u = new URL(location.href); u.searchParams.set("sim", "1"); location.href = u.toString(); return; }
  if (id === "guide") { openHelp(); return; } // over the backdrop; Esc returns to the title
  leaveTitle(); // titleActive now false → the loads below record lastSeed + the camera follows the player
  if (id === "continue") { const s = readLastSeed(); if (s !== null) { loadWorld(s); renderer.setMap(map); } }
  else if (id === "new") { loadWorld(newIslandSeed()); renderer.setMap(map); } // Plan B: open the forge instead
  else if (id === "isles") { openIslePicker(); } // its pick handler loadWorld+setMap's; cancel lands you on the (playable) backdrop — acceptable v1
}
```

Note: `onChoose`/`leaveTitle` are function declarations, so they hoist — referencing `onChoose` in the `showTitle` call above them is fine. The `?at`/`?inspect`/`?journal`/`?isles` aids move *inside* the `NOMENU` branch (they are screenshot-tour aids that ride behind `nomenu`); delete their old copies at ~1322–1336.

- [ ] **Step 9: Typecheck, then screenshot both paths**

```
npm run check
node scripts/shot.mjs "" scratchpad/frontdoor.png 3000 960 1000 ""
node scripts/shot.mjs "nomenu=1&seed=42" scratchpad/world.png 2500 960 640 "Escape"
```
Expected: `frontdoor.png` — the title over a lush, living island (tune `BACKDROP_SEED`/`BACKDROP_WARM` until it reads rich); `world.png` — drops straight into island 42 with the normal HUD, no menu. Open both to confirm.

- [ ] **Step 10: Verify the mode routes by hand** (dev server): `npm run dev`, then at `/` click each row — `continue`/`a new island` drop into a world with the HUD back; `the field guide` opens over the backdrop and `Esc` returns to the title; `the isles you've known` opens the picker; `the simulator` reloads into `?sim=1`. Confirm `wander.lastSeed` is set only after entering a world (DevTools ▸ Application ▸ Local Storage), never for the backdrop.

- [ ] **Step 11: Commit**

```bash
git add src/game/main.ts index.html
git commit -m "feat: the front door boots — live backdrop, gated input, rows wired, lastSeed recorded

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: The screenshot harness skips the menu

So every existing `npm run shot` invocation keeps landing in-world without a per-call change.

**Files:**
- Modify: `scripts/shot.mjs`

**Interfaces:**
- Consumes: the `?nomenu=1` gate (Task 4).

- [ ] **Step 1: Append `nomenu=1` to the harness query** — in `scripts/shot.mjs`, where `query` is built from `rawQuery` (~line 30), ensure `nomenu=1` is always present:

```js
const base = rawQuery ? (rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery) : "";
const params = new URLSearchParams(base);
params.set("nomenu", "1"); // the harness always skips the front door
const query = "?" + params.toString();
```

- [ ] **Step 2: Verify a plain shot lands in-world (not on the menu)**

Run: `node scripts/shot.mjs "seed=42" scratchpad/harness.png 2500 960 640 "Escape"`
Open `scratchpad/harness.png`. Expected: island 42 with the HUD — **no title screen**.

- [ ] **Step 3: Commit**

```bash
git add scripts/shot.mjs
git commit -m "chore: the screenshot harness skips the front door (nomenu=1)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Fold in the welcome, and full verify

The title screen now greets every arrival, so the old first-visit auto-welcome is redundant. Keep the welcome *copy* reachable from the guide, and run the whole suite green.

**Files:**
- Modify: `src/game/main.ts` (the first-visit block was already removed in Task 4 Step 8 — confirm it's gone)
- Modify: `src/render/help.ts` (surface `HELP_WELCOME` when the guide is opened from the title on a first visit — optional polish)

- [ ] **Step 1: Confirm the auto-welcome is gone** — grep `main.ts` for `SEEN_KEY`; it should no longer auto-open help on boot (the title replaces it). If any dead `SEEN_KEY` code remains, remove it.

Run: `grep -n "SEEN_KEY\|openHelp(true)" src/game/main.ts`
Expected: no auto-open-on-boot remains (a `?`-triggered `openHelp()` is fine).

- [ ] **Step 2: Full typecheck + tests + build**

```
npm run check
npx vitest run
npm run build
```
Expected: tsc exit 0; all tests green (the new `flags`/`title` tests included); build succeeds.

- [ ] **Step 3: Final visual confirm** — `node scripts/shot.mjs "" scratchpad/final.png 3000 960 1000 ""` → the front door over a living island, wordmark, five rows, version stamp. Open it.

- [ ] **Step 4: Commit + push**

```bash
git add -A
git commit -m "feat: the front door replaces the first-visit welcome; full green

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
git push origin master
```

---

## Self-review notes (coverage against the spec)

- **Trigger / `?nomenu` gate** → Task 4 Step 8; harness skip → Task 5. ✅
- **Five rows + empty-state hiding** → Task 2 (`titleRows`) + Task 3 (render). ✅
- **`continue` + `wonder.lastSeed`** → Task 1 (parse) + Task 4 (write-on-entry, guarded off the backdrop). ✅
- **Live backdrop** → Task 4 (curated seed booted live + camera drift), reusing the existing render loop. ✅
- **Version stamp on the title** → Task 3 (`formatStamp` in `.title-stamp`). ✅
- **Welcome folded in** → Task 6. ✅
- **Simulator row launches today's v1** (full sandbox out of scope) → Task 4 `onChoose` `sim`. ✅
- **`a new island` rolls directly here; the forge is Plan B** → noted in Global Constraints + Task 4. ✅

**Deferred to later plans:** the forge (Plan B — replaces the `new` action), live-on-drag preview, an in-world "back to the front door" door, a rotating backdrop-seed library, showing the wanderer's *own* last island as the backdrop.
