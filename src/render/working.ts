// The working view: the pollination economy, drawn into the world.
//
//   "we can't build new amazing complexity without understanding it right"
//
// Every value here is already computed by the sim each heartbeat. This module
// only READS and DRAWS — it never writes, so it cannot perturb a seed and
// carries no determinism risk. Turning it off renders exactly today's picture.
//
// What it shows, and where each reading comes from:
//   hunger          Swarm.energy (0..1 metabolic reserve)      swarm.ts:53
//   carrying pollen Mote.phase === "inbound" (the return leg)  swarms.ts:226
//   can it spread   match >= POLLINATE_MATCH_MIN               swarms.ts:88
//   time to spread  1 / (POLLINATE_CHANCE · match² · fill)     simTelemetry
//   host nectar     Flower.nectar, regen 0.05 / draw 0.25      swarm.ts:12
//
// The grey ring is the important one: it means this cloud will NEVER pollinate
// the flower it is sitting on, however long you run the sim.

import { Flower } from "../life/swarm";
import { WorldSwarm } from "../game/swarms";
import { spreadOdds } from "../game/simTelemetry";

export interface WorkingReading {
  cx: number; // cloud centre, world px
  cy: number;
  hunger: number; // 1 - energy; 0 = fed, 1 = starving
  ringFill: number; // 0..1 progress toward the expected next spread
  canSpread: boolean; // false = match below threshold: it will never pollinate
  carrying: number; // motes on the return leg, pollen aboard
  population: number;
  hostX: number;
  hostY: number;
  hostNectar: number; // 0..1
}

/** How many heartbeats of expected wait fill the ring completely. */
export const RING_HORIZON_TICKS = 40;

export function workingReadings(
  swarms: readonly WorldSwarm[],
  flowerFor: (speciesId: number) => Flower | null,
  matchFor: (ent: WorldSwarm) => number,
): WorkingReading[] {
  const out: WorkingReading[] = [];
  for (const ent of swarms) {
    if (!ent.home) continue;
    const flower = flowerFor(ent.home.species);
    if (!flower) continue;
    const match = matchFor(ent);
    const odds = spreadOdds(match, ent.sw.population, ent.sw.cap);
    // The ring fills as the expected wait shortens: a pairing that spreads
    // every few ticks reads nearly full, a marginal one barely registers.
    const fill =
      odds.expectedTicks === null
        ? 0
        : Math.max(0, Math.min(1, 1 - odds.expectedTicks / RING_HORIZON_TICKS));
    out.push({
      cx: ent.x,
      cy: ent.y,
      hunger: 1 - Math.max(0, Math.min(1, ent.sw.energy)),
      ringFill: odds.canSpread ? fill : 0,
      canSpread: odds.canSpread,
      carrying: ent.motes.reduce((n, m) => n + (m.phase === "inbound" ? 1 : 0), 0),
      population: ent.sw.population,
      hostX: ent.home.x,
      hostY: ent.home.y,
      hostNectar: Math.max(0, Math.min(1, flower.nectar)),
    });
  }
  return out;
}

// Sizes are SCREEN px, converted to world units at draw time. Drawn in world
// units they shrank with the fit zoom: on a whole-construct view a 26px ring
// became a 15px hairline and vanished into the terrain. The instrument's
// markings should stay the same size whatever the magnification.
const RING_R_PX = 26;
const RING_W_PX = 2.5;
const NECTAR_R_PX = 8;
const PIP_PX = 3.5;
const MINT = "127, 224, 196";
const GOLD = "244, 201, 121";
const GREY = "150, 160, 168";

/**
 * Draw the readings. Called with the world-space transform already applied
 * (the same one the swarms themselves are drawn under), so coordinates are
 * world px relative to the camera.
 */
export function drawWorking(
  ctx: CanvasRenderingContext2D,
  readings: readonly WorkingReading[],
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  pxPerWorld: number,
): void {
  if (readings.length === 0) return;
  const k = pxPerWorld > 0 ? 1 / pxPerWorld : 1; // screen px -> world units
  const RING_R = RING_R_PX * k;
  const ringW = RING_W_PX * k;
  const nectarR = NECTAR_R_PX * k;
  const pip = PIP_PX * k;
  ctx.save();
  ctx.lineCap = "butt";
  for (const r of readings) {
    // cull off-screen clouds, with a margin for the ring and the host arc
    const sx = r.cx - camX;
    const sy = r.cy - camY;
    const margin = RING_R * 2;
    if (sx < -margin || sy < -margin || sx > viewW + margin || sy > viewH + margin) continue;

    // the host bloom's nectar: a small arc above the flower, draining as it is
    // fed on and refilling at NECTAR_REGEN
    const hx = r.hostX - camX;
    const hy = r.hostY - camY - 12 * k;
    ctx.lineWidth = ringW * 0.8;
    ctx.strokeStyle = `rgba(${GOLD}, 0.3)`;
    ctx.beginPath();
    ctx.arc(hx, hy, nectarR, Math.PI, 0);
    ctx.stroke();
    if (r.hostNectar > 0.01) {
      ctx.strokeStyle = `rgba(${GOLD}, 0.85)`;
      ctx.beginPath();
      ctx.arc(hx, hy, nectarR, Math.PI, Math.PI + Math.PI * r.hostNectar);
      ctx.stroke();
    }

    // hunger: a translucent grey wash over the cloud as the reserve empties
    if (r.hunger > 0.05) {
      ctx.fillStyle = `rgba(${GREY}, ${(r.hunger * 0.3).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(sx, sy, RING_R * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // the readiness ring: grey and static when this pairing can never spread,
    // mint and filling when it can
    ctx.lineWidth = ringW;
    if (r.canSpread) {
      // the track, then the filled arc: how near the next spread is
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(${MINT}, 0.3)`;
      ctx.beginPath();
      ctx.arc(sx, sy, RING_R, 0, Math.PI * 2);
      ctx.stroke();
      if (r.ringFill > 0) {
        ctx.strokeStyle = `rgba(${MINT}, 0.95)`;
        ctx.beginPath();
        ctx.arc(sx, sy, RING_R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * r.ringFill);
        ctx.stroke();
      }
    } else {
      // NEVER: a broken ring, so it reads as a different KIND of mark and not
      // merely a different colour — this pairing produces no seed, ever.
      ctx.setLineDash([3 * k, 4 * k]);
      ctx.strokeStyle = `rgba(${GREY}, 0.85)`;
      ctx.beginPath();
      ctx.arc(sx, sy, RING_R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // pollen aboard: a gold pip per returning mote, set around the ring
    for (let i = 0; i < r.carrying; i++) {
      const a = (i / Math.max(1, r.carrying)) * Math.PI * 2 - Math.PI / 2;
      ctx.fillStyle = `rgb(${GOLD})`;
      ctx.fillRect(sx + Math.cos(a) * RING_R - pip / 2, sy + Math.sin(a) * RING_R - pip / 2, pip, pip);
    }
  }
  ctx.restore();
}
