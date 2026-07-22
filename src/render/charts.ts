// The island's ledger: the census and food-web data the sim already computes,
// promoted from tiny debug sparklines into real charts — population over
// island-time, the diversity at a glance, the biome makeup, and the food web's
// chains. Pure over its ChartsView; builds SVG/HTML strings, touches the DOM
// only to fill the panel. Styled to the "naturalist's codex" art direction.

export interface ChartSeries {
  id: number;
  name: string;
  hue: number; // 0..1 — the plant's own colour carries its identity
  sat: number;
  counts: number[]; // population, oldest → newest
  peak: number;
}

export interface ChartsView {
  name: string; // island name
  timeLabel: string; // "3h 20m here" / tick
  totals: { plants: number; kinds: number; arose: number; lost: number };
  richness: { score: number; word: string };
  chains: { chains: number; closable: number; redundancy: number };
  links: { text: string; closes: boolean }[];
  series: ChartSeries[]; // dominant lineages, most-peak first
  totalCounts: number[]; // all-plants total over time (context line)
  biomes: { name: string; share: number; color: string }[];
  substrates: number;
  germinations: number;
  pollinators: { swarms: number; population: number; species: number }; // insect swarms working the blooms now
  swarmCounts: number[]; // total swarm population over island-time (oldest → newest)
}

// genome hue → a legible line colour (mid-light, saturated enough to read on the
// dark codex ground)
function lineColor(hue: number, sat: number): string {
  return `hsl(${Math.round(hue * 360)}, ${Math.round(Math.max(0.45, sat) * 78)}%, 62%)`;
}

const NB = " ";

function statTiles(v: ChartsView): string {
  const tile = (n: string | number, label: string, accent = false) =>
    `<div class="ch-tile${accent ? " accent" : ""}"><div class="ch-tile-n">${n}</div><div class="ch-tile-l">${label}</div></div>`;
  return `<div class="ch-tiles">
    ${tile(v.totals.plants.toLocaleString(), "plants alive")}
    ${tile(v.totals.kinds, "living kinds")}
    ${tile(v.totals.arose, "arose here")}
    ${tile(v.totals.lost, "lost")}
    ${tile(v.pollinators.swarms, "swarms aloft")}
    ${tile(v.richness.word, `richness · ${v.richness.score}`, true)}
  </div>`;
  // note: the byproduct-chain link count still reads in the food-web section below
  // (demoted, not lost) — the tile row now leads with the living pollinators.
}

