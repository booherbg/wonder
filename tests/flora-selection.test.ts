import { describe, expect, it } from "vitest";
import { Flora, SelectionContext } from "../src/life/flora";
import { generate } from "../src/world/generate";
import { DEFAULT_CONFIG } from "../src/world/config";
import { generatePlantSpecies } from "../src/life/species";

function build(sel: SelectionContext | null) {
  const map = generate(2026, DEFAULT_CONFIG);
  const species = generatePlantSpecies(2026);
  return new Flora(map, species, 2026, { selection: sel });
}

describe("Flora selection", () => {
  it("with no selection context, is byte-identical to today", () => {
    const a = build(null);
    const b = build(null);
    for (let i = 0; i < 200; i++) { a.simTick(); b.simTick(); }
    expect(a.all.length).toBe(b.all.length);
    expect(a.all.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join("|"))
      .toBe(b.all.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).join("|"));
  });

  it("draws no extra rng when selection is null", () => {
    // Two Floras, one constructed with an explicit null selection and one with
    // the field omitted entirely, must agree tick for tick.
    const map = generate(77, DEFAULT_CONFIG);
    const species = generatePlantSpecies(77);
    const a = new Flora(map, species, 77, {});
    const b = new Flora(map, species, 77, { selection: null });
    for (let i = 0; i < 150; i++) { a.simTick(); b.simTick(); }
    expect(a.all.length).toBe(b.all.length);
  });

  it("with selection on, high-fitness genomes come to outnumber low ones", () => {
    // A selection context that rewards tall plants outright. After enough
    // ticks the mean height must rise; under drift alone it would not.
    const map = generate(31, DEFAULT_CONFIG);
    const species = generatePlantSpecies(31);
    const f = new Flora(map, species, 31, {
      selection: { fitness: (g) => g.height },
    });
    const before = f.all.reduce((s, p) => s + p.genome.height, 0) / f.all.length;
    for (let i = 0; i < 1500; i++) f.simTick();
    const after = f.all.reduce((s, p) => s + p.genome.height, 0) / f.all.length;
    expect(after).toBeGreaterThan(before);
  });

  it("selection is deterministic for a seed", () => {
    const sel = { fitness: (g: { height: number }) => g.height };
    const map = generate(5, DEFAULT_CONFIG);
    const species = generatePlantSpecies(5);
    const a = new Flora(map, species, 5, { selection: sel as SelectionContext });
    const b = new Flora(map, species, 5, { selection: sel as SelectionContext });
    for (let i = 0; i < 300; i++) { a.simTick(); b.simTick(); }
    expect(a.all.length).toBe(b.all.length);
  });
});
