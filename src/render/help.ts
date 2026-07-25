import { BEDROLL_COST, FIRE_COST } from "../game/materials";
import { formatStamp } from "../version";

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

// the reading behind the game — a living index, opened in a new tab
export const REFERENCES_URL = "https://claude.ai/code/artifact/d256bcb4-2a5f-4f5f-90bc-997c348f68be";

// the welcome line — folded into the guide itself, said every time it opens
export const HELP_WELCOME =
  "welcome. look around — E leans close, space acts (an empty hand gathers), and the beach keeps driftwood for a fire. press ? any time to find this card again.";

export function helpSections(): HelpSection[] {
  return [
    {
      title: "the keys",
      entries: [
        { key: "arrows / wasd", text: "walk" },
        { key: "Tab", text: "menu · backpack, camp, isles, guide" },
        { key: "C", text: "web · chains" },
        { key: "G", text: "ledger · census + web" },
        { key: "O", text: "map" },
        { key: "V", text: "ecology overlay · drives + chain hotspots" },
        { key: "K", text: "minimap on/off" },
        { key: "E", text: "inspect nearby" },
        { key: "Z", text: "zoom 2×" },
        { key: "space", text: "use held tool · hand gathers · hoe tills · pouch plants" },
        { key: "1 2 3", text: "hand · hoe · pouch" },
        { key: "3 again", text: "next seed in pouch" },
        { key: "B", text: "backpack" },
        { key: "Q", text: "drop loaded seed" },
        { key: "H", text: "home / tend camp" },
        { key: "J", text: "journal" },
        { key: "M", text: "murmurs" },
        { key: "L", text: "known isles" },
        { key: "N", text: "name this world" },
        { key: "P", text: "postcard" },
        { key: "R", text: "new island · press twice" },
        { key: "esc", text: "close" },
        { key: "`", text: "debug · seed, biomes, census" },
      ],
    },
    {
      title: "your camp",
      entries: [
        { text: "press H on open ground and home takes shape — a garden bed to tend." },
        {
          text:
            "the island offers what a camp needs: driftwood on the beaches and fallen " +
            "wood in the forest; loose stones on the shore, on the scree, and where " +
            "ground meets rock; soft rushes standing in the marsh. hold the hand and press space to gather each.",
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
        {
          text:
            "hold the hoe (2) and press space on soft ground to work it into a tilled " +
            "bed; then hold the seed pouch (3) and space sows your loaded seed there, " +
            "off its usual habitat. till a patch by your fire, grow a critter's favorite " +
            "food, and a tended plot fills itself in time — coaxing its kind to stay.",
        },
      ],
    },
    {
      title: "the living web",
      entries: [
        { text: "press C to see this island's web drawn out — its creatures and plants, and the chains they make. the short of it:" },
        {
          text:
            "most critters are spreaders: eating a plant, they carry its seed to open ground, so both gain. a few are grazers, and crop what they eat instead. lean close (E) and each tells you which, and what it's after right now.",
        },
        {
          text:
            "where a spreader feeds it leaves a byproduct, and a matching plant can sprout from it — then that one is eaten in turn. that loop is a chain. stand still near a feeding critter and you may witness one close.",
        },
        {
          text:
            "clouds of insects work the blooms too — swarms, each slowly wearing the colour of the flower it feeds on. a cloud that has come to match its bloom pays it back: where it works, that kind thickens and spreads. lean close (E) or click a drifting cloud to meet it by name — and lean the view in (Z) beside one: at a wanderer's distance a cloud is only motes, up close the insects themselves show.",
        },
        {
          text:
            "the courting can start with you: sow a flower where a cloud drifts near, and a swarm may take your planted bloom for its own — feeding there, coming to wear its colour, and spreading the very kind you set down.",
        },
        {
          text:
            "the critters follow simple wants — food by day, their den by dark, a sidle toward you when you hold still. nothing dies here and nothing starves — though unseen beaks do press the insect clouds: a swarm that stands out against its bloom is gently thinned, one that matches it is passed over, and a thinned cloud fills again.",
        },
        {
          text:
            "your camp is a garden bed: till it, load a gathered seed and press space, and if you plant what a critter loves, its kind will settle in near your fire to feed.",
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
    {
      title: "the world-lab",
      entries: [
        {
          text:
            "on the bench: select · place · paint · erase · cloud, brush 1–4, " +
            "wheel pans, ⌃/⌘+wheel zooms, −/+ / 0 fit, space play or drag-pan, " +
            "Esc closes overlays then leaves.",
        },
        {
          text:
            "Build rail: roll + drawer. Read dock: subject · exchange · web · ledger · pressures. " +
            "G opens the ledger tab, W the working view.",
        },
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

// The guide, opened: a welcome line, three small chapters, and a hint home.
export function openHelp(): void {
  const el = panel();
  el.innerHTML = "";
  const title = document.createElement("div");
  title.className = "codex-title";
  title.textContent = "field guide";
  el.appendChild(title);
  const epigraph = document.createElement("div");
  epigraph.className = "anth-epigraph";
  epigraph.textContent = "nothing here is required — all of it can be found by wandering.";
  el.appendChild(epigraph);
  const welcome = document.createElement("div");
  welcome.className = "help-welcome";
  welcome.textContent = HELP_WELCOME;
  el.appendChild(welcome);
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
  // the reading behind the game — the studies and sources it's built on
  const refs = document.createElement("a");
  refs.className = "help-refs";
  refs.href = REFERENCES_URL;
  refs.target = "_blank";
  refs.rel = "noopener noreferrer";
  refs.textContent = "references & study ↗";
  el.appendChild(refs);
  const hint = document.createElement("div");
  hint.className = "anth-hint";
  hint.textContent = "? or Esc to close";
  el.appendChild(hint);
  // the build stamp — which version you're wandering, said quietly at the foot
  const stamp = document.createElement("div");
  stamp.className = "build-stamp";
  stamp.textContent = formatStamp();
  el.appendChild(stamp);
  el.style.display = "block";
  el.scrollTop = 0;
}
