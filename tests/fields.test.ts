import { describe, expect, it } from "vitest";
import {
  MINERAL_HUES,
  MINERAL_LABELS,
  dominantMineral,
  ladderCaption,
  ladderOf,
  rung,
  washColor,
} from "../src/render/fields";
import { groundLines } from "../src/render/inspect";
import { MINERAL_COUNT } from "../src/life/minerals";

describe("the field ladder", () => {
  it("takes its lo and hi from the whole island, not from the field's declared range", () => {
    // a field that only ever runs 0.40..0.52 — the shape the canopy light
    // field actually has (sd 0.05-0.12, docs/03-ECOLOGY-DESIGN-SPACE.md §12.3)
    const l = ladderOf(10, 10, (tx) => 0.4 + tx * 0.012);
    expect(l.lo).toBeCloseTo(0.4, 6);
    expect(l.hi).toBeCloseTo(0.508, 6);
    // and the ramp is spent on that range: the two ends are 0 and 1
    expect(rung(0.4, l)).toBe(0);
    expect(rung(0.508, l)).toBeCloseTo(1, 6);
  });

  it("gives a constant field one flat tone rather than dividing by zero", () => {
    const l = ladderOf(8, 8, () => 0.6);
    expect(Number.isFinite(rung(0.6, l))).toBe(true);
    expect(rung(0.6, l)).toBe(0);
  });

  it("clamps values outside the ladder", () => {
    const l = { lo: 0.2, hi: 0.8 };
    expect(rung(0.1, l)).toBe(0);
    expect(rung(0.9, l)).toBe(1);
    expect(rung(0.5, l)).toBeCloseTo(0.5, 6);
  });

  it("prints both ends of the ramp so one island's wash is not read as another's", () => {
    expect(ladderCaption({ lo: 0.31, hi: 0.88 })).toBe("0.31 dark → 0.88 bright");
  });
});

describe("the wash colour", () => {
  it("carries the quantity in lightness, so the ramp reads as value", () => {
    const dark = washColor(0, null, 0.8);
    const bright = washColor(1, null, 0.8);
    expect(dark).toBe("hsla(48, 26%, 9.0%, 0.8)");
    expect(bright).toBe("hsla(48, 26%, 90.0%, 0.8)");
  });

  it("uses hue only to name a category, at the same lightness", () => {
    const a = washColor(0.5, MINERAL_HUES[0], 0.8);
    const b = washColor(0.5, MINERAL_HUES[4], 0.8);
    expect(a).not.toBe(b);
    expect(a.split(",")[2]).toBe(b.split(",")[2]); // same lightness
  });

  it("has one label and one hue per mineral", () => {
    expect(MINERAL_LABELS).toHaveLength(MINERAL_COUNT);
    expect(MINERAL_HUES).toHaveLength(MINERAL_COUNT);
    expect(new Set(MINERAL_HUES).size).toBe(MINERAL_COUNT);
  });
});

describe("the dominant mineral", () => {
  it("is the largest of the six, with its amount", () => {
    const v = new Float32Array([0.1, 0.4, 0.2, 0.9, 0.3, 0.05]);
    expect(dominantMineral(v)).toEqual({ index: 3, amount: expect.closeTo(0.9, 5) });
  });

  it("falls back to the first when every mineral reads zero (a barren tile)", () => {
    expect(dominantMineral(new Float32Array(MINERAL_COUNT)).index).toBe(0);
  });
});

describe("the ground reading", () => {
  const base = {
    fitness: 0.52,
    light: 0.41,
    demand: 0.61,
    supply: 0.22,
    mineral: "mineral 3",
  };

  it("names the shortfall between what a plant draws and what the tile holds", () => {
    const lines = groundLines(base);
    expect(lines[2]).toBe(
      "draws 0.61 of mineral 3; this tile holds 0.22 — short by 0.39",
    );
  });

  it("says so plainly when the tile has enough", () => {
    expect(groundLines({ ...base, supply: 0.7 })[2]).toBe(
      "draws 0.61 of mineral 3; this tile holds 0.70 — enough",
    );
  });

  it("carries both a word and the number for fit and light", () => {
    const lines = groundLines(base);
    expect(lines[0]).toBe("well fed here — 0.52 of 1");
    expect(lines[1]).toBe("standing in deep shade — 0.41 of open sun");
    expect(groundLines({ ...base, light: 0.95 })[1]).toBe(
      "standing in full sun — 0.95 of open sun",
    );
  });

  it("dates a kind that arose during burn-in, and names a founder as a founder", () => {
    expect(groundLines({ ...base, generation: 218, generationsTotal: 400 })[3]).toBe(
      "its kind arose in generation 218 of 400",
    );
    expect(groundLines(base)[3]).toBe("a founding kind — here from the first generation");
  });

  it("never renders a generation count for a kind that split during play", () => {
    const line = groundLines({ ...base, bornDuringPlay: true })[3];
    expect(line).toBe("its kind split off since you arrived");
    expect(line).not.toContain("of 400");
    expect(line).not.toMatch(/\d/);
  });

  it("never claims an individual has adapted to its light", () => {
    // §12.3: there is no within-species light gradient. The panel must not
    // imply one, so no line may use the language of individual adaptation.
    const all = [
      ...groundLines(base),
      ...groundLines({ ...base, light: 0.95, generation: 4, generationsTotal: 400 }),
    ].join(" ");
    for (const word of ["adapted", "adapt", "evolved", "suited to", "shade-loving", "because"]) {
      expect(all).not.toContain(word);
    }
  });
});
