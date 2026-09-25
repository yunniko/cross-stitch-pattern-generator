import type { ProjectLoadFailure } from "@/lib/editor/project-store";
import type { calculateA4Layout } from "@/lib/export/a4-layout";
import { NoticeBar, PillButton } from "./ui";

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
export function WorkspaceNotices({
  restoreFailure,
  onDownloadRestoreReport,
  onDismissRestoreFailure,
  openError,
  openNotice,
  exportError,
  a4Layout,
}: WorkspaceNoticesProps) {
  return (
    <>
      {restoreFailure && (
        <div
          role="alert"
          data-testid="restore-failure"
          className="flex flex-wrap items-center gap-3 border-b border-amber-900 bg-amber-950/60 px-4 py-1 text-xs text-amber-200"
        >
          <span>
            The autosaved project couldn&apos;t be restored, so this session started fresh. The failed data is available as an error report.
          </span>
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
          {a4Layout.columns} × {a4Layout.rows} pages — {a4Layout.pages.length + 2}+ total (incl. simple + extended legend). Overlap in
          Options.
        </NoticeBar>
      )}
    </>
  );
}

/** Selection-bar icons, drawn like the tools dock's (G-042): a 24-box outline, sized to the pill. */
const ACTION_ICON_PROPS = {
  viewBox: "0 0 24 24",
  className: "h-4 w-4",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

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

function DuplicateIcon() {
  return (
    <svg {...ACTION_ICON_PROPS}>
      <rect x="4" y="4" width="11" height="11" rx="1.5" />
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
    </svg>
  );
}

function FillSelectionIcon() {
  return (
    <svg {...ACTION_ICON_PROPS}>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M7 14.5 14.5 7M7 18.5 18.5 7M10.5 19 19 10.5" />
    </svg>
  );
}

function FlipIcon({ axis }: { axis: "horizontal" | "vertical" }) {
  const vertical = axis === "vertical";
  return (
    <svg {...ACTION_ICON_PROPS}>
      {vertical ? (
        <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="3 2" />
      ) : (
        <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="3 2" />
      )}
      {vertical ? <path d="M7 9.5 12 5l5 4.5z" /> : <path d="M9.5 7 5 12l4.5 5z" />}
      {vertical ? (
        <path d="M7 14.5 12 19l5-4.5z" fill="currentColor" opacity="0.35" />
      ) : (
        <path d="M14.5 7 19 12l-4.5 5z" fill="currentColor" opacity="0.35" />
      )}
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
  /** Which selection tool is in hand: the empty-bar hint tells you how to use *that* one (G-072). */
  tool: "select" | "lasso";
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
  onDuplicate: () => void;
  /** Paints the selected area in the brush's colour (G-063). */
  onFill: () => void;
  /** False when the brush is holding no colour, which leaves nothing to fill with. */
  canFill: boolean;
  onFlipHorizontal: () => void;
  onFlipVertical: () => void;
  onRotateClockwise: () => void;
  onRotateAnticlockwise: () => void;
  onCrop: () => void;
  onCancel: () => void;
  onDeselect: () => void;
}

export interface BackstitchBarProps {
  /** How many lines are in hand; every action but Paste needs at least one. */
  selectedCount: number;
  hasClipboard: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onDuplicate: () => void;
  onMirrorHorizontal: () => void;
  onMirrorVertical: () => void;
  onRotateClockwise: () => void;
  onRotateAnticlockwise: () => void;
  onRecolour: () => void;
  /** False when no thread is in hand, which leaves nothing to recolour to. */
  canRecolour: boolean;
  onDelete: () => void;
  onDeselect: () => void;
}

/**
 * What can be done to the backstitch in hand (G-073 M3).
 *
 * The same shape as the selection bar, for the same reason: these tools replace the context bar, and Undo and
 * Redo would otherwise vanish while a line is selected. Unlike a floating selection, a backstitch edit is
 * committed as it happens, so history stays usable and Undo is never disabled here.
 */
export function BackstitchBar({
  selectedCount,
  hasClipboard,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCopy,
  onPaste,
  onDuplicate,
  onMirrorHorizontal,
  onMirrorVertical,
  onRotateClockwise,
  onRotateAnticlockwise,
  onRecolour,
  canRecolour,
  onDelete,
  onDeselect,
}: BackstitchBarProps) {
  const none = selectedCount === 0;
  return (
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
      <div className="flex items-center gap-1.5">
        <PillButton size="xs" onClick={onCopy} disabled={none} title="Copy the selected line">
          Copy
        </PillButton>
        <PillButton size="xs" onClick={onPaste} disabled={!hasClipboard} title="Paste the copied line">
          Paste
        </PillButton>
        <PillButton size="xs" onClick={onDuplicate} disabled={none} title="Leave this line and take a copy of it">
          Duplicate
        </PillButton>
      </div>
      <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
      <div className="flex items-center gap-1.5">
        <PillButton size="xs" onClick={onMirrorHorizontal} disabled={none} title="Mirror left to right">
          Mirror ↔
        </PillButton>
        <PillButton size="xs" onClick={onMirrorVertical} disabled={none} title="Mirror top to bottom">
          Mirror ↕
        </PillButton>
        <PillButton size="xs" onClick={onRotateAnticlockwise} disabled={none} title="Turn a quarter turn left">
          Turn ↺
        </PillButton>
        <PillButton size="xs" onClick={onRotateClockwise} disabled={none} title="Turn a quarter turn right">
          Turn ↻
        </PillButton>
      </div>
      <div className="h-5 w-px shrink-0 bg-line" aria-hidden="true" />
      <PillButton
        size="xs"
        onClick={onRecolour}
        disabled={none || !canRecolour}
        title={canRecolour ? "Give the selected line the colour in hand" : "Pick a thread in the list first — there is no colour to use"}
      >
        Recolour
      </PillButton>
      <PillButton size="xs" onClick={onDelete} disabled={none} title="Delete the selected line">
        Delete
      </PillButton>
      <div className="ml-auto flex items-center gap-2.5">
        <span className="text-[11px] font-medium tracking-wider text-muted uppercase">Backstitch</span>
        <span className="font-mono text-xs text-muted">{none ? "none selected" : `${selectedCount} selected`}</span>
        <PillButton size="xs" onClick={onDeselect} disabled={none} title="Escape">
          Deselect
        </PillButton>
      </div>
    </div>
  );
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
  onDuplicate,
  onFill,
  canFill,
  onFlipHorizontal,
  onFlipVertical,
  onRotateClockwise,
  onRotateAnticlockwise,
  onCrop,
  onCancel,
  onDeselect,
  tool,
}: SelectionBarProps) {
  const fillTitle = canFill
    ? "Paint the whole selected area in the brush's colour"
    : "Pick a thread in the list first \u2014 there is no colour to fill with";
  return (
    // 1b gives the select tool its own top panel rather than a strip under one (Owner, 2026-09-18), so this takes the
    // context bar's shape exactly -- and carries Undo and Redo, which would otherwise vanish for as long as a
    // selection is in hand.
    <div className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line bg-surface px-4">
      {/*
        History is not the reader's to step through while a piece is in hand: undoing underneath a floating
        selection is a state nobody asked for (Owner, 2026-09-23). Apply or Cancel first, and the title says so.
      */}
      <div className="flex items-center gap-1.5">
        <PillButton
          size="xs"
          onClick={onUndo}
          disabled={!canUndo || hasSelection}
          title={hasSelection ? "Apply or cancel the selection first" : "Ctrl+Z"}
        >
          Undo
        </PillButton>
        <PillButton
          size="xs"
          onClick={onRedo}
          disabled={!canRedo || hasSelection}
          title={hasSelection ? "Apply or cancel the selection first" : "Ctrl+Y or Ctrl+Shift+Z"}
        >
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
        <span className="text-xs text-muted">
          {tool === "lasso" ? "Draw around the stitches you want." : "Drag a rectangle on the chart to select it."}
        </span>
      )}

      <div className="ml-auto flex items-center gap-1">
        {(
          [
            ["Copy", "Copy the selected piece", <CopyIcon key="i" />, onCopy, !hasSelection],
            ["Paste", "Paste the copied piece as a new floating selection", <PasteIcon key="i" />, onPaste, !hasClipboard],
            [
              "Duplicate",
              "Leave this piece where it is and take a copy of it in hand",
              <DuplicateIcon key="i" />,
              onDuplicate,
              !hasSelection,
            ],
            // "Fill selection", not "Fill": the tool rail has a Fill of its own, and both are on screen at once.
            ["Fill selection", fillTitle, <FillSelectionIcon key="i" />, onFill, !hasSelection || !canFill],
            ["Flip horizontal", "Mirror the piece left to right", <FlipIcon key="i" axis="horizontal" />, onFlipHorizontal, !hasSelection],
            ["Flip vertical", "Mirror the piece top to bottom", <FlipIcon key="i" axis="vertical" />, onFlipVertical, !hasSelection],
            ["Rotate right", "Turn the piece a quarter turn clockwise", <RotateIcon key="i" clockwise />, onRotateClockwise, !hasSelection],
            [
              "Rotate left",
              "Turn the piece a quarter turn anticlockwise",
              <RotateIcon key="i" clockwise={false} />,
              onRotateAnticlockwise,
              !hasSelection,
            ],
            ["Crop", "Cut the chart down to this rectangle, discarding everything outside it", <CropIcon key="i" />, onCrop, !hasSelection],
            [
              "Apply here",
              "Merge the piece into the picture where it sits \u2014 Enter",
              <DeselectIcon key="i" />,
              onDeselect,
              !hasSelection,
            ],
            [
              "Cancel",
              "Put the chart back as it was when this selection started, discarding its changes \u2014 Escape",
              <CancelIcon key="i" />,
              onCancel,
              !hasSelection,
            ],
          ] as const
        ).map(([label, title, icon, onClick, isDisabled]) => {
          // Apply here sits before Cancel, and the committing pair carry their names (Owner, 2026-09-18).
          const named = label === "Cancel" || label === "Apply here";
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
