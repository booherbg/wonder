import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { generateCritterSpecies, spawnCritters, updateCritter } from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";
import { TILE_SIZE } from "../src/world/config";
import { generate } from "../src/world/generate";

const SEED = 42;

function world() {
  const map = generate(SEED);
  const plants = generatePlantSpecies(SEED);
  const flora = new Flora(map, plants, SEED);
  const critterSpecies = generateCritterSpecies(SEED, map, flora, plants);
  return { map, plants, flora, critterSpecies };
}

test("a bite is real: young plants are consumed, mature ones set back", () => {
  const { flora } = world();
  const p = flora.all[0]; // scatter plants are born mature
  const before = flora.count;
  expect(flora.nibble(p)).toBe("grazed");
  expect(flora.count).toBe(before); // still standing, but a sprout again
  expect(p.born).toBe(flora.tick);
  expect(flora.nibble(p)).toBe("consumed"); // the second bite eats the sprout
  expect(flora.count).toBe(before - 1);
});

test("the gardener's thumb: tended plants shrug off bites", () => {
  const { flora } = world();
  const p = flora.all[0];
  flora.setHome(Math.floor(p.x / TILE_SIZE), Math.floor(p.y / TILE_SIZE));
  const born = p.born;
  expect(flora.nibble(p)).toBe("grazed");
  expect(flora.nibble(p)).toBe("grazed"); // never consumed, never set back
  expect(p.born).toBe(born);
});

// The web pushes back and then recovers — the negative-feedback loop the
// ecology rests on. Measured against a twin island left ungrazed, so the
// signal is grazing's own effect, not the island's natural settling from
// its lush scatter. Deterministic: fixed seed, fixed grazing pattern.
test(
  "grazing suppresses a patch below an ungrazed twin, and it rebounds when the grazers move on",
  () => {
    const control = new Flora(generate(SEED), generatePlantSpecies(SEED), SEED);
    const grazed = new Flora(generate(SEED), generatePlantSpecies(SEED), SEED);
    const target = control.all[0].species;
    const mature = (f: Flora, p: (typeof f.all)[number]) => f.tick - p.born >= f.tuning.matureAge;
    const gAt = () => grazed.speciesCounts.get(target) ?? 0;

    const WINDOW = 600;
    const RECOVER = 1200;
    for (let i = 0; i < WINDOW; i++) {
      control.simTick();
      grazed.simTick();
      for (const p of grazed.all) {
        if (p.species === target && mature(grazed, p) && Math.abs(Math.sin(p.x * 7 + p.y * 13 + i)) < 0.3) {
          grazed.nibble(p);
        }
      }
    }
    const grazedUnderPressure = gAt();
    const controlSteady = control.speciesCounts.get(target) ?? 0;
    // teeth: the grazed patch is driven well below its untouched twin
    expect(grazedUnderPressure).toBeLessThan(controlSteady * 0.6);
    expect(grazedUnderPressure).toBeGreaterThan(0); // suppressed, never erased

    for (let i = 0; i < RECOVER; i++) {
      control.simTick();
      grazed.simTick();
    }
    // released, the patch converges back toward its untouched twin: its
    // share of the twin's count climbs well off the low grazing forced it
    // to — twin-relative, so richer islands' own competitive settling (a
    // kind can drift down in BOTH twins) cancels out of the signal
    const pressuredShare = grazedUnderPressure / Math.max(1, controlSteady);
    const recoveredShare = gAt() / Math.max(1, control.speciesCounts.get(target) ?? 0);
    expect(recoveredShare).toBeGreaterThan(pressuredShare * 1.15);
    expect(gAt()).toBeGreaterThan(0); // and it never winked out on the way
  },
  30_000,
);

test(
  "the ledger: living drains, chewing fills, and energy stays in bounds",
  () => {
    const { map, flora, critterSpecies } = world();
    const critters = spawnCritters(critterSpecies, map, SEED);
    const rng = makeRng(7);
    const dt = 1 / 30;
    let ate = false;
    for (let step = 0; step < 30 * 240; step++) {
      for (const c of critters) {
        const before = c.energy;
        updateCritter(c, dt, map, flora, critterSpecies, null, rng);
        expect(c.energy).toBeGreaterThanOrEqual(0);
        expect(c.energy).toBeLessThanOrEqual(1);
        if (c.energy > before + 0.2) ate = true; // a whole meal landed
      }
    }
    expect(ate).toBe(true);
  },
  20_000,
);
