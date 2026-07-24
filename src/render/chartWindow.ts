// Pure helpers for the ledger's SimCity-style time windows: tick spans →
// sample slices, and absolute tick labels for the chart x-axis.

export type ChartWindowId = "5k" | "10k" | "50k" | "100k" | "all";

export interface ChartWindowOption {
  id: ChartWindowId;
  label: string;
}

export const CHART_WINDOWS: readonly ChartWindowOption[] = [
  { id: "5k", label: "5k" },
  { id: "10k", label: "10k" },
  { id: "50k", label: "50k" },
  { id: "100k", label: "100k" },
  { id: "all", label: "All" },
];

/** Tick span for a chart window, or null for All (use full retained series). */
export function ticksForWindow(id: ChartWindowId): number | null {
  switch (id) {
    case "5k":
      return 5_000;
    case "10k":
      return 10_000;
    case "50k":
      return 50_000;
    case "100k":
      return 100_000;
    case "all":
      return null;
  }
}

/** How many rightmost samples to keep for a window given available length. */
export function samplesForWindow(
  tickSpan: number | null,
  interval: number,
  available: number,
): number {
  if (available <= 0) return 0;
  if (tickSpan === null) return available;
  if (interval <= 0) return available;
  const need = Math.max(1, Math.ceil(tickSpan / interval));
  return Math.min(available, need);
}

export function sliceRight<T>(arr: readonly T[], n: number): T[] {
  if (n <= 0) return [];
  if (arr.length <= n) return [...arr];
  return arr.slice(arr.length - n);
}

/** Sample index i (0 = oldest in the visible ring) → absolute sim tick. */
export function tickAtIndex(
  lastTick: number,
  interval: number,
  length: number,
  i: number,
): number {
  if (length <= 1) return lastTick;
  return lastTick - (length - 1 - i) * interval;
}

export function formatTickLabel(tick: number): string {
  return `tick ${Math.round(tick).toLocaleString("en-US")}`;
}

export interface AxisTick {
  at: number; // 0..1 along the plot width
  label: string;
}

/** Left/right labels; optional midpoint when the span is worth marking. */
export function axisTicks(firstTick: number, lastTick: number, withMid = false): AxisTick[] {
  const out: AxisTick[] = [{ at: 0, label: formatTickLabel(firstTick) }];
  if (withMid && lastTick !== firstTick) {
    out.push({ at: 0.5, label: formatTickLabel((firstTick + lastTick) / 2) });
  }
  out.push({ at: 1, label: formatTickLabel(lastTick) });
  return out;
}
