# World-Lab iteration — clean slate, tools, pressures, insects

**Date:** 2026-07-23  
**Status:** shipped 2026-07-23 (6a–6e + close-out polish; builds on Simulator slices 1–5b)  
**Surface:** World-Lab Simulator (`?sim=1`)  
**Out of scope for this spec:** Forge auto-preview (separate), mid-session island warm (separate), full god-view / Door A deep-time

---

## Goal

Make the World-Lab a place to **start empty, place what you care about, clear patches, tune how life spreads, and play with insects** — so you can examine and tweak plants, critters, and pollinators, and compare **natural reseeding** vs **pollinator-assisted spread**.

This continues the Simulator north star: reductionist ecology on a construct, levers live, nothing that belongs only on the bench leaking into ordinary islands unless explicitly graduated later.

---

## What pollinators do today (audit)

There are **three different “pollinator” ideas** in the codebase. Only two move genes.

### 1. Plant-neighbor crossing (natural, always on for flora)

In `flora.simTick`, a mature plant that wins `reproChance` looks for same-species partners within **`pollinationRadius`** tiles. If it finds one, the child is a **cross** with **`mutationAmount`** drift; if alone, it **self-seeds** with the same drift. Landing tile is within **`reseedRadius`**.

These three numbers are **global `FloraTuning`** (island-wide), not per plant. Individual plants only carry a **genome** that drifts when offspring are made.

### 2. Ambient-bench “pollinator” role (critter, Simulator-only)

`CritterRole = "pollinator"` (slice 5b). On a successful nibble visit, instead of `flora.propagate` (disperser) or `flora.nibble` (grazer), it calls:

```text
flora.pollinateSpread(meal, POLLINATOR_RADIUS=6, POLLINATOR_MAX_SAME=2)
```

That is **wider / lower-density** than ordinary reseed: bigger radius, stricter same-species-per-tile cap. Still uses global **`mutationAmount`**. Real islands never assign this role.

### 3. Insect swarms (mechanical clouds — game + `?sim=swarm`)

`SwarmLayer` (`src/game/swarms.ts`): clouds home on blooms, adapt colour/maps, and when match is high enough call the **same** `flora.pollinateSpread` (radius 6, maxSame 2). Boom events when enough spreads land.

**Not in World-Lab kernel today.** World-Lab has no swarm place/roll/tick path. The separate `?sim=swarm` bench is identity/matching, not the construct palette.

### 4. Decorative ambient (ignore for levers)

`src/render/ambient.ts` sippers/sparkles — **no ecology**. Do not confuse with (2) or (3).

### Natural rate vs pollination rate (the comparison you want)

| Path | Trigger | Spread helper | Radius today | Density | Mutation |
|---|---|---|---|---|---|
| Natural self/cross | plant tick × `reproChance` | addPlant via simTick | `reseedRadius` (3) | `maxPerTile` | `mutationAmount` |
| Disperser critter | nibble | `propagate` | `reseedRadius` | `maxPerTile` | `mutationAmount` |
| Ambient pollinator | nibble | `pollinateSpread` | **6** (hardcoded) | **maxSame 2** | `mutationAmount` |
| Swarm insect | swarm tick × match | `pollinateSpread` | **6** (hardcoded) | **maxSame 2** | `mutationAmount` |

**Gap:** you can already crank natural `reproChance` / `mutationAmount` in Pressures, but you **cannot** dial spread distance, cross distance, or pollinator-assist strength — and you **cannot** put swarms on the construct beside plants/critters.

---

## Decisions

### D1 — Clean slate roster

On construct `build()`:

- **Do not** seed the drawer with every starter plant/critter.
- Drawer **Live** tab starts **empty**.
- Palette shows only Live kinds (so it starts empty too).
- Kernel may still generate starter species defs internally for habitat/roll streams, but they are **not** on the palette until rolled and picked (or explicitly introduced). Prefer: roll/pick remains the only way kinds enter Live.

**Archive tab:** kinds that were Live and then cleared/deleted, plus extinct-with-history if useful. Archive rows: name, why archived (`cleared` / `extinct`), **Restore to Live** (today’s “bring back”). No “bring back” button on the Live list.

### D2 — Tools are a radio; catalog is separate

Tool modes (mutually exclusive):

| Tool | Pointer does |
|---|---|
| **Select** | Inspect nearest plant/critter/(later swarm) |
| **Place** | Stamp selected Live kind (brush N×N, drag path) |
| **Paint** | Paint selected biome tile |
| **Erase** | Remove life under brush (plants + critters in cells; optional: swarms later) |

Biome chips only matter in Paint. Kind chips only matter in Place. Select/Erase need no catalog pick.

### D3 — Erase patch

Erase uses the same brush sizes as Place/Paint (1–4). For each cell in the stamp:

