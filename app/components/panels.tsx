import { useState } from "react";
import { hexToRgb } from "@/lib/color/color";
import type { ProjectLoadFailure } from "@/lib/editor/project-store";
import type { CanvasResizeDelta } from "@/lib/editor/pattern-edit";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import type { calculateA4Layout, OverlapCells } from "@/lib/export/a4-layout";
import { STANDARD_AIDA_COUNTS } from "@/lib/export/finished-size";
import type { RGB, StitchPattern } from "@/lib/types";
import { NoticeBar, PanelBar, PillButton, SegmentedControl } from "./ui";

export interface WorkspaceNoticesProps {
  restoreFailure: ProjectLoadFailure | null;
  onDownloadRestoreReport: () => void;
  onDismissRestoreFailure: () => void;
  openError: string | null;
  exportError: string | null;
  /** Shown only while an A4 or PDF export kind is selected. */
  a4Layout: ReturnType<typeof calculateA4Layout> | null;
}

/** The strips under the top bar: a failed auto-restore (D101), open and export errors, and the A4 page count. */
export function WorkspaceNotices({ restoreFailure, onDownloadRestoreReport, onDismissRestoreFailure, openError, exportError, a4Layout }: WorkspaceNoticesProps) {
  return (
    <>
      {restoreFailure && (
        <div
          role="alert"
          data-testid="restore-failure"
          className="flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-4 py-1 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
        >
          <span>The autosaved project couldn&apos;t be restored, so this session started fresh. The failed data is available as an error report.</span>
          <button
            type="button"
            onClick={onDownloadRestoreReport}
            className="rounded-full border border-amber-400 px-3 py-0.5 font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900"
          >
            Download error report
          </button>
          <button type="button" onClick={onDismissRestoreFailure} className="rounded-full px-3 py-0.5 font-medium hover:bg-amber-100 dark:hover:bg-amber-900">
            Dismiss
          </button>
        </div>
      )}
      {openError && <NoticeBar tone="error">{openError}</NoticeBar>}
      {exportError && <NoticeBar tone="error">{exportError}</NoticeBar>}
      {a4Layout && (
        <NoticeBar tone="info">
          {a4Layout.columns} × {a4Layout.rows} pages — {a4Layout.pages.length + 2}+ total (incl. simple + extended legend). Overlap in Options.
        </NoticeBar>
      )}
    </>
  );
}

export function OptionsPanel({ options, onChange, onClose }: { options: WorkspaceOptions; onChange: UpdateWorkspaceOption; onClose: () => void }) {
  return (
    <PanelBar>
      <span className="text-sm font-medium">Options</span>
      <label className="flex items-center gap-1.5 text-sm">
        Fabric count
        <select
          value={options.aidaCount}
          onChange={(e) => onChange("aidaCount", Number(e.target.value))}
          className="rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {STANDARD_AIDA_COUNTS.map((count) => (
            <option key={count} value={count}>
              {count}-count
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-1.5 text-sm">
        Unit
        <SegmentedControl
          options={[
            { value: "in", label: "in" },
            { value: "cm", label: "cm" },
          ]}
          value={options.sizeUnit}
          onChange={(unit) => onChange("sizeUnit", unit)}
        />
      </div>
      <label className="flex items-center gap-1.5 text-sm">
        Author name
        <input
          type="text"
          value={options.authorName}
          onChange={(e) => onChange("authorName", e.target.value)}
          placeholder="(shown on exported charts)"
          className="w-56 rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </label>
      <label className="flex items-center gap-1.5 text-sm" title="How many stitches of overlap the A4/PDF page exports repeat between adjacent pages, so they can be lined up when printed">
        A4/PDF overlap
        <select
          value={options.overlapCells}
          onChange={(e) => onChange("overlapCells", Number(e.target.value) as OverlapCells)}
          className="rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          <option value={0}>0</option>
          <option value={5}>5</option>
          <option value={10}>10</option>
        </select>
      </label>
      <span className="text-xs text-zinc-500">Saved automatically in this browser.</span>
      <PillButton size="md" onClick={onClose} className="ml-auto">
        Close
      </PillButton>
    </PanelBar>
  );
}

