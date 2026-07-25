// The select tool's hit test, pure so its ranking is testable without a DOM.
//
// The rule this replaces was class priority — swarm beat critter beat plant,
// unconditionally — with the swarm also holding 2.3× the pick radius. Because
// clouds hover over the blooms they work, that combination made the flower
// under a swarm unreachable: exactly the pairing the bench exists to study.
//
// The rule now: rank by distance measured in units of each kind's OWN radius.
// Clouds keep their extra reach (they drift, and a drifting target deserves a
// wider one), but they no longer win a tie by virtue of being a cloud. Where
// several things overlap, the caller cycles through them.

import { TILE_SIZE } from "../world/config";

export type PickKind = "swarm" | "critter" | "plant";

export const RADIUS_FOR: Record<PickKind, number> = {
  swarm: 3.5 * TILE_SIZE, // clouds drift; give the click more reach than plants
  critter: 1.5 * TILE_SIZE,
  plant: 1.5 * TILE_SIZE,
};

export interface Positioned {
  x: number;
  y: number;
}

export interface Candidate<T extends Positioned = Positioned> {
  kind: PickKind;
  ref: T;
  score: number; // distance / RADIUS_FOR[kind] — at most 1, since out-of-reach is dropped
}

export interface RankInput {
  wx: number;
  wy: number;
  swarms: readonly Positioned[];
  critters: readonly Positioned[];
  plants: readonly Positioned[];
}

function collect(
  out: Candidate[],
  kind: PickKind,
  items: readonly Positioned[],
  wx: number,
  wy: number,
): void {
  const radius = RADIUS_FOR[kind];
  for (const ref of items) {
    const score = Math.hypot(ref.x - wx, ref.y - wy) / radius;
    if (score <= 1) out.push({ kind, ref, score });
  }
}

/** Every in-reach candidate, nearest-relative-to-its-own-radius first. */
export function rankCandidates(input: RankInput): Candidate[] {
  const out: Candidate[] = [];
  collect(out, "swarm", input.swarms, input.wx, input.wy);
  collect(out, "critter", input.critters, input.wx, input.wy);
  collect(out, "plant", input.plants, input.wx, input.wy);
  out.sort((a, b) => a.score - b.score);
  return out;
}

/**
 * Which candidate a click selects. Clicking the same spot again advances
 * through the stack — so a flower under a swarm is two clicks — while clicking
 * anywhere else starts over at the nearest.
 */
export function cycleIndex(
  prevKey: string | null,
  nextKey: string,
  prevIndex: number,
  count: number,
): number {
  if (count <= 0) return 0;
  if (prevKey !== nextKey) return 0;
  return (prevIndex + 1) % count;
}
