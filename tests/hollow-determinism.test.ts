import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/world/config";
import { generate } from "../src/world/generate";
import { Flora } from "../src/life/flora";
import { generatePlantSpecies } from "../src/life/species";

// The Hollow must not have changed the island every existing save was made on.
// These fingerprints are computed from the classic path only; if a future
// change alters them, that change has broken existing worlds and the failure
// is the point.
describe("the classic island is unchanged by the Hollow", () => {
  const SEEDS = [1, 7, 42, 1234, 2026];

  // GOLDEN FINGERPRINTS, captured from `master` — the code as it stood before
  // any Hollow work. Comparing generate(seed) against generate(seed) would only
  // prove worldgen is deterministic, which it would be even if every island had
  // changed. These hashes are the only thing that proves the classic island is
  // the SAME island it was, and `findSpawn` was modified during Task 5, so this
  // is the guard on that change.
  //
  // If one of these fails, do not update the constant to match. A change here
  // means every existing save now loads a different island.
  const CLASSIC_FINGERPRINTS: Record<number, string> = {
    1: "1d5a05f5691879d8:78,191",
    7: "d95633357116d07b:226,214",
    42: "4e52868adab49b4e:71,106",
    1234: "e504608011512bd9:98,185",
    2026: "a57d70a2f329def5:122,211",
  };

  it("worldgen produces the same islands it did before the Hollow", () => {
    for (const s of SEEDS) {
      const m = generate(s, DEFAULT_CONFIG);
      const hash = createHash("sha256").update(Buffer.from(m.tiles)).digest("hex").slice(0, 16);
      expect(`${hash}:${m.spawn.x},${m.spawn.y}`).toBe(CLASSIC_FINGERPRINTS[s]);
    }
  });

  it("flora with default tuning draws no selection rng", () => {
    for (const s of SEEDS) {
      const map = generate(s, DEFAULT_CONFIG);
      // Two independently-generated species arrays, not one shared array: Flora
      // stores its species-list param by reference and pushes new species onto
      // it in-place on speciation (src/life/flora.ts:705), so sharing one array
      // between two live Flora instances cross-contaminates their species
      // indices and produces a false failure unrelated to the selection hook.
      const a = new Flora(map, generatePlantSpecies(s), s);
      const b = new Flora(map, generatePlantSpecies(s), s, { selection: null });
      for (let i = 0; i < 400; i++) { a.simTick(); b.simTick(); }
      expect(a.all.length).toBe(b.all.length);
      expect(a.tick).toBe(b.tick);
      const fa = a.all.map((p) => `${p.species}:${p.x.toFixed(2)}:${p.y.toFixed(2)}`).join("|");
      const fb = b.all.map((p) => `${p.species}:${p.x.toFixed(2)}:${p.y.toFixed(2)}`).join("|");
      expect(fa).toBe(fb);
    }
  });

  it("DEFAULT_TUNING still has selection off", () => {
    const map = generate(1, DEFAULT_CONFIG);
    const f = new Flora(map, generatePlantSpecies(1), 1);
    expect(f.tuning.selection).toBe(null);
  });
});
