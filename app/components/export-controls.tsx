"use client";

import type { ExportKind } from "../hooks/use-exports";
import { PillButton } from "./ui";

/**
 * Saving a file (G-045 M2, direction 1b): one chosen format beside a plain Export, and the whole bundle as the filled
 * action beneath it. Lifted out of the top bar when that dissolved; the select keeps its "Export" label and both
 * buttons their names, so nothing that finds them by name has to change.
 */

/** Editable JSON first (the default, most complete format), then the realistic preview, then Color and Black & white groups (Owner spec, 2026-09-12). */
const EXPORT_KIND_TOP_OPTIONS: Array<{ value: ExportKind; label: string }> = [
  { value: "editable", label: "Editable pattern (.json)" },
  { value: "oxs", label: "OXS chart for other programs (.oxs)" },
  { value: "png-realistic", label: "Realistic preview PNG" },
];

const EXPORT_KIND_GROUPS: Array<{ heading: string; options: Array<{ value: ExportKind; label: string }> }> = [
  {
    heading: "Color",
    options: [
      { value: "png-color", label: "Full chart PNG" },
      { value: "a4-color", label: "A4 pages (ZIP)" },
      { value: "pdf-color", label: "PDF for Pattern Keeper" },
    ],
  },
  {
    heading: "Black & white",
    options: [
      { value: "png-bw", label: "Full chart PNG" },
      { value: "a4-bw", label: "A4 pages (ZIP)" },
      { value: "pdf-bw", label: "PDF for Pattern Keeper" },
    ],
  },
];

export interface ExportControlsProps {
  hasPattern: boolean;
  exportKind: ExportKind;
  onExportKindChange: (kind: ExportKind) => void;
  onExport: () => void;
  onExportAll: () => void;
  isExporting: boolean;
  isExportingAll: boolean;
  /** A running export's progress, such as "Page 12 of 180"; null when there is none. */
  exportProgressText: string | null;
}

export function ExportControls({ hasPattern, exportKind, onExportKindChange, onExport, onExportAll, isExporting, isExportingAll, exportProgressText }: ExportControlsProps) {
  const busy = isExporting || isExportingAll;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <select
          aria-label="Export"
          value={exportKind}
          onChange={(e) => onExportKindChange(e.target.value as ExportKind)}
          className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink"
        >
          {EXPORT_KIND_TOP_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
          {EXPORT_KIND_GROUPS.map(({ heading, options }) => (
            <optgroup key={heading} label={heading}>
              {options.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <PillButton
          variant="raised"
          size="md"
          onClick={onExport}
          disabled={!hasPattern || busy}
          title="Download just the file chosen on the left -- quick, and the editable .json doubles as your save file"
        >
          {isExporting ? (exportProgressText ?? "Preparing…") : "Export"}
        </PillButton>
      </div>
      <PillButton
        variant="primary"
        size="md"
        onClick={onExportAll}
        disabled={!hasPattern || busy}
        title="One .cspzip with everything: editable JSON, an OXS chart, color/B&W/realistic PNGs, the Pattern Keeper PDF, and A4_color/A4_bw subfolders of A4 page PNGs"
      >
        {isExportingAll ? (exportProgressText ?? "Building…") : "Export all"}
      </PillButton>
    </div>
  );
}
