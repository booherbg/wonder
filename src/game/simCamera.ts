// Pure camera helpers for the World-Lab construct view — pan/zoom math kept
// testable outside the DOM-heavy worldlab.ts closure.

export const ZOOM_MUL_MIN = 0.4;
export const ZOOM_MUL_MAX = 4;
export const ZOOM_WHEEL_IN = 1.05;
export const ZOOM_WHEEL_OUT = 1 / ZOOM_WHEEL_IN;
export const FIT_MARGIN = 0.92;

export function clampCameraAxis(pos: number, worldSize: number, viewSize: number): number {
  const maxOffset = worldSize - viewSize;
  return maxOffset <= 0 ? maxOffset / 2 : Math.max(0, Math.min(pos, maxOffset));
}

export function fitZoomFor(
  worldW: number,
  worldH: number,
  viewW: number,
  viewH: number,
  margin = FIT_MARGIN,
): number {
  return Math.min(2, (viewW * margin) / worldW, (viewH * margin) / worldH);
}

export function clampZoomMul(mul: number): number {
  return Math.min(ZOOM_MUL_MAX, Math.max(ZOOM_MUL_MIN, mul));
}

export function nextZoomMul(current: number, direction: "in" | "out"): number {
  const factor = direction === "in" ? ZOOM_WHEEL_IN : ZOOM_WHEEL_OUT;
  return clampZoomMul(current * factor);
}

export function zoomPercent(zoomMul: number): number {
  return Math.round(zoomMul * 100);
}

export type WheelCameraMode = "pan" | "zoom";

/** ctrlKey covers trackpad pinch; metaKey covers ⌘+wheel on macOS. */
export function wheelCameraMode(e: { ctrlKey: boolean; metaKey: boolean }): WheelCameraMode {
  return e.ctrlKey || e.metaKey ? "zoom" : "pan";
}

export function wheelPanDelta(
  deltaX: number,
  deltaY: number,
  viewW: number,
  viewH: number,
  canvasW: number,
  canvasH: number,
): { dx: number; dy: number } {
  const sx = canvasW > 0 ? viewW / canvasW : 1;
  const sy = canvasH > 0 ? viewH / canvasH : 1;
  return { dx: deltaX * sx, dy: deltaY * sy };
}

export function wheelZoomFactor(deltaY: number): number {
  return deltaY > 0 ? ZOOM_WHEEL_OUT : ZOOM_WHEEL_IN;
}
