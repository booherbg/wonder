import { makeRng, Rng } from "../core/rng";
import { Beast, generateBeast, updateBeast } from "../life/beast";
import { Flock, generateFlocks, updateFlock } from "../life/birds";
import {
  Critter,
  CritterSpecies,
  generateCritterSpecies,
  spawnCritters,
  updateCritter,
} from "../life/fauna";
import { Flora } from "../life/flora";
import { hsl } from "../life/genome";
import { PlantSpecies, generatePlantSpecies } from "../life/species";
import { closeAnthology, isAnthologyOpen, openAnthology } from "../render/anthology";
import { clearCritterSpriteCache } from "../render/critterSprites";
import { closeInspect, isInspectOpen, openInspect } from "../render/inspect";
import { darknessAt, isAuroraNight, isBiolumeNight } from "./daynight";
import { Inventory, emptyInventory, gather, sow } from "./inventory";
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
import { DEFAULT_CONFIG, TILE_SIZE } from "../world/config";
import { generate } from "../world/generate";
import { islandName } from "../world/name";
import { Tile, WorldMap, isWalkable, pocketAt, tileAt } from "../world/types";
import { Renderer } from "../render/renderer";
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

const GATHER_RANGE = 24; // px
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
  const seeds =
    inventory.seeds.length > 0
      ? `seeds ${dots}`
      : "E inspect · F gather · G sow · H home · M murmurs";
  hud.innerHTML = `${msg}${seeds}`;
}

