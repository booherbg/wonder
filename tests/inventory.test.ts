import { expect, test } from "vitest";
import { INV_CAP, emptyInventory, gather, sow } from "../src/game/inventory";
import { Genome, PlantForm } from "../src/life/genome";

function seedOf(hue: number): { species: number; genome: Genome } {
  return {
    species: 0,
    genome: {
      form: PlantForm.Flower,
      hue, hue2: 0.5, sat: 0.8, height: 0.4, spread: 0.5,
      petals: 5, leaves: 2, lean: 0, glow: 0.1,
    },
  };
}

test("gather then sow returns the exact same genome, FIFO order", () => {
  let inv = emptyInventory();
  inv = gather(inv, seedOf(0.1))!;
  inv = gather(inv, seedOf(0.9))!;
  const [after, planted] = sow(inv)!;
  expect(planted.genome.hue).toBe(0.1);
  expect(after.seeds).toHaveLength(1);
  expect(sow(after)![1].genome.hue).toBe(0.9);
});

test("inventory caps at INV_CAP and sow on empty returns null", () => {
  let inv = emptyInventory();
  for (let i = 0; i < INV_CAP; i++) {
    const next = gather(inv, seedOf(i / 10));
    expect(next).not.toBeNull();
    inv = next!;
  }
  expect(gather(inv, seedOf(0.99))).toBeNull();
  expect(sow(emptyInventory())).toBeNull();
});

test("gather does not mutate the original inventory", () => {
  const inv = emptyInventory();
  gather(inv, seedOf(0.3));
  expect(inv.seeds).toHaveLength(0);
});
