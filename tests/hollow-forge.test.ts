import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, HOLLOW_CONFIG, IslandStyle, configForStyle } from "../src/world/config";
import { defaultForgeState, forgeArgs } from "../src/render/forgeArgs";

const STYLES: IslandStyle[] = ["classic", "hollow"];

describe("forge island style", () => {
  it("defaults to classic so an unchanged forge builds an unchanged island", () => {
    expect(configForStyle("classic")).toEqual(DEFAULT_CONFIG);
    expect(defaultForgeState(7).style).toBe("classic");
  });

  it("offers exactly the two styles stage 1 ships", () => {
    for (const s of STYLES) expect(configForStyle(s)).toBeDefined();
  });

  it("carries the chosen style through to worldgen", () => {
    for (const style of STYLES) {
      const { gen } = forgeArgs({ ...defaultForgeState(7), style });
      expect(gen.style).toBe(style);
    }
  });

  it("hands classic the same config it always did, style field aside", () => {
    const state = defaultForgeState(7);
    const { seed, gen } = forgeArgs(state);
    expect(seed).toBe(7);
    expect(gen.config).toEqual(DEFAULT_CONFIG);
  });

  // makeHollow generates from HOLLOW_CONFIG and nothing else, so the config
  // forgeArgs reports for a Hollow must be HOLLOW_CONFIG exactly — the size
  // and fine-grain knobs never reach that map, and a config edited by them
  // would describe an island that was never built.
  it("ignores the terrain knobs for the Hollow, which sets its own", () => {
    const state = { ...defaultForgeState(7), style: "hollow" as const };
    state.width = 400;
    state.height = 400;
    state.cfg = { forestMoisture: 0.9, riverCount: 20 };
    const { gen } = forgeArgs(state);
    expect(gen.config).toEqual(HOLLOW_CONFIG);
  });
});
