import { NEUTRAL_ADJUST, type PhotoAdjust } from "../pipeline/photo-adjust";
import type { GenerationPalette, StitchPattern } from "../types";
import { REPLACE_PLANS, type ReplaceReason } from "./document-replace";
import type { SymmetryAxes } from "./symmetry";

/**
 * Carries out a row of `REPLACE_PLANS` (G-091). It knows the order and nothing else: every effect is handed in, so the editor
 * shell supplies its state setters and a test supplies recorders.
 */
export interface ReplaceEffects {
  resetHistory(next: StitchPattern | null): void;
  pushHistory(next: StitchPattern): void;
  /** A new document identity: an open colour editor closes. */
  bumpDocument(): void;
  clearSelection(): void;
  closeCrop(): void;
  /** The lit threads of both sections, and Isolate with them. */
  clearLit(): void;
  /** The thread the Text tab would letter in: it is an index into the old palette. */
  clearTextThread(): void;
  clearColourInHand(): void;
  resetZoom(): void;
  /** The symmetry axes: all off when none are given. */
  setSymmetry(axes?: SymmetryAxes): void;
  resetPaletteSet(): void;
  restorePaletteSet(recorded: GenerationPalette): void;
  setPhotoAdjust(adjust: PhotoAdjust): void;
  showTab(tab: "photo" | "threads"): void;
  clearMessages(): void;
  leaveStart(): void;
  adoptPhoto(pattern: StitchPattern, fallbackName: string): Promise<void>;
  forgetAutosave(): void;
  /** The next colour recommendation to arrive sets the colour count. */
  awaitRecommendedCount(): void;
}

export interface ReplaceExtras {
  /** The axes saved with an opened file. */
  symmetry?: SymmetryAxes;
  /** The name a photo adopted from the chart goes by when the chart has none. */
  fallbackName?: string;
}

export async function replaceDocument(
  reason: ReplaceReason,
  next: StitchPattern | null,
  effects: ReplaceEffects,
  extras: ReplaceExtras = {}
): Promise<void> {
  const plan = REPLACE_PLANS[reason];

  if (plan.forgetAutosave) effects.forgetAutosave();

  // The sliders come back with a chart that has a photo; one without a photo has no photo settings to bring (G-074 M5).
  if (plan.photoAdjust === "neutral") effects.setPhotoAdjust(NEUTRAL_ADJUST);
  else if (plan.photoAdjust === "from-file" && next?.sourceImage) effects.setPhotoAdjust(next.photoAdjust ?? NEUTRAL_ADJUST);

  if (plan.recommendColorCount) effects.awaitRecommendedCount();

  // A file without a recorded set is a new chart, which starts without one (G-087, D277).
  if (plan.paletteSet === "reset") effects.resetPaletteSet();
  else if (plan.paletteSet === "from-file") {
    if (next?.generationPalette) effects.restorePaletteSet(next.generationPalette);
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
    effects.clearTextThread();
    effects.closeCrop();
  }

  if (plan.symmetry === "off") effects.setSymmetry();
  else if (plan.symmetry === "from-file") effects.setSymmetry(extras.symmetry);

  if (plan.tab !== "keep") effects.showTab(plan.tab);
  if (plan.leaveStart) effects.leaveStart();
  if (plan.adoptPhoto && next) await effects.adoptPhoto(next, extras.fallbackName ?? next.name ?? "cross-stitch-pattern");
}
