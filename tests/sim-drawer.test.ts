import { expect, test } from "vitest";
import {
  bumpPeak, captureDaughters, cloneDef, deleteEntry, makeEntry, reviveEntry, statusOf,
} from "../src/game/simDrawer";
import { rollPlantBatch } from "../src/life/roll";
import { PlantSpecies } from "../src/life/species";

const SEED = 7;
const plantDef = (id: number, extra: Partial<PlantSpecies> = {}): PlantSpecies => ({
  ...rollPlantBatch(SEED, 0, 1)[0], id, ...extra,
});

test("cloneDef is deep — mutating the live def never touches the stored one", () => {
  const live = plantDef(3);
  const stored = cloneDef(live);
  live.archetype.hue = 0.999;
  live.name = "changed";
  expect(stored.archetype.hue).not.toBe(0.999);
  expect(stored.name).not.toBe("changed");
});

test("statusOf: extinct only after a kind has lived (peak>0) and fallen to 0", () => {
  const e = makeEntry({ kind: "plant", speciesId: 3, def: plantDef(3), origin: "rolled" });
  expect(statusOf(e, 0, [e]).extinct).toBe(false); // never lived yet → not extinct, just new
  bumpPeak(e, 5);
  expect(statusOf(e, 5, [e]).extinct).toBe(false); // alive
  expect(statusOf(e, 0, [e]).extinct).toBe(true); // lived, now gone
});

test("delete/revive round-trip preserves the full definition", () => {
  const def = plantDef(3, { substrateFeeder: true });
  const e = makeEntry({ kind: "plant", speciesId: 3, def, origin: "rolled" });
  const gone = deleteEntry(e);
  expect(gone.deleted).toBe(true);
  const back = reviveEntry(gone);
  expect(back.deleted).toBe(false);
  expect(back.def).toEqual(def); // the stored definition survived intact
});

test("a deleted kind never reads as extinct (it was removed, not lost to the sim)", () => {
  const e = makeEntry({ kind: "plant", speciesId: 3, def: plantDef(3), origin: "rolled" });
  bumpPeak(e, 4);
  const gone = deleteEntry(e);
  expect(statusOf(gone, 0, [gone]).extinct).toBe(false);
});

test("captureDaughters adds first-class entries for parent-bearing records not yet known", () => {
  const picked = makeEntry({ kind: "plant", speciesId: 0, def: plantDef(0), origin: "rolled" });
  // the sim appended a daughter at index 1 (parent = 0) — as flora speciation does
  const speciesList: PlantSpecies[] = [
    plantDef(0),
    plantDef(1, { name: "Ova Bloom ✧", parent: 0, bornTick: 42 }),
  ];
  const fresh = captureDaughters(speciesList, [picked], 100);
  expect(fresh.length).toBe(1);
  expect(fresh[0].origin).toBe("daughter");
  expect(fresh[0].parentId).toBe(0);
  expect(fresh[0].speciesId).toBe(1);
  // idempotent: once captured, it isn't captured again
  expect(captureDaughters(speciesList, [picked, ...fresh], 200).length).toBe(0);
});

test("variations = iterated looks + captured daughters of this kind", () => {
  const parent = makeEntry({ kind: "plant", speciesId: 0, def: plantDef(0), origin: "rolled" });
  parent.looksIterations = 2;
  const daughter = makeEntry({ kind: "plant", speciesId: 1, def: plantDef(1, { parent: 0 }), origin: "daughter", parentId: 0 });
  const entries = [parent, daughter];
  expect(statusOf(parent, 3, entries).variations).toBe(3); // 2 looks + 1 daughter
  expect(statusOf(daughter, 1, entries).variations).toBe(0);
});
