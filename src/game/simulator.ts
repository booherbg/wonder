// The Simulator (?sim=1) — the World Lab's Door C, v1 "playable core".
//
// A small blank meadow you stamp flowers and insect swarms onto, then run time
// and WATCH the swarms adapt their appearance toward the flowers they feed on.
// It reuses the tested ecology core untouched (src/life/idmap.ts, swarm.ts): the
// core feeds one swarm on one flower; the Simulator is only the spatial glue —
// give everything a spot on the canvas, and each tick feed each swarm on its
// NEAREST flower. Peaceful: nothing dies, populations rise and fall. All sim
// logic is driven by a persistent Rng — never Math.random.
//
// Rendering is the point (Blaine's ask): flowers are crisp pixel blooms of their
// map's appearanceColors; swarms are little generative insects (render/
// insectSprites) grown from each swarm's genome — body from the map's dominant
// colour, wing patches from real sensor cells — darting, hovering and perching
// on the bloom they work, so a cloud visibly becomes its flower as it adapts.
// Art direction: the naturalist's-codex tokens.

import { makeRng, Rng, hash2d } from "../core/rng";
import { appearanceColors, resemblance, MAP_G, MAP_CELLS, IdMap } from "../life/idmap";
import { Flower, Swarm, SWARM_CAP, makeFlower, makeSwarm, stepSwarm } from "../life/swarm";
import {
  CALM,
  FlightField,
  INSECT_SPRITE,
  blitInsect,
  getInsectSprites,
  insectPose,
} from "../render/insectSprites";
import { behaviourWords } from "../render/inspect";

// ── the field ────────────────────────────────────────────────────────────
// A fixed logical meadow measured in tiles; the view fits the whole field into
// the window (a fixed, whole-canvas camera — no scrolling).
const FIELD_W = 40;
const FIELD_H = 40;
const TICK_MS = 260; // sim heartbeat at 1× — a few generations a second
const MOTES_MAX = 40; // insects drawn in the densest cloud
const SIM_PREDATION = 0.8; // predation pressure the bench applies when Predators is ON (0..1)
const CAP_MIN = 20; // swarm-size cap slider bounds (the Swarm.cap lever)
const CAP_MAX = 140;

// ── placed entities (the spatial glue over the core) ──────────────────────
interface Mote {
  a: number; // orbit angle around the cloud centre
  r: number; // 0..1 radial offset within the cloud
  spd: number; // angular drift speed
  z: number; // 0..1 depth, for size/alpha variation
}
interface SwarmEnt {
  sw: Swarm;
  id: number; // placement order — the per-swarm flight salt
  x: number; // tile coords (the cloud's home drifts to orbit its flower)
  y: number;
  orbit: number; // slow orbit phase around the nearest flower
  motes: Mote[];
}
interface FlowerEnt {
  fl: Flower;
  x: number; // tile coords
  y: number;
}

/** The nearest flower to a point, as an index into `flowers` (−1 if none). Pure
 *  and testable — this selection is the whole spatial job the Simulator adds on
 *  top of the core's one-swarm-one-flower feed. */
