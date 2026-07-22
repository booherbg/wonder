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

// Bounds for each clamped field: [min, max]
export const FORGE_BOUNDS: Record<string, [number, number]> = {
  width: [64, 512],
  height: [64, 512],
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
  riverCount: [0, 40],
  riverMinSpringElevation: [0, 1],
  riverMaxSteps: [100, 10000],
  fallMinDrop: [0, 1],
  fallMaxCount: [0, 40],
  fallMinSpacing: [0, 500],
  craterChance: [0, 1],
  minLandFraction: [0, 1],
  minWalkableRegion: [0, 20000],
  maxGenerationAttempts: [1, 256],
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clampBound(field: string, v: number): number {
  const bounds = FORGE_BOUNDS[field];
  if (bounds) return clamp(v, bounds[0], bounds[1]);
  return v;
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
      warm: clamp(state.warm, 0, 50000),
    },
  };
}
