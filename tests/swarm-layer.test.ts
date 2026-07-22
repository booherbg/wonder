import { expect, test } from "vitest";
import { Flora } from "../src/life/flora";
import { PlantForm } from "../src/life/genome";
import { generatePlantSpecies } from "../src/life/species";
import { generate } from "../src/world/generate";
import { isBloom } from "../src/render/ambient";
import {
  MAX_SWARMS,
  MIN_SWARMS,
  SPARSE_SWARMS,
  SWARM_COUNT_CAP,
  SwarmLayer,
  buildFlowerMaps,
  buildPollen,
  canFlower,
  courtingSwarm,
  eventInView,
  flowerSizeFor,
  sowKey,
} from "../src/game/swarms";

// The world swarm layer is a purely additive life/visual layer bolted onto a
// real island: it reads flora, spawns a bounded set of swarms near the blooms,
// and each heartbeat homes each on its nearest flowering plant. These pin the
// spatial glue (the part on top of the tested idmap/swarm core) and — crucially
// — that it never disturbs the flora it rides on.

const SEED = 20; // the seed the ecology-holds guard uses too

function build(seed = SEED): { flora: Flora; layer: SwarmLayer; species: ReturnType<typeof generatePlantSpecies> } {
  const map = generate(seed);
  const species = generatePlantSpecies(seed);
  const flora = new Flora(map, species, seed);
  const layer = new SwarmLayer(seed, species, flora);
  return { flora, layer, species };
}

test("a flower map is built for every flowering species, and only those", () => {
  const species = generatePlantSpecies(SEED);
  const flowers = buildFlowerMaps(SEED, species);
  for (const sp of species) {
    if (canFlower(sp.archetype.form)) {
      const flower = flowers.get(sp.id);
      expect(flower).toBeDefined();
      // the accent (the jackpot cells) is exactly the species' flower size
      const accentCells = flower!.accent.reduce((n, v) => n + v, 0);
      expect(accentCells).toBe(flowerSizeFor(sp));
      // a base/foliage colour always fills the grid — there's always something to match
      expect(flower!.map.some((v) => v !== 0)).toBe(true);
    } else {
      expect(flowers.has(sp.id)).toBe(false);
    }
  }
});

test("canFlower matches the isBloom forms (flowers, shrubs, succulents)", () => {
  expect(canFlower(PlantForm.Flower)).toBe(true);
  expect(canFlower(PlantForm.Shrub)).toBe(true);
  expect(canFlower(PlantForm.Succulent)).toBe(true);
  expect(canFlower(PlantForm.Tree)).toBe(false);
  expect(canFlower(PlantForm.Fungus)).toBe(false);
  expect(canFlower(PlantForm.Coral)).toBe(false);
});

test("swarms spawn only on/near flowering plants", () => {
  const { flora, layer } = build();
  expect(layer.swarms.length).toBeGreaterThanOrEqual(MIN_SWARMS);
  expect(layer.swarms.length).toBeLessThanOrEqual(MAX_SWARMS);
  const blooms = flora.all.filter((p) => isBloom(p) && layer.flowers.has(p.species));
  for (const ent of layer.swarms) {
    // each swarm is anchored to a real flowering plant it can work
    expect(ent.home).not.toBeNull();
    expect(layer.flowers.has(ent.home!.species)).toBe(true);
    const host = blooms.find(
      (p) => p.species === ent.home!.species && p.x === ent.home!.x && p.y === ent.home!.y,
    );
    expect(host).toBeDefined();
    // and it hovers close to a bloom, never adrift over bare ground
    const nearestBloom = Math.min(...blooms.map((p) => Math.hypot(p.x - ent.x, p.y - ent.y)));
    expect(nearestBloom).toBeLessThan(3 * 16); // within ~3 tiles
  }
});

