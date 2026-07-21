import { Rng, makeRng } from "../core/rng";
import { TILE_SIZE } from "../world/config";
import { Tile, WALKABLE, WorldMap, isWalkable, tileAt } from "../world/types";
import { Flora, Plant } from "./flora";
import { Genome, PlantForm } from "./genome";
import { PlantSpecies } from "./species";

// What a critter's mouth knows: not a species name but a taste — a form it
// can eat, a color it seeks, a feeling about glow. Anything that matches
// draws it: sown plants, drifted individuals, daughter species. Anything
// that drifts out of the taste quietly stops being food.
export interface Palate {
  form: PlantForm; // the shape it knows how to eat
  hueCenter: number; // 0..1 around the wheel, the color it seeks
  hueWidth: number; // tolerance either side of that color
  glowTaste: number; // -1 shuns light .. +1 seeks it
}

// How a critter's visit lands on the plant it favors. Most kinds are
// dispersers — a visit spreads the plant (a drifted seed to open ground)
// while feeding the critter, so both gain. A minority are grazers who still
// take a real bite: the thread of friction that keeps a little negative
// feedback in an otherwise mutualist web.
export type CritterRole = "disperser" | "grazer";

export interface CritterSpecies {
  id: number;
  name: string;
  bodyHue: number; // pastel body color
  earLen: number; // 0..1 — scales whatever the crown turns out to be
  tailLen: number; // 0..1 — scales whatever the tail turns out to be
  size: number; // 0.35 tiny scurrier .. 1.6 knee-high ambler
  morph: CritterMorph; // the visual DNA — always morphOf() of the four numbers above
  palate: Palate; // taste over traits; does the day-to-day choosing
  favoriteSpecies: number; // the species it was born loving (den anchor, UI)
  role: CritterRole; // disperser (spreads what it eats) or grazer (consumes it)
  den: { x: number; y: number }; // tile coords of its burrow
}

// ── morphology ──────────────────────────────────────────────────────────
// The visual DNA of a kind: a body plan and a fistful of independent
// features, so eight archetypes × tails × crowns × eyes × coats give
// hundreds of silhouettes and no island shows three of anything. Purely
// cosmetic — nothing below the skin reads any of it.

// The eight body plans — the archetypes every kind is a variation on.
export type BodyPlan =
  | "puff" // a round dumpling, nearly all fur
  | "loaf" // long and low on stumpy legs, an unhurried grazer shape
  | "hopper" // haunches and spring — the heritage silhouette
  | "strider" // a small body held high on long thin legs
  | "serpent" // a low undulating ribbon of segments
  | "scuttler" // a domed back over many quick little legs
  | "tuft" // a tiny ball on stick legs under an oversized plume
  | "gazer"; // mostly head, mostly eyes

export const BODY_PLANS: readonly BodyPlan[] = [
  "puff",
  "loaf",
  "hopper",
  "strider",
  "serpent",
  "scuttler",
  "tuft",
  "gazer",
];

export type TailKind = "none" | "nub" | "sweep" | "curl" | "plume" | "whip";
export type CrownKind = "none" | "ears" | "lop" | "round" | "horns" | "antennae" | "crest";
export type CoatPattern = "plain" | "spots" | "stripes" | "bands" | "saddle";

export interface CritterMorph {
  plan: BodyPlan;
  legPairs: number; // 0 (a glider, a sitter) .. 4 (a proper scuttle)
  legLen: number; // 0..1 of the plan's reach
  tail: TailKind; // species.tailLen scales it
  crown: CrownKind; // species.earLen scales it
  eyeCount: 1 | 2 | 3; // one wide cyclops eye, the usual pair, or a third
  bigEyes: boolean; // 2px glassy eyes with a shine
  pattern: CoatPattern;
  accentHue: number; // 0..1 — the coat pattern, crest, and inner-ear color
  paleBelly: boolean;
  glowMote: boolean; // one luminous fleck, kin to the flora's glow
}

// What tails and crowns suit which body — repetition is weight, as with
// HABITAT_FORMS. Every kind can still surprise; these only tilt the dice.
const TAIL_POOLS: Record<BodyPlan, readonly TailKind[]> = {
  puff: ["nub", "nub", "plume", "curl", "none"],
  loaf: ["nub", "sweep", "sweep", "none", "curl"],
  hopper: ["nub", "nub", "curl", "sweep", "plume"],
  strider: ["whip", "sweep", "sweep", "plume", "none"],
  serpent: ["whip", "whip", "plume", "none", "sweep"],
  scuttler: ["none", "none", "whip", "nub", "sweep"],
  tuft: ["plume", "plume", "plume", "sweep", "nub"],
  gazer: ["sweep", "curl", "none", "none", "whip"],
};

const CROWN_POOLS: Record<BodyPlan, readonly CrownKind[]> = {
  puff: ["ears", "round", "round", "none", "crest"],
  loaf: ["round", "lop", "lop", "horns", "none"],
  hopper: ["ears", "ears", "ears", "lop", "round"],
  strider: ["horns", "horns", "antennae", "ears", "none"],
  serpent: ["none", "none", "antennae", "horns", "crest"],
  scuttler: ["antennae", "antennae", "antennae", "horns", "none"],
  tuft: ["crest", "crest", "crest", "ears", "antennae"],
  gazer: ["round", "ears", "none", "none", "horns"],
};

