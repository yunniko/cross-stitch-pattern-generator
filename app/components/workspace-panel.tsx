"use client";

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
import { ExportPane } from "./export-pane";
import { Inspector, type InspectorTab } from "./inspector";
import { PhotoPane } from "./photo-pane";
import { PillButton } from "./ui";

/**
 * The panel of the workspace shown (G-095, proposal D): Edit's has tabs and the tab of the tool in hand; Photo's holds the
 * settings a Generate reads, with Generate under them; Export's holds what to make and what an export reads.
 *
 * It is handed the owners of what it shows (the options, the generation, the exports, the lit threads and so on) and
 * picks from each what its panes need, so the shell says which owners there are and not which field goes to which pane.
 */
export interface WorkspacePanelProps {
  workspace: Workspace;
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
  exports: ReturnType<typeof useExports>;
  /** Takes the chart on into the Edit workspace. */
  onEdit: () => void;
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
  exports,
  onEdit,
}: WorkspacePanelProps) {
  if (workspace === "edit") {
    return (
      <Inspector
        title="Chart settings"
        tabs={{ chosen: edit.tab, onChoose: edit.onTabChange, disabled: !chartShown }}
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
    return (
      <Inspector
        title="Export"
        tabs={null}
        pane={
          <ExportPane
            controls={{
              hasPattern: chartShown,
              exportKind: exports.exportKind,
              onExportKindChange: exports.setExportKind,
              onExport: exports.exportSelected,
              onExportAll: exports.exportAll,
              isExporting: exports.isExporting,
              isExportingAll: exports.isExportingAll,
              exportProgressText: exports.exportProgressText,
            }}
            options={options}
            onChange={onOptionChange}
            a4Layout={paginatesAsA4(exports.exportKind) ? exports.a4LayoutPreview : null}
            a4HasPageMap={!exports.exportKind.startsWith("pdf-")}
          />
        }
      />
    );
  }

  return (
    <Inspector
      title="Photo settings"
      tabs={null}
      pane={
        photoFree && !startingNew ? (
          <p className="p-4 text-[13px] text-muted">This chart was started from an empty canvas, so it has no photo settings.</p>
        ) : (
          <PhotoPane
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
            <PillButton
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => void generation.generate()}
              disabled={!source.hasPhoto || generation.isProcessing || source.isLoading}
            >
              {pattern ? "Regenerate" : "Generate pattern"}
            </PillButton>
            {pattern && (
              <PillButton
                variant="raised"
                size="md"
                className="w-full"
                onClick={onEdit}
                disabled={generation.isProcessing}
                title="Take this chart into the Edit workspace"
              >
                Continue in Edit →
              </PillButton>
            )}
          </div>
        ) : null
      }
    />
  );
}
