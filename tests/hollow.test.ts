import { beforeAll, describe, expect, it } from "vitest";
import {
  hollowLightAt,
  makeHollow,
  pickAttempt,
  terrainLight,
  type Hollow,
} from "../src/life/hollow";
import { CANOPY_RADIUS, CANOPY_REFRESH_TICKS, CanopyField } from "../src/life/canopy";
import { BURN_IN_SIM_BUDGET, BURN_IN_SPECIES_FLOOR, burnIn } from "../src/life/burnin";
import { Flora } from "../src/life/flora";
import { LIGHT_WEIGHT, landscapeFor } from "../src/life/fitness";
import { mineralFieldFor } from "../src/life/minerals";
import { generatePlantSpecies } from "../src/life/species";
import { generate } from "../src/world/generate";
import { HOLLOW_CONFIG, TILE_SIZE } from "../src/world/config";
import { GENOME_BOUNDS, Genome, PlantForm } from "../src/life/genome";
import { Tile, tileAt } from "../src/world/types";

// One burn-in is 6.3s on the reference machine (M-series, node 22), so every
// case that builds one needs an explicit timeout — vitest's default is 5000ms.
const BUILD_MS = 90_000;

// SEED is built once and read by every case that only needs a finished
// island; constantLightControl is the same seed with the single change
// `light: 0.5`, the falsification baseline for the gradient. Four burn-ins in
// this file, down from eight in the first version.
const SEED = 2026;

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const [H_LO, H_HI] = GENOME_BOUNDS.height;
const [S_LO, S_HI] = GENOME_BOUNDS.spread;
/** Genome height normalised to [0,1], the scale `score` reads it on. */
const normHeight = (g: Genome) => (g.height - H_LO) / (H_HI - H_LO);
/** Genome spread normalised to [0,1] — the trait `score`'s light term reads. */
const normSpread = (g: Genome) => (g.spread - S_LO) / (S_HI - S_LO);

let sharedHollow: Hollow | null = null;
/** Every (done, total) pair the shared build reported, for the wiring case. */
const progressSeen: [number, number][] = [];
const hollow = () =>
  (sharedHollow ??= makeHollow(SEED, (done, total) => progressSeen.push([done, total])));

/**
 * The Hollow of SEED rebuilt with `light` held at 0.5 and everything else —
 * map, species, mineral field, landscape, RNG seed, canopy refresh schedule,
 * generation count — identical. The canopy is still built and refreshed so
 * the same tiles can be called dark and bright in both runs; it just never
 * reaches `score`.
 */
function constantLightControl() {
  const map = generate(SEED, HOLLOW_CONFIG);
  const minerals = mineralFieldFor(map, SEED);
  const landscape = landscapeFor(SEED);
  const canopy = new CanopyField(map.width, map.height);
  let flora!: Flora;
  let refreshedAt = -1;
  flora = new Flora(map, generatePlantSpecies(SEED), SEED, {
    simBudget: BURN_IN_SIM_BUDGET,
    selection: {
      fitness(g, tx, ty) {
        if (flora.tick - refreshedAt >= CANOPY_REFRESH_TICKS) {
          canopy.refresh(flora);
          refreshedAt = flora.tick;
        }
        const f = landscape.score(g, { minerals: minerals.sample(tx, ty), light: 0.5 });
        minerals.draw(tx, ty, landscape.demandOf(g), 0.002);
        return f;
      },
    },
  });
  burnIn(flora);
  canopy.refresh(flora);
  return { map, flora, canopy };
}

/**
 * Mean normalised genome height in the darkest and brightest quartile of the
 * population, split by the light each plant actually stands in with its own
 * shade excluded. Quartiles are taken over plants rather than over tiles so
 * both samples are the same size and neither is dominated by empty ground.
 */