export function nearestFlowerIndex(x: number, y: number, flowers: { x: number; y: number }[]): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < flowers.length; i++) {
    const dx = flowers[i].x - x;
    const dy = flowers[i].y - y;
    const d = dx * dx + dy * dy;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** The dominant visible colour of a map — the most common coloured cell, rendered
 *  through the same appearanceColors the portrait uses. An all-neutral map falls
 *  back to mint (a naive generalist reads as faint mint, not a void). */
function dominantColor(map: IdMap): string {
  const cols = appearanceColors(map);
  const tally = new Map<string, number>();
  for (let i = 0; i < MAP_CELLS; i++) {
    if (map[i] === 0) continue;
    tally.set(cols[i], (tally.get(cols[i]) ?? 0) + 1);
  }
  let best = "";
  let bv = -1;
  for (const [c, n] of tally) {
    if (n > bv) {
      bv = n;
      best = c;
    }
  }
  return best || "rgb(127, 224, 196)";
}

/** A small spread of a swarm's genome colours (from its internal gene pool), so a
 *  cloud reads as many related individuals, not one flat tint. Recomputed each
 *  frame, so the palette shifts live as the pool adapts. */
function swarmPalette(sw: Swarm, k = 4): string[] {
  const out: string[] = [];
  for (let i = 0; i < Math.min(k, sw.pool.length); i++) out.push(dominantColor(sw.pool[i]));
  return out.length ? out : [dominantColor(sw.sensor)];
}

export function startSimulator(): void {
  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const ctx = canvas.getContext("2d")!;
  const rng: Rng = makeRng(seedFromUrl());

  // layout: the whole field fit and centred in the window (recomputed on resize)
  let scale = 1;
  let offX = 0;
  let offY = 0;
  let ground: HTMLCanvasElement | null = null;
  function layout(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
    const margin = 40;
    scale = Math.min((w - margin) / FIELD_W, (h - margin) / FIELD_H);
    offX = (w - FIELD_W * scale) / 2;
    offY = (h - FIELD_H * scale) / 2;
    ground = buildGround(scale);
  }
  const sx = (tx: number): number => offX + tx * scale;
  const sy = (ty: number): number => offY + ty * scale;
  const toField = (px: number, py: number): { x: number; y: number } => ({
    x: (px - offX) / scale,
    y: (py - offY) / scale,
  });

  // ── the world on the bench ──────────────────────────────────────────────
  const flowers: FlowerEnt[] = [];
  const swarms: SwarmEnt[] = [];

  function addFlower(x: number, y: number, size: number): void {
    flowers.push({ fl: makeFlower(rng, size), x, y });
  }
  let nextSwarmId = 0;
  function addSwarm(x: number, y: number): void {
    const sw = makeSwarm(rng);
    sw.cap = capValue; // honour the current size-cap slider
    const motes: Mote[] = [];
    for (let i = 0; i < MOTES_MAX; i++) {
      motes.push({ a: rng() * Math.PI * 2, r: 0.35 + rng() * 0.65, spd: 0.25 + rng() * 0.55, z: rng() });
    }
    swarms.push({ sw, id: nextSwarmId++, x, y, orbit: rng() * Math.PI * 2, motes });
  }

  // ── pressures (the bench's live levers) ──────────────────────────────────
  // Declared before the seed content is placed, since addSwarm reads capValue.
  let predatorsOn = false; // gentle insectivory: thins the conspicuous, spares the camouflaged
  let capValue = SWARM_CAP; // the Swarm.cap size lever, dialled by the slider

  function setCap(v: number): void {
    capValue = Math.round(v);
    for (const s of swarms) s.sw.cap = capValue; // re-cap every cloud on the bench
  }

  // seed content so the bench is alive on arrival: three distinct flower kinds
  // at spread positions (varied flower size), a scatter of swarms around them
  const seeds: { x: number; y: number; size: number }[] = [
    { x: 11, y: 13, size: 9 },
    { x: 29, y: 11, size: 15 },
    { x: 20, y: 29, size: 5 },
  ];
  for (const s of seeds) addFlower(s.x, s.y, s.size);
  for (const s of seeds) {
    addSwarm(s.x + (rng() - 0.5) * 8, s.y + (rng() - 0.5) * 8);
  }
  addSwarm(20, 20);
  addSwarm(16, 22);

  // ── selection / placement ───────────────────────────────────────────────
  type Tool = "select" | "flower" | "swarm" | "erase";
  let tool: Tool = "select";
  type Sel = { kind: "swarm"; ref: SwarmEnt } | { kind: "flower"; ref: FlowerEnt } | null;
  let selected: Sel = null;

  // Erase whatever sits nearest a point — the tool that reaches the 0-flower /
  // 0-swarm edge. Clears the selection if it pointed at what was removed.
  function eraseAt(x: number, y: number): void {
    let bd = Infinity;
    let hitSwarm = -1;
    let hitFlower = -1;
    for (let i = 0; i < swarms.length; i++) {
      const d = Math.hypot(swarms[i].x - x, swarms[i].y - y);
      if (d < HIT_SWARM && d < bd) { bd = d; hitSwarm = i; hitFlower = -1; }
    }
    for (let i = 0; i < flowers.length; i++) {
      const d = Math.hypot(flowers[i].x - x, flowers[i].y - y);
      if (d < HIT_FLOWER && d < bd) { bd = d; hitFlower = i; hitSwarm = -1; }
    }
    if (hitSwarm >= 0) {
      const [gone] = swarms.splice(hitSwarm, 1);
      if (selected && selected.kind === "swarm" && selected.ref === gone) selected = null;
    } else if (hitFlower >= 0) {
      const [gone] = flowers.splice(hitFlower, 1);
      if (selected && selected.kind === "flower" && selected.ref === gone) selected = null;
    }
  }

  // ── time controls ───────────────────────────────────────────────────────
  let playing = true;
  let speed = 1;
  let acc = 0;

  function nearestFlowerFor(s: SwarmEnt): FlowerEnt | null {
    const i = nearestFlowerIndex(s.x, s.y, flowers);
    return i < 0 ? null : flowers[i];
  }

  /** One sim tick: feed every swarm on its nearest flower and let its pool adapt.
   *  This is the whole loop — the core does the feeding, evolving and population;
   *  the Simulator only chooses the flower by proximity. */
  function tick(): void {
    const pressure = predatorsOn ? SIM_PREDATION : 0;
    for (const s of swarms) {
      const f = nearestFlowerFor(s);
      if (f) stepSwarm(s.sw, f.fl, rng, pressure);
    }
  }

  // ── the codex chrome (toolbar + inspect panel), consuming :root tokens ──
  const ui = buildChrome();
  ui.onTool = (t) => {
    tool = t;
    refreshToolbar();
  };
  ui.onPlay = () => {
    playing = !playing;
    refreshToolbar();
  };
  ui.onStep = () => {
    playing = false;
    tick();
    refreshToolbar();
  };
  ui.onSpeed = (s) => {
    speed = s;
    refreshToolbar();
  };
  ui.onPredators = () => {
    predatorsOn = !predatorsOn;
    refreshToolbar();
  };
  ui.onCap = (v) => {
    setCap(v);
    if (selected) renderInspect();
    refreshToolbar();
  };
  function refreshToolbar(): void {
    ui.setState({ playing, speed, tool, predatorsOn, cap: capValue });
  }
  refreshToolbar();

  function renderInspect(): void {
    if (!selected) {
      ui.hideInspect();
      return;
    }
    if (selected.kind === "swarm") {
      const s = selected.ref;
      const f = nearestFlowerFor(s);
      ui.showSwarm(s.sw, f ? f.fl : null);
    } else {
      ui.showFlower(selected.ref.fl);
    }
  }

  // ── input ────────────────────────────────────────────────────────────────
  const HIT_SWARM = 1.6; // tile-radius pick tolerance
  const HIT_FLOWER = 1.4;
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const p = toField(e.clientX - rect.left, e.clientY - rect.top);
    if (p.x < 0 || p.y < 0 || p.x > FIELD_W || p.y > FIELD_H) return;
    if (tool === "flower") {
      addFlower(p.x, p.y, 4 + Math.floor(rng() * 14));
      return;
    }
    if (tool === "swarm") {
      addSwarm(p.x, p.y);
      return;
    }
    if (tool === "erase") {
      eraseAt(p.x, p.y);
      renderInspect();
      return;
    }
    // select mode: nearest swarm, then nearest flower, then close
    let hit: Sel = null;
    let bd = Infinity;
    for (const s of swarms) {
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < HIT_SWARM && d < bd) {
        bd = d;
        hit = { kind: "swarm", ref: s };
      }
    }
    for (const f of flowers) {
      const d = Math.hypot(f.x - p.x, f.y - p.y);
      if (d < HIT_FLOWER && d < bd) {
        bd = d;
        hit = { kind: "flower", ref: f };
      }
    }
    selected = hit;
    renderInspect();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === " ") {
      e.preventDefault();
      playing = !playing;
      refreshToolbar();
    } else if (e.key === "ArrowRight") {
      playing = false;
      tick();
      refreshToolbar();
    } else if (e.key === "Escape") {
      selected = null;
      renderInspect();
    } else if (e.key === "1") {
      tool = "select";
      refreshToolbar();
    } else if (e.key === "2") {
      tool = "flower";
      refreshToolbar();
    } else if (e.key === "3") {
      tool = "swarm";
      refreshToolbar();
    } else if (e.key === "4") {
      tool = "erase";
      refreshToolbar();
    } else if (e.key === "p" || e.key === "P") {
      predatorsOn = !predatorsOn;
      refreshToolbar();
    }
  });
  window.addEventListener("resize", layout);

  // ── render ────────────────────────────────────────────────────────────────
  function draw(nowS: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false; // the insects are pixel art — keep them crisp
    ctx.fillStyle = "#0a0e14";
    ctx.fillRect(0, 0, w, h);
    if (ground) ctx.drawImage(ground, offX, offY);

    // faint link from each swarm to the flower it's adapting toward, brightening
    // with resemblance — the visible pull of adaptation
    for (const s of swarms) {
      const f = nearestFlowerFor(s);
      if (!f) continue;
      const res = resemblance(s.sw.sensor, f.fl.map);
      ctx.strokeStyle = `rgba(127, 224, 196, ${0.05 + res * 0.5})`;
      ctx.lineWidth = 0.6 + res * 2;
      ctx.beginPath();
      ctx.moveTo(sx(s.x), sy(s.y));
      ctx.lineTo(sx(f.x), sy(f.y));
      ctx.stroke();
    }

    // flowers: a soft glow, then a crisp pixel bloom of the flower's own colours
    for (const f of flowers) {
      const bob = Math.sin(nowS * 1.1 + f.x + f.y) * 0.6;
      const selF = selected !== null && selected.kind === "flower" && selected.ref === f;
      drawFlower(ctx, f, sx(f.x), sy(f.y) + bob, selF);
    }

    // swarms: the same little generative insects the island flies — grown from
    // each swarm's genome, darting, hovering and perching on the bloom they work
    for (const s of swarms) {
      const f = nearestFlowerFor(s);
      // the cloud gently orbits its nearest flower, so it reads as "visiting" it
      s.orbit += 0.006;
      if (f) {
        const ring = 2.4 + (1 - resemblance(s.sw.sensor, f.fl.map)) * 1.6;
        const tx = f.x + Math.cos(s.orbit) * ring;
        const ty = f.y + Math.sin(s.orbit) * ring * 0.8;
        s.x += (tx - s.x) * 0.02;
        s.y += (ty - s.y) * 0.02;
      }
      const selS = selected !== null && selected.kind === "swarm" && selected.ref === s;
      drawSwarm(ctx, s, sx(s.x), sy(s.y), f, nowS, selS);
    }
  }

  function drawSwarm(
    c: CanvasRenderingContext2D,
    s: SwarmEnt,
    cx: number,
    cy: number,
    f: FlowerEnt | null,
    nowS: number,
    sel: boolean,
  ): void {
    const sw = s.sw;
    const pal = swarmPalette(sw);
    const frac = Math.max(0, Math.min(1, sw.population / sw.cap));
    const cohesion = sw.behavior.cohesion;
    const baseR = scale * (1.5 - cohesion * 0.7); // tighter cohesion = smaller cloud
    // a soft halo so the cloud reads at a glance against the dark bench
    const glow = c.createRadialGradient(cx, cy, 0, cx, cy, baseR * 2);
    glow.addColorStop(0, tint(pal[0], sel ? 0.3 : 0.18));
    glow.addColorStop(1, tint(pal[0], 0));
    c.fillStyle = glow;
    c.beginPath();
    c.arc(cx, cy, baseR * 2, 0, Math.PI * 2);
    c.fill();
    // the dust of many-ness behind the full insects, scaled by population
    const insects = Math.round(5 + frac * 9);
    const dust = Math.min(s.motes.length - insects, Math.round(frac * 14));
    for (let i = 0; i < dust; i++) {
      const m = s.motes[insects + i];
      const a = m.a + (CALM ? 0 : nowS * m.spd * (1 + (i % 3) * 0.15));
      const rr = baseR * (0.35 + m.r * (1 + (1 - cohesion) * 0.8));
      c.fillStyle = tint(pal[i % pal.length], 0.4);
      c.fillRect(Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr * 0.82), 1, 1);
    }
    // the insects — the very sprites the world and the codex cards share,
    // scaled to the bench (integer, nearest-neighbour: still pixel art)
    const sprites = getInsectSprites(sw);
    const k = Math.max(2, Math.round(scale / 9));
    const patchHalf = (Math.max(3, Math.round(scale * 0.42)) * MAP_G) / 2;
    const field: FlightField = {
      cx,
      cy,
      homeX: f ? sx(f.x) : undefined,
      homeY: f ? sy(f.y) - patchHalf - 2 : undefined, // the bloom patch's crown
      baseR,
      range: sw.behavior.range,
      nerve: sw.behavior.nerve,
      calm: CALM,
      salt: s.id * 0x9e37 + 1,
    };
    for (let i = 0; i < insects; i++) {
      const pose = insectPose(i, nowS, field);
      blitInsect(c, sprites, pose.x, pose.y, pose.frame, pose.heading, k);
    }
    if (sel) {
      c.strokeStyle = "rgba(127, 224, 196, 0.9)";
      c.lineWidth = 1.5;
      c.beginPath();
      c.arc(cx, cy, baseR * 2 + 3, 0, Math.PI * 2);
      c.stroke();
    }
  }

  function drawFlower(c: CanvasRenderingContext2D, f: FlowerEnt, cx: number, cy: number, sel: boolean): void {
    const cols = appearanceColors(f.fl.map);
    const dom = dominantColor(f.fl.map);
    const cell = Math.max(3, Math.round(scale * 0.42));
    const patch = cell * MAP_G;
    const x0 = Math.round(cx - patch / 2);
    const y0 = Math.round(cy - patch / 2);
    // glow
    const glow = c.createRadialGradient(cx, cy, 0, cx, cy, patch * 0.9);
    glow.addColorStop(0, tint(dom, sel ? 0.5 : 0.34));
    glow.addColorStop(1, tint(dom, 0));
    c.fillStyle = glow;
    c.beginPath();
    c.arc(cx, cy, patch * 0.9, 0, Math.PI * 2);
    c.fill();
    // a short muted stem, so the bloom sits in the meadow
    c.strokeStyle = "rgba(90, 132, 96, 0.7)";
    c.lineWidth = Math.max(1.5, cell * 0.4);
    c.beginPath();
    c.moveTo(cx, y0 + patch - cell);
    c.lineTo(cx, y0 + patch + cell * 2.4);
    c.stroke();
    // the crisp pixel bloom — the flower's face, rendered from its map
    for (let gy = 0; gy < MAP_G; gy++) {
      for (let gx = 0; gx < MAP_G; gx++) {
        const i = gy * MAP_G + gx;
        if (f.fl.map[i] === 0) continue; // let the meadow show through neutral cells
        c.fillStyle = cols[i];
        c.fillRect(x0 + gx * cell, y0 + gy * cell, cell - 0.5, cell - 0.5);
      }
    }
    if (sel) {
      c.strokeStyle = "rgba(244, 201, 121, 0.9)";
      c.lineWidth = 1.5;
      c.strokeRect(x0 - 3, y0 - 3, patch + 5, patch + 5);
    }
  }

  // ── the loop ────────────────────────────────────────────────────────────
  layout();
  let last = performance.now();
  function frame(now: number): void {
    const dt = Math.min(now - last, 100);
    last = now;
    if (playing) {
      acc += dt * speed;
      let guard = 0;
      let ticked = false;
      while (acc >= TICK_MS && guard++ < 8) {
        acc -= TICK_MS;
        tick();
        ticked = true;
      }
      if (ticked && selected) renderInspect(); // refresh the readout only on a real tick
    }
    draw(now / 1000);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// ── helpers ─────────────────────────────────────────────────────────────────

function seedFromUrl(): number {
  const raw = new URL(location.href).searchParams.get("seed");
  const n = raw === null ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 ? n : 20260721;
}

/** Turn an `rgb(r, g, b)` swatch into `rgba(r, g, b, a)` (falls back gracefully). */
function tint(color: string, alpha: number): string {
  const m = color.match(/hsl\(([^)]+)\)/);
  if (m) return `hsla(${m[1]}, ${alpha})`;
  const r = color.match(/rgb\(([^)]+)\)/);
  if (r) return `rgba(${r[1]}, ${alpha})`;
  return color;
}

