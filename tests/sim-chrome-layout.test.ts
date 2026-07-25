import { expect, test } from "vitest";
import { NARROW } from "../src/game/simLayout";
import {
  materialsForTool,
  isNarrowViewport,
  primaryLeftOverlay,
} from "../src/game/simChromeLayout";

test("paint opens tile materials; place opens life; select/erase/cloud open none", () => {
  expect(materialsForTool("paint")).toBe("tiles");
  expect(materialsForTool("place")).toBe("life");
  expect(materialsForTool("select")).toBe(null);
  expect(materialsForTool("erase")).toBe(null);
  expect(materialsForTool("cloud")).toBe(null);
});

test("narrow breakpoint matches layout NARROW", () => {
  expect(isNarrowViewport(899)).toBe(true);
  expect(isNarrowViewport(900)).toBe(false);
  expect(NARROW).toBe(900);
});

test("left edge allows only one primary overlay — roll beats flyout", () => {
  expect(primaryLeftOverlay({ flyout: true, roll: false, drawer: false })).toBe("flyout");
  expect(primaryLeftOverlay({ flyout: true, roll: true, drawer: false })).toBe("roll");
  expect(primaryLeftOverlay({ flyout: false, roll: false, drawer: true })).toBe("drawer");
});
