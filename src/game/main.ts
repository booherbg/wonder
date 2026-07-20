import { makeRng, Rng } from "../core/rng";
import { Beast, generateBeast, updateBeast } from "../life/beast";
import { Flock, generateFlocks, updateFlock } from "../life/birds";
import {
  Critter,
  CritterMood,
  CritterSpecies,
  TRUST_LINGER_RADIUS_PX,
  bestOffering,
  feedCritter,
  generateCritterSpecies,
  loadTrust,
  raiseTrust,
  saveTrust,
  spawnCritters,
  takeCompanion,
  trustWord,
  updateCritter,
} from "../life/fauna";
import { CensusLog, sparkline, trend } from "../life/census";
import { Flora, Plant, nearestPlant } from "../life/flora";
import { PlantForm, driftDistance, hsl } from "../life/genome";
import {
  loadCritterJournal,
  loadJournal,
  recordCritterMeeting,
  recordForage,
  recordSpread,
  recordSighting,
} from "./journal";
import { PlantSpecies, generateCraterEndemics, generatePlantSpecies } from "../life/species";
import { closeAnthology, isAnthologyOpen, openAnthology } from "../render/anthology";
import { closeJournal, isJournalOpen, openJournal } from "../render/journal";
import { clearCritterSpriteCache } from "../render/critterSprites";
import { closeHelp, isHelpOpen, openHelp } from "../render/help";
import { CampView, closeInspect, hourLine, isInspectOpen, openInspect } from "../render/inspect";
import {
  closePicker,
  featurePhrase,
  isPickerOpen,
  isleRows,
  openPicker,
  setIsleFeature,
} from "../render/picker";
import { darknessAt, isAuroraNight, isBiolumeNight, isBloomDay, msUntilDawn, rainAt } from "./daynight";
import { loadExplored, markSeen, saveExplored } from "./explored";
import { Inventory, emptyInventory, gather, sow, toss } from "./inventory";
import { BEDROLL_COST, FIRE_COST, MaterialNode, placeMaterials } from "./materials";
import { TIDE_LOW, TidePool, exposureAt, placeTidePools, tideAt } from "./tide";
import { MurmurEngine, loadAnthology } from "./murmurs";
import {
  MAX_SAVED_WORLDS,
  SavedWorld,
  WORLD_INDEX_KEY,
  packWorld,
  restoreDaughters,
  restoreInventory,
  restorePlants,
  worldKey,
} from "./save";

const FORCE_NIGHT = new URL(location.href).searchParams.has("night"); // dev aid
const FORCE_AURORA = new URL(location.href).searchParams.has("aurora"); // dev aid
const FORCE_RAIN = new URL(location.href).searchParams.has("rain"); // dev aid
const FORCE_LOWTIDE = new URL(location.href).searchParams.has("lowtide"); // dev aid
const FORCE_FOCUS = new URL(location.href).searchParams.has("focus"); // dev aid: start leaned in
const FOLLOW_BEAST = new URL(location.href).searchParams.has("beast"); // dev aid: the camera rides with the far-goer
import { DEFAULT_CONFIG, TILE_SIZE } from "../world/config";
import { IslandShape, SHAPES, SHAPE_PHRASE, generate, rollShape } from "../world/generate";
import { islandName } from "../world/name";
import { Tile, WorldMap, isWalkable, pocketAt, tileAt } from "../world/types";
import { easeToward } from "../render/depth";
import { OVERVIEW_COLORS } from "../render/palette";
import { Renderer, SOW_LINGER_MS } from "../render/renderer";
import { InputState, Player } from "./player";

const SIM_MS = 2000; // one flora heartbeat every 2s

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(v, hi));
}

function seedFromUrl(): number | null {
  const raw = new URL(location.href).searchParams.get("seed");
  if (raw === null) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

// the one intentional use of Math.random(): choosing a fresh seed
function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 31);
}

const canvas = document.getElementById("game") as HTMLCanvasElement;
const seedLabel = document.getElementById("seed-label")!;
const hud = document.getElementById("hud")!;
const dev = document.getElementById("dev")!;

// the debug readout (backtick): fps, seed, island, live species census — the
// numbers behind the world, so you can watch the sim and copy the seed
let devOn = false;
let fpsSmooth = 60;
let devAcc = 0; // throttles the readout to a few redraws a second
let devTileComp = ""; // biome census, recomputed only when the island changes
let devTileSeed = NaN;
// the living history: how many of each plant kind, sampled over island-time
const census = new CensusLog();

const GATHER_RANGE = 24; // px — materials' reach
const PLANT_REACH = 2 * TILE_SIZE; // px — plants forgive a step's distance
const INSPECT_RANGE = 2.5 * TILE_SIZE;

let inventory: Inventory = emptyInventory();
const murmurs = new MurmurEngine();
let stillTime = 0;
let hudMsg = "";
let hudMsgTimer: ReturnType<typeof setTimeout> | null = null;

function flashHud(msg: string): void {
  hudMsg = msg;
  if (hudMsgTimer) clearTimeout(hudMsgTimer);
  hudMsgTimer = setTimeout(() => {
    hudMsg = "";
    renderHud();
  }, 2600);
  renderHud();
}

function renderHud(): void {
  const dots = inventory.seeds
    .map(
      (s) =>
        `<span class="dot" style="background:${hsl(s.genome.hue, s.genome.sat, 0.55)}"></span>`,
    )
    .join("");
  const msg = hudMsg ? `<span class="msg">${hudMsg}</span>` : "";
  const carriedParts = (["wood", "stone", "rush"] as const)
    .filter((k) => mat[k] > 0)
    .map((k) => `${k} ${mat[k]}`);
  const carried = carriedParts.length > 0 ? `${carriedParts.join(" · ")} · ` : "";
  // the pouch adds to the legend, never replaces it — no key goes hidden
  const pouch = inventory.seeds.length > 0 ? `seeds ${dots} · Q toss · ` : "";
  // non-breaking spaces bind each key to its word, so when the legend wraps it
  // only ever breaks at a " · ", never mid-item ("L isles" stays whole)
  const legend = [
    "E inspect", "F gather", "G sow", "Z focus", "H home", "J journal",
    "M murmurs", "L isles", "P postcard", "R island", "? help",
  ]
    .map((item) => item.replace(" ", String.fromCharCode(160)))
    .join(" · ");
  hud.innerHTML = `${msg}${carried}${pouch}${legend}`;
}

// tile → short word, for the debug readout and the ground-underfoot line
const TILE_WORD: Record<number, string> = {
  [Tile.DeepWater]: "deep water",
  [Tile.ShallowWater]: "shallows",
  [Tile.Sand]: "sand",
  [Tile.Grass]: "grass",
  [Tile.Forest]: "forest",
  [Tile.Marsh]: "marsh",
  [Tile.Rock]: "bare rock",
  [Tile.Snow]: "snow",
  [Tile.Scree]: "scree",
  [Tile.Highland]: "highland",
  [Tile.Cliff]: "cliff",
};