/** The meadow ground: a soft green plane with faint blade flecks and a vignette,
 *  inked once per layout to an offscreen canvas and blitted each frame. A plain
 *  pixel field — no worldgen — that lets the genome colours sing over it. */
function buildGround(scale: number): HTMLCanvasElement {
  const w = Math.round(FIELD_W * scale);
  const h = Math.round(FIELD_H * scale);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#2c4a35");
  grad.addColorStop(1, "#1a2f24");
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // blade flecks: two dabs per tile from a stable hash, so the meadow has texture
  const cell = scale;
  for (let ty = 0; ty < FIELD_H; ty++) {
    for (let tx = 0; tx < FIELD_W; tx++) {
      const hsh = hash2d(tx, ty, 7);
      const lighter = hsh > 0.5;
      g.fillStyle = lighter ? "rgba(120, 168, 120, 0.16)" : "rgba(10, 24, 16, 0.22)";
      const bx = tx * cell + hsh * cell * 0.7;
      const by = ty * cell + hash2d(tx, ty, 19) * cell * 0.7;
      g.fillRect(bx, by, Math.max(1, cell * 0.14), Math.max(1, cell * 0.32));
    }
  }
  // a mint hairline frame + inner vignette, to seat the field in the codex dark
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.62);
  vg.addColorStop(0, "rgba(0, 0, 0, 0)");
  vg.addColorStop(1, "rgba(6, 10, 16, 0.55)");
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = "rgba(127, 224, 196, 0.18)";
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, w - 1, h - 1);
  return c;
}

