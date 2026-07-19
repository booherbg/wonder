import { expect, test } from "vitest";
import {
  Palate,
  TRUST_KEY,
  TRUST_STEP,
  bestOffering,
  loadTrust,
  raiseTrust,
  saveTrust,
  trustWord,
} from "../src/life/fauna";
import { Genome, PlantForm } from "../src/life/genome";

function fakeKV(): { map: Map<string, string>; getItem: (k: string) => string | null; setItem: (k: string, v: string) => void } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

const flower = (hue: number, form = PlantForm.Flower, glow = 0.1): Genome => ({
  form,
  hue,
  hue2: 0.5,
  sat: 0.8,
  height: 0.4,
  spread: 0.5,
  petals: 5,
  leaves: 2,
  lean: 0,
  glow,
});

test("the bond reads up the ladder: wary → warming → trusts you → bonded", () => {
  expect(trustWord(0)).toBe("wary");
  expect(trustWord(0.15)).toBe("warming");
  expect(trustWord(0.5)).toBe("trusts you");
  expect(trustWord(0.8)).toBe("bonded");
  expect(trustWord(1)).toBe("bonded");
});

test("a shared seed warms by a step, and a bond never overfills", () => {
  expect(raiseTrust(0)).toBeCloseTo(TRUST_STEP, 6);
  let t = 0;
  for (let i = 0; i < 20; i++) t = raiseTrust(t);
  expect(t).toBe(1); // capped, however many seeds you share
});

test("the offered seed is the palate's best match, or none if nothing tempts", () => {
  const palate: Palate = { form: PlantForm.Flower, hueCenter: 0.3, hueWidth: 0.15, glowTaste: 0 };
  // a far-hue flower, the exact one, a near one — the exact match is chosen
  expect(bestOffering(palate, [{ genome: flower(0.9) }, { genome: flower(0.3) }, { genome: flower(0.32) }])).toBe(1);
  // wrong form and far hue: it isn't interested, no harm done
  expect(bestOffering(palate, [{ genome: flower(0.3, PlantForm.Shrub) }, { genome: flower(0.9) }])).toBe(-1);
  expect(bestOffering(palate, [])).toBe(-1);
});

test("a friendship is kept per island and survives a reload", () => {
  const kv = fakeKV();
  saveTrust(7, new Map([[0, 0.45], [2, 0.9]]), kv);
  saveTrust(42, new Map([[0, 0.3]]), kv); // a different island shares the one book
  const back = loadTrust(7, kv);
  expect(back.get(0)).toBeCloseTo(0.45, 6);
  expect(back.get(2)).toBeCloseTo(0.9, 6);
  expect(back.has(1)).toBe(false); // a kind never fed stays absent
  expect(loadTrust(42, kv).get(0)).toBeCloseTo(0.3, 6); // island 7's book didn't disturb island 42's
});

test("unreadable trust storage simply starts every kind wary again", () => {
  const kv = fakeKV();
  kv.map.set(TRUST_KEY, "{ not json ]");
  expect(loadTrust(7, kv).size).toBe(0);
});
