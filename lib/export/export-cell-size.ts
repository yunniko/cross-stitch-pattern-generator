/**
 * The A4 export's cell size (G-083): how big one stitch is printed. It applies to the A4 pages only; the full-size chart
 * picture keeps its own pixel size (Owner, 2026-10-01). The default is twice what the pages used before.
 */
export const MIN_EXPORT_CELL_MM = 2;
export const MAX_EXPORT_CELL_MM = 12;
export const DEFAULT_EXPORT_CELL_MM = 5.5;

/**
 * The space outside the pattern on each A4 page the Rust exporter gives the page's numbers, its overlap labels and its letter
 * (G-083). The Pattern Keeper PDF keeps the narrower gutter it has always had (`NUMBER_GUTTER_MM`), so it is not touched.
 */
export const A4_PAGE_GUTTER_MM = 12;
/** The margin of those pages: narrow, as a printer allows (the Owner asked for smaller borders). */
export const A4_PAGE_MARGIN_MM = 8;

/** A cell size as a setting may hold it: finite, within the limits, in steps of a quarter millimetre. */
export function normalCellMm(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const clamped = Math.min(MAX_EXPORT_CELL_MM, Math.max(MIN_EXPORT_CELL_MM, value));
  return Math.round(clamped * 4) / 4;
}
