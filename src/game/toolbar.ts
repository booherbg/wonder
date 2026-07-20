import { Genome } from "../life/genome";

// The wanderer's hotbar is three functional slots — a bare hand for gathering,
// a hoe for tilling, and one seed pouch — and a single Interact acts with
// whichever is selected. Seeds never sprawl into a slot each: the pouch holds
// the whole seed bank but only ever offers the one *loaded* varietal. Run a
// varietal out and the pouch goes empty; it never rolls over to another kind,
// so you can't plant seeds you didn't mean to. Materials ride along as plain
// carried counts, off the hotbar.

export type SlotName = "hand" | "hoe" | "pouch";
export type MaterialKind = "wood" | "stone" | "rush";

// One kind of seed and every gathered individual of it — a FIFO queue of
// genomes, so a stack never forgets which parent each seed came from.
export interface Varietal {
  species: number;
  genomes: Genome[];
}

export interface Toolbar {
  selected: SlotName; // which of the three slots Interact will use
  bank: Varietal[]; // every seed varietal carried
  active: number | null; // index into bank of the loaded varietal — null when the pouch is empty
  materials: Record<MaterialKind, number>;
}

const SLOTS: SlotName[] = ["hand", "hoe", "pouch"];

export function emptyToolbar(): Toolbar {
  return { selected: "hand", bank: [], active: null, materials: { wood: 0, stone: 0, rush: 0 } };
}

// The loaded varietal, or null when the pouch is empty.
export function loaded(bar: Toolbar): Varietal | null {
  return bar.active === null ? null : (bar.bank[bar.active] ?? null);
}

// Gather a seed into the bank: a new kind opens a varietal, a known kind stacks.
// An empty pouch loads the seed so the first one is ready to plant — but a pouch
// already holding a kind is never switched out from under you.
export function gatherSeed(bar: Toolbar, species: number, genome: Genome): Toolbar {
  const i = bar.bank.findIndex((v) => v.species === species);
  let bank: Varietal[];
  let idx: number;
  if (i === -1) {
    bank = [...bar.bank, { species, genomes: [genome] }];
    idx = bank.length - 1;
  } else {
    bank = [...bar.bank];
    bank[i] = { species, genomes: [...bank[i].genomes, genome] };
    idx = i;
  }
  return { ...bar, bank, active: bar.active === null ? idx : bar.active };
}

export function gatherMaterial(bar: Toolbar, material: MaterialKind): Toolbar {
  return { ...bar, materials: { ...bar.materials, [material]: bar.materials[material] + 1 } };
}

// Load a varietal by species — the deliberate switch, made from the backpack.
// An unknown kind leaves the pouch as it was.
export function loadSeed(bar: Toolbar, species: number): Toolbar {
  const i = bar.bank.findIndex((v) => v.species === species);
  return i === -1 ? bar : { ...bar, active: i };
}

// Quick-swap the loaded varietal among the bank, wrapping — the fluid-play
// alternative to opening the backpack.
export function cycleLoaded(bar: Toolbar, dir: 1 | -1): Toolbar {
  if (bar.bank.length === 0) return { ...bar, active: null };
  const cur = bar.active ?? 0;
  return { ...bar, active: (cur + dir + bar.bank.length) % bar.bank.length };
}

// Drop a varietal from the bank and empty the pouch (no auto-advance). Shared
// by planting-out and tossing-out.
function spend(bar: Toolbar): Toolbar {
  return { ...bar, bank: bar.bank.filter((_, i) => i !== bar.active), active: null };
}

// Plant one of the loaded varietal: its oldest seed goes. Spend the last one and
// the pouch goes EMPTY — it never loads the next kind. Null when nothing's loaded.
export function plantLoaded(bar: Toolbar): [Toolbar, { species: number; genome: Genome }] | null {
  const v = loaded(bar);
  if (!v || v.genomes.length === 0) return null;
  const [genome, ...rest] = v.genomes;
  const picked = { species: v.species, genome };
  if (rest.length === 0) return [spend(bar), picked];
  const bank = [...bar.bank];
  bank[bar.active!] = { ...v, genomes: rest };
  return [{ ...bar, bank }, picked];
}

// Give one loaded seed back to the wind (the old toss). Emptying the pouch when
// the last one goes, same as planting it out.
export function tossLoaded(bar: Toolbar): Toolbar {
  const v = loaded(bar);
  if (!v) return bar;
  if (v.genomes.length <= 1) return spend(bar);
  const bank = [...bar.bank];
  bank[bar.active!] = { ...v, genomes: v.genomes.slice(1) };
  return { ...bar, bank };
}

export function selectSlot(bar: Toolbar, name: SlotName): Toolbar {
  return { ...bar, selected: name };
}

export function cycleSlot(bar: Toolbar, dir: 1 | -1): Toolbar {
  const i = SLOTS.indexOf(bar.selected);
  return { ...bar, selected: SLOTS[(i + dir + SLOTS.length) % SLOTS.length] };
}

// Rebuild a bar from a legacy save: the old flat seed list (grouped into the
// bank, its first kind loaded) and the old material counts. The carried soil
// clod is gone, so it's dropped.
export function migrate(
  seeds: { species: number; genome: Genome }[],
  mat: { wood?: number; stone?: number; rush?: number; soil?: number },
): Toolbar {
  let bar = emptyToolbar();
  for (const s of seeds) bar = gatherSeed(bar, s.species, s.genome);
  return { ...bar, materials: { wood: mat.wood ?? 0, stone: mat.stone ?? 0, rush: mat.rush ?? 0 } };
}
