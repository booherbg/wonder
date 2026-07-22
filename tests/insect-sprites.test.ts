import { expect, test } from "vitest";
import { makeRng } from "../src/core/rng";
import { MAP_CELLS, appearanceColors } from "../src/life/idmap";
import { BehaviorGenes } from "../src/life/swarm";
import {
  FlightField,
  FORM_FAMILY,
  INSECT_FORMS,
  INSECT_PLANS,
  InsectForm,
  MARK_CELLS,
  ROTATING_FORMS,
  insectMorphOf,
  insectPalette,
  insectPose,
  insectSpriteKey,
} from "../src/render/insectSprites";
import { swarmName } from "../src/game/swarms";

// The generative insects: every swarm is drawn as an actual little bug grown
// from its genome. These pin the pure core — the morph roll, the honest
// genome→colour mapping, the cache key, and the dart-hover-perch flight —
// without needing a DOM (the canvas work is a thin skin over these).

const behavior = (range = 0.5, nerve = 0.5, cohesion = 0.5): BehaviorGenes => ({
  range,
  nerve,
  cohesion,
});

test("insectMorphOf is deterministic and always lands a real form under a real family", () => {
  const b = behavior(0.31, 0.62, 0.77);
  expect(insectMorphOf(b)).toEqual(insectMorphOf({ ...b }));
  const r = makeRng(7);
  for (let i = 0; i < 300; i++) {
    const m = insectMorphOf(behavior(r(), r(), r()));
    expect(INSECT_FORMS).toContain(m.form); // one of the seventeen silhouettes
    expect(INSECT_PLANS).toContain(m.plan); // named by one of the five families
    expect(m.plan).toBe(FORM_FAMILY[m.form]); // and the family always fits the form
  }
});

test("the seventeen-shape space is complete and honestly named", () => {
  expect(INSECT_FORMS.length).toBe(17);
  expect(new Set(INSECT_FORMS).size).toBe(17); // no dupes
  // every form maps to a real family; every family is actually used by some form
  const families = new Set<string>();
  for (const f of INSECT_FORMS) {
    expect(INSECT_PLANS).toContain(FORM_FAMILY[f]);
    families.add(FORM_FAMILY[f]);
  }
  expect([...families].sort()).toEqual([...INSECT_PLANS].sort());
  // the rotating (needle / twig) forms are a real subset of the shape space
  expect(ROTATING_FORMS.size).toBeGreaterThan(0);
  for (const f of ROTATING_FORMS) expect(INSECT_FORMS).toContain(f as InsectForm);
});

test("every form is reachable: some behaviour in the cube grows each of the seventeen", () => {
  const seen = new Set<InsectForm>();
  for (let ri = 0; ri <= 10; ri++)
    for (let ni = 0; ni <= 10; ni++)
      for (let ci = 0; ci <= 10; ci++)
        seen.add(insectMorphOf(behavior(ri / 10, ni / 10, ci / 10)).form);
  for (const f of INSECT_FORMS) expect(seen).toContain(f);
});

test("the morph space is used: many behaviours grow a wide spread of forms", () => {
  const r = makeRng(99);
  const seen = new Set<string>();
  for (let i = 0; i < 300; i++) seen.add(insectMorphOf(behavior(r(), r(), r())).form);
  expect(seen.size).toBeGreaterThanOrEqual(14); // a dozen-plus distinct kinds in the wild
});

test("behaviour tilts the dice: cohesion→compact, range→long-winged, nerve→darters, low-all→specks", () => {
  const compact = (f: string): boolean =>
    ["beetle", "ladybird", "bumblebee", "hoverer"].includes(f);
  const long = (f: string): boolean => ["moth", "cicada", "damsel", "lacewing", "mayfly"].includes(f);
  const darter = (f: string): boolean => ["skipper", "wasp", "mantis", "leafhopper"].includes(f);
  const r = makeRng(41);
  let compactTight = 0;
  let compactLoose = 0;
  let longRangy = 0;
  let longHomebody = 0;
  let boldDart = 0;
  let mildDart = 0;
  let lowSpeck = 0;
  let highSpeck = 0;
  const N = 500;
  for (let i = 0; i < N; i++) {
    const nerve = r();
    const roll = r();
    if (compact(insectMorphOf(behavior(0.3, nerve, 0.9)).form)) compactTight++;
    if (compact(insectMorphOf(behavior(0.3, nerve, 0.1)).form)) compactLoose++;
    if (long(insectMorphOf(behavior(0.9, nerve, roll * 0.5)).form)) longRangy++;
    if (long(insectMorphOf(behavior(0.1, nerve, roll * 0.5)).form)) longHomebody++;
    if (darter(insectMorphOf(behavior(roll * 0.5, 0.9, 0.3)).form)) boldDart++;
    if (darter(insectMorphOf(behavior(roll * 0.5, 0.1, 0.3)).form)) mildDart++;
    if (insectMorphOf(behavior(r() * 0.35, r() * 0.35, r() * 0.35)).form === "midge") lowSpeck++;
    if (insectMorphOf(behavior(0.5 + r() * 0.5, 0.5 + r() * 0.5, 0.5 + r() * 0.5)).form === "midge")
      highSpeck++;
  }
  expect(compactTight).toBeGreaterThan(compactLoose); // tight cohesion clusters into compact bodies
  expect(longRangy).toBeGreaterThan(longHomebody); // wide range grows long-winged roamers
  expect(boldDart).toBeGreaterThan(mildDart); // bold nerve grows darters and hunters
  expect(lowSpeck).toBeGreaterThan(highSpeck); // low-everything leans toward the dust-mote midge
});

