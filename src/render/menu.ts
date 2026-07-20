// The menu (Tab): a quiet home for everything that isn't an immediate verb —
// the backpack, the isles you've known, the field guide — and, when you stand
// at your camp, what's built there and what you could build next. The HUD keeps
// only the verbs you reach for constantly; the rest tucks in here, discoverable
// without crowding the world.

export interface MenuAction {
  key: string; // the shortcut that also does this, shown on the row
  label: string;
}

// The tucked-away actions, each naming the key that also triggers it — so the
// menu teaches the shortcuts rather than hiding them. Toss only appears when
// there's a seed to give back.
export function menuLaunchers(pouchCount: number): MenuAction[] {
  const out: MenuAction[] = [
    { key: "L", label: "the isles you've known" },
    { key: "?", label: "the field guide" },
    { key: "M", label: "the murmurs" },
    { key: "J", label: "the field journal" },
    { key: "P", label: "save a postcard" },
    { key: "N", label: "name this world" },
  ];
  if (pouchCount > 0) out.push({ key: "Q", label: "toss a seed to the wind" });
  return out;
}

export interface CampActionRow {
  id: "fire" | "bedroll";
  label: string; // a recipe with its cost, or — once built — what it is
  ready: boolean; // you carry enough to build it now
  done: boolean; // already standing
}

interface CampCosts {
  fire: { wood: number; stone: number };
  bedroll: { wood: number; rush: number };
}

// The buildable camp actions, said as goals: what each needs (quoting the true
// costs, so the menu can never drift from materials.ts), whether you can raise
// it now, and whether it already stands. A greyed row with its requirement is a
// visible objective — the hidden recipe made plain.
export function campActionRows(
  mat: { wood: number; stone: number; rush: number },
  fire: boolean,
  bedroll: boolean,
  cost: CampCosts,
): CampActionRow[] {
  return [
    {
      id: "fire",
      done: fire,
      ready: mat.wood >= cost.fire.wood && mat.stone >= cost.fire.stone,
      label: fire
        ? "a fire, burning every night"
        : `make a fire — ${cost.fire.wood} driftwood · ${cost.fire.stone} stones`,
    },
    {
      id: "bedroll",
      done: bedroll,
      ready: mat.wood >= cost.bedroll.wood && mat.rush >= cost.bedroll.rush,
      label: bedroll
        ? "a bedroll of woven rushes"
        : `weave a bedroll — ${cost.bedroll.wood} driftwood · ${cost.bedroll.rush} rushes`,
    },
  ];
}
