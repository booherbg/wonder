/** @vitest-environment happy-dom */
import { describe, expect, it } from "vitest";
import { buildDock, nextTabState } from "../src/game/simDock";

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

describe("buildDock working control", () => {
  it("exposes a working header control with setWorking / onWorking", () => {
    const host = document.createElement("div");
    const dock = buildDock(host);

    const btn = host.querySelector("#dock-working-btn") as HTMLButtonElement | null;
    expect(btn).not.toBeNull();
    expect(btn!.textContent).toBe("working");

    const seen: boolean[] = [];
    dock.onWorking((next) => seen.push(next));

    dock.setWorking(true);
    expect(btn!.getAttribute("aria-pressed")).toBe("true");

    dock.setWorking(false);
    expect(btn!.getAttribute("aria-pressed")).toBe("false");

    btn!.click();
    expect(seen).toEqual([true]);
    dock.setWorking(true);
    btn!.click();
    expect(seen).toEqual([true, false]);
  });

  it("does not require an onWorking listener to toggle face via setWorking", () => {
    const host = document.createElement("div");
    const dock = buildDock(host);
    expect(() => dock.setWorking(true)).not.toThrow();
    expect((host.querySelector("#dock-working-btn") as HTMLButtonElement).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });
});

describe("buildDock collapse — the desktop Read rail", () => {
  it("keeps the tab strip clickable when every body is hidden", () => {
    const host = document.createElement("div");
    const dock = buildDock(host);
    dock.setCollapsed(true);

    // The strip survives so Read still has a door; only the bodies go away.
    const strip = host.querySelector('[role="tablist"]') as HTMLElement;
    expect(strip.style.display).not.toBe("none");
    const tab = host.querySelector("#dock-tab-pressures") as HTMLButtonElement;
    expect(tab).not.toBeNull();

    const bodies = host.children[1] as HTMLElement;
    expect(bodies.style.display).toBe("none");

    // Clicking a tab in the collapsed rail opens it.
    tab.click();
    expect(dock.activeTab()).toBe("pressures");
  });

  it("restores the bodies when uncollapsed", () => {
    const host = document.createElement("div");
    const dock = buildDock(host);
    dock.setCollapsed(true);
    dock.setCollapsed(false);
    expect((host.children[1] as HTMLElement).style.display).not.toBe("none");
  });
});