let map!: WorldMap;
let player!: Player;
let species!: PlantSpecies[];
let flora!: Flora;
let critterSpecies!: CritterSpecies[];
let critters!: Critter[];
let critterRng!: Rng;
let beast: Beast | null = null;
let flocks: Flock[] = [];
let birdRng!: Rng;
let simAcc = 0;
let currentSeed = 0;
let baseSpeciesCount = 0; // species beyond this index arose during play
let memories: string[] = []; // weather memory: what this island has witnessed
let home: { x: number; y: number } | null = null;
let saveAcc = 0;
let rArmed = false;

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
  // a seed with no viable island is nearly impossible, but the sea is
  // large: quietly sail on to another seed rather than white-screen
  let attempts = 0;
  for (;;) {
    try {
      map = generate(seed, DEFAULT_CONFIG);
      break;
    } catch {
      if (++attempts >= 5) throw new Error("no island found on five voyages");
      seed = randomSeed();
    }
  }
  currentSeed = seed;
  species = generatePlantSpecies(seed);
  baseSpeciesCount = species.length;
  // dev aid: ?split=1 makes lineages eager to speciate (witness one in minutes)
  const floraTuning = new URL(location.href).searchParams.has("split")
    ? { splitCooldownTicks: 30, splitDistance: 0.18, splitClusterMin: 4 }
    : {};
  const saved = loadSave(seed);
  memories = saved?.memories ? [...saved.memories] : [];
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
    for (let i = 0; i < catchUp; i++) flora.simTick();
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
  critterSpecies = generateCritterSpecies(seed, map, flora, species);
  critters = spawnCritters(critterSpecies, map, seed);
  critterRng = makeRng(seed ^ 0xcafe);
  beast = generateBeast(seed, map);
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
  closeInspect();
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  history.replaceState(null, "", url);
  // the island's whisper: its most recent memory rides the label
  const whisper = memories.length > 0 ? ` · ${memories[memories.length - 1]}` : "";
  seedLabel.textContent = `${islandName(seed)} · seed ${seed}${whisper} — R for a new island`;
  murmurs.setPlace(islandName(seed));
  renderHud();
  if (saved) {
    flashHud(
      awayBorn
        ? `while you were away, ${awayBorn} arose`
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

function openInspectAtPlayer(): void {
  const nearby = flora
    .plantsNear(player.x, player.y, INSPECT_RANGE)
    .sort(
      (a, b) =>
        (a.x - player.x) ** 2 + (a.y - player.y) ** 2 -
        ((b.x - player.x) ** 2 + (b.y - player.y) ** 2),
    )
    .slice(0, 8);
  openInspect(nearby, species);
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

const keys = new Set<string>();
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  keys.add(k);
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
    if (here === Tile.Grass || here === Tile.Sand || here === Tile.Marsh || here === Tile.Forest) {
      home = { x: tx, y: ty };
      flora.setHome(tx, ty);
      flashHud("home — a garden bed takes shape");
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
      openAnthology(loadAnthology());
    }
  } else if (k === "escape") {
    closeInspect();
    closeAnthology();
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
  } else if (k === "e") {
    if (isInspectOpen()) {
      closeInspect();
    } else {
      openInspectAtPlayer();
    }
  } else if (k === "f") {
    const near = flora.plantsNear(player.x, player.y, GATHER_RANGE);
    if (near.length === 0) {
      flashHud("nothing in reach to gather");
    } else {
      const plant = near[0];
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
    const result = sow(inventory);
    if (!result) {
      flashHud("no seeds to sow");
    } else {
      const [rest, seedToPlant] = result;
      const planted = flora.addPlant(
        seedToPlant.species,
        seedToPlant.genome,
        player.x + 6,
        player.y + 2,
        flora.tick,
      );
      if (planted) {
        inventory = rest;
        flashHud(`${species[seedToPlant.species].name} takes root`);
        murmurs.offer("sow");
      } else {
        flashHud("it will not grow here");
      }
    }
    renderHud();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("resize", () => renderer.resize());
window.addEventListener("beforeunload", persist);

function input(): InputState {
  return {
    up: keys.has("w") || keys.has("arrowup"),
    down: keys.has("s") || keys.has("arrowdown"),
    left: keys.has("a") || keys.has("arrowleft"),
    right: keys.has("d") || keys.has("arrowright"),
  };
}

// dev aid: ?overview=1 renders the whole island at a glance (worldgen tuning)
const OVERVIEW_COLORS = ["#22467c", "#4a7dbd", "#e3d29c", "#68a557", "#3e7a40", "#8b8e93", "#e9eef4", "#4d7355"];
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
  slowCheckAcc += dt;
  if (slowCheckAcc >= 1) {
    slowCheckAcc = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const t = tileAt(map, tx + dx, ty + dy);
      if (t === Tile.Rock || t === Tile.Snow) {
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
  player.update(dt, input(), map);
  simAcc += dt * 1000;
  while (simAcc >= SIM_MS) {
    flora.simTick();
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
  }
  for (const c of critters) updateCritter(c, dt, map, flora, critterSpecies, player, critterRng);
  if (beast) {
    updateBeast(beast, dt, map, player, critterRng);
    if (!beast.seen && Math.hypot(beast.x - player.x, beast.y - player.y) < 5 * TILE_SIZE) {
      beast.seen = true;
      flashHud(`${beast.name}, passes`);
      murmurs.offer("beast");
      remember(`${beast.name} passed this way once`);
    }
  }
  const darknessNow = FORCE_NIGHT ? 0.75 : darknessAt(now);
  for (const f of flocks) {
    updateFlock(f, dt, map, player, darknessNow, birdRng);
    if (f.startled) {
      f.startled = false;
      murmurs.offer("birds");
    }
  }
  offerMurmurMoments(dt);
  const camX = clamp(
    player.x - renderer.viewWidth / 2,
    0,
    map.width * TILE_SIZE - renderer.viewWidth,
  );
  const camY = clamp(
    player.y - renderer.viewHeight / 2,
    0,
    map.height * TILE_SIZE - renderer.viewHeight,
  );
  const darkness = darknessNow;
  const auroraTonight = FORCE_AURORA || isAuroraNight(now, currentSeed);
  if (darkness > 0.6) {
    murmurs.offer("night");
    if (auroraTonight) {
      murmurs.offer("aurora");
      remember("an aurora passed here once");
    }
    const ptx = Math.floor(player.x / TILE_SIZE);
    const pty = Math.floor(player.y / TILE_SIZE);
    if (tileAt(map, ptx, pty) === Tile.ShallowWater && isBiolumeNight(now, currentSeed)) {
      murmurs.offer("tide");
      remember("the glowing tide rose here once");
    }
  }
  renderer.draw(
    camX,
    camY,
    { player, flora, plantSpecies: species, critters, critterSpecies, beast, flocks, home, darkness, aurora: auroraTonight },
    now,
  );
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
