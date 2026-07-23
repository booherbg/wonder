import { fbm } from "../core/noise";
import { hash2d, makeRng, Rng } from "../core/rng";
import { TILE_SIZE } from "../world/config";
import { Tile, WorldMap, pocketAt } from "../world/types";
import {
  Genome,
  NUMERIC_TRAITS,
  GENOME_BOUNDS,
  PlantForm,
  clampTrait,
  cross,
  driftDistance,
  mutate,
} from "./genome";
import { PlantSpecies, speciateFrom } from "./species";

export interface Plant {
  species: number;
  genome: Genome;
  x: number; // world px (base of the plant)
  y: number;
  born: number; // sim tick of birth (scatter plants are born pre-tick-0)
  idx: number; // position in the flat array; maintained by Flora
}

// A byproduct chains rest on: a transient, trait-tagged mark on the ground
// where a disperser fed, carrying the {hue, glow, form} of the plant it ate.
// Read through the same appetite-style hue match everything else uses — a
// substrate-feeder plant germinates on one whose hue sits in its window.
// Lives only while chains are on; decays after SUBSTRATE_LIFETIME ticks.
export interface Substrate {
  x: number; // world px
  y: number;
  hue: number; // trait-signature of what produced it
  glow: number;
  form: PlantForm; // what was eaten (for future form-gated rules)
  born: number; // flora sim-tick it appeared
}

// Byproduct-chain constants (spec §The rules v1). A substrate not fed on
// within its lifetime fades — bounding entity count and setting the "catch it
// live vs it assembles while you're away" feel. A live substrate gives a
// hue-matching feeder a small per-tick germination chance so a chain creeps
// out over an island-day rather than popping.
export const SUBSTRATE_LIFETIME = 150; // sim-ticks (~half an island-day at ~2s/tick)
export const SUBSTRATE_HUE_MATCH = 0.12; // a feeder germinates within this hue window of the substrate
export const SUBSTRATE_GERMINATE_CHANCE = 0.04; // per live substrate per tick, a matching feeder tries
export const SUBSTRATE_FEEDER_SCATTER = 1.0; // knob to weight the substrate route down later; ×1 in v1

// Distance between two hues around the color wheel (0..0.5) — the same wrap
// `appetite` uses, so germination reads hue exactly as the palate does.
export function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
}

