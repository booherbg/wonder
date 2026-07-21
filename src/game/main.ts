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
import { CensusLog, SpeciesTrace, sparkline, trend } from "../life/census";
import { Flora, Plant, SUBSTRATE_HUE_MATCH, hueGap, nearestPlant } from "../life/flora";
import { DIVERSITY_FLOOR, SEED_CANDIDATES, chainLinks, chainStats, pickNewSeed, richnessWord } from "../life/foodweb";
import { PlantForm, driftDistance, hsl } from "../life/genome";
import { CHAINS_KEY, resolveChains } from "./flags";
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
import { CampView, Gatherable, campLines, closeInspect, gatherableLine, hourLine, isInspectOpen, openInspect } from "../render/inspect";
import { MenuHandlers, MenuModel, campActionRows, closeMenu, isMenuOpen, openMenu } from "../render/menu";
import { WebLink, WebView, closeWeb, isWebOpen, openWeb } from "../render/web";
import { ChartSeries, ChartsView, closeCharts, isChartsOpen, openCharts } from "../render/charts";
import {
  closePicker,
  featurePhrase,
  isPickerOpen,
  isleRows,
  openPicker,
  setIsleFeature,
} from "../render/picker";
import { DAY_MS, DUSK_MS, NIGHT_MS, darknessAt, isAuroraNight, isBiolumeNight, isBloomDay, msUntilDawn, rainAt } from "./daynight";
import { loadExplored, markSeen, saveExplored } from "./explored";
import {
  Toolbar,
  cycleLoaded,
  cycleSlot,
  emptyToolbar,
  gatherSeed,
  loaded,
  migrate,
  plantLoaded,
  selectSlot,
  takeSeed,
  tossLoaded,
} from "./toolbar";
import { BEDROLL_COST, FIRE_COST, MaterialNode, isTillable, placeMaterials } from "./materials";
import { TIDE_LOW, TidePool, exposureAt, placeTidePools, tideAt } from "./tide";
import { MurmurEngine, loadAnthology } from "./murmurs";
import {
  MAX_SAVED_WORLDS,
  SavedWorld,
  WORLD_INDEX_KEY,
  packWorld,
  restoreCritters,
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

// The byproduct-chains A/B toggle, resolved once at load: ?chains=1/0 wins,
// else the remembered choice, else on. The resolved value is written back so a
// (future) menu and the next load agree. Off ⇒ the sim is byte-identical to
// before this feature — Blaine's safety valve.
const CHAINS = ((): boolean => {
  const param = new URL(location.href).searchParams.get("chains");
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(CHAINS_KEY);
  } catch {
    // storage unavailable: fall back to the param / default
  }
  const on = resolveChains(param, stored);
  try {
    localStorage.setItem(CHAINS_KEY, on ? "1" : "0");
  } catch {
    // storage unavailable: the choice still holds for this sitting
  }
  return on;
})();

// ?frontier: opt into a deliberately-sparse island (no diversity floor) — the
// builder's canvas. Only bends the random new-island roll, nothing else.
const FRONTIER = new URL(location.href).searchParams.has("frontier");

