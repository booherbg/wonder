import { expect, test } from "vitest";
import { rollWeb } from "../src/life/rollweb";
import { appetite, APPETITE_MIN } from "../src/life/fauna";
import { hueGap, SUBSTRATE_HUE_MATCH } from "../src/life/flora";
import { chainLinks, chainStats } from "../src/life/foodweb";
import { singleBiome, biomeSampler } from "../src/world/construct";
import { Tile } from "../src/world/types";

const SEED = 4242;

test("rollWeb yields the requested number of chains on a well-populated construct", () => {
  const map = biomeSampler(SEED);
  const web = rollWeb(SEED, 0, 3, new Set([Tile.Grass, Tile.Marsh, Tile.Forest]), map);
  expect(web.chains.length).toBe(3);
});

test("every rolled chain is CLOSABLE under the sim's own matching rules", () => {
  const map = singleBiome(SEED, Tile.Grass, 40);
  const web = rollWeb(SEED, 0, 3, new Set([Tile.Grass]), map);
  expect(web.chains.length).toBeGreaterThan(0);
  for (const ch of web.chains) {
    // the disperser eats the source (appetite over the scenery line)
    expect(appetite(ch.disperser.palate, ch.source.archetype)).toBeGreaterThan(APPETITE_MIN);
    // the feeder is a substrate-feeder in the source's hue window
    expect(ch.feeder.substrateFeeder).toBe(true);
    expect(hueGap(ch.feeder.archetype.hue, ch.source.archetype.hue)).toBeLessThanOrEqual(SUBSTRATE_HUE_MATCH);
    // and the disperser eats the feeder too → the loop closes
    expect(appetite(ch.disperser.palate, ch.feeder.archetype)).toBeGreaterThan(APPETITE_MIN);
    expect(ch.disperser.role).toBe("disperser"); // a grazer would bite, not scatter — no byproduct
    // the feeder shares the source's habitat, so the in-sim germinate rule (same tile) can fire
    expect(ch.feeder.habitat).toBe(ch.source.habitat);
    // foodweb.ts AGREES: a closable link + closable chain stats exist
    const links = chainLinks([ch.source, ch.feeder], [ch.disperser]);
    expect(links.some((l) => l.closes)).toBe(true);
    const stats = chainStats([ch.source, ch.feeder], [ch.disperser]);
    expect(stats.chains).toBeGreaterThanOrEqual(1);
    expect(stats.closable).toBeGreaterThanOrEqual(1);
  }
});

test("rollWeb is deterministic; a different cursor gives a different web", () => {
  const map = singleBiome(SEED, Tile.Grass, 40);
  const sig = (w: ReturnType<typeof rollWeb>) =>
    w.chains.map((c) => [c.source.name, Math.round(c.source.archetype.hue * 1e4), c.disperser.name]);
  expect(sig(rollWeb(SEED, 0, 3, new Set([Tile.Grass]), map))).toEqual(
    sig(rollWeb(SEED, 0, 3, new Set([Tile.Grass]), map)),
  );
  expect(sig(rollWeb(SEED, 0, 3, new Set([Tile.Grass]), map))).not.toEqual(
    sig(rollWeb(SEED, 1, 3, new Set([Tile.Grass]), map)),
  );
});
