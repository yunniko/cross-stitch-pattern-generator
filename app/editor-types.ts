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
export type Tool =
  | "brush"
  | "line"
  | "rect"
  | "oval"
  | "pan"
  | "zoom"
  | "move"
  | "select"
  | "lasso"
  | "lasso-fill"
  | "backstitch"
  | "backstitch-edit"
  | "fill";

/**
 * The tools that produce a floating piece (G-072). Rectangle Select drags a box and Lasso Select draws a shape,
 * but what they hand over is the same selection with the same bar, so everything downstream treats them alike.
 */
export function isSelectTool(tool: Tool): tool is "select" | "lasso" {
  return tool === "select" || tool === "lasso";
}

/**
 * The tool that edits backstitch rather than drawing it (G-073). One tool, not two: a press takes the line
 * it lands on, and only a line already in hand has live ends (D229).
 */
export function isBackstitchEditTool(tool: Tool): tool is "backstitch-edit" {
  return tool === "backstitch-edit";
}

/** Every tool that works on backstitch, including the one that draws it. */
export function isBackstitchTool(tool: Tool): boolean {
  return tool === "backstitch" || isBackstitchEditTool(tool);
}

/** The tools that draw a shape by dragging from one stitch to another (G-064); they share one gesture (D214). */
export function isShapeTool(tool: Tool): tool is "line" | "rect" | "oval" {
  return tool === "line" || tool === "rect" || tool === "oval";
}

/** A line has no inside, so only the shapes that enclose one choose between an outline and a solid block. */
export function hasFillChoice(tool: Tool): boolean {
  return tool === "rect" || tool === "oval";
}
