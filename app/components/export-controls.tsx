"use client";

import type { ExportChoice } from "../hooks/use-exports";
import { PillButton } from "./ui";

/**
 * Saving a file (G-045 M2, direction 1b): one chosen format beside a plain Export, and the whole bundle as the filled
 * action beneath it. Lifted out of the top bar when that dissolved; the select keeps its "Export" label and both
 * buttons their names, so nothing that finds them by name has to change.
 */

/** Editable JSON first (the default, most complete format), then the realistic preview, then Color and Black & white groups (Owner spec, 2026-09-12). */
const EXPORT_KIND_TOP_OPTIONS: Array<{ value: ExportChoice; label: string }> = [
  { value: "editable", label: "Editable pattern (.json)" },
  { value: "oxs", label: "OXS chart for other programs (.oxs)" },
  { value: "png-realistic", label: "Realistic preview PNG" },
  { value: "pixel-art", label: "Pixel art PNG (1 px per stitch)" },
];

const EXPORT_KIND_GROUPS: Array<{ heading: string; options: Array<{ value: ExportChoice; label: string }> }> = [
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
  exportKind: ExportChoice;
  onExportKindChange: (kind: ExportChoice) => void;
  onExport: () => void;
  onExportAll: () => void;
  isExporting: boolean;
  isExportingAll: boolean;
  /** A running export's progress, such as "Page 12 of 180"; null when there is none. */
  exportProgressText: string | null;
}

export function ExportControls({
  hasPattern,
  exportKind,
  onExportKindChange,
  onExport,
  onExportAll,
  isExporting,
  isExportingAll,
  exportProgressText,
}: ExportControlsProps) {
  const busy = isExporting || isExportingAll;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <select
          aria-label="Export"
          value={exportKind}
          onChange={(e) => onExportKindChange(e.target.value as ExportChoice)}
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
        className="flex w-full items-center justify-center gap-2"
        title="One .cspzip with everything: editable JSON, an OXS chart, color/B&W/realistic PNGs, the Pattern Keeper PDF, and A4_color/A4_bw subfolders of A4 page PNGs"
      >
        {/* 1b draws the whole-bundle action with a download mark; the single Export beside the select carries none. */}
        <svg
          viewBox="0 0 24 24"
          className="h-[15px] w-[15px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 4v10" />
          <path d="M8 11l4 4 4-4" />
          <path d="M4 17.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-1.5" />
        </svg>
        {isExportingAll ? (exportProgressText ?? "Building…") : "Export all (.cspzip)"}
      </PillButton>
    </div>
  );
}
