// The headless life kernel — the World-Lab's reusable muscle. It wraps the
// tested Flora + critter set + CensusLog behind ONE deterministic step(): no
// renderer, no player, all randomness through seeded rng streams, so N steps
// replay bit-identically from a seed. This is exactly what Doors A (deep-time)
// and B (the forge) fork/preview with later — so it stays clean and pure.

import { makeRng, Rng } from "../core/rng";
import { TILE_SIZE } from "../world/config";
import { WorldMap } from "../world/types";
import { CensusLog } from "./census";
import { Critter, CritterContext, CritterRole, CritterSpecies, updateCritter } from "./fauna";
import { Flora, FloraTuning, Plant, RestoredFlora } from "./flora";
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
  restoredFlora?: RestoredFlora; // resume a saved construct's flora (slice 5a); absent = empty bench
  critterRngState?: number; // resume the critter rng stream; absent = fresh makeRng(seed ^ 0x5112)
  placeRngState?: number; // resume the placement rng stream; absent = fresh makeRng(seed ^ 0x71a2)
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
      init.restoredFlora ?? { tick: 0, plants: [] }, // empty bench unless resuming a saved construct
    );
    this.census = new CensusLog(init.censusInterval ?? 1, 240);
    this.critterRng = makeRng(init.critterRngState ?? (init.seed ^ 0x5112));
    this.placeRng = makeRng(init.placeRngState ?? (init.seed ^ 0x71a2));
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

  // Stream-position accessors — captured so a save can resume these exact
  // streams rather than re-seeding them (slice 5a, mirrors Flora.rngState()).
  // makeRng always attaches .state, so the assertion is safe.
  critterRngState(): number {
    return this.critterRng.state!();
  }

  placeRngState(): number {
    return this.placeRng.state!();
  }

  // Erase one tile's life — plants rooted there and critters standing there.
  // Species defs stay put (same peaceful posture as clear*Instances).
  eraseAtTile(tx: number, ty: number): { plants: number; critters: number } {
    const doomed = this.flora.all.filter(
      (p) => Math.floor(p.x / TILE_SIZE) === tx && Math.floor(p.y / TILE_SIZE) === ty,
    );
    for (const p of doomed) this.flora.removePlant(p);
    const before = this.critters.length;
    this.critters = this.critters.filter(
      (c) => !(Math.floor(c.x / TILE_SIZE) === tx && Math.floor(c.y / TILE_SIZE) === ty),
    );
    return { plants: doomed.length, critters: before - this.critters.length };
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
    // "cleared" must mean it: a substrate-feeder id, once cleared, is
    // suppressed from stepSubstrates' own germination roll (flora.ts) —
    // otherwise a live disperser's byproduct germinates it right back while
    // the drawer still shows the tombstone. See unsuppressPlantSpecies below.
    this.flora.suppressedSpecies.add(id);
    return doomed.length;
  }

  // The other half of clearPlantInstances' suppression: bringing a kind back
  // (the drawer's revive, or a curate re-seed) lifts the germination ban so
  // it can grow again through every route, not just a direct place.
  unsuppressPlantSpecies(id: number): void {
    this.flora.suppressedSpecies.delete(id);
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

  // Live-adjust the running Flora's tuning IN PLACE — the pressures panel's one
  // lever (the evolutionary layer, slice 4). Flora reads this.tuning fresh every
  // simTick/maybeSpeciate/propagate/hasRoom/stepSubstrates (verified in flora.ts —
  // NO field is captured at construction), so a patch takes effect on the very
  // NEXT step() with NO rebuild and NO loss of the current plant/critter/tick
  // state. A deterministic parameter change: it adds no rng draws, so the same
  // seed + placements + tuning schedule + step count ⇒ an identical run. The
  // `readonly tuning` field forbids reassignment; its number fields are mutable,
  // so Object.assign is the in-place write. Additive + Simulator-only.
  setTuning(patch: Partial<FloraTuning>): void {
    Object.assign(this.flora.tuning, patch);
  }

  // Selection strength's other half: set a critter KIND's role live (a grazer
  // bites / a disperser scatters). updateCritter reads sp.role fresh, so a flip
  // lands on the next step. A roster op, never a violent kill — the peaceful
  // pillar holds (a grazer nibbles; nothing dies).
  setCritterRole(id: number, role: CritterRole): void {
    const prev = this.critterSpecies[id].role;
    // Leaving the nutrient-shuttle role mid-carry would ORPHAN the ferried load:
    // the drop only ever runs in the shuttle's own nibble arm (fauna.ts), which
    // never fires again once the role changes. So set any live carry down where
    // the critter stands — count conserved, the peaceful pillar (qa functionality
    // I2). addSubstrate self-gates on the chains flag (a no-op off the bench).
    if (prev === "nutrient-shuttle" && role !== "nutrient-shuttle") {
      for (const c of this.critters) {
        if (c.species === id && c.carriedSubstrate) {
          this.flora.addSubstrate(c.x, c.y, c.carriedSubstrate);
          c.carriedSubstrate = undefined;
        }
      }
    }
    this.critterSpecies[id].role = role;
  }

  // Run time. "plants" scrubs flora + census only (fast); "full" also steps
  // every critter headless — a null player (nothing draws them to a hearth) and
  // an empty context, so co-adaptation (grazing sets plants back, dispersal
  // spreads + emits substrate) actually happens. Deterministic end to end.
  step(nTicks = 1, fidelity: Fidelity = "full", critterCtx: CritterContext = {}): void {
    for (let i = 0; i < nTicks; i++) {
      this.flora.simTick();
      if (fidelity === "full") {
        for (const c of this.critters) {
          updateCritter(c, KERNEL_DT, this.map, this.flora, this.critterSpecies, null, this.critterRng, critterCtx);
        }
      }
      this.census.sample(this.flora.tick, this.flora.speciesCounts);
    }
  }
}
