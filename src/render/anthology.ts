import { AnthologyEntry } from "../game/murmurs";

function panel(): HTMLElement {
  return document.getElementById("anthology")!;
}

export function isAnthologyOpen(): boolean {
  return panel().style.display === "block";
}

export function closeAnthology(): void {
  panel().style.display = "none";
}

// The murmur echoes, opened: every murmur the world has offered, in the
// order it offered them — your wandering, retold as an anthology.
export function openAnthology(entries: AnthologyEntry[]): void {
  const el = panel();
  el.innerHTML = "";
  const title = document.createElement("div");
  title.className = "anth-title";
  title.textContent = "murmurs gathered";
  el.appendChild(title);
  const epigraph = document.createElement("div");
  epigraph.className = "anth-epigraph";
  epigraph.textContent = "gathered, not written; what is ours is the choosing and the order.";
  el.appendChild(epigraph);
  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className = "anth-empty";
    empty.textContent = "nothing yet — walk, and listen.";
    el.appendChild(empty);
  }
  for (const e of entries) {
    const wrap = document.createElement("div");
    wrap.className = "anth-entry";
    const text = document.createElement("div");
    text.className = "anth-text";
    text.textContent = e.text;
    const attr = document.createElement("div");
    attr.className = "anth-attr";
    attr.textContent = e.attribution;
    const place = document.createElement("div");
    place.className = "anth-place";
    place.textContent = `heard on ${e.place}`;
    wrap.append(text, attr, place);
    el.appendChild(wrap);
  }
  const hint = document.createElement("div");
  hint.className = "anth-hint";
  hint.textContent = "M or Esc to close";
  el.appendChild(hint);
  el.style.display = "block";
  el.scrollTop = el.scrollHeight; // the newest words are where you left off
}
