import { Rng, makeRng } from "../core/rng";
import { Tile } from "../world/types";
import { Genome, PlantForm, clampTrait } from "./genome";

export interface PlantSpecies {
  id: number;
  name: string;
  habitat: Tile; // the tile type this species lives on
  archetype: Genome; // the "true" form; individuals drift away from it
  density: number; // 0..1 relative abundance within its habitat
  sport: boolean; // the island's one exaggerated oddball
  parent?: number; // set when this species arose here, split from another
  bornTick?: number; // flora tick of the split
}

// which forms can appear in each habitat, roughly weighted by repetition
const HABITAT_FORMS: ReadonlyArray<readonly [Tile, readonly PlantForm[]]> = [
  [Tile.Grass, [PlantForm.Flower, PlantForm.Flower, PlantForm.Flower, PlantForm.Shrub, PlantForm.Fungus]],
  [Tile.Forest, [PlantForm.Tree, PlantForm.Fungus, PlantForm.Shrub, PlantForm.Flower, PlantForm.Fern, PlantForm.Fern]],
  [Tile.Sand, [PlantForm.Shrub, PlantForm.Shrub, PlantForm.Flower]],
  [Tile.ShallowWater, [PlantForm.Flower, PlantForm.Shrub, PlantForm.Coral, PlantForm.Coral]],
  [Tile.Rock, [PlantForm.Fungus, PlantForm.Fungus, PlantForm.Shrub]],
  [Tile.Marsh, [PlantForm.Flower, PlantForm.Shrub, PlantForm.Fungus, PlantForm.Fungus, PlantForm.Fern]],
];

// per-form archetype trait ranges: [heightLo, heightHi, glowHi]
const FORM_RANGES: Record<PlantForm, { height: [number, number]; glowMax: number }> = {
  [PlantForm.Flower]: { height: [0.15, 0.55], glowMax: 0.6 },
  [PlantForm.Shrub]: { height: [0.2, 0.6], glowMax: 0.4 },
  [PlantForm.Tree]: { height: [0.55, 1], glowMax: 0.3 },
  [PlantForm.Fungus]: { height: [0.1, 0.45], glowMax: 0.9 },
  [PlantForm.Fern]: { height: [0.2, 0.6], glowMax: 0.5 },
  [PlantForm.Coral]: { height: [0.15, 0.6], glowMax: 0.9 }, // reefs light the tide nights
};

function sampleArchetype(form: PlantForm, rng: Rng): Genome {
  const r = FORM_RANGES[form];
  return {
    form,
    hue: rng(), // the full wheel — nothing says leaves must be green here
    hue2: rng(),
    sat: 0.5 + rng() * 0.5,
    height: r.height[0] + rng() * (r.height[1] - r.height[0]),
    spread: 0.25 + rng() * 0.6,
    petals: 3 + Math.floor(rng() * 7),
    leaves: Math.floor(rng() * 4),
    lean: (rng() - 0.5) * 0.8,
    glow: rng() * r.glowMax,
  };
}

export const SYLLABLES = [
  "lu", "mi", "ra", "vel", "tho", "ka", "sil", "fen", "or", "ash",
  "bel", "cyn", "du", "ma", "ri", "zel", "qui", "nor", "pol", "ith",
  "ova", "yl", "tris", "hum", "sae",
];

const FORM_EPITHETS: Record<PlantForm, readonly string[]> = {
  [PlantForm.Flower]: ["bloom", "bell", "star", "cup", "plume", "whorl"],
  [PlantForm.Shrub]: ["bush", "tuft", "sprawl", "briar", "knot"],
  [PlantForm.Tree]: ["wood", "crown", "reach", "spire", "bough"],
  [PlantForm.Fungus]: ["cap", "veil", "lantern", "spore", "gill"],
  [PlantForm.Fern]: ["frond", "curl", "feather", "fan", "lace"],
  [PlantForm.Coral]: ["branch", "horn", "reef", "garden", "antler"],
};

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function speciesName(rng: Rng, genome: Genome): string {
  const syl = () => SYLLABLES[Math.floor(rng() * SYLLABLES.length)];
  let word = syl() + syl();
  if (rng() < 0.4) word += syl();
  const epithets = FORM_EPITHETS[genome.form];
  let epithet = epithets[Math.floor(rng() * epithets.length)];
  if (genome.glow > 0.55) epithet = "glow" + epithet;
  else if (genome.height > 0.75) epithet = "tall" + epithet;
  else if (genome.petals >= 8) epithet = "many" + epithet;
  return `${cap(word)} ${cap(epithet)}`;
}

// A lineage that has drifted far enough becomes its own kind: a fresh word,
// the family epithet carried down, and a mark to show it arose on this island
// rather than arriving with it.
export function speciateFrom(
  parent: PlantSpecies,
  id: number,
  archetype: Genome,
  rng: Rng,
  bornTick: number,
): PlantSpecies {
  const syl = () => SYLLABLES[Math.floor(rng() * SYLLABLES.length)];
  let word = syl() + syl();
  if (rng() < 0.4) word += syl();
  let epithet = parent.name.replace(/[✶✧]/gu, "").trim().split(" ").pop()!.toLowerCase();
  for (const pre of ["glow", "tall", "many"]) {
    if (epithet.startsWith(pre) && epithet.length > pre.length) epithet = epithet.slice(pre.length);
  }
  if (archetype.glow > 0.55) epithet = "glow" + epithet;
  else if (archetype.height > 0.75) epithet = "tall" + epithet;
  else if (archetype.petals >= 8) epithet = "many" + epithet;
  return {
    id,
    name: `${cap(word)} ${cap(epithet)} ✧`,
    habitat: parent.habitat,
    archetype: { ...archetype },
    density: parent.density,
    sport: false,
    parent: parent.id,
    bornTick,
  };
}

// The island's flora: 2-4 species per habitat, exactly one "sport" oddball,
// and always at least one true tree for the forests.
export function generatePlantSpecies(seed: number): PlantSpecies[] {
  const rng = makeRng(seed ^ 0x5eed5);
  const out: PlantSpecies[] = [];
  for (const [habitat, forms] of HABITAT_FORMS) {
    const n = 2 + Math.floor(rng() * 3); // 2-4 species
    for (let i = 0; i < n; i++) {
      let form = forms[Math.floor(rng() * forms.length)];
      if (habitat === Tile.Forest && i === 0) form = PlantForm.Tree; // forests get their tree
      const archetype = sampleArchetype(form, rng);
      out.push({
        id: out.length,
        name: speciesName(rng, archetype),
        habitat,
        archetype,
        density: form === PlantForm.Tree ? 0.7 + rng() * 0.3 : 0.3 + rng() * 0.7,
        sport: false,
      });
    }
  }
  // one sport per island: turned all the way up
  const sportIdx = Math.floor(rng() * out.length);
  const s = out[sportIdx];
  s.sport = true;
  s.archetype = {
    ...s.archetype,
    height: clampTrait("height", s.archetype.height * 1.6),
    sat: 1,
    glow: 0.85 + rng() * 0.15,
    petals: clampTrait("petals", s.archetype.petals + 3),
  };
  s.name += " ✶";
  return out;
}
