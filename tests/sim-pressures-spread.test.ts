import { expect, test } from "vitest";
import { DEFAULT_TUNING } from "../src/life/flora";
import { tuningPatchFor } from "../src/game/simPressures";

test("tuningPatchFor maps spread distance to integer-clamped reseedRadius", () => {
  expect(tuningPatchFor("reseedRadius", DEFAULT_TUNING.reseedRadius)).toEqual({ reseedRadius: 3 });
  expect(tuningPatchFor("reseedRadius", 4.7)).toEqual({ reseedRadius: 5 });
  expect(tuningPatchFor("reseedRadius", 0).reseedRadius).toBe(1); // min 1
  expect(tuningPatchFor("reseedRadius", 99).reseedRadius).toBe(8); // max 8
});

test("tuningPatchFor maps cross distance to integer-clamped pollinationRadius", () => {
  expect(tuningPatchFor("pollinationRadius", DEFAULT_TUNING.pollinationRadius)).toEqual({ pollinationRadius: 2 });
  expect(tuningPatchFor("pollinationRadius", 2.9)).toEqual({ pollinationRadius: 3 });
  expect(tuningPatchFor("pollinationRadius", -1).pollinationRadius).toBe(0); // min 0
  expect(tuningPatchFor("pollinationRadius", 99).pollinationRadius).toBe(6); // max 6
});
