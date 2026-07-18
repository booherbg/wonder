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

// FIFO with a fit check: the oldest seed that can grow here is the one
// sown — a stubborn seed on top never blocks the pouch.
export function sow(
  inv: Inventory,
  fits: (seed: Seed) => boolean = () => true,
): [Inventory, Seed] | null {
  const i = inv.seeds.findIndex(fits);
  if (i === -1) return null;
  const seeds = [...inv.seeds];
  const [picked] = seeds.splice(i, 1);
  return [{ seeds }, picked];
}

// Give the oldest seed back to the wind.
export function toss(inv: Inventory): [Inventory, Seed] | null {
  return sow(inv);
}
