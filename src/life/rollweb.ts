// Roll a foodchain / a web — a MATCHED SET of kinds built to interlock into a
// CLOSABLE byproduct chain (spec §"The evolutionary layer"). foodweb.ts only
// SCORES a species set (chainStats/chainLinks read what links already exist —
// there is no "build a matched chain" path), so this SYNTHESISES the set and the
// tests VERIFY closure with the sim's own rules: appetite/APPETITE_MIN (a
// disperser eats a plant) + hueGap/SUBSTRATE_HUE_MATCH (a feeder germinates on a
// byproduct). Reuses roll.ts for real, named candidate kinds + setCritterTraits
// to aim a disperser's palate; no genome/species/matching logic is re-implemented.
//
// Each chain closes with ONE disperser: fauna.appetite gates HARD on form
// equality (`if (g.form !== palate.form) return 0`), so a single palate eats one
// plant FORM. Therefore the source AND the feeder share the chain's (form, hue)
// family — the feeder is merely FLAGGED substrateFeeder — and the disperser eats
// the source (→ byproduct at hue H) AND the feeder that wakes on it (→ the loop
// continues). Distinct real names/genomes keep the two plants legible.

import { CritterSpecies, Palate } from "./fauna";
import { PlantForm } from "./genome";
import { PlantSpecies, generatePlantSpecies } from "./species";
import { Tile, WorldMap } from "../world/types";
import { rollCritterBatch, rollPlantBatch, setCritterTraits } from "./roll";

// forms a disperser can actually eat — fauna excludes Tree/Coral from a
// critter's nibblable pool, so a chain is built around one of the rest.
const nibblable = (f: PlantForm): boolean => f !== PlantForm.Tree && f !== PlantForm.Coral;

export interface WebChain {
  source: PlantSpecies; // the plant the disperser eats + scatters (form F, hue H)
  feeder: PlantSpecies; // a substrateFeeder in the source's hue-window (form F, hue H)
  disperser: CritterSpecies; // palate aimed at (F, H); eats BOTH → the loop closes
}

export interface RolledWeb {
  chains: WebChain[];
}

// A palate GUARANTEED to eat an archetype of (form, hue, glow): centred on the
// hue (hueScore → 1), wide enough to tolerate drift, glow taste matched — so
// appetite = hueScore*(0.6 + 0.4*glowScore) sits near 1, well over APPETITE_MIN
// (0.3). Built by construction, not by search, so the disperser link is closable.
function palateFor(arch: { form: PlantForm; hue: number; glow: number }): Palate {
  return {
    form: arch.form,
    hueCenter: arch.hue,
    hueWidth: 0.2, // generous, so both source and feeder sit inside the window
    glowTaste: Math.max(-1, Math.min(1, arch.glow * 2 - 1)),
  };
}

// One matched, closable chain around a nibblable-form source on a hosted
// habitat. Deterministic off (base, cursor, i). Returns null only if the given
// habitats host no nibblable plant form at all (caller skips it).
function rollChain(
  base: number,
  cursor: number,
  i: number,
  habitats: ReadonlySet<Tile>,
  map: WorldMap,
): WebChain | null {
  // a per-chain slice of the roll cursor, so chains in one web don't collide
  const c = cursor * 16 + i;
  // real, named plant candidates limited to the construct's habitats
  const plants = rollPlantBatch(base, c, 12, { habitats });
  const source = plants.find((p) => nibblable(p.archetype.form));
  if (!source) return null;
  const F = source.archetype.form;
  const H = source.archetype.hue;

  // the feeder: a DIFFERENT same-form candidate if the batch holds one (a real
  // distinct name/genome), else a clone of the source — either way retuned to
  // hue H and flagged substrateFeeder, on the source's habitat so it can both
  // germinate there (the in-sim rule needs a shared tile) and be reached by the
  // disperser.
  const other = plants.find((p) => p !== source && p.archetype.form === F);
  const feederBase = other ?? source;
  const feeder: PlantSpecies = {
    ...feederBase,
    habitat: source.habitat,
    substrateFeeder: true,
    archetype: { ...feederBase.archetype, form: F, hue: H }, // hue gap 0 ≤ SUBSTRATE_HUE_MATCH
  };

  // the disperser: a real rolled critter (real name/morph), palate re-aimed at
  // (F, H) and forced to disperse. rollCritterBatch needs a REAL-id plant list
  // to cut favourites from (its favoriteSpecies indexes plants by `.id`), so
  // pass the base roster — the palate is overridden anyway.
  const realRoster = generatePlantSpecies(base);
  const [critter] = rollCritterBatch(base, c, 1, realRoster, map);
  const disperser = setCritterTraits(critter, { role: "disperser", palate: palateFor(source.archetype) });

  return { source, feeder, disperser };
}

// Roll a starter web: up to `size` interlocking chains, each a
// source/feeder/disperser triple guaranteed to close. Deterministic off (base,
// cursor). Chains that can't be built on the given habitats are skipped, so a
// single-biome construct simply yields fewer (never a throw).
export function rollWeb(
  base: number,
  cursor: number,
  size: number,
  habitats: ReadonlySet<Tile>,
  map: WorldMap,
): RolledWeb {
  const chains: WebChain[] = [];
  for (let i = 0; i < size * 3 && chains.length < size; i++) {
    const chain = rollChain(base, cursor, i, habitats, map);
    if (chain) chains.push(chain);
  }
  return { chains };
}
