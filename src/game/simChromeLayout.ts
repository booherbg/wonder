import { NARROW } from "./simLayout";

export type BuildTool = "select" | "place" | "paint" | "erase" | "cloud";
export type MaterialsKind = "tiles" | "life" | null;

export function materialsForTool(tool: BuildTool): MaterialsKind {
  if (tool === "paint") return "tiles";
  if (tool === "place") return "life";
  return null;
}

export function isNarrowViewport(width: number, narrow = NARROW): boolean {
  return width < narrow;
}

export function primaryLeftOverlay(open: {
  flyout: boolean;
  roll: boolean;
  drawer: boolean;
}): "flyout" | "roll" | "drawer" | null {
  if (open.roll) return "roll";
  if (open.drawer) return "drawer";
  if (open.flyout) return "flyout";
  return null;
}
