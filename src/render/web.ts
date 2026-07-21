import { CritterSpecies } from "../life/fauna";
import { Genome } from "../life/genome";
import { PlantSpecies } from "../life/species";
import { Tile } from "../world/types";
import { getCritterSprites } from "./critterSprites";
import { BIOME_WORDS } from "./inspect";
import { getPlantSprite, PLANT_SPRITE_H, PLANT_SPRITE_W } from "./plantSprites";

// The living web (W): the chain explorer made to MEAN something. Not a list of
// names — the actual sprites you meet in the world, wired into the loops they
// make: a critter eats a plant and scatters its seed; where it feeds, a
// byproduct lets another plant sprout; that one is eaten in turn, and round it
// goes. Each node says where to find it and how many live here now (so the
// diagram points you back outside); links firing right now are marked (so you
// know where to go and watch a loop close). See it, understand it, find it,
// witness it.

const ZOOM = 3;

// one link of the web, with the species themselves (so we can draw them) and
// the grounding a watcher needs: where each lives, how many, and whether the
// loop is firing right now.
export interface WebLink {
  disperser: CritterSpecies;
  source: PlantSpecies;
  feeder: PlantSpecies;
  sourceCount: number;
  feederCount: number;
  closes: boolean; // the feeder is eaten in turn → the loop closes
  live: boolean; // a byproduct of the source is on the ground this moment
}

export interface WebView {
  island: string;
  score: number;
  word: string; // richnessWord(score)
  spreaders: number; // disperser kinds
  grazers: number;
  kinds: number; // living plant kinds
  links: WebLink[]; // the chains to draw — already ordered: live, then loops, then the rest
  more: number; // further chains beyond the drawn ones, summarised in a line
}

function panel(): HTMLElement {
  return document.getElementById("web")!;
}

export function isWebOpen(): boolean {
  return panel().style.display === "block";
}

export function closeWeb(): void {
  panel().style.display = "none";
}

// where to find a plant: its biome, and how many stand on the island now — so
// the abstract node becomes a place you can walk to
function whereText(sp: PlantSpecies, count: number): string {
  const biome = BIOME_WORDS[sp.habitat] ?? "the island";
  const many = count > 0 ? `${count} here` : "none left now";
  return `${biome} · ${many}`;
}

function plantNode(sp: PlantSpecies, count: number): HTMLElement {
  const card = document.createElement("div");
  card.className = "web-node";
  const canvas = document.createElement("canvas");
  canvas.width = PLANT_SPRITE_W * ZOOM;
  canvas.height = PLANT_SPRITE_H * ZOOM;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(getPlantSprite(sp.archetype as Genome, sp.habitat === Tile.ShallowWater), 0, 0, canvas.width, canvas.height);
  card.appendChild(canvas);
  const name = document.createElement("div");
  name.className = "web-name";
  name.textContent = sp.name;
  card.appendChild(name);
  const where = document.createElement("div");
  where.className = "web-where";
  where.textContent = whereText(sp, count);
  card.appendChild(where);
  return card;
}

function critterNode(sp: CritterSpecies): HTMLElement {
  const card = document.createElement("div");
  card.className = "web-node";
  const sprite = getCritterSprites(sp).rest;
  const canvas = document.createElement("canvas");
  canvas.className = "web-critter";
  canvas.width = sprite.width * ZOOM;
  canvas.height = sprite.height * ZOOM;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, 0, 0, canvas.width, canvas.height);
  card.appendChild(canvas);
  const name = document.createElement("div");
  name.className = "web-name";
  name.textContent = sp.name;
  card.appendChild(name);
  const where = document.createElement("div");
  where.className = "web-where";
  where.textContent = "a spreader";
  card.appendChild(where);
  return card;
}

function arrow(label: string): HTMLElement {
  const a = document.createElement("div");
  a.className = "web-arrow";
  a.innerHTML = `<div class="web-arrow-head">→</div><div class="web-arrow-label">${label}</div>`;
  return a;
}

function noteSection(el: HTMLElement, text: string): void {
  const d = document.createElement("div");
  d.className = "web-line";
  d.textContent = text;
  el.appendChild(d);
}

// The web, opened: a plain-words primer, the island's diversity at a glance,
// then a row per chain — sprite → sprite → sprite, grounded and marked.
export function openWeb(view: WebView): void {
  const el = panel();
  el.innerHTML = "";
  const title = document.createElement("div");
  title.className = "anth-title";
  title.textContent = `the living web of ${view.island}`;
  el.appendChild(title);
  const epigraph = document.createElement("div");
  epigraph.className = "anth-epigraph";
  epigraph.textContent =
    "a critter eats a plant and scatters its seed; where it feeds, a byproduct lets another plant sprout — and that one is eaten in turn. round and round it goes.";
  el.appendChild(epigraph);

  noteSection(
    el,
    `${view.word} — score ${view.score} · ${view.kinds} kinds growing · ${view.spreaders} spreaders, ${view.grazers} grazers`,
  );

  if (view.links.length === 0) {
    const empty = document.createElement("div");
    empty.className = "web-line web-empty";
    empty.textContent =
      "no chains yet — a sparse frontier. sow, wait, and watch: a spreader and a byproduct-feeder in the same colour can begin one.";
    el.appendChild(empty);
  }

  for (const link of view.links) {
    const row = document.createElement("div");
    row.className = link.live ? "web-chain live" : "web-chain";
    if (link.live) {
      const tag = document.createElement("div");
      tag.className = "web-firing";
      tag.textContent = "● firing now";
      row.appendChild(tag);
    }
    const flow = document.createElement("div");
    flow.className = "web-flow";
    // a self-loop — the source plant is its own feeder: the critter farms it into
    // reseeding itself. Draw ONE plant, not the same sprite twice (which reads as
    // a bug), and say what's really happening.
    const selfLoop = link.source.id === link.feeder.id;
    flow.appendChild(critterNode(link.disperser));
    flow.appendChild(arrow("eats it &amp; scatters the seed"));
    flow.appendChild(plantNode(link.source, link.sourceCount));
    if (!selfLoop) {
      flow.appendChild(arrow("its leavings let this sprout"));
      flow.appendChild(plantNode(link.feeder, link.feederCount));
    }
    row.appendChild(flow);
    if (selfLoop) {
      const loop = document.createElement("div");
      loop.className = "web-loop";
      loop.textContent = "↺ its own leavings reseed it — the critter farms it in a loop";
      row.appendChild(loop);
    } else if (link.closes) {
      const loop = document.createElement("div");
      loop.className = "web-loop";
      loop.textContent = "↺ and eaten in turn — the loop closes";
      row.appendChild(loop);
    }
    el.appendChild(row);
  }

  if (view.more > 0) {
    noteSection(el, `…and ${view.more} more chains weave through this island.`);
  }

  const hint = document.createElement("div");
  hint.className = "anth-hint";
  hint.textContent = "C or Esc to close · ● = a chain firing right now, go watch it";
  el.appendChild(hint);
  el.style.display = "block";
  el.scrollTop = 0;
}
