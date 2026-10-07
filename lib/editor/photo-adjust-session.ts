import { isNeutralAdjust, NEUTRAL_ADJUST, type PhotoAdjust } from "../pipeline/photo-adjust";

/**
 * What becomes of the sliders when the reader walks away from them (G-074 M6, changed in G-124).
 *
 * Since G-124 the four sliders are a preview over the photo until Apply writes them into it (Owner, 2026-10-07). Cancel,
 * leaving the Picture tab or leaving Photo gives the preview up: the sliders go back to the middle and the photo is left
 * as it was applied.
 */

/** The sliders to put back, or `null` when they are already in the middle and there is nothing to give up. */
export function slidersToRestore(current: PhotoAdjust): PhotoAdjust | null {
  return isNeutralAdjust(current) ? null : NEUTRAL_ADJUST;
}

/** What a chart says of the photo it was made from. */
export interface AdjustedChart {
  /** Absent for a chart started from an empty canvas. */
  sourceImage?: { dataUrl: string };
  photoAdjust?: PhotoAdjust;
}

/**
 * The adjustment a Generate applies on the server (D352). The photo as applied is what is generated from, never the sliders
 * (Owner, 2026-10-07), so this is neutral, but for one case: a chart made from this very photo, untouched, with the
 * sliders of before G-124 keeps the adjustment it was made with, so regenerating it makes it again.
 */
export function generationPhotoAdjust(
  chart: AdjustedChart | null,
  photo: { originalDataUrl: string | null; isOriginal: boolean }
): PhotoAdjust {
  const madeFromThisPhoto = chart?.sourceImage !== undefined && chart.sourceImage.dataUrl === photo.originalDataUrl;
  return photo.isOriginal && madeFromThisPhoto ? (chart.photoAdjust ?? NEUTRAL_ADJUST) : NEUTRAL_ADJUST;
}
