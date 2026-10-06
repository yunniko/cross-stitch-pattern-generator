"use client";

import type { calculateA4Layout } from "@/lib/export/a4-layout";
import { VALID_OVERLAP_CELLS, type WorkspaceOptions } from "@/lib/editor/workspace-storage";
import { EXPORT_KIND_GROUPS, exportChoiceFeature, exportKindFeature, type PrintFormat, type Tone } from "@/lib/export/export-kinds";
import { featureState, featureUsable, lockedNote } from "@/lib/features/features";
import type { ExportChoice } from "../hooks/use-exports";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import { SkinIcon } from "../skin/skin";
import { CellSizeField } from "./cell-size-field";
import { PillButton, SegmentedControl } from "./ui";
import { useFeature, useFeatures } from "../features/features-context";

/**
 * The Export workspace's panel (G-095 M5, proposal D): **what to make, and beside it exactly the settings that export
 * reads.** The kinds are buttons, in three groups; choosing one shows its own settings and nothing else's.
 *
 * They were in two tabs that had nothing else to do with each other: the choice at the foot of Threads as a list, its
 * settings in Chart, all of them whatever was chosen.
 */

const GROUP_LABEL = "text-[11px] font-medium uppercase tracking-[0.08em] text-muted";
const FIELD = "rounded-lg border border-line bg-sunken px-2.5 py-1.5 text-[13px] text-ink";

const printFormatOf = (choice: ExportChoice): PrintFormat | null => {
  const format = choice.split("-")[0];
  return (choice.endsWith("-color") || choice.endsWith("-bw")) && (format === "a4" || format === "pdf" || format === "png") ? format : null;
};
const toneOf = (choice: ExportChoice): Tone => (choice.endsWith("-bw") ? "bw" : "color");

export interface ExportControls {
  hasPattern: boolean;
  exportKind: ExportChoice;
  onExportKindChange: (kind: ExportChoice) => void;
  onExport: () => void;
  onExportAll: () => void;
  isExporting: boolean;
  isExportingAll: boolean;
  /** A running export's progress, such as "Page 12 of 180"; null when there is none. */
  exportProgressText: string | null;
}

export interface ExportPaneProps {
  controls: ExportControls;
  options: WorkspaceOptions;
  onChange: UpdateWorkspaceOption;
  /** How the chosen kind cuts the chart into pages; null for a kind that has no pages. */
  a4Layout: ReturnType<typeof calculateA4Layout> | null;
  /** The A4 pages come with a page map, a skein table and a colour key; the Pattern Keeper PDF keeps its simple and extended legend (G-083). */
  a4HasPageMap: boolean;
}