// The seed for a fresh RANDOM island. With chains on this is a search: roll up
// to SEED_CANDIDATES and keep the first clearing the diversity floor, else the
// best seen (frontier bypasses the floor). Explicit ?seed=, the isle picker,
// and saved worlds never pass through here — they load exactly as asked.
function newIslandSeed(): number {
  return CHAINS
    ? pickNewSeed(randomSeed, { floor: DIVERSITY_FLOOR, candidates: SEED_CANDIDATES, frontier: FRONTIER })
    : randomSeed();
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
// this world's identity: a name you gave it, and the real time you've spent here
let worldName: string | null = null;
let worldPlayMs = 0;

const GATHER_RANGE = 24; // px — materials' reach
const PLANT_REACH = 2 * TILE_SIZE; // px — plants forgive a step's distance
const INSPECT_RANGE = 2.5 * TILE_SIZE;

let bar: Toolbar = emptyToolbar();
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

// the two tool glyphs the hotbar draws (the pouch draws a seed dot instead)
const HAND_GLYPH = `<svg class="hb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 11.5V6a1.4 1.4 0 0 1 2.8 0v4.4m0-.4V5a1.4 1.4 0 0 1 2.8 0v5.2m0-.2a1.4 1.4 0 0 1 2.8 0v3.2c0 3.5-2.3 6.1-5.6 6.1-3.3 0-4.9-2-5.3-4.8-.2-1.5-1.5-2.6-1.5-2.6a1.2 1.2 0 0 1 1.8-1.5L8 12.3"/></svg>`;
const HOE_GLYPH = `<svg class="hb-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 15 9"/><path d="M13 5h6v2l-3 3-3-3z"/></svg>`;

// the pouch as a flat seed list — for the save, the inspect gather button, and
// feeding, all of which still reckon in individual seeds
const flatSeeds = (b: Toolbar) =>
  b.bank.flatMap((v) => v.genomes.map((g) => ({ species: v.species, genome: g })));

// what the one Interact key would do right now, given the selected slot
function spaceTell(): string {
  const nb = String.fromCharCode(160);
  if (bar.selected === "hoe") return `<b>space</b>${nb}till`;
  if (bar.selected === "pouch") {
    const v = loaded(bar);
    return v ? `<b>space</b>${nb}plant${nb}${species[v.species].name}` : `<b>space</b>${nb}(pouch${nb}empty)`;
  }
  return `<b>space</b>${nb}gather`;
}

function renderHud(): void {
  const msg = hudMsg ? `<span class="msg">${hudMsg}</span>` : "";
  const nb = String.fromCharCode(160);
  const v = loaded(bar);
  const pouchArt = v
    ? `<span class="hb-dot" style="background:${hsl(v.genomes[0].hue, v.genomes[0].sat, 0.55)}"></span><span class="hb-ct">${v.genomes.length}</span>`
    : `<span class="hb-dot empty"></span>`;
  const slot = (on: boolean, key: string, art: string, name: string) =>
    `<span class="hb-slot${on ? " on" : ""}"><span class="hb-k">${key}</span>${art}<span class="hb-n">${name}</span></span>`;
  const slots =
    slot(bar.selected === "hand", "1", HAND_GLYPH, "hand") +
    slot(bar.selected === "hoe", "2", HOE_GLYPH, "hoe") +
    slot(bar.selected === "pouch", "3", pouchArt, v ? species[v.species].name : "pouch");
  const carry = (["wood", "stone", "rush"] as const)
    .filter((kk) => mat[kk] > 0)
    .map((kk) => `${kk}${nb}<b>${mat[kk]}</b>`)
    .join(`${nb}·${nb}`);
  const carried = carry ? `<span class="hb-carry">${carry}</span>` : "";
  hud.innerHTML =
    `${msg}<span class="hotbar">${slots}${carried}</span>` +
    `<span class="hb-legend">${spaceTell()}${nb}·${nb}E${nb}examine${nb}·${nb}Tab${nb}menu</span>`;
}

// One Interact, resolved by the selected slot: the hoe tills, the pouch plants
// its loaded seed, the bare hand gathers what's in reach.
function interact(): void {
  const px = player.x + 6;
  const py = player.y + 2;
  const tx = Math.floor(px / TILE_SIZE);
  const ty = Math.floor(py / TILE_SIZE);
  if (bar.selected === "hoe") {
    if (flora.hasSoilTile(tx, ty)) {
      flashHud("this ground is already tilled — a seed will take here");
      return;
    }
    if (!isTillable(tileAt(map, tx, ty))) {
      flashHud("too hard to till — grass, marsh, sand, or the forest floor takes a hoe");
      return;
    }
    flora.laySoil(tx, ty);
    flashHud("you work the ground into a bed — tilled now, and any seed will take");
    renderHud();
    persist();
    return;
  }
  if (bar.selected === "pouch") {
    const v = loaded(bar);
    if (!v) {
      flashHud("the pouch is empty — load a seed from your pack (Tab)");
      return;
    }
    const onSoil = flora.hasSoilTile(tx, ty);
    if (!flora.sowableAt(v.species, px, py)) {
      flashHud(
        onSoil
          ? "no room here for it to root"
          : `${species[v.species].name} won't take here — till the ground (hoe), or find its habitat`,
      );
      return;
    }
    const res = plantLoaded(bar);
    if (!res) return;
    const [nextBar, seed] = res;
    if (!flora.sowByPlayer(seed.species, seed.genome, px, py, flora.tick)) {
      flashHud("no room here for it to root");
      return;
    }
    bar = nextBar;
    flashHud(
      onSoil ? `${species[seed.species].name} takes to the tilled soil` : `${species[seed.species].name} takes root`,
    );
    murmurs.offer("sow");
    renderHud();
    persist();
    return;
  }
  gatherInReach();
}

// The bare hand's take: the nearest gatherable in reach — a material node first,
// else the nearest plant, whose seed joins the pouch. (Was the G key.)
function gatherInReach(): void {
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
          ? tileAt(map, node.x, node.y) === Tile.Forest
            ? "fallen wood, dry and light"
            : "driftwood — salt-dried and light"
          : node.kind === "stone"
            ? "a loose stone, sun-warm"
            : "a marsh rush, cut green and soft",
      );
    }
    renderHud();
    persist();
    return;
  }
  const plant = nearestPlant(flora.plantsNear(player.x, player.y, PLANT_REACH), player.x, player.y);
  if (!plant) {
    flashHud("nothing in reach to gather");
    return;
  }
  bar = gatherSeed(bar, plant.species, plant.genome);
  flashHud(`a seed of ${species[plant.species].name}`);
  murmurs.offer("gather");
  renderHud();
  persist();
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

