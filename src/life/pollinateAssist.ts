// Shared pollinator-assist reach/density — the wider, looser pollinateSpread
// primitive ambient-bench pollinators and SwarmLayer both use. Defaults match
// today's hardcoded 6 / 2 so real play stays byte-identical when unset.

export interface PollinateAssist {
  radius: number; // tiles — pollinateSpread drift radius
  maxSame: number; // per-cloud same-species cap on the landing tile
}

export const DEFAULT_POLLINATE_ASSIST: PollinateAssist = { radius: 6, maxSame: 2 };
