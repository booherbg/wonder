import { Rng, makeRng } from "../core/rng";
import { TILE_SIZE } from "../world/config";
import { WorldMap, isWalkable } from "../world/types";
import { Flora } from "./flora";
import { PlantForm } from "./genome";
import { PlantSpecies } from "./species";

export interface CritterSpecies {
  id: number;
  name: string;
  bodyHue: number; // pastel body color
  earLen: number; // 0..1
  tailLen: number; // 0..1
  size: number; // 0.75..1.25
  favoriteSpecies: number; // the plant species this critter forages
  den: { x: number; y: number }; // tile coords of its burrow
}

export type CritterState = "idle" | "seek" | "nibble" | "home";

export interface Critter {
  species: number;
  x: number; // world px (feet)
  y: number;
  state: CritterState;
  targetX: number;
  targetY: number;
  stateTime: number; // seconds until the next decision
  hopPhase: number;
  facing: 1 | -1;
}

export const CRITTER_SPEED = 40; // px/s — unhurried
const SEEK_RADIUS_PX = 8 * TILE_SIZE;
const HOME_RANGE_TILES = 6;
const CURIOSITY_RADIUS_PX = 3 * TILE_SIZE;

const CRITTER_SYLLABLES = ["po", "mo", "ni", "bul", "tam", "wis", "ket", "ru", "fi", "dov", "san", "lop"];
const CRITTER_EPITHETS = ["hopper", "puff", "whisk", "nibbler", "scamper", "tumble", "peep", "muncher"];

