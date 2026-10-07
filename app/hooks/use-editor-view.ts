import { useState } from "react";
import { slidersToRestore } from "@/lib/editor/photo-adjust-session";
import { NEUTRAL_ADJUST, type PhotoAdjust } from "@/lib/pipeline/photo-adjust";
import type { StitchPattern } from "@/lib/types";
import type { Workspace } from "@/lib/editor/workspaces";
import type { InspectorTab } from "../components/inspector";
import { DEFAULT_VIEW, viewInForce, type ChartView } from "@/lib/editor/view";
import type { FeatureStates } from "@/lib/features/features";

/**
 * What is being looked at: the chart's view, the workspace and the tab of the Edit panel (out of the workspace file in
 * G-098), with the one rule that ties the first two to the photo sliders. The view is kept with the browser's settings, so
 * it survives a reload (Owner, 2026-10-06); this hook only reads and sets it (D315).
 *
 * The sliders are a preview over the photo until Apply writes them in (G-124, Owner 2026-10-07). The chart's photo views
 * show the adjustment the chart was made with (D241); leaving Photo without applying gives the sliders up.
 */
export function useEditorView({
  pattern,
  chosenView,
  setChosenView,
  sliders,
  restoreSliders,
  features,
}: {
  pattern: StitchPattern | null;
  /** The view as the browser keeps it. */
  chosenView: ChartView;
  setChosenView: (view: ChartView) => void;
  /** The person's feature states, which decide whether Stitched and the photo can be in force. */
  features: FeatureStates;
  /** The photo sliders as they stand in the settings. */
  sliders: PhotoAdjust;
  restoreSliders: (adjust: PhotoAdjust) => void;
}) {
  const [workspace, setWorkspace] = useState<Workspace>("photo");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("threads");

  function abandonUnusedSliders() {
    const restore = slidersToRestore(sliders);
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
    /** The view, chosen by the person. */
    chooseView: setChosenView,
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
    /** The adjustment the chart's photo views are drawn with: the one the chart was made with. */
    shownPhotoAdjust: pattern?.photoAdjust ?? NEUTRAL_ADJUST,
  };
}
