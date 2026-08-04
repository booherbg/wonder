import { describe, expect, it } from "vitest";
import { BURN_IN_GENERATIONS, BURN_IN_SPECIES_FLOOR, burnIn } from "../src/life/burnin";
import { Flora } from "../src/life/flora";
import { generate } from "../src/world/generate";
import { DEFAULT_CONFIG } from "../src/world/config";
import { generatePlantSpecies } from "../src/life/species";

function fresh(seed = 1) {
  const map = generate(seed, DEFAULT_CONFIG);
  return new Flora(map, generatePlantSpecies(seed), seed, {
    selection: { fitness: (g) => g.height },
  });
}

describe("burnIn", () => {
  it("advances the flora clock by the generations asked for", () => {
    const f = fresh();
    const before = f.tick;
    const r = burnIn(f, 50);
    expect(f.tick).toBe(before + 50);
    expect(r.generations).toBe(50);
  });

  it("reports what survived", () => {
    const r = burnIn(fresh(), 100);
    expect(r.plants).toBeGreaterThan(0);
    expect(r.species).toBeGreaterThan(0);
    expect(r.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("reports the floor rather than failing silently when too few species survive", () => {
    const map = generate(4, DEFAULT_CONFIG);
    // A selection context that rewards exactly one narrow genome starves the
    // rest, which is the failure mode the floor exists to surface.
    const f = new Flora(map, generatePlantSpecies(4), 4, {
      selection: { fitness: (g) => (g.height > 0.97 ? 1 : 0) },
    });
    const r = burnIn(f, 400);
    // Note: Flora's selection multiplier (death-scale 0.4-1.6x, repro 0.35-1.65x)
    // never let this scenario collapse below the floor even at 2000 generations
    // in manual probing — its worst case still leaves survivors. So this case
    // alone cannot exercise floorHit === true; see the direct case below.
    expect(typeof r.floorHit).toBe("boolean");
    if (r.species < BURN_IN_SPECIES_FLOOR) expect(r.floorHit).toBe(true);
  });

  it("sets floorHit true when the survivor set is actually below the floor", () => {
    // Drives the floor computation directly rather than hoping ecology gets
    // there: seed speciesCounts with fewer than BURN_IN_SPECIES_FLOOR entries
    // and run zero generations, so burnIn's own report reflects that state
    // untouched by simTick. This is the assertion that would fail if floorHit
    // were, say, hard-coded to false or the comparison direction were flipped.
    const f = fresh();
    f.speciesCounts.clear();
    f.speciesCounts.set(0, 3);
    f.speciesCounts.set(1, 1);
    const r = burnIn(f, 0);
    expect(r.species).toBe(2);
    expect(r.species).toBeLessThan(BURN_IN_SPECIES_FLOOR);
    expect(r.floorHit).toBe(true);
  });

  it("leaves floorHit false when the survivor set clears the floor", () => {
    const f = fresh();
    f.speciesCounts.clear();
    for (let i = 0; i < BURN_IN_SPECIES_FLOOR; i++) f.speciesCounts.set(i, 5);
    const r = burnIn(f, 0);
    expect(r.species).toBe(BURN_IN_SPECIES_FLOOR);
    expect(r.floorHit).toBe(false);
  });

  it("calls onProgress so a loading screen can show something", () => {
    const seen: number[] = [];
    burnIn(fresh(), 40, (done) => seen.push(done));
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[seen.length - 1]).toBe(40);
  });

  it("is deterministic for a seed", () => {
    const a = burnIn(fresh(9), 120);
    const b = burnIn(fresh(9), 120);
    expect(a.plants).toBe(b.plants);
    expect(a.species).toBe(b.species);
  });

  it("ships a default generation count in the spec's 300-600 band", () => {
    expect(BURN_IN_GENERATIONS).toBeGreaterThanOrEqual(300);
    expect(BURN_IN_GENERATIONS).toBeLessThanOrEqual(600);
  });

  it("records the cost of a full-size burn-in", () => {
    const r = burnIn(fresh(2026), BURN_IN_GENERATIONS);
    // Not an assertion about speed — a measurement printed for the spec.
    console.log(`burn-in: ${BURN_IN_GENERATIONS} generations in ${r.elapsedMs}ms, ` +
      `${r.plants} plants, ${r.species} species`);
    expect(r.generations).toBe(BURN_IN_GENERATIONS);
  });
});
