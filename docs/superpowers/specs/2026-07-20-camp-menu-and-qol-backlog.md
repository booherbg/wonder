# Camp, menu & QoL backlog

*Captured 2026-07-20 from Blaine, playing. A cluster of UX/QoL asks that share a
throughline: **the home base as a living observation lab** — plant a garden, the
pollinators come, the critters settle and (maybe) multiply, and the whole point
is watching it from your camp. The menu, camp, gathering, and soil systems all
serve that. Parallel to [design B](2026-07-19-byproduct-chains-design.md); mostly
independent of it. Tags: 🟢 quick win · 🐛 bug · 🔷 bigger feature · ❓ open
question Blaine flagged.*

## 1. A real menu

Today everything is a top-level keypress. Blaine wants a **legit menu** that
tucks away the baseline stuff that isn't immediately relevant.

- 🔷 A menu panel holding the non-immediate actions.
- **Backpack** inside it — for now, shows what's in the **seed pouch** (later:
  more inventory — soil, materials).
- 🟢 **`G` should be gather** ("that's just easier to remember"). Today F=gather,
  G=sow — rework the bindings so gather is `G`. (Re-home sow; update HUD legend +
  help card + `?warm`-free legend logic.)
- Menu holds **load / isle-hopping** (the picker) and a **link to the help doc**
  (the references shelf link already lives in help).
- ❓ A separate menu for **secondary actions** (e.g., postcards)? Blaine is "open
  on that one" — undecided.

## 2. What *is* a home/camp?

"It's weird that it can be moved so easily." Home should feel like a **place you
commit to**, not a cursor you drag.

- `H` **makes** the home (first time).
- Moving it should be **deliberate**: either a confirm dialog ("Move your camp
  here? This abandons your old camp.") or — better — a **menu action inside a
  camp menu**: *"abandon camp."*
- 🔷 **A camp menu** — opens when you're at your camp; shows *what's up* here
  (what the bed grows, what's built, who's settled — some of this is already in
  the inspect "your camp" view; promote it to a real menu).
- 🔷 **Camp zone grows with development** — the camp's footprint/radius increases
  as you build it up (e.g., building a fire expands it). Gives progression a
  visible shape.

## 3. Gathering & materials — legibility + flexibility

Blaine loved the gathering objective ("decent, loved the little objective") but:

- 🟢 **Gatherables are invisible.** Firewood/driftwood was "kind of hard to know
  wtf" it was — no inspect entry, no pick-up indication. **At minimum, driftwood,
  stone, rushes — anything interactable — should show in the `inspect` (E) area**
  with a clear "you can gather this" tell.
- 🔷 **Any wood makes a fire.** Not just beach driftwood — **fell a tree**, or
  find wood in a forest (keep it simple). "Lots of kinds of wood can still make a
  fire." Nice touch: 🔷 **the fire sparkles based on what wood was gathered.**
- 🔷 **Stone** should be gatherable near a **rocky shore, a waterfall, or a
  mountain/rock area** (more sources than today).
- 🔷 **A few base actions per island**, surfaced when relevant.
- 🔷 **Camp-actions sub-menu/UI:** when in camp, show the buildable actions —
  *"make a fire"* **greyed out but stating what you need** (e.g., "3 driftwood + 2
  stone"). Turns the hidden recipe into a visible goal. (Recipes already exist in
  `materials.ts` `FIRE_COST`/`BEDROLL_COST` — surface them.)

## 4. Soil & planting — the garden you build

Blaine had a deer follow him but **couldn't plant its favorite food** where he
was (sowing is habitat-gated to matching ground).

- 🔷 **Dig soil and carry it**, then plant on it anywhere (1 tile at a time). The
  **backpack holds a few kinds of soil**, just like it holds seeds — so you can
  garden off-habitat.
- 🔷 Eventually a **composter / machine at camp that produces soil**, so you can
  **expand your gardens** over time — a camp upgrade / production loop.
- The point: bring a critter home, plant its food, **observe it** at your base.

## 5. Felling & clearing — domestication

To make room for a garden you should be able to **clear an area** (fell plants /
trees) around camp for domestication.

- 🔷 **Fell plants/trees** to clear a zone.
- ❓ **How do you get the means?** Full Minecraft-style tool progression, or
  **start with equipment ready**? Blaine leans toward a light story hook:
- 🔷 **An origin story.** "A little crashed ship/boat with a few supplies," or —
  even better — **one of a handful of ways you ended up here** (varied arrivals),
  seeding a few starting supplies. Gives felling/clearing its means without a full
  crafting tree.

## 6. The throughline — home base as observation lab 🔷

The vision that ties §2–5 together, in Blaine's words: **plant a garden → the
pollinators show up naturally → the little critters get comfy and start to
multiply (maybe?) → the key is the observability you have at your home base.**
This is the sandbox/home-lab direction made concrete: the camp is where you
*build a small controlled ecology and watch it run*. Design B's chains would be
most legible exactly here — a cultivated patch you can watch a loop close in.

## 7. Companions & critter behavior

- Noted, OK for now: **only one companion** — fed seeds to a deer and took it
  home, but inspect shows just the one, so only one can be adopted. (The
  companion system is one-at-a-time by design; multi-companion is a later want.)
- 🐛 **Critters get stuck.** Other deer followed, then drifted back, and were
  later found **jammed in the corner of a shallow-water tile.** A real pathfinding
  / wander bug — critters shouldn't end up parked in a water corner. Worth a
  proper look (behavior in `fauna.ts` `updateCritter` / walkability edges).

---

## Suggested sequencing

- **Do-now quick wins** (small, high-relief, independent of B): 🟢 `G`=gather
  rebind; 🟢 gatherables in `inspect` + a pick-up tell; 🐛 the stuck-critter fix.
- **First real feature** (the menu is the frame everything else hangs on): the
  **menu + camp menu** (§1–2), including "abandon camp" and camp-actions with
  visible recipes. Do this before soil/felling, since those want menu homes.
- **Then the home-lab loop** (§3–6): flexible fire fuel → soil-digging + carry →
  felling/clearing → composter → the garden→pollinator→settle observation loop,
  with an origin hook for starting supplies.
- **Parallel track:** design B (byproduct chains) — independent; the camp is where
  its chains will read best, so the two converge on the observation lab.

## Open questions to resolve with Blaine

1. Secondary-actions menu (postcards) — separate menu or fold into the main one?
2. Felling means — start-equipped vs a light tool step; which arrival origins?
3. Camp-zone growth — purely cosmetic radius, or does a bigger camp *do* more
   (protects plants, draws critters)?
4. "Critters multiply at home" — do we add reproduction near a tended camp, or is
   settling (denning near your fire, already shipped) enough for now?
