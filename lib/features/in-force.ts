import { CANVAS_TEXTURE_OFF } from "../export/canvas-texture-catalog";
import { DEFAULT_STITCH_TEXTURE } from "../export/stitch-texture-catalog";
import { DEFAULT_OPTIONS, type WorkspaceOptions } from "../editor/workspace-storage";
import { ditherFeature } from "../pipeline/dither-labels";
import { featureUsable, type FeatureStates } from "./features";

/**
 * The settings in force for a person under feature switches (G-102): a stored setting that names a feature the person
 * cannot use (a locked or hidden texture, brand, dither pattern, edge mode...) is read as its default instead. The stored
 * value is left as it is, so it is back the moment the feature is.
 *
 * This is what the chart is drawn with and what a Generate sends; the server checks the request against the same states
 * (M2), so nothing here is the only guard.
 */
export function optionsInForce(options: WorkspaceOptions, states: FeatureStates): WorkspaceOptions {
  const usable = (id: string | null) => id === null || featureUsable(states, id);
  const inForce = { ...options };
  if (!usable(`texture.stitch.${options.stitchTexture}`)) inForce.stitchTexture = DEFAULT_STITCH_TEXTURE;
  if (options.canvasTexture !== CANVAS_TEXTURE_OFF && !usable(`texture.canvas.${options.canvasTexture}`))
    inForce.canvasTexture = CANVAS_TEXTURE_OFF;
  if (options.paletteMode !== "full" && !usable(`brand.${options.paletteMode}`)) inForce.paletteMode = "full";
  if (options.defaultPaletteMode !== "full" && !usable(`brand.${options.defaultPaletteMode}`)) inForce.defaultPaletteMode = "full";
  if (!usable("generation.ditherMode") || !usable(ditherFeature(options.ditherMode))) inForce.ditherMode = "off";
  if (!usable("generation.edgeMode")) inForce.edgeMode = DEFAULT_OPTIONS.edgeMode;
  if (!usable("generation.vivid")) inForce.vivid = DEFAULT_OPTIONS.vivid;
  if (!usable("generation.generationMode")) inForce.generationMode = DEFAULT_OPTIONS.generationMode;
  if (!usable("generation.backstitchLines")) inForce.backstitchLines = false;
  if (!usable("generation.textureStrokes")) inForce.textureStrokes = false;
  if (!usable("generation.paletteSet")) inForce.paletteSetup = false;
  if (!usable("generation.photoAdjust")) inForce.photoAdjust = DEFAULT_OPTIONS.photoAdjust;
  return inForce;
}
