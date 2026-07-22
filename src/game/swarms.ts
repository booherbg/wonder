// The world swarm layer — the plant/insect ecology bolted onto the REAL island
// as a purely additive life/visual layer (Plan 5a, v1). It reuses the tested
// ecology core untouched (src/life/idmap.ts, swarm.ts): the core feeds ONE swarm
// on ONE flower and evolves its pixel map toward it; this module is only the
// spatial glue over a living island — give a flowering plant SPECIES a flower
// map, scatter a bounded set of insect swarms near the blooms, and each sim
// heartbeat home each swarm on its nearest flowering plant and feed it there.
//
// It NEVER touches flora/critter/worldgen. Its whole life runs off a SEPARATE
// salted Rng, so a pinned seed's world stays byte-identical — swarms regenerate
// from seed each load (like critters do), no save format change.
//
// Which plants "flower" is the SAME rule the cosmetic Pollinators already work
// (ambient.isBloom): flowers always, shrubs, succulents once bloomed. Swarms
// therefore home on the very blooms the butterflies visit.

import { makeRng, Rng } from "../core/rng";
import { IdMap, MAP_CELLS, appearanceColors, metabolicEfficiency, resemblance } from "../life/idmap";
import { Flower, Swarm, makeFlower, makeSwarm, stepSwarm } from "../life/swarm";
import { Flora, Plant } from "../life/flora";
import { PlantForm } from "../life/genome";
import { PlantSpecies } from "../life/species";
import { TILE_SIZE } from "../world/config";
import { isBloom } from "../render/ambient";

// separate salts — never a stream flora/critters/worldgen use, so nothing shifts
const FLOWER_SALT = 0xf10f5; // per-species flower map
const SWARM_SALT = 0x5a12b; // the swarm layer's own life (spawn + tick + adapt)

export const MIN_SWARMS = 4;
export const MAX_SWARMS = 8;
export const MOTES_MAX = 42; // insects drawn in the densest cloud
const SWARM_CAP = 96; // the size lever for a world swarm (near the core default)
const WARM_TICKS = 20; // heartbeats a swarm has already lived when the island loads
const LIVELY_POP = 38; // a swarm arrives already a lush cloud, not a lone speck
const HOME_SCAN_PX = 10 * TILE_SIZE; // how far a swarm looks for a flowering plant to work
const RING_MIN_PX = 1.5 * TILE_SIZE; // a well-adapted swarm hugs its bloom this close
const RING_RANGE_PX = 1.7 * TILE_SIZE; // a poorly-adapted one ranges out this much further

// ── pollination (the reciprocal boom) ─────────────────────────────────────────
// The payoff the plant gets back. A well-matched, well-fed swarm now and then
// POLLINATES the flower it works — it trips that plant's ordinary propagation
// (the very drifted, same-species reseed a disperser critter triggers, via
// flora.propagate), so a faithful insect+flower pair spreads faster. It's a
// facultative accelerant, never a lifeline: flora keeps self-seeding on its own
// (flora.simTick), so a flower with no swarm still persists — just spreads
// slower. Gated three ways so it stays a gentle nudge, never a firehose:
//   • a metabolic-match floor — only a swarm genuinely adapted to its flower
//     pollinates; a crumbs-fed stray does not,
//   • a per-swarm chance that climbs with match quality (squared) × how full the
//     cloud is, so the best-fed, best-fit pairs boom and the rest barely nudge,
//   • an island-wide cap on pollination events per heartbeat.
// Bounded on the far side too: propagate routes through addPlant, so per-tile +
// global caps hold the ceiling — a saturated neighbourhood simply refuses.
const POLLINATE_MATCH_MIN = 0.3; // metabolic efficiency a swarm needs before it pollinates at all
const POLLINATE_CHANCE = 0.5; // scales the per-swarm, per-heartbeat pollination probability
const MAX_POLLINATIONS_PER_TICK = 3; // island-wide ceiling on pollination events each heartbeat

// A mote is one drawn insect: bookkeeping for the render only (the gene pool is
// the sim). Its orbit within the cloud animates on the wall clock.
interface Mote {
  a: number; // orbit angle around the cloud centre
  r: number; // 0..1 radial offset within the cloud
  spd: number; // angular drift speed
  z: number; // 0..1 depth, for size/alpha variation
}

