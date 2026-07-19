import { expect, test } from "vitest";
import { Genome, PlantForm } from "../src/life/genome";
import { crownLightSpec, easeToward, plantShadowSpec } from "../src/render/depth";

function genome(over: Partial<Genome> = {}): Genome {
  return {
    form: PlantForm.Tree,
    hue: 0.3,
    hue2: 0.6,
    sat: 0.7,
    height: 0.8,
    spread: 0.5,
    petals: 5,
    leaves: 2,
    lean: 0,
    glow: 0.2,
    ...over,
  };
}

test("shade pools widen with stature and spread", () => {
  const tall = plantShadowSpec(genome({ height: 0.9 }), false)!;
  const short = plantShadowSpec(genome({ height: 0.2 }), false)!;
  expect(tall.w).toBeGreaterThan(short.w);
  const wide = plantShadowSpec(genome({ spread: 0.9 }), false)!;
  const narrow = plantShadowSpec(genome({ spread: 0.2 }), false)!;
  expect(wide.w).toBeGreaterThan(narrow.w);
  // a canopy pools more shade than a flower stem
  const flower = plantShadowSpec(genome({ form: PlantForm.Flower }), false)!;
  expect(tall.w).toBeGreaterThan(flower.w);
});

test("taller plants throw their shade further from the stem", () => {
  const tall = plantShadowSpec(genome({ height: 1 }), false)!;
  const short = plantShadowSpec(genome({ height: 0.1 }), false)!;
  expect(tall.dx).toBeGreaterThan(short.dx);
});

test("no cast shade underwater — the light scatters first", () => {
  expect(plantShadowSpec(genome(), true)).toBeNull();
  expect(plantShadowSpec(genome({ form: PlantForm.Coral }), false)).toBeNull();
});

test("crown light singles out only what stands tall", () => {
  expect(crownLightSpec(genome({ height: 0.9 }))).not.toBeNull();
  expect(crownLightSpec(genome({ height: 0.2 }))).toBeNull();
  expect(crownLightSpec(genome({ form: PlantForm.Fungus, height: 1 }))).toBeNull();
  expect(crownLightSpec(genome({ form: PlantForm.Succulent, height: 1 }))).toBeNull();
});

test("crown light sits higher on taller trees, but stays on the sprite", () => {
  const tall = crownLightSpec(genome({ height: 0.9 }))!;
  const shorter = crownLightSpec(genome({ height: 0.5 }))!;
  expect(tall.dy).toBeLessThan(shorter.dy); // higher = more negative
  const tallest = crownLightSpec(genome({ height: 1 }))!;
  expect(tallest.dy).toBeGreaterThanOrEqual(-25); // clamped inside the sprite
});

test("easeToward is frame-rate independent and settles", () => {
  // exponential form: two half-steps land exactly where one full step does
  const whole = easeToward(0, 1, 0.1, 4);
  const halves = easeToward(easeToward(0, 1, 0.05, 4), 1, 0.05, 4);
  expect(halves).toBeCloseTo(whole, 10);
  // it approaches monotonically and finally snaps home
  let v = 0;
  let prev = 0;
  for (let i = 0; i < 200; i++) {
    v = easeToward(v, 1, 1 / 60, 4);
    expect(v).toBeGreaterThanOrEqual(prev);
    prev = v;
  }
  expect(v).toBe(1);
  // and it comes back down the same way
  for (let i = 0; i < 200; i++) v = easeToward(v, 0, 1 / 60, 4);
  expect(v).toBe(0);
});
