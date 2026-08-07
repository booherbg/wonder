import { createHash } from "node:crypto";
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
  // GOLDEN FINGERPRINT of seed 2026 at 200 ticks with default tuning, captured
  // from master (2cfb693) before any selection work: sha256 over
  // `species:x:y` per plant in list order, positions rounded to 2 decimals,
  // plus the population count. The old version of this test compared
  // `build(null)` to `build(null)` — the same construction twice, which proves
  // determinism and would pass if selection had changed every plant.
  const MASTER_2026_200 = "e6f2211933754378:8765";

  it("with no selection context, is byte-identical to master", () => {
    const a = build(null);
    for (let i = 0; i < 200; i++) a.simTick();
    const body = a.all.map((p) => `${p.species}:${p.x.toFixed(2)}:${p.y.toFixed(2)}`).join("|");
    expect(`${createHash("sha256").update(body).digest("hex").slice(0, 16)}:${a.all.length}`)
      .toBe(MASTER_2026_200);
  });

  it("draws no extra rng when selection is null", () => {
    // Two Floras, one constructed with an explicit null selection and one with
    // the field omitted entirely, must agree tick for tick.
    // A fresh species array each: Flora holds the list by reference and pushes
    // daughter species onto it in place on speciation (src/life/flora.ts:705).
    const map = generate(77, DEFAULT_CONFIG);
    const a = new Flora(map, generatePlantSpecies(77), 77, {});
    const b = new Flora(map, generatePlantSpecies(77), 77, { selection: null });
    for (let i = 0; i < 150; i++) { a.simTick(); b.simTick(); }
    expect(a.all.length).toBe(b.all.length);
    // …and both must still be master's population, not merely each other's:
    // golden fingerprint, seed 77 at 150 ticks, captured from master 2cfb693.
    const fp = (f: Flora) => {
      const body = f.all.map((p) => `${p.species}:${p.x.toFixed(2)}:${p.y.toFixed(2)}`).join("|");
      return `${createHash("sha256").update(body).digest("hex").slice(0, 16)}:${f.all.length}`;
    };
    expect(fp(a)).toBe("176ca5907810090d:8728");
    expect(fp(b)).toBe("176ca5907810090d:8728");
  });

  it("with selection on, high-fitness genomes come to outnumber low ones", () => {
    // Paired control on an identical seed: one Flora is selected for height,
    // its twin drifts freely. Measured on this seed (2026-08-03), 1500 ticks:
    // real selection Δ(selected - drift) ≈ +0.353; drift-alone noise on a
    // single unpaired run was ≈ +0.0006. 0.1 sits far above the noise floor
    // and far below the observed effect.
    const meanHeight = (f: Flora) =>
      f.all.reduce((s, p) => s + p.genome.height, 0) / f.all.length;

    const map = generate(31, DEFAULT_CONFIG);
    const species = generatePlantSpecies(31);
    const selected = new Flora(map, species, 31, {
      selection: { fitness: (g) => g.height },
    });
    const drift = new Flora(map, species, 31, { selection: null });
    for (let i = 0; i < 1500; i++) {
      selected.simTick();
      drift.simTick();
    }
    expect(meanHeight(selected) - meanHeight(drift)).toBeGreaterThan(0.1);
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
