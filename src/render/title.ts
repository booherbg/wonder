// The front door (title screen): the rows are data (this file, testable),
// the screen is DOM (below, Task 3) — the split menu.ts uses.

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
