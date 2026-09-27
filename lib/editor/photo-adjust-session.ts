import { NEUTRAL_ADJUST, samePhotoAdjust, type PhotoAdjust } from "../pipeline/photo-adjust";

/**
 * What becomes of the sliders when the reader walks away from them (G-074 M6).
 *
 * The four sliders are provisional until a Generate acts on them: while the Photo tab is up with a photo view,
 * those views follow the sliders live, but the chart on screen was made with whatever it was made with. So
 * leaving the tab, or the view, puts the sliders back to the chart's own — otherwise the app would show a chart
 * beside sliders that did not make it (Owner, 2026-09-27).
 */

export interface AdjustedChart {
  /** Absent for a chart started from an empty canvas, which has no photo settings at all. */
  sourceImage?: unknown;
  photoAdjust?: PhotoAdjust;
}

/**
 * The sliders to put back, or `null` to leave them alone.
 *
 * Null for a chart that has no photo: its Photo tab offers no sliders, so the ones the reader holds are for
 * the *next* photo they load and are not this chart's to reset. Null also before the first chart, when the
 * sliders are all there is, and when nothing has changed.
 */
export function slidersToRestore(current: PhotoAdjust, chart: AdjustedChart | null): PhotoAdjust | null {
  if (!chart?.sourceImage) return null;
  const made = chart.photoAdjust ?? NEUTRAL_ADJUST;
  return samePhotoAdjust(current, made) ? null : made;
}
