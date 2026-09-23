import type { RenderMode } from "@/lib/export/render";

/**
 * "photo" = the symbol grid overlaid on the source photo; "photo-only" = just
 * the uploaded photo, for comparing the chart against its source.
 */
export type ViewMode = RenderMode | "realistic" | "photo" | "photo-only";

/** Views that show the pattern without editing it: only Pan and Zoom act on the canvas there (D121). */
export function isViewOnlyMode(mode: ViewMode): boolean {
  return mode === "realistic" || mode === "photo-only";
}

/**
 * Isolate is not here on purpose (G-045 M4): dimming the threads you are not working on is a way of *looking* at the
 * chart, not a thing you do to it, so it stays on while you paint with any of these.
 */
export type Tool = "brush" | "line" | "rect" | "oval" | "pan" | "zoom" | "move" | "select" | "fill";

/** The tools that draw a shape by dragging from one stitch to another (G-064); they share one gesture (D214). */
export function isShapeTool(tool: Tool): tool is "line" | "rect" | "oval" {
  return tool === "line" || tool === "rect" || tool === "oval";
}

/** A line has no inside, so only the shapes that enclose one choose between an outline and a solid block. */
export function hasFillChoice(tool: Tool): boolean {
  return tool === "rect" || tool === "oval";
}
