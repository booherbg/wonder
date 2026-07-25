// Shared edge-aware tooltip layer for the World-Lab (spec §3.6).
//
// `tooltipPosition` is pure: given an anchor rect, tip size, and viewport, it
// places the tip below-right by default, flips left/above at the edges, and
// never returns a negative coordinate. `attachTooltip` owns one DOM node for
// the whole page — 400ms in / 80ms out, pointerenter + focus.

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface TipSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

/** Place a tip below-right of `anchor`, flipping at the viewport edge. Pure. */
export function tooltipPosition(
  anchor: AnchorRect,
  tip: TipSize,
  viewport: ViewportSize,
): { left: number; top: number } {
  let left = anchor.left;
  let top = anchor.top + anchor.height;

  if (left + tip.width > viewport.width) {
    left = anchor.left + anchor.width - tip.width;
  }
  if (top + tip.height > viewport.height) {
    top = anchor.top - tip.height;
  }

  return {
    left: Math.max(0, left),
    top: Math.max(0, top),
  };
}

const DELAY_IN_MS = 400;
const DELAY_OUT_MS = 80;

const TIP_STYLE =
  "position: fixed; z-index: 10000; pointer-events: none; max-width: 240px;" +
  " padding: 6px 9px; border-radius: 4px; background: rgba(14, 24, 32, 0.94);" +
  " color: var(--ink-bright, #e4ecf2); font: 11px var(--mono, ui-monospace, monospace);" +
  " letter-spacing: 0.02em; line-height: 1.35; box-shadow: 0 2px 10px rgba(0,0,0,0.35);" +
  " opacity: 0; transition: opacity 60ms ease; display: none;";

let tipEl: HTMLDivElement | null = null;
let showTimer: number | undefined;
let hideTimer: number | undefined;
let activeEl: Element | null = null;

function ensureTip(): HTMLDivElement {
  if (tipEl && tipEl.isConnected) return tipEl;
  tipEl = document.createElement("div");
  tipEl.id = "lab-tooltip";
  tipEl.setAttribute("role", "tooltip");
  tipEl.style.cssText = TIP_STYLE;
  document.body.appendChild(tipEl);
  return tipEl;
}

function clearTimers(): void {
  if (showTimer !== undefined) {
    window.clearTimeout(showTimer);
    showTimer = undefined;
  }
  if (hideTimer !== undefined) {
    window.clearTimeout(hideTimer);
    hideTimer = undefined;
  }
}

function hideNow(): void {
  clearTimers();
  activeEl = null;
  const el = tipEl;
  if (!el) return;
  el.style.opacity = "0";
  el.style.display = "none";
  el.textContent = "";
}

function placeTip(anchorEl: Element, text: string): void {
  const tip = ensureTip();
  tip.textContent = text;
  tip.style.display = "block";
  tip.style.opacity = "0";
  // Measure after display:block so width/height are real.
  const a = anchorEl.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const pos = tooltipPosition(
    { left: a.left, top: a.top, width: a.width, height: a.height },
    { width: t.width, height: t.height },
    { width: window.innerWidth, height: window.innerHeight },
  );
  tip.style.left = `${pos.left}px`;
  tip.style.top = `${pos.top}px`;
  tip.style.opacity = "1";
}

function scheduleShow(anchorEl: Element, text: string): void {
  clearTimers();
  activeEl = anchorEl;
  showTimer = window.setTimeout(() => {
    showTimer = undefined;
    if (activeEl === anchorEl) placeTip(anchorEl, text);
  }, DELAY_IN_MS);
}

function scheduleHide(fromEl: Element): void {
  clearTimers();
  hideTimer = window.setTimeout(() => {
    hideTimer = undefined;
    if (activeEl === fromEl || activeEl === null) hideNow();
  }, DELAY_OUT_MS);
}

/** Attach a shared, edge-aware tooltip. Replaces native `title` to avoid doubles. */
export function attachTooltip(el: HTMLElement, text: string): void {
  if (!text) return;
  el.removeAttribute("title");
  el.dataset.tooltip = text;

  const onEnter = (): void => scheduleShow(el, text);
  const onLeave = (): void => scheduleHide(el);

  // focusin/focusout so a container (pressure row) shows the tip when its
  // child input is keyboard-focused, not only on direct focus.
  el.addEventListener("pointerenter", onEnter);
  el.addEventListener("pointerleave", onLeave);
  el.addEventListener("focusin", onEnter);
  el.addEventListener("focusout", onLeave);
}