// ── the DOM chrome: a codex-styled toolbar + inspect panel ──────────────────

type ToolName = "select" | "flower" | "swarm" | "erase";
interface Chrome {
  onTool: (t: ToolName) => void;
  onPlay: () => void;
  onStep: () => void;
  onSpeed: (s: number) => void;
  onPredators: () => void;
  onCap: (v: number) => void;
  setState: (s: { playing: boolean; speed: number; tool: ToolName; predatorsOn: boolean; cap: number }) => void;
  showSwarm: (sw: Swarm, flower: Flower | null) => void;
  showFlower: (fl: Flower) => void;
  hideInspect: () => void;
}

function buildChrome(): Chrome {
  // shared inline token-driven styles (no hardcoded chrome hexes — consume :root)
  const MONO = "font: 11px var(--mono); letter-spacing: 0.06em;";
  const btn = (active: boolean): string =>
    `${MONO} text-transform: uppercase; color: ${active ? "rgb(var(--abyss))" : "rgba(228,236,242,0.72)"};` +
    ` background: ${active ? "rgb(var(--lumen))" : "rgba(23,42,54,0.72)"};` +
    ` border: 1px solid ${active ? "rgb(var(--lumen))" : "rgba(127,224,196,0.28)"};` +
    ` border-radius: 4px; padding: 6px 11px; cursor: pointer;`;

  const eyebrow = document.createElement("div");
  eyebrow.innerHTML =
    `<span style="font: 10px var(--mono); letter-spacing: 0.24em; text-transform: uppercase; color: rgb(var(--lumen));">Wonder · the Simulator</span>` +
    `<div style="font-family: var(--serif); font-variant: small-caps; letter-spacing: 0.04em; font-size: 22px; color: var(--ink-bright); margin-top: 2px;">the identity-map bench</div>` +
    `<div style="font: italic 12px var(--serif); color: rgba(228,236,242,0.55); margin-top: 2px;">place flowers &amp; swarms, run time, watch each cloud adapt its colour toward its flower.</div>`;
  eyebrow.style.cssText = "position: fixed; left: 18px; top: 16px; z-index: 5; pointer-events: none; user-select: none;";
  document.body.appendChild(eyebrow);

  const bar = document.createElement("div");
  bar.style.cssText =
    "position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); z-index: 6;" +
    " display: flex; align-items: center; gap: 8px; padding: 9px 12px;" +
    " background: var(--panel); border-radius: var(--radius); box-shadow: var(--frame); user-select: none;";
  document.body.appendChild(bar);

  const label = (t: string): HTMLElement => {
    const el = document.createElement("span");
    el.textContent = t;
    el.style.cssText = `${MONO} text-transform: uppercase; color: rgba(228,236,242,0.4);`;
    return el;
  };
  const sep = (): HTMLElement => {
    const el = document.createElement("span");
    el.style.cssText = "width: 1px; height: 22px; background: rgba(127,224,196,0.18);";
    return el;
  };
  const mkBtn = (t: string): HTMLButtonElement => {
    const b = document.createElement("button");
    b.textContent = t;
    b.style.cssText = btn(false);
    bar.appendChild(b);
    return b;
  };

  const chrome = {} as Chrome;

  const playBtn = mkBtn("Pause");
  const stepBtn = mkBtn("Step");
  bar.appendChild(sep());
  bar.appendChild(label("speed"));
  const speedBtns = [1, 2, 4].map((s) => {
    const b = mkBtn(s + "×");
    b.onclick = () => chrome.onSpeed(s);
    return { s, b };
  });
  bar.appendChild(sep());
  bar.appendChild(label("place"));
  const toolDefs: { t: ToolName; name: string }[] = [
    { t: "select", name: "Select" },
    { t: "flower", name: "+ Flower" },
    { t: "swarm", name: "+ Swarm" },
    { t: "erase", name: "Erase" },
  ];
  const toolBtns = toolDefs.map(({ t, name }) => {
    const b = mkBtn(name);
    b.onclick = () => chrome.onTool(t);
    return { t, b };
  });
  playBtn.onclick = () => chrome.onPlay();
  stepBtn.onclick = () => chrome.onStep();

  // ── pressures: predators toggle + the swarm-size cap lever ──────────────────
  bar.appendChild(sep());
  bar.appendChild(label("pressures"));
  const predBtn = mkBtn("Predators");
  predBtn.onclick = () => chrome.onPredators();
  const capWrap = document.createElement("label");
  capWrap.style.cssText = `${MONO} display: flex; align-items: center; gap: 6px; color: rgba(228,236,242,0.6);`;
  const capText = document.createElement("span");
  capText.style.cssText = "text-transform: uppercase; color: rgba(228,236,242,0.4);";
  const capSlider = document.createElement("input");
  capSlider.type = "range";
  capSlider.min = String(CAP_MIN);
  capSlider.max = String(CAP_MAX);
  capSlider.value = String(SWARM_CAP);
  capSlider.style.cssText = "width: 84px; accent-color: rgb(var(--lumen)); cursor: pointer;";
  capSlider.oninput = () => chrome.onCap(Number(capSlider.value));
  const capNum = document.createElement("span");
  capNum.style.cssText = "color: var(--ink-bright); min-width: 26px; text-align: right;";
  capText.textContent = "cap";
  capWrap.append(capText, capSlider, capNum);
  bar.appendChild(capWrap);

  // the inspect panel — a codex plate on the right (the swarm/flower portrait)
  const plate = document.createElement("div");
  plate.style.cssText =
    "position: fixed; right: 18px; top: 50%; transform: translateY(-50%); z-index: 6; display: none;" +
    " width: 250px; padding: 16px 18px; background: var(--panel); border-radius: var(--radius);" +
    " box-shadow: var(--frame); color: var(--ink); font-family: var(--serif);";
  document.body.appendChild(plate);

  chrome.setState = ({ playing, speed, tool, predatorsOn, cap }) => {
    playBtn.textContent = playing ? "Pause" : "Play";
    for (const { s, b } of speedBtns) b.style.cssText = btn(s === speed);
    for (const { t, b } of toolBtns) b.style.cssText = btn(t === tool);
    predBtn.style.cssText = btn(predatorsOn);
    predBtn.textContent = predatorsOn ? "Predators ON" : "Predators";
    capNum.textContent = String(cap);
    if (Number(capSlider.value) !== cap) capSlider.value = String(cap);
  };
  chrome.hideInspect = () => {
    plate.style.display = "none";
  };

  // a small 7×7 genome canvas rendered from a map's appearanceColors
  const genomeCanvas = (map: IdMap, accent?: Uint8Array): string => {
    const cell = 22;
    const c = document.createElement("canvas");
    c.width = MAP_G * cell;
    c.height = MAP_G * cell;
    const g = c.getContext("2d")!;
    const cols = appearanceColors(map);
    for (let y = 0; y < MAP_G; y++) {
      for (let x = 0; x < MAP_G; x++) {
        const i = y * MAP_G + x;
        g.fillStyle = cols[i];
        g.fillRect(x * cell, y * cell, cell - 1, cell - 1);
        if (accent && accent[i]) {
          g.strokeStyle = "rgba(244, 201, 121, 0.9)";
          g.lineWidth = 2;
          g.strokeRect(x * cell + 1, y * cell + 1, cell - 3, cell - 3);
        }
      }
    }
    return c.toDataURL();
  };
  const title = (t: string): string =>
    `<div style="font: 10px var(--mono); letter-spacing: 0.2em; text-transform: uppercase; color: rgb(var(--lumen)); opacity: 0.75; margin: 14px 0 6px;">${t}</div>`;
  const portrait = (src: string): string =>
    `<img src="${src}" style="width: 154px; height: 154px; image-rendering: pixelated; display: block; margin: 0 auto; border-radius: 3px; box-shadow: 0 0 0 1px rgba(127,224,196,0.2);" />`;
  // a demoted little genome plate — the map behind the insect, not the lead
  const inset = (src: string): string =>
    `<img src="${src}" style="width: 84px; height: 84px; image-rendering: pixelated; display: block; margin: 0 auto; border-radius: 2px; box-shadow: 0 0 0 1px rgba(127,224,196,0.16);" />`;
  const stat = (k: string, v: string, cls = "ink"): string => {
    const col = cls === "mint" ? "rgb(var(--lumen))" : cls === "gold" ? "rgb(var(--firefly))" : "var(--ink-bright)";
    return (
      `<div style="display: flex; justify-content: space-between; align-items: baseline; padding: 3px 0;">` +
      `<span style="font: 9.5px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: rgba(228,236,242,0.5);">${k}</span>` +
      `<span style="font: 14px var(--mono); color: ${col};">${v}</span></div>`
    );
  };
  const head = (name: string, sub: string): string =>
    `<div style="font-variant: small-caps; letter-spacing: 0.03em; font-size: 19px; color: var(--ink-bright);">${name}</div>` +
    `<div style="font: 11px var(--mono); color: rgba(228,236,242,0.5); margin-top: -2px;">${sub}</div>`;
  // a behaviour-gene row: the world card's word leads (behaviourWords — the
  // shared gene→word bridge, same cutoffs as the examine card), the bench's
  // exact figure sits beside it. A wanderer who met "a homebody" in the wild
  // finds the very phrase here, with the number under it made plain.
  const gene = (k: string, word: string, v: string): string =>
    `<div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 3px 0;">` +
    `<span style="font: 9.5px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: rgba(228,236,242,0.5);">${k}</span>` +
    `<span style="text-align: right; white-space: nowrap;">` +
    `<span style="font: italic 12.5px var(--serif); color: var(--ink-bright);">${word}</span>` +
    ` <span style="font: 12px var(--mono); color: rgba(228,236,242,0.55);">${v}</span></span></div>`;

  // the representative insect, drawn from the very sprite the bench flies
  const insectCanvas = (sw: Swarm): string => {
    const k = 14;
    const c = document.createElement("canvas");
    c.width = INSECT_SPRITE * k;
    c.height = INSECT_SPRITE * k;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.drawImage(getInsectSprites(sw).wingA, 0, 0, c.width, c.height);
    return c.toDataURL();
  };

  chrome.showSwarm = (sw, flower) => {
    const res = flower ? Math.round(resemblance(sw.sensor, flower.map) * 100) : 0;
    const b = sw.behavior;
    const w = behaviourWords(b); // the world card's words, the bench's numbers
    plate.innerHTML =
      head("a swarm", "adapting cloud") +
      title("the insect") +
      portrait(insectCanvas(sw)) +
      title("its map · the appearance genome") +
      inset(genomeCanvas(sw.sensor)) +
      title("readout") +
      stat("population", String(Math.round(sw.population)), "mint") +
      stat("resemblance", flower ? res + "%" : "—", "gold") +
      gene("range", w.range, pct(b.range)) +
      gene("nerve", w.nerve, pct(b.nerve)) +
      gene("cohesion", w.cohesion, pct(b.cohesion)) +
      `<div style="font: italic 12px var(--serif); color: rgba(228,236,242,0.55); line-height: 1.5; margin-top: 12px;">the insect is drawn from its map — body from the dominant colour, wing patches from real cells — so as the pool adapts you watch the bug become its flower.</div>`;
    plate.style.display = "block";
  };
  chrome.showFlower = (fl) => {
    plate.innerHTML =
      head("a flower", "a fixed host map") +
      title("flower map · accent ringed") +
      portrait(genomeCanvas(fl.map, fl.accent)) +
      title("readout") +
      stat("nectar", pct(fl.nectar), "gold") +
      `<div style="font: italic 12px var(--serif); color: rgba(228,236,242,0.55); line-height: 1.5; margin-top: 12px;">the ringed cells are its flower accent — the jackpot a swarm earns most by matching.</div>`;
    plate.style.display = "block";
  };

  chrome.onTool = () => {};
  chrome.onPlay = () => {};
  chrome.onStep = () => {};
  chrome.onSpeed = () => {};
  chrome.onPredators = () => {};
  chrome.onCap = () => {};
  return chrome;
}

function pct(v: number): string {
  return Math.round(v * 100) + "%";
}
