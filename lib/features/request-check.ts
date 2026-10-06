import { DEFAULT_OPTIONS } from "../editor/workspace-storage";
import { CANVAS_TEXTURES } from "../export/canvas-texture-catalog";
import { EXPORT_KIND_GROUPS, exportChoiceFeature, exportKindFeature } from "../export/export-kinds";
import { STITCH_TEXTURES } from "../export/stitch-texture-catalog";
import { DITHER_MODES, type DitherMode } from "../pipeline/dither";
import { DITHER_LABELS, ditherFeature } from "../pipeline/dither-labels";
import { GENERATION_SETTINGS } from "../pipeline/generation-settings";
import { isNeutralAdjust } from "../pipeline/photo-adjust";
import { THREAD_BRAND_IDS, THREAD_BRANDS } from "../threads/thread-brands";
import { generationSettingFeature } from "./declare";
import { featureUsable, lockedNote, type FeatureStates } from "./features";

/**
 * What the server refuses under feature switches (G-102 M2): a request that asks for a feature the requester cannot use.
 * The interface never sends one (`in-force.ts`), so a refusal here means a request made by hand; it is refused by name all
 * the same, since the interface is not the only client. Returns the reason, or null when the request may go on.
 */

/** The names of the features a request can ask for, from the catalogs the server has (the tools are the client's alone). */
const LABELS: Record<string, string> = Object.fromEntries([
  ...EXPORT_KIND_GROUPS.flatMap(({ kinds }) => kinds.map((kind) => [exportKindFeature(kind), kind.label])),
  ["export.all", "Export all"],
  ...GENERATION_SETTINGS.flatMap((setting) => {
    const id = generationSettingFeature(setting);
    if (id === null || typeof setting.feature === "string") return [];
    return [[id, setting.feature && typeof setting.feature === "object" ? setting.feature.label : (setting.control?.label ?? setting.id)]];
  }),
  ...DITHER_MODES.flatMap((mode) => (ditherFeature(mode) === null ? [] : [[ditherFeature(mode)!, DITHER_LABELS[mode]]])),
  ...STITCH_TEXTURES.map((texture) => [`texture.stitch.${texture.id}`, `${texture.label} stitch texture`]),
  ...CANVAS_TEXTURES.map((texture) => [`texture.canvas.${texture.id}`, `${texture.label} cloth`]),
  ...THREAD_BRAND_IDS.map((brand) => [`brand.${brand}`, THREAD_BRANDS[brand].label]),
]);

const note = (feature: string) => lockedNote(LABELS[feature] ?? feature);

/** The value of a setting that asks for nothing: a request carrying it does not use the feature. */
const ASKS_NOTHING: Record<string, (value: unknown) => boolean> = {
  generationMode: (value) => value === DEFAULT_OPTIONS.generationMode,
  edgeMode: (value) => value === "standard",
  ditherMode: (value) => value === "off",
  vivid: (value) => value !== true,
  backstitchLines: (value) => value !== true,
  backstitchPhotos: (value) => value !== true,
  textureStrokes: (value) => value !== true,
  textureDensity: () => true, // read only with the strokes on, which is checked by its own flag
  backstitchSensitivity: () => true, // the same, with the lines
  paletteSet: (value) => value === undefined || value === null,
  photoAdjust: (value) => value === undefined || isNeutralAdjust(value as Parameters<typeof isNeutralAdjust>[0]),
  ditherTexture: () => true, // read only with a drawn pattern, which is checked as the pattern
};

/** A generation request's body against the requester's states. */
export function generationRefusal(body: Record<string, unknown>, states: FeatureStates): string | null {
  for (const setting of GENERATION_SETTINGS) {
    const feature = generationSettingFeature(setting);
    if (feature === null || featureUsable(states, feature)) continue;
    const value = body[setting.id];
    if (value === undefined) continue;
    const asksNothing = ASKS_NOTHING[setting.id] ?? (() => false);
    if (!asksNothing(value)) return note(feature);
  }
  // A brand, and a dither pattern, are features of their own.
  if (typeof body.paletteMode === "string" && body.paletteMode !== "full" && !featureUsable(states, `brand.${body.paletteMode}`)) {
    return note(`brand.${body.paletteMode}`);
  }
  if (typeof body.ditherMode === "string" && (DITHER_MODES as readonly string[]).includes(body.ditherMode)) {
    const feature = ditherFeature(body.ditherMode as DitherMode);
    if (feature !== null && !featureUsable(states, feature)) return note(feature);
  }
  // A setting drawn from its declaration travels by its own id, checked above with the rest.
  return null;
}

/** An export request's body against the requester's states. */
export function exportRefusal(body: Record<string, unknown>, states: FeatureStates): string | null {
  if (typeof body.kind === "string") {
    const feature = exportChoiceFeature(body.kind as Parameters<typeof exportChoiceFeature>[0]);
    if (!featureUsable(states, feature)) return note(feature);
  }
  if (typeof body.stitchTexture === "string" && !featureUsable(states, `texture.stitch.${body.stitchTexture}`)) {
    return note(`texture.stitch.${body.stitchTexture}`);
  }
  const canvas = body.canvas;
  if (canvas && typeof canvas === "object" && "texture" in canvas && typeof canvas.texture === "string" && canvas.texture !== "off") {
    if (!featureUsable(states, `texture.canvas.${canvas.texture}`)) return note(`texture.canvas.${canvas.texture}`);
  }
  return null;
}
