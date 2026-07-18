import { Plant } from "../life/flora";
import { PlantForm, driftDistance } from "../life/genome";
import { PlantSpecies } from "../life/species";
import { Tile } from "../world/types";
import { getPlantSprite, PLANT_SPRITE_H, PLANT_SPRITE_W } from "./plantSprites";

const ZOOM = 6;

const FORM_WORDS: Record<PlantForm, string> = {
  [PlantForm.Flower]: "flower",
  [PlantForm.Shrub]: "shrub",
  [PlantForm.Tree]: "tree",
  [PlantForm.Fungus]: "fungus",
  [PlantForm.Fern]: "fern",
};

function heightWord(h: number): string {
  if (h < 0.25) return "low";
  if (h < 0.5) return "knee-high";
  if (h < 0.75) return "tall";
  return "towering";
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

// A close look at the plants at your feet: big pixel-crisp renders plus the
// words for what you're seeing — name, form, traits, and how far this
// individual has drifted from its species' true form.
export function openInspect(plants: Plant[], speciesList: PlantSpecies[]): void {
  const el = panel();
  el.innerHTML = "";
  const title = document.createElement("div");
  title.className = "inspect-title";
  title.textContent =
    plants.length > 0 ? "growing here" : "nothing grows within reach";
  el.appendChild(title);
  const grid = document.createElement("div");
  grid.className = "inspect-grid";
  el.appendChild(grid);
  for (const p of plants) {
    const sp = speciesList[p.species];
    const card = document.createElement("div");
    card.className = "inspect-card";

    const canvas = document.createElement("canvas");
    canvas.width = PLANT_SPRITE_W * ZOOM;
    canvas.height = PLANT_SPRITE_H * ZOOM;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    const aquatic = sp.habitat === Tile.ShallowWater;
    ctx.drawImage(getPlantSprite(p.genome, aquatic), 0, 0, canvas.width, canvas.height);
    card.appendChild(canvas);

    const name = document.createElement("div");
    name.className = "inspect-name";
    name.textContent = sp.name;
    card.appendChild(name);

    const traits = document.createElement("div");
    traits.className = "inspect-traits";
    const g = p.genome;
    const bits = [
      `${heightWord(g.height)} ${FORM_WORDS[g.form]}`,
      g.form === PlantForm.Flower
        ? `${Math.round(g.petals)} petals`
        : g.form === PlantForm.Fungus
          ? `${Math.round(g.petals / 2)} spots`
          : g.form === PlantForm.Fern
            ? `${Math.max(3, Math.round(g.petals * 0.8))} fronds`
            : `${Math.round(g.petals / 2)} berries`,
    ];
    if (g.glow > 0.8) bits.push("luminous");
    const drift = Math.round(driftDistance(g, sp.archetype) * 100);
    bits.push(drift <= 2 ? "true to its kind" : `drifted ${drift}%`);
    if (sp.parent !== undefined) {
      bits.push(`arose here, from ${speciesList[sp.parent].name}`);
    }
    traits.textContent = bits.join(" · ");
    card.appendChild(traits);

    grid.appendChild(card);
  }
  const hint = document.createElement("div");
  hint.className = "inspect-hint";
  hint.textContent = "E or Esc to close · F gather a seed · G sow";
  el.appendChild(hint);
  el.style.display = "block";
}
