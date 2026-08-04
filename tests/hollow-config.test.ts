import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, HOLLOW_CONFIG, configForStyle } from "../src/world/config";
import { generate } from "../src/world/generate";

describe("the Hollow's island style", () => {
  it("leaves the classic config untouched", () => {
    expect(configForStyle("classic")).toEqual(DEFAULT_CONFIG);
    expect(DEFAULT_CONFIG.width).toBe(300);
    expect(DEFAULT_CONFIG.height).toBe(300);
  });

  it("is smaller and denser than the classic island", () => {
    expect(HOLLOW_CONFIG.width).toBeLessThan(DEFAULT_CONFIG.width);
    expect(HOLLOW_CONFIG.forestMoisture).toBeLessThan(DEFAULT_CONFIG.forestMoisture);
  });

  it("generates a walkable island", () => {
    const map = generate(1, HOLLOW_CONFIG);
    expect(map.width).toBe(HOLLOW_CONFIG.width);
    expect(map.spawn.x).toBeGreaterThanOrEqual(0);
  });

  it("generates walkable islands across many seeds", () => {
    for (let s = 1; s <= 12; s++) {
      const map = generate(s, HOLLOW_CONFIG);
      expect(map.spawn.x).toBeGreaterThanOrEqual(0);
      expect(map.spawn.y).toBeGreaterThanOrEqual(0);
    }
  });
});
