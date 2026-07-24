# QA — World-Lab iteration 6 (close-out)

**Branch:** `worldlab-close` → merge to `master`  
**Date:** 2026-07-23  
**Gates:** `tsc` clean · **589** vitest tests green  
**Verdict:** **Ship-ready** for 6a–6e + residual polish

## What shipped

### 6a–6c (core)
- Clean Live drawer + Archive; tool radio Select/Place/Paint/Erase  
- Spread + cross + pollinator reach/density pressures  
- Insect clouds: place, invite, inspect, erase, pin/free-roam, per-plant nectar, travel-to-host  
- Shared `pollinateAssist` (defaults 6/2 — real play unchanged)

### 6d
- Pan-first camera + zoom HUD

### 6e
- Clone flower preview → Live cousin species  
- Lifespan + nectar regen/draw/empty-threshold pressures  
- WEB: plant census + swarm **match %** and **energy** sparklines  
- Census restore on slot load (chart continuity)

### Close-out polish
- Insect clouds + flower maps + per-plant nectar persist in sim slots  
- Mote leave → visit bloom → return animation (activity scales with pop × energy)  
- Ambient tray clip fixed (max-width 260px)

## Close-out commits (on `worldlab-close`)

| Commit | Summary |
|---|---|
| `c9f4577` | Persist insect clouds across slots (+ census restore) |
| `0a1af85` | Mote forage leave-visit-return animation |
| `ea0a98a` | Swarm energy sparklines in WEB |

## Explicitly out of scope / later (not blockers)

- Critter↔insect predation; bird disperser-on-the-wing  
- Population history series in Details (match + energy live in WEB; ledger has match curves)  
- In-progress clone preview panel state across save (introduced cousins + maps persist)  
- Optional 6e bookmark snapshots; D6 remember roll/web/drawer open state  
- Motion fine-tunables (travel ease / dwell / mote fraction) — regen/draw/empty exist  

## Shipped later (sibling epic — see `qa-charts-midwarm.md`)

- Full lab `charts.ts` ledger (button + `G`)  
- Mid-session island warm in backtick `` ` `` panel

## Manual smoke (`?sim=1`)

1. Empty Live/palette on open  
2. Roll plant → pick → Place; Archive a kind → Restore  
3. Erase brush clears life  
4. Pressures: reseed 0, crank pollinator reach / nectar dials  
5. Place flowering plant → **cloud** / **invite a cloud** → Play/Step — watch motes forage  
6. Select cloud → Details → pin / retarget  
7. WEB → match + energy sparklines after stepping  
8. Clone flower → introduce cousin → Place  
9. Save slot → load → clouds, nectar, custom flower maps, census continue  
