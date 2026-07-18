import { makeRng, Rng } from "../core/rng";
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
import { clearCritterSpriteCache } from "../render/critterSprites";
import { closeInspect, isInspectOpen, openInspect } from "../render/inspect";
import { Inventory, emptyInventory, gather, sow } from "./inventory";
import { DEFAULT_CONFIG, TILE_SIZE } from "../world/config";
import { generate } from "../world/generate";
import { WorldMap } from "../world/types";
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
  const seeds = inventory.seeds.length > 0 ? `seeds ${dots}` : "E inspect · F gather · G sow";
  hud.innerHTML = `${msg}${seeds}`;
}

let map!: WorldMap;
let player!: Player;
let species!: PlantSpecies[];
let flora!: Flora;
let critterSpecies!: CritterSpecies[];
let critters!: Critter[];
let critterRng!: Rng;
let simAcc = 0;

function loadWorld(seed: number): void {
  map = generate(seed, DEFAULT_CONFIG);
  species = generatePlantSpecies(seed);
  flora = new Flora(map, species, seed);
  critterSpecies = generateCritterSpecies(seed, map, flora, species);
  critters = spawnCritters(critterSpecies, map, seed);
  critterRng = makeRng(seed ^ 0xcafe);
  clearCritterSpriteCache();
  simAcc = 0;
  player = new Player((map.spawn.x + 0.5) * TILE_SIZE, (map.spawn.y + 0.5) * TILE_SIZE);
  inventory = emptyInventory();
  closeInspect();
  const url = new URL(location.href);
  url.searchParams.set("seed", String(seed));
  history.replaceState(null, "", url);
  seedLabel.textContent = `seed ${seed} — R for a new island`;
  renderHud();
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
    loadWorld(randomSeed());
    renderer.setMap(map);
  } else if (k === "escape") {
    closeInspect();
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
      } else {
        flashHud("it will not grow here");
      }
    }
    renderHud();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("resize", () => renderer.resize());

function input(): InputState {
  return {
    up: keys.has("w") || keys.has("arrowup"),
    down: keys.has("s") || keys.has("arrowdown"),
    left: keys.has("a") || keys.has("arrowleft"),
    right: keys.has("d") || keys.has("arrowright"),
  };
}

// dev aid: ?overview=1 renders the whole island at a glance (worldgen tuning)
const OVERVIEW_COLORS = ["#22467c", "#4a7dbd", "#e3d29c", "#68a557", "#3e7a40", "#8b8e93", "#e9eef4"];
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
  for (const c of critters) updateCritter(c, dt, map, flora, critterSpecies, player, critterRng);
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
  renderer.draw(camX, camY, { player, flora, critters, critterSpecies }, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