// A multi-series line chart: each dominant lineage in its own plant-colour,
// direct-labelled at its right end (labels dodged apart so none collide) so
// identity is never colour-alone; a recessive grid. Scaled to the KINDS' own
// peak, not the all-plants total — so who rises, peaks, and fades actually reads.
function populationChart(v: ChartsView): string {
  const W = 700;
  const H = 236;
  const padL = 46;
  const padR = 132; // room for the dodged direct labels
  const padT = 12;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const drawn = v.series.filter((s) => s.counts.length > 0);
  const samples = Math.max(2, ...drawn.map((s) => s.counts.length));
  const maxY = Math.max(1, ...drawn.map((s) => s.peak));
  const x = (i: number) => padL + (samples <= 1 ? 0 : (i / (samples - 1)) * plotW);
  const y = (c: number) => padT + plotH - Math.min(1, c / maxY) * plotH;

  const gridVals = [0, Math.round(maxY / 2), maxY];
  const grid = gridVals
    .map(
      (gv) =>
        `<line x1="${padL}" y1="${y(gv)}" x2="${padL + plotW}" y2="${y(gv)}" class="ch-grid"/>` +
        `<text x="${padL - 6}" y="${y(gv) + 3}" class="ch-axis" text-anchor="end">${gv.toLocaleString()}</text>`,
    )
    .join("");

  const path = (counts: number[]) =>
    counts.map((c, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(c).toFixed(1)}`).join(" ");

  // dodge the end-labels: greedily push down to a min gap, then lift the whole
  // stack back up if it spilled past the plot floor
  const minGap = 15;
  const items = drawn
    .map((s) => {
      const li = s.counts.length - 1;
      return { s, col: lineColor(s.hue, s.sat), endX: x(li), endY: y(s.counts[li]), labelY: 0 };
    })
    .sort((a, b) => a.endY - b.endY);
  let prev = padT - minGap;
  for (const it of items) {
    it.labelY = Math.max(it.endY, prev + minGap);
    prev = it.labelY;
  }
  const overflow = prev - (padT + plotH);
  if (overflow > 0) for (const it of items) it.labelY = Math.max(padT + 4, it.labelY - overflow);

  const lines = items
    .map((it) => {
      const p = `<path d="${path(it.s.counts)}" class="ch-line" style="stroke:${it.col}" fill="none"/>`;
      const dot = `<circle cx="${it.endX.toFixed(1)}" cy="${it.endY.toFixed(1)}" r="3" fill="${it.col}"/>`;
      const conn =
        Math.abs(it.labelY - it.endY) > 1.5
          ? `<line x1="${(it.endX + 3).toFixed(1)}" y1="${it.endY.toFixed(1)}" x2="${(it.endX + 8).toFixed(1)}" y2="${it.labelY.toFixed(1)}" style="stroke:${it.col};stroke-width:1;opacity:0.45"/>`
          : "";
      const label = `<text x="${(it.endX + 10).toFixed(1)}" y="${(it.labelY + 3).toFixed(1)}" class="ch-lbl" style="fill:${it.col}">${escapeText(it.s.name)}</text>`;
      return p + dot + conn + label;
    })
    .join("");

  return `<svg class="ch-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="population of each kind over island-time">
    ${grid}
    <text x="${padL}" y="${H - 6}" class="ch-axis" text-anchor="start">first log</text>
    <text x="${padL + plotW}" y="${H - 6}" class="ch-axis" text-anchor="end">now</text>
    ${lines}
  </svg>`;
}

// a legend for the plotted kinds, each with its colour and its count right now —
// the robust identity layer beside the direct labels, and it carries the numbers
function seriesLegend(v: ChartSeries[]): string {
  if (v.length === 0) return "";
  const items = v
    .map((s) => {
      const now = s.counts[s.counts.length - 1] ?? 0;
      return `<span class="ch-sl"><i style="background:${lineColor(s.hue, s.sat)}"></i>${escapeText(s.name)} <b>${now.toLocaleString()}</b></span>`;
    })
    .join("");
  return `<div class="ch-serieslegend">${items}</div>`;
}

// The biome makeup: one horizontal stacked bar in natural terrain colours, each
// segment labelled where it's wide enough, with a legend beneath for the rest.
function biomeBar(v: ChartsView): string {
  const segs = v.biomes
    .map(
      (b) =>
        `<span class="ch-seg" style="width:${(b.share * 100).toFixed(2)}%;background:${b.color}" title="${b.name} ${Math.round(b.share * 100)}%">` +
        (b.share > 0.09 ? `<span class="ch-seg-l">${b.name}${NB}${Math.round(b.share * 100)}%</span>` : "") +
        `</span>`,
    )
    .join("");
  const legend = v.biomes
    .filter((b) => b.share <= 0.09 && b.share > 0)
    .map((b) => `<span class="ch-leg"><i style="background:${b.color}"></i>${b.name} ${Math.round(b.share * 100)}%</span>`)
    .join("");
  return `<div class="ch-bar">${segs}</div>${legend ? `<div class="ch-legend">${legend}</div>` : ""}`;
}

// The pollinators aloft: a caption of the swarms working the blooms right now,
// and — once there's enough history — a single gold line of total swarm
// population over island-time, mirroring the census population chart's shape so
// the reciprocal boom (a well-matched pair swelling) actually reads.
function swarmChart(v: ChartsView): string {
  const p = v.pollinators;
  if (p.swarms === 0 && v.swarmCounts.length === 0)
    return `<div class="ch-chain muted">no swarms aloft — this island's blooms still wait for pollinators</div>`;
  const caption =
    `<div class="ch-web-stats">` +
    `<span><b>${p.swarms}</b> swarms aloft</span>` +
    `<span><b>${p.population.toLocaleString()}</b> insects</span>` +
    `<span>working <b>${p.species}</b> ${p.species === 1 ? "bloom" : "blooms"}</span>` +
    `</div>`;
  const counts = v.swarmCounts;
  if (counts.length < 2) return caption; // not enough history for a line yet

  const W = 700;
  const H = 150;
  const padL = 46;
  const padR = 20;
  const padT = 12;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = counts.length;
  const maxY = Math.max(1, ...counts);
  const x = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const y = (c: number) => padT + plotH - Math.min(1, c / maxY) * plotH;
  const GOLD = "#f4c979"; // the firefly gold — a pollinator's hue, set apart from the plant lines

  const gridVals = [0, Math.round(maxY / 2), maxY];
  const grid = gridVals
    .map(
      (gv) =>
        `<line x1="${padL}" y1="${y(gv)}" x2="${padL + plotW}" y2="${y(gv)}" class="ch-grid"/>` +
        `<text x="${padL - 6}" y="${y(gv) + 3}" class="ch-axis" text-anchor="end">${gv.toLocaleString()}</text>`,
    )
    .join("");
  const d = counts.map((c, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(c).toFixed(1)}`).join(" ");
  const area = `${d} L${x(n - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const lastX = x(n - 1);
  const lastY = y(counts[n - 1]);

  return (
    caption +
    `<svg class="ch-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="total swarm population over island-time">
      ${grid}
      <path d="${area}" fill="${GOLD}" opacity="0.1"/>
      <path d="${d}" class="ch-line" style="stroke:${GOLD}" fill="none"/>
      <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3" fill="${GOLD}"/>
      <text x="${padL}" y="${H - 6}" class="ch-axis" text-anchor="start">first log</text>
      <text x="${padL + plotW}" y="${H - 6}" class="ch-axis" text-anchor="end">now</text>
    </svg>`
  );
}

function foodWeb(v: ChartsView): string {
  const rows = v.links.length
    ? v.links
        .map(
          (l) =>
            `<div class="ch-chain${l.closes ? " closes" : ""}">${escapeText(l.text)}${l.closes ? ' <span class="ch-loop">↺ loops</span>' : ""}</div>`,
        )
        .join("")
    : `<div class="ch-chain muted">no chains latent on this island yet</div>`;
  return `<div class="ch-web-stats">
      <span><b>${v.chains.chains}</b> links</span>
      <span><b>${v.chains.closable}</b> close the loop</span>
      <span><b>${v.chains.redundancy.toFixed(1)}×</b> backup / source</span>
      <span><b>${v.substrates}</b> substrates live</span>
      <span><b>${v.germinations}</b> sprouted</span>
    </div>${rows}`;
}

function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

function panel(): HTMLElement {
  return document.getElementById("charts")!;
}

export function isChartsOpen(): boolean {
  return panel().style.display === "block";
}

export function closeCharts(): void {
  panel().style.display = "none";
}

export function openCharts(v: ChartsView): void {
  const el = panel();
  el.innerHTML = `
    <div class="ch-head">
      <span class="ch-title">the island's ledger</span>
      <span class="ch-sub">${escapeText(v.name)}${NB}·${NB}${escapeText(v.timeLabel)}</span>
    </div>
    ${statTiles(v)}
    <div class="ch-section">population over island-time</div>
    ${populationChart(v)}
    ${seriesLegend(v.series)}
    <div class="ch-section">the pollinators aloft</div>
    ${swarmChart(v)}
    <div class="ch-section">the biomes underfoot</div>
    ${biomeBar(v)}
    <div class="ch-section">the food web</div>
    ${foodWeb(v)}
    <div class="ch-hint">G or Esc to close</div>
  `;
  el.style.display = "block";
  el.scrollTop = 0;
}