test("a swarm re-homes onto the nearest flowering plant each heartbeat (off its sim home)", () => {
  const { flora, layer } = build();
  const ent = layer.swarms[0];
  const blooms = flora.all.filter((p) => isBloom(p) && layer.flowers.has(p.species));
  // move the swarm's SIM-OWNED home onto a DIFFERENT bloom, well away from the old
  // one. Re-homing must follow the sim home, NEVER the animated cloud position —
  // so this drives ent.home (not ent.x/ent.y), which no longer feeds the sim.
  const target = blooms.find((p) => Math.hypot(p.x - ent.home!.x, p.y - ent.home!.y) > 4 * 16);
  expect(target).toBeDefined();
  ent.home = { x: target!.x, y: target!.y, species: target!.species };
  layer.tick(flora);
  // the nearest flowering plant to that home is the target itself (distance 0)
  expect(ent.home).not.toBeNull();
  expect(ent.home!.x).toBe(target!.x);
  expect(ent.home!.y).toBe(target!.y);
  expect(ent.home!.species).toBe(target!.species);
});

test("swarms adapt: feeding + evolving lifts resemblance toward the host flower", () => {
  const { flora, layer } = build();
  const ent = layer.swarms.find((e) => e.home)!;
  const flower = layer.flowers.get(ent.home!.species)!;
  const before = ent.sw.pool.slice(); // snapshot the gene pool
  for (let t = 0; t < 60; t++) layer.tick(flora);
  const view = layer.inspect(ent, generatePlantSpecies(SEED));
  expect(view).not.toBeNull();
  // resemblance is a real 0..1 fraction, and the pool has genuinely changed
  expect(view!.resemblance).toBeGreaterThanOrEqual(0);
  expect(view!.resemblance).toBeLessThanOrEqual(1);
  expect(ent.sw.pool.some((g, i) => before[i] !== g)).toBe(true);
  // the host name resolves to the flowering species it works
  expect(view!.hostName.length).toBeGreaterThan(0);
  expect(flower.map.length).toBe(view!.sensor.length);
});

// Bloom-poor island (finding 4): when NO flowering plant is currently in bloom
// but the island still holds flowering-capable plants (a few succulents not yet
// blossoming, say), the sky must not be empty — a couple of swarms seed on those
// flowering plants island-wide. Only a truly flowerless island stays bare.
test("a bloom-poor island still gets a little life — swarms fall back to not-yet-blooming flowering plants", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const flowers = buildFlowerMaps(SEED, species);
  // a flowering species that actually has plants scattered on this island
  const scatter = new Flora(map, species, SEED);
  const flSpecies = [...flowers.keys()].find((id) => scatter.all.some((p) => p.species === id))!;
  const samples = scatter.all.filter((p) => p.species === flSpecies).slice(0, 10);
  expect(samples.length).toBeGreaterThan(0);
  // rebuild a flora holding ONLY those plants, each re-formed as a NOT-blooming
  // succulent (low petals + glow → isBloom false), so bloomCandidates is empty
  // while the flowering species is still present
  const restored = {
    tick: 0,
    plants: samples.map((p) => ({
      species: p.species,
      genome: { ...p.genome, form: PlantForm.Succulent, petals: 3, glow: 0.1 },
      x: p.x,
      y: p.y,
      born: 0,
    })),
  };
  const flora = new Flora(map, species, SEED, {}, restored);
  expect(flora.all.length).toBeGreaterThan(0);
  expect(flora.all.every((p) => !isBloom(p))).toBe(true); // nothing is in bloom

  const layer = new SwarmLayer(SEED, species, flora, { x: samples[0].x, y: samples[0].y });
  // the sky isn't empty: a couple of swarms seeded on the flowering plants
  expect(layer.swarms.length).toBeGreaterThan(0);
  expect(layer.swarms.length).toBeLessThanOrEqual(SPARSE_SWARMS);
  for (const ent of layer.swarms) {
    expect(ent.home).not.toBeNull();
    expect(flowers.has(ent.home!.species)).toBe(true);
  }
  // and ticking is safe (no bloom in reach → keeps its bond, never crashes)
  layer.tick(flora);
  for (const ent of layer.swarms) expect(ent.home).not.toBeNull();
});