export function ExportPane({ controls, options, onChange, a4Layout, a4HasPageMap }: ExportPaneProps) {
  const { exportKind, onExportKindChange } = controls;
  const features = useFeatures();
  const format = printFormatOf(exportKind);
  const tone = toneOf(exportKind);

  return (
    <div className="flex flex-col gap-5 p-4">
      <div role="radiogroup" aria-label="Export" className="flex flex-col gap-3.5">
        {EXPORT_KIND_GROUPS.map(({ heading, kinds }) => (
          <div key={heading} className="flex flex-col gap-1.5">
            <span className={GROUP_LABEL}>{heading}</span>
            {kinds.map((kind) => {
              const chosen = kind.format ? kind.format === format : kind.choice === exportKind;
              const state = featureState(features, exportKindFeature(kind));
              if (state === "hidden") return null;
              const locked = state === "locked";
              return (
                <button
                  key={kind.label}
                  type="button"
                  role="radio"
                  aria-checked={chosen}
                  disabled={locked}
                  data-feature-locked={locked ? exportKindFeature(kind) : undefined}
                  data-format={kind.format}
                  data-kind={kind.choice}
                  title={locked ? lockedNote(kind.label) : kind.note}
                  // A printed kind keeps the tone last chosen for printing.
                  onClick={() => onExportKindChange(kind.format ? (`${kind.format}-${tone}` as ExportChoice) : kind.choice!)}
                  className={`rounded-lg border px-3 py-2 text-left text-[13px] transition-colors disabled:opacity-45 ${
                    chosen ? "border-accent bg-accent/15 font-medium text-ink" : "border-line text-muted hover:bg-raised hover:text-ink"
                  }`}
                >
                  {kind.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-2.5 border-t border-line pt-3.5" data-testid="export-settings">
        <span className={GROUP_LABEL}>Settings of this export</span>
        {format && (
          <div className="flex min-h-8 items-center justify-between text-[13px]">
            Print in
            <div role="group" aria-label="Print in">
              <SegmentedControl
                options={[
                  { value: "color", label: "Color" },
                  { value: "bw", label: "Black & white" },
                ]}
                value={tone}
                onChange={(next) => onExportKindChange(`${format}-${next}` as ExportChoice)}
              />
            </div>
          </div>
        )}
        {format === "a4" && <CellSizeField value={options.exportCellMm} onChange={(mm) => onChange("exportCellMm", mm)} />}
        {(format === "a4" || format === "pdf") && (
          <div
            className="flex min-h-8 items-center justify-between text-[13px]"
            title="How many stitches of overlap the A4/PDF page exports repeat between adjacent pages, so they can be lined up when printed"
          >
            A4/PDF overlap
            <div role="group" aria-label="A4/PDF overlap">
              <SegmentedControl
                options={VALID_OVERLAP_CELLS.map((cells) => ({ value: String(cells), label: String(cells) }))}
                value={String(options.overlapCells)}
                onChange={(cells) => onChange("overlapCells", Number(cells) as WorkspaceOptions["overlapCells"])}
              />
            </div>
          </div>
        )}
        {a4Layout && (
          <p className="text-xs leading-4 text-muted" data-testid="a4-page-count">
            {a4Layout.columns} × {a4Layout.rows} pages —{" "}
            {a4HasPageMap
              ? `${a4Layout.pages.length + 3}+ total (incl. page map, skein table + colour key).`
              : `${a4Layout.pages.length + 2}+ total (incl. simple + extended legend).`}{" "}
            The cuts are drawn over the chart.
          </p>
        )}
        {exportKind === "png-realistic" && (
          <>
            <label
              className="flex min-h-8 items-center justify-between gap-3 text-[13px]"
              title="On: the exported realistic preview sits on the canvas, with its colour and texture, instead of a transparent background. With the texture Off it carries the plain canvas colour."
            >
              Canvas in exported preview
              <input
                type="checkbox"
                checked={options.exportCanvas}
                onChange={(e) => onChange("exportCanvas", e.target.checked)}
                className="h-4 w-4 shrink-0 accent-[var(--at-accent)]"
              />
            </label>
            <p className="text-xs leading-4 text-muted">
              Drawn in the stitch texture chosen for the view, under &ldquo;Canvas &amp; stitch texture&rdquo; below the chart.
            </p>
          </>
        )}
        <label
          className="flex flex-col gap-1.5 text-xs text-muted"
          title="Shown on exported charts. It is the same name as in Preferences."
        >
          Author name
          <input
            type="text"
            value={options.authorName}
            onChange={(e) => onChange("authorName", e.target.value)}
            placeholder="(shown on exported charts)"
            className={FIELD}
          />
        </label>
      </section>
    </div>
  );
}

/** Export, and the whole bundle: pinned under the panel, whatever kind is chosen above. */
export function ExportFooter({
  hasPattern,
  exportKind,
  onExport,
  onExportAll,
  isExporting,
  isExportingAll,
  exportProgressText,
}: ExportControls) {
  const busy = isExporting || isExportingAll;
  // Under the feature switches (G-102): the chosen kind may be one the person cannot make, and Export all is a feature.
  const features = useFeatures();
  const chosenUsable = featureUsable(features, exportChoiceFeature(exportKind));
  const all = useFeature("export.all");
  return (
    <div className="flex flex-col gap-2.5">
      <PillButton
        variant="primary"
        size="lg"
        className="w-full"
        onClick={onExport}
        disabled={!hasPattern || busy || !chosenUsable}
        title={chosenUsable ? "Download the file chosen above" : "Choose a kind above that is available to you"}
      >
        {isExporting ? (exportProgressText ?? "Preparing…") : "Export"}
      </PillButton>
      {all.shown && (
        <PillButton
          variant="raised"
          size="md"
          onClick={onExportAll}
          disabled={!hasPattern || busy || !all.usable}
          data-feature-locked={all.usable ? undefined : "export.all"}
          className="flex w-full items-center justify-center gap-2"
          title="One .cspzip with everything: editable JSON, an OXS chart, color/B&W/realistic PNGs, the Pattern Keeper PDF, and A4_color/A4_bw subfolders of A4 page PNGs"
        >
          <SkinIcon name="download" />
          {isExportingAll ? (exportProgressText ?? "Building…") : "Export all (.cspzip)"}
        </PillButton>
      )}
    </div>
  );
}
