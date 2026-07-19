import { Seed } from "../game/inventory";
import { Beast, beastSegments } from "../life/beast";
import { CritterMood, CritterSpecies } from "../life/fauna";
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

const FORM_WORDS: Record<PlantForm, string> = {
  [PlantForm.Flower]: "flower",
  [PlantForm.Shrub]: "shrub",
  [PlantForm.Tree]: "tree",
  [PlantForm.Fungus]: "fungus",
  [PlantForm.Fern]: "fern",
  [PlantForm.Coral]: "coral",
  [PlantForm.Succulent]: "succulent",
};

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
): void {
  const el = panel();
  el.innerHTML = "";
  sectionTitle(el, groups.length > 0 ? "growing here" : "nothing grows within reach");
  if (groups.length > 0) {
    const g = grid(el);
    for (const group of groups) {
      const sp = speciesList[group.plant.species];
      const extras = group.nearby > 1 ? [`${group.nearby} nearby`] : [];
      g.appendChild(plantCard(group.plant.genome, sp, speciesList, extras));
    }
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
      const favorite = speciesList[sp.favoriteSpecies].name;
      const mood = moods.get(sp.id);
      traits.textContent = mood ? moodLine(mood, favorite) : `follows the scent of ${favorite}`;
      card.appendChild(traits);
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
