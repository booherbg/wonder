// Pure formatting for the backtick debug panel's memory / object stats.
// Heap numbers come from Chromium's non-standard performance.memory when present.

export interface DevPerfSnapshot {
  plants: number;
  maxPlants: number;
  plantKindsLive: number;
  plantSpeciesDefs: number;
  critters: number;
  critterKinds: number;
  swarms: number;
  swarmMotes: number;
  flockBirds: number;
  flocks: number;
  censusTraces: number;
  censusSamples: number;
  mapTiles: number;
  plantSprites: number;
  plantSpriteCap: number;
  insectSpriteSets: number;
  insectSpriteCap: number;
  critterSpriteSets: number;
  critterSpriteCap: number;
  heapUsedMb?: number;
  heapLimitMb?: number;
}

export function readJsHeap(): { usedMb: number; limitMb: number } | null {
  const mem = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  if (!mem || !Number.isFinite(mem.usedJSHeapSize) || !Number.isFinite(mem.jsHeapSizeLimit)) return null;
  return {
    usedMb: mem.usedJSHeapSize / (1024 * 1024),
    limitMb: mem.jsHeapSizeLimit / (1024 * 1024),
  };
}

function pad(n: number, w = 5): string {
  return String(n).padStart(w);
}

/** Lines for the backtick readout — compact, monospace-friendly. */
export function formatDevPerf(s: DevPerfSnapshot): string[] {
  const plantPct = s.maxPlants > 0 ? Math.round((100 * s.plants) / s.maxPlants) : 0;
  const lines = [
    `mem · plants ${pad(s.plants)}/${s.maxPlants} (${plantPct}%) · live kinds ${s.plantKindsLive} · defs ${s.plantSpeciesDefs}`,
    `    · critters ${pad(s.critters)} · kinds ${s.critterKinds} · clouds ${s.swarms} · motes ${s.swarmMotes}`,
    `    · flocks ${s.flocks} (${s.flockBirds} birds) · map ${s.mapTiles} tiles`,
    `    · census ${s.censusTraces} traces / ${s.censusSamples} samples`,
    `    · sprites plant ${s.plantSprites}/${s.plantSpriteCap} · insect ${s.insectSpriteSets}/${s.insectSpriteCap} · critter ${s.critterSpriteSets}/${s.critterSpriteCap}`,
  ];
  if (s.heapUsedMb !== undefined && s.heapLimitMb !== undefined) {
    const heapPct = s.heapLimitMb > 0 ? Math.round((100 * s.heapUsedMb) / s.heapLimitMb) : 0;
    lines.push(`    · js heap ${s.heapUsedMb.toFixed(1)} / ${s.heapLimitMb.toFixed(0)} MB (${heapPct}%)`);
  } else {
    lines.push(`    · js heap n/a (Chromium exposes performance.memory)`);
  }
  return lines;
}
