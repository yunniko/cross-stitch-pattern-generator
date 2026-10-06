import { featureUsable, type FeatureStates } from "../features/features";

/**
 * The chart's view as switches (G-110, D315): a pattern mode, Symbols, Photo, and how visible the pattern is over the photo.
 * They replace the five fixed views (Color, Black & white, Stitched, Grid + photo, Original photo).
 *
 * What the person chose (`ChartView`, kept by the browser) is kept apart from what is in force for the chart and the
 * person in hand (`viewInForce`): a switch that does not apply is remembered, not obeyed, and takes effect again the
 * moment it applies. Every rule about which switch applies where lives here; no component decides one.
 */

export type PatternMode = "color" | "bw" | "realistic";

export const PATTERN_MODES: readonly PatternMode[] = ["color", "bw", "realistic"];

export interface ChartView {
  pattern: PatternMode;
  /** The stitch symbols over Color or Black & white; nothing in Stitched. */
  symbols: boolean;
  /** The chart's photo under Color or Black & white; nothing in Stitched or without a photo. */
  photo: boolean;
  /** How visible the pattern is over the photo, a whole percentage: 100 the pattern alone, 0 the photo alone. */
  visibility: number;
}

/** A new chart's view, and the view of a browser that has none kept (D283). */
export const DEFAULT_VIEW: ChartView = { pattern: "color", symbols: true, photo: false, visibility: 100 };

/** Below this the pattern is too faint to edit by: only the tools that move the view act on it (Owner, 2026-10-06). */
export const EDITING_MIN_VISIBILITY = 5;

/** The visibility key 4 sets with Photo: the pattern and the photo both readable, the nearest to the old Grid + photo. */
export const HALF_VISIBLE = 50;

/** The features the view's switches sit under (G-102); their ids are the old views', kept so saved states still apply. */
export const STITCHED_FEATURE = "view.realistic";
export const PHOTO_FEATURE = "view.photo";

export interface ViewConditions {
  /** The chart in hand has its photo. */
  hasPhoto: boolean;
  features: FeatureStates;
}

/** The view a stored value means, each field held to its range and anything unreadable taken from the default. */
export function readView(stored: unknown): ChartView {
  const value = (stored ?? {}) as Partial<Record<keyof ChartView, unknown>>;
  const visibility = typeof value.visibility === "number" && Number.isFinite(value.visibility) ? value.visibility : DEFAULT_VIEW.visibility;
  return {
    pattern: PATTERN_MODES.includes(value.pattern as PatternMode) ? (value.pattern as PatternMode) : DEFAULT_VIEW.pattern,
    symbols: typeof value.symbols === "boolean" ? value.symbols : DEFAULT_VIEW.symbols,
    photo: typeof value.photo === "boolean" ? value.photo : DEFAULT_VIEW.photo,
    visibility: clampVisibility(visibility),
  };
}

export function clampVisibility(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Color and Black & white: the modes that draw cells flat, and so can carry symbols and sit over the photo. */
export function isFlatMode(mode: PatternMode): mode is "color" | "bw" {
  return mode !== "realistic";
}

/** The pattern mode in force: Stitched while its feature is not usable reads as Color. */
export function patternInForce(view: ChartView, features: FeatureStates): PatternMode {
  return view.pattern === "realistic" && !featureUsable(features, STITCHED_FEATURE) ? "color" : view.pattern;
}

/** What is drawn: the choice with every switch that does not apply set aside. */
export function viewInForce(view: ChartView, conditions: ViewConditions): ChartView {
  const pattern = patternInForce(view, conditions.features);
  const flat = isFlatMode(pattern);
  const photo = flat && view.photo && conditions.hasPhoto && featureUsable(conditions.features, PHOTO_FEATURE);
  return { pattern, symbols: flat && view.symbols, photo, visibility: photo ? view.visibility : 100 };
}

/** The slider is shown only where it acts: Color or Black & white, with the photo under the pattern. */
export function sliderShown(inForce: ChartView): boolean {
  return inForce.photo;
}

/** The photo is on screen, so the photo sliders' changes are what is looked at (D241): they follow it live. */
export function photoShown(inForce: ChartView): boolean {
  return inForce.photo;
}

/** The chart can be edited in this view: a flat pattern, visible enough to see what is changed (D121 restated). */
export function viewEditable(inForce: ChartView): boolean {
  return isFlatMode(inForce.pattern) && inForce.visibility >= EDITING_MIN_VISIBILITY;
}

/** Why editing is not offered, for the note shown in its place; null where it is. */
export function viewOnlyReason(inForce: ChartView): "stitched" | "faint" | null {
  if (!isFlatMode(inForce.pattern)) return "stitched";
  return inForce.visibility < EDITING_MIN_VISIBILITY ? "faint" : null;
}

/** Key 4: the photo under the pattern, half visible, in Color unless a flat mode was already chosen. */
export function photoHalfView(view: ChartView): ChartView {
  return { ...view, pattern: isFlatMode(view.pattern) ? view.pattern : "color", photo: true, visibility: HALF_VISIBLE };
}

/** Key 5: the photo alone, which is the pattern at no visibility over it. */
export function photoAloneView(view: ChartView): ChartView {
  return { ...view, pattern: isFlatMode(view.pattern) ? view.pattern : "color", photo: true, visibility: 0 };
}