// A single spatial swarm: the tested core Swarm (cloud + gene pool) given a spot
// on the island and a flowering plant it's homing on.
export interface WorldSwarm {
  sw: Swarm;
  x: number; // world px — the cloud centre, drifting to orbit its home bloom
  y: number;
  orbit: number; // slow orbit phase around the home flower
  motes: Mote[];
  home: { x: number; y: number; species: number } | null; // the bloom it works
}

// The inspect readout for one swarm — the codex card's data (built here so the
// idmap math stays out of the render layer). resemblance is 0..1.
export interface SwarmInspect {
  sensor: IdMap; // the 7×7 appearance genome (rendered via appearanceColors)
  population: number;
  hostName: string; // the flowering plant it works
  resemblance: number; // 0..1 — how close its map has come to that flower
  behavior: { range: number; nerve: number; cohesion: number };
  flowerMap: IdMap; // the host flower's map — to ring the jackpot cells it matches
  accent: Uint8Array; // 1 where a cell is flower-accent
}

// Which plant forms can carry a flower map — exactly the forms ambient.isBloom
// can answer true for (flowers, shrubs, succulents). Trees/ferns/fungi/coral/…
// hold no blossom, so they never host a swarm.
export function canFlower(form: PlantForm): boolean {
  return form === PlantForm.Flower || form === PlantForm.Shrub || form === PlantForm.Succulent;
}

// A species' flower size (accent-cell count) — the jackpot's size, scaled off
// its bloom: showy on true flowers, a smaller signal on shrubs and succulents.
// Deterministic in the archetype, so the same species always wears the same
// flower. Bounded well under the 7×7 grid so a base colour always shows too.
export function flowerSizeFor(sp: PlantSpecies): number {
  const petals = sp.archetype.petals; // ~3..12
  const base =
    sp.archetype.form === PlantForm.Flower
      ? petals * 1.7
      : sp.archetype.form === PlantForm.Shrub
        ? petals * 0.85
        : petals * 1.1; // succulent
  return Math.max(3, Math.min(MAP_CELLS - 6, Math.round(base)));
}

// One deterministic flower map per FLOWERING species, keyed by species id and
// seeded off the flower salt + the id — so adding a species (a daughter, later)
// never shifts an earlier map. Built once per island.
export function buildFlowerMaps(seed: number, species: readonly PlantSpecies[]): Map<number, Flower> {
  const out = new Map<number, Flower>();
  for (const sp of species) {
    if (!canFlower(sp.archetype.form)) continue;
    const rng = makeRng((seed ^ FLOWER_SALT ^ Math.imul(sp.id + 1, 0x9e3779b1)) >>> 0);
    out.set(sp.id, makeFlower(rng, flowerSizeFor(sp)));
  }
  return out;
}

export class SwarmLayer {
  readonly flowers: Map<number, Flower>;
  readonly swarms: WorldSwarm[] = [];
  private rng: Rng;

  constructor(
    seed: number,
    species: readonly PlantSpecies[],
    flora: Flora,
    focus?: { x: number; y: number }, // world px — the arrival point; some swarms gather here
  ) {
    this.flowers = buildFlowerMaps(seed, species);
    this.rng = makeRng((seed ^ SWARM_SALT) >>> 0);
    this.spawn(flora, focus);
  }

  // The flowering plants a swarm can actually work: the isBloom rule (the same
  // one the cosmetic pollinators use) AND a species we hold a flower map for.
  private bloomCandidates(flora: Flora): Plant[] {
    return flora.all.filter((p) => isBloom(p) && this.flowers.has(p.species));
  }

