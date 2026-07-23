// The headless life kernel — the World-Lab's reusable muscle. It wraps the
// tested Flora + critter set + CensusLog behind ONE deterministic step(): no
// renderer, no player, all randomness through seeded rng streams, so N steps
// replay bit-identically from a seed. This is exactly what Doors A (deep-time)
// and B (the forge) fork/preview with later — so it stays clean and pure.

import { makeRng, Rng } from "../core/rng";
import { TILE_SIZE } from "../world/config";
import { WorldMap } from "../world/types";
import { CensusLog } from "./census";
import { Critter, CritterSpecies, updateCritter } from "./fauna";
import { Flora, FloraTuning, Plant } from "./flora";
import { mutate } from "./genome";
import { PlantSpecies } from "./species";

export type Fidelity = "plants" | "full";

// One tick advances the island one heartbeat AND gives every critter a fixed
// slice of think-time. A constant (never a wall-clock dt) is what keeps the
// run deterministic; ~0.5s is brisk enough that a placed critter crosses a few
// tiles and closes a chain within a watchable number of steps.
export const KERNEL_DT = 0.5;

export interface KernelInit {
  map: WorldMap;
  plantSpecies: PlantSpecies[];
  critterSpecies: CritterSpecies[];
  seed: number;
  tuning?: Partial<FloraTuning>;
  censusInterval?: number; // sim-ticks between census samples (default 1: bench feedback is immediate)
}

export class SimKernel {
  readonly map: WorldMap;
  readonly flora: Flora;
  readonly census: CensusLog;
  readonly plantSpecies: PlantSpecies[];
  readonly critterSpecies: CritterSpecies[];
  critters: Critter[] = [];
  private critterRng: Rng; // the one stream updateCritter draws from
  private placeRng: Rng; // placement drift + a critter's starting jitter — kept off the step stream

  constructor(init: KernelInit) {
    this.map = init.map;
    this.plantSpecies = init.plantSpecies;
    this.critterSpecies = init.critterSpecies;
    // EMPTY flora: a restored block with no plants means scatter() never runs —
    // the construct is a blank bench you populate by hand. chains ON so
    // substrate feeders can germinate and a chain can visibly close.
    this.flora = new Flora(
      init.map,
      init.plantSpecies,
      init.seed,
      { chains: true, ...(init.tuning ?? {}) },
      { tick: 0, plants: [] },
    );
    this.census = new CensusLog(init.censusInterval ?? 1, 240);
    this.critterRng = makeRng(init.seed ^ 0x5112);
    this.placeRng = makeRng(init.seed ^ 0x71a2);
  }

  get tick(): number {
    return this.flora.tick;
  }
  critterCount(): number {
    return this.critters.length;
  }
  speciesCounts(): ReadonlyMap<number, number> {
    return this.flora.speciesCounts;
  }

  // Set one plant of a species down (world px). Habitat-gated exactly as the
  // wild sim: addPlant refuses an off-habitat or full tile (returns null), so a
  // grass plant simply won't root on sand — the spec's "paint water first"
  // answer, minus the (deferred) biome brush.
  placePlant(speciesId: number, wx: number, wy: number): Plant | null {
    const arch = this.plantSpecies[speciesId].archetype;
    const genome = mutate(arch, this.placeRng, 0.03); // a hair of drift so a patch isn't a photocopy
    return this.flora.addPlant(speciesId, genome, wx, wy, this.flora.tick);
  }

  // Set one critter down (world px). Built as spawnCritters shapes them, but at
  // the click, not a den. Draws only from placeRng, so placement never perturbs
  // the step stream.
  placeCritter(speciesId: number, wx: number, wy: number): Critter {
    // anchor this kind's den to where it's dropped — otherwise findDen fell back to
    // map.spawn (no plants on the empty construct) and the critter drifts to center.
    // den lives on the shared CritterSpecies record, so placing resets the whole
    // kind's home — fine for slice 1's place-one/few use.
    this.critterSpecies[speciesId].den = { x: Math.floor(wx / TILE_SIZE), y: Math.floor(wy / TILE_SIZE) };
    const c: Critter = {
      species: speciesId,
      x: wx,
      y: wy,
      state: "idle",
      targetX: wx,
      targetY: wy,
      stateTime: this.placeRng() * 2,
      hopPhase: this.placeRng() * 6.28,
      facing: this.placeRng() < 0.5 ? 1 : -1,
      energy: 0.5 + this.placeRng() * 0.4,
      curiosity: 0,
      mood: "content",
    };
    this.critters.push(c);
    return c;
  }

  // Append a PICKED plant kind — its id is its array index (the invariant
  // placePlant, Flora.addPlant, and flora speciation all rely on: they index
  // plantSpecies[id]). Flora holds this very array by reference, so the new
  // kind is live the instant it's pushed. Called only from the bench's roll
  // pane, never by step().
  introducePlantSpecies(sp: PlantSpecies): number {
    const id = this.plantSpecies.length;
    sp.id = id;
    this.plantSpecies.push(sp);
    return id;
  }

  introduceCritterSpecies(sp: CritterSpecies): number {
    const id = this.critterSpecies.length;
    sp.id = id;
    this.critterSpecies.push(sp);
    return id;
  }

  // Clear a kind's live instances — its population falls to zero — WITHOUT
  // removing the species record (ids are positional; splicing would renumber
  // every later kind and every placed plant's `.species`). The drawer keeps the
  // definition and can bring it back. Peaceful: a roster op, not a violent kill
  // (the spec's "populations rise and fall"). removePlant maintains
  // speciesCounts, so the count reads 0 afterward.
  clearPlantInstances(id: number): number {
    const doomed = this.flora.all.filter((p) => p.species === id);
    for (const p of doomed) this.flora.removePlant(p);
    return doomed.length;
  }

  clearCritterInstances(id: number): number {
    const before = this.critters.length;
    this.critters = this.critters.filter((c) => c.species !== id);
    return before - this.critters.length;
  }

  critterCountOf(id: number): number {
    let n = 0;
    for (const c of this.critters) if (c.species === id) n++;
    return n;
  }

  // Run time. "plants" scrubs flora + census only (fast); "full" also steps
  // every critter headless — a null player (nothing draws them to a hearth) and
  // an empty context, so co-adaptation (grazing sets plants back, dispersal
  // spreads + emits substrate) actually happens. Deterministic end to end.
  step(nTicks = 1, fidelity: Fidelity = "full"): void {
    for (let i = 0; i < nTicks; i++) {
      this.flora.simTick();
      if (fidelity === "full") {
        for (const c of this.critters) {
          updateCritter(c, KERNEL_DT, this.map, this.flora, this.critterSpecies, null, this.critterRng, {});
        }
      }
      this.census.sample(this.flora.tick, this.flora.speciesCounts);
    }
  }
}
