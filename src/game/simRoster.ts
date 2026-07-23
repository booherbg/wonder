// The palette's raw material: which of the seed's rolled kinds may actually be
// placed on a given construct. A plant only roots on its own habitat (no biome
// brush yet in slice 1), so the palette offers exactly the species the
// construct's tiles can host.
import { PlantSpecies } from "../life/species";
import { Tile, WorldMap } from "../world/types";

export function habitatsOf(map: WorldMap): Set<Tile> {
  return new Set(map.tiles as unknown as Iterable<Tile>);
}

export function placeablePlants(species: PlantSpecies[], habitats: Set<Tile>): PlantSpecies[] {
  return species.filter((s) => habitats.has(s.habitat));
}
