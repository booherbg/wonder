// The A/B toggle for byproduct chains. One key, one resolver — the only new
// "settings" surface. The menu (a separate plan) will later flip the same
// localStorage key. Default ON, so a fresh island grows chains; an explicit
// `?chains=0` (or a stored "0") turns the whole mechanism off wholesale —
// the safety valve, "in case it's a disaster."

export const CHAINS_KEY = "wander.chains";

// Parse a truthy/falsy toggle string. "1"/"true" → true, "0"/"false" → false,
// anything else → null (unset).
function parseToggle(v: string | null): boolean | null {
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return null;
}

// URL param wins, then the stored choice, then the default (on). Pure — the
// caller reads the URL and localStorage and hands the two strings in.
export function resolveChains(param: string | null, stored: string | null): boolean {
  const fromParam = parseToggle(param);
  if (fromParam !== null) return fromParam;
  const fromStored = parseToggle(stored);
  if (fromStored !== null) return fromStored;
  return true;
}

// The last island entered, remembered so the front door can offer "continue".
// Written by main.ts on world entry (never for the title backdrop); read here.
export const LAST_SEED_KEY = "wander.lastSeed";

export function parseLastSeed(stored: string | null): number | null {
  if (stored === null || stored === "") return null;
  const n = Number(stored);
  return Number.isInteger(n) && n >= 0 ? n : null;
}