// The plant the wanderer actually means: plantsNear hands back tile-scan
// order, so the truly nearest must be picked by hand.
export function nearestPlant(plants: readonly Plant[], x: number, y: number): Plant | null {
  let best: Plant | null = null;
  let bestD = Infinity;
  for (const p of plants) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export interface FloraTuning {
  maxPlants: number;
  maxPerTile: number;
  simBudget: number; // plants examined per tick
  matureAge: number; // ticks before a plant can reseed
  lifespan: number; // ticks before a plant may die of age
  reproChance: number; // per examination once mature
  reseedRadius: number; // tiles
  mutationAmount: number; // drift per generation
  pollinationRadius: number; // tiles within which same-species neighbors cross
  comfortFraction: number; // above this share of maxPlants, crowding thins the island
  splitDistance: number; // drift beyond this can found a new species
  splitKinDistance: number; // how close kin genomes must be to the founder
  splitKinRadius: number; // tiles searched for that founding cluster
  splitClusterMin: number; // founder + kin needed for a true split
  splitCooldownTicks: number; // island-wide pause between splits (~2s per tick)
  maxDaughterSpecies: number; // per island; keeps the field guide finite
  chains: boolean; // byproduct chains: substrates emitted + germinated. Off ⇒ byte-identical to today.
}

export const DEFAULT_TUNING: FloraTuning = {
  maxPlants: 10000,
  maxPerTile: 4,
  simBudget: 480,
  matureAge: 20,
  lifespan: 900,
  reproChance: 0.06,
  reseedRadius: 3,
  mutationAmount: 0.06,
  pollinationRadius: 2,
  comfortFraction: 0.8,
  splitDistance: 0.3,
  splitKinDistance: 0.14,
  splitKinRadius: 4,
  splitClusterMin: 6,
  splitCooldownTicks: 500,
  maxDaughterSpecies: 12,
  chains: false, // default OFF so every existing test/caller is unchanged; main.ts turns it on
};

// The carpeting forms spread in broad soft sweeps rather than tight clumps —
// the undergrowth that makes a meadow read lush between its showpieces.
const GROUND_COVER: ReadonlySet<PlantForm> = new Set([
  PlantForm.Grass,
  PlantForm.Moss,
  PlantForm.Reed,
]);

// A lineage split, witnessed: surfaced to the HUD and the murmur engine.
export interface SpeciationEvent {
  name: string;
  parentName: string;
  x: number;
  y: number;
  tick: number;
}

// The island's plant life: a per-tile spatial index of genome-bearing
// individuals, seeded in patches at worldgen and drifting ever after.
export interface RestoredFlora {
  tick: number;
  plants: { species: number; genome: Genome; x: number; y: number; born: number }[];
  soil?: number[]; // tile keys the wanderer amended with soil (row-major, per map width)
  rngState?: number; // resume the flora rng stream exactly (slice 5a); absent = fresh makeRng(seed ^ 0xf10a)
  substrates?: Substrate[]; // in-flight byproduct-chain markers; absent = none
  suppressed?: number[]; // suppressedSpecies ids to re-apply; absent = none
  lastSplitTick?: number; // speciation cooldown gate; absent = -Infinity (never split yet)
}

export class Flora {
  all: Plant[] = [];
  byTile = new Map<number, Plant[]>();
  speciesCounts = new Map<number, number>();
  // Species ids stepSubstrates must never re-germinate — Simulator-only, and
  // additive: real play never populates this (nothing writes to it outside
  // the SimKernel's own clearPlantInstances/unsuppressPlantSpecies), so an
  // empty set here means every ordinary Flora is byte-identical to before
  // this field existed. Exists so the World-Lab's "clear a kind" can mean it
  // (see SimKernel.clearPlantInstances): without it, a cleared substrate
  // feeder quietly germinates back from a live disperser's byproduct while
  // the drawer still reads "cleared".
  readonly suppressedSpecies = new Set<number>();
  // Tiles the wanderer has amended with a clod of dug soil — tilled ground the
  // player may sow ANY seed on, its natural habitat set aside. Keyed row-major
  // (ty*width+tx), the same key byTile uses. The wild sim never consults this;
  // only the player's own sow does, so off-habitat planting stays a thing done
  // by hand and never something the island's drift or reseeding can do.
  soilTiles = new Set<number>();
  substrates: Substrate[] = []; // live byproducts; empty unless chains are on
  germinations = 0; // running count of substrate-fed sprouts, for the dev readout
  private germEvents: { x: number; y: number; species: number }[] = []; // recent sprouts, for the witnessed journal edge
  tick = 0;
  readonly tuning: FloraTuning;
  private rng: Rng;
  private home: { tx: number; ty: number } | null = null;
  private events: SpeciationEvent[] = [];
  private lastSplitTick = -Infinity;

  constructor(
    private map: WorldMap,
    private speciesList: PlantSpecies[],
    seed: number,
    tuning: Partial<FloraTuning> = {},
    restored?: RestoredFlora,
  ) {
    this.tuning = { ...DEFAULT_TUNING, ...tuning };
    this.rng = makeRng(restored?.rngState ?? (seed ^ 0xf10a));
    if (restored) {
      this.tick = restored.tick;
      for (const k of restored.soil ?? []) this.soilTiles.add(k);
      for (const p of restored.plants) this.addPlant(p.species, p.genome, p.x, p.y, p.born);
      if (restored.substrates) this.substrates = restored.substrates.map((s) => ({ ...s }));
      if (restored.suppressed) for (const id of restored.suppressed) this.suppressedSpecies.add(id);
      if (restored.lastSplitTick !== undefined) this.lastSplitTick = restored.lastSplitTick;
    } else {
      this.scatter(seed);
    }
  }

  // The wanderer's garden: a 3x3 bed where plants are tended — safe from
  // crowding and quick to breed.
  setHome(tx: number, ty: number): void;
  setHome(none: null): void;
  setHome(txOrNull: number | null, ty?: number): void {
    this.home = txOrNull === null ? null : { tx: txOrNull, ty: ty! };
  }

  inGarden(x: number, y: number): boolean {
    if (!this.home) return false;
    return (
      Math.abs(Math.floor(x / TILE_SIZE) - this.home.tx) <= 1 &&
      Math.abs(Math.floor(y / TILE_SIZE) - this.home.ty) <= 1
    );
  }

  get count(): number {
    return this.all.length;
  }

  // Hand over any speciation events since the last call (and forget them).
  takeEvents(): SpeciationEvent[] {
    if (this.events.length === 0) return [];
    const out = this.events;
    this.events = [];
    return out;
  }

  // Hand over any substrate germinations since the last call (and forget them),
  // so a still wanderer nearby can witness "moss sprouts where a critter fed".
  // Observational — never touches the sim's rng.
  takeGerminations(): { x: number; y: number; species: number }[] {
    if (this.germEvents.length === 0) return [];
    const out = this.germEvents;
    this.germEvents = [];
    return out;
  }

  // The rng stream's current position — captured so a save can resume this
  // exact stream rather than re-seeding it (slice 5a). makeRng always attaches
  // .state, so the assertion is safe.
  rngState(): number {
    return this.rng.state!();
  }

  // A copy of the live substrate markers — for the save to snapshot.
  substratesSnapshot(): Substrate[] {
    return this.substrates.map((s) => ({ ...s }));
  }

  // The speciation-cooldown gate, for the save to snapshot. May be -Infinity
  // when no split has happened yet (not JSON-safe; the caller must guard).
  lastSplitTickValue(): number {
    return this.lastSplitTick;
  }

  plantsInTile(tx: number, ty: number): readonly Plant[] {
    return this.byTile.get(ty * this.map.width + tx) ?? [];
  }

  plantsNear(x: number, y: number, radiusPx: number): Plant[] {
    const out: Plant[] = [];
    const tx0 = Math.max(0, Math.floor((x - radiusPx) / TILE_SIZE));
    const ty0 = Math.max(0, Math.floor((y - radiusPx) / TILE_SIZE));
    const tx1 = Math.min(this.map.width - 1, Math.floor((x + radiusPx) / TILE_SIZE));
    const ty1 = Math.min(this.map.height - 1, Math.floor((y + radiusPx) / TILE_SIZE));
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        for (const p of this.plantsInTile(tx, ty)) {
          if ((p.x - x) ** 2 + (p.y - y) ** 2 <= radiusPx * radiusPx) out.push(p);
        }
      }
    }
    return out;
  }

  // Is this tile a tilled one — ground the wanderer worked a clod of soil into?
  hasSoilTile(tx: number, ty: number): boolean {
    return this.soilTiles.has(ty * this.map.width + tx);
  }

  // Is a plant standing on tilled ground? (world coords, like inGarden.)
  onTilledTile(x: number, y: number): boolean {
    return this.hasSoilTile(Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE));
  }

  // Ground the wanderer tends — the home garden bed, or any tile they've tilled.
  // Tended ground breeds eagerly and is spared the island's crowding-thin.
  private tended(x: number, y: number): boolean {
    return this.inGarden(x, y) || this.onTilledTile(x, y);
  }

  // Work a carried clod into a tile, tilling it so the player may sow any seed
  // there. A quiet no-op (false) off the map's edge; otherwise the tile is
  // remembered until the save forgets it.
  laySoil(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return false;
    this.soilTiles.add(ty * this.map.width + tx);
    return true;
  }

  // The tilled tiles as row-major keys — what the save keeps.
  soilTileKeys(): number[] {
    return [...this.soilTiles];
  }

  // Room for one more plant on a tile: the island not full, the tile not full.
  // The half of the gate that has nothing to do with habitat.
  private hasRoom(key: number): boolean {
    if (this.all.length >= this.tuning.maxPlants) return false;
    const bucket = this.byTile.get(key);
    return !bucket || bucket.length < this.tuning.maxPerTile;
  }

  // The gate every seed the SIM sows must pass to take root: in bounds, on its
  // own habitat, the tile not yet full, the island not yet full. Public so a
  // courier (the beast) can find open, correct-habitat ground before it
  // bothers to drift a seed onto it. This never consults the soil tiles, so
  // drift, propagate, reseeding and scatter can never jump off-habitat.
  rootableAt(species: number, x: number, y: number): boolean {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return false;
    const key = ty * this.map.width + tx;
    if (this.map.tiles[key] !== this.speciesList[species].habitat) return false;
    return this.hasRoom(key);
  }

  // The gate the PLAYER's own sow passes through — and the only one that waives
  // habitat. On a tile amended with soil, ANY species may root (the caps still
  // hold); everywhere else it defers to rootableAt, so an ordinary sow behaves
  // exactly as it always has. The sim never calls this.
  sowableAt(species: number, x: number, y: number): boolean {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return false;
    const key = ty * this.map.width + tx;
    if (!this.soilTiles.has(key)) return this.rootableAt(species, x, y);
    return this.hasRoom(key); // tilled ground: habitat set aside, caps kept
  }

  // Place a plant with no checks — the shared tail of addPlant and sowByPlayer.
  private insert(species: number, genome: Genome, x: number, y: number, born: number): Plant {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    const key = ty * this.map.width + tx;
    let bucket = this.byTile.get(key);
    if (!bucket) {
      bucket = [];
      this.byTile.set(key, bucket);
    }
    const plant: Plant = { species, genome, x, y, born, idx: this.all.length };
    this.all.push(plant);
    bucket.push(plant);
    this.speciesCounts.set(species, (this.speciesCounts.get(species) ?? 0) + 1);
    return plant;
  }

  addPlant(species: number, genome: Genome, x: number, y: number, born: number): Plant | null {
    if (!this.rootableAt(species, x, y)) return null;
    return this.insert(species, genome, x, y, born);
  }

  // The wanderer's own hand setting a seed down: succeeds on the species' own
  // habitat OR on any tile tilled with soil. The one habitat-waiving path.
  sowByPlayer(species: number, genome: Genome, x: number, y: number, born: number): Plant | null {
    if (!this.sowableAt(species, x, y)) return null;
    return this.insert(species, genome, x, y, born);
  }

  removePlant(p: Plant): void {
    const last = this.all[this.all.length - 1];
    this.all[p.idx] = last;
    last.idx = p.idx;
    this.all.pop();
    const key = Math.floor(p.y / TILE_SIZE) * this.map.width + Math.floor(p.x / TILE_SIZE);
    const bucket = this.byTile.get(key);
    if (bucket) {
      const i = bucket.indexOf(p);
      if (i !== -1) bucket.splice(i, 1);
      if (bucket.length === 0) this.byTile.delete(key);
    }
    this.speciesCounts.set(p.species, (this.speciesCounts.get(p.species) ?? 1) - 1);
  }

  // A disperser drops a byproduct where it fed, stamped with the eaten plant's
  // trait-signature. Self-gates on the chains flag — a no-op when off, so the
  // caller (fauna.ts) needs no branch and draws no rng. Stamped with the
  // current tick, which sets its decay clock.
  addSubstrate(x: number, y: number, sig: { hue: number; glow: number; form: PlantForm }): void {
    if (!this.tuning.chains) return;
    this.substrates.push({ x, y, hue: sig.hue, glow: sig.glow, form: sig.form, born: this.tick });
  }

  // A real bite. A young plant is eaten whole; a mature one is set back to
  // sprout and must regrow before it can reseed again — grazing suppresses
  // a patch before it erases it, and a rested patch comes back. Tended
  // garden plants shrug bites off: the gardener's thumb undoes the damage.
  nibble(p: Plant): "consumed" | "grazed" {
    if (this.inGarden(p.x, p.y)) return "grazed";
    if (this.tick - p.born < this.tuning.matureAge) {
      this.removePlant(p);
      return "consumed";
    }
    p.born = this.tick;
    return "grazed";
  }

  // The mutualist visit: a disperser that favors this plant carries a seed of
  // it to nearby open ground — same species, genome drifted one generation by
  // `mutate`, reusing simTick's reseed placement. The visited plant is left
  // standing, unharmed; both gain. This is positive feedback, and its ONLY
  // limit is finite space: `addPlant` refuses a full tile, an off-habitat
  // tile, or the global cap, so when the neighborhood is saturated nothing
  // happens — that saturation is the whole balancer. Drifted dispersal is
  // where co-adaptation lives: the plants that get spread are the ones
  // resident critters visit most, so over island-days the flora quietly bends
  // toward its dispersers — selection made visible, never hard-coded here.
  propagate(p: Plant): boolean {
    const t = this.tuning;
    const px = Math.floor(p.x / TILE_SIZE);
    const py = Math.floor(p.y / TILE_SIZE);
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = px + Math.floor(this.rng() * (2 * t.reseedRadius + 1)) - t.reseedRadius;
      const ty = py + Math.floor(this.rng() * (2 * t.reseedRadius + 1)) - t.reseedRadius;
      const x = tx * TILE_SIZE + 3 + this.rng() * (TILE_SIZE - 6);
      const y = ty * TILE_SIZE + 5 + this.rng() * (TILE_SIZE - 6);
      const genome = mutate(p.genome, this.rng, t.mutationAmount);
      if (this.addPlant(p.species, genome, x, y, this.tick)) return true;
    }
    return false;
  }

  // A pollinator's spread — like propagate, but WIDER and LOWER-density, so a
  // pollination boom reads as natural, airy spread rather than a rigid
  // single-species carpet. It drifts the child across `radius` tiles (wider than
  // the self-seed reseedRadius) and refuses any tile that already holds `maxSame`
  // of this species — a per-cloud density cap set BELOW the per-tile cap, so a
  // neighbourhood fills loosely. Still bounded: it routes through addPlant, so the
  // per-tile + global caps and habitat gate all hold on top. Draws only from the
  // sim rng, exactly as propagate does. Returns true if a seed took root.
  pollinateSpread(p: Plant, radius: number, maxSame: number): boolean {
    const t = this.tuning;
    const px = Math.floor(p.x / TILE_SIZE);
    const py = Math.floor(p.y / TILE_SIZE);
    for (let attempt = 0; attempt < 8; attempt++) {
      const tx = px + Math.floor(this.rng() * (2 * radius + 1)) - radius;
      const ty = py + Math.floor(this.rng() * (2 * radius + 1)) - radius;
      // per-cloud density cap: this bloom won't stack past `maxSame` on one tile,
      // holding the boom below flora's own per-tile ceiling so it stays open
      const bucket = this.byTile.get(ty * this.map.width + tx);
      if (bucket) {
        let same = 0;
        for (const q of bucket) if (q.species === p.species) same++;
        if (same >= maxSame) continue;
      }
      const x = tx * TILE_SIZE + 3 + this.rng() * (TILE_SIZE - 6);
      const y = ty * TILE_SIZE + 5 + this.rng() * (TILE_SIZE - 6);
      const genome = mutate(p.genome, this.rng, t.mutationAmount);
      if (this.addPlant(p.species, genome, x, y, this.tick)) return true;
    }
    return false;
  }

  // One heartbeat of the island (~2s): a budgeted sample of plants ages,
  // dies, and reseeds nearby with drifted genomes. Rain quickens everything
  // a little; the day after rain, the fungi answer threefold; children born
  // under an aurora carry a little of its light for good.
  simTick(weather: { rain?: boolean; bloom?: boolean; aurora?: boolean } = {}): void {
    this.tick++;
    const t = this.tuning;
    const n = Math.min(t.simBudget, this.all.length);
    for (let i = 0; i < n; i++) {
      if (this.all.length === 0) break;
      const p = this.all[Math.floor(this.rng() * this.all.length)];
      const age = this.tick - p.born;
      // crowding: past the comfortable density, the island quietly thins
      // itself — keeps late islands lush without filling every tile.
      // Rare species and tended garden plants are spared.
      const crowd = this.all.length / t.maxPlants - t.comfortFraction;
      if (
        crowd > 0 &&
        (this.speciesCounts.get(p.species) ?? 0) > 12 &&
        !this.tended(p.x, p.y) &&
        this.rng() < crowd * 0.6
      ) {
        this.removePlant(p);
        continue;
      }
      if (age > t.lifespan && this.rng() < 0.15) {
        this.removePlant(p);
        continue;
      }
      let repro = t.reproChance * (this.tended(p.x, p.y) ? 2 : 1); // tended ground breeds eagerly
      if (weather.rain) repro *= 1.6;
      if (weather.bloom && p.genome.form === PlantForm.Fungus) repro *= 3;
      if (age >= t.matureAge && this.rng() < repro) {
        const dtx = Math.floor(this.rng() * (2 * t.reseedRadius + 1)) - t.reseedRadius;
        const dty = Math.floor(this.rng() * (2 * t.reseedRadius + 1)) - t.reseedRadius;
        const tx = Math.floor(p.x / TILE_SIZE) + dtx;
        const ty = Math.floor(p.y / TILE_SIZE) + dty;
        const x = tx * TILE_SIZE + 3 + this.rng() * (TILE_SIZE - 6);
        const y = ty * TILE_SIZE + 5 + this.rng() * (TILE_SIZE - 6);
        // a same-species neighbor in range means the child is a true cross;
        // a lone plant self-seeds with plain drift
        const partners = this.plantsNear(p.x, p.y, t.pollinationRadius * TILE_SIZE).filter(
          (q) => q !== p && q.species === p.species,
        );
        const drift = t.mutationAmount * (weather.rain ? 1.25 : 1); // rain quickens drift
        let genome =
          partners.length > 0
            ? cross(
                p.genome,
                partners[Math.floor(this.rng() * partners.length)].genome,
                this.rng,
                drift,
              )
            : mutate(p.genome, this.rng, drift);
        if (weather.aurora) {
          // aurora-born: the sky's light settles into the lineage
          genome = { ...genome, glow: clampTrait("glow", genome.glow + 0.08 + this.rng() * 0.15) };
        }
        const child = this.addPlant(p.species, genome, x, y, this.tick);
        if (child) this.maybeSpeciate(child);
      }
      // Garden spread: a mature plant on tilled ground now and then colonises an
      // adjacent EMPTY tilled tile with its own kind, so a plot fills itself with
      // what you planted. Habitat is waived — but ONLY ever onto more tilled
      // ground, never the wild, so the off-habitat invariant holds. No tilled
      // tiles ⇒ no plant stands on one ⇒ zero extra rng, islands unchanged.
      if (age >= t.matureAge && this.soilTiles.size > 0 && this.onTilledTile(p.x, p.y)) {
        if (this.rng() < repro) this.spreadToTilledNeighbor(p, weather);
      }
    }
    // Byproduct chains ride on the tail of the tick. Gated so an island with
    // no live substrates (chains off, or simply none emitted yet) draws ZERO
    // extra rng and stays byte-identical to today — the A/B safety valve.
    if (this.tuning.chains && this.substrates.length) this.stepSubstrates();
  }

  // Seed one adjacent, empty, tilled tile with a plant's own (drifted) kind.
  // The garden-spread helper: it waives habitat, but only ever onto tilled
  // ground — so a cultivated plot fills in while the wild is never colonised.
  private spreadToTilledNeighbor(p: Plant, weather: { rain?: boolean }): void {
    if (this.all.length >= this.tuning.maxPlants) return;
    const w = this.map.width;
    const h = this.map.height;
    const ptx = Math.floor(p.x / TILE_SIZE);
    const pty = Math.floor(p.y / TILE_SIZE);
    const open: number[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = ptx + dx;
        const ty = pty + dy;
        if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
        const key = ty * w + tx;
        if (!this.soilTiles.has(key)) continue; // only onto tilled ground
        const bucket = this.byTile.get(key);
        if (!bucket || bucket.length === 0) open.push(key); // and only if unoccupied
      }
    }
    if (open.length === 0) return;
    const key = open[Math.floor(this.rng() * open.length)];
    const tx = key % w;
    const ty = Math.floor(key / w);
    const x = tx * TILE_SIZE + 3 + this.rng() * (TILE_SIZE - 6);
    const y = ty * TILE_SIZE + 5 + this.rng() * (TILE_SIZE - 6);
    const drift = this.tuning.mutationAmount * (weather.rain ? 1.25 : 1);
    this.insert(p.species, mutate(p.genome, this.rng, drift), x, y, this.tick);
  }

  // Expired substrates fade; a live one now and then sprouts a hue-matching
  // substrate-feeder where it lies, via addPlant so per-tile caps and habitat
  // still hold. A germinated feeder is an ordinary plant — eaten in turn it
  // emits its own substrate, so the chain closes itself with no special rule.
  // Trait-windowed, never a named species: any feeder in the hue window on the
  // right habitat can fill the role, so a chain routes around a lost one.
  private stepSubstrates(): void {
    const feeders = this.speciesList.filter((s) => s.substrateFeeder && !this.suppressedSpecies.has(s.id));
    const survivors: Substrate[] = [];
    for (const sub of this.substrates) {
      if (this.tick - sub.born >= SUBSTRATE_LIFETIME) continue; // decayed, unfed
      let consumed = false;
      if (feeders.length && this.rng() < SUBSTRATE_GERMINATE_CHANCE * SUBSTRATE_FEEDER_SCATTER) {
        const tx = Math.floor(sub.x / TILE_SIZE);
        const ty = Math.floor(sub.y / TILE_SIZE);
        const tile = this.map.tiles[ty * this.map.width + tx];
        const matches = feeders.filter(
          (s) => s.habitat === tile && hueGap(s.archetype.hue, sub.hue) <= SUBSTRATE_HUE_MATCH,
        );
        if (matches.length) {
          const s = matches[Math.floor(this.rng() * matches.length)];
          const genome = mutate(s.archetype, this.rng, this.tuning.mutationAmount);
          if (this.addPlant(s.id, genome, sub.x, sub.y, this.tick)) {
            this.germinations++;
            // remember where it sprouted so a watching wanderer's journal can
            // note the link; capped, and drawn from no rng, so it never moves
            // the sim. Drained by takeGerminations each frame.
            if (this.germEvents.length < 256) {
              this.germEvents.push({ x: sub.x, y: sub.y, species: s.id });
            }
            consumed = true; // the substrate is spent on the sprout it fed
          }
        }
      }
      if (!consumed) survivors.push(sub);
    }
    this.substrates = survivors;
  }

  // Speciation: a newborn far from its archetype, surrounded by kin drifted
  // the same way, founds a new species — the cluster crosses over together.
  private maybeSpeciate(child: Plant): void {
    const t = this.tuning;
    if (this.tick - this.lastSplitTick < t.splitCooldownTicks) return;
    const sp = this.speciesList[child.species];
    if (driftDistance(child.genome, sp.archetype) < t.splitDistance) return;
    let daughters = 0;
    for (const s of this.speciesList) if (s.parent !== undefined) daughters++;
    if (daughters >= t.maxDaughterSpecies) return;
    const kin = this.plantsNear(child.x, child.y, t.splitKinRadius * TILE_SIZE).filter(
      (q) => q.species === child.species && driftDistance(q.genome, child.genome) <= t.splitKinDistance,
    ); // includes the child itself
    if (kin.length < t.splitClusterMin) return;
    const next = speciateFrom(sp, this.speciesList.length, child.genome, this.rng, this.tick);
    this.speciesList.push(next);
    for (const q of kin) {
      this.speciesCounts.set(q.species, (this.speciesCounts.get(q.species) ?? 1) - 1);
      q.species = next.id;
    }
    this.speciesCounts.set(next.id, kin.length);
    this.lastSplitTick = this.tick;
    this.events.push({ name: next.name, parentName: sp.name, x: child.x, y: child.y, tick: this.tick });
  }

  // Initial life: noise-patched per species, genomes pre-drifted by smooth
  // fields over (x, y) so geography shows gradients from the first frame.
  private scatter(seed: number): void {
    const { width, height } = this.map;
    const habitatTiles = new Map<Tile, number[]>();
    for (let i = 0; i < this.map.tiles.length; i++) {
      const t = this.map.tiles[i] as Tile;
      let list = habitatTiles.get(t);
      if (!list) habitatTiles.set(t, (list = []));
      list.push(i);
    }
    // the ground splits between the kinds that claim it: a richer species
    // list buys variety, never a solid wall — and the scatter stays well
    // under the global cap instead of truncating the sweep mid-island
    const treeKinds = new Map<Tile, number>();
    const kinds = new Map<Tile, number>();
    for (const sp of this.speciesList) {
      kinds.set(sp.habitat, (kinds.get(sp.habitat) ?? 0) + 1);
      if (sp.archetype.form === PlantForm.Tree) {
        treeKinds.set(sp.habitat, (treeKinds.get(sp.habitat) ?? 0) + 1);
      }
    }
    // one probability, one place: the sweep and its pre-pass must agree
    const baseProb = (sp: PlantSpecies, tx: number, ty: number): number => {
      const patch = fbm(tx / 24, ty / 24, seed + 5000 + sp.id * 131, 3);
      const share = 3.2 / Math.max(3.2, kinds.get(sp.habitat) ?? 1); // 1 at three kinds, ~0.6 at five
      return sp.archetype.form === PlantForm.Tree
        ? (sp.density * (0.12 + 0.36 * patch)) / (treeKinds.get(sp.habitat) ?? 1)
        : GROUND_COVER.has(sp.archetype.form)
          ? share * sp.density * (0.05 + Math.max(0, patch - 0.45) * 1.4) // carpets: broad, soft-edged sweeps
          : share * sp.density * (0.034 + Math.max(0, patch - 0.49) * 1.5); // clusters + sparse loners
    };
    // a cheap pre-pass (one tile in sixteen) sizes the sweep, and a single
    // scale lands the first morning at the island's comfortable fullness —
    // no seed ever slams the cap mid-sweep and starves the south of the map
    let estimate = 0;
    for (let ty = 0; ty < height; ty += 4) {
      for (let tx = 0; tx < width; tx += 4) {
        const tile = this.map.tiles[ty * width + tx] as Tile;
        for (const sp of this.speciesList) {
          if (sp.habitat === tile && !sp.homeland) estimate += 16 * baseProb(sp, tx, ty);
        }
      }
    }
    const budget = this.tuning.comfortFraction * this.tuning.maxPlants;
    const scale = Math.min(1, budget / Math.max(1, estimate));
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const tile = this.map.tiles[ty * width + tx] as Tile;
        for (const sp of this.speciesList) {
          if (sp.habitat !== tile) continue;
          if (sp.homeland && Math.hypot(tx - sp.homeland.x, ty - sp.homeland.y) > sp.homeland.radius) {
            continue; // endemics scatter only in their homeland
          }
          let p = scale * baseProb(sp, tx, ty);
          if (sp.homeland) p = Math.max(p, 0.5); // a small homeland grows dense
          const pocket = pocketAt(this.map, tx, ty);
          if (pocket) p = Math.min(0.9, p * (pocket.deep ? 4 : 3) + 0.15); // pockets grow lush
          if (hash2d(tx, ty, seed ^ (sp.id * 977 + 13)) >= p) continue;
          const jx = hash2d(tx, ty, seed ^ (sp.id * 331 + 7));
          const jy = hash2d(tx, ty, seed ^ (sp.id * 613 + 29));
          const x = tx * TILE_SIZE + 3 + jx * (TILE_SIZE - 6);
          const y = ty * TILE_SIZE + 5 + jy * (TILE_SIZE - 6);
          let genome = this.spatialGenome(sp, tx, ty, seed);
          if (pocket) {
            // in a pocket, every trait runs toward its extreme; deep
            // pockets push further still
            const prng = makeRng(Math.floor(hash2d(tx, ty, seed ^ 0x0c4e7) * 0xffffffff));
            genome = {
              ...genome,
              sat: 1,
              height: clampTrait("height", genome.height * (pocket.deep ? 1.7 : 1.4)),
              petals: clampTrait("petals", genome.petals + (pocket.deep ? 4 : 2)),
              glow: Math.max(genome.glow, (pocket.deep ? 0.85 : 0.7) + prng() * 0.15),
            };
          }
          this.addPlant(sp.id, genome, x, y, -this.tuning.matureAge);
        }
      }
    }
    this.backfillRareSpecies(seed, habitatTiles);
  }

  // A species whose habitat is small can roll zero plants — undiscoverable.
  // Guarantee every species with any habitat at all gets a starter colony.
  private backfillRareSpecies(seed: number, habitatTiles: Map<Tile, number[]>): void {
    const MIN_COLONY = 8;
    const counts = new Map<number, number>();
    for (const p of this.all) counts.set(p.species, (counts.get(p.species) ?? 0) + 1);
    for (const sp of this.speciesList) {
      let tiles = habitatTiles.get(sp.habitat);
      if (tiles && sp.homeland) {
        const { x, y, radius } = sp.homeland;
        tiles = tiles.filter((i) => {
          const tx = i % this.map.width;
          const ty = (i / this.map.width) | 0;
          return Math.hypot(tx - x, ty - y) <= radius;
        });
      }
      if (!tiles || tiles.length === 0) continue; // island truly lacks this habitat
      const rng = makeRng(seed ^ (sp.id * 7919 + 3));
      let have = counts.get(sp.id) ?? 0;
      for (let attempt = 0; attempt < MIN_COLONY * 6 && have < MIN_COLONY; attempt++) {
        const i = tiles[Math.floor(rng() * tiles.length)];
        const tx = i % this.map.width;
        const ty = Math.floor(i / this.map.width);
        const x = tx * TILE_SIZE + 3 + rng() * (TILE_SIZE - 6);
        const y = ty * TILE_SIZE + 5 + rng() * (TILE_SIZE - 6);
        if (this.addPlant(sp.id, this.spatialGenome(sp, tx, ty, seed), x, y, -this.tuning.matureAge)) {
          have++;
        }
      }
    }
  }

  private spatialGenome(sp: PlantSpecies, tx: number, ty: number, seed: number): Genome {
    const g: Genome = { ...sp.archetype };
    NUMERIC_TRAITS.forEach((key, ti) => {
      const [lo, hi] = GENOME_BOUNDS[key];
      const shift = (fbm(tx / 50, ty / 50, seed + sp.id * 31 + ti * 101, 2) - 0.5) * 0.3 * (hi - lo);
      g[key] = clampTrait(key, g[key] + shift);
    });
    const localRng = makeRng(Math.floor(hash2d(tx, ty, seed ^ (sp.id * 47)) * 0xffffffff));
    return mutate(g, localRng, 0.02);
  }
}
