// The front door (title screen): the rows are data (this file, testable),
// the screen is DOM (below, Task 3) — the split menu.ts uses.

import { formatStamp } from "../version";

export type TitleRowId = "continue" | "new" | "isles" | "sim" | "guide";

export interface TitleRow {
  id: TitleRowId;
  label: string;
}

export interface TitleState {
  lastSeed: number | null; // the island last entered, if any
  lastName: string | null; // its name, for the continue row
  savedCount: number; // how many isles are saved (the picker's size)
}

// Which rows the front door offers, in order. Empty rows are absent, never
// greyed — the menu only ever shows what's real.
export function titleRows(state: TitleState): TitleRow[] {
  const rows: TitleRow[] = [];
  if (state.lastSeed !== null) {
    rows.push({ id: "continue", label: `continue — ${state.lastName ?? "your island"}` });
  }
  rows.push({ id: "new", label: "a new island" });
  if (state.savedCount > 0) rows.push({ id: "isles", label: "the isles you've known" });
  rows.push({ id: "sim", label: "the simulator" });
  rows.push({ id: "guide", label: "the field guide" });
  return rows;
}

export interface TitleHandlers {
  choose: (id: TitleRowId) => void;
}

function panel(): HTMLElement {
  return document.getElementById("title")!;
}

export function isTitleOpen(): boolean {
  return panel().classList.contains("on");
}

export function hideTitle(): void {
  panel().classList.remove("on");
}

// The front door, mounted: the rows for this wanderer's state, each a door.
export function showTitle(state: TitleState, handlers: TitleHandlers): void {
  const el = panel();
  const rows = el.querySelector(".title-rows") as HTMLElement;
  rows.innerHTML = "";
  for (const r of titleRows(state)) {
    const row = document.createElement("div");
    row.className = "title-row";
    row.textContent = r.label;
    row.addEventListener("click", () => handlers.choose(r.id));
    rows.appendChild(row);
  }
  (el.querySelector(".title-stamp") as HTMLElement).textContent = formatStamp();
  el.classList.add("on");
}
