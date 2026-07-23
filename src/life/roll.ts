// The species lab's dice — a SEEDED batch roll of fresh plant/critter KINDS,
// plus the looks/traits nudges the roll pane iterates a pick with. Pure and
// deterministic: same (base seed, kind, cursor) ⇒ the same batch, every time;
// re-roll advances the cursor. REUSES the tested whole-roster generators
// (generatePlantSpecies / generateCritterSpecies — the spec's own
// rollPlantSpecies/rollCritterSpecies) by drawing a per-roll roster and slicing
// members out, plus mutate()/morphOf() for the iterate paths. Nothing here
// re-implements genome math, species generation, or sprite rendering; the roll
// pane draws each def's thumbnail via getPlantSprite / critterPortrait.

import { Rng } from "../core/rng";
import { CritterRole, CritterSpecies, Palate, generateCritterSpecies, morphOf } from "./fauna";
import { Flora } from "./flora";
import { mutate } from "./genome";
import { PlantSpecies, generatePlantSpecies } from "./species";
import { Tile, WorldMap } from "../world/types";

export type RollKind = "plant" | "critter";

// A rolled kind has NO real id until it is PICKED and the kernel appends it
// (id === its array index; see kernel.introduce*). -1 flags "not introduced".
export const PROVISIONAL_ID = -1;

// the size band a menagerie is dealt from (fauna's own SIZE_MIN/MAX are
// private; re-declared here only so a trait patch clamps size into the legal
// range — the values must match fauna's).
const SIZE_MIN = 0.35;
const SIZE_MAX = 1.6;

// A deterministic per-roll seed: the bench seed, the kind, and the roll cursor
// mixed to one integer, so every (base, kind, cursor) triple names its own
// reproducible roster. Re-roll = cursor + 1 → a fresh, repeatable batch.
export function rollSeedFor(base: number, kind: RollKind, cursor: number): number {
  let h = (base | 0) ^ 0x9e3779b1;
  h = Math.imul(h ^ (kind === "plant" ? 0x50a7 : 0xc717), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (cursor | 0), 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// A batch of fresh plant KINDS. Reuses generatePlantSpecies (a whole ~24-kind
// roster) off the roll seed and slices the first `count` members, optionally
// filtered to habitats the construct can actually host. Each member is a deep
// copy with a provisional id — a candidate, not yet a real species. Draws
// successive rosters (cursor+1, +2, …) only if a heavy habitat filter starves
// one roster of matches.
export function rollPlantBatch(
  base: number,
  cursor: number,
  count: number,
  opts: { habitats?: ReadonlySet<Tile> } = {},
): PlantSpecies[] {
  const out: PlantSpecies[] = [];
  for (let c = cursor; out.length < count && c < cursor + 8; c++) {
    let roster = generatePlantSpecies(rollSeedFor(base, "plant", c));
    if (opts.habitats) roster = roster.filter((s) => opts.habitats!.has(s.habitat));
    for (const sp of roster) {
      if (out.length >= count) break;
      out.push({ ...sp, id: PROVISIONAL_ID, archetype: { ...sp.archetype } });
    }
  }
  return out;
}

// A batch of fresh critter KINDS. Reuses generateCritterSpecies (5–8 per
// roster) off the roll seed, drawing extra rosters until `count` is reached.
// generateCritterSpecies needs a Flora to read dens from — an EMPTY scratch
// Flora is enough (dens fall back to map.spawn with no plants; we then blank
// the den, matching worldlab's own off-map convention so a candidate never
// dens on spawn). favoriteSpecies indexes `plants`, so the palate is already
// cut from a real plant the bench can place.
export function rollCritterBatch(
  base: number,
  cursor: number,
  count: number,
  plants: PlantSpecies[],
  map: WorldMap,
): CritterSpecies[] {
  const out: CritterSpecies[] = [];
  for (let c = cursor; out.length < count && c < cursor + 8; c++) {
    const seed = rollSeedFor(base, "critter", c);
    const scratch = new Flora(map, plants, seed, {}, { tick: 0, plants: [] });
    for (const sp of generateCritterSpecies(seed, map, scratch, plants)) {
      if (out.length >= count) break;
      out.push({ ...sp, id: PROVISIONAL_ID, den: { x: -1, y: -1 }, palate: { ...sp.palate }, morph: { ...sp.morph } });
    }
  }
  return out;
}

// ── iterate: LOOKS (re-render the thumbnail) ────────────────────────────────

// A plant's looks nudge: drift the genome (mutate keeps `form` — structural —
// and jitters hue/height/petals/… ). Identity fields (name, habitat, id,
// substrateFeeder) carry through, so the same kind simply wears a new coat.
export function nudgePlantLooks(sp: PlantSpecies, rng: Rng, amount = 0.12): PlantSpecies {
  return { ...sp, archetype: mutate(sp.archetype, rng, amount) };
}

// A critter's looks nudge: re-roll the four body numbers (bodyHue wraps the
// wheel; earLen/tailLen clamp 0..1), then re-derive the whole morph via morphOf
// — body plan, crown, tail, eyes, coat all reshuffle from the numbers, which is
// exactly the visible re-roll. Size is a TRAIT (setCritterTraits), so a looks
// nudge holds it fixed and keeps the silhouette's scale.
export function nudgeCritterLooks(sp: CritterSpecies, rng: Rng, amount = 0.15): CritterSpecies {
  const wrap = (v: number) => ((v % 1) + 1) % 1;
  const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const bodyHue = wrap(sp.bodyHue + (rng() * 2 - 1) * amount);
  const earLen = clamp01(sp.earLen + (rng() * 2 - 1) * amount);
  const tailLen = clamp01(sp.tailLen + (rng() * 2 - 1) * amount);
  const size = sp.size;
  return { ...sp, bodyHue, earLen, tailLen, morph: morphOf({ bodyHue, earLen, tailLen, size }), palate: { ...sp.palate } };
}

// ── iterate: TRAITS (change behaviour/where it lives) ───────────────────────

// A plant's traits: where it lives and whether it reseeds off byproduct chains.
export function setPlantTraits(sp: PlantSpecies, patch: { habitat?: Tile; substrateFeeder?: boolean }): PlantSpecies {
  return {
    ...sp,
    habitat: patch.habitat ?? sp.habitat,
    substrateFeeder: patch.substrateFeeder ?? sp.substrateFeeder,
    archetype: { ...sp.archetype },
  };
}

// A critter's traits: palate (what it favours), role (disperser/grazer), size.
// A size change re-derives the morph (morphOf hashes size), so the body scales
// with it — the one trait that also shifts the look, noted for the roll pane.
export function setCritterTraits(
  sp: CritterSpecies,
  patch: { role?: CritterRole; size?: number; palate?: Partial<Palate> },
): CritterSpecies {
  const size = patch.size !== undefined ? Math.max(SIZE_MIN, Math.min(SIZE_MAX, patch.size)) : sp.size;
  const palate = patch.palate ? { ...sp.palate, ...patch.palate } : { ...sp.palate };
  const morph =
    size !== sp.size ? morphOf({ bodyHue: sp.bodyHue, earLen: sp.earLen, tailLen: sp.tailLen, size }) : sp.morph;
  return { ...sp, size, role: patch.role ?? sp.role, palate, morph };
}