// The other edge: an island with truly zero flowering plants carries no swarms
// (an empty sky is correct there) — the fallback never invents life from nothing.
test("an island with no flowering plants at all carries no swarms", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  const nonFlowering = species.find((s) => !canFlower(s.archetype.form))!;
  const scatter = new Flora(map, species, SEED);
  const samples = scatter.all.filter((p) => p.species === nonFlowering.id).slice(0, 8);
  expect(samples.length).toBeGreaterThan(0);
  const restored = {
    tick: 0,
    plants: samples.map((p) => ({ species: p.species, genome: p.genome, x: p.x, y: p.y, born: 0 })),
  };
  const flora = new Flora(map, species, SEED, {}, restored);
  const layer = new SwarmLayer(SEED, species, flora, { x: samples[0].x, y: samples[0].y });
  expect(layer.swarms.length).toBe(0);
});

// Daughter species born during play (finding 5): buildFlowerMaps runs once at
// load, so a flowering kind that speciates later has no map yet. flowerFor builds
// (and caches) one the first time the daughter is met, so evolved daughters can
// host swarms too — deterministic (seeded off the species id, not when it's built).
test("a flowering daughter species that speciates during play gets a lazy flower map and can host swarms", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED); // the SHARED list, as flora mutates on speciation
  const flora = new Flora(map, species, SEED);
  const layer = new SwarmLayer(SEED, species, flora);

  const daughterId = species.length;
  expect(layer.flowers.has(daughterId)).toBe(false); // no map at load — it doesn't exist yet

  // a flowering daughter arises: appended to the shared list exactly as flora's
  // speciateFrom does (same id = list length, form inherited from a flowering parent)
  const parent = species.find((s) => canFlower(s.archetype.form))!;
  species.push({ ...parent, id: daughterId, name: parent.name + " ✧", parent: parent.id });

  // met for the first time → its map is built lazily, cached, and correctly sized
  const flower = layer.flowerFor(daughterId);
  expect(flower).not.toBeNull();
  expect(layer.flowers.has(daughterId)).toBe(true);
  expect(flower!.accent.reduce((n, v) => n + v, 0)).toBe(flowerSizeFor(species[daughterId]));

  // deterministic: an independent layer builds a byte-identical map for that id
  const twin = new SwarmLayer(SEED, species, new Flora(map, species, SEED)).flowerFor(daughterId)!;
  expect([...twin.map]).toEqual([...flower!.map]);
  expect([...twin.accent]).toEqual([...flower!.accent]);
});

test("the swarm layer is deterministic from the seed", () => {
  const a = build();
  const b = build();
  expect(b.layer.swarms.length).toBe(a.layer.swarms.length);
  for (let i = 0; i < a.layer.swarms.length; i++) {
    expect(b.layer.swarms[i].x).toBe(a.layer.swarms[i].x);
    expect(b.layer.swarms[i].y).toBe(a.layer.swarms[i].y);
    expect(b.layer.swarms[i].sw.population).toBe(a.layer.swarms[i].sw.population);
    expect([...b.layer.swarms[i].sw.sensor]).toEqual([...a.layer.swarms[i].sw.sensor]);
  }
});

test("the swarm layer's construction never perturbs the flora it scatters over (seed-safe)", () => {
  const map = generate(SEED);
  const species = generatePlantSpecies(SEED);
  // a control flora, untouched by any swarm layer
  const control = new Flora(map, species, SEED);
  const controlSnapshot = control.all.map((p) => `${p.species}:${p.x}:${p.y}`).join("|");

  // a second flora that carries a swarm layer, built + animated
  const map2 = generate(SEED);
  const species2 = generatePlantSpecies(SEED);
  const flora = new Flora(map2, species2, SEED);
  const before = flora.all.map((p) => `${p.species}:${p.x}:${p.y}`).join("|");
  const layer = new SwarmLayer(SEED, species2, flora);
  layer.animate(0.5);

  // building the layer + animating reads flora but never writes it — the layer
  // lives off its own salted Rng, so worldgen/flora scatter byte-identically
  // with or without it (the pollination write only ever happens on tick, below)
  expect(flora.all.map((p) => `${p.species}:${p.x}:${p.y}`).join("|")).toBe(before);
  expect(before).toBe(controlSnapshot);
});