  // Scatter a bounded set of swarms, each anchored beside a flowering plant, and
  // let each already live a short while against that bloom — so an island loads
  // with clouds that are already colouring toward their flowers, not blank.
  private spawn(flora: Flora, focus?: { x: number; y: number }): void {
    const blooms = this.bloomCandidates(flora);
    if (blooms.length === 0) return; // an island with no blossom carries no swarms
    const count = MIN_SWARMS + Math.floor(this.rng() * (MAX_SWARMS - MIN_SWARMS + 1));
    // a "near pool": the blooms closest to the arrival point, so the island reads
    // alive right where the wanderer lands. Roughly half the swarms gather here;
    // the rest scatter island-wide. Deterministic (a stable sort off the seed).
    const nearPool = focus
      ? [...blooms]
          .sort(
            (a, b) =>
              (a.x - focus.x) ** 2 + (a.y - focus.y) ** 2 - ((b.x - focus.x) ** 2 + (b.y - focus.y) ** 2),
          )
          .slice(0, Math.min(blooms.length, 60))
      : blooms;
    const nearCount = focus ? Math.ceil(count / 2) : 0;
    for (let i = 0; i < count; i++) {
      // the very first swarm settles on the single closest bloom to the arrival
      // point, so the island always greets the wanderer with a cloud at hand;
      // the next few draw from the near pool, the rest scatter island-wide
      const anchor =
        focus && i === 0
          ? nearPool[0]
          : (i < nearCount ? nearPool : blooms)[Math.floor(this.rng() * (i < nearCount ? nearPool : blooms).length)];
      const sw = makeSwarm(this.rng, undefined, SWARM_CAP);
      sw.population = LIVELY_POP;
      const motes: Mote[] = [];
      for (let m = 0; m < MOTES_MAX; m++) {
        motes.push({ a: this.rng() * Math.PI * 2, r: 0.32 + this.rng() * 0.68, spd: 0.2 + this.rng() * 0.5, z: this.rng() });
      }
      const ang = this.rng() * Math.PI * 2;
      const ent: WorldSwarm = {
        sw,
        x: anchor.x + Math.cos(ang) * RING_MIN_PX,
        y: anchor.y + Math.sin(ang) * RING_MIN_PX,
        orbit: ang,
        motes,
        home: { x: anchor.x, y: anchor.y, species: anchor.species },
      };
      const flower = this.flowers.get(anchor.species)!;
      for (let w = 0; w < WARM_TICKS; w++) stepSwarm(ent.sw, flower, this.rng);
      this.swarms.push(ent);
    }
  }

