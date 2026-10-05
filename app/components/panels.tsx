import type { ProjectLoadFailure } from "@/lib/editor/project-store";
import type { calculateA4Layout } from "@/lib/export/a4-layout";
import { NoticeBar, PillButton } from "./ui";
import { SkinIcon } from "../skin/skin";

export interface WorkspaceNoticesProps {
  restoreFailure: ProjectLoadFailure | null;
  onDownloadRestoreReport: () => void;
  onDismissRestoreFailure: () => void;
  openError: string | null;
  onDismissOpenError: () => void;
  /** What an OXS import changed or left out (G-028). */
  openNotice: string | null;
  onDismissOpenNotice: () => void;
  exportError: string | null;
  onDismissExportError: () => void;
  /** Shown only while an A4 or PDF export kind is selected. */
  a4Layout: ReturnType<typeof calculateA4Layout> | null;
  /** The A4 pages come with a page map, a skein table and a colour key; the Pattern Keeper PDF keeps its simple and extended legend (G-083). */
  a4HasPageMap?: boolean;
}

/** The strips under the top bar: a failed auto-restore (D101), open and export errors, and the A4 page count. */
export function WorkspaceNotices({
  restoreFailure,
  onDownloadRestoreReport,
  onDismissRestoreFailure,
  openError,
  onDismissOpenError,
  openNotice,
  onDismissOpenNotice,
  exportError,
  onDismissExportError,
  a4Layout,
  a4HasPageMap = false,
}: WorkspaceNoticesProps) {
  return (
    <>
      {restoreFailure && (
        <div
          role="alert"
          data-testid="restore-failure"
          className="flex flex-wrap items-center gap-3 border-b border-warning-strong bg-warning-deep/60 px-4 py-1 text-xs text-warning"
        >
          <span>
            The autosaved project couldn&apos;t be restored, so this session started fresh. The failed data is available as an error report.
          </span>
          <button
            type="button"
            onClick={onDownloadRestoreReport}
            className="rounded-full border border-warning-edge px-3 py-0.5 font-medium hover:bg-warning-strong"
          >
            Download error report
          </button>
          <button type="button" onClick={onDismissRestoreFailure} className="rounded-full px-3 py-0.5 font-medium hover:bg-warning-strong">
            Dismiss
          </button>
        </div>
      )}
      {openError && (
        <NoticeBar key={openError} tone="error" onDismiss={onDismissOpenError}>
          {openError}
        </NoticeBar>
      )}
      {openNotice && (
        <NoticeBar tone="info" onDismiss={onDismissOpenNotice}>
          <span data-testid="open-notice">{openNotice}</span>
        </NoticeBar>
      )}
      {exportError && (
        <NoticeBar key={exportError} tone="error" onDismiss={onDismissExportError}>
          {exportError}
        </NoticeBar>
      )}
      {a4Layout && (
        <NoticeBar tone="info">
          {a4Layout.columns} × {a4Layout.rows} pages —{" "}
          {a4HasPageMap
            ? `${a4Layout.pages.length + 3}+ total (incl. page map, skein table + colour key). Overlap and cell size in Options.`
            : `${a4Layout.pages.length + 2}+ total (incl. simple + extended legend). Overlap in Options.`}
        </NoticeBar>
      )}
    </>
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
      <PillButton size="xs" onClick={onDelete} disabled={none} title="Delete the selected line (Delete)">
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
            ["Copy", "Copy the selected piece", <SkinIcon key="i" name="copy" />, onCopy, !hasSelection],
            ["Paste", "Paste the copied piece as a new floating selection", <SkinIcon key="i" name="paste" />, onPaste, !hasClipboard],
            [
              "Duplicate",
              "Leave this piece where it is and take a copy of it in hand",
              <SkinIcon key="i" name="duplicate" />,
              onDuplicate,
              !hasSelection,
            ],
            // "Fill selection", not "Fill": the tool rail has a Fill of its own, and both are on screen at once.
            ["Fill selection", fillTitle, <SkinIcon key="i" name="fill-piece" />, onFill, !hasSelection || !canFill],
            [
              "Flip horizontal",
              "Mirror the piece left to right",
              <SkinIcon key="i" name="flip-horizontal" />,
              onFlipHorizontal,
              !hasSelection,
            ],
            ["Flip vertical", "Mirror the piece top to bottom", <SkinIcon key="i" name="flip-vertical" />, onFlipVertical, !hasSelection],
            [
              "Rotate right",
              "Turn the piece a quarter turn clockwise",
              <SkinIcon key="i" name="rotate-right" />,
              onRotateClockwise,
              !hasSelection,
            ],
            [
              "Rotate left",
              "Turn the piece a quarter turn anticlockwise",
              <SkinIcon key="i" name="rotate-left" />,
              onRotateAnticlockwise,
              !hasSelection,
            ],
            [
              "Crop to selection",
              "Cut the chart down to this rectangle, discarding everything outside it",
              <SkinIcon key="i" name="crop-to-piece" />,
              onCrop,
              !hasSelection,
            ],
            [
              "Apply here",
              "Merge the piece into the picture where it sits \u2014 Enter",
              <SkinIcon key="i" name="apply" />,
              onDeselect,
              !hasSelection,
            ],
            [
              "Cancel",
              "Put the chart back as it was when this selection started, discarding its changes \u2014 Escape",
              <SkinIcon key="i" name="cancel" />,
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
