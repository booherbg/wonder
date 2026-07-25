// One dock, five tabs, one open-state. Clicking the open tab closes it;
// clicking another switches. The active tab button is visibly selected —
// aria-selected + mint — so open-state is never a secret again.
//
// What this replaces: four independently-fixed overlay panels (ledger, web,
// pressures, inspect) each with their own open flag and no shared close rule.

import { attachTooltip } from "../render/tooltip";

export type TabId = "subject" | "exchange" | "web" | "ledger" | "pressures";

export const TAB_IDS: TabId[] = ["subject", "exchange", "web", "ledger", "pressures"];

const TAB_LABEL: Record<TabId, string> = {
  subject: "subject",
  exchange: "exchange",
  web: "web",
  ledger: "ledger",
  pressures: "pressures",
};

const TAB_HELP: Record<TabId, string> = {
  subject: "selected plant, critter, or cloud",
  exchange: "nectar economy · pollen · spread readiness",
  web: "food web · chains",
  ledger: "census · population / tick",
  pressures: "island-wide evolutionary levers",
};

const MONO = "font: 11px var(--mono); letter-spacing: 0.06em;";

function tabBtnStyle(active: boolean): string {
  return (
    `${MONO} text-transform: uppercase; cursor: pointer; border: none; border-radius: 4px;` +
    ` padding: 7px 10px; color: ${active ? "var(--ink-bright)" : "rgba(228,236,242,0.55)"};` +
    ` background: ${active ? "rgba(127,224,196,0.16)" : "transparent"};`
  );
}

/** Clicking the open tab closes the dock; clicking another switches to it. */
export function nextTabState(current: TabId | null, clicked: TabId): TabId | null {
  return current === clicked ? null : clicked;
}

export interface Dock {
  setTab(id: TabId | null): void;
  body(id: TabId): HTMLElement;
  onTab(fn: (id: TabId | null) => void): void;
  activeTab(): TabId | null;
}

export function buildDock(host: HTMLElement): Dock {
  host.style.flexDirection = "column";
  host.style.minHeight = "0";
  host.style.boxSizing = "border-box";

  const strip = document.createElement("div");
  strip.setAttribute("role", "tablist");
  strip.style.cssText =
    "display: flex; flex-wrap: wrap; gap: 2px; padding: 8px 8px 0; flex: 0 0 auto;" +
    " border-bottom: 1px solid rgba(127,224,196,0.14);";

  const bodiesHost = document.createElement("div");
  // Flow layout (not absolute inset): the host only had max-height, so a
  // flex:1 absolute body collapsed to 0px and ate all clicks on tab content.
  bodiesHost.style.cssText =
    "flex: 1 1 auto; min-height: 0; max-height: calc(100vh - 220px); overflow-y: auto;";

  const buttons = new Map<TabId, HTMLButtonElement>();
  const bodies = new Map<TabId, HTMLElement>();
  let active: TabId | null = null;
  let listener: ((id: TabId | null) => void) | null = null;

  for (const id of TAB_IDS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = `dock-tab-${id}`;
    btn.setAttribute("role", "tab");
    btn.setAttribute("aria-selected", "false");
    btn.textContent = TAB_LABEL[id];
    btn.style.cssText = tabBtnStyle(false);
    attachTooltip(btn, TAB_HELP[id]);
    btn.onclick = () => {
      dock.setTab(nextTabState(active, id));
    };
    strip.appendChild(btn);
    buttons.set(id, btn);

    const body = document.createElement("div");
    body.id = `dock-body-${id}`;
    body.setAttribute("role", "tabpanel");
    body.style.cssText =
      "display: none; padding: 14px 16px;" +
      " color: var(--ink); font-family: var(--serif);";
    bodiesHost.appendChild(body);
    bodies.set(id, body);
  }

  host.append(strip, bodiesHost);

  const paint = (): void => {
    for (const id of TAB_IDS) {
      const on = id === active;
      const btn = buttons.get(id)!;
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.style.cssText = tabBtnStyle(on);
      bodies.get(id)!.style.display = on ? "block" : "none";
    }
  };

  const dock: Dock = {
    setTab(id) {
      active = id;
      paint();
      listener?.(active);
    },
    body(id) {
      return bodies.get(id)!;
    },
    onTab(fn) {
      listener = fn;
    },
    activeTab() {
      return active;
    },
  };

  paint();
  return dock;
}
