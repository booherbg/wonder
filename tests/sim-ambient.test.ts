import { expect, test } from "vitest";
import { AMBIENT_ROLES, roleBadge } from "../src/game/simAmbient";

test("the ambient menu offers the clean opt-in roles with disperser as the reset", () => {
  const ids = AMBIENT_ROLES.map((r) => r.id);
  expect(ids[0]).toBe("disperser"); // the reset — a toggled kind can always be handed back
  expect(ids).toContain("pollinator");
  expect(ids).toContain("nutrient-shuttle");
});

test("every ambient role carries a lowercase label and an evocative help line", () => {
  for (const r of AMBIENT_ROLES) {
    expect(r.label).toBe(r.label.toLowerCase());
    expect(r.help.length).toBeGreaterThan(0);
  }
});

test("roleBadge marks the opt-in roles and leaves the default plain", () => {
  expect(roleBadge("disperser")).toBe("");
  expect(roleBadge("pollinator")).toBe("✿");
  expect(roleBadge("nutrient-shuttle")).toBe("❖");
});

test("the ambient menu includes the fish aquatic-grazer role with a badge", () => {
  expect(AMBIENT_ROLES.map((r) => r.id)).toContain("aquatic-grazer");
  expect(roleBadge("aquatic-grazer")).toBe("≈");
});
