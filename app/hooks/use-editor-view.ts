import { useState } from "react";
import { slidersToRestore } from "@/lib/editor/photo-adjust-session";
import { NEUTRAL_ADJUST, type PhotoAdjust } from "@/lib/pipeline/photo-adjust";
import type { StitchPattern } from "@/lib/types";
import type { Workspace } from "@/lib/editor/workspaces";
import type { InspectorTab } from "../components/inspector";
import { DEFAULT_VIEW, photoShown, viewInForce, type ChartView } from "@/lib/editor/view";
import type { FeatureStates } from "@/lib/features/features";

/**
 * What is being looked at: the chart's view, the workspace and the tab of the Edit panel (out of the workspace file in
 * G-098), with the one rule that ties the first two to the photo sliders.
 *
 * The sliders are provisional until a Generate acts on them (D243). In the Photo workspace with the photo shown, the view
 * follows the sliders as they move; anywhere else it shows the chart's own, because that is what the chart was made from
 * (D241). Leaving either without regenerating gives the change up: the chart on screen was not made with those sliders, so
 * it must not look as though it was (Owner, 2026-09-27).
 */
export function useEditorView({
  pattern,
  sliders,
  restoreSliders,
  features,
}: {
  pattern: StitchPattern | null;
  /** The person's feature states, which decide whether Stitched and the photo can be in force. */
  features: FeatureStates;
  /** The photo sliders as they stand in the settings. */
  sliders: PhotoAdjust;
  restoreSliders: (adjust: PhotoAdjust) => void;
}) {
  const [chosenView, setChosenView] = useState<ChartView>(DEFAULT_VIEW);
  const [workspace, setWorkspace] = useState<Workspace>("photo");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("threads");

  function abandonUnusedSliders() {
    const restore = slidersToRestore(sliders, pattern);
    if (restore) restoreSliders(restore);
  }

  const conditions = { hasPhoto: pattern?.sourceImage !== undefined, features };
  const shown = viewInForce(chosenView, conditions);
  return {
    /** The view as chosen, kept whole even where a switch does not apply (D315). */
    chosenView,
    /** The view in force for the chart and person in hand: what is drawn and what decides editing. */
    shown,
    /** The workspace chosen; the one shown may differ while there is no chart to edit (`workspaceShown`). */
    workspace,
    inspectorTab,
    /** The view, chosen by the person: one that no longer shows the photo gives unused slider changes up. */
    chooseView(next: ChartView) {
      if (!photoShown(viewInForce(next, conditions))) abandonUnusedSliders();
      setChosenView(next);
    },
    /** The workspace, chosen by the person. */
    chooseWorkspace(next: Workspace) {
      if (next !== "photo") abandonUnusedSliders();
      setWorkspace(next);
    },
    /** The tab of the Edit panel, chosen by the person. */
    chooseInspectorTab: setInspectorTab,
    /** A new chart's view (D283): set outright, nothing of the old one given up or kept. */
    resetView: () => setChosenView(DEFAULT_VIEW),
    /** The workspace a chart arrives in; arriving in Edit shows its threads. */
    showWorkspace(next: Workspace) {
      setWorkspace(next);
      if (next === "edit") setInspectorTab("threads");
    },
    /** The adjustment the photo is drawn with. */
    shownPhotoAdjust: workspace === "photo" && photoShown(shown) ? sliders : (pattern?.photoAdjust ?? NEUTRAL_ADJUST),
  };
}
