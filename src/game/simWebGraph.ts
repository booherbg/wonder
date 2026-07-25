// The food chain, laid out. PURE: deterministic, no rng, no DOM — so the
// shape of a web is testable, and the same links always draw the same picture.
//
// A chain is source-plant → disperser-critter → feeder-plant: the critter eats
// the source and its leavings wake the feeder. The layout is layered by that
// role, left to right, because the reading you want from a food web is "what
// feeds what", and a layered graph answers it at a glance where a force
// simulation would only look busy.
//
// A species can hold more than one role (a feeder that something also eats is
// how a loop closes). It appears ONCE, in its leftmost column, so the picture
// stays a set of species rather than a set of appearances.

export interface WebLinkInput {
  sourceId: number;
  sourceName: string;
  sourceHue: number;
  disperserId: number;
  disperserName: string;
  feederId: number;
  feederName: string;
  feederHue: number;
  closes: boolean;
}

export type WebNodeKind = "plant" | "critter";

export interface WebNode {
  key: string; // "plant:3" / "critter:1" — unique across kinds
  id: number;
  name: string;
  kind: WebNodeKind;
  hue: number; // 0..1 for plants; critters carry 0 and are drawn neutral
  col: number; // 0 source · 1 disperser · 2 feeder
  row: number;
  x: number;
  y: number;
}

export interface WebEdge {
  from: string; // node key
  to: string;
  label: string; // "eats" / "wakes"
  closes: boolean;
}

export interface WebGraph {
  nodes: WebNode[];
  edges: WebEdge[];
  closed: number; // how many links close their loop
}

export const COL_W = 150;
export const ROW_H = 64;
export const PAD = 20;

const keyOf = (kind: WebNodeKind, id: number): string => `${kind}:${id}`;

/**
 * Lay the links out in three columns. Deterministic: nodes are ordered by
 * first appearance in `links`, so the same input always yields the same
 * picture — no rng, no measured text, nothing frame-dependent.
 */
export function layoutWeb(links: readonly WebLinkInput[]): WebGraph {
  const nodes = new Map<string, WebNode>();
  const edges: WebEdge[] = [];

  const place = (kind: WebNodeKind, id: number, name: string, hue: number, col: number): string => {
    const key = keyOf(kind, id);
    const existing = nodes.get(key);
    if (existing) {
      // A species in two roles keeps its LEFTMOST column, so a loop reads as
      // one species feeding back rather than as two unrelated boxes.
      if (col < existing.col) existing.col = col;
      return key;
    }
    nodes.set(key, { key, id, name, kind, hue, col, row: 0, x: 0, y: 0 });
    return key;
  };

  for (const l of links) {
    const src = place("plant", l.sourceId, l.sourceName, l.sourceHue, 0);
    const dsp = place("critter", l.disperserId, l.disperserName, 0, 1);
    const fed = place("plant", l.feederId, l.feederName, l.feederHue, 2);
    edges.push({ from: src, to: dsp, label: "eats", closes: false });
    edges.push({ from: dsp, to: fed, label: "wakes", closes: l.closes });
  }

  // rows within each column, in insertion order — stable and repeatable
  const perCol = new Map<number, number>();
  for (const n of [...nodes.values()]) {
    const row = perCol.get(n.col) ?? 0;
    n.row = row;
    perCol.set(n.col, row + 1);
    n.x = PAD + n.col * COL_W;
    n.y = PAD + row * ROW_H;
  }

  return {
    nodes: [...nodes.values()],
    edges,
    closed: links.filter((l) => l.closes).length,
  };
}

/** The graph's extent, for sizing the svg viewBox. */
export function webExtent(g: WebGraph): { width: number; height: number } {
  let w = 0;
  let h = 0;
  for (const n of g.nodes) {
    w = Math.max(w, n.x + COL_W);
    h = Math.max(h, n.y + ROW_H);
  }
  return { width: Math.max(COL_W, w), height: Math.max(ROW_H, h) };
}