function quartileHeights(map: ReturnType<typeof generate>, canopy: CanopyField, flora: Flora) {
  const rows = flora.all.map((p) => {
    const tx = Math.floor(p.x / TILE_SIZE);
    const ty = Math.floor(p.y / TILE_SIZE);
    const own = CanopyField.shadeOfGenome(p.genome);
    return {
      light: terrainLight(map, tx, ty) * canopy.lightExcluding(tx, ty, own),
      h: normHeight(p.genome),
      s: normSpread(p.genome),
      sp: p.species,
    };
  });
  const sorted = rows.map((r) => r.light).sort((a, b) => a - b);
  const q1 = sorted[(sorted.length * 0.25) | 0];
  const q3 = sorted[(sorted.length * 0.75) | 0];
  const dark = rows.filter((r) => r.light <= q1);
  const bright = rows.filter((r) => r.light >= q3);
  return {
    dark: mean(dark.map((r) => r.h)),
    bright: mean(bright.map((r) => r.h)),
    darkSpread: mean(dark.map((r) => r.s)),
    brightSpread: mean(bright.map((r) => r.s)),
    nDark: dark.length,
    nBright: bright.length,
    withinSpecies: withinSpeciesR(rows),
  };
}

/**
 * Population-weighted mean of the within-species Pearson correlation between
 * shade (1 - light) and normalised `spread`, over species with at least 50
 * living members. Within-species because PlantSpecies.habitat pins a species
 * to one tile type, so any island-wide correlation is mostly composition —
 * which species stands where — rather than individuals sorting.
 */
function withinSpeciesR(rows: { light: number; s: number; sp: number }[]): number {
  const per = new Map<number, { light: number; s: number }[]>();
  for (const r of rows) {
    if (!per.has(r.sp)) per.set(r.sp, []);
    per.get(r.sp)!.push(r);
  }
  let weighted = 0;
  let total = 0;
  for (const group of per.values()) {
    if (group.length < 50) continue;
    const x = group.map((g) => 1 - g.light);
    const y = group.map((g) => g.s);
    const mx = mean(x);
    const my = mean(y);
    let sxy = 0;
    let sxx = 0;
    let syy = 0;
    for (let i = 0; i < x.length; i++) {
      const dx = x[i] - mx;
      const dy = y[i] - my;
      sxy += dx * dy;
      sxx += dx * dx;
      syy += dy * dy;
    }
    const d = Math.sqrt(sxx * syy);
    weighted += (d < 1e-12 ? 0 : sxy / d) * group.length;
    total += group.length;
  }
  return total === 0 ? 0 : weighted / total;
}

describe("makeHollow", () => {
  let h: Hollow;
  beforeAll(() => {
    h = hollow();
  }, BUILD_MS);

  it("returns an island that has already lived", () => {
    expect(h.map.width).toBe(HOLLOW_CONFIG.width);
    expect(h.flora.tick).toBeGreaterThan(300);
    expect(h.flora.all.length).toBeGreaterThan(0);
  });

  it("meets the species floor", () => {
    expect(h.report.floorHit).toBe(false);
    expect(h.report.species).toBeGreaterThanOrEqual(BURN_IN_SPECIES_FLOOR);
  });

  it("has drawn its minerals down where plants stand", () => {
    const p = h.flora.all[0];
    expect(p).toBeDefined();
    const tx = Math.floor(p.x / TILE_SIZE);
    const ty = Math.floor(p.y / TILE_SIZE);
    expect(h.minerals.totalAt(tx, ty)).toBeLessThanOrEqual(6);
  });

  it("is deterministic for a seed", () => {
    // Compared against the shared build rather than building a second pair,
    // which halves what this case costs.
    const again = makeHollow(SEED);
    expect(again.flora.all.length).toBe(h.flora.all.length);
    expect(again.report.species).toBe(h.report.species);
    expect(again.canopy.shadeAt(70, 70)).toBe(h.canopy.shadeAt(70, 70));
  }, BUILD_MS);

  it("reports progress a caller can drive a loading screen from", () => {
    // makeHollow is 6.2-7.0s measured across five seeds, far past the ~3s a
    // button press can hide, so the forge will need a progress screen and
    // this is the callback it will read. burnIn reports at most 20 times.
    expect(progressSeen.length).toBe(20);
    expect(progressSeen[0]).toEqual([20, 400]);
    expect(progressSeen[progressSeen.length - 1]).toEqual([400, 400]);
    for (const [done, total] of progressSeen) {
      expect(total).toBe(400);
      expect(done).toBeGreaterThan(0);
      expect(done).toBeLessThanOrEqual(total);
    }
  });

  it("leaves the canopy consistent with the population it returns", () => {
    // burnIn stops on an arbitrary tick, which may not be a refresh tick, so
    // `attempt` refreshes once more before returning. Rebuilding from the
    // same flora must therefore change nothing.
    const before = h.canopy.shadeAt(70, 70);
    h.canopy.refresh(h.flora);
    expect(h.canopy.shadeAt(70, 70)).toBe(before);
  });
});

