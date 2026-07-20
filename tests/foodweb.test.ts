import { expect, test } from "vitest";
import { CritterSpecies } from "../src/life/fauna";
import { PlantForm, Genome } from "../src/life/genome";
import { chainLinks, chainStats, diversityScore, pickNewSeed, richnessWord } from "../src/life/foodweb";
import { PlantSpecies } from "../src/life/species";
import { Tile } from "../src/world/types";

// ── hand-built fixtures ───────────────────────────────────────────────────
function plant(id: number, form: PlantForm, hue: number, habitat: Tile, feeder = false): PlantSpecies {
  const archetype: Genome = {
    form, hue, hue2: hue, sat: 0.8, height: 0.3, spread: 0.3, petals: 5, leaves: 1, lean: 0, glow: 0.5,
  };
  return { id, name: `p${id}`, habitat, archetype, density: 0.5, sport: false, substrateFeeder: feeder };
}
function disperser(id: number, form: PlantForm, hueCenter: number): CritterSpecies {
  return {
    id, name: `c${id}`, bodyHue: 0.5, earLen: 0.5, tailLen: 0.5, size: 1,
    morph: {
      plan: "puff", legPairs: 1, legLen: 0.5, tail: "nub", crown: "ears", eyeCount: 2,
      bigEyes: false, pattern: "plain", accentHue: 0.5, paleBelly: false, glowMote: false,
    },
    palate: { form, hueCenter, hueWidth: 0.2, glowTaste: 0 },
    favoriteSpecies: 0, role: "disperser", den: { x: 0, y: 0 },
  };
}

test("chainStats counts a disperser→plant→feeder link, and redundancy rises with a second feeder", () => {
  const flower = plant(0, PlantForm.Flower, 0.5, Tile.Grass); // the byproduct source
  const eater = disperser(0, PlantForm.Flower, 0.5); // eats the flower
  const moss = plant(1, PlantForm.Moss, 0.5, Tile.Grass, true); // feeder in the flower's hue band + habitat

  const one = chainStats([flower, moss], [eater]);
  expect(one.chains).toBeGreaterThanOrEqual(1);
  expect(one.redundancy).toBeCloseTo(1, 5);

  const moss2 = plant(2, PlantForm.Moss, 0.5, Tile.Grass, true); // a second feeder shares the band
  const two = chainStats([flower, moss, moss2], [eater]);
  expect(two.chains).toBeGreaterThan(one.chains); // more links...
  expect(two.redundancy).toBeGreaterThan(one.redundancy); // ...and more backup per slot
});

test("chainStats: a feeder off the hue band is not a link", () => {
  const flower = plant(0, PlantForm.Flower, 0.5, Tile.Grass);
  const eater = disperser(0, PlantForm.Flower, 0.5);
  const farHue = plant(1, PlantForm.Moss, 0.9, Tile.Grass, true); // 0.4 away → out of the band
  expect(chainStats([flower, farHue], [eater]).chains).toBe(0);
  // and a plant no disperser eats produces no byproduct, so no link forms
  const scenery = plant(2, PlantForm.Flower, 0.05, Tile.Grass); // eater's hue window misses it
  const bandFeeder = plant(3, PlantForm.Moss, 0.05, Tile.Grass, true);
  expect(chainStats([scenery, bandFeeder], [eater]).chains).toBe(0);
});

test("chainStats: closable counts links whose feeder is itself eaten", () => {
  const flower = plant(0, PlantForm.Flower, 0.5, Tile.Grass);
  const moss = plant(1, PlantForm.Moss, 0.5, Tile.Grass, true);
  const flowerEater = disperser(0, PlantForm.Flower, 0.5);
  const mossEater = disperser(1, PlantForm.Moss, 0.5); // eats the feeder → the chain can continue
  const open = chainStats([flower, moss], [flowerEater]);
  expect(open.closable).toBe(0);
  const closed = chainStats([flower, moss], [flowerEater, mossEater]);
  expect(closed.closable).toBeGreaterThanOrEqual(1);
});

test("diversityScore is deterministic and ranks the legendary seed far above a flat one", () => {
  expect(diversityScore(2438)).toBe(diversityScore(2438)); // deterministic
  const rich = diversityScore(2438); // "Polpol Skerry", the pinned champion
  const flat = diversityScore(42); // the study's known-flat island
  expect(rich).toBeGreaterThan(30);
  expect(flat).toBeLessThan(rich);
  expect(flat).toBeLessThan(30); // below a sane default floor
});

test("richnessWord grades a score from flat to legendary", () => {
  expect(richnessWord(0)).toBe("flat");
  expect(richnessWord(3)).toBe("sparse");
  expect(richnessWord(9)).toBe("living");
  expect(richnessWord(20)).toBe("rich");
  expect(richnessWord(35)).toBe("lush");
  expect(richnessWord(44)).toBe("legendary");
});

test("chainLinks names each disperser→source→feeder link", () => {
  const flower = plant(0, PlantForm.Flower, 0.5, Tile.Grass);
  const moss = plant(1, PlantForm.Moss, 0.5, Tile.Grass, true);
  const flowerEater = disperser(0, PlantForm.Flower, 0.5);
  const links = chainLinks([flower, moss], [flowerEater]);
  expect(links.length).toBeGreaterThanOrEqual(1);
  expect(links[0]).toMatchObject({ disperser: "c0", source: "p0", feeder: "p1", closes: false });
});

test("chainLinks marks a closing loop and leads with it", () => {
  const flower = plant(0, PlantForm.Flower, 0.5, Tile.Grass);
  const moss = plant(1, PlantForm.Moss, 0.5, Tile.Grass, true);
  const flowerEater = disperser(0, PlantForm.Flower, 0.5);
  const mossEater = disperser(1, PlantForm.Moss, 0.5); // eats the feeder → loop continues
  const links = chainLinks([flower, moss], [flowerEater, mossEater]);
  expect(links[0].closes).toBe(true); // the loop-closing link sorts first
});

test("pickNewSeed rejection-samples to the floor, and frontier bypasses it", () => {
  const flat = 42;
  const rich = 2438;
  const floor = (diversityScore(flat) + diversityScore(rich)) / 2; // strictly between them
  // a stub roller: first hands back the flat seed, then the rich one
  const roller = () => {
    let i = 0;
    const seq = [flat, rich];
    return () => seq[i++ % seq.length];
  };
  expect(pickNewSeed(roller(), { floor, candidates: 8, frontier: false })).toBe(rich);
  // frontier takes the first roll regardless of the floor
  expect(pickNewSeed(roller(), { floor, candidates: 8, frontier: true })).toBe(flat);
});
