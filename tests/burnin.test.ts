import { describe, expect, it } from "vitest";
import { BURN_IN_GENERATIONS, BURN_IN_SIM_BUDGET, BURN_IN_SPECIES_FLOOR, burnIn } from "../src/life/burnin";
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
    const map = generate(2026, DEFAULT_CONFIG);
    const f = new Flora(map, generatePlantSpecies(2026), 2026, {
      selection: { fitness: (g) => g.height },
      simBudget: BURN_IN_SIM_BUDGET,
    });
    const r = burnIn(f, BURN_IN_GENERATIONS);
    // Not an assertion about speed — a measurement printed for the spec.
    console.log(`burn-in: ${BURN_IN_GENERATIONS} generations in ${r.elapsedMs}ms, ` +
      `${r.plants} plants, ${r.species} species`);
    expect(r.generations).toBe(BURN_IN_GENERATIONS);
  });

  it("actually turns the population over when simBudget covers it, not just when generations is high", () => {
    // At the default simBudget (480), a tick only reaches a small fraction of
    // a population near 8000, so 400 ticks barely replace anyone — one
    // generation of turnover, not hundreds. burnIn documents that callers
    // must raise simBudget to BURN_IN_SIM_BUDGET; this proves the knob is
    // what moves the needle, not generation count alone.
    const fLow = fresh(2026); // default simBudget: 480
    const rLow = burnIn(fLow, BURN_IN_GENERATIONS);
    const bornDuringLow = fLow.all.filter((p) => p.born >= 0).length;
    const fractionLow = bornDuringLow / rLow.plants;

    const map = generate(2026, DEFAULT_CONFIG);
    const fFull = new Flora(map, generatePlantSpecies(2026), 2026, {
      selection: { fitness: (g) => g.height },
      simBudget: BURN_IN_SIM_BUDGET,
    });
    const rFull = burnIn(fFull, BURN_IN_GENERATIONS);
    const bornDuringFull = fFull.all.filter((p) => p.born >= 0).length;
    const fractionFull = bornDuringFull / rFull.plants;

    console.log(
      `turnover: low-budget ${(fractionLow * 100).toFixed(1)}% vs full-budget ${(fractionFull * 100).toFixed(1)}% born during burn-in`,
    );

    // Measured full-budget turnover comes in well above 90%; assert a
    // threshold clearly below that so the test has margin but still fails
    // if turnover regresses back toward "one generation."
    expect(fractionFull).toBeGreaterThan(0.85);
    expect(fractionFull).toBeGreaterThan(fractionLow);
  });
});
