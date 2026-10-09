import { NEUTRAL_ADJUST, type PhotoAdjust } from "../pipeline/photo-adjust";
import type { ChartDocument } from "../document/types";
import type { GenerationPalette } from "../types";
import { REPLACE_PLANS, type ReplaceReason } from "./document-replace";
import type { SymmetryAxes } from "./symmetry";
import type { SavedChartLink } from "../charts/saved-chart-link";

/**
 * Carries out a row of `REPLACE_PLANS` (G-091). It knows the order and nothing else: every effect is handed in, so the editor
 * shell supplies its state setters and a test supplies recorders.
 */
export interface ReplaceEffects {
  resetHistory(next: ChartDocument | null): void;
  pushHistory(next: ChartDocument): void;
  /** A new document identity: an open colour editor closes. */
  bumpDocument(): void;
  clearSelection(): void;
  /** Every tool puts down what belonged to the old chart: the crop frame, the thread the Text tool would letter in. */
  closeCrop(): void;
  /** The lit threads of both sections, and Isolate with them. */
  clearLit(): void;
  clearColourInHand(): void;
  resetZoom(): void;
  /** The view's switches return to a new chart's: Color, where it can be edited (Owner, 2026-10-04; D315). */
  resetChartView(): void;
  /** The symmetry axes: all off when none are given. */
  setSymmetry(axes?: SymmetryAxes): void;
  resetPaletteSet(): void;
  restorePaletteSet(recorded: GenerationPalette): void;
  setPhotoAdjust(adjust: PhotoAdjust): void;
  showWorkspace(workspace: "photo" | "edit"): void;
  clearMessages(): void;
  leaveStart(): void;
  adoptPhoto(chart: ChartDocument, fallbackName: string): Promise<void>;
  forgetAutosave(): void;
  /** The next colour recommendation to arrive sets the colour count. */
  awaitRecommendedCount(): void;
  /** The account chart Save overwrites, or none. */
  setSavedChart(link: SavedChartLink | null): void;
}

export interface ReplaceExtras {
  /** The axes saved with an opened file. */
  symmetry?: SymmetryAxes;
  /** The name a photo adopted from the chart goes by when the chart has none. */
  fallbackName?: string;
  /** The account chart that arrives with the chart: the reloaded one's, or the saved chart opened. */
  savedChart?: SavedChartLink | null;
}

export async function replaceDocument(
  reason: ReplaceReason,
  next: ChartDocument | null,
  effects: ReplaceEffects,
  extras: ReplaceExtras = {}
): Promise<void> {
  const plan = REPLACE_PLANS[reason];

  if (plan.forgetAutosave) effects.forgetAutosave();

  if (plan.savedChart === "forget") effects.setSavedChart(null);
  else if (plan.savedChart === "given") effects.setSavedChart(extras.savedChart ?? null);

  // The sliders are a preview of the photo in hand (G-124), so a chart arriving puts them in the middle or leaves them.
  if (plan.photoAdjust === "neutral") effects.setPhotoAdjust(NEUTRAL_ADJUST);

  if (plan.recommendColorCount) effects.awaitRecommendedCount();

  // A file without a recorded set is a new chart, which starts without one (G-087, D277).
  if (plan.paletteSet === "reset") effects.resetPaletteSet();
  else if (plan.paletteSet === "from-file") {
    if (next?.properties.generationPalette) effects.restorePaletteSet(next.properties.generationPalette);
    else effects.resetPaletteSet();
  }

  if (plan.clearMessages) effects.clearMessages();

  if (plan.history === "reset") effects.resetHistory(next);
  else if (next) effects.pushHistory(next);

  effects.clearSelection();
  effects.bumpDocument();
  if (plan.view === "full") {
    effects.clearColourInHand();
    effects.resetZoom();
    effects.clearLit();
    effects.closeCrop();
  }

  if (plan.chartView === "reset") effects.resetChartView();

  if (plan.symmetry === "off") effects.setSymmetry();
  else if (plan.symmetry === "from-file") effects.setSymmetry(extras.symmetry);

  if (plan.workspace !== "keep") effects.showWorkspace(plan.workspace);
  if (plan.leaveStart) effects.leaveStart();
  if (plan.adoptPhoto && next) await effects.adoptPhoto(next, extras.fallbackName ?? next.properties.name ?? "cross-stitch-pattern");
}
