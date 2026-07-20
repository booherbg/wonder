// The census log: a rolling record of how many of each plant kind lives, so
// the world can show its HISTORY, not just a snapshot — which lineages bloom,
// take over, peak, and die off over island-time. Pure and testable; the
// sparkline drawing lives here too but touches no DOM.

export interface SpeciesTrace {
  id: number;
  counts: number[]; // oldest → newest, at most `cap` samples
  firstTick: number; // sim-tick this kind first showed in the log
  peak: number;
  peakTick: number;
}

const BARS = "▁▂▃▄▅▆▇█";

// average a series down to at most `width` buckets, so a long history still
// fits a short sparkline
export function downsample(counts: readonly number[], width: number): number[] {
  if (counts.length <= width) return [...counts];
  const out: number[] = [];
  const per = counts.length / width;
  for (let i = 0; i < width; i++) {
    const a = Math.floor(i * per);
    const b = Math.max(a + 1, Math.floor((i + 1) * per));
    let s = 0;
    for (let j = a; j < b; j++) s += counts[j];
    out.push(s / (b - a));
  }
  return out;
}

// a sparkline of a series, scaled to its OWN range so the shape (rise, peak,
// decline) reads even for a kind that never dominates the island
export function sparkline(counts: readonly number[], width = 12): string {
  if (counts.length === 0) return "";
  const series = downsample(counts, width);
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  return series
    .map((c) => BARS[Math.min(7, Math.max(0, Math.floor(((c - min) / range) * 7.999)))])
    .join("");
}

// rising, falling, or steady — the recent third against the third before it
export function trend(counts: readonly number[]): "rising" | "falling" | "steady" {
  if (counts.length < 4) return "steady";
  const q = Math.max(1, Math.floor(counts.length / 3));
  const mean = (a: readonly number[]): number =>
    a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
  const recent = mean(counts.slice(-q));
  const earlier = mean(counts.slice(-2 * q, -q));
  if (recent > earlier * 1.15) return "rising";
  if (recent < earlier * 0.85) return "falling";
  return "steady";
}

export class CensusLog {
  private traces = new Map<number, SpeciesTrace>();
  private lastTick = -Infinity;
  private firstTick = NaN;

  constructor(
    private readonly interval = 40, // sim-ticks between samples
    private readonly cap = 100, // samples kept per kind
  ) {}

  reset(): void {
    this.traces.clear();
    this.lastTick = -Infinity;
    this.firstTick = NaN;
  }

  // record a snapshot, but only once every `interval` sim-ticks so a long run
  // stays a bounded history
  sample(tick: number, counts: ReadonlyMap<number, number>): void {
    if (tick - this.lastTick < this.interval) return;
    this.lastTick = tick;
    if (Number.isNaN(this.firstTick)) this.firstTick = tick;
    const live = new Set<number>();
    for (const [id, n] of counts) {
      if (n <= 0) continue;
      live.add(id);
      let tr = this.traces.get(id);
      if (!tr) {
        tr = { id, counts: [], firstTick: tick, peak: 0, peakTick: tick };
        this.traces.set(id, tr);
      }
      this.push(tr, n, tick);
    }
    // a kind absent this sample records a zero, so its decline and death show
    for (const tr of this.traces.values()) {
      if (!live.has(tr.id)) this.push(tr, 0, tick);
    }
    // forget a kind gone the whole window — a clean slate, not a graveyard
    for (const [id, tr] of this.traces) {
      if (tr.counts.every((c) => c === 0)) this.traces.delete(id);
    }
  }

  private push(tr: SpeciesTrace, n: number, tick: number): void {
    tr.counts.push(n);
    if (tr.counts.length > this.cap) tr.counts.shift();
    if (n > tr.peak) {
      tr.peak = n;
      tr.peakTick = tick;
    }
  }

  get started(): boolean {
    return !Number.isNaN(this.firstTick);
  }

  list(): SpeciesTrace[] {
    return [...this.traces.values()];
  }

  trace(id: number): SpeciesTrace | undefined {
    return this.traces.get(id);
  }

  // kinds alive now, kinds that arose since logging began (speciation you
  // witnessed), kinds lost to zero within the window
  summary(): { live: number; arose: number; lost: number } {
    let live = 0;
    let arose = 0;
    let lost = 0;
    for (const tr of this.traces.values()) {
      const last = tr.counts[tr.counts.length - 1] ?? 0;
      if (last > 0) live++;
      else lost++;
      if (tr.firstTick > this.firstTick) arose++;
    }
    return { live, arose, lost };
  }
}
