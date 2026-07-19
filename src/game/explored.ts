// The fog-of-war map: one bit per tile, inked as the wanderer walks. The
// journal's little woodcut reads it — true colors where you've been, fog
// where you haven't — and each island's ink is kept in one small book, so
// a shore returned to shows exactly as much of itself as it did when you
// left. Cheap on purpose: marking is a handful of bit-sets, and only when
// the wanderer crosses into a new tile; the book is opened only on the
// slow save beat, and only when fresh ground was seen.

import { KV } from "./murmurs";

export const EXPLORED_KEY = "wander.explored";
export const SIGHT = 2; // tiles — how far a passing glance soaks in
export const EXPLORED_BOOK_CAP = 24; // islands remembered; the longest-untouched let go first

function defaultKV(): KV | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

// A blank sheet: every tile still under fog.
export function emptyExplored(width: number, height: number): Uint8Array {
  return new Uint8Array(Math.ceil((width * height) / 8));
}

export function isSeen(seen: Uint8Array, width: number, tx: number, ty: number): boolean {
  const i = ty * width + tx;
  return (seen[i >> 3] & (1 << (i & 7))) !== 0;
}

// Ink the tile underfoot and the small round glance about it. Returns true
// only when fresh ground was seen — the caller's cue that a save is owed.
export function markSeen(
  seen: Uint8Array,
  width: number,
  height: number,
  tx: number,
  ty: number,
): boolean {
  let inked = false;
  for (let dy = -SIGHT; dy <= SIGHT; dy++) {
    for (let dx = -SIGHT; dx <= SIGHT; dx++) {
      if (dx * dx + dy * dy > SIGHT * SIGHT + 1) continue; // a rounded glance, not a square
      const x = tx + dx;
      const y = ty + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const i = y * width + x;
      const bit = 1 << (i & 7);
      if ((seen[i >> 3] & bit) === 0) {
        seen[i >> 3] |= bit;
        inked = true;
      }
    }
  }
  return inked;
}

// How much of the sheet holds ink, 0 all fog .. 1 fully walked.
export function seenFraction(seen: Uint8Array, width: number, height: number): number {
  let n = 0;
  for (let i = 0; i < seen.length; i++) {
    let b = seen[i];
    while (b !== 0) {
      n += b & 1;
      b >>= 1;
    }
  }
  return n / (width * height);
}

// The map on paper: alternating run lengths of fog and ink, base36, dot-
// joined, always beginning with fog (a leading "0" when the first tile is
// inked). A well-walked island compresses to a few hundred runs — a couple
// of kilobytes, never the raw ninety-thousand-bit sheet.
export function encodeExplored(seen: Uint8Array, width: number, height: number): string {
  const n = width * height;
  const runs: string[] = [];
  let bit = 0;
  let run = 0;
  for (let i = 0; i < n; i++) {
    if (((seen[i >> 3] >> (i & 7)) & 1) === bit) {
      run++;
    } else {
      runs.push(run.toString(36));
      bit ^= 1;
      run = 1;
    }
  }
  runs.push(run.toString(36));
  return runs.join(".");
}

// Read a paper map back onto the sheet. Anything torn — bad runs, or a map
// drawn for another size of island — comes back null, and the caller
// simply starts a fresh sheet.
export function decodeExplored(text: string, width: number, height: number): Uint8Array | null {
  const n = width * height;
  const seen = emptyExplored(width, height);
  let i = 0;
  let bit = 0;
  for (const part of text.split(".")) {
    if (!/^[0-9a-z]+$/.test(part)) return null;
    const run = parseInt(part, 36);
    if (i + run > n) return null;
    if (bit === 1) {
      for (let k = i; k < i + run; k++) seen[k >> 3] |= 1 << (k & 7);
    }
    i += run;
    bit ^= 1;
  }
  return i === n ? seen : null;
}

// The ink this island holds, read from the one book — or a fresh sheet.
export function loadExplored(
  seed: number,
  width: number,
  height: number,
  kv: KV | null = defaultKV(),
): Uint8Array {
  try {
    const raw = kv?.getItem(EXPLORED_KEY);
    const book = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const page = book[`${seed}:map`];
    if (typeof page !== "string") return emptyExplored(width, height);
    return decodeExplored(page, width, height) ?? emptyExplored(width, height);
  } catch {
    return emptyExplored(width, height); // unreadable: the island waits under fog again
  }
}

// Write this island's map back without disturbing any other island's.
export function saveExplored(
  seed: number,
  seen: Uint8Array,
  width: number,
  height: number,
  kv: KV | null = defaultKV(),
): void {
  if (!kv) return;
  try {
    const raw = kv.getItem(EXPLORED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    const book: Record<string, string> =
      parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, string>)
        : {};
    const key = `${seed}:map`;
    delete book[key]; // re-set below, so this island moves to the freshest end
    book[key] = encodeExplored(seen, width, height);
    const entries = Object.entries(book).slice(-EXPLORED_BOOK_CAP);
    kv.setItem(EXPLORED_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // storage full or unavailable: the walked map still holds this sitting
  }
}
