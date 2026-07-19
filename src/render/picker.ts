import { islandName } from "../world/name";

// The isles you've known: a quiet ledger of the saved islands, one row a
// place, each row a way back. Names and shapes cost nothing — they are
// pure arithmetic on the seed — but a standout feature (a crater lake,
// white water) asks for a full regeneration, so far islands may learn
// theirs a beat after the panel opens; the line simply completes itself.

export interface IsleRow {
  seed: number;
  name: string; // "Toralei Isle"
  shape: string; // "a highland isle"
  feature: string | null; // "a crater lake" — or not yet known
  lastSeen: string; // "you are here now" / "last seen moments ago"
  current: boolean;
}

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

// when you last stood there, in a wanderer's words — never a timestamp
export function agoPhrase(elapsed: number): string {
  if (elapsed < 2 * MIN) return "moments ago";
  if (elapsed < HOUR) return "within the hour";
  if (elapsed < 2 * HOUR) return "an hour ago";
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} hours ago`;
  if (elapsed < 2 * DAY) return "a day ago";
  if (elapsed < 14 * DAY) return `${Math.floor(elapsed / DAY)} days ago`;
  return "long ago";
}

// what a row could name about the land itself — presence is all it reads
export interface IsleFeatures {
  crater?: unknown;
  falls?: readonly unknown[];
  springs?: readonly unknown[];
  confluences?: readonly unknown[];
}

// one standout feature, rarest first — a ledger line, not a survey
export function featurePhrase(m: IsleFeatures): string | null {
  if (m.crater) return "a crater lake";
  if (m.falls && m.falls.length > 0) return m.falls.length > 1 ? "waterfalls" : "a waterfall";
  if (m.springs && m.springs.length > 0) {
    return m.springs.length > 1 ? "warm springs" : "a warm spring";
  }
  if (m.confluences && m.confluences.length > 0) return "a meeting of rivers";
  return null;
}

// the ledger, assembled: index order is the order (latest sailing first)
export function isleRows(
  index: readonly number[],
  currentSeed: number,
  now: number,
  savedAtOf: (seed: number) => number | null,
  lookOf: (seed: number) => { shape: string; feature: string | null },
): IsleRow[] {
  return index.map((seed) => {
    const look = lookOf(seed);
    const savedAt = savedAtOf(seed);
    return {
      seed,
      name: islandName(seed),
      shape: look.shape,
      feature: look.feature,
      current: seed === currentSeed,
      lastSeen:
        seed === currentSeed
          ? "you are here now"
          : savedAt === null
            ? "last seen long ago" // its save has gone; its name remains
            : `last seen ${agoPhrase(now - savedAt)}`,
    };
  });
}

function panel(): HTMLElement {
  return document.getElementById("picker")!;
}

export function isPickerOpen(): boolean {
  return panel().style.display === "block";
}

// rows still waiting on a feature keep a handle to their place line
const placeLines = new Map<number, { el: HTMLElement; row: IsleRow }>();

export function closePicker(): void {
  panel().style.display = "none";
  placeLines.clear();
}

function placeText(row: IsleRow): string {
  const bits = [row.shape];
  if (row.feature) bits.push(row.feature);
  bits.push(`seed ${row.seed}`);
  return bits.join(" · ");
}

// a far island learns its standout feature after the panel is already
// open — its line completes itself in place; nothing moves
export function setIsleFeature(seed: number, feature: string | null): void {
  const kept = placeLines.get(seed);
  if (!kept || feature === null) return;
  kept.row.feature = feature;
  kept.el.textContent = placeText(kept.row);
}

// The ledger, opened: every kept island in the order last walked, the one
// underfoot marked, the rest a click from underfoot again.
export function openPicker(rows: IsleRow[], sail: (seed: number) => void): void {
  const el = panel();
  el.innerHTML = "";
  placeLines.clear();
  const title = document.createElement("div");
  title.className = "anth-title";
  title.textContent = "the isles you've known";
  el.appendChild(title);
  const epigraph = document.createElement("div");
  epigraph.className = "anth-epigraph";
  epigraph.textContent = "every island you leave is kept a while — click one to sail back.";
  el.appendChild(epigraph);
  for (const row of rows) {
    const r = document.createElement("div");
    r.className = row.current ? "isle-row here" : "isle-row";
    const name = document.createElement("div");
    name.className = "isle-name";
    name.textContent = row.name;
    r.appendChild(name);
    const place = document.createElement("div");
    place.className = "isle-place";
    place.textContent = placeText(row);
    r.appendChild(place);
    placeLines.set(row.seed, { el: place, row });
    const when = document.createElement("div");
    when.className = "isle-when";
    when.textContent = row.lastSeen;
    r.appendChild(when);
    if (row.current) {
      // the island underfoot: nothing to sail for, the card simply folds
      r.addEventListener("click", () => closePicker());
    } else {
      r.addEventListener("click", () => {
        closePicker();
        sail(row.seed);
      });
    }
    el.appendChild(r);
  }
  if (rows.length <= 1) {
    const only = document.createElement("div");
    only.className = "anth-empty";
    only.textContent =
      "only this island so far — R sails for another, and each one you leave is kept here.";
    el.appendChild(only);
  }
  const hint = document.createElement("div");
  hint.className = "anth-hint";
  hint.textContent = "L or Esc to close";
  el.appendChild(hint);
  el.style.display = "block";
  el.scrollTop = 0;
}