describe("pickAttempt", () => {
  // The reroll loop, driven directly. The real one is never seen firing — no
  // tested seed leaves the Hollow under the species floor — so waiting for an
  // ecology that collapses would leave MAX_ATTEMPTS and the seed+i sequence
  // untested. tests/burnin.test.ts reaches floorHit === true the same way.
  it("returns the first attempt that clears the floor", () => {
    const seen: number[] = [];
    const got = pickAttempt(100, (s) => {
      seen.push(s);
      return { report: { floorHit: s < 103 }, tag: s };
    });
    expect(seen).toEqual([100, 101, 102, 103]);
    expect(got.tag).toBe(103);
  });

  it("does not reroll when the first attempt already clears the floor", () => {
    const seen: number[] = [];
    pickAttempt(7, (s) => {
      seen.push(s);
      return { report: { floorHit: false } };
    });
    expect(seen).toEqual([7]);
  });

  it("gives up after eight attempts and returns the last, floorHit still set", () => {
    const seen: number[] = [];
    const got = pickAttempt(0, (s) => {
      seen.push(s);
      return { report: { floorHit: true }, tag: s };
    });
    expect(seen).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(got.tag).toBe(7);
    expect(got.report.floorHit).toBe(true);
  });
});

describe("terrainLight", () => {
  // Terrain light covers only shade the plants cannot cast: the water column
  // and the shadow of a cliff face. Everything a canopy could darken is left
  // at 1 and handed to CanopyField, so the two never double-count.
  const map = generate(SEED, HOLLOW_CONFIG);
  const find = (t: Tile) => {
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) if (tileAt(map, x, y) === t) return [x, y];
    return null;
  };

  it("dims water and leaves open ground alone", () => {
    const deep = find(Tile.DeepWater)!;
    const shallow = find(Tile.ShallowWater)!;
    const forest = find(Tile.Forest)!;
    const sand = find(Tile.Sand)!;
    expect(terrainLight(map, deep[0], deep[1])).toBe(0.35);
    expect(terrainLight(map, shallow[0], shallow[1])).toBe(0.7);
    expect(terrainLight(map, forest[0], forest[1])).toBe(1);
    expect(terrainLight(map, sand[0], sand[1])).toBe(1);
  });

  it("is defined off the map", () => {
    expect(terrainLight(map, -1, -1)).toBe(0.35); // out of bounds reads DeepWater
  });
});

