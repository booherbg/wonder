import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import {
  GENOME_BOUNDS,
  Genome,
  NUMERIC_TRAITS,
  PlantForm,
  mutate,
  phenoKey,
} from "../src/life/genome";
import { Flora } from "../src/life/flora";
import { FORM_RANGES, PlantSpecies, generatePlantSpecies } from "../src/life/species";
import { plantShadowSpec } from "../src/render/depth";
import {
  PLANT_SPRITE_H,
  PLANT_SPRITE_W,
  PixelCtx,
  drawPlantSprite,
} from "../src/render/plantSprites";
import { TILE_SIZE } from "../src/world/config";
import { generate } from "../src/world/generate";
import { Tile, WorldMap } from "../src/world/types";

const ALL_FORMS = Object.values(PlantForm).filter((v): v is PlantForm => typeof v === "number");

// where each form is allowed to take root (mirror of the habitat pools)
const ALLOWED: Record<PlantForm, readonly Tile[]> = {
  [PlantForm.Flower]: [Tile.Grass, Tile.Forest, Tile.Sand, Tile.ShallowWater, Tile.Marsh],
  [PlantForm.Shrub]: [Tile.Grass, Tile.Forest, Tile.Sand, Tile.ShallowWater, Tile.Rock, Tile.Marsh],
  [PlantForm.Tree]: [Tile.Forest],
  [PlantForm.Fungus]: [Tile.Grass, Tile.Forest, Tile.Rock, Tile.Marsh],
  [PlantForm.Fern]: [Tile.Forest, Tile.Marsh],
  [PlantForm.Coral]: [Tile.ShallowWater],
  [PlantForm.Succulent]: [Tile.Sand, Tile.Rock],
  [PlantForm.Reed]: [Tile.ShallowWater, Tile.Marsh],
  [PlantForm.Vine]: [Tile.Forest, Tile.Marsh],
  [PlantForm.Grass]: [Tile.Grass, Tile.Sand],
  [PlantForm.Moss]: [Tile.Forest, Tile.Rock],
  [PlantForm.Bulb]: [Tile.Grass, Tile.Marsh],
  [PlantForm.Sporestalk]: [Tile.Forest, Tile.Rock],
  [PlantForm.Kelp]: [Tile.ShallowWater],
};

function genomeOf(form: PlantForm, over: Partial<Genome> = {}): Genome {
  return {
    form,
    hue: 0.62, hue2: 0.12, sat: 0.85, height: 0.5, spread: 0.55,
    petals: 7, leaves: 2, lean: 0.2, glow: 0.3,
    ...over,
  };
}

test("every form takes root somewhere, and only where its habitat allows", () => {
  const seen = new Set<PlantForm>();
  for (let seed = 1; seed <= 60; seed++) {
    for (const sp of generatePlantSpecies(seed)) {
      seen.add(sp.archetype.form);
      expect(ALLOWED[sp.archetype.form]).toContain(sp.habitat);
    }
  }
  for (const form of ALL_FORMS) expect(seen.has(form)).toBe(true);
});

test("archetypes stay within their form's ranges", () => {
  for (let seed = 1; seed <= 30; seed++) {
    for (const sp of generatePlantSpecies(seed)) {
      if (sp.sport) continue; // the island's one oddball is turned up on purpose
      const r = FORM_RANGES[sp.archetype.form];
      expect(sp.archetype.height).toBeGreaterThanOrEqual(r.height[0]);
      expect(sp.archetype.height).toBeLessThanOrEqual(r.height[1]);
      expect(sp.archetype.glow).toBeLessThanOrEqual(r.glowMax);
    }
  }
});

test("phenoKey tells all the forms apart", () => {
  const keys = new Set(ALL_FORMS.map((form) => phenoKey(genomeOf(form))));
  expect(keys.size).toBe(ALL_FORMS.length);
});

test("new-form genomes drift within bounds and never change form", () => {
  for (const form of [PlantForm.Reed, PlantForm.Moss, PlantForm.Kelp, PlantForm.Sporestalk]) {
    const rng = makeRng(7 + form);
    let g = genomeOf(form);
    for (let i = 0; i < 200; i++) {
      g = mutate(g, rng, 0.08);
      expect(g.form).toBe(form);
      for (const key of NUMERIC_TRAITS) {
        const [lo, hi] = GENOME_BOUNDS[key];
        expect(g[key]).toBeGreaterThanOrEqual(lo);
        expect(g[key]).toBeLessThanOrEqual(hi);
      }
    }
  }
});

// A recording stub in place of a canvas: which pixels were painted, in how
// many distinct tones.
function recordingCtx(): PixelCtx & { rects: { x: number; y: number }[]; tones: Set<string> } {
  const rec = {
    fillStyle: "" as string,
    globalAlpha: 1,
    rects: [] as { x: number; y: number }[],
    tones: new Set<string>(),
    fillRect(x: number, y: number, w: number, h: number) {
      rec.rects.push({ x, y });
      void w;
      void h;
      rec.tones.add(String(rec.fillStyle));
    },
  };
  return rec;
}