// Predation is now actually wired into the world tick: a gentle ambient
// insectivory pressure that thins the CONSPICUOUS and spares the camouflaged.
// This pins that it is applied (a pressured world runs thinner) and that it is
// non-wiping (never erases a swarm) and bounded (population stays in [0, cap]).
test("predation is applied through the world tick — a pressured island is thinner, never wiped", () => {
  const make = () => {
    const map = generate(SEED);
    const sp = generatePlantSpecies(SEED);
    const flora = new Flora(map, sp, SEED);
    return { flora, layer: new SwarmLayer(SEED, sp, flora) };
  };
  const hunted = make(); // full ambient pressure
  hunted.layer.predation = 1;
  const spared = make(); // identical island, predators off
  spared.layer.predation = 0;
  const sumPop = (l: SwarmLayer): number => l.swarms.reduce((n, e) => n + e.sw.population, 0);

  for (let t = 0; t < 40; t++) {
    hunted.flora.simTick();
    hunted.layer.tick(hunted.flora);
    spared.flora.simTick();
    spared.layer.tick(spared.flora);
  }

  // the pressure genuinely bit (predation is invoked), yet never wiped a cloud
  expect(sumPop(hunted.layer)).toBeLessThan(sumPop(spared.layer));
  expect(sumPop(hunted.layer)).toBeGreaterThan(0);
  for (const e of hunted.layer.swarms) {
    expect(e.sw.population).toBeGreaterThanOrEqual(0);
    expect(e.sw.population).toBeLessThanOrEqual(e.sw.cap);
  }
});

// Divergence → cousins is now invoked from the world tick, and directly
// exercisable via budCousin. A genuinely bimodal pool (half its home flower,
// half a different nearby flowering species) buds a cousin homed on the second
// species; a unimodal pool forces no split; and it stays under the count cap.
test("divergence buds a cousin from a bimodal pool — invoked, homed on the second species, bounded", () => {
  const { flora, layer } = build();
  // find a swarm whose home has a SECOND flowering species within reach, picking
  // the NEAREST such (exactly as budCousin does) so the bimodal split is against
  // the very species budCousin will home the cousin on
  let ent = null as (typeof layer.swarms)[number] | null;
  let other = null as ReturnType<typeof flora.plantsNear>[number] | null;
  for (const e of layer.swarms) {
    const near = flora
      .plantsNear(e.home!.x, e.home!.y, 10 * 16)
      .filter((p) => isBloom(p) && layer.flowers.has(p.species) && p.species !== e.home!.species)
      .sort(
        (a, b) =>
          (a.x - e.home!.x) ** 2 + (a.y - e.home!.y) ** 2 - ((b.x - e.home!.x) ** 2 + (b.y - e.home!.y) ** 2),
      );
    if (near.length) {
      ent = e;
      other = near[0];
      break;
    }
  }
  expect(ent).not.toBeNull();
  expect(other).not.toBeNull();
  const flowerHome = layer.flowers.get(ent!.home!.species)!;
  const flowerOther = layer.flowers.get(other!.species)!;
  // force a genuinely bimodal pool: half perfectly matching home, half the other
  ent!.sw.pool = ent!.sw.pool.map((_, i) => (i % 2 === 0 ? flowerHome.map.slice() : flowerOther.map.slice()));

  const before = layer.swarms.length;
  const cousin = layer.budCousin(ent!, flora);
  expect(cousin).not.toBeNull();
  expect(layer.swarms.length).toBe(before + 1);
  expect(layer.swarms.length).toBeLessThanOrEqual(SWARM_COUNT_CAP);
  expect(cousin!.home!.species).toBe(other!.species); // the cousin works the SECOND species
  expect(cousin!.sw.population).toBeGreaterThan(0);
  expect(cousin!.sw.population).toBeLessThanOrEqual(cousin!.sw.cap); // bounded, no runaway

  // a unimodal pool (all home) forces no split — divergence stays rare
  ent!.sw.pool = ent!.sw.pool.map(() => flowerHome.map.slice());
  expect(layer.budCousin(ent!, flora)).toBeNull();
});

