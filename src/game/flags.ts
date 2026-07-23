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

// Only a plain non-negative decimal integer string is a seed — no exponent
// notation ("1e2"), no hex ("0x2A"), no surrounding whitespace (" 42 "), no
// "-0"; Number() alone accepts all of those, which JSON.stringify(seed)
// never wrote, so anything else is corrupt/foreign storage, not a seed.
const CANONICAL_INT = /^\d+$/;

export function parseLastSeed(stored: string | null): number | null {
  if (stored === null || !CANONICAL_INT.test(stored)) return null;
  const n = Number(stored);
  return n >= 0 ? n : null;
}

// Which bench a ?sim URL asks for. Today's ?sim=1 is the swarm/identity-map
// bench; the World-Lab (slice-1 construct) takes over the default, and the
// swarm bench is preserved behind ?sim=swarm. null ⇒ ordinary play.
export type SimMode = "lab" | "swarm";
export function parseSimMode(search: string): SimMode | null {
  const params = new URLSearchParams(search.startsWith("?") ? search : "?" + search);
  if (!params.has("sim")) return null;
  return params.get("sim") === "swarm" ? "swarm" : "lab";
}
