import { Genome } from "../life/genome";

// A seed remembers exactly which plant it came from — species and the
// individual's drifted genome, not the species archetype.
export interface Seed {
  species: number;
  genome: Genome;
}

export interface Inventory {
  seeds: Seed[];
}

export const INV_CAP = 8;

export function emptyInventory(): Inventory {
  return { seeds: [] };
}

export function gather(inv: Inventory, seed: Seed): Inventory | null {
  if (inv.seeds.length >= INV_CAP) return null;
  return { seeds: [...inv.seeds, seed] };
}

// FIFO: the seed you gathered first is the one you sow first.
export function sow(inv: Inventory): [Inventory, Seed] | null {
  if (inv.seeds.length === 0) return null;
  const [first, ...rest] = inv.seeds;
  return [{ seeds: rest }, first];
}
