import { CritterEntry, JournalEntry, islandCharacter } from "../game/journal";
import { CritterSpecies } from "../life/fauna";
import { hsl } from "../life/genome";
import { PlantSpecies } from "../life/species";
import { IslandShape, SHAPE_PHRASE } from "../world/generate";
import { islandName } from "../world/name";
import { WorldMap } from "../world/types";
import { critterPortrait, getCritterSprites } from "./critterSprites";
import { trustLine } from "./inspect";
import { getPlantSprite, PLANT_SPRITE_H, PLANT_SPRITE_W } from "./plantSprites";

const ZOOM = 4;

function panel(): HTMLElement {
  return document.getElementById("journal")!;
}

export function isJournalOpen(): boolean {
  return panel().style.display === "block";
}

export function closeJournal(): void {
  panel().style.display = "none";
}

// Everything the almanac needs: the island underfoot (always written — the
// place is not a secret) and the pages earned by leaning close, on this
// island and every island before it.
export interface JournalScene {
  entries: JournalEntry[]; // plant pages, every island
  critters: CritterEntry[]; // creature pages, every island
  map: WorldMap; // the island underfoot
  species: PlantSpecies[]; // its living plant kinds, for endemic notes
  critterSpecies: CritterSpecies[]; // its living critter kinds, for fresh sprites
  memories: string[]; // what this island has witnessed
  trust?: ReadonlyMap<number, number>; // this island's bonds, kind by kind
}

function sectionTitle(el: HTMLElement, text: string): void {
  const title = document.createElement("div");
  title.className = "anth-title";
  title.textContent = text;
  el.appendChild(title);
}

// quieter than a section: a place-name, not a chapter
function islandHeader(el: HTMLElement, text: string): void {
  const header = document.createElement("div");
  header.className = "anth-title";
  header.style.opacity = "0.45";
  header.textContent = text;
  el.appendChild(header);
}

function grid(el: HTMLElement): HTMLElement {
  const g = document.createElement("div");
  g.className = "inspect-grid";
  el.appendChild(g);
  return g;
}

function traits(card: HTMLElement, text: string): void {
  const line = document.createElement("div");
  line.className = "inspect-traits";
  line.textContent = text;
  card.appendChild(line);
}

function empty(el: HTMLElement, text: string): void {
  const line = document.createElement("div");
  line.className = "anth-empty";
  line.textContent = text;
  el.appendChild(line);
}

// a plain-spoken fact about the place, set in the journal's small hand
function fact(el: HTMLElement, text: string): void {
  const line = document.createElement("div");
  line.className = "inspect-traits";
  line.style.font = "12px monospace";
  line.textContent = text;
  el.appendChild(line);
}

// remembered things sound like murmurs: italic, a little softer
function memoryLine(el: HTMLElement, text: string): void {
  const line = document.createElement("div");
  line.style.font = "italic 13px Georgia, serif";
  line.style.opacity = "0.7";
  line.style.lineHeight = "1.5";
  line.textContent = text;
  el.appendChild(line);
}

// newest wanderings first, grouped by the island that held them
function byIsland<T extends { island: string; firstMetAt: number }>(list: T[]): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const e of [...list].sort((a, b) => b.firstMetAt - a.firstMetAt)) {
    let l = grouped.get(e.island);
    if (!l) grouped.set(e.island, (l = []));
    l.push(e);
  }
  return grouped;
}

// ── this island ── the place itself: always written, never earned
function renderIsland(el: HTMLElement, scene: JournalScene): void {
  sectionTitle(el, "this island");
  const shape = SHAPE_PHRASE[(scene.map.shape as IslandShape) ?? "highland"];
  const name = document.createElement("div");
  name.className = "inspect-name";
  name.style.font = "13px monospace";
  name.textContent = `${islandName(scene.map.seed)} — ${shape}`;
  el.appendChild(name);
  const character = islandCharacter(scene.map);
  if (character.biomes.length > 0) fact(el, `the land: ${character.biomes.join(" · ")}`);
  if (character.features.length > 0) fact(el, character.features.join(" · "));
  if (scene.memories.length > 0) {
    fact(el, "it remembers:");
    for (const m of scene.memories) memoryLine(el, `— ${m}`);
  } else {
    memoryLine(el, "nothing set down yet — the island is patient.");
  }
}