// what the ground itself says when you lean close (E) — always an answer,
// even where nothing grows: there is terrain underfoot wherever you stand
const GROUND_WORDS: Record<number, string> = {
  [Tile.ShallowWater]: "wading the shallows",
  [Tile.Sand]: "beach sand underfoot",
  [Tile.Grass]: "meadow grass underfoot",
  [Tile.Forest]: "the forest floor underfoot",
  [Tile.Marsh]: "soft marsh underfoot",
  [Tile.Rock]: "bare rock underfoot",
  [Tile.Snow]: "deep snow underfoot",
  [Tile.Scree]: "loose scree underfoot",
  [Tile.Highland]: "alpine turf underfoot",
  [Tile.Cliff]: "a cliff's edge",
};

// the island's biome census, recomputed only when the island changes
function devTileComposition(): string {
  if (devTileSeed === currentSeed && devTileComp) return devTileComp;
  const counts = new Map<number, number>();
  for (const t of map.tiles) counts.set(t, (counts.get(t) ?? 0) + 1);
  const total = map.tiles.length;
  devTileComp = [...counts.entries()]
    .filter(([t]) => t !== Tile.DeepWater)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${TILE_WORD[t] ?? t} ${Math.round((n / total) * 100)}%`)
    .join("  ");
  devTileSeed = currentSeed;
  return devTileComp;
}

// the debug readout: the numbers behind the living world
function renderDev(): void {
  const itx = Math.floor(player.x / TILE_SIZE);
  const ity = Math.floor(player.y / TILE_SIZE);
  const here = tileAt(map, itx, ity);
  const elev = map.elevation[ity * map.width + itx] ?? 0;
  const liveKinds = [...flora.speciesCounts.entries()].filter(([, n]) => n > 0);
  liveKinds.sort((a, b) => b[1] - a[1]);
  // each kind with its history: a sparkline of its rise and fall, and whether
  // it's climbing (▲), fading (▼), or holding — the ecology over time, not just now
  const MARK = { rising: "▲", falling: "▼", steady: " " } as const;
  const top = liveKinds
    .slice(0, 9)
    .map(([s, n]) => {
      const tr = census.trace(s);
      const spark = tr ? sparkline(tr.counts, 10) : "";
      const mark = tr ? MARK[trend(tr.counts)] : " ";
      const nm = (species[s]?.name ?? `#${s}`).slice(0, 17).padEnd(17);
      return `  ${nm} ${spark.padEnd(10)} ${String(n).padStart(4)} ${mark}`;
    })
    .join("\n");
  const sum = census.summary();
  const floraLine = census.started
    ? `flora: ${flora.count} plants · ${sum.live} kinds · ${sum.arose} arose · ${sum.lost} lost`
    : `flora: ${flora.count} plants · ${liveKinds.length} kinds`;
  dev.textContent = [
    `seed ${currentSeed}    ${islandName(currentSeed)}`,
    `${map.shape ?? "?"} · ${map.relief ?? "?"}    ${map.width}×${map.height}`,
    `fps ${fpsSmooth.toFixed(0)}    tick ${flora.tick}`,
    `you: ${itx},${ity}  ${TILE_WORD[here] ?? here}  elev ${elev.toFixed(2)}`,
    `biomes: ${devTileComposition()}`,
    floraLine,
    top,
    `critters: ${critters.length} afoot · ${critterSpecies.length} kinds`,
  ].join("\n");
}

let map!: WorldMap;
let player!: Player;
let species!: PlantSpecies[];
let flora!: Flora;
let critterSpecies!: CritterSpecies[];
let critters!: Critter[];
let critterRng!: Rng;
let trust: Map<number, number> = new Map(); // per-kind bond, this island; wander.trust
let companionKind: number | null = null; // the kind at your heel — one friend at a time
let beast: Beast | null = null;
let beastSows: { x: number; y: number; hue: number; at: number }[] = []; // sowings still shimmering
let flocks: Flock[] = [];
let birdRng!: Rng;
let simAcc = 0;
let currentSeed = 0;
let baseSpeciesCount = 0; // species beyond this index arose during play
let memories: string[] = []; // weather memory: what this island has witnessed
let rainMurmurArmed = false; // true while a shower is really coming down
let home: { x: number; y: number } | null = null;
let explored: Uint8Array | null = null; // one bit per tile: where you've walked, this island
let exploredDirty = false; // fresh ink not yet written to the book
let walkTx = -1; // the tile last inked — marking happens on crossings, never per frame
let walkTy = -1;
let materials: MaterialNode[] = []; // driftwood, loose stones, marsh rushes, per seed
let taken = new Set<number>(); // material nodes already gathered
let pools: TidePool[] = []; // the shore's small gardens, bared at low water
let mat = { wood: 0, stone: 0, rush: 0 }; // what the wanderer carries
let fire = false; // the camp fire, once built
let bedroll = false; // the woven bedroll, once built — sleep skips to dawn
let skyOffset = 0; // ms slept forward: the sky's clock runs ahead of the wall's
let saveAcc = 0;
let rArmed = false;
// the focus lens: Z kneels the view in close to watch the small lives work,
// Z again stands back — the zoom itself eases in main's frame loop
const FOCUS_ZOOM = 2;
let focusOn = FORCE_FOCUS;
let focusEase = FORCE_FOCUS ? 1 : 0; // 0 = the wide world .. 1 = leaned all the way in

const MAX_CATCHUP_TICKS = 7200; // ~4 hours of island time while you were away

function persist(): void {
  try {
    const s = packWorld(
      currentSeed,
      flora.tick,
      player,
      home,
      inventory,
      flora.all,
      Date.now(),
      species.slice(baseSpeciesCount),
      memories,
      {
        wood: mat.wood,
        stone: mat.stone,
        rush: mat.rush,
        taken: [...taken],
        fire,
        bedroll,
        // the friend at your heel rides the camp block: its kind, named,
        // so a reload can call it back to you
        companion:
          companionKind !== null
            ? { species: companionKind, name: critterSpecies[companionKind].name }
            : undefined,
      },
    );
    localStorage.setItem(worldKey(currentSeed), JSON.stringify(s));
    const index: number[] = JSON.parse(localStorage.getItem(WORLD_INDEX_KEY) ?? "[]");
    const next = [currentSeed, ...index.filter((x) => x !== currentSeed)];
    for (const evicted of next.slice(MAX_SAVED_WORLDS)) {
      localStorage.removeItem(worldKey(evicted));
    }
    localStorage.setItem(WORLD_INDEX_KEY, JSON.stringify(next.slice(0, MAX_SAVED_WORLDS)));
  } catch {
    // storage full or unavailable: the world still lives, just unsaved
  }
}

