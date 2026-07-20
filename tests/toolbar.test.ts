import { expect, test } from "vitest";
import {
  cycleLoaded,
  cycleSlot,
  emptyToolbar,
  gatherMaterial,
  gatherSeed,
  loadSeed,
  loaded,
  migrate,
  plantLoaded,
  selectSlot,
  takeSeed,
  tossLoaded,
} from "../src/game/toolbar";
import { Genome, PlantForm } from "../src/life/genome";

function genomeOf(hue: number): Genome {
  return {
    form: PlantForm.Flower,
    hue, hue2: 0.5, sat: 0.8, height: 0.4, spread: 0.5,
    petals: 5, leaves: 2, lean: 0, glow: 0.1,
  };
}

test("the bar starts empty: hand selected, an empty pouch, no materials", () => {
  const bar = emptyToolbar();
  expect(bar.selected).toBe("hand");
  expect(bar.bank).toHaveLength(0);
  expect(bar.active).toBeNull();
  expect(loaded(bar)).toBeNull();
  expect(bar.materials).toEqual({ wood: 0, stone: 0, rush: 0 });
});

test("all seed kinds share the one pouch — never a slot each", () => {
  let bar = emptyToolbar();
  bar = gatherSeed(bar, 3, genomeOf(0.1));
  bar = gatherSeed(bar, 7, genomeOf(0.2));
  bar = gatherSeed(bar, 9, genomeOf(0.3));
  expect(bar.bank).toHaveLength(3); // three varietals, all in the pouch
});

test("gathering the same kind stacks its seeds, keeping each genome in order", () => {
  let bar = emptyToolbar();
  bar = gatherSeed(bar, 3, genomeOf(0.1));
  bar = gatherSeed(bar, 3, genomeOf(0.9));
  expect(bar.bank).toHaveLength(1);
  expect(bar.bank[0].genomes.map((g) => g.hue)).toEqual([0.1, 0.9]);
});

test("the first seed gathered loads the pouch; a later kind never switches it", () => {
  let bar = emptyToolbar();
  bar = gatherSeed(bar, 3, genomeOf(0.1));
  expect(loaded(bar)!.species).toBe(3); // empty pouch → first seed is ready
  bar = gatherSeed(bar, 7, genomeOf(0.2));
  expect(loaded(bar)!.species).toBe(3); // still the one you were holding
});

test("OUT MEANS OUT: a spent varietal empties the pouch and never rolls to another", () => {
  let bar = emptyToolbar();
  bar = gatherSeed(bar, 3, genomeOf(0.1)); // one marsh-fern seed, auto-loaded
  bar = gatherSeed(bar, 7, genomeOf(0.2)); // a different kind waits in the bank
  const first = plantLoaded(bar)!;
  expect(first[1].species).toBe(3); // plant the loaded kind
  const afterFirst = first[0];
  expect(loaded(afterFirst)).toBeNull(); // spent → pouch empty
  expect(plantLoaded(afterFirst)).toBeNull(); // pressing again plants NOTHING...
  expect(afterFirst.bank.some((v) => v.species === 7)).toBe(true); // ...species 7 untouched
});

test("planting spends a varietal's seeds oldest-first, then empties the pouch", () => {
  let bar = emptyToolbar();
  bar = gatherSeed(bar, 3, genomeOf(0.1));
  bar = gatherSeed(bar, 3, genomeOf(0.9));
  const a = plantLoaded(bar)!;
  expect(a[1].genome.hue).toBe(0.1); // oldest first
  const b = plantLoaded(a[0])!;
  expect(b[1].genome.hue).toBe(0.9);
  expect(loaded(b[0])).toBeNull(); // the kind is spent, pouch empty
  expect(b[0].bank).toHaveLength(0);
});

test("loadSeed is the deliberate switch; an unknown kind leaves the pouch alone", () => {
  let bar = emptyToolbar();
  bar = gatherSeed(bar, 3, genomeOf(0.1));
  bar = gatherSeed(bar, 7, genomeOf(0.2)); // pouch still on 3
  bar = loadSeed(bar, 7);
  expect(loaded(bar)!.species).toBe(7);
  bar = loadSeed(bar, 99); // never gathered
  expect(loaded(bar)!.species).toBe(7); // unchanged
});

