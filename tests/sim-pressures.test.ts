import { expect, test } from "vitest";
import {
  PRESSURES, fieldValueFor, grazerAssignment, richnessMeter, tuningPatchFor,
} from "../src/game/simPressures";
import type { CritterRole } from "../src/life/fauna";
import { chainStats, richnessWord } from "../src/life/foodweb";
import { rollWeb } from "../src/life/rollweb";
import { singleBiome } from "../src/world/construct";
import { Tile } from "../src/world/types";

const SEED = 4242;

test("seven pressures are exposed; six tuning-backed ones name a FloraTuning field", () => {
  expect(PRESSURES.map((p) => p.id)).toEqual([
    "mutationAmount", "splitDistance", "grazerShare", "reproChance", "maxPerTile",
    "reseedRadius", "pollinationRadius",
  ]);
  expect(PRESSURES.filter((p) => p.tuningKey).length).toBe(6);
});

test("tuningPatchFor maps each tuning pressure to its field; speciation opens the split gates", () => {
  expect(tuningPatchFor("mutationAmount", 0.2)).toEqual({ mutationAmount: 0.2 });
  expect(tuningPatchFor("reproChance", 0.3)).toEqual({ reproChance: 0.3 });
  expect(tuningPatchFor("maxPerTile", 6.4)).toEqual({ maxPerTile: 6 }); // an integer cap
  expect(tuningPatchFor("reseedRadius", 5.2)).toEqual({ reseedRadius: 5 });
  expect(tuningPatchFor("pollinationRadius", 1.1)).toEqual({ pollinationRadius: 1 });
  const wild = tuningPatchFor("splitDistance", 0.1);
  expect(wild.splitDistance).toBe(0.1);
  expect(wild.splitClusterMin).toBe(2);       // a low threshold also frees the cluster gate
  expect(wild.splitCooldownTicks).toBe(0);    // …and the cooldown, so it actually fires
  expect(tuningPatchFor("grazerShare", 0.5)).toEqual({}); // not a tuning field
});

test("tuningPatchFor clamps a wild value to the pressure's own range, so a wild slider can't break the sim", () => {
  const maxPerTile = PRESSURES.find((p) => p.id === "maxPerTile")!;
  expect(tuningPatchFor("maxPerTile", -5).maxPerTile).toBeGreaterThanOrEqual(1);
  expect(tuningPatchFor("maxPerTile", -5).maxPerTile).toBeGreaterThanOrEqual(maxPerTile.min);

  const mutation = PRESSURES.find((p) => p.id === "mutationAmount")!;
  const wildMutation = tuningPatchFor("mutationAmount", 999);
  expect(wildMutation.mutationAmount).toBeLessThanOrEqual(mutation.max);
  expect(wildMutation.mutationAmount).toBeGreaterThanOrEqual(mutation.min);

  const repro = PRESSURES.find((p) => p.id === "reproChance")!;
  expect(tuningPatchFor("reproChance", -10).reproChance).toBeGreaterThanOrEqual(repro.min);

  const split = PRESSURES.find((p) => p.id === "splitDistance")!;
  expect(tuningPatchFor("splitDistance", 5).splitDistance).toBeLessThanOrEqual(split.max);
});

test("fieldValueFor mirrors ONLY the reversed pressure (speciation), so right-slider = wilder for all five", () => {
  // splitDistance is reversed: a HIGH slider value (right end) must map to
  // the LOW real field (wild speciation) and vice versa.
  expect(fieldValueFor("splitDistance", 0.6)).toBeCloseTo(0.08);
  expect(fieldValueFor("splitDistance", 0.08)).toBeCloseTo(0.6);
  // a non-reversed pressure is untouched — identity beyond the usual clamp.
  expect(fieldValueFor("mutationAmount", 0.2)).toBe(0.2);
});

test("grazerAssignment flips a deterministic share of kinds to grazer", () => {
  const ids = [5, 2, 9, 1]; // unsorted on purpose
  const a = grazerAssignment(ids, 0.5);
  expect([...a.entries()].sort()).toEqual([...grazerAssignment(ids, 0.5).entries()].sort()); // deterministic
  expect([...a.values()].filter((r) => r === "grazer").length).toBe(2); // round(0.5*4)
  expect([...grazerAssignment(ids, 0).values()].every((r) => r === "disperser")).toBe(true);
  expect([...grazerAssignment(ids, 1).values()].every((r) => r === "grazer")).toBe(true);
});

test("grazerAssignment leaves bench-role kinds untouched (F8)", () => {
  const ids = [0, 1, 2, 3];
  const roleOf = (id: number): CritterRole =>
    id === 1 ? "nutrient-shuttle" : id === 3 ? "aquatic-grazer" : "disperser";
  const a = grazerAssignment(ids, 1, roleOf); // share 1 → every ELIGIBLE kind grazes
  expect(a.has(1)).toBe(false); // the shuttle a player set in the ambient tray is preserved
  expect(a.has(3)).toBe(false); // the fish is preserved
  expect(a.get(0)).toBe("grazer"); // the two plain kinds still repaint
  expect(a.get(2)).toBe("grazer");
  // a pollinator is a bench role too, and share 0 still skips it (never repainted to disperser)
  const withPollinator = grazerAssignment([7, 8], 0, (id) => (id === 7 ? "pollinator" : "disperser"));
  expect(withPollinator.has(7)).toBe(false);
  expect(withPollinator.get(8)).toBe("disperser");
  // WITHOUT roleOf, behavior is unchanged — every kind eligible (back-compat)
  expect([...grazerAssignment(ids, 1).values()].every((r) => r === "grazer")).toBe(true);
});

test("richnessMeter reuses the diversityScore formula + richnessWord thresholds", () => {
  expect(richnessMeter([], []).word).toBe("flat"); // an empty construct is flat
  const map = singleBiome(SEED, Tile.Grass, 40);
  const web = rollWeb(SEED, 0, 3, new Set([Tile.Grass]), map);
  const plants = web.chains.flatMap((c) => [c.source, c.feeder]);
  const critters = web.chains.map((c) => c.disperser);
  const r = richnessMeter(plants, critters);
  const stats = chainStats(plants, critters);
  expect(r.score).toBeCloseTo(stats.chains + 2 * (stats.redundancy - 1)); // the SAME arithmetic
  expect(r.word).toBe(richnessWord(r.score));
  expect(r.chains).toBeGreaterThan(0);
  expect(r.closable).toBeGreaterThan(0); // a rolled web is closable → a real chain to watch
});
