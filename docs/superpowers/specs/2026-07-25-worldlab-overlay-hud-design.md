# World-Lab chrome rework — Overlay HUD — design

**Date:** 2026-07-25  
**Status:** approved  
**Surface:** World-Lab only (`src/game/worldlab.ts`, `simLayout.ts`, `simDock.ts`, related chrome)  
**Supersedes (layout policy only):** `2026-07-24-simulator-rework-design.md` §3.1 reserved-space frame. Other sections of that doc (selection, pause, zoom, tooltips) remain in force unless this doc contradicts them.

---

## Goal

The construct is the product. Chrome is a thin instrument around it — SimCity-style — not a three-row control pile that shrinks the world.

**Success looks like:**
1. Canvas is full-bleed (or near-full) at all times; opening panels does **not** resize the world.
2. Controls are grouped by job (**Build · Run · Read**), with no duplicate “web/ledger/roll” peers on the bottom bar.
3. Narrow / mobile remains usable via a bottom tool dock and sheets.
4. The permanent keyboard-shortcut wall is gone.

---

## Diagnosis (why it feels bad today)

Chrome is a **layout citizen**. `#lab-bottom-stack` (bar + palette ± ambient, up to ~34vh) is measured into `edgeInset` → `canvasBoxFor` → the canvas is **resized smaller** and the camera re-fits. Side panels do the same for width when open.

That is the opposite of SimCity (full-bleed map + HUD overlay). The 2026-07-24 rework chose “never cover the construct” by shrinking it; this rework chooses “never shrink the construct” by overlaying tuck-away chrome.

Organization is also wrong: tools, biomes, time, canvas starter, fidelity, brush, roll, web, ledger, drawer, pressures, ambient, and save all compete at equal weight on one stack. “Web” exists as both a bottom button and a dock tab. “Construct” is jargon for starter canvas. Brush was sitting with time controls even though it is a build parameter.

---

## Locked decisions

| Topic | Choice |
|---|---|
| Chrome model | **Overlay HUD** — full-bleed canvas; panels float over the map |
| Always-on chrome | Thin strips only (~44px left rail, ~44px bottom bar); everything else on demand |
| Organization | **Build · Run · Read** |
| Left rail | Always-open ~44px **icon rail**; materials as **flyouts** |
| Tiles / biomes | **Build → Materials** (paint tool → tile flyout) |
| Brush size | **Build** (with tools; affects paint/place/erase) |
| Starter canvas (“construct”) | **Session** with save/load; bar label **new ▾** (not “construct” / not “Canvas”) |
| Read panels | Right dock only; kill duplicate bottom toggles for web/ledger/roll |
| Ambient | Under **Pressures** (sub-section or sub-tab) |
| Working view | Dock header toggle (or `W`); not a Build peer |
| Title / shortcuts | Compact badge; shortcuts only in Help (`?`) |
| Narrow (&lt;900) | Bottom tool dock; materials as bottom sheet; Read/Library as sheets; setup under ⋯ |
| Sim rules / ecology | **Out of scope** — chrome layout only |
| Dock tab bodies / roll / drawer content | Keep; re-home only |

---

## Information architecture

### Test for any control

- **Build** — changes what/how you put on the map  
- **Run** — advances or configures the simulation clock / depth  
- **Session** (on the Run strip) — which experiment you are in (new canvas, save, load)  
- **Read** — inspects outcomes

### Build · left rail

**Always visible icons:**
- Tools: select · paint · place · erase · cloud  
- Brush: 1× · 2× · 3× · 4× (compact control under tools)  
- Library: roll · drawer  

**Flyouts / overlays (context):**
- Paint → **Materials: tiles** (8 biomes)  
- Place → **Materials: plants / critters**  
- Roll → existing roll pane (overlay, left-associated)  
- Drawer → existing drawer (overlay, left-associated as Library). Dock stays on the right; both edges may be open at once since they no longer share a stack.

### Run · bottom strip (one row, never wraps, never grows)

**Time:** play/pause · step · step N · speed  
**Sim depth:** fidelity (plants / full)  
**Session:** **new ▾** (playable island · biome sampler · single biome) · save · load · tick  

**Not on this strip:** tools, brush, biomes, plants, roll, web, ledger, drawer, pressures, ambient, working.

