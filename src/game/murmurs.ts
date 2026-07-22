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
  | "heights" // rock, scree, cliff and snow at the interior
  | "highland" // gentle alpine turf above the treeline
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
  | "falls" // standing in the mist of a waterfall
  | "aurora" // ribbons of light on the rarest nights
  | "crater" // reaching the caldera lake at the island's heart
  | "confluence" // standing where two rivers become one
  | "rain" // out in a real shower
  | "bloom" // the fungi answering yesterday's rain
  | "swarm" // meeting the insect clouds that work the blooms
  | "skerries" // wandering an archipelago where every islet drifts alone
  | "fire" // the first fire at your own camp
  | "rest" // a bedroll of woven rushes beside the fire
  | "dawn" // waking into first light
  | "tidepool"; // the sea drawn back, its small gardens bared

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
    text: "the mountains are calling and i must go.",
    attribution: "— john muir, letter to his sister (1873)",
    tag: "heights",
  },
  {
    text: "climb the mountains and get their good tidings. nature's peace will flow into you as sunshine flows into trees.",
    attribution: "— john muir, our national parks (1901)",
    tag: "highland",
  },
  {
    text: "going to the mountains is going home; wildness is a necessity.",
    attribution: "— john muir, our national parks (1901)",
    tag: "highland",
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
    text: "animals are such agreeable friends — they ask no questions, they pass no criticisms.",
    attribution: "— george eliot, scenes of clerical life (1857)",
    tag: "critter",
  },
  {
    text: "until one has loved an animal, a part of one's soul remains unawakened.",
    attribution: "— anatole france",
    tag: "critter",
  },
  {
    text: "the ache for home lives in all of us, the safe place where we can go as we are and not be questioned.",
    attribution: "— maya angelou, all god's children need traveling shoes (1986)",
    tag: "home",
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
  {
    text: "and the skies of night were alive with light, with a throbbing thrilling flame.",
    attribution: "— robert service, the ballad of the northern lights (1909)",
    tag: "aurora",
  },
  {
    text: "silently, one by one, in the infinite meadows of heaven, blossomed the lovely stars, the forget-me-nots of the angels.",
    attribution: "— henry wadsworth longfellow, evangeline (1847)",
    tag: "aurora",
  },
  {
    text: "a lake is the landscape's most beautiful and expressive feature. it is earth's eye.",
    attribution: "— henry david thoreau, walden (1854)",
    tag: "crater",
  },
  {
    text: "heaven is under our feet as well as over our heads.",
    attribution: "— henry david thoreau, walden (1854)",
    tag: "crater",
  },
  {
    text: "eventually, all things merge into one, and a river runs through it.",
    attribution: "— norman maclean, a river runs through it (1976)",
    tag: "confluence",
  },
  {
    text: "the river is everywhere at once, at the source and at the mouth, at the waterfall, at the ferry, at the rapids, in the sea, in the mountains, everywhere at once.",
    attribution: "— hermann hesse, siddhartha (1922)",
    tag: "confluence",
  },
  {
    text: "let the rain kiss you. let the rain beat upon your head with silver liquid drops.",
    attribution: "— langston hughes, april rain song (1921)",
    tag: "rain",
  },
  {
    text: "the rain is raining all around, it falls on field and tree.",
    attribution: "— robert louis stevenson, rain (1885)",
    tag: "rain",
  },
  {
    text: "the mushroom is the elf of plants, at evening it is not; at morning in a truffled hut it stops upon a spot.",
    attribution: "— emily dickinson (c. 1874)",
    tag: "bloom",
  },
  {
    text: "i can understand how a flower and a bee might slowly become, either simultaneously or one after the other, modified and adapted in the most perfect manner to each other.",
    attribution: "— charles darwin, on the origin of species (1859)",
    tag: "swarm",
  },
  {
    text: "to the bee, a flower is the fountain of life, and to the flower, a bee is a messenger of love.",
    attribution: "— kahlil gibran, the prophet (1923)",
    tag: "swarm",
  },
  {
    text: "the pedigree of honey does not concern the bee; a clover, any time, to him is aristocracy.",
    attribution: "— emily dickinson (c. 1884)",
    tag: "swarm",
  },
  {
    text: "we seem to be brought somewhat near to that great fact — that mystery of mysteries — the first appearance of new beings on this earth.",
    attribution: "— charles darwin, voyage of the beagle (1839)",
    tag: "skerries",
  },
  {
    text: "the fire is the main comfort of the camp, whether in summer or winter.",
    attribution: "— henry david thoreau, journal (1853)",
    tag: "fire",
  },
  {
    text: "fire is the ultra-living element.",
    attribution: "— gaston bachelard, the psychoanalysis of fire (1938)",
    tag: "fire",
  },
  {
    text: "sleep that knits up the ravell'd sleave of care, the death of each day's life, sore labour's bath.",
    attribution: "— william shakespeare, macbeth (1606)",
    tag: "rest",
  },
  {
    text: "blessings on him who invented sleep, the cloak that covers all human thoughts.",
    attribution: "— miguel de cervantes, don quixote (1615)",
    tag: "rest",
  },
  {
    text: "the woods are lovely, dark and deep, but i have promises to keep, and miles to go before i sleep.",
    attribution: "— robert frost, stopping by woods on a snowy evening (1923)",
    tag: "rest",
  },
  {
    text: "when young dawn with her rose-red fingers shone once more.",
    attribution: "— homer, the odyssey (c. 8th century bce)",
    tag: "dawn",
  },
  {
    text: "i'll tell you how the sun rose, — a ribbon at a time.",
    attribution: "— emily dickinson (c. 1860)",
    tag: "dawn",
  },
  {
    text: "morning is when i am awake and there is a dawn in me. the sun is but a morning star.",
    attribution: "— henry david thoreau, walden (1854)",
    tag: "dawn",
  },
  {
    text: "it is advisable to look from the tide pool to the stars and then back to the tide pool again.",
    attribution: "— john steinbeck, the log from the sea of cortez (1951)",
    tag: "tidepool",
  },
  {
    text: "in every outthrust headland, in every curving beach, in every grain of sand there is the story of the earth.",
    attribution: "— rachel carson, the edge of the sea (1955)",
    tag: "tidepool",
  },
  {
    text: "the tide rises, the tide falls, the twilight darkens, the curlew calls.",
    attribution: "— henry wadsworth longfellow, the tide rises, the tide falls (1879)",
    tag: "tidepool",
  },
];

