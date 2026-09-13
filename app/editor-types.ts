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

export type Tool = "brush" | "pan" | "zoom" | "move" | "highlight" | "select" | "fill";