// ── a creature's page: portrait, disposition, and what watching taught
function critterCard(e: CritterEntry, scene: JournalScene): HTMLElement {
  const card = document.createElement("div");
  card.className = "inspect-card";
  // the island underfoot lends its living sprite; older islands are drawn
  // from the body the page remembers
  const live = e.seed === scene.map.seed ? scene.critterSpecies[e.critterId] : undefined;
  const sprite = live ? getCritterSprites(live).rest : critterPortrait(e);
  const canvas = document.createElement("canvas");
  canvas.width = sprite.width * ZOOM;
  canvas.height = sprite.height * ZOOM;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, 0, 0, canvas.width, canvas.height);
  card.appendChild(canvas);
  const name = document.createElement("div");
  name.className = "inspect-name";
  name.textContent = e.name;
  card.appendChild(name);
  traits(card, e.role === "grazer" ? "grazes — takes a true bite" : "tends — its meals spread seeds");
  traits(card, e.meetings === 1 ? "met once" : `met ${e.meetings} times`);
  // the bond, for the island underfoot: feeding is remembered by kind
  const bond = live ? (scene.trust?.get(e.critterId) ?? 0) : 0;
  if (bond > 0) traits(card, trustLine(bond));
  // learned only by watching — or by hand: the plant pages hold the witness,
  // and a kind you've fed has told you its taste directly
  const shelf = e.role === "grazer" ? "eatenBy" : "spreadBy";
  const seen = scene.entries
    .filter((p) => p.seed === e.seed && p[shelf]?.includes(e.name))
    .map((p) => p.speciesName);
  if (seen.length > 0) {
    traits(card, `${e.role === "grazer" ? "seen grazing" : "seen spreading"} ${seen.join(", ")}`);
  } else if (bond > 0 && live) {
    traits(card, `eats ${scene.species[live.favoriteSpecies].name} — learned from your hand`);
  } else {
    traits(card, "its taste is still a secret — watch it eat");
  }
  return card;
}

// ── a plant's page: sketch, drift, coats, and its witnessed visitors
function plantCard(e: JournalEntry, scene: JournalScene): HTMLElement {
  const card = document.createElement("div");
  card.className = "inspect-card";
  const canvas = document.createElement("canvas");
  canvas.className = "journal-canvas";
  canvas.width = PLANT_SPRITE_W * ZOOM;
  canvas.height = PLANT_SPRITE_H * ZOOM;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(getPlantSprite(e.genome, e.aquatic), 0, 0, canvas.width, canvas.height);
  card.appendChild(canvas);
  const name = document.createElement("div");
  name.className = "inspect-name";
  name.textContent = e.speciesName;
  card.appendChild(name);
  const bits = [
    e.sightings === 1 ? "met once" : `met ${e.sightings} times`,
    e.maxDrift <= 2 ? "always true to its kind" : `seen drifted up to ${Math.round(e.maxDrift)}%`,
  ];
  if (e.seed === scene.map.seed) {
    // only the island underfoot still holds its living species list
    const live = scene.species[Number(e.key.split(":")[1])];
    if (live?.homeland) bits.push("endemic — born only at the earth's eye");
  }
  traits(card, bits.join(" · "));
  // one kind, many coats: the colors this species has been caught wearing
  if (e.varieties && e.varieties.length > 1) {
    traits(card, `one kind, ${e.varieties.length} colors`);
    const row = document.createElement("div");
    row.style.marginTop = "3px";
    for (const v of e.varieties) {
      const swatch = document.createElement("span");
      swatch.style.display = "inline-block";
      swatch.style.width = "10px";
      swatch.style.height = "10px";
      swatch.style.margin = "0 2px";
      swatch.style.borderRadius = "2px";
      swatch.style.border = "1px solid rgba(255,255,255,0.35)";
      const main = hsl(v.hue, v.sat, 0.55);
      const accent = hsl(v.hue2, v.sat, 0.62);
      swatch.style.background = `linear-gradient(135deg, ${main} 0% 62%, ${accent} 62% 100%)`;
      if (v.glow > 0.8) swatch.style.boxShadow = `0 0 5px ${hsl(v.hue, 1, 0.7)}`;
      row.appendChild(swatch);
    }
    card.appendChild(row);
  }
  // only what was truly witnessed — another wanderer's page may differ.
  // mutualists first: most visits help, a few graze.
  if (e.spreadBy && e.spreadBy.length > 0) {
    traits(card, `spread by ${e.spreadBy.join(", ")}`);
  }
  if (e.eatenBy && e.eatenBy.length > 0) {
    traits(card, `grazed by ${e.eatenBy.join(", ")}`);
  }
  return card;
}

// The journal, opened: an almanac of THIS island — its character, the
// creatures met, the growing things sketched — in the order a wanderer
// would ask: where am I, who lives here, what grows.
export function openJournal(scene: JournalScene): void {
  const el = panel();
  el.innerHTML = "";
  sectionTitle(el, "field journal");
  const epigraph = document.createElement("div");
  epigraph.className = "anth-epigraph";
  epigraph.textContent = "a memoir, not a checklist — there is nothing to finish.";
  el.appendChild(epigraph);

  renderIsland(el, scene);

  sectionTitle(el, "creatures you've met");
  if (scene.critters.length === 0) {
    empty(el, "none yet — lean close (E) while a small friend keeps you company.");
  }
  for (const [island, list] of byIsland(scene.critters)) {
    islandHeader(el, island);
    const g = grid(el);
    for (const e of list) g.appendChild(critterCard(e, scene));
  }

  sectionTitle(el, "growing things");
  if (scene.entries.length === 0) {
    empty(el, "no sketches yet — lean close to something (E) and it will draw itself.");
  }
  for (const [island, list] of byIsland(scene.entries)) {
    islandHeader(el, island);
    const g = grid(el);
    for (const e of list) g.appendChild(plantCard(e, scene));
  }

  const hint = document.createElement("div");
  hint.className = "anth-hint";
  hint.textContent = "J or Esc to close";
  el.appendChild(hint);
  el.style.display = "block";
}
