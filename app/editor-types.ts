import type { RenderMode } from "@/lib/render";

/**
 * "photo" = the symbol grid overlaid on the source photo; "photo-only" = just
 * the uploaded photo, for comparing the chart against its source.
 */
export type ViewMode = RenderMode | "realistic" | "photo" | "photo-only";

export type Tool = "brush" | "pan" | "zoom" | "move" | "highlight" | "select" | "fill";