- Remove all plants whose tile is in the patch.
- Remove all critters whose tile is in the patch.
- Do **not** delete species defs or archive kinds (instance clear only).
- Do **not** repaint biomes (Paint does that).

Flash note: `erased N plants · M critters` (omit zeros).

### D4 — Pressures: expose spread + pollination levers

Keep existing: drift, speciation, grazer share, reseed rate, per-tile cap.

**Add (global FloraTuning / bench constants):**

| Lever | Binds to | Purpose |
|---|---|---|
| **spread distance** | `reseedRadius` | How far natural + disperser seeds land |
| **cross distance** | `pollinationRadius` | How far plants look for crossing partners |
| **pollinator reach** | shared pollinate radius (ambient + swarm) | Wider assist spread |
| **pollinator density** | shared `maxSame` for `pollinateSpread` | How sparse assisted seeds are |
| **plant lifespan** | `lifespan` | How long before age-death rolls start |
| **self-seed** | `reproChance` (already “reseed rate”) | Set to **0** = insects-only seeding scenario |

Copy in tray: “island-wide — not per plant.” Self-seed at 0 is the **pollination-only** experiment switch.

### D5 — Insects in the World-Lab (expanded)

**Ground truth loop:** place a **generic** swarm → watch it adapt toward nearby blooms over time → open a **Details** view of that cloud.

**Both placement modes (locked — do both):**

1. **Place generic cloud** — stamp a naïve swarm (generalist sensor map); it homes on nearest bloom and adapts.
2. **Invite / snap on bloom** — select a flower → invite; cloud’s home is that plant immediately (god snap).

**God guidance (6c+):** while a cloud is selected, **Retarget** / click-a-plant sets `home` to that bloom. **Pin / free-roam toggle** (locked): pin keeps that host until changed; free-roam returns to nearest-bloom homing.

**Details view (insect card) — must show:**

| Block | Content |
|---|---|
| Identity | name, population, energy, cap |
| Sensor map | 7×7 pixel map (insect) |
| Current host | species name + **flower pixel map** + accent |
| Match | metabolic efficiency / resemblance % |
| Pollination log | species this cloud has successfully `pollinateSpread`’d (counts + last tick) + each species’ flower map |
| History | match % over time; optional energy / population sparklines |

**Clone flower (god tool on plant inspect):**

- **New Live species** (locked) — cousin gets its own drawer entry, census line, and **its own nectar/flower map**.
- **Preview panel** before commit: mutation slider, **re-roll**, **reset** to the parent snapshot; show flower pixel map live as you tweak; then “introduce” → Live + Place.
- Uses `mutate` / `mutateMap`; default mutation amount can track pressures drift.

**Analysis over time (phase 6e — promote main-world ledger into the lab):**

Today (see §Analysis gap below): lab has census sparklines + richness, **not** the G ledger. Target:

- Reuse / adapt `charts.ts` ChartsView for the construct (plant census series already in `CensusLog`).
- Swarm series: match %, energy, population, pollination events per cloud (mirror `swarmMatchHistory` in `main.ts`).
- Snapshots: optional “bookmark tick” that freezes a readout row (kind counts + top swarm matches) for before/after.

**Real worlds:** defaults unchanged; lab writes only.

### D5b — What pollination *buys* (economics — document in UI)

**Swarm side** (`src/life/swarm.ts`):

- Feeds on flower **nectar** → `energy` gain ∝ drawn nectar × **metabolic efficiency** (sensor vs flower map) × boldness.
- Living cost drains energy each step; **population** eases toward `energy × cap`.
- Better match → more energy → fuller cloud → higher chance to pollinate (fill term in chance formula).

**Plant side:**

- Swarm does **not** add a hidden “growth buff.” The plant bonus is **extra offspring** via `pollinateSpread` (wider/sparser than self-seed) when match ≥ floor and chance rolls.
- Facultative: plants keep self-seeding unless you set **reseed rate = 0**.

**Plant death** (`flora.simTick`):

- **Crowding:** if island over `comfortFraction` of `maxPlants`, common untended plants can be removed.
- **Age:** after `lifespan` (default **900** ticks), ~15% chance per exam to die.
- Grazers nibble (reduce growth / can kill young via nibble path) — separate from age.

So: lifespan ~900 heartbeats at default step rate is “old age”; not a rapid turnover unless you lower lifespan or overcrowd.

### D5c — Critter predation on plants/insects (later)

Out of scope for 6a–6e. Same god/detail/history patterns should apply later when critters choose plants or insects to predate. Do not build predation into 6c.

### D6 — Camera / windowing (companion, lighter priority)

From the UX audit; can ship in the same epic or a sibling plan:

- Wheel / two-finger → pan; modifier+wheel / buttons → zoom; zoom % + Fit; optional minimap.
- Remember last open state for roll / web / drawer.
- Do not block D1–D5 on camera polish.

