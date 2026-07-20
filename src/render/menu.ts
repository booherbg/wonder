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
    { key: "C", label: "the living web — this island's chains" },
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

// ── the panel ─────────────────────────────────────────────────────────────

export interface MenuModel {
  pouch: { name: string }[]; // seeds carried, by kind name
  mat: { wood: number; stone: number; rush: number; soil: number };
  camp?: { lines: string[]; actions: CampActionRow[] }; // present only at camp
}

export interface MenuHandlers {
  launch: (key: string) => void; // a launcher row was chosen (or its shortcut)
  build: (id: "fire" | "bedroll") => void; // raise a camp thing
  abandon: () => void; // strike camp — confirmed by a second click
}

function panel(): HTMLElement {
  return document.getElementById("menu")!;
}

export function isMenuOpen(): boolean {
  return panel().style.display === "block";
}

export function closeMenu(): void {
  panel().style.display = "none";
}

function section(el: HTMLElement, text: string): void {
  const d = document.createElement("div");
  d.className = "menu-section";
  d.textContent = text;
  el.appendChild(d);
}

function line(el: HTMLElement, text: string): void {
  const d = document.createElement("div");
  d.className = "menu-line";
  d.textContent = text;
  el.appendChild(d);
}

// The menu, opened: the camp (when you stand in it), then your backpack, then
// the tucked-away doors. Building refreshes in place; abandoning asks twice.
export function openMenu(model: MenuModel, handlers: MenuHandlers): void {
  const el = panel();
  el.innerHTML = "";
  const title = document.createElement("div");
  title.className = "anth-title";
  title.textContent = "menu";
  el.appendChild(title);
  const epigraph = document.createElement("div");
  epigraph.className = "anth-epigraph";
  epigraph.textContent = "everything that isn't an immediate step — your pack, the isles, the guide.";
  el.appendChild(epigraph);

  if (model.camp) {
    section(el, "your camp");
    for (const l of model.camp.lines) line(el, l);
    for (const a of model.camp.actions) {
      if (a.done) {
        const row = document.createElement("div");
        row.className = "menu-row built";
        row.textContent = `· ${a.label}`;
        el.appendChild(row);
        continue;
      }
      const row = document.createElement("div");
      row.className = a.ready ? "menu-row" : "menu-row disabled";
      const label = document.createElement("span");
      label.textContent = a.label;
      row.appendChild(label);
      if (a.ready) row.addEventListener("click", () => handlers.build(a.id));
      el.appendChild(row);
    }
    // striking camp is deliberate: it takes two clicks to let a place go
    const abandon = document.createElement("div");
    abandon.className = "menu-row abandon";
    abandon.textContent = "abandon camp";
    let armed = false;
    abandon.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        abandon.textContent = "click again to abandon this camp";
        return;
      }
      handlers.abandon();
    });
    el.appendChild(abandon);
  }

  section(el, "your backpack");
  const carried = (["wood", "stone", "rush", "soil"] as const)
    .filter((k) => model.mat[k] > 0)
    .map((k) => `${k} ${model.mat[k]}`);
  line(el, carried.length > 0 ? carried.join(" · ") : "no materials gathered yet");
  line(
    el,
    model.pouch.length > 0
      ? `seeds: ${model.pouch.map((s) => s.name).join(" · ")}`
      : "the seed pouch is empty",
  );

  section(el, "more");
  for (const a of menuLaunchers(model.pouch.length)) {
    const row = document.createElement("div");
    row.className = "menu-row";
    const label = document.createElement("span");
    label.textContent = a.label;
    const key = document.createElement("span");
    key.className = "menu-key";
    key.textContent = a.key;
    row.append(label, key);
    row.addEventListener("click", () => handlers.launch(a.key));
    el.appendChild(row);
  }

  const hint = document.createElement("div");
  hint.className = "anth-hint";
  hint.textContent = "Tab or Esc to close";
  el.appendChild(hint);
  el.style.display = "block";
  el.scrollTop = 0;
}