test("pollination only ever ADDS flowering plants — bounded, additive, never harms flora", () => {
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(generate(SEED), species, SEED);
  const layer = new SwarmLayer(SEED, species, flora);
  // pin every swarm to a perfect match + a full cloud so pollination fires hard
  for (const ent of layer.swarms) {
    const flower = layer.flowers.get(ent.home!.species)!;
    ent.sw.pool = ent.sw.pool.map(() => flower.map.slice());
    ent.sw.sensor = flower.map.slice();
    ent.sw.population = ent.sw.cap;
  }
  const originals = new Set(flora.all);
  const hosted = new Set(layer.flowers.keys()); // the flowering (pollinatable) species
  const nonHostBefore = new Map<number, number>();
  for (const [sp, n] of flora.speciesCounts) if (!hosted.has(sp)) nonHostBefore.set(sp, n);
  const before = flora.count;

  for (let t = 0; t < 200; t++) layer.tick(flora);

  // never removes: every original plant still stands, unharmed
  for (const p of originals) expect(flora.all.includes(p)).toBe(true);
  // it grew — the reciprocal boom put more flowers on the island...
  expect(flora.count).toBeGreaterThan(before);
  // ...and ONLY through the hosted (flowering) species: a non-flowering kind,
  // which no swarm works, is left exactly as it was — pollination is targeted
  for (const [sp, n] of flora.speciesCounts) {
    if (!hosted.has(sp)) expect(n).toBe(nonHostBefore.get(sp) ?? 0);
  }
  // finite space is still the whole ceiling — no tile over the per-tile cap
  for (const [, bucket] of flora.byTile) {
    expect(bucket.length).toBeLessThanOrEqual(flora.tuning.maxPerTile);
  }
});

// ── events: the layer's best moments now have a witness path ──────────────────
// A bloom visibly thickening under a well-matched cloud (a boom) and a cousin
// budding off both emit a small event the game loop drains and surfaces. Pure
// bookkeeping: rare (once per swarm; divergence on its slow cadence), drained
// destructively, and never a draw on the seeded stream.

test("a well-matched cloud's boom is emitted once per swarm, named, and drained by takeEvents", () => {
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(generate(SEED), species, SEED);
  const layer = new SwarmLayer(SEED, species, flora);
  // pin every swarm to a perfect match + a full cloud so pollination fires hard
  for (const ent of layer.swarms) {
    const flower = layer.flowers.get(ent.home!.species)!;
    ent.sw.pool = ent.sw.pool.map(() => flower.map.slice());
    ent.sw.sensor = flower.map.slice();
    ent.sw.population = ent.sw.cap;
  }
  expect(layer.takeEvents()).toEqual([]); // nothing notable has happened yet
  const events: ReturnType<typeof layer.takeEvents> = [];
  for (let t = 0; t < 200; t++) {
    layer.tick(flora);
    events.push(...layer.takeEvents()); // drain as the game loop does
  }
  const booms = events.filter((e) => e.kind === "boom");
  expect(booms.length).toBeGreaterThan(0); // the boom found its witness
  // once per swarm, never a spam: no cloud booms twice
  const names = booms.map((b) => b.name);
  expect(new Set(names).size).toBe(names.length);
  for (const b of booms) {
    expect(layer.swarms.some((s) => s.name === b.name)).toBe(true); // a real cloud's codex name
    expect(species[b.hostSpecies]).toBeDefined(); // a real flowering kind thickened
  }
  expect(layer.takeEvents()).toEqual([]); // drained means drained
});

