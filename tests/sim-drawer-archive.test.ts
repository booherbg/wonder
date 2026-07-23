import { expect, test } from "vitest";
import { archivePartition, deleteEntry, livePartition, makeEntry, reviveEntry } from "../src/game/simDrawer";
import type { DrawerEntry } from "../src/game/simDrawer";
import { PlantForm } from "../src/life/genome";
import { Tile } from "../src/world/types";

function plantEntry(id: number, name: string): DrawerEntry {
  return makeEntry({
    kind: "plant",
    speciesId: id,
    origin: "rolled",
    def: {
      id,
      name,
      habitat: Tile.Grass,
      density: 0.5,
      sport: false,
      archetype: {
        form: PlantForm.Flower,
        hue: 0.3,
        hue2: 0.4,
        sat: 0.5,
        height: 0.4,
        spread: 0.4,
        petals: 5,
        leaves: 2,
        lean: 0,
        glow: 0.2,
      },
    },
  });
}

test("live partition excludes deleted; archive is only deleted", () => {
  const a = plantEntry(0, "alpha");
  const b = deleteEntry(plantEntry(1, "beta"));
  const all = [a, b];
  expect(livePartition(all).map((e) => e.name)).toEqual(["alpha"]);
  expect(archivePartition(all).map((e) => e.name)).toEqual(["beta"]);
});

test("delete then revive moves between archive and live", () => {
  let e = plantEntry(2, "gamma");
  expect(livePartition([e])).toHaveLength(1);
  e = deleteEntry(e);
  expect(archivePartition([e])).toHaveLength(1);
  e = reviveEntry(e);
  expect(livePartition([e])).toHaveLength(1);
  expect(archivePartition([e])).toHaveLength(0);
});
