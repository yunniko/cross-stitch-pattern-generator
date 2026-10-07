"use client";

import { useState } from "react";
import type { Workspace } from "@/lib/editor/workspaces";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import type { StitchPattern } from "@/lib/types";
import type { useColorPrediction } from "../hooks/use-color-prediction";
import type { DrawingColours } from "../hooks/use-drawing-colours";
import { paginatesAsA4, type useExports } from "../hooks/use-exports";
import type { useGeneration } from "../hooks/use-generation";
import type { LitThreadsState } from "../hooks/use-lit-threads";
import type { PhotoAdjustPreview } from "../hooks/use-photo-adjust-preview";
import type { useSourceImage } from "../hooks/use-source-image";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import type { Tools } from "../tools/use-tools";
import { ChartPane } from "./chart-pane";
import { ColorsDock } from "./colors-dock";
import { ExportFooter, ExportPane, type ExportControls } from "./export-pane";
import { EDIT_TABS, Inspector, type InspectorTab } from "./inspector";
import { isNeutralAdjust, NEUTRAL_ADJUST } from "@/lib/pipeline/photo-adjust";
import { PHOTO_SECTIONS, PhotoPane, type PhotoEditControls, type PhotoSection } from "./photo-pane";
import { PillButton } from "./ui";

/**
 * The panel of the workspace shown (G-095, proposal D): Edit's has tabs and the tab of the tool in hand; Photo's holds the
 * settings a Generate reads, with Generate under them; Export's holds what to make and what an export reads.
 *
 * It is handed the owners of what it shows (the options, the generation, the exports, the lit threads and so on) and
 * picks from each what its panes need, so the shell says which owners there are and not which field goes to which pane.
 */
export interface WorkspacePanelProps {
  /** Null when no workspace can be shown (G-103): no chart shown and Photo off, so only the start choices are offered. */
  workspace: Workspace | null;
  pattern: StitchPattern | null;
  /** A chart is open and the start screen is not over it. */
  chartShown: boolean;
  startingNew: boolean;
  /** The chart was started with no photo, so it has no photo settings. */
  photoFree: boolean;
  options: WorkspaceOptions;
  onOptionChange: UpdateWorkspaceOption;
  /** For the options that belong to the open chart where it has them (the fabric, D290). */
  onChartOptionChange: UpdateWorkspaceOption;
  edit: {
    tab: InspectorTab;
    onTabChange: (tab: InspectorTab) => void;
    /** The tab of the tool in hand, when it brings one. */
    toolTab: { label: string; pane: React.ReactNode; shown: boolean; onChoose: () => void } | null;
    name: string;
    onNameChange: (name: string) => void;
    onNameCommit: () => void;
    /** One undoable step on the chart. */
    commit: (next: StitchPattern) => void;
    onPreviewChange: (preview: { base: StitchPattern; next: StitchPattern } | null) => void;
    onMergeColors: (sourceIndex: number, targetIndex: number) => void;
    documentId: number;
  };
  colours: DrawingColours;
  lit: LitThreadsState;
  piece: Tools["piece"];
  source: ReturnType<typeof useSourceImage>;
  generation: ReturnType<typeof useGeneration>;
  prediction: ReturnType<typeof useColorPrediction>;
  adjustPreview: PhotoAdjustPreview;
  /** Apply, Cancel and the photo's own history, for the Picture tab (G-124). */
  photoEdit: PhotoEditControls;
  exports: ReturnType<typeof useExports>;
}

