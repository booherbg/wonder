import { describe, expect, it } from "vitest";
import { COL_W, PAD, ROW_H, WebLinkInput, layoutWeb, webExtent } from "../src/game/simWebGraph";

const link = (partial: Partial<WebLinkInput> & Pick<WebLinkInput, "sourceId" | "disperserId" | "feederId">): WebLinkInput => ({
  sourceName: `src-${partial.sourceId}`,
  sourceHue: 0.2,
  disperserName: `dsp-${partial.disperserId}`,
  feederName: `fed-${partial.feederId}`,
  feederHue: 0.6,
  closes: false,
  ...partial,
});

describe("layoutWeb", () => {
  it("places sources, dispersers and feeders in columns 0 · 1 · 2", () => {
    const g = layoutWeb([link({ sourceId: 1, disperserId: 10, feederId: 2 })]);
    const byKey = Object.fromEntries(g.nodes.map((n) => [n.key, n]));
    expect(byKey["plant:1"].col).toBe(0);
    expect(byKey["critter:10"].col).toBe(1);
    expect(byKey["plant:2"].col).toBe(2);
    expect(byKey["plant:1"].x).toBe(PAD + 0 * COL_W);
    expect(byKey["critter:10"].x).toBe(PAD + 1 * COL_W);
    expect(byKey["plant:2"].x).toBe(PAD + 2 * COL_W);
  });

  it("keeps a species that is both source and feeder once, in its leftmost column", () => {
    // plant 1 feeds plant 2; plant 2 also feeds plant 1 (loop) — plant 1 appears
    // as source (col 0) and as feeder (col 2) across links; it stays at col 0.
    const g = layoutWeb([
      link({ sourceId: 1, disperserId: 10, feederId: 2, closes: true }),
      link({ sourceId: 2, disperserId: 10, feederId: 1, closes: true }),
    ]);
    const plants = g.nodes.filter((n) => n.kind === "plant");
    expect(plants.filter((n) => n.id === 1)).toHaveLength(1);
    expect(plants.find((n) => n.id === 1)!.col).toBe(0);
  });

  it("marks closed loops on the waking edge and counts them", () => {
    const g = layoutWeb([
      link({ sourceId: 1, disperserId: 10, feederId: 2, closes: true }),
      link({ sourceId: 3, disperserId: 11, feederId: 4, closes: false }),
    ]);
    const wake = g.edges.filter((e) => e.label === "wakes");
    expect(wake.find((e) => e.to === "plant:2")!.closes).toBe(true);
    expect(wake.find((e) => e.to === "plant:4")!.closes).toBe(false);
    expect(g.closed).toBe(1);
  });

  it("is deterministic for the same input", () => {
    const links = [
      link({ sourceId: 5, disperserId: 1, feederId: 7, closes: true }),
      link({ sourceId: 2, disperserId: 3, feederId: 4 }),
    ];
    expect(layoutWeb(links)).toEqual(layoutWeb(links));
  });

  it("yields empty nodes and edges for an empty link list", () => {
    const g = layoutWeb([]);
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
    expect(g.closed).toBe(0);
    expect(webExtent(g)).toEqual({ width: COL_W, height: ROW_H });
  });

  it("stacks rows within a column in insertion order", () => {
    const g = layoutWeb([
      link({ sourceId: 1, disperserId: 10, feederId: 3 }),
      link({ sourceId: 2, disperserId: 11, feederId: 4 }),
    ]);
    const sources = g.nodes.filter((n) => n.col === 0).sort((a, b) => a.row - b.row);
    expect(sources.map((n) => n.id)).toEqual([1, 2]);
    expect(sources[0].y).toBe(PAD);
    expect(sources[1].y).toBe(PAD + ROW_H);
  });
});