  // The nearest flowering plant to a swarm — the live bloom it works this
  // heartbeat, handed back as the actual Plant so pollination can trip its
  // propagation. Null if none is in reach (a bloom may have died under the
  // cloud); the caller keeps the swarm's last home in that case.
  private nearestBloomPlant(ent: WorldSwarm, flora: Flora): Plant | null {
    let best: Plant | null = null;
    let bd = Infinity;
    for (const p of flora.plantsNear(ent.x, ent.y, HOME_SCAN_PX)) {
      if (!isBloom(p) || !this.flowers.has(p.species)) continue;
      const d = (p.x - ent.x) ** 2 + (p.y - ent.y) ** 2;
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }

  // One island heartbeat: each swarm homes on its nearest flowering plant and
  // feeds + adapts there via the tested core (no predation in v1), and a
  // well-matched, well-fed swarm now and then POLLINATES that plant — tripping
  // its ordinary propagation so a faithful pair spreads faster (the reciprocal
  // boom). Deterministic: the pollination *decision* is drawn only from the
  // swarm salt's Rng; the reseed placement reuses flora's own propagate. Bounded
  // + facultative (see the pollination constants) — flora self-seeds without us.
  tick(flora: Flora): void {
    let pollinations = 0; // island-wide events this heartbeat, held under the cap
    for (const ent of this.swarms) {
      const host = this.nearestBloomPlant(ent, flora);
      if (host) ent.home = { x: host.x, y: host.y, species: host.species };
      // no bloom in reach: keep the bond to the last patch rather than blink away
      if (!ent.home) continue;
      const flower = this.flowers.get(ent.home.species);
      if (!flower) continue;
      stepSwarm(ent.sw, flower, this.rng);
      if (host && pollinations < MAX_POLLINATIONS_PER_TICK) {
        const match = metabolicEfficiency(ent.sw.sensor, flower.map, flower.accent);
        if (match >= POLLINATE_MATCH_MIN) {
          const fill = ent.sw.population / ent.sw.cap; // a fuller cloud pollinates more
          if (this.rng() < POLLINATE_CHANCE * match * match * fill) {
            if (flora.propagate(host)) pollinations++; // reuse the tested reseed path
          }
        }
      }
    }
  }

  // Per-frame drift: each cloud eases into a slow orbit around its home bloom —
  // a well-adapted swarm hugs the flower, a poorly-matched one ranges wider (it
  // has to forage further for a full meal). Wall-clock animation only; no sim.
  animate(dt: number): void {
    for (const ent of this.swarms) {
      ent.orbit += dt * 0.6;
      if (!ent.home) continue;
      const flower = this.flowers.get(ent.home.species);
      const res = flower ? resemblance(ent.sw.sensor, flower.map) : 0;
      const ring = RING_MIN_PX + (1 - res) * RING_RANGE_PX;
      const tx = ent.home.x + Math.cos(ent.orbit) * ring;
      const ty = ent.home.y + Math.sin(ent.orbit) * ring * 0.8;
      const k = Math.min(1, dt * 1.4);
      ent.x += (tx - ent.x) * k;
      ent.y += (ty - ent.y) * k;
    }
  }

  // The nearest swarm to a world point within `rPx` — for the click-to-inspect.
  pick(x: number, y: number, rPx: number): WorldSwarm | null {
    let best: WorldSwarm | null = null;
    let bd = rPx * rPx;
    for (const ent of this.swarms) {
      const d = (ent.x - x) ** 2 + (ent.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = ent;
      }
    }
    return best;
  }

  // Every swarm whose cloud centre is within `rPx` of a point — for the lean-in
  // (E) examine, which lists what's drifting close.
  near(x: number, y: number, rPx: number): WorldSwarm[] {
    const r2 = rPx * rPx;
    return this.swarms
      .filter((e) => (e.x - x) ** 2 + (e.y - y) ** 2 <= r2)
      .sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));
  }

  // The codex readout for one swarm — its map, population, host bloom, how far it
  // has come to resemble it, and its personality. Null if it has no live host.
  inspect(ent: WorldSwarm, species: readonly PlantSpecies[]): SwarmInspect | null {
    if (!ent.home) return null;
    const flower = this.flowers.get(ent.home.species);
    const host = species[ent.home.species];
    if (!flower || !host) return null;
    return {
      sensor: ent.sw.sensor,
      population: ent.sw.population,
      hostName: host.name,
      resemblance: resemblance(ent.sw.sensor, flower.map),
      behavior: ent.sw.behavior,
      flowerMap: flower.map,
      accent: flower.accent,
    };
  }
}

// ── render helpers (pure; the camera transform lives in the Renderer) ─────────

/** The dominant visible colour of a map — its most common coloured cell, through
 *  the same appearanceColors the portrait uses. All-neutral falls back to a faint
 *  mint (a naive generalist reads as mint, not a void). */
export function dominantColor(map: IdMap): string {
  const cols = appearanceColors(map);
  const tally = new Map<string, number>();
  for (let i = 0; i < MAP_CELLS; i++) {
    if (map[i] === 0) continue;
    tally.set(cols[i], (tally.get(cols[i]) ?? 0) + 1);
  }
  let best = "";
  let bv = -1;
  for (const [c, n] of tally) {
    if (n > bv) {
      bv = n;
      best = c;
    }
  }
  return best || "rgb(127, 224, 196)";
}

/** A small spread of a swarm's genome colours (from its internal gene pool), so a
 *  cloud reads as many related individuals, not one flat tint — and the palette
 *  visibly shifts toward the flower as the pool adapts. Recompute per frame. */
export function swarmPalette(sw: Swarm, k = 4): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.min(k, sw.pool.length); i++) out.push(dominantColor(sw.pool[i]));
  return out.length ? out : [dominantColor(sw.sensor)];
}

/** Turn an `rgb(...)`/`hsl(...)` swatch into the same colour at a given alpha. */
export function tint(color: string, alpha: number): string {
  const h = color.match(/hsl\(([^)]+)\)/);
  if (h) return `hsla(${h[1]}, ${alpha})`;
  const r = color.match(/rgb\(([^)]+)\)/);
  if (r) return `rgba(${r[1]}, ${alpha})`;
  return color;
}