function critterName(rng: Rng): string {
  const syl = () => CRITTER_SYLLABLES[Math.floor(rng() * CRITTER_SYLLABLES.length)];
  const word = syl() + syl();
  const epithet = CRITTER_EPITHETS[Math.floor(rng() * CRITTER_EPITHETS.length)];
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} ${epithet.charAt(0).toUpperCase()}${epithet.slice(1)}`;
}

// Three species per island, each devoted to one (preferably nibblable,
// non-tree) plant species, denned where those plants actually grow.
export function generateCritterSpecies(
  seed: number,
  map: WorldMap,
  flora: Flora,
  plants: PlantSpecies[],
): CritterSpecies[] {
  const rng = makeRng(seed ^ 0xc417);
  const nibblable = plants.filter(
    (p) => p.archetype.form !== PlantForm.Tree && p.archetype.form !== PlantForm.Coral,
  );
  const pool = (nibblable.length >= 3 ? nibblable : plants).map((p) => p.id);
  const favorites: number[] = [];
  while (favorites.length < 3 && favorites.length < pool.length) {
    const pick = pool[Math.floor(rng() * pool.length)];
    if (!favorites.includes(pick)) favorites.push(pick);
  }
  return favorites.map((favoriteSpecies, id) => ({
    id,
    name: critterName(rng),
    bodyHue: rng(),
    earLen: rng(),
    tailLen: rng(),
    size: 0.75 + rng() * 0.5,
    favoriteSpecies,
    den: findDen(rng, map, flora, favoriteSpecies),
  }));
}

// A walkable tile near where the favorite plants actually grow.
function findDen(
  rng: Rng,
  map: WorldMap,
  flora: Flora,
  favorite: number,
): { x: number; y: number } {
  const homes = flora.all.filter((p) => p.species === favorite);
  for (let attempt = 0; attempt < 60 && homes.length > 0; attempt++) {
    const p = homes[Math.floor(rng() * homes.length)];
    const tx = Math.floor(p.x / TILE_SIZE) + Math.floor(rng() * 5) - 2;
    const ty = Math.floor(p.y / TILE_SIZE) + Math.floor(rng() * 5) - 2;
    if (isWalkable(map, tx, ty)) return { x: tx, y: ty };
  }
  return { ...map.spawn };
}

export function spawnCritters(
  speciesList: CritterSpecies[],
  map: WorldMap,
  seed: number,
): Critter[] {
  const rng = makeRng(seed ^ 0xfa0a);
  const out: Critter[] = [];
  for (const sp of speciesList) {
    const n = 4 + Math.floor(rng() * 3);
    let placed = 0;
    for (let attempt = 0; attempt < n * 8 && placed < n; attempt++) {
      const tx = sp.den.x + Math.floor(rng() * 7) - 3;
      const ty = sp.den.y + Math.floor(rng() * 7) - 3;
      if (!isWalkable(map, tx, ty)) continue;
      out.push({
        species: sp.id,
        x: (tx + 0.5) * TILE_SIZE,
        y: (ty + 0.5) * TILE_SIZE,
        state: "idle",
        targetX: (tx + 0.5) * TILE_SIZE,
        targetY: (ty + 0.5) * TILE_SIZE,
        stateTime: rng() * 2,
        hopPhase: rng() * 6.28,
        facing: rng() < 0.5 ? 1 : -1,
      });
      placed++;
    }
  }
  return out;
}

function moveToward(c: Critter, dt: number, map: WorldMap): boolean {
  const dx = c.targetX - c.x;
  const dy = c.targetY - c.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return true;
  const step = Math.min(dist, CRITTER_SPEED * dt);
  const nx = c.x + (dx / dist) * step;
  const ny = c.y + (dy / dist) * step;
  if (Math.abs(dx) > 0.5) c.facing = dx > 0 ? 1 : -1;
  if (isWalkable(map, Math.floor(nx / TILE_SIZE), Math.floor(c.y / TILE_SIZE))) c.x = nx;
  if (isWalkable(map, Math.floor(c.x / TILE_SIZE), Math.floor(ny / TILE_SIZE))) c.y = ny;
  c.hopPhase += dt * 9;
  return Math.hypot(c.targetX - c.x, c.targetY - c.y) < 2;
}

export function updateCritter(
  c: Critter,
  dt: number,
  map: WorldMap,
  flora: Flora,
  speciesList: CritterSpecies[],
  player: { x: number; y: number } | null,
  rng: Rng,
): void {
  const sp = speciesList[c.species];
  c.stateTime -= dt;

  if (c.state === "nibble") {
    c.hopPhase += dt * 4; // gentle munching wiggle
    if (c.stateTime <= 0) {
      c.state = "idle";
      c.stateTime = 0;
    }
    return;
  }

  const arrived = moveToward(c, dt, map);

  if (c.state === "seek" && arrived) {
    c.state = "nibble";
    c.stateTime = 1.5 + rng() * 1.5;
    return;
  }
  if (c.state === "home" && arrived) {
    c.state = "idle";
    c.stateTime = 0.5 + rng();
    return;
  }

  if (c.stateTime > 0) return;

  // decision time
  const denX = (sp.den.x + 0.5) * TILE_SIZE;
  const denY = (sp.den.y + 0.5) * TILE_SIZE;
  const farFromHome = Math.hypot(c.x - denX, c.y - denY) > HOME_RANGE_TILES * TILE_SIZE;
  const roll = rng();

  if (player && roll < 0.2 && Math.hypot(player.x - c.x, player.y - c.y) < CURIOSITY_RADIUS_PX) {
    // curious: sidle partway toward the wanderer
    c.targetX = c.x + (player.x - c.x) * 0.5;
    c.targetY = c.y + (player.y - c.y) * 0.5;
    c.state = "idle";
  } else if (roll < 0.5) {
    // graze: nearest favorite plant in sniffing range
    const found = flora
      .plantsNear(c.x, c.y, SEEK_RADIUS_PX)
      .filter((p) => p.species === sp.favoriteSpecies);
    if (found.length > 0) {
      let best = found[0];
      let bd = Infinity;
      for (const p of found) {
        const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      c.targetX = best.x;
      c.targetY = best.y;
      c.state = "seek";
    } else {
      c.state = farFromHome ? "home" : "idle";
      if (c.state === "home") {
        c.targetX = denX;
        c.targetY = denY;
      }
    }
  } else if (farFromHome && roll < 0.7) {
    c.state = "home";
    c.targetX = denX;
    c.targetY = denY;
  } else {
    // wander a couple of tiles
    const tx = Math.floor(c.x / TILE_SIZE) + Math.floor(rng() * 5) - 2;
    const ty = Math.floor(c.y / TILE_SIZE) + Math.floor(rng() * 5) - 2;
    if (isWalkable(map, tx, ty)) {
      c.targetX = (tx + 0.5) * TILE_SIZE;
      c.targetY = (ty + 0.5) * TILE_SIZE;
    }
    c.state = "idle";
  }
  c.stateTime = 1.5 + rng() * 2.5;
}
