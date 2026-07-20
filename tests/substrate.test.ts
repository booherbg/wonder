import { expect, test } from "vitest";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { generate } from "../src/world/generate";

function flora(chains: boolean) {
  const map = generate(42);
  return new Flora(map, generatePlantSpecies(42), 42, { chains });
}
const sig = { hue: 0.4, glow: 0.7, form: PlantForm.Moss };

test("addSubstrate stamps the meal's signature when chains are on", () => {
  const f = flora(true);
  f.addSubstrate(100, 120, sig);
  expect(f.substrates).toHaveLength(1);
  expect(f.substrates[0]).toMatchObject({ x: 100, y: 120, hue: 0.4, glow: 0.7, form: PlantForm.Moss });
  expect(f.substrates[0].born).toBe(f.tick);
});
test("addSubstrate is a no-op when chains are off (the A/B baseline)", () => {
  const f = flora(false);
  f.addSubstrate(100, 120, sig);
  expect(f.substrates).toHaveLength(0);
});
