import { useState } from "react";
import { slidersToRestore } from "@/lib/editor/photo-adjust-session";
import { NEUTRAL_ADJUST, type PhotoAdjust } from "@/lib/pipeline/photo-adjust";
import type { StitchPattern } from "@/lib/types";
import type { Workspace } from "@/lib/editor/workspaces";
import type { InspectorTab } from "../components/inspector";
import type { ViewMode } from "../editor-types";

/**
 * What is being looked at: the chart's view, the workspace and the tab of the Edit panel (out of the workspace file in
 * G-098), with the one rule that ties the first two to the photo sliders.
 *
 * The sliders are provisional until a Generate acts on them (D243). In the Photo workspace with a photo view up, the view
 * follows the sliders as they move; anywhere else it shows the chart's own, because that is what the chart was made from
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
  const [workspace, setWorkspace] = useState<Workspace>("photo");
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>("threads");

  function abandonUnusedSliders() {
    const restore = slidersToRestore(sliders, pattern);
    if (restore) restoreSliders(restore);
  }

  const photoViewShown = viewMode === "photo" || viewMode === "photo-only";
  return {
    viewMode,
    /** The workspace chosen; the one shown may differ while there is no chart to edit (`workspaceShown`). */
    workspace,
    inspectorTab,
    /** The view, chosen by the person. */
    chooseViewMode(mode: ViewMode) {
      if (mode !== "photo" && mode !== "photo-only") abandonUnusedSliders();
      setViewMode(mode);
    },
    /** The workspace, chosen by the person. */
    chooseWorkspace(next: Workspace) {
      if (next !== "photo") abandonUnusedSliders();
      setWorkspace(next);
    },
    /** The tab of the Edit panel, chosen by the person. */
    chooseInspectorTab: setInspectorTab,
    /** Set outright, when another chart arrives: nothing of the old one is given up or kept. */
    setViewMode,
    /** The workspace a chart arrives in; arriving in Edit shows its threads. */
    showWorkspace(next: Workspace) {
      setWorkspace(next);
      if (next === "edit") setInspectorTab("threads");
    },
    /** The adjustment the photo views draw with. */
    shownPhotoAdjust: workspace === "photo" && photoViewShown ? sliders : (pattern?.photoAdjust ?? NEUTRAL_ADJUST),
  };
}