test("a budded cousin is emitted as an event, named with its ✧ and homed on the second species", () => {
  const { flora, layer } = build();
  // the same bimodal forcing the divergence test uses, against the nearest other bloom
  let ent = null as (typeof layer.swarms)[number] | null;
  let other = null as ReturnType<typeof flora.plantsNear>[number] | null;
  for (const e of layer.swarms) {
    const near = flora
      .plantsNear(e.home!.x, e.home!.y, 10 * 16)
      .filter((p) => isBloom(p) && layer.flowers.has(p.species) && p.species !== e.home!.species)
      .sort(
        (a, b) =>
          (a.x - e.home!.x) ** 2 + (a.y - e.home!.y) ** 2 - ((b.x - e.home!.x) ** 2 + (b.y - e.home!.y) ** 2),
      );
    if (near.length) {
      ent = e;
      other = near[0];
      break;
    }
  }
  expect(ent).not.toBeNull();
  const flowerHome = layer.flowers.get(ent!.home!.species)!;
  const flowerOther = layer.flowers.get(other!.species)!;
  ent!.sw.pool = ent!.sw.pool.map((_, i) => (i % 2 === 0 ? flowerHome.map.slice() : flowerOther.map.slice()));
  layer.takeEvents(); // start clean
  const cousin = layer.budCousin(ent!, flora);
  expect(cousin).not.toBeNull();
  const events = layer.takeEvents();
  expect(events.length).toBe(1);
  expect(events[0].kind).toBe("cousin");
  expect(events[0].name).toBe(cousin!.name); // the island-born mark rides along
  expect(events[0].name).toContain("✧");
  expect(events[0].hostSpecies).toBe(other!.species); // toward the second flower, truthfully
  // and the moment carries its place — the second bloom itself, for the witness gate
  expect(events[0].x).toBe(cousin!.home!.x);
  expect(events[0].y).toBe(cousin!.home!.y);
});

// ── witnessing: the pure gate the game loop asks before it speaks ──────────────
// A boom/cousin flash used to fire from anywhere ("X thickens…" with the swarm
// three bays away, nothing to see). eventInView is the camera-side predicate:
// on or a breath beyond the screen counts as a witness; the rest leave traces.

test("eventInView: on-screen and margin moments are witnessed, far ones are not", () => {
  const cam = { x: 1000, y: 800, w: 480, h: 320 };
  // squarely on screen
  expect(eventInView({ x: 1200, y: 900 }, cam.x, cam.y, cam.w, cam.h)).toBe(true);
  // just past the edge but inside the default 2-tile margin — still a witness
  expect(eventInView({ x: cam.x - 16, y: 900 }, cam.x, cam.y, cam.w, cam.h)).toBe(true);
  expect(eventInView({ x: cam.x + cam.w + 30, y: 900 }, cam.x, cam.y, cam.w, cam.h)).toBe(true);
  // beyond the margin on any axis — unseen, no matter the other axis
  expect(eventInView({ x: cam.x - 40, y: 900 }, cam.x, cam.y, cam.w, cam.h)).toBe(false);
  expect(eventInView({ x: 1200, y: cam.y + cam.h + 40 }, cam.x, cam.y, cam.w, cam.h)).toBe(false);
  // a custom margin widens or narrows the witness box
  expect(eventInView({ x: cam.x - 40, y: 900 }, cam.x, cam.y, cam.w, cam.h, 48)).toBe(true);
  expect(eventInView({ x: cam.x - 8, y: 900 }, cam.x, cam.y, cam.w, cam.h, 0)).toBe(false);
});

