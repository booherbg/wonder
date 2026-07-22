import { INV_CAP, Seed } from "../game/inventory";
import type { SwarmInspect } from "../game/swarms";
import { IdMap, MAP_G, appearanceColors } from "../life/idmap";
import { Beast, beastSegments } from "../life/beast";
import { COMPANION_TRUST, CritterMood, CritterRole, CritterSpecies, bestOffering, trustWord } from "../life/fauna";
import { Plant } from "../life/flora";
import { Genome, PlantForm, driftDistance } from "../life/genome";
import { PlantSpecies } from "../life/species";
import { Tile } from "../world/types";
import { drawBeast } from "./beastSprite";
import { getCritterSprites } from "./critterSprites";
import { getInsectSprites } from "./insectSprites";
import { getPlantSprite } from "./plantSprites";

const ZOOM = 6;

// A sprite pressed to its true bounds: the transparent sky above a low moss
// is not part of the specimen. Scans the alpha channel once (sprites are a
// few hundred pixels) and returns a crisp canvas of just the inked rows and
// columns at the given zoom — so no codex card carries a dead band.
function croppedSprite(src: HTMLCanvasElement, zoom: number): HTMLCanvasElement {
  const g = src.getContext("2d")!;
  const data = g.getImageData(0, 0, src.width, src.height).data;
  let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if (data[(y * src.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) { x0 = 0; y0 = 0; x1 = src.width - 1; y1 = src.height - 1; } // a blank sprite keeps its frame
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const out = document.createElement("canvas");
  out.width = w * zoom;
  out.height = h * zoom;
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, x0, y0, w, h, 0, 0, out.width, out.height);
  return out;
}

// One card per species with a count of how many stand nearby.
export interface PlantGroup {
  plant: Plant; // the nearest individual stands for its kind
  nearby: number;
}

// A card's gather button lands here: try to pocket a seed of the group's
// plant. The word that comes back is what the button says next.
export type GatherFromCard = (group: PlantGroup) => "gathered" | "pouch full";

// A critter card's feed button lands here: offer this kind the pouch's
// best-matching seed. The word that comes back is what the button says next.
export type FeedFromCard = (sp: CritterSpecies) => "shared" | "nothing it favors";

// A critter card's take-home button lands here: ask the nearest of this
// kind to walk with you. The word that comes back is what the button says next.
export type AdoptFromCard = (sp: CritterSpecies) => "at your heel" | "none of its kind near";

const FORM_WORDS: Record<PlantForm, string> = {
  [PlantForm.Flower]: "flower",
  [PlantForm.Shrub]: "shrub",
  [PlantForm.Tree]: "tree",
  [PlantForm.Fungus]: "fungus",
  [PlantForm.Fern]: "fern",
  [PlantForm.Coral]: "coral",
  [PlantForm.Succulent]: "succulent",
  [PlantForm.Reed]: "reed",
  [PlantForm.Vine]: "vine",
  [PlantForm.Grass]: "grass",
  [PlantForm.Moss]: "moss",
  [PlantForm.Bulb]: "lantern-bloom",
  [PlantForm.Sporestalk]: "spore-stalk",
  [PlantForm.Kelp]: "kelp",
};

// the countable feature each form wears, matching the sprite's own math
function featureWord(g: Genome): string {
  switch (g.form) {
    case PlantForm.Flower:
      return `${Math.round(g.petals)} petals`;
    case PlantForm.Fungus:
      return `${Math.round(g.petals / 2)} spots`;
    case PlantForm.Fern:
      return `${Math.max(3, Math.round(g.petals * 0.8))} fronds`;
    case PlantForm.Coral:
      return `${Math.max(2, Math.round(g.petals * 0.5))} arms`;
    case PlantForm.Succulent:
      return `${Math.round(g.petals)} fleshy leaves`;
    case PlantForm.Reed: {
      const count = 3 + Math.round(g.spread * 3);
      const heads = Math.max(1, Math.min(count, Math.round(g.petals / 3)));
      return heads === 1 ? "one velvet head" : `${heads} velvet heads`;
    }
    case PlantForm.Vine:
      return `${Math.max(2, Math.round(g.petals / 2) - 1)} trumpet blooms`;
    case PlantForm.Grass:
      return `${5 + Math.round(g.spread * 4)} blades`;
    case PlantForm.Moss: {
      const discs = Math.max(1, Math.round(g.petals / 3));
      return discs === 1 ? "one lichen disc" : `${discs} lichen discs`;
    }
    case PlantForm.Bulb:
      return g.petals >= 8 ? "twin hanging bells" : "one hanging bell";
    case PlantForm.Sporestalk:
      return `${2 + Math.round(g.spread * 2)} spore-orbs`;
    case PlantForm.Kelp:
      return `${2 + (g.spread > 0.55 ? 1 : 0)} ribbons`;
    default:
      return `${Math.round(g.petals / 2)} berries`; // shrubs, and fruit in the trees
  }
}

// the biome a kind calls home — so you know where to go looking for it
export const BIOME_WORDS: Partial<Record<Tile, string>> = {
  [Tile.Sand]: "the beach",
  [Tile.Grass]: "the meadow",
  [Tile.Forest]: "the forest",
  [Tile.Marsh]: "the marsh",
  [Tile.ShallowWater]: "the shallows",
  [Tile.Rock]: "the bare rock",
  [Tile.Snow]: "the snow",
};

// Everything near the wanderer that isn't a plant, a critter, or a seed —
// so leaning close (E) always answers, even on a bare beach at low tide.
export interface Surroundings {
  hour: string; // the sky and sea, right now, in one line
  waterEdge: string[]; // tide pools + dwellers, driftwood, the glowing tide
  land: string[]; // springs, falls, a confluence, the crater, loose stones
}

// ── your camp ───────────────────────────────────────────────────────────
// The wanderer's hearth read at a glance: what the bed grows, what stands
// built, and which kinds have come to live alongside. A cozy status, not a
// management screen — the reader (main) gathers the facts, these helpers
// say them, and openInspect lays the section in when you stand at home.

export interface CampFriend {
  name: string;
  trust: number; // the bond its kind holds, 0..1
}

export interface CampView {
  bed: { name: string; count: number }[]; // what grows in the 3×3 bed, by kind
  fire: boolean;
  bedroll: boolean;
  friends: CampFriend[]; // kinds at least warming, with someone near home now
  companion?: string; // the kind at your heel, named — absent when you walk alone
}

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six"];

// The camp's mood in one line: quiet, a first friend, a hum of company.
export function campMood(friends: readonly CampFriend[]): string {
  if (friends.length === 0) return "quiet still — no one's settled yet";
  if (friends.length === 1) return `${friends[0].name} has made a home here`;
  const n = COUNT_WORDS[friends.length] ?? String(friends.length);
  return `your camp hums — ${n} kinds live alongside you`;
}

// A settled friend said in a line: how near its kind has come to living
// with you, on the same ladder the critter cards speak.
function friendLine(f: CampFriend): string {
  switch (trustWord(f.trust)) {
    case "bonded":
      return `${f.name} — bonded, denned in beside you`;
    case "trusts you":
      return `${f.name} — trusts you, and keeps close`;
    default:
      return `${f.name} — warming, and pottering near`;
  }
}

// Every line the camp section speaks, in order: mood, companion, bed,
// shelter, friends. Pure, so a test can read the whole camp at a glance.
export function campLines(camp: CampView): string[] {
  const lines = [campMood(camp.friends)];
  if (camp.companion) lines.push(`${camp.companion} — your companion, at your heel`);
  lines.push(
    camp.bed.length === 0
      ? "the bed lies bare — hold the pouch and press space to sow"
      : `in the bed: ${camp.bed
          .map((b) => (b.count > 1 ? `${b.name} ×${b.count}` : b.name))
          .join(" · ")}`,
  );
  const built: string[] = [];
  if (camp.fire) built.push("a fire, burning every night");
  if (camp.bedroll) built.push("a bedroll of woven rushes");
  lines.push(
    built.length > 0
      ? built.join(" · ")
      : "open ground yet — driftwood and stone would raise a fire",
  );
  for (const f of camp.friends) lines.push(friendLine(f));
  return lines;
}

// The hour said in a line. Pure and unit-tested; the reader assembles the
// sky/tide/weather state and this names it.
export function hourLine(o: {
  darkness: number;
  tide: number;
  aurora: boolean;
  biolume: boolean;
  bloom: boolean;
  rain: number;
}): string {
  const low = o.tide > 0.7; // beyond TIDE_LOW the flats stand bare
  if (o.darkness > 0.6) {
    if (o.aurora) return "deep night, and an aurora crossing the dark";
    if (o.biolume) return low ? "a glowing low tide under the stars" : "a glowing tide tonight";
    return low ? "a low tide under the stars" : "the deep of night";
  }
  if (o.darkness > 0.12) return "the half-light, between day and dark";
  if (o.rain > 0.25) return "a soft shower passing through";
  if (o.bloom) return "the morning after rain — the fungi answer";
  if (low) return "the sea drawn back — low tide bares its gardens";
  return "broad, quiet daylight";
}

// A gatherable named the island's way, with the pick-up tell the bare beach
// lacked: what it is (and how many), then how to take it — "space to gather" when
// it's within arm's reach, a nudge to step closer when it's only just in view.
// The visible tell that answers "can I pick this up, and how?"
export type Gatherable = "driftwood" | "fallenwood" | "stone" | "rush";

export function gatherableLine(kind: Gatherable, count: number, reachable: boolean): string {
  const many = count > 1 ? ` (${count})` : "";
  const tell = reachable ? "space to gather" : "a step closer to gather";
  switch (kind) {
    case "driftwood":
      return `driftwood, salt-dried${many} — ${tell}`;
    case "fallenwood":
      return `fallen wood, dry${many} — ${tell}`;
    case "stone":
      return `${count > 1 ? `loose stones, sun-warm${many}` : "a loose stone, sun-warm"} — ${tell}`;
    case "rush":
      return `${count > 1 ? `marsh rushes, cut green and soft${many}` : "a marsh rush, cut green and soft"} — ${tell}`;
  }
}

// A plain list of gentle lines under a title — for the things that get a
// word, not a card.
function noteSection(el: HTMLElement, title: string, lines: string[]): void {
  if (lines.length === 0) return;
  sectionTitle(el, title);
  const wrap = document.createElement("div");
  for (const line of lines) {
    const d = document.createElement("div");
    d.className = "inspect-traits";
    d.textContent = line;
    wrap.appendChild(d);
  }
  el.appendChild(wrap);
}

function heightWord(h: number): string {
  if (h < 0.25) return "low";
  if (h < 0.5) return "knee-high";
  if (h < 0.75) return "tall";
  return "towering";
}

// The drive a critter kind is wearing right now, said gently — the visible
// tell for a hidden motive. Falls back to the plant it loves when at ease.
export function moodLine(mood: CritterMood, favorite: string): string {
  switch (mood) {
    case "hungry":
      return `nosing after ${favorite}`;
    case "drowsy":
      return "drowsing toward the den";
    case "weary":
      return "spent, and homeward";
    case "curious":
      return "watching you back";
    case "wary":
      return "keeping its distance";
    case "content":
    default:
      return `at ease among ${favorite}`;
  }
}

// The bond a kind holds toward the wanderer, said the way the card says
// it — the trust ladder (wary → warming → trusts you → bonded) in a line.
export function trustLine(trust: number): string {
  switch (trustWord(trust)) {
    case "bonded":
      return "bonded — it keeps your company";
    case "trusts you":
      return "it trusts you";
    case "warming":
      return "warming to you";
    default:
      return "wary — it doesn't know your hands yet";
  }
}

// The mutualist tell: a spreader plants what it eats — a visit drifts a seed of
// its favorite to open ground, and both gain — while a grazer crops it, the
// thread of friction in an otherwise gentle web. The hidden role made visible,
// and the quiet reason an island's flora leans, over its days, toward what its
// spreaders love.
export function roleLine(role: CritterRole): string {
  return role === "grazer"
    ? "a grazer — it crops what it favors as it feeds"
    : "a spreader — its visits carry a favorite's seed to new ground";
}

// A map rendered to a crisp 7×7 pixel patch as a data URL — the swarm's
// appearance genome, drawn from the same appearanceColors its motes wear. Cells
// in `ring` (the flower-accent jackpots this map has come to match) wear a gold
// frame, so you can watch camouflage land pixel by pixel.
function genomePatch(map: IdMap, ring?: Set<number>): string {
  const cell = 20;
  const c = document.createElement("canvas");
  c.width = MAP_G * cell;
  c.height = MAP_G * cell;
  const g = c.getContext("2d")!;
  const cols = appearanceColors(map);
  for (let y = 0; y < MAP_G; y++) {
    for (let x = 0; x < MAP_G; x++) {
      const i = y * MAP_G + x;
      g.fillStyle = cols[i];
      g.fillRect(x * cell, y * cell, cell - 1, cell - 1);
      if (ring?.has(i)) {
        g.strokeStyle = "rgba(244, 201, 121, 0.95)";
        g.lineWidth = 2;
        g.strokeRect(x * cell + 1, y * cell + 1, cell - 3, cell - 3);
      }
    }
  }
  return c.toDataURL();
}

function pct(v: number): string {
  return Math.round(v * 100) + "%";
}

// The behaviour genes said in words — personality read straight off the cloud's
// motion: how far it roams, how it holds under threat, how tight it flies.
// THE shared gene→word bridge: the world's examine card and the Simulator
// bench both speak these words at these cutoffs, so "a homebody" means the
// same number everywhere a wanderer meets it. One vocabulary, one set of
// thresholds — don't grow a second.
export function behaviourWords(b: { range: number; nerve: number; cohesion: number }): {
  range: string;
  nerve: string;
  cohesion: string;
} {
  return {
    range: b.range < 0.34 ? "a homebody" : b.range > 0.66 ? "a wanderer" : "roams middling",
    nerve: b.nerve < 0.34 ? "skittish" : b.nerve > 0.66 ? "bold" : "steady",
    cohesion: b.cohesion < 0.34 ? "a loose cloud" : b.cohesion > 0.66 ? "a tight cloud" : "an easy cloud",
  };
}

// the world card's one-line reading, built from the very same words
export function behaviourLine(b: { range: number; nerve: number; cohesion: number }): string {
  const w = behaviourWords(b);
  return `${w.range} · ${w.nerve} · ${w.cohesion}`;
}

// One codex card for a swarm — PORTRAIT-FIRST, exactly as the critter cards
// lead with the critter: the representative insect itself, drawn from the very
// sprite the world flies (getInsectSprites of the same sensor + behaviour), at
// codex scale. The raw 7×7 genome grid is demoted to a small labelled inset.
function swarmCard(view: SwarmInspect): HTMLElement {
  const card = document.createElement("div");
  card.className = "inspect-card";
  card.style.width = "150px";

  // the portrait: the very insect flying outside, ~12× the world sprite —
  // square-true and pressed to its inked bounds, never stretched to a plant's frame
  const sprites = getInsectSprites({ sensor: view.sensor, behavior: view.behavior });
  const canvas = croppedSprite(sprites.wingA, 12);
  canvas.style.cssText = "display: block; margin: 0 auto 4px; image-rendering: pixelated;";
  card.appendChild(canvas);

  const name = document.createElement("div");
  name.className = "inspect-name";
  name.textContent = view.name;
  card.appendChild(name);

  const lines = [
    `works ${view.hostName}`,
    `${Math.round(view.population)} aloft`,
    `${pct(view.resemblance)} come to match its flower`,
    behaviourLine(view.behavior),
  ];
  for (const line of lines) {
    const d = document.createElement("div");
    d.className = "inspect-traits";
    d.textContent = line;
    card.appendChild(d);
  }

  // the genome, demoted to a small inset: its map beside its flower's matches
  const ring = new Set<number>();
  for (let i = 0; i < view.sensor.length; i++) {
    if (view.accent[i] && view.sensor[i] === view.flowerMap[i]) ring.add(i);
  }
  const img = document.createElement("img");
  img.src = genomePatch(view.sensor, ring);
  img.style.cssText =
    "width: 56px; height: 56px; image-rendering: pixelated; display: block; margin: 6px auto 2px;" +
    " border-radius: 2px; box-shadow: 0 0 0 1px rgba(127,224,196,0.18);";
  card.appendChild(img);
  const caption = document.createElement("div");
  caption.className = "inspect-traits";
  caption.style.opacity = "0.7";
  caption.textContent = "its map · gold = its flower, matched";
  card.appendChild(caption);
  return card;
}

// The click-to-inspect: a lone swarm's card, opened on its own in the same
// codex plate the lean-in (E) uses.
export function openSwarmCard(view: SwarmInspect): void {
  const el = panel();
  el.innerHTML = "";
  sectionTitle(el, `${view.name}, adrift`);
  const g = grid(el);
  g.appendChild(swarmCard(view));
  const hint = document.createElement("div");
  hint.className = "inspect-hint";
  hint.textContent = "its wings are its map — watch a bug become its flower · Esc to close";
  el.appendChild(hint);
  el.style.display = "block";
  armScrollHint(el);
}

function panel(): HTMLElement {
  return document.getElementById("inspect")!;
}

// The fold made honest: when a card runs taller than its window, a soft
// fade and a quiet "more ↓" sit at the bottom edge until the reader nears
// it — nothing below the fold is a secret anymore.
function armScrollHint(el: HTMLElement): void {
  const hint = document.createElement("div");
  hint.className = "inspect-more";
  hint.textContent = "more ↓";
  el.appendChild(hint);
  const update = (): void => {
    const below = el.scrollHeight - el.clientHeight - el.scrollTop;
    hint.classList.toggle("gone", below < 24);
  };
  el.onscroll = update; // the one panel, re-armed on every open — never a listener pile
  requestAnimationFrame(update); // measured only once layout has settled
}

export function isInspectOpen(): boolean {
  return panel().style.display === "block";
}

export function closeInspect(): void {
  panel().style.display = "none";
}

function sectionTitle(el: HTMLElement, text: string): void {
  const title = document.createElement("div");
  title.className = "inspect-title";
  title.textContent = text;
  el.appendChild(title);
}

function grid(el: HTMLElement): HTMLElement {
  const g = document.createElement("div");
  g.className = "inspect-grid";
  el.appendChild(g);
  return g;
}

function plantCard(
  genome: Plant["genome"],
  sp: PlantSpecies,
  speciesList: PlantSpecies[],
  extras: string[],
): HTMLElement {
  const card = document.createElement("div");
  card.className = "inspect-card";
  const aquatic = sp.habitat === Tile.ShallowWater;
  // the specimen at codex zoom, pressed to its inked bounds — a low moss no
  // longer carries the whole empty sky of a towering tree's frame above it
  card.appendChild(croppedSprite(getPlantSprite(genome, aquatic), ZOOM));

  const name = document.createElement("div");
  name.className = "inspect-name";
  name.textContent = sp.name;
  card.appendChild(name);

  const traits = document.createElement("div");
  traits.className = "inspect-traits";
  const g = genome;
  const bits = [`${heightWord(g.height)} ${FORM_WORDS[g.form]}`, featureWord(g)];
  if (g.glow > 0.8) bits.push("luminous");
  const drift = Math.round(driftDistance(g, sp.archetype) * 100);
  bits.push(drift <= 2 ? "true to its kind" : `drifted ${drift}%`);
  if (sp.parent !== undefined) {
    bits.push(`arose here, from ${speciesList[sp.parent].name}`);
  }
  if (sp.homeland) {
    bits.push("endemic — born only at the earth's eye");
  }
  bits.splice(1, 0, `of ${BIOME_WORDS[sp.habitat] ?? "the island"}`); // where it grows
  bits.push(...extras);
  traits.textContent = bits.join(" · ");
  card.appendChild(traits);
  return card;
}

// A close look at what's here: one card per plant species in reach (with a
// count), the animals keeping you company, and the seeds in your pouch.
export function openInspect(
  groups: PlantGroup[],
  speciesList: PlantSpecies[],
  pouch: Seed[] = [],
  critters: CritterSpecies[] = [],
  beast: Beast | null = null,
  moods: Map<number, CritterMood> = new Map(),
  onGather?: GatherFromCard,
  onFeed?: FeedFromCard,
  trust?: ReadonlyMap<number, number>,
  surroundings?: Surroundings,
  camp?: CampView,
  onAdopt?: AdoptFromCard,
  companion?: number | null,
  swarms: SwarmInspect[] = [],
): void {
  const el = panel();
  el.innerHTML = "";
  if (surroundings) {
    sectionTitle(el, "the hour");
    const line = document.createElement("div");
    line.className = "inspect-traits";
    line.textContent = surroundings.hour;
    el.appendChild(line);
  }
  // standing at your hearth, the camp speaks first — before the wild does
  if (camp) noteSection(el, "your camp", campLines(camp));
  // swarms drifting within reach — the colourful clouds working the blooms.
  // Spoken high on the card, before the plant grid, so the genome + host +
  // population + resemblance + behaviour readout is visible on a normal
  // window instead of clipping away below the fold: a cloud close enough to
  // examine is the rarer meeting, and its appearance is the tell.
  if (swarms.length > 0) {
    sectionTitle(el, swarms.length > 1 ? "swarms adrift here" : "a swarm adrift here");
    const g = grid(el);
    for (const view of swarms) g.appendChild(swarmCard(view));
  }
  sectionTitle(el, groups.length > 0 ? "growing here" : "nothing grows within reach");
  if (groups.length > 0) {
    const g = grid(el);
    // the panel keeps its own pouch count, so a pouch that fills mid-look
    // quiets every remaining button at once
    let pouched = pouch.length;
    const buttons: HTMLButtonElement[] = [];
    const settle = (b: HTMLButtonElement, word: string) => {
      b.textContent = word;
      b.disabled = true;
    };
    for (const group of groups) {
      const sp = speciesList[group.plant.species];
      const extras = group.nearby > 1 ? [`${group.nearby} nearby`] : [];
      const card = plantCard(group.plant.genome, sp, speciesList, extras);
      if (onGather) {
        const btn = document.createElement("button");
        btn.className = "inspect-gather";
        btn.textContent = "gather";
        if (pouched >= INV_CAP) settle(btn, "pouch full");
        btn.addEventListener("click", () => {
          const word = onGather(group);
          settle(btn, word);
          if (word === "gathered" && ++pouched >= INV_CAP) {
            for (const b of buttons) if (!b.disabled) settle(b, "pouch full");
          }
        });
        buttons.push(btn);
        card.appendChild(btn);
      }
      g.appendChild(card);
    }
  }

  if (surroundings) {
    noteSection(el, "at the water's edge", surroundings.waterEdge);
    noteSection(el, "the land", surroundings.land);
  }

  if (critters.length > 0 || beast) {
    sectionTitle(el, "company");
    const g = grid(el);
    for (const sp of critters) {
      const card = document.createElement("div");
      card.className = "inspect-card";
      const sprite = getCritterSprites(sp).rest;
      const canvas = document.createElement("canvas");
      canvas.className = "critter-canvas";
      canvas.width = sprite.width * ZOOM;
      canvas.height = sprite.height * ZOOM;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sprite, 0, 0, canvas.width, canvas.height);
      card.appendChild(canvas);
      const name = document.createElement("div");
      name.className = "inspect-name";
      name.textContent = sp.name;
      card.appendChild(name);
      const traits = document.createElement("div");
      traits.className = "inspect-traits";
      const favSp = speciesList[sp.favoriteSpecies];
      const mood = moods.get(sp.id);
      traits.textContent = mood ? moodLine(mood, favSp.name) : `follows the scent of ${favSp.name}`;
      card.appendChild(traits);
      // the bond, said plainly — and the taste: learned once you've fed
      // it, guessed at (name and where to look) while it's still a hope
      const bond = trust?.get(sp.id) ?? 0;
      const bondEl = document.createElement("div");
      bondEl.className = "inspect-traits";
      bondEl.textContent = trustLine(bond);
      card.appendChild(bondEl);
      // the one who walks with you wears it plainly on its card
      if (sp.id === companion) {
        const mine = document.createElement("div");
        mine.className = "inspect-traits";
        mine.textContent = "your companion — always at your heel";
        card.appendChild(mine);
      }
      const taste = document.createElement("div");
      taste.className = "inspect-traits";
      taste.textContent =
        bond > 0
          ? `eats ${favSp.name} — a taste you've learned`
          : `might fancy ${favSp.name}, of ${BIOME_WORDS[favSp.habitat] ?? "the island"}`;
      card.appendChild(taste);
      // spreader or grazer — the hidden role shown, so you can watch the web
      const role = document.createElement("div");
      role.className = "inspect-traits";
      role.textContent = roleLine(sp.role);
      card.appendChild(role);
      // a pouch that holds something this kind favors earns a feed button —
      // the gather button's quiet look, offering instead of taking
      if (onFeed && bestOffering(sp.palate, pouch) >= 0) {
        const btn = document.createElement("button");
        btn.className = "inspect-gather";
        btn.textContent = "offer a seed";
        btn.addEventListener("click", () => {
          btn.textContent = onFeed(sp);
          btn.disabled = true;
        });
        card.appendChild(btn);
      }
      // a kind that trusts you can be asked home — the feed button's quiet
      // look again, and the coziest ask of all: one companion at a time,
      // padding along at your heel wherever you wander
      if (onAdopt && sp.id !== companion && bond >= COMPANION_TRUST) {
        const btn = document.createElement("button");
        btn.className = "inspect-gather";
        btn.textContent = "take home";
        btn.addEventListener("click", () => {
          btn.textContent = onAdopt(sp);
          btn.disabled = true;
        });
        card.appendChild(btn);
      }
      g.appendChild(card);
    }
    if (beast) {
      const card = document.createElement("div");
      card.className = "inspect-card";
      const canvas = document.createElement("canvas");
      canvas.className = "critter-canvas";
      canvas.width = 56 * 2;
      canvas.height = 32 * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.imageSmoothingEnabled = false;
      ctx.scale(2, 2);
      const head = beastSegments(beast)[0];
      drawBeast(ctx, beast, head.x - 34, head.y - 20);
      card.appendChild(canvas);
      const name = document.createElement("div");
      name.className = "inspect-name";
      name.textContent = beast.name;
      card.appendChild(name);
      const traits = document.createElement("div");
      traits.className = "inspect-traits";
      traits.textContent = "the long quiet one · asks nothing of you";
      card.appendChild(traits);
      g.appendChild(card);
    }
  }

  if (pouch.length > 0) {
    sectionTitle(el, "in your pouch — sown oldest first");
    const g = grid(el);
    for (const seed of pouch) {
      const sp = speciesList[seed.species];
      g.appendChild(plantCard(seed.genome, sp, speciesList, ["a gathered seed"]));
    }
  }

  const hint = document.createElement("div");
  hint.className = "inspect-hint";
  hint.textContent = "E or Esc to close · space gathers · Q tosses a seed";
  el.appendChild(hint);
  el.style.display = "block";
  armScrollHint(el);
}