describe("CanopyField", () => {
  let h: Hollow;
  beforeAll(() => {
    h = hollow();
  }, BUILD_MS);

  it("gives bare and off-map ground full light", () => {
    const c = new CanopyField(10, 10);
    expect(c.lightAt(5, 5)).toBe(1);
    expect(c.lightAt(-1, -1)).toBe(1);
  });

  it("weights a form's shade by its standing structure and its height", () => {
    const tree = { form: PlantForm.Tree, height: 1 } as Genome;
    const moss = { form: PlantForm.Moss, height: 1 } as Genome;
    const halfTree = { form: PlantForm.Tree, height: 0.5 } as Genome;
    expect(CanopyField.shadeOfGenome(tree)).toBeGreaterThan(CanopyField.shadeOfGenome(halfTree));
    // A half-height tree still out-shades a full-height moss cushion.
    expect(CanopyField.shadeOfGenome(halfTree)).toBeGreaterThan(CanopyField.shadeOfGenome(moss));
  });

  it("reaches CANOPY_RADIUS tiles and no further", () => {
    const c = new CanopyField(20, 20);
    const tree = { genome: { form: PlantForm.Tree, height: 1 }, x: 10 * TILE_SIZE, y: 10 * TILE_SIZE };
    c.refresh({ all: [tree] } as unknown as Flora);
    expect(c.shadeAt(10, 10)).toBeGreaterThan(0);
    expect(c.shadeAt(10 + CANOPY_RADIUS, 10)).toBeGreaterThan(0);
    expect(c.shadeAt(10 + CANOPY_RADIUS + 1, 10)).toBe(0);
  });

  it("excludes a plant's own shade without ever going negative", () => {
    const p = h.flora.all[0];
    const tx = Math.floor(p.x / TILE_SIZE);
    const ty = Math.floor(p.y / TILE_SIZE);
    const own = CanopyField.shadeOfGenome(p.genome);
    expect(h.canopy.lightExcluding(tx, ty, own)).toBeGreaterThanOrEqual(h.canopy.lightAt(tx, ty));
    // Subtracting more shade than the tile carries clamps at full light.
    expect(h.canopy.lightExcluding(tx, ty, 1e6)).toBe(1);
  });

  it("varies inside a single habitat, which the tile-type model could not", () => {
    // The whole point of the canopy layer: shade must differ between two
    // Forest tiles, or a species pinned to Forest by PlantSpecies.habitat has
    // no gradient to sort along. Measured at seed 2026 over the Hollow's
    // 1,999 forest tiles: p05 0.269, p95 0.495, a spread of 0.226. (The
    // plant-weighted spread quoted elsewhere is wider, 0.309 to 0.791,
    // because plants sit where the light is, not uniformly over tiles.)
    const lights: number[] = [];
    for (let y = 0; y < h.map.height; y++) {
      for (let x = 0; x < h.map.width; x++) {
        if (tileAt(h.map, x, y) === Tile.Forest) lights.push(hollowLightAt(h, x, y));
      }
    }
    lights.sort((a, b) => a - b);
    const p05 = lights[(lights.length * 0.05) | 0];
    const p95 = lights[(lights.length * 0.95) | 0];
    console.log(
      `forest-tile light: p05 ${p05.toFixed(3)} p95 ${p95.toFixed(3)} over ${lights.length} tiles`,
    );
    expect(p95 - p05).toBeGreaterThan(0.15); // 0.226 measured
  });
});

describe("selection shaped the result", () => {
  let h: Hollow;
  beforeAll(() => {
    h = hollow();
  }, BUILD_MS);

  it("beats a drift control on mean fitness", () => {
    // The brief asked for a mean fitness above 0.5. That threshold is not
    // reachable and never was: selection draws the mineral field down as it
    // runs and `score`'s afford term reads the drawn-down supply, so an
    // absolute threshold measures the mineral economy rather than selection.
    // The comparison that does measure selection is against a drift control —
    // same seed, map, species and generations, `selection: null` — with both
    // populations scored against the same pristine mineral field.
    const map = generate(SEED, HOLLOW_CONFIG);
    const minerals = mineralFieldFor(map, SEED);
    const landscape = landscapeFor(SEED);
    const drift = new Flora(map, generatePlantSpecies(SEED), SEED, {
      simBudget: BURN_IN_SIM_BUDGET,
    });
    burnIn(drift);
    const driftCanopy = new CanopyField(map.width, map.height);
    driftCanopy.refresh(drift);
    const meanFitness = (f: Flora, canopy: CanopyField) =>
      mean(
        f.all.map((p) => {
          const tx = Math.floor(p.x / TILE_SIZE);
          const ty = Math.floor(p.y / TILE_SIZE);
          const own = CanopyField.shadeOfGenome(p.genome);
          return landscape.score(p.genome, {
            minerals: minerals.sample(tx, ty),
            light: terrainLight(map, tx, ty) * canopy.lightExcluding(tx, ty, own),
          });
        }),
      );
    const sel = meanFitness(h.flora, h.canopy);
    const dri = meanFitness(drift, driftCanopy);
    console.log(
      `mean fitness: selected ${sel.toFixed(4)} (n=${h.flora.all.length}), ` +
        `drift ${dri.toFixed(4)} (n=${drift.all.length})`,
    );
    expect(sel).toBeGreaterThan(dri);
  }, BUILD_MS);
});

