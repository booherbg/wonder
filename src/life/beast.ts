import { Rng, hash2d, makeRng } from "../core/rng";
import { TILE_SIZE } from "../world/config";
import { WALKABLE, WorldMap, isWalkable } from "../world/types";
import { Palate, appetite, APPETITE_MIN } from "./fauna";
import { Flora } from "./flora";
import { Genome, PlantForm, mutate } from "./genome";
import { PlantSpecies, SYLLABLES } from "./species";

// One seed riding along in the beast's coat, and how far it has come.
interface Cargo {
  species: number;
  genome: Genome; // a copy of the seed as it was picked up
  since: number; // the odometer reading (px) when it caught — the carry clock
}

// What the beast set down this step, if anything — a far-carried seed sown at
// the beast's own feet. The frame loop uses it to note "carried by <name>".
export interface BeastDrop {
  species: number;
  genome: Genome;
  x: number;
  y: number;
}

// Most islands are crossed, now and then, by one long quiet creature.
// It has no den and no interest in your seeds, but it does have a quiet
// taste — the largest disperser of all, it carries burrs of what it favors
// clear across the island and sets them down far from where they grew. It is
// going somewhere, slowly, and has been for a long time.
export interface Beast {
  name: string;
  hue: number;
  segments: number; // body length
  size: number; // head radius in px
  glows: boolean; // some shine faintly at night
  palate: Palate; // its one quiet preference — taste over traits, like a critter's
  cargo: Cargo[]; // a few favored seeds it carries; bounded — a courier, not a granary
  distance: number; // px travelled: the odometer the carry clock reads
  x: number; // head position, world px
  y: number;
  targetX: number;
  targetY: number;
  history: { x: number; y: number }[]; // recent head positions; body follows
  trail: { x: number; y: number; age: number }[]; // pressed grass, fading for a minute
  ageSec: number; // the beast's own clock
  pauseTime: number; // seconds it stands regarding you
  stuckTime: number;
  seen: boolean; // has the wanderer ever come close?
}

export const BEAST_SPEED = 26; // px/s — it is never in a hurry
const HISTORY_SPACING = 2; // px between recorded points
const SEGMENT_STEP = 4; // history points between body segments
const PAUSE_RADIUS = 1.6 * TILE_SIZE;
const TRAIL_SPACING = 10; // px between pressed-grass marks
export const TRAIL_FADE_S = 60; // how long the trail lasts
const TRAIL_CAP = 220;

// Long-distance dispersal, tuned gentle: it carries little, picks up only now
// and then, and must walk a long way before it sets a seed down.
export const CARGO_CAP = 2; // a courier, not a granary
const PICKUP_RADIUS = 1.5 * TILE_SIZE; // a favored plant this close is brushing its coat
const PICKUP_CHANCE = 0.08; // per step a favored, uncarried plant is in reach
const CARRY_DISTANCE = 32 * TILE_SIZE; // px of travel before a seed is set down, far from home
// the beast's own tile first, then its near neighbors: the first that would
// take a seed of this kind gets it
const DROP_TILES: ReadonlyArray<readonly [number, number]> = [
  [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1],
];

const TITLES = [
  "the long quiet one",
  "the slow traveler",
  "the low walker",
  "the patient one",
  "the far-goer",
  "the old wanderer",
];

