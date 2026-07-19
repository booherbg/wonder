import { BEDROLL_COST, FIRE_COST } from "../game/materials";

// The field guide, kept behind ?: the verbs, the way to a camp, and a few
// doors left ajar. A pocket card, not a curriculum — nothing in it is
// required, and everything in it can be met by simply wandering.

export interface HelpEntry {
  key?: string; // when present, rendered as a small key column
  text: string;
}

export interface HelpSection {
  title: string;
  entries: HelpEntry[];
}

// one extra line, spoken only on a wanderer's very first arrival
export const HELP_WELCOME =
  "welcome. look around — E leans close, and the beach keeps driftwood for a fire. press ? any time to find this card again.";

export function helpSections(): HelpSection[] {
  return [
    {
      title: "the keys",
      entries: [
        { key: "arrows / wasd", text: "walk" },
        { key: "E", text: "lean close — what grows and moves nearby shows itself" },
        { key: "Z", text: "lean the view in close — watch the small lives up close" },
        { key: "F", text: "gather what is in reach — driftwood, a stone, a rush, or a seed" },
        { key: "G", text: "sow a seed from your pouch, where the ground suits it" },
        { key: "Q", text: "give a seed back to the wind" },
        { key: "H", text: "make this place home; beside home, H tends the camp" },
        { key: "J", text: "the field journal — it writes itself as you look" },
        { key: "M", text: "the murmurs you have gathered" },
        { key: "L", text: "the isles you've known — click one to sail back" },
        { key: "P", text: "a postcard of the view, saved" },
        { key: "R", text: "sail for a new island — pressed twice; this one keeps" },
        { key: "esc", text: "close any card, this one included" },
        { key: "`", text: "a debug readout — seed, biomes, and the live species census" },
      ],
    },
    {
      title: "your camp",
      entries: [
        { text: "press H on open ground and home takes shape — a garden bed to tend." },
        {
          text:
            "the island offers what a camp needs: driftwood on the beaches at the " +
            "water's edge, loose stones where ground meets rock, soft rushes standing " +
            "in the marsh. F gathers each.",
        },
        {
          text:
            `carry ${FIRE_COST.wood} driftwood and ${FIRE_COST.stone} stones, press H ` +
            "beside home, and a fire ring takes shape — it burns every night.",
        },
        {
          text: `then ${BEDROLL_COST.wood} driftwood and ${BEDROLL_COST.rush} rushes more, and H weaves a bedroll.`,
        },
        {
          text:
            "after dark, H beside the fire sleeps you to dawn. the island lives the " +
            "skipped hours for real — you may wake to something that was not there.",
        },
      ],
    },
    {
      title: "things to seek",
      entries: [
        {
          text:
            "night changes the island — stirred water can glow at the shore, and on " +
            "rare nights ribbons of light cross the sky.",
        },
        {
          text:
            "the sea breathes on its own slow clock; at low water the flats stand " +
            "bare and show their small gardens.",
        },
        {
          text:
            "plants drift from their parents, seed by seed. sow, stay, watch — one " +
            "day a new kind may arise and take a name.",
        },
        { text: "there are more islands than you could ever walk — R sails for a wholly different one." },
        { text: "the rest is not written here." },
      ],
    },
  ];
}

function panel(): HTMLElement {
  return document.getElementById("help")!;
}

export function isHelpOpen(): boolean {
  return panel().style.display === "block";
}

export function closeHelp(): void {
  panel().style.display = "none";
}

// The guide, opened: three small chapters and a hint home. On the very
// first arrival it carries one extra line of welcome.
export function openHelp(firstVisit = false): void {
  const el = panel();
  el.innerHTML = "";
  const title = document.createElement("div");
  title.className = "anth-title";
  title.textContent = "field guide";
  el.appendChild(title);
  const epigraph = document.createElement("div");
  epigraph.className = "anth-epigraph";
  epigraph.textContent = "nothing here is required — all of it can be found by wandering.";
  el.appendChild(epigraph);
  if (firstVisit) {
    const welcome = document.createElement("div");
    welcome.className = "help-welcome";
    welcome.textContent = HELP_WELCOME;
    el.appendChild(welcome);
  }
  for (const section of helpSections()) {
    const header = document.createElement("div");
    header.className = "anth-title";
    header.textContent = section.title;
    el.appendChild(header);
    for (const entry of section.entries) {
      if (entry.key) {
        const row = document.createElement("div");
        row.className = "help-row";
        const key = document.createElement("div");
        key.className = "help-key";
        key.textContent = entry.key;
        const what = document.createElement("div");
        what.className = "help-what";
        what.textContent = entry.text;
        row.append(key, what);
        el.appendChild(row);
      } else {
        const line = document.createElement("div");
        line.className = "help-line";
        line.textContent = entry.text;
        el.appendChild(line);
      }
    }
  }
  const hint = document.createElement("div");
  hint.className = "anth-hint";
  hint.textContent = "? or Esc to close";
  el.appendChild(hint);
  el.style.display = "block";
  el.scrollTop = 0;
}