test("cycleLoaded quick-swaps the loaded varietal among the bank", () => {
  let bar = emptyToolbar();
  bar = gatherSeed(bar, 3, genomeOf(0.1));
  bar = gatherSeed(bar, 7, genomeOf(0.2)); // bank [3, 7], loaded 3
  bar = cycleLoaded(bar, 1);
  expect(loaded(bar)!.species).toBe(7);
  bar = cycleLoaded(bar, 1);
  expect(loaded(bar)!.species).toBe(3); // wraps
});

test("gathering materials keeps plain counts, off the hotbar", () => {
  let bar = emptyToolbar();
  bar = gatherMaterial(bar, "wood");
  bar = gatherMaterial(bar, "wood");
  bar = gatherMaterial(bar, "rush");
  expect(bar.materials).toEqual({ wood: 2, stone: 0, rush: 1 });
});

test("the selected functional slot cycles hand → hoe → pouch and wraps", () => {
  let bar = emptyToolbar();
  bar = cycleSlot(bar, 1);
  expect(bar.selected).toBe("hoe");
  bar = cycleSlot(bar, 1);
  expect(bar.selected).toBe("pouch");
  bar = cycleSlot(bar, 1);
  expect(bar.selected).toBe("hand"); // wrapped
  expect(selectSlot(bar, "pouch").selected).toBe("pouch");
});

test("tossLoaded gives one loaded seed back to the wind, emptying the pouch when spent", () => {
  let bar = emptyToolbar();
  bar = gatherSeed(bar, 3, genomeOf(0.1));
  bar = gatherSeed(bar, 3, genomeOf(0.9));
  bar = tossLoaded(bar);
  expect(loaded(bar)!.genomes.map((g) => g.hue)).toEqual([0.9]); // oldest tossed
  bar = tossLoaded(bar);
  expect(loaded(bar)).toBeNull(); // last one gone
});

test("gather does not mutate the original bar", () => {
  const bar = emptyToolbar();
  gatherSeed(bar, 3, genomeOf(0.1));
  gatherMaterial(bar, "wood");
  expect(bar.bank).toHaveLength(0);
  expect(bar.materials.wood).toBe(0);
});

test("takeSeed pulls one seed of a given kind for feeding, keeping the pouch sane", () => {
  let bar = emptyToolbar();
  bar = gatherSeed(bar, 3, genomeOf(0.1)); // loaded (bank index 0)
  bar = gatherSeed(bar, 7, genomeOf(0.2)); // bank index 1
  bar = gatherSeed(bar, 7, genomeOf(0.3));
  // take a species-7 seed (not the loaded kind) — the loaded stays on species 3
  const t1 = takeSeed(bar, 7)!;
  expect(t1[1].species).toBe(7);
  expect(t1[1].genome.hue).toBe(0.2); // oldest of that kind
  expect(loaded(t1[0])!.species).toBe(3);
  // an unknown kind yields nothing
  expect(takeSeed(bar, 99)).toBeNull();
  // taking the last of the LOADED kind empties the pouch
  const t2 = takeSeed(bar, 3)!;
  expect(loaded(t2[0])).toBeNull();
});

test("migrate rebuilds the bank from legacy seeds, loads the first kind, drops soil", () => {
  const bar = migrate(
    [
      { species: 3, genome: genomeOf(0.1) },
      { species: 3, genome: genomeOf(0.9) },
      { species: 7, genome: genomeOf(0.5) },
    ],
    { wood: 2, stone: 1, rush: 0, soil: 4 },
  );
  expect(bar.bank).toHaveLength(2); // two varietals
  expect(bar.bank.find((v) => v.species === 3)!.genomes).toHaveLength(2);
  expect(loaded(bar)!.species).toBe(3); // first kind loaded
  expect(bar.materials).toEqual({ wood: 2, stone: 1, rush: 0 }); // soil dropped
  expect(bar.selected).toBe("hand");
});
