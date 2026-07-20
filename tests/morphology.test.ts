import { expect, test } from "vitest";
import {
  APPETITE_MIN,
  BODY_PLANS,
  appetite,
  generateCritterSpecies,
  morphOf,
} from "../src/life/fauna";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { generate } from "../src/world/generate";
import { isWalkable } from "../src/world/types";

const SEEDS = [1, 7, 20, 42, 137, 777];

function menagerie(seed: number) {
  const map = generate(seed);
  const plants = generatePlantSpecies(seed);
  const flora = new Flora(map, plants, seed);
  return { map, plants, species: generateCritterSpecies(seed, map, flora, plants) };
}

// ── the genome itself ───────────────────────────────────────────────────

test("morphOf is deterministic: the same body always grows the same genome", () => {
  const body = { bodyHue: 0.412, earLen: 0.7, tailLen: 0.2, size: 1.1 };
  expect(morphOf(body)).toEqual(morphOf({ ...body }));
});

test("a journal's rounded memory grows the identical genome — portraits never drift", () => {
  // the journal keeps the four numbers rounded to 3 decimals (r3); the
  // genome must hash the full-precision and remembered bodies identically
  const r3 = (v: number): number => Math.round(v * 1000) / 1000;
  const full = { bodyHue: 0.4117289, earLen: 0.7000004, tailLen: 0.1999991, size: 1.0989997 };
  const remembered = {
    bodyHue: r3(full.bodyHue),
    earLen: r3(full.earLen),
    tailLen: r3(full.tailLen),
    size: r3(full.size),
  };
  expect(morphOf(remembered)).toEqual(morphOf(full));
});

test("every generated species carries the genome its four numbers grow", () => {
  for (const seed of SEEDS) {
    for (const sp of menagerie(seed).species) {
      expect(sp.morph).toEqual(
        morphOf({ bodyHue: sp.bodyHue, earLen: sp.earLen, tailLen: sp.tailLen, size: sp.size }),
      );
    }
  }
});

test("morph fields stay inside their domains across many bodies", () => {
  const rng = (n: number) => ((n * 9301 + 49297) % 233280) / 233280; // cheap spread, not game rng
  for (let i = 0; i < 400; i++) {
    const m = morphOf({
      bodyHue: rng(i),
      earLen: rng(i + 1000),
      tailLen: rng(i + 2000),
      size: 0.35 + rng(i + 3000) * 1.25,
    });
    expect(BODY_PLANS).toContain(m.plan);
    expect(m.legPairs).toBeGreaterThanOrEqual(0);
    expect(m.legPairs).toBeLessThanOrEqual(4);
    expect(m.legLen).toBeGreaterThanOrEqual(0);
    expect(m.legLen).toBeLessThanOrEqual(1);
    expect([1, 2, 3]).toContain(m.eyeCount);
    expect(["none", "nub", "sweep", "curl", "plume", "whip"]).toContain(m.tail);
    expect(["none", "ears", "lop", "round", "horns", "antennae", "crest"]).toContain(m.crown);
    expect(["plain", "spots", "stripes", "bands", "saddle"]).toContain(m.pattern);
    expect(m.accentHue).toBeGreaterThanOrEqual(0);
    expect(m.accentHue).toBeLessThan(1);
  }
});

test("the genome axes actually vary — no axis is stuck", () => {
  const plans = new Set<string>();
  const tails = new Set<string>();
  const crowns = new Set<string>();
  const patterns = new Set<string>();
  const eyes = new Set<number>();
  const rng = (n: number) => ((n * 7907 + 12289) % 104729) / 104729;
  for (let i = 0; i < 600; i++) {
    const m = morphOf({
      bodyHue: rng(i),
      earLen: rng(i * 3 + 1),
      tailLen: rng(i * 5 + 2),
      size: 0.35 + rng(i * 7 + 3) * 1.25,
    });
    plans.add(m.plan);
    tails.add(m.tail);
    crowns.add(m.crown);
    patterns.add(m.pattern);
    eyes.add(m.eyeCount);
  }
  expect(plans.size).toBe(8); // all eight archetypes appear
  expect(tails.size).toBe(6);
  expect(crowns.size).toBe(7);
  expect(patterns.size).toBe(5);
  expect(eyes.size).toBe(3);
});

// ── the island's menagerie ──────────────────────────────────────────────

test("islands host five to eight kinds, generated deterministically", () => {
  for (const seed of SEEDS) {
    const a = menagerie(seed).species;
    const b = menagerie(seed).species;
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThanOrEqual(5);
    expect(a.length).toBeLessThanOrEqual(8);
  }
}, 30_000); // generates each island twice across many seeds — slow under load

test("every island spreads its bodies: a tiny scurrier, a large ambler, distinct plans", () => {
  for (const seed of SEEDS) {
    const species = menagerie(seed).species;
    const sizes = species.map((s) => s.size);
    expect(Math.min(...sizes)).toBeLessThanOrEqual(0.6); // something mouse-small
    expect(Math.max(...sizes)).toBeGreaterThanOrEqual(1.2); // something knee-high
    for (const s of sizes) {
      expect(s).toBeGreaterThanOrEqual(0.35);
      expect(s).toBeLessThanOrEqual(1.6);
    }
    // no island of near-identical kinds: body plans are (all but at most
    // one) distinct
    const plans = new Set(species.map((s) => s.morph.plan));
    expect(plans.size).toBeGreaterThanOrEqual(species.length - 1);
    expect(plans.size).toBeGreaterThanOrEqual(4);
  }
});

test("the behavior contract is intact for every kind at the higher count", () => {
  for (const seed of SEEDS) {
    const { map, plants, species } = menagerie(seed);
    for (const sp of species) {
      // a valid palate cut from a real, lovable plant
      expect(appetite(sp.palate, plants[sp.favoriteSpecies].archetype)).toBeGreaterThan(
        APPETITE_MIN,
      );
      expect(sp.palate.form).not.toBe(PlantForm.Tree);
      expect(sp.palate.form).not.toBe(PlantForm.Coral);
      // a real role and a walkable den
      expect(["disperser", "grazer"]).toContain(sp.role);
      expect(isWalkable(map, sp.den.x, sp.den.y)).toBe(true);
    }
    // favorites stay distinct — no two kinds born loving the same plant
    expect(new Set(species.map((s) => s.favoriteSpecies)).size).toBe(species.length);
  }
});
