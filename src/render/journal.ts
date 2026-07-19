import { JournalEntry } from "../game/journal";
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

// The journal, opened: sketches grouped by island, newest wanderings first.
export function openJournal(entries: JournalEntry[]): void {
  const el = panel();
  el.innerHTML = "";
  const title = document.createElement("div");
  title.className = "anth-title";
  title.textContent = "field journal";
  el.appendChild(title);
  const epigraph = document.createElement("div");
  epigraph.className = "anth-epigraph";
  epigraph.textContent = "a memoir, not a checklist — there is nothing to finish.";
  el.appendChild(epigraph);

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "anth-empty";
    empty.textContent = "no sketches yet — lean close to something (E) and it will draw itself.";
    el.appendChild(empty);
  }

  // group by island, most recently met island first
  const byIsland = new Map<string, JournalEntry[]>();
  for (const e of [...entries].sort((a, b) => b.firstMetAt - a.firstMetAt)) {
    let list = byIsland.get(e.island);
    if (!list) byIsland.set(e.island, (list = []));
    list.push(e);
  }
  for (const [island, list] of byIsland) {
    const header = document.createElement("div");
    header.className = "anth-title";
    header.textContent = island;
    el.appendChild(header);
    const grid = document.createElement("div");
    grid.className = "inspect-grid";
    el.appendChild(grid);
    for (const e of list) {
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
      const traits = document.createElement("div");
      traits.className = "inspect-traits";
      const bits = [
        e.sightings === 1 ? "met once" : `met ${e.sightings} times`,
        e.maxDrift <= 2 ? "always true to its kind" : `seen drifted up to ${Math.round(e.maxDrift)}%`,
      ];
      traits.textContent = bits.join(" · ");
      card.appendChild(traits);
      if (e.eatenBy && e.eatenBy.length > 0) {
        // only what was truly witnessed — another wanderer's page may differ
        const grazers = document.createElement("div");
        grazers.className = "inspect-traits";
        grazers.textContent = `grazed by ${e.eatenBy.join(", ")}`;
        card.appendChild(grazers);
      }
      grid.appendChild(card);
    }
  }

  const hint = document.createElement("div");
  hint.className = "anth-hint";
  hint.textContent = "J or Esc to close";
  el.appendChild(hint);
  el.style.display = "block";
}
