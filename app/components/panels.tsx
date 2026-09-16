import { useState } from "react";
import type { ProjectLoadFailure } from "@/lib/editor/project-store";
import type { CanvasResizeDelta } from "@/lib/editor/pattern-edit";
import type { UpdateWorkspaceOption } from "../hooks/use-workspace-options";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import type { calculateA4Layout, OverlapCells } from "@/lib/export/a4-layout";
import { describeBlankSizeProblem } from "@/lib/editor/blank-pattern";
import { formatFinishedSize, STANDARD_AIDA_COUNTS } from "@/lib/export/finished-size";
import { MAX_STITCHES, MIN_STITCHES, type StitchPattern } from "@/lib/types";
import { NoticeBar, PanelBar, PillButton, SegmentedControl } from "./ui";

export interface WorkspaceNoticesProps {
  restoreFailure: ProjectLoadFailure | null;
  onDownloadRestoreReport: () => void;
  onDismissRestoreFailure: () => void;
  openError: string | null;
  /** What an OXS import changed or left out (G-028). */
  openNotice: string | null;
  exportError: string | null;
  /** Shown only while an A4 or PDF export kind is selected. */
  a4Layout: ReturnType<typeof calculateA4Layout> | null;
}

/** The strips under the top bar: a failed auto-restore (D101), open and export errors, and the A4 page count. */
export function WorkspaceNotices({ restoreFailure, onDownloadRestoreReport, onDismissRestoreFailure, openError, openNotice, exportError, a4Layout }: WorkspaceNoticesProps) {
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
      {openNotice && (
        <NoticeBar tone="info">
          <span data-testid="open-notice">{openNotice}</span>
        </NoticeBar>
      )}
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
      <label
        className="flex items-center gap-1.5 text-sm"
        title="On: double-clicking with the Brush fills the whole region under the pointer, as one undo step. Off: a double-click just paints the two stitches you clicked."
      >
        <input
          type="checkbox"
          checked={options.doubleClickFill}
          onChange={(e) => onChange("doubleClickFill", e.target.checked)}
          className="h-3.5 w-3.5 accent-zinc-700 dark:accent-zinc-300"
        />
        Double-click fills a region
      </label>
      <span className="text-xs text-zinc-500">Saved automatically in this browser.</span>
      <PillButton size="md" onClick={onClose} className="ml-auto">
        Close
      </PillButton>
    </PanelBar>
  );
}

