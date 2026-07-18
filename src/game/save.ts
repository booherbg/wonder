import { Plant } from "../life/flora";
import { Genome, NUMERIC_TRAITS, PlantForm } from "../life/genome";
import { PlantSpecies } from "../life/species";
import { Inventory } from "./inventory";

// A world is worth keeping because of what it has BECOME: the drifted
// genomes. Everything else regrows from the seed. Compact format: traits
// rounded to 3 decimals, form recovered from the species archetype
// (form never mutates).

export interface SavedWorld {
  v: 1;
  seed: number;
  tick: number;
  savedAt: number; // epoch ms — lets the island live while you're away
  player: [number, number];
  home: [number, number] | null;
  inv: number[][]; // [species, ...traits]
  plants: number[][]; // [species, x, y, born, ...traits]
  daughters?: SavedDaughter[]; // species that arose here after worldgen
}

// A daughter species is the one thing besides genomes the seed can't regrow.
export interface SavedDaughter {
  name: string;
  habitat: number;
  parent: number;
  density: number;
  form: number;
  traits: number[]; // packGenome order
  born: number; // flora tick of the split
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function packGenome(g: Genome): number[] {
  return NUMERIC_TRAITS.map((k) => r3(g[k]));
}

export function unpackGenome(form: PlantForm, vals: number[]): Genome {
  const g = { form } as Genome;
  NUMERIC_TRAITS.forEach((k, i) => {
    g[k] = vals[i];
  });
  return g;
}

export function packWorld(
  seed: number,
  tick: number,
  player: { x: number; y: number },
  home: { x: number; y: number } | null,
  inventory: Inventory,
  plants: readonly Plant[],
  savedAt: number,
  daughters: readonly PlantSpecies[] = [],
): SavedWorld {
  return {
    v: 1,
    seed,
    tick,
    savedAt,
    player: [r1(player.x), r1(player.y)],
    home: home ? [home.x, home.y] : null,
    inv: inventory.seeds.map((s) => [s.species, ...packGenome(s.genome)]),
    plants: plants.map((p) => [p.species, r1(p.x), r1(p.y), p.born, ...packGenome(p.genome)]),
    daughters: daughters.map((s) => ({
      name: s.name,
      habitat: s.habitat,
      parent: s.parent ?? 0,
      density: r3(s.density),
      form: s.archetype.form,
      traits: packGenome(s.archetype),
      born: s.bornTick ?? 0,
    })),
  };
}

// Daughter species arose after worldgen, so the seed can't rebuild them:
// re-append them (in saved order, so plant indices resolve unchanged).
export function restoreDaughters(saved: SavedWorld, species: PlantSpecies[]): void {
  for (const d of saved.daughters ?? []) {
    if (d.parent < 0 || d.parent >= species.length) continue;
    species.push({
      id: species.length,
      name: d.name,
      habitat: d.habitat,
      archetype: unpackGenome(d.form, d.traits),
      density: d.density,
      sport: false,
      parent: d.parent,
      bornTick: d.born,
    });
  }
}

export function restorePlants(
  saved: SavedWorld,
  species: PlantSpecies[],
): { species: number; genome: Genome; x: number; y: number; born: number }[] {
  const out: { species: number; genome: Genome; x: number; y: number; born: number }[] = [];
  for (const row of saved.plants) {
    const sp = row[0];
    if (sp < 0 || sp >= species.length) continue;
    out.push({
      species: sp,
      x: row[1],
      y: row[2],
      born: row[3],
      genome: unpackGenome(species[sp].archetype.form, row.slice(4)),
    });
  }
  return out;
}

export function restoreInventory(saved: SavedWorld, species: PlantSpecies[]): Inventory {
  return {
    seeds: saved.inv
      .filter((row) => row[0] >= 0 && row[0] < species.length)
      .map((row) => ({
        species: row[0],
        genome: unpackGenome(species[row[0]].archetype.form, row.slice(1)),
      })),
  };
}

export function worldKey(seed: number): string {
  return `wander.world.${seed}`;
}

export const WORLD_INDEX_KEY = "wander.worlds";
export const MAX_SAVED_WORLDS = 8;