// legPairs by plan: [base, extra-die]; pairs = base + floor(roll * extra)
const LEG_PAIRS: Record<BodyPlan, readonly [number, number]> = {
  puff: [0, 2], // 0-1: some dumplings simply sit
  loaf: [1, 2], // 1-2 sets of stumps
  hopper: [1, 2], // haunches, sometimes forepaws too
  strider: [1, 2], // two stilts or four
  serpent: [0, 1.3], // mostly legless; rarely a fringe of many nubs
  scuttler: [3, 2], // 3-4 pairs, always a crowd
  tuft: [1, 1], // stick legs, exactly two
  gazer: [0, 2], // 0-1: some just hover-sit
};

const r3 = (v: number): number => Math.round(v * 1000);

function mixHash(h: number, v: number): number {
  h = Math.imul(h ^ v, 0x85ebca6b);
  h ^= h >>> 13;
  return (Math.imul(h, 0xc2b2ae35) ^ (h >>> 16)) | 0;
}

// The whole genome from the four numbers a journal page remembers — rolled
// from a hash-seeded rng, so the living kind and its portrait years later
// wear exactly the same body. Inputs are quantized to 3 decimals first,
// matching how the journal rounds them; full-precision and remembered
// bodies land on the same genome. Deterministic, no island dice touched.
export function morphOf(body: {
  bodyHue: number;
  earLen: number;
  tailLen: number;
  size: number;
}): CritterMorph {
  let h = 0x51ab;
  h = mixHash(h, r3(body.bodyHue));
  h = mixHash(h, r3(body.earLen));
  h = mixHash(h, r3(body.tailLen));
  h = mixHash(h, r3(body.size));
  const r = makeRng(h >>> 0);
  // one frozen roll order — every draw happens for every kind, so the
  // stream never shifts between plans and old friends keep their faces
  const plan = BODY_PLANS[Math.floor(r() * BODY_PLANS.length)];
  const [legBase, legDie] = LEG_PAIRS[plan];
  const legPairs = legBase + Math.floor(r() * legDie);
  const legLen = r();
  const tailPool = TAIL_POOLS[plan];
  const tail = tailPool[Math.floor(r() * tailPool.length)];
  const crownPool = CROWN_POOLS[plan];
  const crown = crownPool[Math.floor(r() * crownPool.length)];
  const eyeRoll = r();
  const eyeCount: 1 | 2 | 3 = eyeRoll < 0.08 ? 1 : eyeRoll < 0.88 ? 2 : 3;
  const bigEyes = plan === "gazer" || r() < 0.22;
  const patRoll = r();
  const pattern: CoatPattern =
    patRoll < 0.34
      ? "plain"
      : patRoll < 0.56
        ? "spots"
        : patRoll < 0.72
          ? "stripes"
          : patRoll < 0.88
            ? "bands"
            : "saddle";
  // accent leans analogous half the time, complementary the other half —
  // always another stop on the same psychedelic wheel. Built on the
  // quantized hue, so remembered bodies wear the exact accent too.
  const hueQ = r3(body.bodyHue) / 1000;
  const complement = r() < 0.5;
  const accentAmt = r();
  const accentHue = complement
    ? (hueQ + 0.5 + (accentAmt - 0.5) * 0.24 + 1) % 1
    : (hueQ + (accentAmt < 0.5 ? -1 : 1) * (0.06 + accentAmt * 0.1) + 1) % 1;
  const paleBelly = r() < 0.55;
  const glowMote = r() < 0.12;
  return { plan, legPairs, legLen, tail, crown, eyeCount, bigEyes, pattern, accentHue, paleBelly, glowMote };
}

// 0 = inedible to this critter .. 1 = exactly to its taste.
export function appetite(palate: Palate, g: Genome): number {
  if (g.form !== palate.form) return 0;
  const d = Math.abs(g.hue - palate.hueCenter);
  const hueDist = Math.min(d, 1 - d); // hue wraps the wheel
  const hueScore = Math.max(0, 1 - hueDist / palate.hueWidth);
  const target = (palate.glowTaste + 1) / 2;
  const glowScore = 1 - Math.abs(g.glow - target);
  return hueScore * (0.6 + 0.4 * glowScore);
}

export const APPETITE_MIN = 0.3; // below this a plant is just scenery

// The seed a palate would pick from an offered pouch: the best match above
// the scenery line, the oldest on a tie. -1 when nothing tempts — a critter
// that doesn't want your seed simply isn't interested, and no harm done.
export function bestOffering(palate: Palate, seeds: ReadonlyArray<{ genome: Genome }>): number {
  let best = -1;
  let bestFit = APPETITE_MIN;
  for (let i = 0; i < seeds.length; i++) {
    const fit = appetite(palate, seeds[i].genome);
    if (fit > bestFit) {
      bestFit = fit;
      best = i;
    }
  }
  return best;
}

// ── trust ───────────────────────────────────────────────────────────────
// What feeding builds: a kind's memory of your hands, 0 wary .. 1 bonded.
// Kept per species per island in one small book under TRUST_KEY, so a
// friendship made is never unmade by a reload. Behavior reads the bond
// through CritterContext.trust: a trusted kind notices your stillness from
// farther, sidles nearer, potters about you and your camp instead of
// keeping its distance — and, bond by bond, moves its sense of home in
// beside your fire (homePoint). Always a lean, never a leash.

export const TRUST_KEY = "wander.trust";
export const TRUST_STEP = 0.15; // one shared seed; six make a bond
const TRUST_CLOSE = 0.3; // from here on, a kind starts keeping your company
export const TRUST_LINGER_RADIUS_PX = 8 * TILE_SIZE; // how far "with you" (and "at your camp") reaches
const TRUST_PULL = 0.55; // how hard a full bond leans each pottering step
const TRUST_NOTICE = 2; // a full bond spots your stillness from 3x as far
const TRUST_BOOK_CAP = 900; // three hundred islands of three kinds each

