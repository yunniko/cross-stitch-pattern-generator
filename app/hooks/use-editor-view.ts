import { useState } from "react";
import { slidersToRestore } from "@/lib/editor/photo-adjust-session";
import { NEUTRAL_ADJUST, type PhotoAdjust } from "@/lib/pipeline/photo-adjust";
import type { StitchPattern } from "@/lib/types";
import type { InspectorTab } from "../components/inspector";
import type { ViewMode } from "../editor-types";

/**
 * What is being looked at: the chart's view and the settings shown beside it (out of the workspace in G-098), with the one
 * rule that ties the two to the photo sliders.
 *
 * The sliders are provisional until a Generate acts on them (D243). With the photo settings and a photo view both up, the
 * view follows the sliders as they move; anywhere else it shows the chart's own, because that is what the chart was made from
 * (D241). Leaving either without regenerating gives the change up: the chart on screen was not made with those sliders, so
 * it must not look as though it was (Owner, 2026-09-27).
 */
export function useEditorView({
  pattern,
  sliders,
  restoreSliders,
}: {
  pattern: StitchPattern | null;
  /** The photo sliders as they stand in the settings. */
  sliders: PhotoAdjust;
  restoreSliders: (adjust: PhotoAdjust) => void;
}) {
  const [viewMode, setViewMode] = useState<ViewMode>("color");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("photo");

  function abandonUnusedSliders() {
    const restore = slidersToRestore(sliders, pattern);
    if (restore) restoreSliders(restore);
  }

  const photoViewShown = viewMode === "photo" || viewMode === "photo-only";
  return {
    viewMode,
    inspectorTab,
    /** The view, chosen by the person. */
    chooseViewMode(mode: ViewMode) {
      if (mode !== "photo" && mode !== "photo-only") abandonUnusedSliders();
      setViewMode(mode);
    },
    /** The settings shown, chosen by the person. */
    chooseInspectorTab(tab: InspectorTab) {
      if (tab !== "photo") abandonUnusedSliders();
      setInspectorTab(tab);
    },
    /** Set outright, when another chart arrives: nothing of the old one is given up or kept. */
    setViewMode,
    setInspectorTab,
    /** The adjustment the photo views draw with. */
    shownPhotoAdjust: inspectorTab === "photo" && photoViewShown ? sliders : (pattern?.photoAdjust ?? NEUTRAL_ADJUST),
  };
}