test("every form draws a sprite: a real body, inside the frame, in many tones", () => {
  for (const form of ALL_FORMS) {
    for (const glow of [0.3, 0.95]) {
      const ctx = recordingCtx();
      drawPlantSprite(ctx, genomeOf(form, { glow }));
      expect(ctx.rects.length).toBeGreaterThan(12); // a body, not a speck
      for (const r of ctx.rects) {
        expect(r.x).toBeGreaterThanOrEqual(-1); // canvas clips the odd edge pixel
        expect(r.x).toBeLessThanOrEqual(PLANT_SPRITE_W);
        expect(r.y).toBeGreaterThanOrEqual(-1);
        expect(r.y).toBeLessThanOrEqual(PLANT_SPRITE_H);
      }
      // depth is tonal: a lit cheek, a turned one, a seat — never one flat color
      expect(ctx.tones.size).toBeGreaterThanOrEqual(4);
    }
  }
});

test("aquatic variants still draw: the lily, the water reeds", () => {
  for (const form of [PlantForm.Flower, PlantForm.Shrub]) {
    const ctx = recordingCtx();
    drawPlantSprite(ctx, genomeOf(form), true);
    expect(ctx.rects.length).toBeGreaterThan(10);
    expect(ctx.tones.size).toBeGreaterThanOrEqual(3);
  }
});

test("every land form pools shade at its feet; the drowned forms none", () => {
  for (const form of ALL_FORMS) {
    const spec = plantShadowSpec(genomeOf(form), false);
    if (form === PlantForm.Coral || form === PlantForm.Kelp) {
      expect(spec).toBeNull(); // the light scatters before it lands
    } else {
      expect(spec).not.toBeNull();
      expect(spec!.w).toBeGreaterThan(2);
    }
    expect(plantShadowSpec(genomeOf(form), true)).toBeNull();
  }
});

// ── a new form lives the whole life: drifts, crosses, speciates ──────────────

function grassPatchMap(size = 12): WorldMap {
  const tiles = new Uint8Array(size * size).fill(Tile.Grass);
  return {
    width: size,
    height: size,
    seed: 0,
    tiles,
    elevation: new Float32Array(size * size),
    rivers: [],
    spawn: { x: 1, y: 1 },
  };
}

test("a new-form species drifts far enough to found a daughter", () => {
  const archetype = genomeOf(PlantForm.Bulb, { hue: 0.3, glow: 0.1, height: 0.4 });
  const species: PlantSpecies[] = [
    { id: 0, name: "Testbell", habitat: Tile.Grass, archetype, density: 1, sport: false },
  ];
  const flora = new Flora(grassPatchMap(), species, 21, {
    matureAge: 1,
    reproChance: 1,
    simBudget: 200,
    mutationAmount: 0.01,
    splitCooldownTicks: 0,
    splitClusterMin: 5,
  });
  for (const p of [...flora.all]) flora.removePlant(p);
  const drifted: Genome = { ...archetype, hue: 0.75, height: 0.75, glow: 0.6 };
  for (let i = 0; i < 8; i++) {
    const tx = 5 + (i % 3);
    const ty = 5 + Math.floor(i / 3);
    flora.addPlant(0, { ...drifted }, tx * TILE_SIZE + 8, ty * TILE_SIZE + 8, -100);
  }
  let events: ReturnType<Flora["takeEvents"]> = [];
  for (let i = 0; i < 40 && events.length === 0; i++) {
    flora.simTick();
    events = flora.takeEvents();
  }
  expect(events.length).toBeGreaterThan(0);
  expect(events[0].name).toContain("✧");
  expect(species.length).toBeGreaterThanOrEqual(2);
  expect(species[1].archetype.form).toBe(PlantForm.Bulb); // the daughter keeps the form
  expect(species[1].parent).toBe(0);
});

test("the new families name themselves from their own epithets", () => {
  const families: Partial<Record<PlantForm, string[]>> = {
    [PlantForm.Reed]: ["reed", "rush", "quill", "wand", "whisper"],
    [PlantForm.Vine]: ["vine", "creeper", "coil", "tangle", "trumpet"],
    [PlantForm.Grass]: ["grass", "blade", "sedge", "sway", "fountain"],
    [PlantForm.Moss]: ["moss", "cushion", "lichen", "velvet", "carpet"],
    [PlantForm.Bulb]: ["bell", "lantern", "drop", "chime", "nod"],
    [PlantForm.Sporestalk]: ["stalk", "orb", "wisp", "spire", "beacon"],
    [PlantForm.Kelp]: ["kelp", "ribbon", "strand", "wrack", "banner"],
  };
  let checked = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const sp of generatePlantSpecies(seed)) {
      const words = families[sp.archetype.form];
      if (!words) continue;
      const epithet = sp.name.replace(" ✶", "").split(" ").pop()!.toLowerCase();
      expect(words.some((w) => epithet.endsWith(w))).toBe(true);
      checked++;
    }
  }
  expect(checked).toBeGreaterThan(40); // the new kinds truly circulate
});

test("scatter fills an island generously but never truncates the sweep", () => {
  for (const seed of [20, 42]) {
    const flora = new Flora(generate(seed), generatePlantSpecies(seed), seed);
    expect(flora.count).toBeGreaterThan(2000); // lusher than the old world's floor
    expect(flora.count).toBeLessThan(flora.tuning.maxPlants); // headroom: no mid-sweep starvation
  }
});