export type TrustWord = "wary" | "warming" | "trusts you" | "bonded";

// The bond said in words — the same ladder wherever it is spoken.
export function trustWord(trust: number): TrustWord {
  if (trust >= 0.8) return "bonded";
  if (trust >= 0.5) return "trusts you";
  if (trust > 0) return "warming";
  return "wary";
}

// One shared seed's worth of warming, never past full.
export function raiseTrust(trust: number): number {
  return Math.min(1, trust + TRUST_STEP);
}

// the same tiny storage contract the journal and anthology use — declared
// here so the life layer never reaches into game/
interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultKV(): KV | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

// The bonds this island holds: species id -> trust, read from the one book.
export function loadTrust(seed: number, kv: KV | null = defaultKV()): Map<number, number> {
  const out = new Map<number, number>();
  try {
    const raw = kv?.getItem(TRUST_KEY);
    const book = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const prefix = `${seed}:`;
    for (const [key, v] of Object.entries(book)) {
      if (!key.startsWith(prefix) || typeof v !== "number" || !Number.isFinite(v)) continue;
      const id = Number(key.slice(prefix.length));
      if (Number.isInteger(id) && id >= 0) out.set(id, clamp01(v));
    }
  } catch {
    // storage unreadable: every kind simply starts wary again
  }
  return out;
}

// Write this island's bonds back without disturbing any other island's.
export function saveTrust(
  seed: number,
  trust: ReadonlyMap<number, number>,
  kv: KV | null = defaultKV(),
): void {
  if (!kv) return;
  try {
    const raw = kv.getItem(TRUST_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const book: Record<string, number> =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, number>)
        : {};
    for (const [id, v] of trust) book[`${seed}:${id}`] = clamp01(v);
    // the book stays small: the longest-untouched islands let go first
    const entries = Object.entries(book).slice(-TRUST_BOOK_CAP);
    kv.setItem(TRUST_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // storage full or unavailable: the friendship still holds this sitting
  }
}

export type CritterState = "idle" | "seek" | "nibble" | "home" | "sleep";

// The face a drive wears — what an inspect line could someday read aloud.
// "wary" is reserved for the deferred fear drive (see Drives below).
export type CritterMood = "content" | "hungry" | "drowsy" | "weary" | "curious" | "wary";

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
  energy: number; // 0..1 — the ledger: eating fills it, living drains it
  meal?: Plant | null; // the plant it walked to and is chewing on
  treat?: boolean; // a seed from the wanderer's hand, promised and on its way
  companion?: boolean; // the one who walks with the wanderer — takeCompanion's mark
  curiosity: number; // 0..CURIOSITY_CAP — a small memory of shared stillness
  mood: CritterMood; // the drive that chose the current action — the legible why
  stuck?: number; // seconds of no headway toward a target — trips the unstick
  path?: number[]; // a queued detour (tile indices) around an obstacle, first step first
  pathGoal?: number; // the goal tile that detour was routed to; dropped if the goal moves
}

export const CRITTER_SPEED = 40; // px/s — unhurried
const SEEK_RADIUS_PX = 8 * TILE_SIZE;
const HOME_RANGE_TILES = 6;
const CURIOSITY_RADIUS_PX = 3 * TILE_SIZE;

// The energy ledger. Nothing starves: an empty critter sleeps at its den
// and wakes with enough to try again — hunger is motive, never mortality.
const ENERGY_DRAIN_PER_S = 1 / 200; // living costs; empty in ~3 min awake
const MEAL_ENERGY = 0.35; // one good chew
const HUNGRY = 0.35; // below this, food is all it thinks about
const FULL = 0.85; // above this, grazing holds no interest
const SPENT = 0.05; // below this, only the den will do

// The drives. Each is 0..1, read fresh at decision time; the strongest
// chooses the action. Hunger reads the ledger, comfort reads the hour and
// the body, curiosity is the one true accumulator — a small memory of
// shared stillness. The dice only jitter timing and wander steps; motive
// never rolls.
const DRIVE_QUIET = 0.2; // below this nothing presses — the critter is content
const HUNGER_CAP = 0.95; // hunger never reaches 1: a spent body's need for the den always outranks it (nothing starves)
const CURIOSITY_CAP = 0.55; // play never outranks real hunger or deep night
const CURIOSITY_RISE = 0.12; // per second beside a still wanderer — full in ~5 s
const CURIOSITY_FADE = 0.2; // per second once the moment passes

// What the wider world tells a critter. Everything optional: an absent
// context reads as broad daylight, a wanderer on the move, and no bond yet.
export interface CritterContext {
  darkness?: number; // 0 clear day .. MAX_DARKNESS deep night
  playerStill?: boolean; // the wanderer has kept their feet a moment
  trust?: ReadonlyMap<number, number>; // per-kind bond, 0 wary .. 1 bonded
  camp?: { x: number; y: number } | null; // the wanderer's hearth, world px — a trusted kind dens in beside it
}

export type DriveName = "hunger" | "comfort" | "curiosity";