export interface SelectionBarProps {
  hasSelection: boolean;
  hasClipboard: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onDeselect: () => void;
}

export function SelectionBar({ hasSelection, hasClipboard, onCopy, onPaste, onFlipHorizontal, onFlipVertical, onDeselect }: SelectionBarProps) {
  return (
    <PanelBar gap="gap-2">
      <span className="text-sm font-medium">Selection</span>
      <span className="text-xs text-zinc-500">
        {hasSelection ? "Drag inside it to move, or drag elsewhere to start a new selection." : "Drag a rectangle on the Image window to select it."}
      </span>
      <div className="ml-auto flex items-center gap-2">
        <PillButton onClick={onCopy} disabled={!hasSelection}>
          Copy
        </PillButton>
        <PillButton onClick={onPaste} disabled={!hasClipboard}>
          Paste
        </PillButton>
        <PillButton onClick={onFlipHorizontal} disabled={!hasSelection}>
          Flip horizontal
        </PillButton>
        <PillButton onClick={onFlipVertical} disabled={!hasSelection}>
          Flip vertical
        </PillButton>
        <PillButton onClick={onDeselect} disabled={!hasSelection}>
          Deselect
        </PillButton>
      </div>
    </PanelBar>
  );
}

const RESIZE_EDGES = [
  { key: "top", label: "Top" },
  { key: "bottom", label: "Bottom" },
  { key: "left", label: "Left" },
  { key: "right", label: "Right" },
] as const;

/**
 * Crop or expand any edge in one step (G-012 M4). Mount it with a new `key` on every open request: clicking
 * "Resize canvas…" while it is already open resets its fields.
 */
export function ResizePanel({ pattern, onApply, onCancel }: { pattern: StitchPattern; onApply: (delta: CanvasResizeDelta, fillRgb: RGB) => void; onCancel: () => void }) {
  const [delta, setDelta] = useState<CanvasResizeDelta>({ left: 0, right: 0, top: 0, bottom: 0 });
  const [fillHex, setFillHex] = useState("#ffffff");
  const [error, setError] = useState<string | null>(null);
  const expanding = delta.left > 0 || delta.right > 0 || delta.top > 0 || delta.bottom > 0;

  function apply() {
    try {
      onApply(delta, hexToRgb(fillHex));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't resize the canvas.");
    }
  }

  return (
    <PanelBar>
      <span className="text-sm font-medium">Resize canvas</span>
      {RESIZE_EDGES.map(({ key, label }) => (
        <label key={key} className="flex items-center gap-1.5 text-sm">
          {label}
          <input
            type="number"
            value={delta[key]}
            onChange={(e) => setDelta((prev) => ({ ...prev, [key]: Number(e.target.value) || 0 }))}
            className="w-16 rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      ))}
      <span className="text-xs text-zinc-500">(positive expands, negative crops)</span>
      {expanding && (
        <label className="flex items-center gap-1.5 text-sm">
          Fill color
          <input type="color" value={fillHex} onChange={(e) => setFillHex(e.target.value)} className="h-6 w-8 rounded border border-zinc-300 dark:border-zinc-700" />
        </label>
      )}
      <span className="text-xs text-zinc-500">
        → {pattern.width + delta.left + delta.right} × {pattern.height + delta.top + delta.bottom} stitches
      </span>
      <PillButton variant="primary" size="md" onClick={apply}>
        Apply
      </PillButton>
      <PillButton size="md" onClick={onCancel}>
        Cancel
      </PillButton>
      {error && <p className="w-full text-sm text-red-600 dark:text-red-400">{error}</p>}
    </PanelBar>
  );
}
