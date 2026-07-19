import { expect, test } from "vitest";
import { hourLine } from "../src/render/inspect";

const base = { darkness: 0, tide: 0.3, aurora: false, biolume: false, bloom: false, rain: 0 };

test("the night hours: deep dark, an aurora, a glowing tide, a low tide", () => {
  expect(hourLine({ ...base, darkness: 0.75 })).toBe("the deep of night");
  expect(hourLine({ ...base, darkness: 0.75, aurora: true })).toContain("aurora");
  expect(hourLine({ ...base, darkness: 0.75, biolume: true })).toContain("glowing");
  expect(hourLine({ ...base, darkness: 0.75, tide: 0.9 })).toContain("low tide");
});

test("the day hours: daylight, low tide, a bloom, a shower, the half-light", () => {
  expect(hourLine({ ...base })).toBe("broad, quiet daylight");
  expect(hourLine({ ...base, tide: 0.9 })).toContain("low tide");
  expect(hourLine({ ...base, bloom: true })).toContain("fungi");
  expect(hourLine({ ...base, rain: 0.5 })).toContain("shower");
  expect(hourLine({ ...base, darkness: 0.3 })).toContain("half-light");
});

test("the deep dark comes first — a passing shower never overrides night", () => {
  expect(hourLine({ ...base, darkness: 0.7, rain: 0.9 })).toBe("the deep of night");
});
