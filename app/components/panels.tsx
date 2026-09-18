import { useState } from "react";
import type { ProjectLoadFailure } from "@/lib/editor/project-store";
import type { WorkspaceOptions } from "@/lib/editor/workspace-storage";
import type { calculateA4Layout } from "@/lib/export/a4-layout";
import { describeBlankSizeProblem } from "@/lib/editor/blank-pattern";
import { formatFinishedSize } from "@/lib/export/finished-size";
import { MAX_STITCHES, MIN_STITCHES } from "@/lib/types";
import { NoticeBar, PanelBar, PillButton } from "./ui";

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
          className="flex flex-wrap items-center gap-3 border-b border-amber-900 bg-amber-950/60 px-4 py-1 text-xs text-amber-200"
        >
          <span>The autosaved project couldn&apos;t be restored, so this session started fresh. The failed data is available as an error report.</span>
          <button
            type="button"
            onClick={onDownloadRestoreReport}
            className="rounded-full border border-amber-700 px-3 py-0.5 font-medium hover:bg-amber-900"
          >
            Download error report
          </button>
          <button type="button" onClick={onDismissRestoreFailure} className="rounded-full px-3 py-0.5 font-medium hover:bg-amber-900">
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
  /** The floating piece, for 1b's "12 x 9 at 14, 6" readout; null before one is drawn. */
  selection: { x: number; y: number; width: number; height: number } | null;
  /** Undo and Redo travel with this bar: it replaces the context bar, which is where they otherwise live. */
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
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
  selection,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
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
    // 1b gives the select tool its own top panel rather than a strip under one (Owner, 2026-09-18), so this takes the
    // context bar's shape exactly -- and carries Undo and Redo, which would otherwise vanish for as long as a
    // selection is in hand.
    <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line bg-surface px-4">
      <div className="flex items-center gap-1.5">
        <PillButton size="xs" onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">
          Undo
        </PillButton>
        <PillButton size="xs" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y or Ctrl+Shift+Z">
          Redo
        </PillButton>
      </div>

      <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />

      <span className="text-[11px] font-medium tracking-wider text-muted uppercase">Selection</span>
      {selection ? (
        <span className="font-mono text-xs text-muted">
          {selection.width} × {selection.height} at {selection.x}, {selection.y}
        </span>
      ) : (
        <span className="text-xs text-muted">Drag a rectangle on the chart to select it.</span>
      )}

      <div className="ml-auto flex items-center gap-1">
        {(
          [
            ["Copy", "Copy the selected piece", <CopyIcon key="i" />, onCopy, !hasSelection],
            ["Paste", "Paste the copied piece as a new floating selection", <PasteIcon key="i" />, onPaste, !hasClipboard],
            ["Flip horizontal", "Mirror the piece left to right", <FlipIcon key="i" axis="horizontal" />, onFlipHorizontal, !hasSelection],
            ["Flip vertical", "Mirror the piece top to bottom", <FlipIcon key="i" axis="vertical" />, onFlipVertical, !hasSelection],
            ["Rotate right", "Turn the piece a quarter turn clockwise", <RotateIcon key="i" clockwise />, onRotateClockwise, !hasSelection],
            ["Rotate left", "Turn the piece a quarter turn anticlockwise", <RotateIcon key="i" clockwise={false} />, onRotateAnticlockwise, !hasSelection],
            ["Crop", "Cut the chart down to this rectangle, discarding everything outside it", <CropIcon key="i" />, onCrop, !hasSelection],
            ["Discard", "Put the chart back as it was when this selection started, discarding its changes", <CancelIcon key="i" />, onCancel, !hasSelection],
            ["Apply here", "Merge the piece into the picture where it sits", <DeselectIcon key="i" />, onDeselect, !hasSelection],
          ] as const
        ).map(([label, title, icon, onClick, isDisabled]) => {
          const named = label === "Discard" || label === "Apply here";
          return (
            <PillButton
              key={label}
              aria-label={label}
              title={title}
              onClick={onClick}
              disabled={isDisabled}
              className={named ? "flex items-center gap-1.5 px-2.5 whitespace-nowrap" : "px-2"}
            >
              {icon}
              {named && label}
            </PillButton>
          );
        })}
      </div>
    </div>
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
            className="w-20 rounded border border-line px-1.5 py-0.5 text-sm bg-sunken"
          />
        </label>
      ))}
      <span className="text-xs text-muted" data-testid="new-chart-size">
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
      {problem && <p className="w-full text-sm text-red-300">{problem}</p>}
    </PanelBar>
  );
}

