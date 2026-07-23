# QA — World-Lab iteration 6a–6c

**Branch:** `worldlab-6`  
**Date:** 2026-07-23  
**Gates:** `tsc` clean · **568** vitest tests green  
**Verdict:** **Ship-ready** for 6a–6c (no open Critical/Important)

## Commits (vs master)

| Area | Commits |
|---|---|
| Spec/docs | `c5cecf6`, `a531f5d` |
| 6a roster/tools/erase | `d50e153` |
| 6b pressures + assist | `9ac5196`, `20e95f7` |
| 6c insects | `43c75a7`, `7fc9a77`, `4dcf172` |
| QA loop 1 | `23d5405` |
| QA loop 2 | `02e72e9` |
| QA loop 3 | `ceff774` |

## Three audit loops

| Loop | Important/Critical found | Fixed |
|---|---|---|
| 1 | Pin could wander; `?demo` broken after clean slate | Yes |
| 2 | Stale SwarmLayer on slot load; pinned idx after plant remove; assist not saved; dishonest place flash | Yes |
| 3 | Legacy load kept stale pollinator reach/density | Yes |

**Counts:** ~7 Important/Critical fixed across loops · Polish deferred to 6d/6e or pre-existing layout.

## What shipped

- Clean Live drawer + Archive; tool radio Select/Place/Paint/Erase  
- Spread + cross + pollinator reach/density pressures  
- Insect clouds: place, invite, inspect, erase, pin/free-roam, per-plant nectar, travel-to-host  
- Shared `pollinateAssist` (defaults 6/2 — real play unchanged)

## Residual polish (not blocking)

- Individual mote visit/return animation (cloud center travels; flecks still orbit)  
- Cloud instances not persisted in slots (load flash notes this)  
- 6e: clone flower, history charts, lifespan lever  
- Ambient tray clip under roll at ~1100px (pre-6c)

## Manual smoke (`?sim=1`)

1. Empty Live/palette on open  
2. Roll plant → pick → Place; Archive a kind → Restore  
3. Erase brush clears life  
4. Pressures: reseed 0, crank pollinator reach  
5. Place flowering plant → **cloud** / **invite a cloud** → Play/Step  
6. Select cloud → Details (match, nectar, maps) → pin / retarget  
7. Save slot → load → assist defaults or restores; sky empty until re-invite  
