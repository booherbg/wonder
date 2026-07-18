// Murmurs: real human words that surface quietly at meaningful moments —
// gathered, not written; what is ours is the choosing and the order.
// (An homage to the murmurs of the entropy game, one workspace over.)

export interface Murmur {
  text: string;
  attribution: string;
  tag: MurmurTag;
}

export type MurmurTag =
  | "island" // a new world
  | "forest"
  | "water" // wading a river or shallows
  | "sand"
  | "heights" // rock and snow at the interior
  | "meadow"
  | "still" // standing quietly a while
  | "gather"
  | "sow"
  | "sport" // meeting the island's oddball species
  | "critter";

export const MURMURS: Murmur[] = [
  {
    text: "in wildness is the preservation of the world.",
    attribution: "— henry david thoreau, walking (1862)",
    tag: "island",
  },
  {
    text: "the sun shines to-day also.",
    attribution: "— ralph waldo emerson, nature (1836)",
    tag: "island",
  },
  {
    text: "when we try to pick out anything by itself, we find it hitched to everything else in the universe.",
    attribution: "— john muir, my first summer in the sierra (1911)",
    tag: "forest",
  },
  {
    text: "the clearest way into the universe is through a forest wilderness.",
    attribution: "— john muir, john of the mountains",
    tag: "forest",
  },
  {
    text: "no man ever steps in the same river twice, for it is not the same river and he is not the same man.",
    attribution: "— heraclitus, fragment (c. 500 bce)",
    tag: "water",
  },
  {
    text: "an old pond — a frog jumps in, the sound of water.",
    attribution: "— matsuo bashō (1686), tr. w. g. aston",
    tag: "water",
  },
  {
    text: "to see a world in a grain of sand, and a heaven in a wild flower.",
    attribution: "— william blake, auguries of innocence (c. 1803)",
    tag: "sand",
  },
  {
    text: "the everlasting universe of things flows through the mind.",
    attribution: "— percy bysshe shelley, mont blanc (1817)",
    tag: "heights",
  },
  {
    text: "i believe a leaf of grass is no less than the journey-work of the stars.",
    attribution: "— walt whitman, song of myself (1855)",
    tag: "meadow",
  },
  {
    text: "glory be to god for dappled things — for skies of couple-colour as a brinded cow.",
    attribution: "— gerard manley hopkins, pied beauty (1877)",
    tag: "meadow",
  },
  {
    text: "come forth into the light of things, let nature be your teacher.",
    attribution: "— william wordsworth, the tables turned (1798)",
    tag: "still",
  },
  {
    text: "nature does not hurry, yet everything is accomplished.",
    attribution: "— attributed to lao tzu",
    tag: "still",
  },
  {
    text: "the force that through the green fuse drives the flower drives my green age.",
    attribution: "— dylan thomas (1933)",
    tag: "gather",
  },
  {
    text: "all the flowers of all the tomorrows are in the seeds of today.",
    attribution: "— proverb",
    tag: "sow",
  },
  {
    text: "from so simple a beginning endless forms most beautiful and most wonderful have been, and are being, evolved.",
    attribution: "— charles darwin, on the origin of species (1859)",
    tag: "sport",
  },
  {
    text: "there is grandeur in this view of life.",
    attribution: "— charles darwin, on the origin of species (1859)",
    tag: "critter",
  },
  {
    text: "life did not take over the world by combat, but by networking.",
    attribution: "— lynn margulis & dorion sagan, microcosmos (1986)",
    tag: "critter",
  },
];

const COOLDOWN_MS = 45_000;
const SHOW_MS = 10_000;

// Pure selection logic (unit-tested); the DOM display lives in show().
export function pickMurmur(
  tag: MurmurTag,
  shown: ReadonlySet<string>,
  lastShownAt: number,
  now: number,
): Murmur | null {
  if (now - lastShownAt < COOLDOWN_MS) return null;
  return MURMURS.find((m) => m.tag === tag && !shown.has(m.text)) ?? null;
}

export class MurmurEngine {
  private shown = new Set<string>();
  private lastShownAt = -Infinity;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  // Offer a moment; the engine decides whether a murmur surfaces.
  offer(tag: MurmurTag, now = performance.now()): void {
    const m = pickMurmur(tag, this.shown, this.lastShownAt, now);
    if (!m) return;
    this.shown.add(m.text);
    this.lastShownAt = now;
    this.show(m);
  }

  private show(m: Murmur): void {
    const el = document.getElementById("murmur");
    if (!el) return;
    el.innerHTML = "";
    const text = document.createElement("div");
    text.textContent = m.text;
    const attr = document.createElement("div");
    attr.className = "murmur-attr";
    attr.textContent = m.attribution;
    el.append(text, attr);
    el.classList.add("visible");
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => el.classList.remove("visible"), SHOW_MS);
  }
}
