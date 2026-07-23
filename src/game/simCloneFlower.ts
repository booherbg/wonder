// Clone-with-mutation flower — pure bench logic for introducing a cousin species
// with a previewed genome + pixel flower map before it lands on the Live roster.
// PURE: no DOM; rng injected for re-roll and naming.

import { Rng } from "../core/rng";
import { Genome, mutate } from "../life/genome";
import { IdMap, mutateMap } from "../life/idmap";
import { SimKernel } from "../life/kernel";
import { Flower } from "../life/swarm";
import { PlantSpecies, speciesName } from "../life/species";
import { SwarmLayer } from "./swarms";
import { cloneDef, makeEntry, type DrawerEntry } from "./simDrawer";

export interface ClonePreview {
  parentId: number;
  genome: Genome;
  map: IdMap;
  accent: Uint8Array;
  mutationAmount: number;
}

export function flipsForMutation(amount: number): number {
  return Math.max(1, Math.round(amount * 40));
}

export function snapshotClone(parentSp: PlantSpecies, parentFlower: Flower, mutationAmount: number): ClonePreview {
  return {
    parentId: parentSp.id,
    genome: { ...parentSp.archetype },
    map: parentFlower.map.slice(),
    accent: parentFlower.accent.slice(),
    mutationAmount,
  };
}

export function clonePreviewFlower(preview: ClonePreview): Flower {
  return { map: preview.map, accent: preview.accent, nectar: 1 };
}

/** One generation of drift on genome + flower map at the preview's mutation amount. */
export function mutateClonePreview(preview: ClonePreview, rng: Rng): ClonePreview {
  const flips = flipsForMutation(preview.mutationAmount);
  return {
    ...preview,
    genome: mutate(preview.genome, rng, preview.mutationAmount),
    map: mutateMap(preview.map, rng, flips),
  };
}

/** Re-apply mutation from a fixed parent baseline (slider tweak — deterministic seed). */
export function mutateCloneFromBaseline(baseline: ClonePreview, amount: number, rng: Rng): ClonePreview {
  return mutateClonePreview({ ...baseline, mutationAmount: amount }, rng);
}

export function buildClonedSpeciesDef(parentSp: PlantSpecies, preview: ClonePreview, name: string): PlantSpecies {
  const base = cloneDef(parentSp);
  return {
    ...base,
    id: -1,
    name,
    archetype: { ...preview.genome },
    parent: parentSp.id,
    bornTick: undefined,
    homeland: undefined,
  };
}

/** Introduce a previewed cousin into the kernel + swarm flower cache; returns the new species id. */
export function introduceClonedPlant(
  kernel: SimKernel,
  layer: SwarmLayer,
  preview: ClonePreview,
  rng: Rng,
): number {
  const parentSp = kernel.plantSpecies[preview.parentId];
  const name = speciesName(rng, preview.genome);
  const def = buildClonedSpeciesDef(parentSp, preview, name);
  const id = kernel.introducePlantSpecies(def);
  layer.setFlower(id, clonePreviewFlower(preview));
  return id;
}

export function drawerEntryForClone(speciesId: number, def: PlantSpecies, parentId: number): DrawerEntry {
  return makeEntry({ kind: "plant", speciesId, def, origin: "cloned", parentId });
}