/** Selection-bar icons, drawn like the tools dock's (G-042): a 24-box outline, sized to the pill. */
const ACTION_ICON_PROPS = { viewBox: "0 0 24 24", className: "h-4 w-4", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

function CopyIcon() {
  return (
    <svg {...ACTION_ICON_PROPS}>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H5.5A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" />
    </svg>
  );
}

function PasteIcon() {
  return (
    <svg {...ACTION_ICON_PROPS}>
      <path d="M9 4h6v3H9z" />
      <path d="M9 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H15" />
    </svg>
  );
}

function FlipIcon({ axis }: { axis: "horizontal" | "vertical" }) {
  const vertical = axis === "vertical";
  return (
    <svg {...ACTION_ICON_PROPS}>
      {vertical ? <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="3 2" /> : <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="3 2" />}
      {vertical ? <path d="M7 9.5 12 5l5 4.5z" /> : <path d="M9.5 7 5 12l4.5 5z" />}
      {vertical ? <path d="M7 14.5 12 19l5-4.5z" fill="currentColor" opacity="0.35" /> : <path d="M14.5 7 19 12l-4.5 5z" fill="currentColor" opacity="0.35" />}
    </svg>
  );
}

function RotateIcon({ clockwise }: { clockwise: boolean }) {
  return (
    <svg {...ACTION_ICON_PROPS}>
      <g transform={clockwise ? undefined : "scale(-1 1) translate(-24 0)"}>
        <path d="M5 12a7 7 0 1 1 2.5 5.4" />
        <path d="M5 6.5V12h5.5" />
      </g>
    </svg>
  );
}

function CropIcon() {
  return (
    <svg {...ACTION_ICON_PROPS}>
      <path d="M7 2.5V17h14" />
      <path d="M3 7h14v14.5" />
    </svg>
  );
}

function CancelIcon() {
  return (
    <svg {...ACTION_ICON_PROPS}>
      <circle cx="12" cy="12" r="8.5" />
      <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
      <line x1="15.5" y1="8.5" x2="8.5" y2="15.5" />
    </svg>
  );
}

function DeselectIcon() {
  return (
    <svg {...ACTION_ICON_PROPS}>
      <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="4 3" />
      <path d="M8.5 12.5 11 15l4.5-5.5" />
    </svg>
  );
}

export interface SelectionBarProps {
  hasSelection: boolean;
  hasClipboard: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onRotateClockwise: () => void;
  onRotateAnticlockwise: () => void;
  onCrop: () => void;
  onCancel: () => void;
  onDeselect: () => void;
}

export function SelectionBar({
  hasSelection,
  hasClipboard,
  onCopy,
  onPaste,
  onFlipHorizontal,
  onFlipVertical,
  onRotateClockwise,
  onRotateAnticlockwise,
  onCrop,
  onCancel,
  onDeselect,
}: SelectionBarProps) {
  return (
    <PanelBar gap="gap-2">
      <span className="text-sm font-medium">Selection</span>
      <span className="text-xs text-zinc-500">
        {hasSelection ? "Drag inside it to move, or drag elsewhere to start a new selection." : "Drag a rectangle on the Image window to select it."}
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        {(
          [
            ["Copy", "Copy the selected piece", <CopyIcon key="i" />, onCopy, !hasSelection],
            ["Paste", "Paste the copied piece as a new floating selection", <PasteIcon key="i" />, onPaste, !hasClipboard],
            ["Flip horizontal", "Mirror the piece left to right", <FlipIcon key="i" axis="horizontal" />, onFlipHorizontal, !hasSelection],
            ["Flip vertical", "Mirror the piece top to bottom", <FlipIcon key="i" axis="vertical" />, onFlipVertical, !hasSelection],
            ["Rotate right", "Turn the piece a quarter turn clockwise", <RotateIcon key="i" clockwise />, onRotateClockwise, !hasSelection],
            ["Rotate left", "Turn the piece a quarter turn anticlockwise", <RotateIcon key="i" clockwise={false} />, onRotateAnticlockwise, !hasSelection],
            ["Crop", "Cut the chart down to this rectangle, discarding everything outside it", <CropIcon key="i" />, onCrop, !hasSelection],
            ["Cancel", "Put the chart back as it was when this selection started, discarding its changes", <CancelIcon key="i" />, onCancel, !hasSelection],
            ["Deselect", "Merge the piece into the picture where it sits", <DeselectIcon key="i" />, onDeselect, !hasSelection],
          ] as const
        ).map(([label, title, icon, onClick, isDisabled]) => (
          <PillButton key={label} aria-label={label} title={title} onClick={onClick} disabled={isDisabled} className="px-2">
            {icon}
          </PillButton>
        ))}
      </div>
    </PanelBar>
  );
}

/**
 * Starting a chart from nothing (G-040): width and height in stitches, with the finished fabric size shown as they
 * change. Mounted with a new `key` on every open request, like `ResizePanel`, so reopening it resets the fields.
 */
export function NewChartPanel({ options, onCreate, onCancel }: { options: WorkspaceOptions; onCreate: (width: number, height: number) => void; onCancel: () => void }) {
  const [width, setWidth] = useState(100);
  const [height, setHeight] = useState(100);
  const problem = describeBlankSizeProblem(width, height);

  return (
    <PanelBar>
      <span className="text-sm font-medium">New blank chart</span>
      {(
        [
          ["Width", width, setWidth],
          ["Height", height, setHeight],
        ] as const
      ).map(([label, value, setValue]) => (
        <label key={label} className="flex items-center gap-1.5 text-sm">
          {label}
          <input
            type="number"
            min={MIN_STITCHES}
            max={MAX_STITCHES}
            value={value}
            onChange={(e) => setValue(Math.round(Number(e.target.value)))}
            aria-label={`${label} in stitches`}
            className="w-20 rounded border border-zinc-300 px-1.5 py-0.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
      ))}
      <span className="text-xs text-zinc-500" data-testid="new-chart-size">
        {problem === null
          ? `→ ${width} × ${height} stitches, ≈ ${formatFinishedSize(width, height, options.aidaCount, options.sizeUnit)} at ${options.aidaCount}-count Aida`
          : "→ enter a size to see the finished fabric size"}
      </span>
      <PillButton variant="primary" size="md" onClick={() => onCreate(width, height)} disabled={problem !== null}>
        Create
      </PillButton>
      <PillButton size="md" onClick={onCancel}>
        Cancel
      </PillButton>
      {problem && <p className="w-full text-sm text-red-600 dark:text-red-400">{problem}</p>}
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
export function ResizePanel({ pattern, onApply, onCancel }: { pattern: StitchPattern; onApply: (delta: CanvasResizeDelta) => void; onCancel: () => void }) {
  const [delta, setDelta] = useState<CanvasResizeDelta>({ left: 0, right: 0, top: 0, bottom: 0 });
  const [error, setError] = useState<string | null>(null);

  function apply() {
    try {
      onApply(delta);
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
      <span className="text-xs text-zinc-500">(positive expands with empty stitches, negative crops)</span>
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