export function generateBeast(seed: number, map: WorldMap, plants: PlantSpecies[]): Beast | null {
  // hash first: the has-a-beast roll must be independent per island
  const rng = makeRng(Math.floor(hash2d(seed, 31, 0xbea57) * 0xffffffff));
  if (rng() > 0.7) return null; // some islands are not crossed by anything
  const spawn = randomWalkableTile(rng, map);
  if (!spawn) return null;
  const target = randomWalkableTile(rng, map) ?? spawn;
  const syl = () => SYLLABLES[Math.floor(rng() * SYLLABLES.length)];
  const word = syl() + syl() + (rng() < 0.5 ? syl() : "");
  const name = `${word.charAt(0).toUpperCase()}${word.slice(1)}, ${TITLES[Math.floor(rng() * TITLES.length)]}`;
  return {
    name,
    hue: rng(),
    segments: 5 + Math.floor(rng() * 4),
    size: 3 + rng() * 2,
    glows: rng() < 0.4,
    palate: beastPalate(plants, rng),
    cargo: [],
    distance: 0,
    x: (spawn.x + 0.5) * TILE_SIZE,
    y: (spawn.y + 0.5) * TILE_SIZE,
    targetX: (target.x + 0.5) * TILE_SIZE,
    targetY: (target.y + 0.5) * TILE_SIZE,
    history: [],
    trail: [],
    ageSec: 0,
    pauseTime: 0,
    stuckTime: 0,
    seen: false,
  };
}

// The beast's one quiet preference: a taste cut from a plant it can actually
// walk to — so the kind it favors is also a kind it can set down. The recipe
// is a critter's, because the beast is just a very large disperser.
function beastPalate(plants: PlantSpecies[], rng: Rng): Palate {
  const rooted = plants.filter((p) => WALKABLE.has(p.habitat));
  const pool = rooted.length > 0 ? rooted : plants;
  const fav = pool.length > 0 ? pool[Math.floor(rng() * pool.length)] : null;
  if (!fav) return { form: PlantForm.Flower, hueCenter: 0, hueWidth: 0.0001, glowTaste: 0 };
  const arch = fav.archetype;
  return {
    form: arch.form,
    hueCenter: (arch.hue + (rng() - 0.5) * 0.06 + 1) % 1,
    hueWidth: 0.12 + rng() * 0.14,
    glowTaste: Math.max(-1, Math.min(1, arch.glow * 2 - 1 + (rng() - 0.5) * 0.5)),
  };
}

function randomWalkableTile(rng: Rng, map: WorldMap): { x: number; y: number } | null {
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = Math.floor(rng() * map.width);
    const y = Math.floor(rng() * map.height);
    if (isWalkable(map, x, y)) return { x, y };
  }
  return null;
}

export function updateBeast(
  b: Beast,
  dt: number,
  map: WorldMap,
  flora: Flora,
  player: { x: number; y: number } | null,
  rng: Rng,
): BeastDrop | null {
  b.ageSec += dt;
  while (b.trail.length > 0 && b.ageSec - b.trail[0].age > TRAIL_FADE_S) b.trail.shift();
  if (b.pauseTime > 0) {
    b.pauseTime -= dt;
    return null;
  }
  // it notices you, once in a while, and stops to regard you
  if (player && Math.hypot(player.x - b.x, player.y - b.y) < PAUSE_RADIUS && rng() < 0.01) {
    b.pauseTime = 2 + rng() * 2;
    return null;
  }

  const dx = b.targetX - b.x;
  const dy = b.targetY - b.y;
  const dist = Math.hypot(dx, dy);
  if (dist < TILE_SIZE) {
    const next = randomWalkableTile(rng, map);
    if (next) {
      b.targetX = (next.x + 0.5) * TILE_SIZE;
      b.targetY = (next.y + 0.5) * TILE_SIZE;
    }
    return null;
  }

  const step = BEAST_SPEED * dt;
  const ox = b.x;
  const oy = b.y;
  const nx = b.x + (dx / dist) * step;
  const ny = b.y + (dy / dist) * step;
  let moved = false;
  if (isWalkable(map, Math.floor(nx / TILE_SIZE), Math.floor(b.y / TILE_SIZE))) {
    b.x = nx;
    moved = true;
  }
  if (isWalkable(map, Math.floor(b.x / TILE_SIZE), Math.floor(ny / TILE_SIZE))) {
    b.y = ny;
    moved = true;
  }

  if (moved) {
    b.stuckTime = 0;
    b.distance += Math.hypot(b.x - ox, b.y - oy); // the carry clock ticks with real travel
    const last = b.history[0];
    if (!last || Math.hypot(b.x - last.x, b.y - last.y) >= HISTORY_SPACING) {
      b.history.unshift({ x: b.x, y: b.y });
      const cap = b.segments * SEGMENT_STEP + 8;
      if (b.history.length > cap) b.history.length = cap;
    }
    const lastMark = b.trail[b.trail.length - 1];
    if (!lastMark || Math.hypot(b.x - lastMark.x, b.y - lastMark.y) >= TRAIL_SPACING) {
      b.trail.push({ x: b.x, y: b.y, age: b.ageSec });
      if (b.trail.length > TRAIL_CAP) b.trail.shift();
    }
    // as it walks it gathers a burr of what it favors, and — having carried an
    // older one a long way — sets that one down, far from where it grew
    pickUpFavored(b, flora, rng);
    return dropCarried(b, flora, rng);
  }

  b.stuckTime += dt;
  if (b.stuckTime > 2.5) {
    const next = randomWalkableTile(rng, map);
    if (next) {
      b.targetX = (next.x + 0.5) * TILE_SIZE;
      b.targetY = (next.y + 0.5) * TILE_SIZE;
    }
    b.stuckTime = 0;
  }
  return null;
}

