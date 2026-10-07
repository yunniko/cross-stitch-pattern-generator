import type { ProjectLoadFailure } from "@/lib/editor/project-store";
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
}

/** The strips under the bar of tool options: a failed auto-restore (D101), and open and export errors. */
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
    </>
  );
}

/** The end of a tool's own controls that stays in view while the rest scrolls under it in a narrow window (as D213): the pair that commits. */
export const PINNED_END = "sticky right-0 z-10 flex shrink-0 items-center gap-1.5 bg-surface pl-2";

export interface SelectionBarProps {
  hasSelection: boolean;
  hasClipboard: boolean;
  /** Selects everything the selection leaves out; with nothing selected, the whole chart (G-116). */
  onInvert: () => void;
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
 * Drawn after the tool's options, as the selection's actions are. Unlike a floating selection, a backstitch edit is
 * committed as it happens, so history stays usable and Undo is never disabled by it.
 */
export function BackstitchBar({
  selectedCount,
  hasClipboard,
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
    <div className="flex min-w-max flex-1 items-center gap-2.5" data-testid="backstitch-bar">
      <span className="text-[11px] font-medium tracking-wider text-muted uppercase">Backstitch</span>
      <span className="font-mono text-xs whitespace-nowrap text-muted">{none ? "none selected" : `${selectedCount} selected`}</span>
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
      <div className={`ml-auto ${PINNED_END}`}>
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
  onInvert,
}: SelectionBarProps) {
  const fillTitle = canFill
    ? "Paint the whole selected area in the brush's colour"
    : "Pick a thread in the list first \u2014 there is no colour to fill with";
  const actions = [
    [
      "Invert selection",
      "Select everything the selection leaves out, backstitch included; with nothing selected, the whole chart",
      <SkinIcon key="i" name="invert-selection" />,
      onInvert,
      false,
    ],
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
    ["Flip horizontal", "Mirror the piece left to right", <SkinIcon key="i" name="flip-horizontal" />, onFlipHorizontal, !hasSelection],
    ["Flip vertical", "Mirror the piece top to bottom", <SkinIcon key="i" name="flip-vertical" />, onFlipVertical, !hasSelection],
    ["Rotate right", "Turn the piece a quarter turn clockwise", <SkinIcon key="i" name="rotate-right" />, onRotateClockwise, !hasSelection],
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
  ] as const;
  const action = ([label, title, icon, onClick, isDisabled]: (typeof actions)[number]) => {
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
  };

  return (
    // The piece in hand, and what can be done to it. It adds to the bar of tool options (G-095): Undo and Redo are the
    // bar above's, and wait there while a piece is in hand. The selection mode is an option, drawn before it; the piece's
    // size and the hint that once opened the bar are gone (Owner, 2026-10-07).
    <div className="flex min-w-max flex-1 items-center gap-2.5" data-testid="selection-bar">
      <div className="ml-auto flex items-center gap-1">{actions.slice(0, -2).map(action)}</div>
      {/* Apply and Cancel stay in view however narrow the window: the rest scrolls beneath them. */}
      <div className={PINNED_END}>{actions.slice(-2).map(action)}</div>
    </div>
  );
}