function loadSave(seed: number): SavedWorld | null {
  try {
    const raw = localStorage.getItem(worldKey(seed));
    if (!raw) return null;
    const s = JSON.parse(raw) as SavedWorld;
    return s.v === 1 && s.seed === seed ? s : null;
  } catch {
    return null;
  }
}

function loadWorld(seed: number): void {
  // the map you drew of the island you're leaving keeps its ink
  if (explored) saveExplored(currentSeed, explored, map.width, map.height);
  // a seed with no viable island is nearly impossible, but the sea is
  // large: quietly sail on to another seed rather than white-screen
  // dev aid + the seed of the future terrain slider: ?shape=twin|lowland|...
  const shapeParam = new URL(location.href).searchParams.get("shape");
  const forcedShape = SHAPES.includes(shapeParam as IslandShape)
    ? (shapeParam as IslandShape)
    : undefined;
  let attempts = 0;
  for (;;) {
    try {
      map = generate(seed, DEFAULT_CONFIG, forcedShape);
      break;
    } catch {
      if (++attempts >= 5) throw new Error("no island found on five voyages");
      seed = randomSeed();
    }
  }
  currentSeed = seed;
  census.reset(); // a new island begins its own history
  species = generatePlantSpecies(seed);
  if (map.crater) species.push(...generateCraterEndemics(seed, map.crater, species.length));
  baseSpeciesCount = species.length;
  // dev aid: ?split=1 makes lineages eager to speciate (witness one in minutes)
  const floraTuning = new URL(location.href).searchParams.has("split")
    ? { splitCooldownTicks: 30, splitDistance: 0.18, splitClusterMin: 4 }
    : {};
  const saved = loadSave(seed);
  memories = saved?.memories ? [...saved.memories] : [];
  materials = placeMaterials(map, seed);
  pools = placeTidePools(map, seed);
  taken = new Set(saved?.camp?.taken ?? []);
  mat = {
    wood: saved?.camp?.wood ?? 0,
    stone: saved?.camp?.stone ?? 0,
    rush: saved?.camp?.rush ?? 0,
  };
  fire = saved?.camp?.fire ?? false;
  bedroll = saved?.camp?.bedroll ?? false;
  let catchUp = 0;
  let awayBorn: string | null = null; // a species that arose while you were gone
  if (saved) {
    restoreDaughters(saved, species);
    flora = new Flora(map, species, seed, floraTuning, {
      tick: saved.tick,
      plants: restorePlants(saved, species),
    });
    // the island lived while you were away
    catchUp = Math.min(
      MAX_CATCHUP_TICKS,
      Math.floor(Math.max(0, Date.now() - saved.savedAt) / SIM_MS),
    );
    for (let i = 0; i < catchUp; i++) {
      flora.simTick();
      census.sample(flora.tick, flora.speciesCounts);
    }
    const awayEvents = flora.takeEvents();
    if (awayEvents.length > 0) awayBorn = awayEvents[awayEvents.length - 1].name;
    for (const ev of awayEvents) {
      if (!memories.includes(`${ev.name} arose here`)) memories.push(`${ev.name} arose here`);
    }
    home = saved.home ? { x: saved.home[0], y: saved.home[1] } : null;
    if (home) flora.setHome(home.x, home.y);
  } else {
    flora = new Flora(map, species, seed, floraTuning);
    home = null;
  }
  // dev aid + a seed of the "run N generations first" control: ?warm=3000
  // fast-forwards the island's life before you arrive (bounded, so a typo
  // can't hang the load)
  const warm = Math.min(50000, Number(new URL(location.href).searchParams.get("warm") ?? 0) || 0);
  for (let i = 0; i < warm; i++) {
    flora.simTick();
    census.sample(flora.tick, flora.speciesCounts);
  }
  critterSpecies = generateCritterSpecies(seed, map, flora, species);
  critters = spawnCritters(critterSpecies, map, seed);
  critterRng = makeRng(seed ^ 0xcafe);
  trust = loadTrust(seed); // friendships made here, remembered here
  companionKind = null; // each island keeps its own friend; this one's is re-called below
  beast = generateBeast(seed, map, species);
  beastSows = [];
  flocks = generateFlocks(seed, map);
  birdRng = makeRng(seed ^ 0xb12d);
  clearCritterSpriteCache();
  simAcc = 0;
  saveAcc = 0;
  player = new Player((map.spawn.x + 0.5) * TILE_SIZE, (map.spawn.y + 0.5) * TILE_SIZE);
  inventory = emptyInventory();
  if (saved) {
    const [px, py] = saved.player;
    if (isWalkable(map, Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE))) {
      player.x = px;
      player.y = py;
    }
    inventory = restoreInventory(saved, species);
  }
  // the companion keeps its promise across a reload: individuals respawn
  // each load, so what the save kept is the kind — the nearest of your
  // friend's kind is re-designated yours, waiting where you left it
  let companionWaiting: string | null = null;
  const savedCompanion = saved?.camp?.companion;
  if (
    savedCompanion &&
    Number.isInteger(savedCompanion.species) &&
    savedCompanion.species >= 0 &&
    savedCompanion.species < critterSpecies.length &&
    takeCompanion(critters, savedCompanion.species, player)
  ) {
    companionKind = savedCompanion.species;
    companionWaiting = critterSpecies[savedCompanion.species].name;
  }
  // the fog-of-war map: pick up where the ink left off, and see the ground
  // underfoot before the first step is taken
  explored = loadExplored(seed, map.width, map.height);
  walkTx = Math.floor(player.x / TILE_SIZE);
  walkTy = Math.floor(player.y / TILE_SIZE);
  exploredDirty = markSeen(explored, map.width, map.height, walkTx, walkTy);
  closeInspect();
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  history.replaceState(null, "", url);
  const shapePhrase = SHAPE_PHRASE[(map.shape as IslandShape) ?? "highland"];
  seedLabel.textContent = `${islandName(seed)} · ${shapePhrase} · seed ${seed} — R for a new island`;
  murmurs.setPlace(islandName(seed));
  renderHud();
  if (saved) {
    flashHud(
      awayBorn
        ? `while you were away, ${awayBorn} arose`
        : companionWaiting
          ? `${companionWaiting} is waiting where you left it — your companion`
          : catchUp > 0
            ? "the island lived while you were away"
            : "welcome back",
    );
  }
  if (awayBorn) murmurs.offer("speciation");
  murmurs.offer("island");
}

// Weather memory: rare events accrete onto the island, worded once each,
// and ride the seed label on every return.
function remember(text: string): void {
  if (memories.includes(text)) return;
  memories.push(text);
  memories = memories.slice(-12);
  persist();
}

