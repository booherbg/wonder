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

// The PRIMARY relationship the web now leads with: a swarm of insects and the
// flowering plant it works. One per host flowering SPECIES — the clouds working
// the same bloom are gathered into one edge, grounded with live counts (the
// insects aloft; the flowering kind's plants on the island now) and coloured by
// the swarm's real adaptation, so it reads at a glance as "this cloud pollinates
// this bloom."
export interface PollinationLink {
  host: PlantSpecies; // the flowering plant the swarm works (drawn as its sprite)
  hostName: string;
  hostCount: number; // plants of this flowering kind on the island now
  swarmCount: number; // clouds working this bloom
  population: number; // insects across those clouds
  colors: string[]; // the swarm's palette — its adaptation, rendered as colour
  matched: boolean; // well-adapted (pollinates, hugs the bloom) vs still ranging (only feeds)
}

export interface WebView {
  island: string;
  score: number;
  word: string; // richnessWord(score)
  spreaders: number; // disperser kinds
  grazers: number;
  kinds: number; // living plant kinds
  pollen: PollinationLink[]; // the PRIMARY layer: swarm ↔ flower, matched-first
  pollenMore: number; // further blooms with swarms beyond the drawn ones
  swarmClouds: number; // total clouds aloft over the island
  bloomsWorked: number; // distinct flowering kinds a swarm is working
  links: WebLink[]; // the SECONDARY byproduct chains — ordered live, then loops, then the rest
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

// a swarm drawn as a node: a small cloud of its own genome colours (so a
// well-adapted cloud shimmers in its flower's palette, a naive one in mint),
// laid out in a deterministic phyllotaxis spray — never a grey particle fog.
function swarmNode(link: PollinationLink): HTMLElement {
  const card = document.createElement("div");
  card.className = "web-node";
  const canvas = document.createElement("canvas");
  const S = 72;
  canvas.width = S;
  canvas.height = S;
  // override the plant-canvas stretch rule with a square, self-standing cloud
  canvas.style.width = "62px";
  canvas.style.height = "62px";
  canvas.style.marginTop = "16px";
  canvas.style.imageRendering = "auto";
  const ctx = canvas.getContext("2d")!;
  const cx = S / 2;
  const cy = S / 2;
  const cols = link.colors.length ? link.colors : ["rgb(127, 224, 196)"];
  const N = 20;
  const golden = Math.PI * (3 - Math.sqrt(5)); // deterministic, no rng
  for (let i = 0; i < N; i++) {
    const r = Math.sqrt((i + 0.5) / N) * (S * 0.42);
    const a = i * golden;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.9;
    ctx.globalAlpha = 0.9 - (i / N) * 0.4;
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1.5, 3.4 - (i / N) * 1.4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  card.appendChild(canvas);
  const name = document.createElement("div");
  name.className = "web-name";
  name.textContent = link.swarmCount > 1 ? `${link.swarmCount} swarms` : "a swarm";
  card.appendChild(name);
  const where = document.createElement("div");
  where.className = "web-where";
  where.textContent = `${link.population} strong · ${link.matched ? "hugs the bloom" : "ranging wide"}`;
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

// a codex section divider — mono, spaced, mint, matching the ledger/menu look
// (inline-styled since the view owns no stylesheet of its own)
function sectionHead(el: HTMLElement, text: string): void {
  const d = document.createElement("div");
  d.style.cssText =
    "font:10px ui-monospace,Menlo,monospace;letter-spacing:0.22em;text-transform:uppercase;" +
    "color:rgb(var(--lumen));opacity:0.72;margin:18px 0 8px;";
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
    "clouds of insects work the island's blooms — drinking nectar, carrying pollen, spreading the very flowers that feed them. beneath, an older weave still turns: a critter's leavings wake another plant, and round it goes.";
  el.appendChild(epigraph);

  noteSection(
    el,
    `${view.word} — score ${view.score} · ${view.kinds} kinds growing · ${view.spreaders} spreaders, ${view.grazers} grazers`,
  );

  // ── the headline: the pollinators and the blooms they work ──────────────────
  sectionHead(el, "the pollinators & their blooms");
  noteSection(
    el,
    view.swarmClouds > 0
      ? `${view.swarmClouds} swarm${view.swarmClouds === 1 ? "" : "s"} aloft, working ${view.bloomsWorked} of the island's flowering kinds`
      : "no swarms aloft yet",
  );
  if (view.pollen.length === 0) {
    const empty = document.createElement("div");
    empty.className = "web-line web-empty";
    empty.textContent =
      "no swarms working the blooms yet — the island's flowers wait for a cloud to find them.";
    el.appendChild(empty);
  }
  for (const link of view.pollen) {
    const row = document.createElement("div");
    // a well-adapted pair is the living headline — lit; a still-ranging cloud
    // only feeds for now, so it reads quieter until it comes to fit the flower
    row.className = link.matched ? "web-chain live" : "web-chain";
    const tag = document.createElement("div");
    tag.className = "web-firing";
    tag.textContent = link.matched ? "● pollinating now" : "○ still adapting";
    row.appendChild(tag);
    const flow = document.createElement("div");
    flow.className = "web-flow";
    flow.appendChild(swarmNode(link));
    flow.appendChild(
      arrow(link.matched ? "pollinates the bloom, spreading its seed" : "feeds on the bloom, drawing near"),
    );
    flow.appendChild(plantNode(link.host, link.hostCount));
    row.appendChild(flow);
    const loop = document.createElement("div");
    loop.className = "web-loop";
    loop.textContent = link.matched
      ? "↺ and the flower's nectar feeds the swarm — a fair trade"
      : "the nectar feeds it a little while it comes to fit the flower";
    row.appendChild(loop);
    el.appendChild(row);
  }
  if (view.pollenMore > 0) {
    noteSection(el, `…and ${view.pollenMore} more blooms carry their own swarms.`);
  }

  // ── demoted: the older byproduct chains, kept but no longer leading ──────────
  sectionHead(el, "and underfoot, the byproduct chains");
  const chains = document.createElement("div");
  chains.style.opacity = "0.82"; // present, but the pollination web is the story now

  if (view.links.length === 0) {
    const empty = document.createElement("div");
    empty.className = "web-line web-empty";
    empty.textContent =
      "no chains yet — a sparse frontier. sow, wait, and watch: a spreader and a byproduct-feeder in the same colour can begin one.";
    chains.appendChild(empty);
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
    chains.appendChild(row);
  }

  if (view.more > 0) {
    noteSection(chains, `…and ${view.more} more chains weave through this island.`);
  }
  el.appendChild(chains);

  const hint = document.createElement("div");
  hint.className = "anth-hint";
  hint.textContent = "C or Esc to close · ● = a pair working right now, go watch it";
  el.appendChild(hint);
  el.style.display = "block";
  el.scrollTop = 0;
}
