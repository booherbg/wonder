import { INV_CAP, Seed } from "../game/inventory";
import { Beast, beastSegments } from "../life/beast";
import { CritterMood, CritterSpecies, bestOffering, trustWord } from "../life/fauna";
import { Plant } from "../life/flora";
import { PlantForm, driftDistance } from "../life/genome";
import { PlantSpecies } from "../life/species";
import { Tile } from "../world/types";
import { drawBeast } from "./beastSprite";
import { getCritterSprites } from "./critterSprites";
import { getPlantSprite, PLANT_SPRITE_H, PLANT_SPRITE_W } from "./plantSprites";

const ZOOM = 6;

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

const FORM_WORDS: Record<PlantForm, string> = {
  [PlantForm.Flower]: "flower",
  [PlantForm.Shrub]: "shrub",
  [PlantForm.Tree]: "tree",
  [PlantForm.Fungus]: "fungus",
  [PlantForm.Fern]: "fern",
  [PlantForm.Coral]: "coral",
  [PlantForm.Succulent]: "succulent",
};

// the biome a kind calls home — so you know where to go looking for it
const BIOME_WORDS: Partial<Record<Tile, string>> = {
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

// Every line the camp section speaks, in order: mood, bed, shelter,
// friends. Pure, so a test can read the whole camp at a glance.
export function campLines(camp: CampView): string[] {
  const lines = [campMood(camp.friends)];
  lines.push(
    camp.bed.length === 0
      ? "the bed lies bare — G sows a gathered seed"
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

function panel(): HTMLElement {
  return document.getElementById("inspect")!;
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
  const canvas = document.createElement("canvas");
  canvas.width = PLANT_SPRITE_W * ZOOM;
  canvas.height = PLANT_SPRITE_H * ZOOM;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  const aquatic = sp.habitat === Tile.ShallowWater;
  ctx.drawImage(getPlantSprite(genome, aquatic), 0, 0, canvas.width, canvas.height);
  card.appendChild(canvas);

  const name = document.createElement("div");
  name.className = "inspect-name";
  name.textContent = sp.name;
  card.appendChild(name);

  const traits = document.createElement("div");
  traits.className = "inspect-traits";
  const g = genome;
  const bits = [
    `${heightWord(g.height)} ${FORM_WORDS[g.form]}`,
    g.form === PlantForm.Flower
      ? `${Math.round(g.petals)} petals`
      : g.form === PlantForm.Fungus
        ? `${Math.round(g.petals / 2)} spots`
        : g.form === PlantForm.Fern
          ? `${Math.max(3, Math.round(g.petals * 0.8))} fronds`
          : g.form === PlantForm.Coral
            ? `${Math.max(2, Math.round(g.petals * 0.5))} arms`
            : g.form === PlantForm.Succulent
              ? `${Math.round(g.petals)} fleshy leaves`
              : `${Math.round(g.petals / 2)} berries`,
  ];
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
      const taste = document.createElement("div");
      taste.className = "inspect-traits";
      taste.textContent =
        bond > 0
          ? `eats ${favSp.name} — a taste you've learned`
          : `might fancy ${favSp.name}, of ${BIOME_WORDS[favSp.habitat] ?? "the island"}`;
      card.appendChild(taste);
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
  hint.textContent = "E or Esc to close · F gather · G sow · Q toss a seed";
  el.appendChild(hint);
  el.style.display = "block";
}