// Sleep swings the sky forward to daybreak. The flora lives the skipped
// hours for real — the same ticks it would have taken — so you can wake
// to something that was not there when you lay down.
function sleepToDawn(sky: number): void {
  const skipped = msUntilDawn(sky);
  skyOffset += skipped;
  const ticks = Math.min(MAX_CATCHUP_TICKS, Math.floor(skipped / SIM_MS));
  for (let i = 0; i < ticks; i++) {
    flora.simTick();
    census.sample(flora.tick, flora.speciesCounts);
  }
  simAcc = 0;
  const born = flora.takeEvents();
  for (const ev of born) remember(`${ev.name} arose here`);
  flashHud(
    born.length > 0
      ? `you wake at first light — in the night, ${born[born.length - 1].name} arose`
      : "you sleep, and the island turns beneath you — dawn",
  );
  murmurs.offer("dawn");
  persist();
  renderHud();
}

// The journal, gathered: every page ever written plus the island underfoot —
// its map, its living kinds, and what it remembers.
function openAlmanac(): void {
  openJournal({
    entries: loadJournal(),
    critters: loadCritterJournal(),
    map,
    species,
    critterSpecies,
    memories,
    trust,
    explored: explored
      ? {
          seen: explored,
          player: { x: Math.floor(player.x / TILE_SIZE), y: Math.floor(player.y / TILE_SIZE) },
          home,
        }
      : undefined,
  });
}

// The isles you've known: the saved-worlds ledger as a panel, each row a
// way back. Names and shapes are pure arithmetic on the seed, so the list
// opens at once; a far island's standout feature wants a full regeneration
// (tens of ms apiece), so those fill in one per beat while the panel stays
// open, cached for the session. The island underfoot reads its own map.
const isleFeatureCache = new Map<number, string | null>();
let isleFillToken = 0;

function isleLook(seed: number): { shape: string; feature: string | null } {
  if (seed === currentSeed) {
    return {
      shape: SHAPE_PHRASE[(map.shape as IslandShape) ?? "highland"],
      feature: featurePhrase(map),
    };
  }
  return {
    shape: SHAPE_PHRASE[rollShape(seed)],
    feature: isleFeatureCache.get(seed) ?? null,
  };
}

function savedIndex(): number[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(WORLD_INDEX_KEY) ?? "[]");
    const index = Array.isArray(raw)
      ? raw.filter((s): s is number => Number.isInteger(s) && s >= 0)
      : [];
    // storage may be unavailable: the island underfoot is still a place
    return index.includes(currentSeed) ? index : [currentSeed, ...index];
  } catch {
    return [currentSeed];
  }
}

function openIslePicker(): void {
  persist(); // the island underfoot takes its place in the ledger first
  const index = savedIndex();
  const rows = isleRows(
    index,
    currentSeed,
    Date.now(),
    (s) => loadSave(s)?.savedAt ?? null,
    isleLook,
  );
  openPicker(rows, (seed) => {
    persist();
    loadWorld(seed);
    renderer.setMap(map);
  });
  // far islands learn their standout feature one per beat, never all at once
  const token = ++isleFillToken;
  const missing = index.filter((s) => s !== currentSeed && !isleFeatureCache.has(s));
  const fill = (): void => {
    if (token !== isleFillToken || !isPickerOpen()) return;
    const s = missing.shift();
    if (s === undefined) return;
    try {
      isleFeatureCache.set(s, featurePhrase(generate(s, DEFAULT_CONFIG)));
    } catch {
      isleFeatureCache.set(s, null); // a seed the sea reclaimed — its row stays plain
    }
    setIsleFeature(s, isleFeatureCache.get(s) ?? null);
    setTimeout(fill, 30);
  };
  if (missing.length > 0) setTimeout(fill, 30);
}