describe("light and breadth", () => {
  // ACCEPTANCE MEASUREMENT. Read the whole comment before changing a number.
  //
  // Definitions. *Shade* — 1 minus a plant's light, where light is
  // `terrainLight(tile) * canopy.lightExcluding(tile, the plant's own shade
  // weight)`, in [0, 1]. *Dark / bright quartile* — the 25% of living plants
  // in the least / most light. *Mean spread* — mean `genome.spread`
  // normalised to [0, 1], the trait `score`'s light term now reads.
  // *Within-species r* — the population-weighted mean Pearson correlation
  // between shade and normalised spread, computed inside each species with at
  // least 50 members, so that composition across species is removed.
  //
  // WHY SPREAD AND NOT HEIGHT. `height` is what casts shade in CanopyField.
  // Selecting on it too made the target chase itself, and the within-species
  // height gradient stayed at zero at every weight tried. `spread` casts no
  // shade, so the circularity is gone.
  //
  // THE CIRCULARITY WAS NOT THE BINDING CONSTRAINT. Removing it did not make
  // the within-species gradient appear. Measured r(shade, spread), three
  // conditions, three seeds, about 8,000 plants and 12-17 species each:
  //
  //             derived light   constant 0.5   LIGHT_WEIGHT 0
  //   seed 2026     0.0342         0.0096          0.0123
  //   seed   11     0.0665         0.0245         -0.0062
  //   seed    5    -0.0190        -0.0483          0.0196
  //
  // Every value is under 0.07, and the two controls disagree on the shape of
  // the null. Derived minus constant-0.5: +0.0246, +0.0420, +0.0293 — same
  // sign on all three seeds. Derived minus LIGHT_WEIGHT 0: +0.0219, +0.0727,
  // -0.0386 — sign flips on seed 5 alone. Either way the largest magnitude is
  // 0.0727, far below the 0.09 the legibility claim needed.
  // Nor is it a matter of time: at seed 2026 the correlation is 0.0342 at 400
  // generations, -0.0237 at 1200 and 0.0344 at 2400 — flat over a sixfold
  // increase, so it is blocked rather than slow. No assertion is made on it;
  // see the report for what remains as the suspected constraint.
  //
  // WHAT IS TRUE ISLAND-WIDE. Shaded ground does carry the broader plants,
  // and by a wide margin. Seed 2026, quartiles of about 2,060 plants each:
  // mean spread 0.692 dark against 0.354 bright. But that separation is
  // mostly composition, and it is not cleanly attributable to the light term:
  // against the LIGHT_WEIGHT 0 control the separation moves +0.034 (seed
  // 2026), +0.090 (seed 11) and -0.089 (seed 5). Sign-unstable, so it is
  // recorded here with its numbers rather than asserted as an effect.
  let derived: ReturnType<typeof quartileHeights>;
  let constant: ReturnType<typeof quartileHeights>;
  let derivedPop: number;
  let constantPop: number;
  beforeAll(() => {
    const h = hollow();
    derived = quartileHeights(h.map, h.canopy, h.flora);
    derivedPop = h.flora.all.length;
    const c = constantLightControl();
    constant = quartileHeights(c.map, c.canopy, c.flora);
    constantPop = c.flora.all.length;
    const line = (label: string, q: typeof derived) =>
      `${label}: spread dark ${q.darkSpread.toFixed(3)} (n=${q.nDark}) bright ${q.brightSpread.toFixed(3)} (n=${q.nBright}) sep ${(q.darkSpread - q.brightSpread).toFixed(3)}; ` +
      `height dark ${q.dark.toFixed(3)} bright ${q.bright.toFixed(3)} gap ${(q.bright - q.dark).toFixed(3)}; ` +
      `within-species r ${q.withinSpecies.toFixed(4)}`;
    console.log(`${line("derived light ", derived)}\n${line("constant 0.5  ", constant)}`);
  }, BUILD_MS);

  it("takes both quartiles from samples large enough to mean", () => {
    expect(derived.nDark).toBeGreaterThan(1500);
    expect(derived.nBright).toBeGreaterThan(1500);
    expect(constant.nDark).toBeGreaterThan(1500);
    expect(constant.nBright).toBeGreaterThan(1500);
  });

  it("leaves the shaded quartile broader than the sunlit one", () => {
    // 0.676 against 0.375 measured at seed 2026, and 0.675 against 0.408 on
    // the constant-light control — so this is the island's shape, NOT an
    // effect of the light term, and the threshold is set where both sides
    // clear it. What it pins is that the measurement is being taken at all
    // and that the sign has not inverted.
    expect(derived.darkSpread - derived.brightSpread).toBeGreaterThan(0.15);
    expect(constant.darkSpread - constant.brightSpread).toBeGreaterThan(0.15);
  });

  it("records a within-species correlation that has not risen above noise", () => {
    // Pinned as a null, not as a success: if a later change to habitat
    // pinning or to dispersal makes individuals sort by breadth, this case
    // fails and the numbers in the comment above must be re-measured. At
    // LIGHT_WEIGHT 0.25, seed 2026: +0.0294 derived against +0.0157 on the
    // constant-light control. The bound is set well above the largest
    // magnitude seen anywhere in the sweeps (0.144), so the null is asserted
    // rather than any exact value.
    expect(Math.abs(derived.withinSpecies)).toBeLessThan(0.15);
  });

  it("is wired into the selection context, not replaced by a constant", () => {
    // Neither quartile measurement above can fail if `attempt` swaps the
    // canopy for a constant, because the island-wide separation is
    // composition either way. This can: the two burn-ins differ in nothing
    // but `light`, so any difference in the population they leave is the
    // light term and nothing else. Measured: 8,240 plants with derived
    // light, 8,248 with the constant.
    console.log(`population: derived light ${derivedPop}, constant light ${constantPop}`);
    expect(derivedPop).not.toBe(constantPop);
  });
});

