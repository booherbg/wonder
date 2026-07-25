// The bench's frame: where the construct is allowed to live.
//
// The old arrangement had no frame at all. Every panel was `position: fixed`
// and the canvas was always the full viewport, so chrome could only ever sit
// ON TOP of the construct — and the bottom cluster, being bottom-anchored and
// column-reverse with a max-height of nearly the whole viewport, grew UPWARD
// across it as trays opened. Half the screen went to controls covering the
// thing the controls were operating on.
//
// The fix is to reserve space by MEASUREMENT rather than by guesswork: the
// chrome reports how much room it is taking on each edge, and the canvas gets
// exactly what is left. Panels can then grow freely — the construct shrinks to
// accommodate them instead of disappearing under them.
//
// Pure: `canvasBoxFor` does the arithmetic and is tested without a DOM.

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Never shrink the construct below this; past it, chrome overlaps again
 *  rather than squeezing the world to nothing on a small window. */
export const MIN_CANVAS = { width: 320, height: 240 };

/** Breathing room between the chrome and the construct's edge. */
export const GUTTER = 10;

export function canvasBoxFor(
  viewportW: number,
  viewportH: number,
  insets: Insets,
  gutter = GUTTER,
): Box {
  const left = Math.max(0, insets.left) + (insets.left > 0 ? gutter : 0);
  const top = Math.max(0, insets.top) + (insets.top > 0 ? gutter : 0);
  const right = Math.max(0, insets.right) + (insets.right > 0 ? gutter : 0);
  const bottom = Math.max(0, insets.bottom) + (insets.bottom > 0 ? gutter : 0);

  let width = viewportW - left - right;
  let height = viewportH - top - bottom;

  // On a window too small to honour the reservation, give the construct its
  // floor and let the chrome overlap — a cramped view beats a vanished one.
  if (width < MIN_CANVAS.width) width = Math.min(viewportW, MIN_CANVAS.width);
  if (height < MIN_CANVAS.height) height = Math.min(viewportH, MIN_CANVAS.height);

  return {
    left: Math.min(left, Math.max(0, viewportW - width)),
    top: Math.min(top, Math.max(0, viewportH - height)),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  };
}

/** How much of each edge a fixed panel occupies, or 0 when it is hidden. */
export function edgeInset(el: HTMLElement | null, edge: keyof Insets): number {
  if (!el) return 0;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return 0;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return 0;
  switch (edge) {
    case "left":
      return Math.max(0, r.right);
    case "right":
      return Math.max(0, window.innerWidth - r.left);
    case "top":
      return Math.max(0, r.bottom);
    case "bottom":
      return Math.max(0, window.innerHeight - r.top);
  }
}