---

## Analysis gap — lab vs main world

| Tool | Main island | World-Lab today |
|---|---|---|
| Census sparklines + arose/lost | Dev ` + G ledger | **Yes** — Living web panel (`WEB`) |
| Richness / food-web score | Ledger + seed label | **Yes** — same meter in WEB |
| Full **G** charts (population lines, swarm match charts) | `openCharts` / `charts.ts` | **No** |
| Swarm pollination web / identity maps | Inspect + swarm card / `?sim=swarm` | **No** on construct |
| Species field guide pages | Journal | Inspect plate only (genome text) |

**Conclusion:** you have a **light species/census view** in the lab (WEB), not the main world’s ledger charts. Phase **6e** ports chart muscle into the lab and adds insect Details + histories.

---

## Non-goals (near term)

- Per-plant individual repro/mutation *rates* (genomes drift; rates stay global) — clone-with-mutation is a one-shot genome copy, not a per-plant rate field.
- Graduating ambient roles into ordinary island generation.
- Critter↔insect predation (later).
- Full SimCity chrome redesign in one pass.

---

## Success criteria

**6a–6b (unchanged core):** clean slate, archive, tools, erase, spread levers, self-seed→0 works.

**6c insects:**

1. Place generic cloud **and** invite-on-bloom (snap).
2. Details view: sensor map, host flower map, match, pollination log by species.
3. Retarget cloud to another plant.
4. Clouds tick with play/step; assist uses shared reach/density defaults (= today).

**6e analysis:**

5. Lab charts for plant census + at least one swarm match/energy series.
6. Scenario: place blooms, reseed rate 0, invite cloud, watch insect-only spread.
7. Clone-with-mutation on a plant → place cousin → watch match drift (can land late in 6c or 6e).

**Always:** check/tests green; ordinary play defaults unchanged.

---

## Phasing

| Phase | Ships |
|---|---|
| **6a — Roster & tools** | Clean slate, Archive, tool radio, Erase |
| **6b — Spread levers** | Radii + pollinator reach/density; document self-seed=0 scenario |
| **6c — Insect bench** | SwarmLayer; place + invite; Details; pin/free-roam; **per-plant nectar**; **truthful visit animation**; erase clouds; pollination log |
| **6d — Camera** | Pan/zoom (optional sibling) |
| **6e — Watch & tweak** | Lab ledger charts; swarm histories; clone-with-mutation flower; lifespan lever if not in 6b |

---

## Decisions locked at review (2026-07-23)

| # | Topic | Locked |
|---|---|---|
| Q1 | Starter species | Keep generating starter defs for roll streams; **Live/palette stay empty** until rolled & picked. |
| Q2 | Erase scope | **6a:** erase plants + critters only. **6c:** erase extends to insect clouds. |
| Q3 | Pollinator reach lever | **Defaults = today’s hardcodes (6 / 2)**; shared lever for ambient + swarm assist. |
| Q4 | How you get a cloud | **Both:** place generic **and** invite-on-bloom snap. |
| Q5 | Clone flower | **New Live species** + mutation preview (slider / re-roll / reset) before introduce. |
| Q6 | Retarget | **Pin / free-roam toggle** (default pin when god-retargeting). |

### Q3 — how “swarm reach” works *today* (no lever yet)

There is **no** swarm reach slider. Both assist paths use hardcoded **6** tiles / max **2** same-species (`swarms.ts` / `fauna.ts`). Match floor, chance, and per-tick caps also gate swarms. New UI levers default to those values.

### Q4 — both placement modes

1. **Generic place** — naïve cloud; adapts over time (ground truth).
2. **Invite on bloom** — god snap home to that flower.

Plus **retarget** while inspecting a cloud.

---

## Open questions

1. ~~Clone flower~~ → **Locked: new Live species**, with a preview panel (mutation slider + re-roll / reset) before commit to the drawer.
2. ~~Retarget: pin or wander?~~ → **Locked: pin / free-roam toggle** (fun god control; default pin when retargeting from Details).

---

## Nectar, food, and competition (how it works today)

**Nectar is finite per flower *species*, not per plant instance.**  
`SwarmLayer` keeps one `Flower` record per plant species (`flowers: Map<speciesId, Flower>`). That record has `nectar` in **0..1**. Every plant of that species shares the same meter.

Each swarm tick on a host species (`stepSwarm`):

1. **Regen** `+NECTAR_REGEN` (0.05) capped at 1  
2. **Feed** draws up to `NECTAR_DRAW` (0.25) from that shared meter  
3. Energy gain ∝ drawn × **match efficiency** × `FEED_VALUE` (4) × boldness  
4. **Living cost** `-LIVING_COST` (0.02) energy  
5. Population eases toward `energy × cap`

So:

| Question | Today |
|---|---|
| Finite food? | **Yes** — shared species nectar drains and refills slowly |
| Incentive to move/compete? | **Indirect** — two clouds on the same species **share one nectar pool** (first in tick order feeds more); a better-matched cloud converts the same draw into more energy. Homing is “nearest bloom,” not an explicit “leave empty flowers” brain. |
| See nectar now? | **Not in UI** — only in memory on `Flower.nectar` |
| See swarm strength? | Partially in inspect (`population`); **energy / cap / match** exist on the swarm object but aren’t a clear lab readout |

**Tunables for the lab (add to pressures or an Insects tray in 6c/6e):**

| Lever | Constant today | What you watch |
|---|---|---|
| nectar regen | 0.05 | how fast a species refills |
| nectar draw | 0.25 | how hard one feed hits the pool |
| feed value | 4 | energy per matched nectar |
| living cost | 0.02 | how fast clouds starve if unmatched / empty |
| swarm cap | per-swarm / default 100 | population ceiling |
| predation pressure | ambient thin | optional die-off of conspicuous clouds |

**Details / HUD should show live:** host species nectar bar, swarm energy, population/cap, match %. That makes “thrive vs die off” readable without digging in the debugger.

## Per-plant nectar (locked for lab insects)

### Today (main world + current SwarmLayer)

**Yes — 10 flowers of the same species share one nectar bar.**  
`SwarmLayer.flowers` is `Map<speciesId, Flower>`; `Flower.nectar` is shared. Planting denser patches of one kind does **not** add food. A swarm on species A keeps draining the same meter whether one bloom or fifty. **Little incentive to move on** within a species — only match quality and tick-order competition with other clouds on that species matter. Leaving for another *species* can help if that species’ meter is fuller / a better match.

### Target (World-Lab + eventually fairer real play)

**Per-plant nectar:** each plant instance has its own `nectar` (0..1). Identity maps (pixel flower signature) can stay per-species.

**What it takes (6c):**

1. Store nectar on the plant (or a side map keyed by plant idx), not only on the species `Flower`.
2. When a swarm feeds, regen/draw against **that host plant’s** nectar.
3. Homing already picks a plant instance — pin/retarget already name a plant; free-roam nearest-bloom becomes meaningful forage.
4. Defaults: same regen/draw numbers, but now scaled across individuals ⇒ denser patches = more total food.
5. Tests: two plants same species, drain one, other still full; swarm prefers/pin to fuller bloom when free-roaming (optional).

**Real-world graduation:** can land with lab first (feature-flag / only when SwarmLayer constructed with `perPlantNectar: true`) so ordinary islands stay byte-identical until a dedicated playtest.

**UI:** Details shows **this plant’s** nectar bar; species aggregate optional.

### Availability / recovery (tunable)

After a feed, nectar is lower; **regen per tick** (`NECTAR_REGEN`, lab-tunable) refills it — “available again after a period.” Extra lab levers:

| Lever | Meaning |
|---|---|
| nectar regen | how fast a drained bloom recovers |
| nectar draw | how hard one visit hits the bar |
| empty threshold | below this, free-roam refuses the plant (force move-on) |
| recovery hold | optional: “spent” until nectar ≥ threshold (UI + forage gate) |

Tune these in the Simulator for a readable drain → leave → recover → return cycle.

---

## Truthful swarm motion (locked for 6c)

### Today (the lie)

- **Sim** feeds/adapts/pollinates at `home` using species-shared nectar.
- **Animation** only eases the cloud in a **pretty orbit** around `home` (match quality widens the ring).
- **Insects/motes** are decorative flecks — not tied to which plant was fed this tick or to nectar.
- Code comment: “Wall-clock animation only; no sim.” What you *see* is not what the ecology *did*.

### Target (truthful visit cycle)

Motion becomes a **readout of forage**, peaceful and tunable:

1. **Visit target** — each sim tick (or every N), choose a concrete plant (pin, or free-roam: nearest / fullest nectar / best match — lab dial).
2. **Cloud travels** — center eases toward that plant. On arrival: feed + adapt + maybe pollinate.
3. **Individuals** — a few insects leave the cloud, visit the bloom (or nearby blooms), then return. Activity scales with population/energy (starving cloud looks sparse/idle).
4. **Spent blooms** — nectar below empty threshold ⇒ free-roam picks another plant; animation follows. Pin still forces the chosen plant.
5. **Multi-flower patch** — same species, different plants: hop between individuals as meters recover (needs per-plant nectar).

**Lab tunables:** travel ease, visit dwell, mote forage fraction, empty threshold, regen/draw.

**Acceptance:** self-seed=0, two blooms of one kind — you can *see* a cloud drain one, leave for the other, and return when the first recovers.

**6c scope note:** insect bench ships place/Details/pin **and** per-plant nectar + truthful visits (not a later polish-only item).