**New ▾ behavior:** choosing a starter rebuilds the map (same as today’s starter switch). If the session is dirty (unsaved edits), confirm before rebuild.

### Read · right dock

One dock, tabs only:
- Subject · Exchange · Web · Ledger · Pressures  

Ambient lives under Pressures. Working is a view toggle on the dock header (lab-only, default per existing behavior).  

**No** bottom-bar buttons that reopen the same panels.

### Chrome that stays out of the way

- Top-left: compact **Wonder · world-lab** badge (no shortcut legend)  
- Top-right: back to island · zoom (− / % / + / fit) — overlay, not inset-measured  
- Help (`?`) owns the full shortcut list  

---

## Layout & sizing

### Policy change

1. `#game` / renderer fill the **viewport** (minus only unavoidable safe areas if any).  
2. **Do not** feed bottom/left/right chrome heights into `canvasBoxFor` for World-Lab.  
3. Open panels are `position: fixed` overlays with translucent backgrounds so the construct remains visible.  
4. `fitCameraToConstruct()` fits to the full canvas box, not a chrome-shrunk box.  
5. Keep a `MIN_CANVAS` safety only if needed for extreme windows; default path is full-bleed.

### Implications for `simLayout.ts`

- Tests that assert “a growing bottom tray shrinks the construct” are **reversed**: growing chrome must **not** change canvas height.  
- Narrow overlay behavior (&lt;900) becomes the **desktop** policy too (overlay always), with mobile-specific chrome placement (below).

### Overlay etiquette

- Esc or the same toggle closes the open overlay.  
- One primary overlay per edge (left flyout vs roll; right dock).  
- Active panel toggles reflect open state (fix the old “invisible open” bug from the prior rework diagnosis).

---

## Mobile / narrow (&lt;900)

| Desktop | Narrow |
|---|---|
| Left icon rail | Bottom tool row (thumb reach) |
| Materials flyout | Bottom sheet |
| Roll / drawer overlays | Full-height sheets |
| Right dock | Full-height sheet |
| Bottom Run strip | Compact time row under tools; Session + fidelity under **⋯** if crowded |
| Zoom labels | Optional; pinch-zoom + back remain |

World still does not shrink when sheets open.

---

## Non-goals

- No changes to sim tick rules, ecology, pressures math, or roll algorithms  
- No full visual theme redesign (tokens / button chrome can stay; layout and grouping change)  
- No auto-hide / mouse-edge chrome (rejected; always-on thin strips)  
- No return to reserved-space “chrome eats the canvas” policy  

---

## Acceptance

On a fresh World-Lab session:

1. Construct fills the viewport; with the bottom strip visible, the world is **not** a small centered postage stamp.  
2. Opening materials / roll / dock does not resize the canvas (verify via layout helper or visual).  
3. Bottom strip is a single non-wrapping row with only time · fidelity · session.  
4. Brush lives with Build tools; tiles open from paint; plants/critters from place.  
5. No bottom buttons for web / ledger / roll / drawer / pressures / ambient as peers of play.  
6. “Construct” label is gone from the bar; **new ▾** sits with save/load.  
7. Shortcut wall is gone; `?` still documents keys.  
8. At &lt;900px width, tools are reachable from the bottom; sheets overlay without starving the map.  
9. Existing keyboard shortcuts and dock tab content still work after re-home.  
10. `npm run check` / vitest layout tests updated to the new overlay policy.

---

## Implementation sketch (not a plan)

Primary touch points:
- `src/game/worldlab.ts` — `buildChrome()`, bottom stack, palette, eyebrow  
- `src/game/simLayout.ts` — stop measuring chrome into canvas insets for lab  
- `src/game/simDock.ts` — ambient under pressures; working toggle if needed  
- `tests/sim-layout.test.ts` — invert shrink-vs-cover expectations  

Detailed task breakdown deferred to the implementation plan after this spec is approved.

---

## Decision log (brainstorm)

- Always-on model: thin strips (not full auto-hide)  
- Spatial model: classic SimCity split (left tools, bottom run, right read)  
- Open panels: overlay (do not nudge/shrink)  
- Title: compact badge; shortcuts in Help  
- Left rail: always-open icons + flyouts  
- IA: Build · Run · Read  
- Tiles: Build / Materials  
- Brush: Build  
- Starter canvas: Session with save/load (`new ▾`)  
- Mobile: bottom dock + sheets  
