import { isNeutralAdjust, type PhotoAdjust } from "../pipeline/photo-adjust";

/**
 * The photo a chart was made from, for the views that show it (G-074 M5).
 *
 * "Grid + photo" and "Original photo" draw `sourceImage.dataUrl`, which is the file as it was uploaded (D150:
 * the server works from those bytes, so they are what is kept). A chart generated with the sliders was not made
 * from that photo, though, so comparing the chart against it compares against something that never existed.
 * These views therefore draw the photo *as adjusted*, and this is how a decoded one is told from another.
 */

/** Identifies a decoded photo by the file it came from and the sliders applied to it. */
export function photoKey(dataUrl: string, adjust: PhotoAdjust | undefined): string {
  if (!adjust || isNeutralAdjust(adjust)) return dataUrl;
  // The sliders go in front: a data URL always begins "data:", so an adjusted key can never read as an
  // unadjusted one whose file name happens to end the way an adjustment does.
  return `${adjust.brightness},${adjust.contrast},${adjust.saturation},${adjust.temperature}|${dataUrl}`;
}