// the panel follows the wanderer while it's open — re-rendered as they move,
// but the journal is written only on the deliberate lean-in (E), never on
// every step of a following panel
let lastInspectX = -999;
let lastInspectY = -999;
function openInspectAtPlayer(record = true): void {
  const nearby = flora
    .plantsNear(player.x, player.y, INSPECT_RANGE)
    .sort(
      (a, b) =>
        (a.x - player.x) ** 2 + (a.y - player.y) ** 2 -
        ((b.x - player.x) ** 2 + (b.y - player.y) ** 2),
    );
  // one card per species: the nearest individual stands for its kind
  const groups = new Map<number, { plant: (typeof nearby)[number]; nearby: number }>();
  for (const p of nearby) {
    const g = groups.get(p.species);
    if (g) g.nearby++;
    else groups.set(p.species, { plant: p, nearby: 1 });
  }
  const near = critters.filter((c) => Math.hypot(c.x - player.x, c.y - player.y) < INSPECT_RANGE);
  const companySpecies = [...new Set(near.map((c) => c.species))].map((id) => critterSpecies[id]);
  // the mood most of a kind wears right now — the live tell for the inspect card
  const companyMoods = new Map<number, CritterMood>();
  for (const sp of companySpecies) {
    const counts = new Map<CritterMood, number>();
    for (const c of near) {
      if (c.species === sp.id) counts.set(c.mood, (counts.get(c.mood) ?? 0) + 1);
    }
    let prevailing: CritterMood = "content";
    let most = -1;
    for (const [mood, n] of counts) {
      if (n > most) {
        most = n;
        prevailing = mood;
      }
    }
    companyMoods.set(sp.id, prevailing);
  }
  const beastNear =
    beast && Math.hypot(beast.x - player.x, beast.y - player.y) < 6 * TILE_SIZE ? beast : null;
  const shown = [...groups.values()].slice(0, 10);
  // leaning close writes the journal — but only on the deliberate lean-in,
  // never on the steps of a panel that follows you as you wander
  if (record) {
    for (const g of shown) {
      const sp = species[g.plant.species];
      recordSighting({
        seed: currentSeed,
        island: islandName(currentSeed),
        speciesId: sp.id,
        speciesName: sp.name,
        genome: g.plant.genome,
        aquatic: sp.habitat === Tile.ShallowWater,
        drift: driftDistance(g.plant.genome, sp.archetype) * 100,
        at: Date.now(),
      });
    }
    // the creature pages too — met means inspected, here, in reach
    for (const sp of companySpecies) {
      recordCritterMeeting({
        seed: currentSeed,
        island: islandName(currentSeed),
        critter: sp,
        at: Date.now(),
      });
    }
  }
  // the hour, and everything near that isn't a plant, a critter, or a seed —
  // so leaning close always answers, even on a bare beach at low tide
  const sky = performance.now() + skyOffset;
  const dark = FORCE_NIGHT ? 0.75 : darknessAt(sky);
  const tideNow = FORCE_LOWTIDE ? 1 : tideAt(sky);
  const hour = hourLine({
    darkness: dark,
    tide: tideNow,
    aurora: (FORCE_AURORA || isAuroraNight(sky, currentSeed)) && dark > 0.6,
    biolume: isBiolumeNight(sky, currentSeed) && dark > 0.6,
    bloom: isBloomDay(sky, currentSeed),
    rain: FORCE_RAIN ? 0.85 : rainAt(sky, currentSeed),
  });
  const bared = exposureAt(tideNow) > 0.35;
  const waterEdge: string[] = [];
  for (const p of pools) {
    if (Math.hypot((p.x + 0.5) * TILE_SIZE - player.x, (p.y + 0.5) * TILE_SIZE - player.y) >= INSPECT_RANGE)
      continue;
    const dweller =
      p.dweller === "star"
        ? "a rose star"
        : p.dweller === "anemone"
          ? "an anemone, folded and open"
          : "a violet urchin";
    waterEdge.push(bared ? `a tide pool — ${dweller}` : `a tide pool, brimming — ${dweller} beneath`);
  }
  const near3 = { wood: 0, stone: 0, rush: 0 };
  for (const m of materials) {
    if (taken.has(m.idx)) continue;
    if (Math.hypot((m.x + 0.5) * TILE_SIZE - player.x, (m.y + 0.5) * TILE_SIZE - player.y) >= INSPECT_RANGE)
      continue;
    near3[m.kind]++;
  }
  if (near3.wood > 0)
    waterEdge.push(near3.wood > 1 ? `driftwood, salt-dried (${near3.wood})` : "driftwood, salt-dried");
  const land: string[] = [];
  const itx = Math.floor(player.x / TILE_SIZE);
  const ity = Math.floor(player.y / TILE_SIZE);
  // the ground itself always answers — even on bare stone there is terrain
  // underfoot, so leaning close (E) is never met with nothing
  land.push(GROUND_WORDS[tileAt(map, itx, ity)] ?? "open ground underfoot");
  if ((map.springs ?? []).some((s) => Math.hypot(s.x - itx, s.y - ity) < 3))
    land.push("a hot spring, steaming");
  if ((map.falls ?? []).some((f) => Math.hypot(f.x - itx, f.y - ity) < 3))
    land.push("a waterfall, white and loud");
  if ((map.confluences ?? []).some((c) => Math.hypot(c.x - itx, c.y - ity) < 3))
    land.push("a pool where two rivers meet");
  if (map.crater && Math.hypot(map.crater.x - itx, map.crater.y - ity) <= map.crater.lakeRadius + 1)
    land.push("the crater lake — the earth's eye");
  if (near3.stone > 0)
    land.push(near3.stone > 1 ? `loose stones, sun-warm (${near3.stone})` : "a loose stone, sun-warm");
  if (near3.rush > 0) land.push("marsh rushes, cut green and soft");

  // standing in or beside your home, the camp speaks: what the bed grows,
  // what stands built, and which kinds have come to live alongside you —
  // the same closeness H uses for tending, so looking and building agree
  let camp: CampView | undefined;
  if (home && Math.hypot(home.x - itx, home.y - ity) <= 2.5) {
    const hx = (home.x + 0.5) * TILE_SIZE;
    const hy = (home.y + 0.5) * TILE_SIZE;
    // the bed, counted by kind — the thriving lead, ties read alphabetically
    const bedCounts = new Map<number, number>();
    for (const p of flora.plantsNear(hx, hy, 2 * TILE_SIZE)) {
      if (flora.inGarden(p.x, p.y)) bedCounts.set(p.species, (bedCounts.get(p.species) ?? 0) + 1);
    }
    const bed = [...bedCounts]
      .map(([id, count]) => ({ name: species[id].name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    // the friends settled here: kinds at least warming to you, with someone
    // actually pottering near home right now — presence, not paperwork
    const friends = critterSpecies
      .filter(
        (sp) =>
          (trust.get(sp.id) ?? 0) > 0 &&
          critters.some(
            (c) =>
              c.species === sp.id && Math.hypot(c.x - hx, c.y - hy) < TRUST_LINGER_RADIUS_PX,
          ),
      )
      .map((sp) => ({ name: sp.name, trust: trust.get(sp.id) ?? 0 }));
    camp = {
      bed,
      fire,
      bedroll,
      friends,
      companion: companionKind !== null ? critterSpecies[companionKind].name : undefined,
    };
  }

  // each plant card carries a small gather button — the same quiet take
  // as F, for the plant you are already looking at
  openInspect(
    shown,
    species,
    inventory.seeds,
    companySpecies,
    beastNear,
    companyMoods,
    (group) => {
      const next = gather(inventory, { species: group.plant.species, genome: group.plant.genome });
      if (!next) return "pouch full";
      inventory = next;
      flashHud(`a seed of ${species[group.plant.species].name}`);
      murmurs.offer("gather");
      return "gathered";
    },
    // and each critter card, when the pouch holds a seed its kind favors,
    // carries a feed button: the best-matching seed leaves the pouch, the
    // nearest of the kind comes to eat at your feet, and its whole kind
    // remembers your hands a little longer
    (sp) => {
      const offering = bestOffering(sp.palate, inventory.seeds);
      if (offering < 0) return "nothing it favors"; // the pouch changed while you looked
      const seeds = [...inventory.seeds];
      seeds.splice(offering, 1);
      inventory = { seeds };
      trust.set(sp.id, raiseTrust(trust.get(sp.id) ?? 0));
      saveTrust(currentSeed, trust);
      let friend: Critter | null = null;
      let best = Infinity;
      for (const c of critters) {
        if (c.species !== sp.id) continue;
        const d = Math.hypot(c.x - player.x, c.y - player.y);
        if (d < best) {
          best = d;
          friend = c;
        }
      }
      if (friend) feedCritter(friend, player);
      const word = trustWord(trust.get(sp.id) ?? 0);
      flashHud(
        word === "bonded"
          ? `${sp.name} settles at your feet — bonded`
          : word === "trusts you"
            ? `${sp.name} eats from your hand — it trusts you now`
            : `${sp.name} edges closer — it's warming to you`,
      );
      murmurs.offer("critter");
      return "shared";
    },
    trust,
    { hour, waterEdge, land },
    camp,
    // and a kind that trusts you can be asked home: the nearest of it
    // falls in at your heel — one companion at a time, any old friend
    // released kindly to its own ways
    (sp) => {
      const prior =
        companionKind !== null && companionKind !== sp.id
          ? critterSpecies[companionKind].name
          : null;
      if (!takeCompanion(critters, sp.id, player)) return "none of its kind near";
      companionKind = sp.id;
      flashHud(
        prior
          ? `${prior} returns to its own ways — ${sp.name} falls in at your heel`
          : `${sp.name} falls in at your heel`,
      );
      murmurs.offer("critter");
      persist();
      return "at your heel";
    },
    companionKind,
  );
  lastInspectX = player.x;
  lastInspectY = player.y;
}

loadWorld(seedFromUrl() ?? randomSeed());
// dev aid: ?at=tx,ty drops the wanderer at a tile (screenshot tours)
const at = new URL(location.href).searchParams.get("at");
if (at) {
  const [tx, ty] = at.split(",").map(Number);
  if (Number.isFinite(tx) && Number.isFinite(ty)) {
    player.x = (tx + 0.5) * TILE_SIZE;
    player.y = (ty + 0.5) * TILE_SIZE;
  }
}
const renderer = new Renderer(canvas, map);
// dev aid: ?inspect=1 opens the inspect panel on load (screenshot tours)
if (new URL(location.href).searchParams.has("inspect")) openInspectAtPlayer();
// dev aid: ?journal=1 opens the almanac on load (screenshot tours)
if (new URL(location.href).searchParams.has("journal")) openAlmanac();
// dev aid: ?isles=1 opens the isle picker on load (screenshot tours)
if (new URL(location.href).searchParams.has("isles")) openIslePicker();

// the very first arrival, ever: the field guide opens itself once, with a
// line of welcome. after that it waits behind ? and never speaks unasked.
const SEEN_KEY = "wander.seen";
try {
  if (!localStorage.getItem(SEEN_KEY)) {
    localStorage.setItem(SEEN_KEY, "1");
    openHelp(true);
  }
} catch {
  // storage unavailable: no welcome, but ? still answers
}

const keys = new Set<string>();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
  if (k === "`" || k === "~") {
    // the debug readout: everything the sim knows, for the curious
    devOn = !devOn;
    dev.style.display = devOn ? "block" : "none";
    if (devOn) renderDev();
    return;
  }
  if (k === "r") {
    if (!rArmed) {
      rArmed = true;
      flashHud("press R again to sail for a new island (this one is saved)");
      setTimeout(() => {
        rArmed = false;
      }, 3000);
    } else {
      rArmed = false;
      persist();
      loadWorld(randomSeed());
      renderer.setMap(map);
    }
  } else if (k === "h") {
    const tx = Math.floor(player.x / TILE_SIZE);
    const ty = Math.floor(player.y / TILE_SIZE);
    const here = tileAt(map, tx, ty);
    const nearHome = home !== null && Math.hypot(home.x - tx, home.y - ty) <= 2.5;
    if (nearHome && !fire) {
      // beside an existing home, H tends the camp: first the fire
      if (mat.wood >= FIRE_COST.wood && mat.stone >= FIRE_COST.stone) {
        mat.wood -= FIRE_COST.wood;
        mat.stone -= FIRE_COST.stone;
        fire = true;
        flashHud("a fire ring takes shape — it will burn every night");
        murmurs.offer("fire");
        persist();
        renderHud();
      } else {
        flashHud(
          `a fire wants ${FIRE_COST.wood} driftwood and ${FIRE_COST.stone} stones — you carry ${mat.wood} and ${mat.stone}`,
        );
      }
    } else if (nearHome && !bedroll) {
      // then the bedroll, woven from what the marsh gives
      if (mat.wood >= BEDROLL_COST.wood && mat.rush >= BEDROLL_COST.rush) {
        mat.wood -= BEDROLL_COST.wood;
        mat.rush -= BEDROLL_COST.rush;
        bedroll = true;
        flashHud("a bedroll of woven rushes — when dark falls, H here carries you to dawn");
        murmurs.offer("rest");
        persist();
        renderHud();
      } else {
        flashHud(
          `a bedroll wants ${BEDROLL_COST.wood} driftwood and ${BEDROLL_COST.rush} marsh rushes — you carry ${mat.wood} and ${mat.rush}`,
        );
      }
    } else if (nearHome) {
      // camp complete: H beside the fire sleeps the night away
      const sky = performance.now() + skyOffset;
      if (darknessAt(sky) > 0.3) {
        sleepToDawn(sky);
      } else {
        flashHud("the bedroll waits for dark");
      }
    } else if (here === Tile.Grass || here === Tile.Sand || here === Tile.Marsh || here === Tile.Forest) {
      home = { x: tx, y: ty };
      flora.setHome(tx, ty);
      flashHud(fire ? "home moves — the camp comes along" : "home — a garden bed takes shape");
      murmurs.offer("home");
      persist();
    } else {
      flashHud("no ground here to settle on");
    }
  } else if (k === "m") {
    if (isAnthologyOpen()) {
      closeAnthology();
    } else {
      closeInspect();
      closeJournal();
      closeHelp();
      closePicker();
      openAnthology(loadAnthology());
    }
  } else if (k === "j") {
    if (isJournalOpen()) {
      closeJournal();
    } else {
      closeInspect();
      closeAnthology();
      closeHelp();
      closePicker();
      openAlmanac();
    }
  } else if (k === "l") {
    // the isles you've known: the saved-worlds ledger, each row a way back
    if (isPickerOpen()) {
      closePicker();
    } else {
      closeInspect();
      closeAnthology();
      closeJournal();
      closeHelp();
      openIslePicker();
    }
  } else if (k === "?") {
    // the field guide: a card, not a curriculum
    if (isHelpOpen()) {
      closeHelp();
    } else {
      closeInspect();
      closeAnthology();
      closeJournal();
      closePicker();
      openHelp();
    }
  } else if (k === "escape") {
    closeInspect();
    closeAnthology();
    closeJournal();
    closeHelp();
    closePicker();
  } else if (k === "p") {
    // a postcard: the canvas as it stands, named for the island
    canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${islandName(currentSeed).toLowerCase().replace(" ", "-")}-${currentSeed}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    flashHud("postcard saved");
  } else if (k === "z" && !e.repeat) {
    // the focus lens: kneel in close, watch a pollinator work one flower
    focusOn = !focusOn;
    if (focusOn) flashHud("you lean in close — Z to stand back");
  } else if (k === "e") {
    if (isInspectOpen()) {
      closeInspect();
    } else {
      openInspectAtPlayer();
    }
  } else if (k === "f") {
    // materials first: driftwood and stones are the plainer, nearer gift
    const reachable = materials
      .filter((m) => !taken.has(m.idx))
      .map((m) => ({
        m,
        d: Math.hypot((m.x + 0.5) * TILE_SIZE - player.x, (m.y + 0.5) * TILE_SIZE - player.y),
      }))
      .filter(({ d }) => d < GATHER_RANGE + 8)
      .sort((a, b) => a.d - b.d);
    if (reachable.length > 0) {
      const node = reachable[0].m;
      taken.add(node.idx);
      mat[node.kind]++;
      if (!fire && mat.wood >= FIRE_COST.wood && mat.stone >= FIRE_COST.stone) {
        flashHud("you carry enough for a fire — press H beside your home");
      } else if (fire && !bedroll && mat.wood >= BEDROLL_COST.wood && mat.rush >= BEDROLL_COST.rush) {
        flashHud("you carry enough for a bedroll — press H beside your fire");
      } else {
        flashHud(
          node.kind === "wood"
            ? "driftwood — salt-dried and light"
            : node.kind === "stone"
              ? "a loose stone, sun-warm"
              : "a marsh rush, cut green and soft",
        );
      }
      renderHud();
      persist();
      return;
    }
    // then plants: the one you mean is the nearest, not the first found
    const plant = nearestPlant(
      flora.plantsNear(player.x, player.y, PLANT_REACH),
      player.x,
      player.y,
    );
    if (!plant) {
      flashHud("nothing in reach to gather");
    } else {
      const next = gather(inventory, { species: plant.species, genome: plant.genome });
      if (!next) {
        flashHud("your seed pouch is full");
      } else {
        inventory = next;
        flashHud(`a seed of ${species[plant.species].name}`);
        murmurs.offer("gather");
      }
    }
  } else if (k === "g") {
    const px = player.x + 6;
    const py = player.y + 2;
    const here = tileAt(map, Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE));
    const result = sow(inventory, (s) => species[s.species].habitat === here);
    if (!result) {
      flashHud(
        inventory.seeds.length === 0
          ? "no seeds to sow"
          : "nothing in the pouch would grow here",
      );
    } else {
      const [rest, seedToPlant] = result;
      const planted = flora.addPlant(seedToPlant.species, seedToPlant.genome, px, py, flora.tick);
      if (planted) {
        inventory = rest;
        flashHud(`${species[seedToPlant.species].name} takes root`);
        murmurs.offer("sow");
      } else {
        flashHud("no room here for it to root");
      }
    }
    renderHud();
  } else if (k === "q") {
    const result = toss(inventory);
    if (!result) {
      flashHud("the pouch is empty");
    } else {
      inventory = result[0];
      flashHud(`a seed of ${species[result[1].species].name}, given back to the wind`);
    }
    renderHud();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("resize", () => renderer.resize());
window.addEventListener("beforeunload", persist);
window.addEventListener("beforeunload", () => {
  if (explored) saveExplored(currentSeed, explored, map.width, map.height);
});

function input(): InputState {
  return {
    up: keys.has("w") || keys.has("arrowup"),
    down: keys.has("s") || keys.has("arrowdown"),
    left: keys.has("a") || keys.has("arrowleft"),
    right: keys.has("d") || keys.has("arrowright"),
  };
}

// dev aid: ?overview=1 renders the whole island at a glance (worldgen tuning)
function drawOverview(): void {
  const ctx = canvas.getContext("2d")!;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const s = Math.max(1, Math.floor(Math.min(canvas.width / map.width, canvas.height / map.height)));
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      ctx.fillStyle = OVERVIEW_COLORS[map.tiles[y * map.width + x]];
      ctx.fillRect(x * s, y * s, s, s);
    }
  }
  ctx.fillStyle = "#ff5050";
  ctx.fillRect(map.spawn.x * s - 2, map.spawn.y * s - 2, 5, 5);
}

let slowCheckAcc = 0;
// meals already written down, so one long chew isn't noted every second
const witnessedMeals = new WeakMap<Critter, Plant>();
function offerMurmurMoments(dt: number): void {
  const inp = input();
  if (inp.up || inp.down || inp.left || inp.right) {
    stillTime = 0;
  } else {
    stillTime += dt;
    if (stillTime > 25) {
      murmurs.offer("still");
      stillTime = 0;
    }
  }
  const tx = Math.floor(player.x / TILE_SIZE);
  const ty = Math.floor(player.y / TILE_SIZE);
  const here = tileAt(map, tx, ty);
  if (pocketAt(map, tx, ty)) murmurs.offer("pocket");
  else if (here === Tile.Forest) murmurs.offer("forest");
  else if (here === Tile.ShallowWater) murmurs.offer("water");
  else if (here === Tile.Sand) murmurs.offer("sand");
  else if (here === Tile.Marsh) murmurs.offer("marsh");
  else if (here === Tile.Grass) murmurs.offer("meadow");
  else if (here === Tile.Scree) murmurs.offer("heights");
  else if (here === Tile.Highland) murmurs.offer("highland");
  slowCheckAcc += dt;
  if (slowCheckAcc >= 1) {
    slowCheckAcc = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const t = tileAt(map, tx + dx, ty + dy);
      if (t === Tile.Rock || t === Tile.Snow || t === Tile.Cliff) {
        murmurs.offer("heights");
        break;
      }
    }
    if (flora.plantsNear(player.x, player.y, 40).some((p) => species[p.species].sport)) {
      murmurs.offer("sport");
    }
    if (critters.some((c) => Math.hypot(c.x - player.x, c.y - player.y) < 2.5 * TILE_SIZE)) {
      murmurs.offer("critter");
    }
    // standing truly still, watching: learn who eats what — if that plant
    // already has a page in the journal
    if (stillTime >= 1) {
      for (const c of critters) {
        if (c.state !== "nibble" || !c.meal || flora.all[c.meal.idx] !== c.meal) continue;
        if (Math.hypot(c.x - player.x, c.y - player.y) >= 6 * TILE_SIZE) continue;
        if (witnessedMeals.get(c) === c.meal) continue;
        witnessedMeals.set(c, c.meal);
        // the plant's page learns its visitor under the right verb: a grazer
        // is "grazed by", a disperser "spread by" — never mislabeled
        const witness = critterSpecies[c.species];
        if (witness.role === "grazer") recordForage(currentSeed, c.meal.species, witness.name);
        else recordSpread(currentSeed, c.meal.species, witness.name);
      }
    }
    if ((map.springs ?? []).some((s) => Math.hypot(s.x - tx, s.y - ty) < 2)) {
      murmurs.offer("spring");
    }
    if ((map.falls ?? []).some((f) => Math.hypot(f.x - tx, f.y - ty) < 3)) {
      murmurs.offer("falls");
    }
    if (map.crater && Math.hypot(map.crater.x - tx, map.crater.y - ty) <= map.crater.lakeRadius + 1) {
      murmurs.offer("crater");
      remember("you reached the earth's eye at the island's heart");
    }
    if ((map.confluences ?? []).some((c) => Math.hypot(c.x - tx, c.y - ty) < 3)) {
      murmurs.offer("confluence");
    }
    if (
      (FORCE_LOWTIDE || tideAt(performance.now() + skyOffset) > TIDE_LOW) &&
      pools.some((p) => Math.hypot(p.x - tx, p.y - ty) < 2.5)
    ) {
      murmurs.offer("tidepool");
      remember("the sea drew back and showed its small gardens once");
    }
    if (rainMurmurArmed) {
      murmurs.offer("rain");
    }
    if (map.shape === "skerries") {
      murmurs.offer("skerries");
    }
    if (
      isBloomDay(performance.now() + skyOffset, currentSeed) &&
      flora.plantsNear(player.x, player.y, 40).some((p) => p.genome.form === PlantForm.Fungus)
    ) {
      murmurs.offer("bloom");
    }
  }
}

