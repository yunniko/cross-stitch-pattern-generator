import { useRef, useState } from "react";
import type { AutosaveStatus } from "@/lib/editor/use-project-autosave";
import type { ExportKind } from "../hooks/use-exports";
import { PillButton } from "./ui";

const DEFAULT_NAME = "cross-stitch-pattern";

/** Editable JSON first (the default, most complete format), then the realistic preview, then a Color and a Black & white group (Owner spec, 2026-09-12). */
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

const AUTOSAVE_LABELS: Record<AutosaveStatus, string> = {
  unavailable: "Autosave unavailable — edits won't survive a reload",
  saving: "Saving…",
  saved: "Autosaved",
  idle: "",
};

export interface TopBarProps {
  /** The committed pattern name; undefined without a pattern. */
  patternName: string | undefined;
  onRename: (name: string) => void;
  hasPattern: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  autosaveStatus: AutosaveStatus;
  onOpenPattern: (file: File) => void;
  /** Opens the panel that starts a chart from an empty canvas (G-040). */
  onNewBlankChart: () => void;
  onToggleOptions: () => void;
  onOpenResize: () => void;
  exportKind: ExportKind;
  onExportKindChange: (kind: ExportKind) => void;
  onExport: () => void;
  onExportAll: () => void;
  isExporting: boolean;
  isExportingAll: boolean;
  /** A running export's progress, such as "Page 12 of 180"; null when there is none. */
  exportProgressText: string | null;
}

export function TopBar(props: TopBarProps) {
  const { patternName, hasPattern, autosaveStatus, isExporting, isExportingAll } = props;
  const openInputRef = useRef<HTMLInputElement>(null);
  const [nameDraft, setNameDraft] = useState(patternName ?? DEFAULT_NAME);
  const [lastCommittedName, setLastCommittedName] = useState(patternName);

  // Re-sync the draft only when the committed name changes (undo, regenerate, another file), not on every keystroke;
  // adjusting state during render avoids an extra effect pass.
  if (patternName !== lastCommittedName) {
    setLastCommittedName(patternName);
    setNameDraft(patternName ?? DEFAULT_NAME);
  }

  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-zinc-300 bg-white px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <h1 className="shrink-0 text-base font-semibold">Cross-Stitch Pattern Generator</h1>
      <label className="flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400">
        Name:
        <input
          type="text"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={() => props.onRename(nameDraft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          disabled={!hasPattern}
          className="w-40 rounded border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
          aria-label="Pattern name"
        />
      </label>
      <div className="flex items-center gap-2">
        <PillButton onClick={props.onUndo} disabled={!props.canUndo} title="Ctrl+Z">
          Undo
        </PillButton>
        <PillButton onClick={props.onRedo} disabled={!props.canRedo} title="Ctrl+Y or Ctrl+Shift+Z">
          Redo
        </PillButton>
      </div>
      <span
        role="status"
        data-testid="autosave-status"
        data-status={autosaveStatus}
        className={`text-xs ${autosaveStatus === "unavailable" ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-500"}`}
      >
        {autosaveStatus === "saved" && !hasPattern ? "" : AUTOSAVE_LABELS[autosaveStatus]}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <PillButton onClick={props.onNewBlankChart} title="Start a chart from an empty canvas, with no photo behind it. Such a chart is never generated from a photo.">
          New blank chart…
        </PillButton>
        <PillButton
          onClick={() => openInputRef.current?.click()}
          title="Accepts a .json pattern file, a .cspzip/.zip export-all bundle (searched for a valid pattern inside), or an .oxs chart from another cross-stitch program"
        >
          Open pattern…
        </PillButton>
        <input
          ref={openInputRef}
          type="file"
          aria-label="Open pattern file"
          accept=".json,.zip,.cspzip,.oxs,application/json,application/zip"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) props.onOpenPattern(file);
          }}
          className="hidden"
        />
        <PillButton onClick={props.onToggleOptions}>Options…</PillButton>
        <PillButton onClick={props.onOpenResize} disabled={!hasPattern}>
          Resize canvas…
        </PillButton>

        <div className="mx-1 h-5 w-px shrink-0 bg-zinc-300 dark:bg-zinc-700" aria-hidden="true" />

        <select
          aria-label="Export"
          value={props.exportKind}
          onChange={(e) => props.onExportKindChange(e.target.value as ExportKind)}
          className="min-w-[190px] rounded-full border border-zinc-300 px-3 py-1 text-sm transition-colors hover:bg-black/[.04] dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-white/[.08]"
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
        <PillButton variant="primary" onClick={props.onExport} disabled={!hasPattern || isExporting || isExportingAll}>
          {isExporting ? (props.exportProgressText ?? "Preparing…") : "Export"}
        </PillButton>
        <PillButton
          onClick={props.onExportAll}
          disabled={!hasPattern || isExporting || isExportingAll}
          title="One .cspzip with everything: editable JSON, an OXS chart, color/B&W/realistic PNGs, the Pattern Keeper PDF, and A4_color/A4_bw subfolders of A4 page PNGs"
        >
          {isExportingAll ? (props.exportProgressText ?? "Building…") : "Export all"}
        </PillButton>
      </div>
    </header>
  );
}
