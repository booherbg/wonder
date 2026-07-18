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
import { PlantForm, driftDistance, hsl } from "../life/genome";
import { loadJournal, recordSighting } from "./journal";
import { PlantSpecies, generateCraterEndemics, generatePlantSpecies } from "../life/species";
import { closeAnthology, isAnthologyOpen, openAnthology } from "../render/anthology";
import { closeJournal, isJournalOpen, openJournal } from "../render/journal";
import { clearCritterSpriteCache } from "../render/critterSprites";
import { closeInspect, isInspectOpen, openInspect } from "../render/inspect";
import { darknessAt, isAuroraNight, isBiolumeNight, isBloomDay, msUntilDawn, rainAt } from "./daynight";
import { Inventory, emptyInventory, gather, sow, toss } from "./inventory";
import { BEDROLL_COST, FIRE_COST, MaterialNode, placeMaterials } from "./materials";
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
import { DEFAULT_CONFIG, TILE_SIZE } from "../world/config";
import { IslandShape, SHAPES, SHAPE_PHRASE, generate } from "../world/generate";
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
  const carriedParts = (["wood", "stone", "rush"] as const)
    .filter((k) => mat[k] > 0)
    .map((k) => `${k} ${mat[k]}`);
  const carried = carriedParts.length > 0 ? `${carriedParts.join(" · ")} · ` : "";
  const seeds =
    inventory.seeds.length > 0
      ? `${carried}seeds ${dots} · G sow · Q toss · E inspect`
      : `${carried}E inspect · F gather · G sow · H home · J journal · M murmurs`;
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
let rainMurmurArmed = false; // true while a shower is really coming down
let home: { x: number; y: number } | null = null;
let materials: MaterialNode[] = []; // driftwood, loose stones, marsh rushes, per seed
let taken = new Set<number>(); // material nodes already gathered
let mat = { wood: 0, stone: 0, rush: 0 }; // what the wanderer carries
let fire = false; // the camp fire, once built
let bedroll = false; // the woven bedroll, once built — sleep skips to dawn
let skyOffset = 0; // ms slept forward: the sky's clock runs ahead of the wall's
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
      { wood: mat.wood, stone: mat.stone, rush: mat.rush, taken: [...taken], fire, bedroll },
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
  const shapePhrase = SHAPE_PHRASE[(map.shape as IslandShape) ?? "highland"];
  seedLabel.textContent = `${islandName(seed)} · ${shapePhrase} · seed ${seed} — R for a new island`;
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

// Sleep swings the sky forward to daybreak. The flora lives the skipped
// hours for real — the same ticks it would have taken — so you can wake
// to something that was not there when you lay down.
function sleepToDawn(sky: number): void {
  const skipped = msUntilDawn(sky);
  skyOffset += skipped;
  const ticks = Math.min(MAX_CATCHUP_TICKS, Math.floor(skipped / SIM_MS));
  for (let i = 0; i < ticks; i++) flora.simTick();
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

function openInspectAtPlayer(): void {
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
  const companySpecies = [
    ...new Set(
      critters
        .filter((c) => Math.hypot(c.x - player.x, c.y - player.y) < INSPECT_RANGE)
        .map((c) => c.species),
    ),
  ].map((id) => critterSpecies[id]);
  const beastNear =
    beast && Math.hypot(beast.x - player.x, beast.y - player.y) < 6 * TILE_SIZE ? beast : null;
  const shown = [...groups.values()].slice(0, 10);
  // leaning close is how the journal writes itself
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
  openInspect(shown, species, inventory.seeds, companySpecies, beastNear);
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
      openAnthology(loadAnthology());
    }
  } else if (k === "j") {
    if (isJournalOpen()) {
      closeJournal();
    } else {
      closeInspect();
      closeAnthology();
      openJournal(loadJournal());
    }
  } else if (k === "escape") {
    closeInspect();
    closeAnthology();
    closeJournal();
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
  // the sky's clock: wall time plus every night slept through
  const sky = now + skyOffset;
  player.update(dt, input(), map);
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
  const darknessNow = FORCE_NIGHT ? 0.75 : darknessAt(sky);
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
  renderer.draw(
    camX,
    camY,
    {
      player, flora, plantSpecies: species, critters, critterSpecies, beast, flocks, home,
      darkness, aurora: auroraTonight, rain: rainNow,
      materials: materials.filter((m) => !taken.has(m.idx)), fire, bedroll,
    },
    sky,
  );
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
