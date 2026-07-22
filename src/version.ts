// The build stamp — the short git hash and the commit date, baked in at build
// time by vite.config.ts (via `define`), so the running game can always name
// the exact version you're playing. In dev, or under vitest, the token is
// never substituted; the `typeof` guard reads that as a plain "dev" — nothing
// display-breaks, nothing test-flakes.

// Substituted at build time to an object literal; a bare (undefined) global
// everywhere else. `typeof` keeps the read safe even when it was never defined.
declare const __WONDER_BUILD__: { hash: string; date: string } | undefined;

export interface BuildStamp {
  hash: string; // short git hash, e.g. "a731294" — or "dev" off a build
  date: string; // commit date YYYY-MM-DD, e.g. "2026-07-22" — or "" off a build
}

export function buildStamp(): BuildStamp {
  if (typeof __WONDER_BUILD__ !== "undefined" && __WONDER_BUILD__) {
    return { hash: __WONDER_BUILD__.hash, date: __WONDER_BUILD__.date };
  }
  return { hash: "dev", date: "" };
}

// The stamp as one quiet line — "wonder · <hash> · <date>", the date dropped
// when it's absent. Kept short: it rides the foot of a card, subtly.
export function formatStamp(s: BuildStamp = buildStamp()): string {
  const parts = ["wonder", s.hash];
  if (s.date) parts.push(s.date);
  return parts.join(" · ");
}
