import { expect, test } from "vitest";
import { roleLine } from "../src/render/inspect";

// A critter's role — spreader or grazer — is the hidden value that decides
// whether a visit plants or crops. In the sandbox (all info shown) it earns a
// visible tell, the discoverability rule the research set.
test("a disperser reads as a spreader; a grazer as one that crops", () => {
  expect(roleLine("disperser")).toContain("spread");
  expect(roleLine("grazer")).toContain("crop");
});

test("the two roles never read the same", () => {
  expect(roleLine("disperser")).not.toBe(roleLine("grazer"));
});
