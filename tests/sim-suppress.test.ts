// FIX 3 (QA): clearing a substrate-feeder plant used to be cosmetic —
// Flora.stepSubstrates has no tombstone awareness, so a live disperser's
// byproduct germinated the "cleared" feeder right back within ~400 ticks.
// SimKernel.clearPlantInstances now suppresses the id in Flora's own
// suppressedSpecies set; unsuppressPlantSpecies (called by the drawer's
// revive) lifts the ban. Deterministic: a fixed seed, no rng draws added.

import { expect, test } from "vitest";
import { PlantForm } from "../src/life/genome";
import { SimKernel } from "../src/life/kernel";
import { PlantSpecies } from "../src/life/species";
import { TILE_SIZE } from "../src/world/config";
import { singleBiome } from "../src/world/construct";
import { Tile } from "../src/world/types";

const SEED = 4242;

function feederSpecies(): PlantSpecies {
  return {
    id: 0,
    name: "Test Feeder",
    habitat: Tile.Grass,
    archetype: {
      form: PlantForm.Moss,
      hue: 0.4,
      hue2: 0.4,
      sat: 0.8,
      height: 0.1,
      spread: 0.3,
      petals: 3,
      leaves: 0,
      lean: 0,
      glow: 0.5,
    },
    density: 0.5,
    sport: false,
    substrateFeeder: true,
  };
}

const at = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE_SIZE, y: (ty + 0.5) * TILE_SIZE });

test("clearPlantInstances suppresses re-germination; unsuppressPlantSpecies lifts it", () => {
  const map = singleBiome(SEED, Tile.Grass, 40);
  const sp = feederSpecies();
  const kernel = new SimKernel({ map, plantSpecies: [sp], critterSpecies: [], seed: SEED });
  const p = at(5, 5);

  kernel.placePlant(0, p.x, p.y); // one live instance, so "clearing" has something to clear
  expect(kernel.speciesCounts().get(0)).toBe(1);

  kernel.clearPlantInstances(0);
  expect(kernel.speciesCounts().get(0) ?? 0).toBe(0);
  expect(kernel.flora.suppressedSpecies.has(0)).toBe(true);

  // A continuous hue-matching byproduct feed at the SAME tile for 400 ticks —
  // far more germination attempts (SUBSTRATE_GERMINATE_CHANCE per tick per
  // live substrate) than the confirmed ~400-tick resurrection window. With
  // the id suppressed, stepSubstrates' own feeders filter drops it, so the
  // sim never even rolls for it.
  for (let i = 0; i < 400; i++) {
    kernel.flora.addSubstrate(p.x, p.y, { hue: sp.archetype.hue, glow: 0.5, form: sp.archetype.form });
    kernel.step(1, "full");
  }
  expect(kernel.speciesCounts().get(0) ?? 0).toBe(0); // still cleared — no resurrection

  kernel.unsuppressPlantSpecies(0);
  expect(kernel.flora.suppressedSpecies.has(0)).toBe(false);
  for (let i = 0; i < 300; i++) {
    kernel.flora.addSubstrate(p.x, p.y, { hue: sp.archetype.hue, glow: 0.5, form: sp.archetype.form });
    kernel.step(1, "full");
  }
  expect(kernel.speciesCounts().get(0) ?? 0).toBeGreaterThan(0); // un-suppressed: it can germinate again
});
