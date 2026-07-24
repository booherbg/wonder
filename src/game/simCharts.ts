// Pure ChartsView builder for the World-Lab ledger — census, biomes, food web,
// and swarm match curves from a construct's live kernel state. Mirrors
// main.ts's buildChartsView without touching the DOM.

import { CensusLog, SpeciesTrace } from "../life/census";
import { CritterSpecies } from "../life/fauna";
import { Flora } from "../life/flora";
import { chainLinks, chainStats, richnessWord } from "../life/foodweb";
import { PlantSpecies } from "../life/species";
import { Tile, WorldMap } from "../world/types";
import { ChartSeries, ChartsView } from "../render/charts";
import { SwarmLayer, buildPollen, swarmPalette } from "./swarms";

const TILE_WORD: Record<number, string> = {
  [Tile.DeepWater]: "deep water",
  [Tile.ShallowWater]: "shallows",
  [Tile.Sand]: "sand",
  [Tile.Grass]: "grass",
  [Tile.Forest]: "forest",
  [Tile.Marsh]: "marsh",
  [Tile.Rock]: "bare rock",
  [Tile.Snow]: "snow",
  [Tile.Scree]: "scree",
  [Tile.Highland]: "highland",
  [Tile.Cliff]: "cliff",
};

const BIOME_COLOR: Record<number, string> = {
  [Tile.ShallowWater]: "#4f86ad",
  [Tile.Sand]: "#d8c489",
  [Tile.Grass]: "#6f9e4c",
  [Tile.Forest]: "#3f6b3a",
  [Tile.Marsh]: "#7d8a54",
  [Tile.Scree]: "#9c9288",
  [Tile.Highland]: "#aab488",
  [Tile.Rock]: "#7c7671",
  [Tile.Snow]: "#dbe4ea",
};

export interface LabChartsInput {
  name: string;
  tick: number;
  census: CensusLog;
  plantSpecies: PlantSpecies[];
  critterSpecies: CritterSpecies[];
  map: WorldMap;
  flora: Flora;
  swarmLayer: Pick<SwarmLayer, "swarms">;
  swarmMatchHistory: ReadonlyMap<number, readonly number[]>;
}

function biomeMakeup(map: WorldMap): { name: string; share: number; color: string }[] {
  const counts = new Map<number, number>();
  for (const t of map.tiles) counts.set(t, (counts.get(t) ?? 0) + 1);
  const shown = [...counts.entries()].filter(([t]) => t !== Tile.DeepWater);
  const total = shown.reduce((s, [, n]) => s + n, 0) || 1;
  return shown
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => ({ name: TILE_WORD[t] ?? String(t), share: n / total, color: BIOME_COLOR[t] ?? "#5a6a72" }));
}

function sumTraces(traces: SpeciesTrace[], maxLen: number): number[] {
  const out = new Array(maxLen).fill(0);
  for (const t of traces) {
    const off = maxLen - t.counts.length;
    for (let i = 0; i < t.counts.length; i++) out[off + i] += t.counts[i];
  }
  return out;
}

function padLeft(counts: number[], len: number): number[] {
  return counts.length >= len ? counts.slice(counts.length - len) : [...new Array(len - counts.length).fill(0), ...counts];
}

export function buildLabChartsView(input: LabChartsInput): ChartsView {
  const { name, tick, census, plantSpecies, critterSpecies, map, flora, swarmLayer, swarmMatchHistory } = input;
  const traces = census.list();
  const maxLen = Math.max(2, ...traces.map((t) => t.counts.length));
  const series: ChartSeries[] = traces
    .filter((tr) => plantSpecies[tr.id])
    .sort((a, b) => b.peak - a.peak)
    .slice(0, 7)
    .map((tr) => ({
      id: tr.id,
      name: plantSpecies[tr.id].name,
      hue: plantSpecies[tr.id].archetype.hue,
      sat: plantSpecies[tr.id].archetype.sat,
      counts: padLeft(tr.counts, maxLen),
      peak: tr.peak,
    }));
  const sum = census.summary();
  const stats = chainStats(plantSpecies, critterSpecies);
  const score = Math.round(stats.chains + 2 * (stats.redundancy - 1));
  const links = chainLinks(plantSpecies, critterSpecies)
    .slice(0, 5)
    .map((l) => ({
      text: `${l.disperser.name} spreads ${l.source.name} → wakes ${l.feeder.name}`,
      closes: l.closes,
    }));
  const pol = buildPollen(swarmLayer as SwarmLayer, plantSpecies, (id) => flora.speciesCounts.get(id) ?? 0);
  const swarmSeries = swarmLayer.swarms
    .filter((e) => (swarmMatchHistory.get(e.id)?.length ?? 0) > 0)
    .sort((a, b) => b.sw.population - a.sw.population)
    .slice(0, 8)
    .map((e) => ({
      name: e.name,
      color: swarmPalette(e.sw, 1)[0],
      matches: [...swarmMatchHistory.get(e.id)!],
    }));
  return {
    name,
    timeLabel: `tick ${tick}`,
    totals: { plants: flora.count, kinds: sum.live, arose: sum.arose, lost: sum.lost },
    richness: { score, word: richnessWord(score) },
    chains: stats,
    links,
    series,
    totalCounts: sumTraces(traces, maxLen),
    biomes: biomeMakeup(map),
    substrates: flora.substrates.length,
    germinations: flora.germinations,
    pollinators: { swarms: pol.cloudsTotal, population: pol.population, species: pol.species },
    swarmSeries,
  };
}