export const COOLDOWN_MS = 120_000; // at most one murmur every two minutes
const SHOW_MS = 10_000;
export const REHEAR_MS = 48 * 3_600_000; // words heard recently stay unspoken

// The murmur echoes: every murmur the world has ever offered, kept in the
// order of the offering, across every island and every sitting — the
// wandering, retold as an anthology.
export interface AnthologyEntry {
  text: string;
  attribution: string;
  place: string; // the island that offered it
  at: number; // epoch ms
}

export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const ANTHOLOGY_KEY = "wander.anthology";
export const ANTHOLOGY_CAP = 400;

function defaultKV(): KV | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function loadAnthology(kv: KV | null = defaultKV()): AnthologyEntry[] {
  try {
    const raw = kv?.getItem(ANTHOLOGY_KEY);
    const arr = raw ? (JSON.parse(raw) as AnthologyEntry[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function recordInAnthology(
  m: Murmur,
  place: string,
  at: number,
  kv: KV | null = defaultKV(),
): void {
  if (!kv) return;
  try {
    const all = loadAnthology(kv);
    all.push({ text: m.text, attribution: m.attribution, place, at });
    kv.setItem(ANTHOLOGY_KEY, JSON.stringify(all.slice(-ANTHOLOGY_CAP)));
  } catch {
    // storage full or unavailable: the words were still given
  }
}

// ── first meetings, once per island ───────────────────────────────────────────
// The island points at its insect clouds exactly once: the first time a swarm
// drifts within reach on a given island the game offers a cue, and never again
// there — remembered across sittings, so a reload doesn't re-teach what the
// wanderer already knows. Pure KV bookkeeping, unit-testable like the anthology.

export const SWARM_MET_KEY = "wander.swarmMet";
export const SWARM_MET_CAP = 64; // islands remembered; the oldest quietly forgotten

// the islands already introduced, read tolerantly — a corrupt store reads empty
function swarmMetList(kv: KV | null): number[] {
  try {
    const raw = kv?.getItem(SWARM_MET_KEY);
    const arr: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter((s): s is number => typeof s === "number") : [];
  } catch {
    return [];
  }
}

export function swarmMetOn(seed: number, kv: KV | null = defaultKV()): boolean {
  return swarmMetList(kv).includes(seed);
}

export function markSwarmMet(seed: number, kv: KV | null = defaultKV()): void {
  if (!kv) return;
  const list = swarmMetList(kv).filter((s) => s !== seed);
  list.push(seed);
  try {
    kv.setItem(SWARM_MET_KEY, JSON.stringify(list.slice(-SWARM_MET_CAP)));
  } catch {
    // storage full or unavailable: the cue may speak once more next sitting — harmless
  }
}

// Pure selection logic (unit-tested); the DOM display lives in show().
// `firstMeeting` lets a genuinely once-in-a-long-while moment (the island's
// single introduction to its insect clouds) speak through the global cooldown —
// safe from spam because its callers fire at most once per island and the
// shown-set/rehear window still hold; everything else keeps the two-minute quiet.
export function pickMurmur(
  tag: MurmurTag,
  shown: ReadonlySet<string>,
  lastShownAt: number,
  now: number,
  firstMeeting = false,
): Murmur | null {
  if (!firstMeeting && now - lastShownAt < COOLDOWN_MS) return null;
  return MURMURS.find((m) => m.tag === tag && !shown.has(m.text)) ?? null;
}

// While a panel (inspect, journal, anthology, help) is up it owns the screen;
// a murmur must not float over what the wanderer is reading.
function aPanelIsOpen(): boolean {
  if (typeof document === "undefined") return false;
  for (const id of ["inspect", "journal", "anthology", "help", "picker", "menu", "web"]) {
    if (document.getElementById(id)?.style.display === "block") return true;
  }
  return false;
}

export class MurmurEngine {
  private shown = new Set<string>();
  private lastShownAt = -Infinity;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private place = "somewhere";

  // The anthology remembers across sittings: anything heard within
  // REHEAR_MS stays quiet, so reloading never replays the same words.
  constructor(private kv: KV | null = defaultKV()) {
    const cutoff = Date.now() - REHEAR_MS;
    for (const e of loadAnthology(this.kv)) {
      if (e.at > cutoff) this.shown.add(e.text);
    }
  }

  // The island whose name the anthology will remember.
  setPlace(name: string): void {
    this.place = name;
  }

  // Offer a moment; the engine decides whether a murmur surfaces. A first
  // meeting (once per island by construction) may speak through the cooldown.
  offer(tag: MurmurTag, now = performance.now(), firstMeeting = false): void {
    if (aPanelIsOpen()) return; // never float a murmur over a panel being read
    const m = pickMurmur(tag, this.shown, this.lastShownAt, now, firstMeeting);
    if (!m) return;
    this.shown.add(m.text);
    this.lastShownAt = now;
    recordInAnthology(m, this.place, Date.now(), this.kv);
    this.show(m);
  }

  // Called every frame: if a panel is open while a murmur is still floating,
  // retire it at once (offer() blocks new ones, but one already up would
  // otherwise linger over what the wanderer is reading).
  syncPanels(): void {
    if (!aPanelIsOpen()) return;
    const el = typeof document === "undefined" ? null : document.getElementById("murmur");
    if (!el || !el.classList.contains("visible")) return;
    el.classList.remove("visible");
    el.classList.add("hushed");
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  private show(m: Murmur): void {
    const el = typeof document === "undefined" ? null : document.getElementById("murmur");
    if (!el) return;
    el.innerHTML = "";
    const text = document.createElement("div");
    text.textContent = m.text;
    const attr = document.createElement("div");
    attr.className = "murmur-attr";
    attr.textContent = m.attribution;
    el.append(text, attr);
    el.classList.remove("hushed"); // a fresh murmur fades in cleanly again
    el.classList.add("visible");
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = setTimeout(() => el.classList.remove("visible"), SHOW_MS);
  }
}