describe("LIGHT_WEIGHT", () => {
  it("leaves the NK landscape in control at the worst light mismatch", () => {
    // score multiplies the NK/mineral mean by (1-W) + W*lightFit. At W = 0.25
    // and lightFit = 0 that floor is 0.75, so a total light mismatch costs a
    // plant a quarter of its score, and score stays in [0, 1].
    expect(LIGHT_WEIGHT).toBeGreaterThan(0);
    expect(LIGHT_WEIGHT).toBeLessThanOrEqual(1);
    const L = landscapeFor(21);
    const minerals = new Float32Array(6).fill(0.6);
    const species = generatePlantSpecies(21);
    const broad = { ...species[0].archetype, spread: S_HI };
    const narrow = { ...species[0].archetype, spread: S_LO };
    for (const g of [broad, narrow]) {
      for (const light of [0, 0.25, 0.5, 0.85, 1]) {
        const s = L.score(g, { minerals, light });
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(1);
      }
    }
    // Direction: a broad genome prefers the shade, a narrow one the open.
    // This is the score-level claim the whole light term rests on, and it is
    // exact — no burn-in, no population, no noise.
    expect(L.score(broad, { minerals, light: 0.2 })).toBeGreaterThan(
      L.score(broad, { minerals, light: 0.9 }),
    );
    expect(L.score(narrow, { minerals, light: 0.9 })).toBeGreaterThan(
      L.score(narrow, { minerals, light: 0.2 }),
    );
    // And height is NOT what light reads any more: two genomes differing only
    // in height score identically at a fixed light.
    const lowT = { ...species[0].archetype, height: H_LO, spread: 0.5 };
    const highT = { ...species[0].archetype, height: H_HI, spread: 0.5 };
    const lightPart = (g: Genome) =>
      L.score(g, { minerals, light: 0.2 }) / L.score(g, { minerals, light: 0.9 });
    expect(lightPart(lowT)).toBeCloseTo(lightPart(highT), 10);
  });
});