test("insectPalette is honest: body = the map's dominant colour, marks = real cells", () => {
  const sensor = new Uint8Array(MAP_CELLS);
  for (let i = 0; i < 30; i++) sensor[i] = 3; // dominant: colour 3 (mint)
  for (let i = 30; i < 40; i++) sensor[i] = 5; // second: colour 5 (teal)
  sensor[24] = 0; // the heart cell left neutral — no mark there
  sensor[48] = 5; // the far corner coloured — a wing patch lands
  const cols = appearanceColors(sensor);
  const pal = insectPalette(sensor);
  expect(pal.body).toBe(cols[0]); // the dominant swatch, exactly as the card paints it
  // marks sample the ACTUAL cells 0 / 24 / 48 — flower hues land here pixel by pixel
  expect(MARK_CELLS).toEqual([0, 24, 48]);
  expect(pal.marks[0]).toBe(cols[0]);
  expect(pal.marks[1]).toBeNull(); // neutral cell → no wing patch
  expect(pal.marks[2]).toBe(cols[48]);
});

test("an all-neutral naive swarm still gets a body (faint mint, not a void)", () => {
  const pal = insectPalette(new Uint8Array(MAP_CELLS));
  expect(pal.body).toMatch(/^hsl\(/);
  expect(pal.marks.every((m) => m === null)).toBe(true);
});

test("the sprite cache key follows the genome: stable until the pool evolves", () => {
  const sensor = new Uint8Array(MAP_CELLS);
  for (let i = 0; i < 20; i++) sensor[i] = 2;
  const b = behavior(0.4, 0.5, 0.6);
  expect(insectSpriteKey(sensor, b)).toBe(insectSpriteKey(sensor.slice(), { ...b }));
  const evolved = sensor.slice();
  evolved[10] = 4; // one cell drifts → a rebuild
  expect(insectSpriteKey(evolved, b)).not.toBe(insectSpriteKey(sensor, b));
  expect(insectSpriteKey(sensor, behavior(0.4, 0.5, 0.61))).not.toBe(insectSpriteKey(sensor, b));
});

const field = (over: Partial<FlightField> = {}): FlightField => ({
  cx: 100,
  cy: 100,
  baseR: 16,
  range: 0.5,
  nerve: 0.5,
  salt: 7,
  ...over,
});

test("insectPose is deterministic and stays near its cloud", () => {
  const f = field();
  for (const t of [0, 1.37, 8.02, 33.3]) {
    for (let i = 0; i < 12; i++) {
      const a = insectPose(i, t, f);
      const b = insectPose(i, t, { ...f });
      expect(a).toEqual(b);
      expect(["wingA", "wingB", "perch"]).toContain(a.frame);
      // bounded flight: within the scatter radius (plus dwell-bob slack)
      const d = Math.hypot(a.x - f.cx, a.y - f.cy);
      expect(d).toBeLessThanOrEqual(f.baseR * (0.7 + 0.6 * f.range) + 2);
    }
  }
});

test("with a home bloom, some insects perch on its crown with folded wings", () => {
  const f = field({ homeX: 140, homeY: 90 });
  let perched = 0;
  for (let i = 0; i < 16; i++) {
    for (let t = 0; t < 40; t += 0.25) {
      const p = insectPose(i, t, f);
      if (p.frame === "perch") {
        perched++;
        // a perched insect sits ON the bloom, not out in the cloud
        expect(Math.abs(p.x - f.homeX!)).toBeLessThanOrEqual(4);
        expect(Math.abs(p.y - f.homeY!)).toBeLessThanOrEqual(5);
        break;
      }
    }
  }
  expect(perched).toBeGreaterThan(0);
  // no bloom in reach → nobody perches (calm mode aside)
  const homeless = field();
  for (let i = 0; i < 16; i++) {
    for (let t = 0; t < 20; t += 0.5) {
      expect(insectPose(i, t, homeless).frame).not.toBe("perch");
    }
  }
});

test("reduced motion holds a folded-wing constellation, frozen in time", () => {
  const f = field({ homeX: 140, homeY: 90, calm: true });
  for (let i = 0; i < 8; i++) {
    const a = insectPose(i, 1, f);
    const b = insectPose(i, 99, f);
    expect(a).toEqual(b); // time does not move it
    expect(a.frame).toBe("perch"); // wings held folded, no flicker
  }
});

test("swarm names are deterministic, distinct, and wear the codex register", () => {
  const b = behavior(0.2, 0.8, 0.5);
  expect(swarmName(20, 0, b)).toBe(swarmName(20, 0, { ...b }));
  const names = new Set<string>();
  for (let i = 0; i < 8; i++) names.add(swarmName(20, i, b));
  expect(names.size).toBeGreaterThanOrEqual(6); // creation order keeps kinds apart
  for (const n of names) expect(n).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/); // Word Epithet
  // a budded cousin carries the island-born mark, like the flora's daughters
  expect(swarmName(20, 3, b, true).endsWith(" ✧")).toBe(true);
});