// Passing a favored plant it isn't already carrying, a gentle chance a burr
// catches into its coat. The plant is left standing, unharmed — the beast
// carries a copy of the seed, never a bite. One candidate per step, and only
// while there's room in the coat.
function pickUpFavored(b: Beast, flora: Flora, rng: Rng): void {
  if (b.cargo.length >= CARGO_CAP) return;
  for (const p of flora.plantsNear(b.x, b.y, PICKUP_RADIUS)) {
    if (appetite(b.palate, p.genome) <= APPETITE_MIN) continue;
    if (b.cargo.some((c) => c.species === p.species)) continue;
    if (rng() < PICKUP_CHANCE) {
      b.cargo.push({ species: p.species, genome: { ...p.genome }, since: b.distance });
    }
    return; // one opportunity per step, taken or not
  }
}

// Any seed carried far enough gets set down here: a drifted child sown on open,
// correct-habitat ground at the beast's own feet — near the beast, not near the
// source, which is the whole point. If nowhere here will take it, keep carrying.
function dropCarried(b: Beast, flora: Flora, rng: Rng): BeastDrop | null {
  const bx = Math.floor(b.x / TILE_SIZE);
  const by = Math.floor(b.y / TILE_SIZE);
  for (let i = 0; i < b.cargo.length; i++) {
    const c = b.cargo[i];
    if (b.distance - c.since < CARRY_DISTANCE) continue;
    for (const [ex, ey] of DROP_TILES) {
      const x = ex === 0 && ey === 0 ? b.x : (bx + ex + 0.5) * TILE_SIZE;
      const y = ex === 0 && ey === 0 ? b.y : (by + ey + 0.5) * TILE_SIZE;
      if (!flora.rootableAt(c.species, x, y)) continue;
      // a spot: drift one generation (neutral — never biased) and sow it
      const drifted = mutate(c.genome, rng, flora.tuning.mutationAmount);
      const plant = flora.addPlant(c.species, drifted, x, y, flora.tick);
      if (plant) {
        b.cargo.splice(i, 1);
        return { species: plant.species, genome: plant.genome, x: plant.x, y: plant.y };
      }
    }
    // nowhere here would take it — carry on; the next stretch of shore may
  }
  return null;
}

// Body segment positions, head first, trailing along the recorded path.
export function beastSegments(b: Beast): { x: number; y: number; r: number }[] {
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < b.segments; i++) {
    const p = i === 0 ? b : b.history[Math.min(i * SEGMENT_STEP, Math.max(0, b.history.length - 1))] ?? b;
    out.push({ x: p.x, y: p.y, r: b.size * (1 - (i / b.segments) * 0.45) });
  }
  return out;
}