export interface Drives {
  hunger: number; // the ledger speaks: empty belly, loud voice
  comfort: number; // the pull of the den: night, and a body nearly spent
  curiosity: number; // the pull of the still wanderer
  // fear would attach here — one more term, one "wary" tell, one gentle
  // give-space action — but this world is mutualistic; nothing in it
  // hunts. Deferred until something is worth startling at; when it lands,
  // trust is its damper — a kind fed from your hand startles less.
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

// Pure: a critter's drives, given its state and the hour. Deterministic —
// no dice in motive, so a watcher can always answer "why".
export function critterDrives(c: Critter, ctx: CritterContext = {}): Drives {
  // hunger climbs as the ledger empties, pressing hardest below HUNGRY
  const hunger = HUNGER_CAP * clamp01((FULL - c.energy) / (FULL - HUNGRY));
  // comfort: the dark asks for the den, and so does a body nearly spent —
  // at SPENT it saturates to 1 and outranks even hunger (nothing starves)
  const spent = clamp01((SPENT * 2 - c.energy) / SPENT);
  const comfort = Math.max(ctx.darkness ?? 0, spent);
  return { hunger, comfort, curiosity: c.curiosity };
}

// The strongest drive above the quiet line wins; exact ties fall to the
// earlier name — the ledger before shelter, shelter before play.
export function dominantDrive(d: Drives): DriveName | null {
  let best: DriveName | null = null;
  let loudest = DRIVE_QUIET;
  for (const name of ["hunger", "comfort", "curiosity"] as const) {
    if (d[name] > loudest) {
      loudest = d[name];
      best = name;
    }
  }
  return best;
}

const CRITTER_SYLLABLES = ["po", "mo", "ni", "bul", "tam", "wis", "ket", "ru", "fi", "dov", "san", "lop"];
const CRITTER_EPITHETS = ["hopper", "puff", "whisk", "nibbler", "scamper", "tumble", "peep", "muncher"];

function critterName(rng: Rng): string {
  const syl = () => CRITTER_SYLLABLES[Math.floor(rng() * CRITTER_SYLLABLES.length)];
  const word = syl() + syl();
  const epithet = CRITTER_EPITHETS[Math.floor(rng() * CRITTER_EPITHETS.length)];
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} ${epithet.charAt(0).toUpperCase()}${epithet.slice(1)}`;
}

// Each kind rolls this chance of being a grazer; the rest disperse. Kept
// low so dispersal clearly dominates: a typical island is mostly
// dispersers and often has zero or one grazer — mutualism with a thread of
// friction, never an arms race.
const GRAZER_CHANCE = 0.28;

// The size bands a menagerie is dealt from: one guaranteed tiny scurrier,
// one guaranteed knee-high ambler, and the rest rolled across the whole
// range — so every island holds both ends of the scale.
const SIZE_MIN = 0.35;
const SIZE_MAX = 1.6;
const SIZE_TINY_MAX = 0.6;
const SIZE_LARGE_MIN = 1.2;

// Five to eight species per island (as many as the flora can host), each
// born loving one (preferably nibblable, non-tree) plant species and denned
// where those plants actually grow. The palate is cut from that species'
// archetype, so the love generalizes: close colors and kin qualify, far
// drift disqualifies. Bodies are dealt for spread: sizes span tiny to
// knee-high, and the visual dice reroll until each kind's body plan is its
// own — no island of three identical hoppers again.
export function generateCritterSpecies(
  seed: number,
  map: WorldMap,
  flora: Flora,
  plants: PlantSpecies[],
): CritterSpecies[] {
  const rng = makeRng(seed ^ 0xc417);
  const taste = makeRng(seed ^ 0x9a1a7e); // palates draw their own stream
  // a critter can only love what it can walk to: plants on impassable rock or
  // snow are never a favorite, or the critter would starve nosing at a cliff
  const reachable = plants.filter((p) => WALKABLE.has(p.habitat));
  const nibblable = reachable.filter(
    (p) => p.archetype.form !== PlantForm.Tree && p.archetype.form !== PlantForm.Coral,
  );
  const pool = (nibblable.length >= 3 ? nibblable : reachable.length > 0 ? reachable : plants).map(
    (p) => p.id,
  );
  const count = 5 + Math.floor(rng() * 4); // 5-8 kinds
  const favorites: number[] = [];
  while (favorites.length < count && favorites.length < pool.length) {
    const pick = pool[Math.floor(rng() * pool.length)];
    if (!favorites.includes(pick)) favorites.push(pick);
  }
  // deal the size bands, then shuffle so no fixed id is always the tiny one
  const bands: ("tiny" | "large" | "free")[] = favorites.map((_, i) =>
    i === 0 ? "tiny" : i === 1 ? "large" : "free",
  );
  for (let i = bands.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [bands[i], bands[j]] = [bands[j], bands[i]];
  }
  const usedPlans = new Set<BodyPlan>();
  return favorites.map((favoriteSpecies, id) => {
    const arch = plants[favoriteSpecies].archetype;
    const name = critterName(rng);
    const band = bands[id];
    const size =
      band === "tiny"
        ? SIZE_MIN + rng() * (SIZE_TINY_MAX - SIZE_MIN)
        : band === "large"
          ? SIZE_LARGE_MIN + rng() * (SIZE_MAX - SIZE_LARGE_MIN)
          : SIZE_MIN + rng() * (SIZE_MAX - SIZE_MIN);
    // roll the visual dice until this kind's body plan is one the island
    // hasn't seen — a bounded reroll, so generation always lands
    let bodyHue = rng();
    let earLen = rng();
    let tailLen = rng();
    let morph = morphOf({ bodyHue, earLen, tailLen, size });
    for (let attempt = 0; attempt < 12 && usedPlans.has(morph.plan); attempt++) {
      bodyHue = rng();
      earLen = rng();
      tailLen = rng();
      morph = morphOf({ bodyHue, earLen, tailLen, size });
    }
    usedPlans.add(morph.plan);
    const palate: Palate = {
      form: arch.form,
      hueCenter: (arch.hue + (taste() - 0.5) * 0.06 + 1) % 1,
      hueWidth: 0.12 + taste() * 0.14,
      glowTaste: Math.max(-1, Math.min(1, arch.glow * 2 - 1 + (taste() - 0.5) * 0.5)),
    };
    return {
      id,
      name,
      bodyHue,
      earLen,
      tailLen,
      size,
      morph,
      palate,
      favoriteSpecies,
      den: findDen(rng, map, flora, favoriteSpecies),
      // rolled last so it never shifts the den search above it; most kinds
      // disperse, a minority graze — deterministic per seed
      role: rng() < GRAZER_CHANCE ? "grazer" : "disperser",
    };
  });
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
    if (critterWalkable(map, tx, ty)) return { x: tx, y: ty };
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
      if (!critterWalkable(map, tx, ty)) continue;
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
        energy: 0.5 + rng() * 0.4,
        curiosity: 0,
        mood: "content",
      });
      placed++;
    }
  }
  return out;
}

// A seed offered and accepted: the critter turns from whatever held it and
// comes to eat at the wanderer's feet — the visible beat of the feeding.
// The walk is the ordinary hop, the chew the ordinary nibble wiggle; what
// is new is only the closeness. No dice: the moment plays the same for
// everyone it happens to.
export function feedCritter(c: Critter, player: { x: number; y: number }): void {
  const dx = c.x - player.x;
  const dy = c.y - player.y;
  const d = Math.hypot(dx, dy) || 1;
  const stop = Math.min(d, 10); // to your feet, not into your lap
  c.treat = true;
  c.meal = null;
  c.mood = "curious"; // watching you back, all the way over
  c.state = "seek";
  c.targetX = player.x + (dx / d) * stop;
  c.targetY = player.y + (dy / d) * stop;
  c.stateTime = 8; // long enough that nothing louder interrupts the walk
}

// ── companion ───────────────────────────────────────────────────────────
// The coziest verb: a kind that trusts you can be taken home — one
// individual falls in at the wanderer's heel and pads along wherever they
// go. One companion at a time; asking a new friend releases the old one
// kindly, back to its own ways. The bond gates the asking (the inspect
// card offers "take home" from COMPANION_TRUST up); the flag marks the
// one who said yes.

export const COMPANION_TRUST = 0.5; // "trusts you" and up may be asked home
export const COMPANION_HEEL_PX = 1.5 * TILE_SIZE; // near enough to feel together
const COMPANION_PULL = 0.8; // tighter than any bond — it walks with you, not near you
const COMPANION_KEPT = 0.5; // fed from your hand as you go — never spent, never frantic
const COMPANION_HURRY_PX = 4 * TILE_SIZE; // fallen this far behind, it scampers to catch up

// Ask the nearest of a kind to walk with you. Any prior companion is
// released first — it simply returns to its own ways, no ceremony, no
// hurt. Returns the new companion, or null when none of the kind stands
// anywhere on the island.
export function takeCompanion(
  critters: Critter[],
  speciesId: number,
  player: { x: number; y: number },
): Critter | null {
  let chosen: Critter | null = null;
  let best = Infinity;
  for (const c of critters) {
    if (c.species !== speciesId) continue;
    const d = Math.hypot(c.x - player.x, c.y - player.y);
    if (d < best) {
      best = d;
      chosen = c;
    }
  }
  if (!chosen) return null;
  releaseCompanion(critters);
  chosen.companion = true;
  chosen.mood = "content";
  chosen.state = "idle";
  chosen.stateTime = 0; // it falls in at once
  return chosen;
}

// The old friend goes back to its old life — only the flag lifts; its
// den, its tastes, and its kind's whole bond held all along.
export function releaseCompanion(critters: Critter[]): Critter | null {
  let released: Critter | null = null;
  for (const c of critters) {
    if (c.companion) {
      c.companion = false;
      released = c;
    }
  }
  return released;
}

// A critter pinned against a wall's concave corner (deep water east AND south
// of a shallow tile, say) makes no headway: axis-sliding can round a flat wall
// but not a corner, and the homeward/hearth drives keep re-aiming at the same
// blocked point. When that stall persists, the critter steps off the wall
// toward open ground — so a deer can't end up frozen jammed in a water corner.
const STUCK_EPS = 0.25; // px moved in a frame below which it counts as no headway
const STUCK_LIMIT = 0.6; // seconds pinned before it breaks free

// Critters keep to land: they wade marsh and shore grass but never strike out
// into open-sea shallows, where a land animal only ends up looking stranded.
// The wanderer still wades freely — this is a critter-only rule, stricter than
// the map's isWalkable, so no deer goes swimming off into the sea.
function critterWalkable(map: WorldMap, x: number, y: number): boolean {
  return isWalkable(map, x, y) && tileAt(map, x, y) !== Tile.ShallowWater;
}

// One frame's nudge toward a point. A critter enters open-sea shallows only to
// leave them: it may step off a shallow tile it is already on (so it never
// freezes there), but never walks fresh into the sea from dry ground. Returns
// true once it is there.
function stepToward(c: Critter, px: number, py: number, dt: number, map: WorldMap, speed: number): boolean {
  const dx = px - c.x;
  const dy = py - c.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return true;
  const step = Math.min(dist, speed * dt);
  const nx = c.x + (dx / dist) * step;
  const ny = c.y + (dy / dist) * step;
  if (Math.abs(dx) > 0.5) c.facing = dx > 0 ? 1 : -1;
  const onShallow = tileAt(map, Math.floor(c.x / TILE_SIZE), Math.floor(c.y / TILE_SIZE)) === Tile.ShallowWater;
  const canStep = (tx: number, ty: number): boolean =>
    isWalkable(map, tx, ty) && (onShallow || tileAt(map, tx, ty) !== Tile.ShallowWater);
  if (canStep(Math.floor(nx / TILE_SIZE), Math.floor(c.y / TILE_SIZE))) c.x = nx;
  if (canStep(Math.floor(c.x / TILE_SIZE), Math.floor(ny / TILE_SIZE))) c.y = ny;
  c.hopPhase += dt * 9;
  return Math.hypot(px - c.x, py - c.y) < 2;
}

// Walk toward the current target. If a detour route is queued (routeToward laid
// it after a stall), follow that around the obstacle first, tile by tile; only
// once it is spent — the critter now on the goal tile — does the straight
// approach resume and "arrived" become possible. The route is dropped the moment
// the goal tile changes, so a fresh decision never chases a stale path.
function moveToward(c: Critter, dt: number, map: WorldMap, speed = CRITTER_SPEED): boolean {
  const goalTile = Math.floor(c.targetY / TILE_SIZE) * map.width + Math.floor(c.targetX / TILE_SIZE);
  if (c.pathGoal !== goalTile) {
    c.path = undefined;
    c.pathGoal = goalTile;
  }
  if (c.path && c.path.length > 0) {
    const wp = c.path[0];
    const wpX = ((wp % map.width) + 0.5) * TILE_SIZE;
    const wpY = (((wp / map.width) | 0) + 0.5) * TILE_SIZE;
    if (stepToward(c, wpX, wpY, dt, map, speed)) c.path.shift();
    if (c.path.length > 0) return false; // still detouring — not yet arrived
  }
  return stepToward(c, c.targetX, c.targetY, dt, map, speed);
}

// Aim a pinned critter at the nearest walkable neighbour tile — cardinals
// first for a clean side-step, then diagonals. Deterministic (a fixed scan,
// no dice), so it frees the corner pin without ever perturbing the seeded
// stream the rest of the sim depends on.
function stepOffWall(c: Critter, map: WorldMap): void {
  const cx = Math.floor(c.x / TILE_SIZE);
  const cy = Math.floor(c.y / TILE_SIZE);
  const ring = [
    [0, -1], [-1, 0], [1, 0], [0, 1],
    [-1, -1], [1, -1], [-1, 1], [1, 1],
  ];
  for (const [dx, dy] of ring) {
    if (critterWalkable(map, cx + dx, cy + dy)) {
      c.targetX = (cx + dx + 0.5) * TILE_SIZE;
      c.targetY = (cy + dy + 0.5) * TILE_SIZE;
      c.state = "idle";
      return;
    }
  }
}

// Pinned against rock with its goal on the far side, a critter shouldn't grind
// (or side-step blindly): route AROUND it. A bounded 4-connected BFS over land
// (critterWalkable) from the critter to its current goal tile, then aim it a few
// steps along that path — so it walks the corner instead of into it. Only fired
// on a real stall (see the stuck gate), and deterministic (fixed scan order, no
// dice), so the seeded stream is untouched. Returns false when the goal isn't
// reachable overland within the search box — then the caller side-steps instead.
function routeToward(c: Critter, map: WorldMap): boolean {
  const { width, height } = map;
  const start = Math.floor(c.y / TILE_SIZE) * width + Math.floor(c.x / TILE_SIZE);
  const goal = Math.floor(c.targetY / TILE_SIZE) * width + Math.floor(c.targetX / TILE_SIZE);
  if (goal === start) return false;
  const MAXR = 20; // search box half-width — a local detour, not island-wide A*
  const sx = start % width;
  const sy = (start / width) | 0;
  const from = new Map<number, number>([[start, -1]]);
  const queue = [start];
  let head = 0;
  let reached = false;
  while (head < queue.length) {
    const u = queue[head++];
    if (u === goal) {
      reached = true;
      break;
    }
    const x = u % width;
    const y = (u / width) | 0;
    if (Math.abs(x - sx) > MAXR || Math.abs(y - sy) > MAXR) continue;
    for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const v = ny * width + nx;
      if (from.has(v) || !critterWalkable(map, nx, ny)) continue;
      from.set(v, u);
      queue.push(v);
    }
  }
  if (!reached) return false;
  // the full route becomes the critter's detour — first step first, the start
  // tile (already underfoot) dropped. moveToward walks it; the goal and state are
  // left untouched, so arrival still lands on the real target.
  const path: number[] = [];
  for (let cur = goal; cur !== start; cur = from.get(cur)!) path.push(cur);
  path.reverse();
  c.path = path;
  c.pathGoal = goal;
  return true;
}

export function updateCritter(
  c: Critter,
  dt: number,
  map: WorldMap,
  flora: Flora,
  speciesList: CritterSpecies[],
  player: { x: number; y: number } | null,
  rng: Rng,
  ctx: CritterContext = {},
): void {
  const sp = speciesList[c.species];
  // the bond its kind holds toward the wanderer; 0 when no one has fed it,
  // and 0 leaves every line below exactly as it always was
  const bond = clamp01(ctx.trust?.get(c.species) ?? 0);
  c.stateTime -= dt;
  c.energy = Math.max(0, c.energy - dt * ENERGY_DRAIN_PER_S);

  if (c.state === "sleep") {
    // curled at the den, slowly gathering itself — never worse than this
    c.energy = Math.min(1, c.energy + dt / 60);
    if (c.stateTime <= 0) {
      c.state = "idle";
      c.stateTime = 0;
    }
    return;
  }

  if (c.state === "nibble") {
    c.hopPhase += dt * 4; // gentle munching wiggle
    if (c.stateTime <= 0) {
      // the visit lands. a disperser carries a drifted seed to open ground —
      // the plant gains a child and stands unharmed; a grazer takes a real
      // bite and the plant loses growth. either way the critter feeds: every
      // visit gives MEAL_ENERGY, only the plant's outcome turns on the role.
      if (c.meal && flora.all[c.meal.idx] === c.meal) {
        if (sp.role === "grazer") {
          flora.nibble(c.meal);
        } else {
          flora.propagate(c.meal);
          // a disperser leaves a byproduct where it fed, tagged with the eaten
          // plant's trait-signature — the substrate a matching feeder germinates
          // on. addSubstrate self-gates on the chains flag (no-op + no rng when
          // off), so this needs no branch and never perturbs the seeded stream.
          flora.addSubstrate(c.x, c.y, c.meal.genome);
        }
        c.energy = Math.min(1, c.energy + MEAL_ENERGY);
      }
      c.meal = null;
      c.state = "idle";
      c.stateTime = 0;
    }
    return;
  }

  // curiosity gathers beside a wanderer who keeps still, and drains away
  // once the moment passes; the sidle itself spends it. a kind that trusts
  // you notices from farther, warms faster, and lets the moment linger
  const nearStill =
    player != null &&
    ctx.playerStill &&
    Math.hypot(player.x - c.x, player.y - c.y) < CURIOSITY_RADIUS_PX * (1 + TRUST_NOTICE * bond);
  c.curiosity = nearStill
    ? Math.min(CURIOSITY_CAP, c.curiosity + dt * CURIOSITY_RISE * (1 + bond))
    : Math.max(0, c.curiosity - dt * CURIOSITY_FADE * (1 - 0.6 * bond));

  // a companion that has fallen well behind hurries — ears back, a quick
  // scamper — until it regains your heel; everyone else keeps critter pace
  const pace =
    c.companion && player && Math.hypot(player.x - c.x, player.y - c.y) > COMPANION_HURRY_PX
      ? CRITTER_SPEED * 2
      : CRITTER_SPEED;
  const wasX = c.x;
  const wasY = c.y;
  const arrived = moveToward(c, dt, map, pace);
  // pinned against a concave corner: no arrival and no headway. Let the stall
  // build, then step off the wall toward open ground rather than grinding the
  // same blocked target forever — no more deer frozen in a shallow-water
  // corner. Gated on a committed walk (stateTime > 0) so it never preempts a
  // decision, keeping the seeded stream exactly in step.
  if (!arrived && Math.hypot(c.x - wasX, c.y - wasY) < STUCK_EPS && c.stateTime > 0) {
    c.stuck = (c.stuck ?? 0) + dt;
    if (c.stuck >= STUCK_LIMIT) {
      c.stuck = 0;
      if (!routeToward(c, map)) stepOffWall(c, map); // route around the obstacle, else side-step
      return;
    }
  } else {
    c.stuck = 0;
  }

  if (c.state === "seek" && arrived) {
    if (c.treat) {
      // the promised seed, taken from an open hand: a happy chew right at
      // the wanderer's feet — a true meal, and no plant the poorer for it
      c.treat = false;
      c.meal = null;
      c.energy = Math.min(1, c.energy + MEAL_ENERGY);
      c.state = "nibble";
      c.stateTime = 1.5 + rng() * 1.5;
      return;
    }
    // the salad may have moved on while it walked — chew only what's here
    const bites = flora
      .plantsNear(c.x, c.y, 12)
      .filter((p) => appetite(sp.palate, p.genome) > APPETITE_MIN);
    if (bites.length > 0) {
      c.meal = bites[0];
      c.state = "nibble";
      c.stateTime = 1.5 + rng() * 1.5;
    } else {
      c.state = "idle";
      c.stateTime = 0.5 + rng();
    }
    return;
  }
  if (c.state === "home" && arrived) {
    if (c.energy < 0.3 || c.mood === "drowsy" || c.mood === "weary") {
      // shelter: sleeping at the den settles the body and the hour
      c.state = "sleep";
      c.stateTime = 12 + rng() * 10;
    } else {
      c.state = "idle";
      c.stateTime = 0.5 + rng();
    }
    return;
  }

  if (c.stateTime > 0) return;

  // the companion's day: at the wanderer's heel the old drives fall quiet —
  // you are den, meadow, and weather all at once. walking with you feeds it
  // (the ledger never empties: nothing starves, least of all a friend),
  // night at your side is shelter enough, and the only question left is the
  // gap — fallen behind, it makes for your heel; at heel, it potters a step
  // and waits. released, every line below is its own again.
  if (c.companion && player) {
    c.mood = "content";
    c.curiosity = 0;
    c.energy = Math.max(c.energy, COMPANION_KEPT);
    const gap = Math.hypot(player.x - c.x, player.y - c.y);
    if (gap > COMPANION_HEEL_PX) {
      // aim for a spot at your heel — never into your boots
      const heel = COMPANION_HEEL_PX * 0.6;
      c.targetX = player.x + ((c.x - player.x) / gap) * heel;
      c.targetY = player.y + ((c.y - player.y) / gap) * heel;
      c.state = "idle";
    } else {
      wander(c, map, rng, { x: player.x, y: player.y, pull: COMPANION_PULL });
    }
    c.stateTime = 0.3 + rng() * 0.5; // quick to notice you've moved on
    return;
  }

  // decision time: the drives speak and the strongest chooses. "home" is
  // the kind's den — leaned toward the wanderer's camp once the bond is
  // real, so every homeward walk below carries a loved kind to your fire
  const hearthHome = homePoint(sp.den, bond, ctx.camp, map);
  const denX = hearthHome.x;
  const denY = hearthHome.y;
  const farFromHome = Math.hypot(c.x - denX, c.y - denY) > HOME_RANGE_TILES * TILE_SIZE;
  const want = dominantDrive(critterDrives(c, ctx));

  if (want === "comfort") {
    // the den answers the dark, and a body nearly spent
    c.mood = c.energy <= SPENT * 2 ? "weary" : "drowsy";
    c.state = "home";
    c.targetX = denX;
    c.targetY = denY;
  } else if (want === "hunger") {
    // graze: the nearest plant in sniffing range that suits the palate —
    // whatever species it belongs to, however it got here
    c.mood = "hungry";
    const found = flora
      .plantsNear(c.x, c.y, SEEK_RADIUS_PX)
      .filter((p) => appetite(sp.palate, p.genome) > APPETITE_MIN);
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
    } else if (farFromHome) {
      // nothing in sniffing range: drift back toward known ground
      c.state = "home";
      c.targetX = denX;
      c.targetY = denY;
    } else {
      // cast about: a few steps and another sniff
      wander(c, map, rng);
    }
  } else if (want === "curiosity" && player) {
    // sidle partway toward the still wanderer; the approach spends the
    // itch, and a bond closes more of the gap — a trusted kind comes close
    c.mood = "curious";
    c.curiosity = 0;
    const sidle = 0.5 + 0.35 * bond;
    c.targetX = c.x + (player.x - c.x) * sidle;
    c.targetY = c.y + (player.y - c.y) * sidle;
    c.state = "idle";
  } else {
    // nothing presses: potter about the home range — though a kind that
    // has eaten from your hand would rather potter about you, or your camp
    c.mood = "content";
    const hearth = trustedHearth(c, bond, player, ctx);
    if (hearth) {
      wander(c, map, rng, { x: hearth.x, y: hearth.y, pull: TRUST_PULL * bond });
    } else if (farFromHome) {
      c.state = "home";
      c.targetX = denX;
      c.targetY = denY;
    } else {
      wander(c, map, rng);
    }
  }
  c.stateTime = 1.5 + rng() * 2.5;
}

// How far a full bond moves a kind's sense of home toward the wanderer's
// camp: most of the way, never all — home stays home, it just moves in
// beside yours.
const HOME_LEAN = 0.85;

// Where home is for this one: its kind's den — or, once the bond is real
// (TRUST_CLOSE and up), that den leaned toward the wanderer's camp in
// proportion to the bond. Every homeward walk reads this point: comfort's
// denning, hunger's drift back to known ground, contentment's home range —
// so a well-loved camp genuinely gathers its friends around it, while an
// unbonded kind keeps its old den exactly. Should the lean land in the sea
// or on bare rock, the kind settles beside the camp itself. Pure, and
// deterministic: no dice move house.
export function homePoint(
  den: { x: number; y: number }, // tile coords, as CritterSpecies keeps them
  bond: number,
  camp: { x: number; y: number } | null | undefined,
  map: WorldMap,
): { x: number; y: number } {
  const dx = (den.x + 0.5) * TILE_SIZE;
  const dy = (den.y + 0.5) * TILE_SIZE;
  if (!camp || bond < TRUST_CLOSE) return { x: dx, y: dy };
  const lean = HOME_LEAN * clamp01(bond);
  const x = dx + (camp.x - dx) * lean;
  const y = dy + (camp.y - dy) * lean;
  if (critterWalkable(map, Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE))) return { x, y };
  return { x: camp.x, y: camp.y };
}

// Where a trusting kind gathers: the wanderer when they are near, else the
// camp they keep. Distant company never pulls — trust is a lean, not a
// leash — and below TRUST_CLOSE the old shyness still holds.
function trustedHearth(
  c: Critter,
  bond: number,
  player: { x: number; y: number } | null,
  ctx: CritterContext,
): { x: number; y: number } | null {
  if (bond < TRUST_CLOSE) return null;
  if (player && Math.hypot(player.x - c.x, player.y - c.y) < TRUST_LINGER_RADIUS_PX) {
    return player;
  }
  const camp = ctx.camp;
  if (camp && Math.hypot(camp.x - c.x, camp.y - c.y) < TRUST_LINGER_RADIUS_PX) return camp;
  return null;
}

// a couple of tiles in no particular direction — unless a lean is given,
// which tilts where the step lands. the dice roll the same either way, so
// a bond bends the walk without ever touching the stream.
function wander(
  c: Critter,
  map: WorldMap,
  rng: Rng,
  lean?: { x: number; y: number; pull: number },
): void {
  let tx = Math.floor(c.x / TILE_SIZE) + Math.floor(rng() * 5) - 2;
  let ty = Math.floor(c.y / TILE_SIZE) + Math.floor(rng() * 5) - 2;
  if (lean) {
    tx = Math.round(tx + (Math.floor(lean.x / TILE_SIZE) - tx) * lean.pull);
    ty = Math.round(ty + (Math.floor(lean.y / TILE_SIZE) - ty) * lean.pull);
  }
  if (critterWalkable(map, tx, ty)) {
    c.targetX = (tx + 0.5) * TILE_SIZE;
    c.targetY = (ty + 0.5) * TILE_SIZE;
  }
  c.state = "idle";
}