// a stretch of real time in a wanderer's words: "<1m", "42m", "2h 6m"
function fmtDur(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

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

// this island's chain-potential, from the live species — the same measure the
// seed-search uses to pick a viable island, read here so you can see it.
function chainScoreNow(): number {
  const s = chainStats(species, critterSpecies);
  return s.chains + 2 * (s.redundancy - 1);
}

// the food web explained — the insight the observation lab is for. The score
// in a word and a number, how many links close into loops, how much backup
// each source has, a few of the ACTUAL named chains, and what's live right now.
function webLines(): string[] {
  const stats = chainStats(species, critterSpecies);
  const named = chainLinks(species, critterSpecies)
    .slice(0, 3)
    .map((l) => `    ${l.disperser.name} spreads ${l.source.name} → wakes ${l.feeder.name}${l.closes ? " ↺" : ""}`);
  return [
    `web: score ${Math.round(chainScoreNow())} · ${richnessWord(chainScoreNow())}`,
    `  ${stats.chains} links · ${stats.closable} close the loop · ${stats.redundancy.toFixed(1)}× backup per source`,
    ...named,
    `  live: ${flora.substrates.length} substrates · ${flora.germinations} sprouted`,
  ];
}

// ── the island's ledger (G): the census & food-web promoted to real charts ──
// natural terrain colours for the biome-makeup bar
const BIOME_COLOR: Record<number, string> = {
  [Tile.ShallowWater]: "#4f86ad",
  [Tile.Sand]: "#d8c489",
  [Tile.Grass]: "#6f9e4c",
  [Tile.Forest]: "#3f6b3a",
  [Tile.Marsh]: "#7d8a54",
  [Tile.Scree]: "#9c9288",
  [Tile.Highland]: "#aab488",
  [Tile.Rock]: "#7c7671",
  [Tile.Snow]: "#dbe4ea",
};

function biomeMakeup(): { name: string; share: number; color: string }[] {
  const counts = new Map<number, number>();
  for (const t of map.tiles) counts.set(t, (counts.get(t) ?? 0) + 1);
  const shown = [...counts.entries()].filter(([t]) => t !== Tile.DeepWater); // the land's the story
  const total = shown.reduce((s, [, n]) => s + n, 0) || 1;
  return shown
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => ({ name: TILE_WORD[t] ?? String(t), share: n / total, color: BIOME_COLOR[t] ?? "#5a6a72" }));
}

// sum the census traces into an all-plants total over time — right-aligned so
// every kind's newest sample lines up at "now"
function sumTraces(traces: SpeciesTrace[], maxLen: number): number[] {
  const out = new Array(maxLen).fill(0);
  for (const t of traces) {
    const off = maxLen - t.counts.length;
    for (let i = 0; i < t.counts.length; i++) out[off + i] += t.counts[i];
  }
  return out;
}

function padLeft(counts: number[], len: number): number[] {
  return counts.length >= len
    ? counts.slice(counts.length - len)
    : [...new Array(len - counts.length).fill(0), ...counts];
}

function buildChartsView(): ChartsView {
  const traces = census.list();
  const maxLen = Math.max(2, ...traces.map((t) => t.counts.length));
  const series: ChartSeries[] = traces
    .filter((tr) => species[tr.id])
    .sort((a, b) => b.peak - a.peak)
    .slice(0, 7) // the dominant lineages; the tail folds into the total line
    .map((tr) => ({
      id: tr.id,
      name: species[tr.id].name,
      hue: species[tr.id].archetype.hue,
      sat: species[tr.id].archetype.sat,
      counts: padLeft(tr.counts, maxLen),
      peak: tr.peak,
    }));
  const sum = census.summary();
  const stats = chainStats(species, critterSpecies);
  const score = Math.round(stats.chains + 2 * (stats.redundancy - 1));
  const links = chainLinks(species, critterSpecies)
    .slice(0, 5)
    .map((l) => ({
      text: `${l.disperser.name} spreads ${l.source.name} → wakes ${l.feeder.name}`,
      closes: l.closes,
    }));
  return {
    name: worldName ?? "this island",
    timeLabel: `${fmtDur(worldPlayMs)} here`,
    totals: { plants: flora.count, kinds: sum.live, arose: sum.arose, lost: sum.lost },
    richness: { score, word: richnessWord(score) },
    chains: stats,
    links,
    series,
    totalCounts: sumTraces(traces, maxLen),
    biomes: biomeMakeup(),
    substrates: flora.substrates.length,
    germinations: flora.germinations,
  };
}

