import { Rng, hash2d, makeRng } from "../core/rng";
import { TILE_SIZE } from "../world/config";
import { WorldMap, isWalkable } from "../world/types";
import { SYLLABLES } from "./species";

// Most islands are crossed, now and then, by one long quiet creature.
// It has no den, no favorite plant, no interest in your seeds. It is
// going somewhere, slowly, and has been for a long time.
export interface Beast {
  name: string;
  hue: number;
  segments: number; // body length
  size: number; // head radius in px
  glows: boolean; // some shine faintly at night
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

const TITLES = [
  "the long quiet one",
  "the slow traveler",
  "the low walker",
  "the patient one",
  "the far-goer",
  "the old wanderer",
];

export function generateBeast(seed: number, map: WorldMap): Beast | null {
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
  player: { x: number; y: number } | null,
  rng: Rng,
): void {
  b.ageSec += dt;
  while (b.trail.length > 0 && b.ageSec - b.trail[0].age > TRAIL_FADE_S) b.trail.shift();
  if (b.pauseTime > 0) {
    b.pauseTime -= dt;
    return;
  }
  // it notices you, once in a while, and stops to regard you
  if (player && Math.hypot(player.x - b.x, player.y - b.y) < PAUSE_RADIUS && rng() < 0.01) {
    b.pauseTime = 2 + rng() * 2;
    return;
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
    return;
  }

  const step = BEAST_SPEED * dt;
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
  } else {
    b.stuckTime += dt;
    if (b.stuckTime > 2.5) {
      const next = randomWalkableTile(rng, map);
      if (next) {
        b.targetX = (next.x + 0.5) * TILE_SIZE;
        b.targetY = (next.y + 0.5) * TILE_SIZE;
      }
      b.stuckTime = 0;
    }
  }
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
