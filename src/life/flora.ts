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

  // The gate every seed must pass to take root: in bounds, on its own
  // habitat, the tile not yet full, the island not yet full. Public so a
  // courier (the beast) can find open, correct-habitat ground before it
  // bothers to drift a seed onto it.
  rootableAt(species: number, x: number, y: number): boolean {
    const tx = Math.floor(x / TILE_SIZE);
    const ty = Math.floor(y / TILE_SIZE);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return false;
    if (this.all.length >= this.tuning.maxPlants) return false;
    const key = ty * this.map.width + tx;
    if (this.map.tiles[key] !== this.speciesList[species].habitat) return false;
    const bucket = this.byTile.get(key);
    return !bucket || bucket.length < this.tuning.maxPerTile;
  }

  addPlant(species: number, genome: Genome, x: number, y: number, born: number): Plant | null {
    if (!this.rootableAt(species, x, y)) return null;
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