function openChartsNow(): void {
  closeInspect();
  closeWeb();
  closeMenu();
  openCharts(buildChartsView());
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
    `seed ${currentSeed}    ${worldName ?? islandName(currentSeed)}`,
    `${map.shape ?? "?"} · ${map.relief ?? "?"}    ${map.width}×${map.height}    here ${fmtDur(worldPlayMs)}`,
    `fps ${fpsSmooth.toFixed(0)}    tick ${flora.tick}`,
    `you: ${itx},${ity}  ${TILE_WORD[here] ?? here}  elev ${elev.toFixed(2)}`,
    `biomes: ${devTileComposition()}`,
    floraLine,
    top,
    `critters: ${critters.length} afoot · ${critterSpecies.length} kinds`,
    ...(CHAINS ? webLines() : []),
  ].join("\n");
}

// the seed-label, bottom-left: a given name if you set one, else the island's
// own name and shape — always the seed, always the way to a new world
function renderSeedLabel(): void {
  const shapePhrase = SHAPE_PHRASE[(map.shape as IslandShape) ?? "highland"];
  const identity = worldName ?? `${islandName(currentSeed)} · ${shapePhrase}`;
  // a plain word for how rich the island's web is — so you know, at a glance,
  // whether you sailed somewhere alive or somewhere to build up yourself
  const web = CHAINS ? ` · a ${richnessWord(chainScoreNow())} web` : "";
  seedLabel.textContent = `${identity}${web} · seed ${currentSeed} — R for a new island`;
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
let mat = { wood: 0, stone: 0, rush: 0 }; // materials the wanderer carries (seeds live in the pouch)
let fire = false; // the camp fire, once built
let bedroll = false; // the woven bedroll, once built — sleep skips to dawn
// ms slept forward: the sky's clock runs ahead of the wall's. Dev aids seed it:
// ?sky=<ms> lands the sky at a chosen hour (240000 dusk · 340000 night · 420000
// dawn); ?night is shorthand for the middle of the night.
const skyParam = new URL(location.href).searchParams.get("sky");
let skyOffset =
  skyParam !== null
    ? Number(skyParam) || 0
    : FORCE_NIGHT
      ? DAY_MS + DUSK_MS + NIGHT_MS / 2
      : 0;
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
      { seeds: flatSeeds(bar) },
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
      critters,
      { name: worldName ?? undefined, playMs: Math.round(worldPlayMs), soil: flora.soilTileKeys() },
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
  const floraTuning = {
    chains: CHAINS, // the A/B toggle threads into both new Flora sites below
    ...(new URL(location.href).searchParams.has("split")
      ? { splitCooldownTicks: 30, splitDistance: 0.18, splitClusterMin: 4 }
      : {}),
  };
  const saved = loadSave(seed);
  worldName = saved?.name ?? null;
  worldPlayMs = saved?.playMs ?? 0;
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
      soil: saved.soil,
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
  // the animals, restored where you left them if this world was saved;
  // otherwise spawned fresh from the seed at their dens
  const savedCritters = saved ? restoreCritters(saved, critterSpecies) : [];
  critters = savedCritters.length > 0 ? savedCritters : spawnCritters(critterSpecies, map, seed);
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
  bar = emptyToolbar();
  if (saved) {
    const [px, py] = saved.player;
    if (isWalkable(map, Math.floor(px / TILE_SIZE), Math.floor(py / TILE_SIZE))) {
      player.x = px;
      player.y = py;
    }
    bar = migrate(restoreInventory(saved, species).seeds, {});
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
  renderSeedLabel();
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
  localStorage.setItem("wander.pickerSeen", "1"); // the way back has been found
  persist(); // the island underfoot takes its place in the ledger first
  const index = savedIndex();
  const rows = isleRows(
    index,
    currentSeed,
    Date.now(),
    (s) => loadSave(s)?.savedAt ?? null,
    isleLook,
    (s) => {
      const sv = loadSave(s);
      return { name: sv?.name, playMs: sv?.playMs };
    },
  );
  openPicker(
    rows,
    (seed) => {
      persist();
      loadWorld(seed);
      renderer.setMap(map);
    },
    (seed) => {
      // forget a world: drop its save and its ledger row, then re-open the panel
      localStorage.removeItem(worldKey(seed));
      localStorage.setItem(WORLD_INDEX_KEY, JSON.stringify(savedIndex().filter((s) => s !== seed)));
      openIslePicker();
    },
  );
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
  // gatherables near the wanderer: counted within reach of a lean (E), and
  // marked reachable when a node is within arm's reach of the hand — so
  // the pick-up tell can say "G to gather" truthfully, never a step too soon
  const mats = { driftwood: 0, fallenwood: 0, stone: 0, rush: 0 };
  const matReach = { driftwood: false, fallenwood: false, stone: false, rush: false };
  for (const m of materials) {
    if (taken.has(m.idx)) continue;
    const d = Math.hypot((m.x + 0.5) * TILE_SIZE - player.x, (m.y + 0.5) * TILE_SIZE - player.y);
    if (d >= INSPECT_RANGE) continue;
    // wood reads by where it lies: fallen wood in the forest, driftwood on the shore
    const kind: Gatherable =
      m.kind === "wood" ? (tileAt(map, m.x, m.y) === Tile.Forest ? "fallenwood" : "driftwood") : m.kind;
    mats[kind]++;
    if (d < GATHER_RANGE + 8) matReach[kind] = true;
  }
  if (mats.driftwood > 0) waterEdge.push(gatherableLine("driftwood", mats.driftwood, matReach.driftwood));
  const land: string[] = [];
  const itx = Math.floor(player.x / TILE_SIZE);
  const ity = Math.floor(player.y / TILE_SIZE);
  // the ground itself always answers — even on bare stone there is terrain
  // underfoot, so leaning close (E) is never met with nothing. ground the
  // wanderer has tilled with soil says so, in place of its wild name.
  const aheadTx = Math.floor((player.x + 6) / TILE_SIZE);
  const aheadTy = Math.floor((player.y + 2) / TILE_SIZE);
  if (flora.hasSoilTile(itx, ity)) {
    land.push("worked soil underfoot — tilled, and a loaded seed will take here (space)");
  } else {
    land.push(GROUND_WORDS[tileAt(map, itx, ity)] ?? "open ground underfoot");
    if (flora.hasSoilTile(aheadTx, aheadTy)) land.push("tilled soil just ahead — a loaded seed will take (space)");
    else if (isTillable(tileAt(map, aheadTx, aheadTy))) land.push("soft ground ahead — a hoe would work it into a bed (space)");
  }
  if ((map.springs ?? []).some((s) => Math.hypot(s.x - itx, s.y - ity) < 3))
    land.push("a hot spring, steaming");
  if ((map.falls ?? []).some((f) => Math.hypot(f.x - itx, f.y - ity) < 3))
    land.push("a waterfall, white and loud");
  if ((map.confluences ?? []).some((c) => Math.hypot(c.x - itx, c.y - ity) < 3))
    land.push("a pool where two rivers meet");
  if (map.crater && Math.hypot(map.crater.x - itx, map.crater.y - ity) <= map.crater.lakeRadius + 1)
    land.push("the crater lake — the earth's eye");
  if (mats.fallenwood > 0) land.push(gatherableLine("fallenwood", mats.fallenwood, matReach.fallenwood));
  if (mats.stone > 0) land.push(gatherableLine("stone", mats.stone, matReach.stone));
  if (mats.rush > 0) land.push(gatherableLine("rush", mats.rush, matReach.rush));

  // standing in or beside your home, the camp speaks: what the bed grows,
  // what stands built, and which kinds have come to live alongside you —
  // the same closeness H uses for tending, so looking, building, and the
  // menu all agree (campViewAtHome is shared with the Tab menu)
  const camp: CampView | undefined = campViewAtHome() ?? undefined;

  // each plant card carries a small gather button — the same quiet take
  // as F, for the plant you are already looking at
  openInspect(
    shown,
    species,
    flatSeeds(bar),
    companySpecies,
    beastNear,
    companyMoods,
    (group) => {
      bar = gatherSeed(bar, group.plant.species, group.plant.genome);
      flashHud(`a seed of ${species[group.plant.species].name}`);
      murmurs.offer("gather");
      return "gathered";
    },
    // and each critter card, when the pouch holds a seed its kind favors,
    // carries a feed button: the best-matching seed leaves the pouch, the
    // nearest of the kind comes to eat at your feet, and its whole kind
    // remembers your hands a little longer
    (sp) => {
      const seeds = flatSeeds(bar);
      const offering = bestOffering(sp.palate, seeds);
      if (offering < 0) return "nothing it favors"; // the pouch changed while you looked
      const took = takeSeed(bar, seeds[offering].species);
      if (!took) return "nothing it favors";
      bar = took[0];
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

// explicit ?seed= loads exactly; only a truly fresh arrival is a floored search
loadWorld(seedFromUrl() ?? newIslandSeed());
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
// The camp read as a cozy status — the bed, what's built, who's settled — when
// the wanderer stands within tending reach of home; null otherwise. Shared by
// the inspect panel and the Tab menu so the two can never disagree.
function campViewAtHome(): CampView | null {
  const itx = Math.floor(player.x / TILE_SIZE);
  const ity = Math.floor(player.y / TILE_SIZE);
  if (!home || Math.hypot(home.x - itx, home.y - ity) > 2.5) return null;
  const hx = (home.x + 0.5) * TILE_SIZE;
  const hy = (home.y + 0.5) * TILE_SIZE;
  const bedCounts = new Map<number, number>();
  for (const p of flora.plantsNear(hx, hy, 2 * TILE_SIZE)) {
    if (flora.inGarden(p.x, p.y)) bedCounts.set(p.species, (bedCounts.get(p.species) ?? 0) + 1);
  }
  const bed = [...bedCounts]
    .map(([id, count]) => ({ name: species[id].name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const friends = critterSpecies
    .filter(
      (sp) =>
        (trust.get(sp.id) ?? 0) > 0 &&
        critters.some(
          (c) => c.species === sp.id && Math.hypot(c.x - hx, c.y - hy) < TRUST_LINGER_RADIUS_PX,
        ),
    )
    .map((sp) => ({ name: sp.name, trust: trust.get(sp.id) ?? 0 }));
  return {
    bed,
    fire,
    bedroll,
    friends,
    companion: companionKind !== null ? critterSpecies[companionKind].name : undefined,
  };
}

// Raising the camp: the fire, then the bedroll. Shared by the H key (beside
// home) and the camp menu's action rows, so the two can never disagree on what
// a thing costs or says. Returns whether it was built.
function tryBuildFire(): boolean {
  if (fire) return false;
  if (mat.wood >= FIRE_COST.wood && mat.stone >= FIRE_COST.stone) {
    mat.wood -= FIRE_COST.wood;
    mat.stone -= FIRE_COST.stone;
    fire = true;
    flashHud("a fire ring takes shape — it will burn every night");
    murmurs.offer("fire");
    persist();
    renderHud();
    return true;
  }
  flashHud(
    `a fire wants ${FIRE_COST.wood} driftwood and ${FIRE_COST.stone} stones — you carry ${mat.wood} and ${mat.stone}`,
  );
  return false;
}

function tryBuildBedroll(): boolean {
  if (bedroll) return false;
  if (mat.wood >= BEDROLL_COST.wood && mat.rush >= BEDROLL_COST.rush) {
    mat.wood -= BEDROLL_COST.wood;
    mat.rush -= BEDROLL_COST.rush;
    bedroll = true;
    flashHud("a bedroll of woven rushes — when dark falls, H here carries you to dawn");
    murmurs.offer("rest");
    persist();
    renderHud();
    return true;
  }
  flashHud(
    `a bedroll wants ${BEDROLL_COST.wood} driftwood and ${BEDROLL_COST.rush} marsh rushes — you carry ${mat.wood} and ${mat.rush}`,
  );
  return false;
}

// The occasional actions, extracted so the Tab menu and the direct keys share
// one path. A postcard of the view; a given name for the world; a seed given
// back to the wind.
function savePostcard(): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${islandName(currentSeed).toLowerCase().replace(" ", "-")}-${currentSeed}.png`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  flashHud("postcard saved");
}

function nameWorld(): void {
  const given = window.prompt("name this world", worldName ?? islandName(currentSeed));
  if (given !== null) {
    worldName = given.trim() || null;
    renderSeedLabel();
    persist();
    flashHud(worldName ? `this world is now “${worldName}”` : "the given name is cleared");
  }
}

function tossSeed(): void {
  const v = loaded(bar);
  if (!v) {
    flashHud("the pouch is empty");
  } else {
    const name = species[v.species].name;
    bar = tossLoaded(bar);
    flashHud(`a seed of ${name}, given back to the wind`);
  }
  renderHud();
}

// ── the menu ──────────────────────────────────────────────────────────────
// The Tab menu's model (backpack + camp) and handlers. A launcher row does
// exactly what its shortcut key does; a build row shares the H build path;
// abandon strikes the whole camp, so moving house is a real decision.
function buildMenuModel(): MenuModel {
  const view = campViewAtHome();
  return {
    pouch: bar.bank.map((v) => ({ name: `${species[v.species].name} ×${v.genomes.length}` })),
    mat,
    camp: view
      ? {
          lines: campLines(view),
          actions: campActionRows(mat, fire, bedroll, { fire: FIRE_COST, bedroll: BEDROLL_COST }),
        }
      : undefined,
  };
}

function menuLaunch(key: string): void {
  switch (key) {
    case "C": openWebNow(); break;
    case "L": openIslePicker(); break;
    case "?": openHelp(); break;
    case "M": openAnthology(loadAnthology()); break;
    case "J": openAlmanac(); break;
    case "P": savePostcard(); break;
    case "N": nameWorld(); break;
    case "Q": tossSeed(); break;
  }
}

const menuHandlers: MenuHandlers = {
  launch: (key) => {
    closeMenu();
    menuLaunch(key);
  },
  build: (id) => {
    if (id === "fire") tryBuildFire();
    else tryBuildBedroll();
    if (isMenuOpen()) openMenu(buildMenuModel(), menuHandlers); // refresh the rows in place
  },
  abandon: () => {
    home = null;
    fire = false;
    bedroll = false;
    flora.setHome(null);
    persist();
    renderHud();
    closeMenu();
    flashHud("you strike camp — the ground goes wild again");
  },
};

function openMenuNow(): void {
  closeInspect();
  closeAnthology();
  closeJournal();
  closeHelp();
  closePicker();
  closeWeb();
  openMenu(buildMenuModel(), menuHandlers);
}

// The player's web view: the chains as drawable links — the species themselves,
// grounded with how many live on the island now and whether a byproduct of the
// source is on the ground this moment (so you can go watch the loop close).
// Ordered live-first, then loops, then the rest; capped so the panel reads.
function buildWebView(): WebView {
  const count = (id: number): number => flora.speciesCounts.get(id) ?? 0;
  // A chain is truly firing only where a substrate the FEEDER could actually
  // sprout from lies right now — the germination rule exactly (hue window AND
  // the substrate resting on the feeder's own habitat tile). So "● firing now"
  // never promises a sprout that habitat forbids (a meadow byproduct can't wake
  // a bare-rock feeder where it fell).
  const liveForFeeder = (feeder: PlantSpecies): boolean =>
    flora.substrates.some((s) => {
      const tile = map.tiles[Math.floor(s.y / TILE_SIZE) * map.width + Math.floor(s.x / TILE_SIZE)];
      return feeder.habitat === tile && hueGap(s.hue, feeder.archetype.hue) <= SUBSTRATE_HUE_MATCH;
    });
  const links: WebLink[] = chainLinks(species, critterSpecies).map((l) => ({
    disperser: l.disperser,
    source: l.source,
    feeder: l.feeder,
    sourceCount: count(l.source.id),
    feederCount: count(l.feeder.id),
    closes: l.closes,
    live: liveForFeeder(l.feeder),
  }));
  links.sort((a, b) => Number(b.live) - Number(a.live) || Number(b.closes) - Number(a.closes));
  const CAP = 8;
  const score = Math.round(chainScoreNow());
  return {
    island: worldName ?? islandName(currentSeed),
    score,
    word: richnessWord(score),
    spreaders: critterSpecies.filter((c) => c.role === "disperser").length,
    grazers: critterSpecies.filter((c) => c.role === "grazer").length,
    kinds: [...flora.speciesCounts.values()].filter((n) => n > 0).length,
    links: links.slice(0, CAP),
    more: Math.max(0, links.length - CAP),
  };
}

function openWebNow(): void {
  closeInspect();
  closeAnthology();
  closeJournal();
  closeHelp();
  closePicker();
  closeMenu();
  openWeb(buildWebView());
}

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
      loadWorld(newIslandSeed());
      renderer.setMap(map);
      // until you've opened the ledger once, name the way back at the moment
      // it matters — right after leaving an isle behind
      if (!localStorage.getItem("wander.pickerSeen")) {
        flashHud("press L to sail back to any isle you've known");
      }
    }
  } else if (k === "h") {
    const tx = Math.floor(player.x / TILE_SIZE);
    const ty = Math.floor(player.y / TILE_SIZE);
    const here = tileAt(map, tx, ty);
    const nearHome = home !== null && Math.hypot(home.x - tx, home.y - ty) <= 2.5;
    if (nearHome && !fire) {
      // beside an existing home, H tends the camp: first the fire (same path
      // the camp menu's "make a fire" action takes — one source of truth)
      tryBuildFire();
    } else if (nearHome && !bedroll) {
      // then the bedroll, woven from what the marsh gives
      tryBuildBedroll();
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
      closeMenu();
      closeWeb();
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
      closeMenu();
      closeWeb();
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
      closeMenu();
      closeWeb();
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
      closeMenu();
      closeWeb();
      openHelp();
    }
  } else if (k === "c") {
    // the living web: the chain explorer — see, understand, find, witness it
    if (isWebOpen()) closeWeb();
    else openWebNow();
  } else if (k === "g") {
    // the island's ledger: the census & food-web charts, at a glance
    if (isChartsOpen()) closeCharts();
    else openChartsNow();
  } else if (k === "k") {
    // the corner map, shown or hidden — it remembers your choice
    minimapOn = !minimapOn;
    try {
      localStorage.setItem("wander.minimap", minimapOn ? "1" : "0");
    } catch {
      /* private mode: the choice just holds this sitting */
    }
    flashHud(minimapOn ? "the island map, up in the corner" : "the corner map, tucked away");
  } else if (k === "tab") {
    // the menu: everything that isn't an immediate step, tucked in one place
    e.preventDefault();
    if (isMenuOpen()) closeMenu();
    else openMenuNow();
  } else if (k === "escape") {
    closeInspect();
    closeAnthology();
    closeJournal();
    closeHelp();
    closePicker();
    closeMenu();
    closeWeb();
    closeCharts();
  } else if (k === "p") {
    savePostcard();
  } else if (k === "n") {
    nameWorld();
  } else if (k === "z" && !e.repeat) {
    // the focus lens: kneel in close, watch a pollinator work one flower
    focusOn = !focusOn;
    if (focusOn) flashHud("you lean in close — Z to stand back");
  } else if (k === "e") {
    if (isInspectOpen()) {
      closeInspect();
    } else {
      closeWeb();
      openInspectAtPlayer();
    }
  } else if (k === " ") {
    e.preventDefault(); // space would scroll the page
    interact();
  } else if (k === "1") {
    bar = selectSlot(bar, "hand");
    renderHud();
  } else if (k === "2") {
    bar = selectSlot(bar, "hoe");
    renderHud();
  } else if (k === "3") {
    // 3 picks the pouch; press it again, already on the pouch, to swap varietal
    bar = bar.selected === "pouch" ? cycleLoaded(bar, 1) : selectSlot(bar, "pouch");
    renderHud();
  } else if (k === "[") {
    bar = cycleSlot(bar, -1);
    renderHud();
  } else if (k === "]") {
    bar = cycleSlot(bar, 1);
    renderHud();
  } else if (k === "q") {
    tossSeed();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
// the wheel cycles the hotbar slot — the classic hotbar feel
window.addEventListener(
  "wheel",
  (e) => {
    // let an open card scroll; the wheel only cycles the hotbar out in the world
    if (
      isMenuOpen() || isInspectOpen() || isHelpOpen() || isAnthologyOpen() ||
      isJournalOpen() || isWebOpen() || isPickerOpen()
    )
      return;
    bar = cycleSlot(bar, e.deltaY > 0 ? 1 : -1);
    renderHud();
    e.preventDefault();
  },
  { passive: false },
);
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

// ── the corner minimap ──────────────────────────────────────────────────
// A little island map in the top corner, with a star where your camp stands —
// so the whole shape is always in view and home is always findable. Optional
// (K hides it). The overview inks once to an offscreen canvas per island and
// is just blitted each frame, so it costs almost nothing.
let minimapOn = ((): boolean => {
  try {
    return localStorage.getItem("wander.minimap") !== "0";
  } catch {
    return true;
  }
})();
let minimapCache: HTMLCanvasElement | null = null;
let minimapCacheSeed = NaN;

function buildMinimapCache(): void {
  const c = document.createElement("canvas");
  c.width = map.width;
  c.height = map.height;
  const g = c.getContext("2d")!;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      g.fillStyle = OVERVIEW_COLORS[map.tiles[y * map.width + x]];
      g.fillRect(x, y, 1, 1);
    }
  }
  minimapCache = c;
  minimapCacheSeed = currentSeed;
}

function drawMinimap(): void {
  if (!minimapOn) return;
  if (minimapCacheSeed !== currentSeed || !minimapCache) buildMinimapCache();
  const ctx = canvas.getContext("2d")!;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0); // draw in raw backing pixels, above the scene
  const size = Math.round(Math.min(canvas.width, canvas.height) * 0.2);
  const scale = size / Math.max(map.width, map.height);
  const w = Math.round(map.width * scale);
  const h = Math.round(map.height * scale);
  const pad = Math.round(size * 0.12);
  const x0 = canvas.width - w - pad;
  const y0 = pad;
  ctx.fillStyle = "rgba(6,10,16,0.5)";
  ctx.fillRect(x0 - 4, y0 - 4, w + 8, h + 8);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(minimapCache!, x0, y0, w, h);
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = 1;
  ctx.strokeRect(x0 - 3.5, y0 - 3.5, w + 7, h + 7);
  // you, a small bright dot
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(x0 + (player.x / TILE_SIZE) * scale, y0 + (player.y / TILE_SIZE) * scale, Math.max(2, size * 0.018), 0, Math.PI * 2);
  ctx.fill();
  // basecamp, a star (shadowed so it reads over any terrain)
  if (home) {
    const hx = x0 + (home.x + 0.5) * scale;
    const hy = y0 + (home.y + 0.5) * scale;
    ctx.font = `${Math.round(size * 0.16)}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.85)";
    ctx.fillText("★", hx + 1, hy + 1);
    ctx.fillStyle = "#ffd45e";
    ctx.fillText("★", hx, hy);
  }
  ctx.restore();
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
    // byproduct chains: a sprout risen from a byproduct, witnessed. Standing
    // still near a fresh germination, its page learns that it rose where a
    // disperser had fed — the visible other half of a chain. Always drained
    // (so the list stays small); recorded only when you're actually watching,
    // and only when chains are on. recordSpread self-dedups and no-ops until
    // the kind has a page, so it never spams a stranger onto the shelf.
    if (CHAINS) {
      const germs = flora.takeGerminations();
      if (stillTime >= 1) {
        for (const g of germs) {
          if (Math.hypot(g.x - player.x, g.y - player.y) >= 6 * TILE_SIZE) continue;
          let near: Critter | null = null;
          let nd = Infinity;
          for (const c of critters) {
            if (critterSpecies[c.species].role !== "disperser") continue;
            const d = Math.hypot(c.x - g.x, c.y - g.y);
            if (d < nd) {
              nd = d;
              near = c;
            }
          }
          if (near && nd < 8 * TILE_SIZE) {
            recordSpread(currentSeed, g.species, critterSpecies[near.species].name);
          }
        }
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
  worldPlayMs += dt * 1000; // the real time you've spent in this world
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
  drawMinimap(); // the little island map + basecamp star, over the scene
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
