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
  | "marsh"
  | "heights" // rock and snow at the interior
  | "meadow"
  | "still" // standing quietly a while
  | "gather"
  | "sow"
  | "sport" // meeting the island's oddball species
  | "critter"
  | "night"
  | "pocket" // stumbling into a hidden clearing
  | "beast" // first sighting of the island's long quiet one
  | "spring" // warming yourself at a hot spring
  | "tide" // wading a glowing sea on a lucky night
  | "birds" // flushing a flock into the air
  | "home" // founding a garden
  | "speciation" // witnessing a lineage become its own kind
  | "falls"; // standing in the mist of a waterfall

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
    text: "in the woods, we return to reason and faith.",
    attribution: "— ralph waldo emerson, nature (1836)",
    tag: "forest",
  },
  {
    text: "the poetry of earth is never dead.",
    attribution: "— john keats (1816)",
    tag: "island",
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
    text: "in rivers, the water that you touch is the last of what has passed and the first of that which comes.",
    attribution: "— leonardo da vinci, notebooks",
    tag: "water",
  },
  {
    text: "to see a world in a grain of sand, and a heaven in a wild flower.",
    attribution: "— william blake, auguries of innocence (c. 1803)",
    tag: "sand",
  },
  {
    text: "as the marsh-hen secretly builds on the watery sod, behold i will build me a nest on the greatness of god.",
    attribution: "— sidney lanier, the marshes of glynn (1878)",
    tag: "marsh",
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
    text: "to make a prairie it takes a clover and one bee, — one clover, and a bee, and revery.",
    attribution: "— emily dickinson (c. 1875)",
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
    text: "i have great faith in a seed. convince me that you have a seed there, and i am prepared to expect wonders.",
    attribution: "— henry david thoreau, the dispersion of seeds",
    tag: "sow",
  },
  {
    text: "though my soul may set in darkness, it will rise in perfect light; i have loved the stars too fondly to be fearful of the night.",
    attribution: "— sarah williams, the old astronomer (1868)",
    tag: "night",
  },
  {
    text: "with an eye made quiet by the power of harmony, we see into the life of things.",
    attribution: "— william wordsworth, tintern abbey (1798)",
    tag: "still",
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
  {
    text: "the soul should always stand ajar, ready to welcome the ecstatic experience.",
    attribution: "— emily dickinson (c. 1865)",
    tag: "pocket",
  },
  {
    text: "for my part i know nothing with any certainty, but the sight of the stars makes me dream.",
    attribution: "— vincent van gogh, letter to theo (1888)",
    tag: "night",
  },
  {
    text: "we are a way for the cosmos to know itself.",
    attribution: "— carl sagan, cosmos (1980)",
    tag: "night",
  },
  {
    text: "i think i could turn and live with animals, they are so placid and self-contain'd.",
    attribution: "— walt whitman, song of myself (1855)",
    tag: "beast",
  },
  {
    text: "the currents of the universal being circulate through me.",
    attribution: "— ralph waldo emerson, nature (1836)",
    tag: "spring",
  },
  {
    text: "the tide rises, the tide falls, the twilight darkens, the curlew calls.",
    attribution: "— henry wadsworth longfellow (1879)",
    tag: "tide",
  },
  {
    text: "my heart in hiding stirred for a bird, — the achieve of, the mastery of the thing!",
    attribution: "— gerard manley hopkins, the windhover (1877)",
    tag: "birds",
  },
  {
    text: "home is the place where, when you have to go there, they have to take you in.",
    attribution: "— robert frost, the death of the hired man (1914)",
    tag: "home",
  },
  {
    text: "omnia mutantur, nihil interit — everything changes, nothing perishes.",
    attribution: "— ovid, metamorphoses (8 ce)",
    tag: "speciation",
  },
  {
    text: "thus the sum of things is ever being renewed.",
    attribution: "— lucretius, de rerum natura (c. 55 bce)",
    tag: "speciation",
  },
  {
    text: "it is interesting to contemplate a tangled bank, clothed with many plants of many kinds… these elaborately constructed forms have all been produced by laws acting around us.",
    attribution: "— charles darwin, on the origin of species (1859)",
    tag: "speciation",
  },
  {
    text: "this darksome burn, horseback brown, his rollrock highroad roaring down.",
    attribution: "— gerard manley hopkins, inversnaid (1881)",
    tag: "falls",
  },
  {
    text: "its torrent dashes down three thousand feet from high, as if the silver river fell from azure sky.",
    attribution: "— li bai, viewing the waterfall at mount lu (c. 730)",
    tag: "falls",
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
