// The backpack (B): the wanderer's pack as a classic JRPG inventory screen —
// the seed bank browsed and *loaded* here (the deliberate way to choose what the
// pouch offers, beside the quick re-press of 3), the two tools, and the
// materials carried. Cursor-driven, codex art direction. Pure over its view;
// touches the DOM only to fill the panel and read the cursor.

export interface BackpackVarietal {
  species: number;
  name: string;
  hue: number;
  sat: number;
  count: number;
  loaded: boolean;
}

export interface BackpackView {
  varietals: BackpackVarietal[];
  materials: { wood: number; stone: number; rush: number };
}

let view: BackpackView | null = null;
let cursor = 0; // index into varietals

function panel(): HTMLElement {
  return document.getElementById("backpack")!;
}

export function isBackpackOpen(): boolean {
  return panel().style.display === "block";
}

export function closeBackpack(): void {
  panel().style.display = "none";
}

export function backpackMove(dir: 1 | -1): void {
  if (!view || view.varietals.length === 0) return;
  cursor = (cursor + dir + view.varietals.length) % view.varietals.length;
  render();
}

// the species under the cursor — what a load/toss acts on
export function backpackSpecies(): number | null {
  if (!view || view.varietals.length === 0) return null;
  return view.varietals[Math.min(cursor, view.varietals.length - 1)].species;
}

function color(hue: number, sat: number): string {
  return `hsl(${Math.round(hue * 360)}, ${Math.round(Math.max(0.45, sat) * 78)}%, 60%)`;
}

function esc(s: string): string {
  return s.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

export function openBackpack(v: BackpackView): void {
  view = v;
  if (cursor >= v.varietals.length) cursor = Math.max(0, v.varietals.length - 1);
  render();
  panel().style.display = "block";
  panel().scrollTop = 0;
}

function render(): void {
  const el = panel();
  const v = view!;
  const sel = v.varietals[cursor];

  const seedRows = v.varietals.length
    ? v.varietals
        .map((s, i) => {
          const on = i === cursor;
          return `<div class="bp-row${on ? " sel" : ""}" data-i="${i}">
            <span class="bp-cur">${on ? "▸" : ""}</span>
            <span class="bp-dot" style="background:${color(s.hue, s.sat)}"></span>
            <span class="bp-name">${esc(s.name)}${s.loaded ? '<span class="bp-tag">loaded</span>' : ""}</span>
            <span class="bp-ct">&times;${s.count}</span>
          </div>`;
        })
        .join("")
    : `<div class="bp-empty">no seeds yet — hold the hand and press space by a plant</div>`;

  const mats = (["wood", "stone", "rush"] as const)
    .filter((k) => v.materials[k] > 0)
    .map((k) => `<span class="bp-mat">${k} <b>${v.materials[k]}</b></span>`)
    .join("");

  const plate = sel
    ? `<div class="bp-plate">
        <div class="bp-plate-dot" style="background:${color(sel.hue, sel.sat)}"></div>
        <div class="bp-plate-name">${esc(sel.name)}</div>
        <div class="bp-plate-kind">seed${sel.loaded ? " · loaded in the pouch" : ""}</div>
        <div class="bp-rule"></div>
        <div class="bp-plate-lore">${sel.count} of this kind in the pouch. ${
          sel.loaded
            ? "the pouch is holding it — <b>space</b> plants it on tilled ground."
            : "press <b>enter</b> to load it into the pouch."
        }</div>
        <div class="bp-plate-acts">
          <span class="bp-act${sel.loaded ? " done" : ""}"><b>enter</b> ${sel.loaded ? "loaded" : "load"}</span>
          <span class="bp-act ghost"><b>q</b> toss one</span>
        </div>
      </div>`
    : `<div class="bp-plate"><div class="bp-plate-lore">your pouch is empty. gather a seed from a plant to fill it.</div></div>`;

  el.innerHTML = `
    <div class="bp-head"><span class="bp-title">backpack</span><span class="bp-sub">the seed bank · your tools · what you carry</span></div>
    <div class="bp-body">
      <div class="bp-list">
        <div class="bp-section">tools</div>
        <div class="bp-row static"><span class="bp-cur"></span><span class="bp-tool">✋</span><span class="bp-name">bare hand</span><span class="bp-ct">gathers</span></div>
        <div class="bp-row static"><span class="bp-cur"></span><span class="bp-tool">⌇</span><span class="bp-name">hoe</span><span class="bp-ct">tills</span></div>
        <div class="bp-section">seeds &middot; the pouch</div>
        ${seedRows}
        <div class="bp-section">materials</div>
        <div class="bp-mats">${mats || '<span class="bp-empty2">none gathered yet</span>'}</div>
      </div>
      ${plate}
    </div>
    <div class="bp-hint">&uarr;&darr; move &middot; enter load &middot; q toss &middot; B or Esc to close</div>`;

  el.querySelectorAll<HTMLElement>(".bp-row[data-i]").forEach((row) => {
    row.addEventListener("click", () => {
      cursor = Number(row.dataset.i);
      render();
    });
  });
}
