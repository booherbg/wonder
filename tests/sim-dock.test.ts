import { describe, expect, it } from "vitest";
import { nextTabState } from "../src/game/simDock";

describe("nextTabState", () => {
  it("opens a tab when none is open", () => {
    expect(nextTabState(null, "web")).toBe("web");
  });

  it("switches between tabs", () => {
    expect(nextTabState("ledger", "web")).toBe("web");
  });

  it("closes when the open tab is clicked again — the answer to 'how do I close this'", () => {
    expect(nextTabState("web", "web")).toBeNull();
  });
});
