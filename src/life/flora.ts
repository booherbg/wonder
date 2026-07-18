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
}

export const DEFAULT_TUNING: FloraTuning = {
  maxPlants: 8000,
  maxPerTile: 3,
  simBudget: 400,
  matureAge: 20,
  lifespan: 900,
  reproChance: 0.06,
  reseedRadius: 3,
  mutationAmount: 0.06,
  pollinationRadius: 2,
  comfortFraction: 0.72,
  splitDistance: 0.3,
  splitKinDistance: 0.14,
  splitKinRadius: 4,
  splitClusterMin: 6,
  splitCooldownTicks: 500,
  maxDaughterSpecies: 12,
};

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
}

export class Flora {
  all: Plant[] = [];
  byTile = new Map<number, Plant[]>();
  speciesCounts = new Map<number, number>();
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
    this.rng = makeRng(seed ^ 0xf10a);
    if (restored) {
      this.tick = restored.tick;
      for (const p of restored.plants) this.addPlant(p.species, p.genome, p.x, p.y, p.born);
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

  addPlant(species: number, genome: Genome, x: number, y: number, born: number): Plant | null {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return null;
    if (this.all.length >= this.tuning.maxPlants) return null;
    const key = ty * this.map.width + tx;
    if (this.map.tiles[key] !== this.speciesList[species].habitat) return null;
    let bucket = this.byTile.get(key);
    if (bucket && bucket.length >= this.tuning.maxPerTile) return null;
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

  // One heartbeat of the island (~2s): a budgeted sample of plants ages,
  // dies, and reseeds nearby with drifted genomes. Rain quickens everything
  // a little; the day after rain, the fungi answer threefold.
  simTick(weather: { rain?: boolean; bloom?: boolean } = {}): void {
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
        !this.inGarden(p.x, p.y) &&
        this.rng() < crowd * 0.6
      ) {
        this.removePlant(p);
        continue;
      }
      if (age > t.lifespan && this.rng() < 0.15) {
        this.removePlant(p);
        continue;
      }
      let repro = t.reproChance * (this.inGarden(p.x, p.y) ? 2 : 1); // gardens breed eagerly
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
        const genome =
          partners.length > 0
            ? cross(
                p.genome,
                partners[Math.floor(this.rng() * partners.length)].genome,
                this.rng,
                drift,
              )
            : mutate(p.genome, this.rng, drift);
        const child = this.addPlant(p.species, genome, x, y, this.tick);
        if (child) this.maybeSpeciate(child);
      }
    }
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
    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const tile = this.map.tiles[ty * width + tx] as Tile;
        for (const sp of this.speciesList) {
          if (sp.habitat !== tile) continue;
          if (sp.homeland && Math.hypot(tx - sp.homeland.x, ty - sp.homeland.y) > sp.homeland.radius) {
            continue; // endemics scatter only in their homeland
          }
          const patch = fbm(tx / 24, ty / 24, seed + 5000 + sp.id * 131, 3);
          let p =
            sp.archetype.form === PlantForm.Tree
              ? sp.density * (0.15 + 0.45 * patch)
              : sp.density * (0.025 + Math.max(0, patch - 0.5) * 1.5); // clusters + sparse loners
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