export function WorkspacePanel({
  workspace,
  pattern,
  chartShown,
  startingNew,
  photoFree,
  options,
  onOptionChange,
  onChartOptionChange,
  edit,
  colours,
  lit,
  piece,
  source,
  generation,
  prediction,
  adjustPreview,
  photoEdit,
  exports,
}: WorkspacePanelProps) {
  // The tab of the Photo panel: the chart's settings first, since they are what is tried most.
  const [photoSection, setPhotoSection] = useState<PhotoSection>("chart");
  // The tabs are for the settings; while there are none to show (no photo yet, a chart with none, a job running) the
  // panel holds one pane under its name.
  const photoSettingsShown = !startingNew && !photoFree && source.hasPhoto && !generation.isProcessing;

  if (workspace === null) {
    return (
      <Inspector
        title="Settings"
        tabs={null}
        pane={<p className="p-4 text-[13px] text-muted">Start a chart from the choices in the middle; its settings appear here.</p>}
      />
    );
  }

  if (workspace === "edit") {
    return (
      <Inspector
        title="Chart settings"
        tabs={{ list: EDIT_TABS, chosen: edit.tab, onChoose: (tab) => edit.onTabChange(tab as InspectorTab), disabled: !chartShown }}
        toolTab={edit.toolTab}
        pane={
          edit.tab === "chart" ? (
            <ChartPane
              pattern={pattern}
              options={options}
              onChange={onChartOptionChange}
              name={edit.name}
              onNameChange={edit.onNameChange}
              onNameCommit={edit.onNameCommit}
            />
          ) : (
            <ColorsDock
              pattern={pattern}
              dimmed={piece.selection !== null}
              activeColorIndex={colours.activeColorIndex}
              onActiveColorChange={colours.setActiveColorIndex}
              onBackgroundColorChange={colours.setBackgroundColorIndex}
              litColorIndices={lit.colors}
              onToggleLit={lit.toggleColor}
              litBackstitchIndices={lit.backstitch}
              onToggleLitBackstitch={lit.toggleBackstitch}
              aidaCount={options.aidaCount}
              onChange={edit.commit}
              onPreviewChange={edit.onPreviewChange}
              documentId={edit.documentId}
              onMergeColors={edit.onMergeColors}
            />
          )
        }
      />
    );
  }

  if (workspace === "export") {
    const controls: ExportControls = {
      hasPattern: chartShown,
      exportKind: exports.exportKind,
      onExportKindChange: exports.setExportKind,
      onExport: exports.exportSelected,
      onExportAll: exports.exportAll,
      isExporting: exports.isExporting,
      isExportingAll: exports.isExportingAll,
      exportProgressText: exports.exportProgressText,
    };
    return (
      <Inspector
        title="Export"
        tabs={null}
        pane={
          <ExportPane
            controls={controls}
            options={options}
            onChange={onOptionChange}
            a4Layout={paginatesAsA4(exports.exportKind) ? exports.a4LayoutPreview : null}
            a4HasPageMap={!exports.exportKind.startsWith("pdf-")}
          />
        }
        footer={<ExportFooter {...controls} />}
      />
    );
  }

  return (
    <Inspector
      title="Photo settings"
      tabs={
        photoSettingsShown
          ? {
              list: PHOTO_SECTIONS,
              chosen: photoSection,
              onChoose: (tab) => {
                // Leaving the Picture tab gives unapplied sliders up, as leaving Photo does (Owner, 2026-10-07).
                if (tab !== "picture" && !isNeutralAdjust(options.photoAdjust)) onOptionChange("photoAdjust", NEUTRAL_ADJUST);
                setPhotoSection(tab as PhotoSection);
              },
              disabled: false,
            }
          : null
      }
      pane={
        photoFree && !startingNew ? (
          <p className="p-4 text-[13px] text-muted">This chart was started from an empty canvas, so it has no photo settings.</p>
        ) : (
          <PhotoPane
            section={photoSection}
            options={options}
            onChange={onOptionChange}
            isProcessing={generation.isProcessing}
            progress={generation.progress}
            queueMessage={generation.queueMessage}
            hasPattern={chartShown}
            onDismissError={() => generation.setError(null)}
            hasPhoto={!startingNew && source.hasPhoto}
            sourceSize={source.meta ? { width: source.meta.naturalWidth, height: source.meta.naturalHeight } : null}
            isLoadingImage={!startingNew && source.isLoading}
            onCancel={generation.cancel}
            onAdjustSettled={adjustPreview.settle}
            photoEdit={photoEdit}
            error={generation.error}
            prediction={prediction.prediction}
            predictionLoading={prediction.loading}
          />
        )
      }
      footer={
        // 1b draws Generate only once a photo is loaded ("B . Before generate"); the first run has no footer.
        !startingNew && !photoFree && source.hasPhoto ? (
          <div className="flex flex-col gap-2">
            {/* A Generate reads the photo as applied (Owner, 2026-10-07), so moved sliders are said not to count yet. */}
            {!isNeutralAdjust(options.photoAdjust) && (
              <p data-testid="sliders-not-applied" className="text-[11px] leading-4 text-warning">
                The slider changes are not applied: Generate uses the photo without them. Apply them first to use them.
              </p>
            )}
            <PillButton
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => void generation.generate()}
              disabled={!source.hasPhoto || generation.isProcessing || source.isLoading || photoEdit.busy}
            >
              {pattern ? "Regenerate" : "Generate pattern"}
            </PillButton>
          </div>
        ) : null
      }
    />
  );
}