let last = performance.now();
function frame(now: number): void {
  if (new URL(location.href).searchParams.has("overview")) {
    drawOverview();
    requestAnimationFrame(frame);
    return;
  }
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  // a murmur caught floating when a panel opens is retired at once
  murmurs.syncPanels();
  // the debug readout: smoothed fps, redrawn a few times a second
  if (dt > 0) fpsSmooth = fpsSmooth * 0.92 + (1 / dt) * 0.08;
  if (devOn && (devAcc += dt) >= 0.25) {
    devAcc = 0;
    renderDev();
  }
  // the sky's clock: wall time plus every night slept through
  const sky = now + skyOffset;
  player.update(dt, input(), map);
  // the fog-of-war map: crossing into a new tile inks it and the glance
  // around it — a handful of bit-sets on a crossing, nothing at all between
  const walkNowX = Math.floor(player.x / TILE_SIZE);
  const walkNowY = Math.floor(player.y / TILE_SIZE);
  if (explored && (walkNowX !== walkTx || walkNowY !== walkTy)) {
    walkTx = walkNowX;
    walkTy = walkNowY;
    if (markSeen(explored, map.width, map.height, walkTx, walkTy)) exploredDirty = true;
  }
  // the inspect panel follows you: walk with it open and it re-reads what's
  // around, without re-writing the journal each step
  if (
    isInspectOpen() &&
    Math.hypot(player.x - lastInspectX, player.y - lastInspectY) > TILE_SIZE * 0.5
  ) {
    openInspectAtPlayer(false);
  }
  const rainNow = FORCE_RAIN ? 0.85 : rainAt(sky, currentSeed);
  const bloomToday = isBloomDay(sky, currentSeed);
  const auroraTonight = FORCE_AURORA || isAuroraNight(sky, currentSeed);
  rainMurmurArmed = rainNow > 0.5;
  simAcc += dt * 1000;
  while (simAcc >= SIM_MS) {
    flora.simTick({
      rain: rainNow > 0.2,
      bloom: bloomToday,
      aurora: auroraTonight && darknessAt(sky) > 0.6,
    });
    census.sample(flora.tick, flora.speciesCounts);
    simAcc -= SIM_MS;
  }
  for (const ev of flora.takeEvents()) {
    flashHud(`${ev.name} — a new kind, arisen from ${ev.parentName}`);
    murmurs.offer("speciation");
    remember(`${ev.name} arose here`);
  }
  saveAcc += dt;
  if (saveAcc >= 10) {
    saveAcc = 0;
    persist();
    // the walked map is written only when fresh ground was seen
    if (explored && exploredDirty) {
      exploredDirty = false;
      saveExplored(currentSeed, explored, map.width, map.height);
    }
  }
  const darknessNow = FORCE_NIGHT ? 0.75 : darknessAt(sky);
  const inp = input();
  // what the world tells the critters: the hour, whether the wanderer is
  // keeping still — stillness is this game's watching verb — and the bond
  // each kind holds, so trusted company gathers around you and, kind by
  // kind, comes to den beside your camp (fauna's homePoint)
  const critterCtx = {
    darkness: darknessNow,
    playerStill: !(inp.up || inp.down || inp.left || inp.right),
    trust,
    camp: home ? { x: (home.x + 0.5) * TILE_SIZE, y: (home.y + 0.5) * TILE_SIZE } : null,
  };
  for (const c of critters)
    updateCritter(c, dt, map, flora, critterSpecies, player, critterRng, critterCtx);
  if (beast) {
    const dropped = updateBeast(beast, dt, map, flora, player, critterRng);
    // the sow made visible: the renderer drops a seed-colored mote and a
    // brief shimmer where the fresh sprout stands
    if (dropped) {
      beastSows.push({ x: dropped.x, y: dropped.y, hue: dropped.genome.hue, at: sky });
    }
    // if you stand still and watch it set a far-carried seed down, the plant's
    // page learns the beast's name — "spread by <name>", long-distance dispersal
    // made legible (and only for a kind you've already met — recordSpread no-ops
    // otherwise)
    if (
      dropped &&
      stillTime >= 1 &&
      Math.hypot(beast.x - player.x, beast.y - player.y) < 6 * TILE_SIZE
    ) {
      recordSpread(currentSeed, dropped.species, beast.name);
    }
    if (!beast.seen && Math.hypot(beast.x - player.x, beast.y - player.y) < 5 * TILE_SIZE) {
      beast.seen = true;
      flashHud(`${beast.name}, passes`);
      murmurs.offer("beast");
      remember(`${beast.name} passed this way once`);
    }
  }
  for (const f of flocks) {
    updateFlock(f, dt, map, player, darknessNow, birdRng);
    if (f.startled) {
      f.startled = false;
      murmurs.offer("birds");
    }
  }
  offerMurmurMoments(dt);
  // the focus lens eases in and out; the camera math below sees only the
  // smaller view and keeps itself centered on the wanderer (or the beast)
  focusEase = easeToward(focusEase, focusOn ? 1 : 0, dt, 4);
  renderer.setZoom(1 + (FOCUS_ZOOM - 1) * focusEase);
  const focus = FOLLOW_BEAST && beast ? beast : player;
  const camX = clamp(
    focus.x - renderer.viewWidth / 2,
    0,
    map.width * TILE_SIZE - renderer.viewWidth,
  );
  const camY = clamp(
    focus.y - renderer.viewHeight / 2,
    0,
    map.height * TILE_SIZE - renderer.viewHeight,
  );
  const darkness = darknessNow;
  if (darkness > 0.6) {
    murmurs.offer("night");
    if (auroraTonight) {
      murmurs.offer("aurora");
      remember("an aurora passed here once");
    }
    const ptx = Math.floor(player.x / TILE_SIZE);
    const pty = Math.floor(player.y / TILE_SIZE);
    if (tileAt(map, ptx, pty) === Tile.ShallowWater && isBiolumeNight(sky, currentSeed)) {
      murmurs.offer("tide");
      remember("the glowing tide rose here once");
    }
  }
  if (beastSows.length > 0) beastSows = beastSows.filter((s) => sky - s.at < SOW_LINGER_MS);
  renderer.draw(
    camX,
    camY,
    {
      player, flora, plantSpecies: species, critters, critterSpecies, beast, flocks, home,
      darkness, aurora: auroraTonight, rain: rainNow,
      materials: materials.filter((m) => !taken.has(m.idx)), fire, bedroll,
      tide: FORCE_LOWTIDE ? 1 : tideAt(sky), pools, sows: beastSows,
    },
    sky,
  );
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