test("a boom event carries the place it happened — the host bloom's own coordinates", () => {
  const species = generatePlantSpecies(SEED);
  const flora = new Flora(generate(SEED), species, SEED);
  const layer = new SwarmLayer(SEED, species, flora);
  for (const ent of layer.swarms) {
    const flower = layer.flowers.get(ent.home!.species)!;
    ent.sw.pool = ent.sw.pool.map(() => flower.map.slice());
    ent.sw.sensor = flower.map.slice();
    ent.sw.population = ent.sw.cap;
  }
  const events: ReturnType<typeof layer.takeEvents> = [];
  for (let t = 0; t < 200; t++) {
    layer.tick(flora);
    events.push(...layer.takeEvents());
  }
  const booms = events.filter((e) => e.kind === "boom");
  expect(booms.length).toBeGreaterThan(0);
  for (const b of booms) {
    // the moment's place is a real plant of the very kind that thickened
    expect(flora.all.some((p) => p.species === b.hostSpecies && p.x === b.x && p.y === b.y)).toBe(true);
  }
});

// ── the pollination web data: single clouds carry their codex names ────────────
// buildPollen is the shared data both the living web (C) and the ledger (G)
// read. A bloom worked by exactly ONE cloud must wear that cloud's name (the
// cross-reference between the diagram and the sky); a group row stays unnamed
// but still carries the leading cloud's drawable insect genome.

test("buildPollen names a single-cloud edge and leaves group rows unnamed — insect carried either way", () => {
  const { flora, layer, species } = build();
  const counts = (id: number): number => flora.speciesCounts.get(id) ?? 0;
  const view = buildPollen(layer, species, counts);

  expect(view.cloudsTotal).toBe(layer.swarms.length);
  expect(view.links.length).toBeGreaterThan(0);
  // the true grouping, recomputed independently of the builder
  const bySpecies = new Map<number, typeof layer.swarms>();
  for (const ent of layer.swarms) {
    if (!ent.home || !layer.inspect(ent, species)) continue;
    const list = bySpecies.get(ent.home.species) ?? [];
    list.push(ent);
    bySpecies.set(ent.home.species, list as typeof layer.swarms);
  }
  for (const link of view.links) {
    const clouds = bySpecies.get(link.host.id)!;
    expect(link.swarmCount).toBe(clouds.length);
    if (clouds.length === 1) {
      // one cloud, one codex name — the web says who works this bloom
      expect(link.name).toBe(clouds[0].name);
    } else {
      expect(link.name).toBeNull();
    }
    // every edge can draw the very insect the sky flies: the leading cloud's genome
    const rep = clouds.reduce((a, b) => (b.sw.population > a.sw.population ? b : a));
    expect(link.insect.sensor).toBe(rep.sw.sensor);
    expect(link.insect.behavior).toBe(rep.sw.behavior);
    expect(link.hostCount).toBe(counts(link.host.id));
  }
  // matched edges lead, as the panel promises
  const flags = view.links.map((l) => Number(l.matched));
  expect([...flags].sort((a, b) => b - a)).toEqual(flags);
});

// ── the courted cloud: a planted bloom drawing a swarm, detected purely ────────

test("courtingSwarm finds the first cloud working a bloom the player sowed — and only then", () => {
  const { layer } = build();
  const ent = layer.swarms.find((e) => e.home)!;
  const key = sowKey(ent.home!.species, ent.home!.x, ent.home!.y);
  // nothing planted → no courtship, however many clouds fly
  expect(courtingSwarm(layer.swarms, new Set())).toBeNull();
  // a planting elsewhere (no cloud homes on it) → still silent
  expect(courtingSwarm(layer.swarms, new Set([sowKey(0, -999, -999)]))).toBeNull();
  // the bloom a cloud already works is one the player sowed → that cloud is found
  const suitor = courtingSwarm(layer.swarms, new Set([key]));
  expect(suitor).not.toBeNull();
  expect(sowKey(suitor!.home!.species, suitor!.home!.x, suitor!.home!.y)).toBe(key);
});
