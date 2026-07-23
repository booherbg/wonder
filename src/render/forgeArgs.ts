import { WorldConfig, DEFAULT_CONFIG } from "../world/config";
import { IslandShape, IslandRelief } from "../world/generate";

export interface GenArgs {
  config: WorldConfig;
  shape?: IslandShape;
  relief?: IslandRelief;
  warm: number;
}

export interface ForgeState {
  seed: number;
  shape: IslandShape | "roll";
  relief: IslandRelief | "roll";
  width: number;
  height: number;
  warm: number;
  cfg: Partial<WorldConfig>;
}

// Bounds for each clamped field: [min, max]. Most keys are WorldConfig
// fields; "warm" is the one GenArgs-only exception (ForgeState.warm, not
// part of WorldConfig) — it shares this table so forge.ts's slider and
// forgeArgs()'s clamp read the same bound instead of duplicating it.
export const FORGE_BOUNDS: Record<string, [number, number]> = {
  width: [96, 400],
  height: [96, 400],
  warm: [0, 50000],
  elevationScale: [8, 400],
  elevationOctaves: [1, 8],
  moistureScale: [8, 400],
  moistureOctaves: [1, 8],
  falloffSharpness: [0.1, 20],
  seaLevel: [0, 1],
  shoreLevel: [0, 1],
  beachLevel: [0, 1],
  rockLevel: [0, 1],
  snowLevel: [0, 1],
  forestMoisture: [0, 1],
  marshMoisture: [0, 1],
  riverCount: [0, 24],
  riverMinSpringElevation: [0, 1],
  riverMaxSteps: [100, 6000],
  fallMinDrop: [0, 1],
  fallMaxCount: [0, 40],
  fallMinSpacing: [0, 500],
  craterChance: [0, 1],
  minLandFraction: [0, 0.45],
  minWalkableRegion: [0, 3000],
  maxGenerationAttempts: [1, 24],
};

// Randomize-all's OWN (narrower) sub-ranges for the aesthetic fields it
// rolls — kept separate from FORGE_BOUNDS so the fine-grain fold's manual
// sliders still expose the full range, while a random roll stays viable.
// Measured with a throwaway script (~300 rolls through the same randomize
// logic, straight into generate()): full FORGE_BOUNDS rolled ~83% viable
// islands (generate()'s internal retries absorb some bad luck, but not
// all). The two culprits, both isolated with a grid probe:
//   - forestMoisture near 0 turns essentially all land to Forest, leaving no
//     Grass tile for findSpawn to plant a spawn on (generate.ts:980) — dies
//     below ~0.15, reliable above ~0.2.
//   - falloffSharpness near 0 flattens the radial falloff to ~1 everywhere
//     (d^sharpness → 1), collapsing the island to almost no land at all —
//     only failed at the values that round to exactly 0 (< 0.5).
// Narrowing just those two brought a 300-sample run to ~99.7% viable while
// every other field still rolls across its full FORGE_BOUNDS span. Any field
// not listed here falls back to FORGE_BOUNDS in forgeArgs' randomize loop.
export const RANDOMIZE_RANGES: Partial<Record<string, [number, number]>> = {
  forestMoisture: [0.22, 0.85],
  falloffSharpness: [1, 12],
};

// Integer WorldConfig/ForgeState fields — generate() indexes arrays and runs
// loops with these, so a fractional value (a stray ".7" from a hand-typed
// fine-grain input, or a rounding slip upstream) must never reach it.
// Shared with forge.ts, which also uses this set to decide a field's <input
// step="1"> in the UI.
export const INTEGER_FIELDS = new Set<string>([
  "width", "height",
  "elevationOctaves", "moistureOctaves",
  "riverCount", "riverMaxSteps", "fallMaxCount", "fallMinSpacing",
  "minWalkableRegion", "maxGenerationAttempts",
]);

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clampBound(field: string, v: number): number {
  const bounds = FORGE_BOUNDS[field];
  const clamped = bounds ? clamp(v, bounds[0], bounds[1]) : v;
  return INTEGER_FIELDS.has(field) ? Math.round(clamped) : clamped;
}

export function defaultForgeState(seed: number): ForgeState {
  return {
    seed,
    shape: "roll",
    relief: "roll",
    width: DEFAULT_CONFIG.width,
    height: DEFAULT_CONFIG.height,
    warm: 0,
    cfg: {},
  };
}

export function forgeArgs(state: ForgeState): { seed: number; gen: GenArgs } {
  const cfg: WorldConfig = { ...DEFAULT_CONFIG };
  cfg.width = clampBound("width", state.width);
  cfg.height = clampBound("height", state.height);
  for (const [k, v] of Object.entries(state.cfg)) {
    if (v !== undefined) (cfg as any)[k] = clampBound(k, v as number);
  }
  return {
    seed: state.seed,
    gen: {
      config: cfg,
      shape: state.shape === "roll" ? undefined : state.shape,
      relief: state.relief === "roll" ? undefined : state.relief,
      warm: clampBound("warm", state.warm),
    },
  };
}
